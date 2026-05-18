import os
import re
import sys
import json
import base64
import hmac
import hashlib
import secrets
from contextlib import asynccontextmanager
from datetime import datetime
from urllib.parse import urlencode, urlparse
from typing import Any

try:
    import pandas as pd
except ImportError:  # pandas가 없어도 서버 자체는 켜지게 처리
    pd = None

import requests
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base, sessionmaker, Session

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
USE_OPENAI_CHAT_ANSWER = os.getenv("USE_OPENAI_CHAT_ANSWER", "false").lower() == "true"
USE_OPENAI_PREFERENCE_EXTRACT = os.getenv("USE_OPENAI_PREFERENCE_EXTRACT", "false").lower() == "true"

AI_RESPONSE_RULE = """
너는 영주시 빈집 체류·정착 추천 AI '영주도령'이다.

사람과 대화하듯 자연스럽게 답한다.
사용자가 조건을 말하면 그 조건에 맞는 점과 안 맞는 점을 설명한다.
추천할 때는 후보별로 장점, 단점, 아쉬운 점, 적합한 사용자를 자연스럽게 말한다.
없는 정보는 지어내지 않는다.
공공데이터의 지역, 등급, 면적, 좌표 기반 주변시설 정보만 근거로 말한다.
마지막에는 추가 조건을 물어보거나 다음 선택을 자연스럽게 유도한다.
"""


def generate_openai_answer(
    user_message: str,
    recommendations: list[dict[str, Any]],
    infra_summary: str,
    local_report: str,
) -> str | None:
    if OpenAI is None:
        print("[AI] openai 패키지가 설치되어 있지 않습니다.")
        return None

    if not os.getenv("OPENAI_API_KEY"):
        print("[AI] OPENAI_API_KEY가 없습니다.")
        return None

    candidate_lines = []

    for index, item in enumerate(recommendations[:3], start=1):
        house = item.get("house", {})
        reasons = item.get("reasons", [])

        candidate_lines.append(
            f"{index}. {house.get('name')} / {house.get('districtName')}\n"
            f"- 주소: {house.get('address')}\n"
            f"- 등급: {house.get('conditionGrade')}\n"
            f"- 면적: {house.get('area')}㎡\n"
            f"- 최대 인원: {house.get('maxCapacity')}명\n"
            f"- 가격: {house.get('priceRange')}\n"
            f"- 추천 근거: {', '.join(reasons) if reasons else '기본 추천 후보'}"
        )

    candidate_text = "\n\n".join(candidate_lines)

    if recommendations:
        prompt = f"""
사용자 말:
{user_message}

추천 후보 데이터:
{candidate_text}

주변 편의시설 분석:
{infra_summary or "주변 편의시설 분석 정보 없음"}

기본 추천 결과:
{local_report}

위 데이터만 근거로 자연스럽게 답변해.

답변 방식:
- 첫 문장은 사용자의 조건을 이해했다는 식으로 자연스럽게 시작
- 후보를 1~3개 추천
- 각 후보마다 '맞는 점', '아쉬운 점', '장점', '단점'을 자연스럽게 설명
- 마지막에는 가장 먼저 볼 만한 후보를 말하고, 추가 조건을 물어보기
- 너무 표처럼 딱딱하게 쓰지 말기
"""
    else:
        prompt = f"""
사용자 말:
{user_message}

현재 추천 후보 데이터는 없음.

답변 방식:
- 사용자의 말에 자연스럽게 반응
- 억지로 빈집 3곳을 추천하지 말기
- 마지막에 빈집 추천을 위해 필요한 조건을 자연스럽게 물어보기
- 예: 지역, 인원, 병원/편의점 접근성, 조용한 분위기, 체류 기간 등
"""

    try:
        client = OpenAI()

        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": AI_RESPONSE_RULE},
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
            timeout=8,
        )

        print("[AI] OpenAI API 호출 성공")
        return response.choices[0].message.content.strip()

    except Exception as error:
        print("[AI] OpenAI API 호출 실패:", error)
        return None

# =========================================================
# 환경 설정
# =========================================================
def _load_local_env_file(env_path: str) -> None:
    if not os.path.exists(env_path):
        return

    try:
        with open(env_path, "r", encoding="utf-8") as env_file:
            for raw_line in env_file:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key:
                    os.environ.setdefault(key, value)
    except OSError:
        return


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_load_local_env_file(os.path.join(BASE_DIR, ".env"))
REGISTRATION_UPLOAD_DIR = os.path.join(BASE_DIR, "assets", "uploads", "registration")
REGISTRATION_UPLOAD_URL_PREFIX = "/assets/uploads/registration"
ALLOWED_REGISTRATION_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_REGISTRATION_UPLOAD_FILES = 5
MAX_REGISTRATION_UPLOAD_SIZE = 10 * 1024 * 1024

PY_DIR = os.path.join(BASE_DIR, "py")
if PY_DIR not in sys.path:
    sys.path.insert(0, PY_DIR)

try:
    from report_generator import (
        generate_ai_recommendation_answer,
        generate_ai_chat_answer,
        has_ai_knowledge,
    )
except Exception:
    def has_ai_knowledge() -> bool:
        return False

    def generate_ai_recommendation_answer(query: str, conditions: dict[str, Any], candidates: list[dict[str, Any]]) -> str:
        if not candidates:
            return "현재 조건에 맞는 공개 승인 빈집을 찾지 못했습니다. 지역, 인원, 체류 기간을 조금 더 구체적으로 입력해 주세요."
        top = candidates[0]
        house = top.get("house", {})
        reasons = ", ".join(top.get("reasons", [])) or "조건 일부 일치"
        return (
            f"질문 조건을 기준으로는 {house.get('name', '추천 후보')}을 먼저 볼 수 있습니다. "
            f"최대 {house.get('maxCapacity', '-')}명 이용 가능하고 가격은 {house.get('priceRange', '-')} 수준입니다. "
            f"추천 이유는 {reasons}입니다. 상세페이지에서 상태와 이용 조건을 함께 확인해 주세요."
        )

    def generate_ai_chat_answer(
        user_message: str,
        history: list[dict[str, Any]],
        conditions: dict[str, Any],
        candidates: list[dict[str, Any]],
        infra_summary: str,
    ) -> str:
        if candidates:
            return generate_ai_recommendation_answer(user_message, conditions, candidates)
        if infra_summary:
            return infra_summary
        return "안녕하세요. 영주시 빈집 AI 도우미입니다. 빈집 추천, 체류 조건, 주변 시설을 기준으로 안내해드릴게요."


CSV_PATH = os.path.join(PY_DIR, "yeongju_houses.csv")
XLSX_PATH = os.path.join(PY_DIR, "yeongju_houses.xlsx")


def _resolve_database_url() -> str:
    configured_db_url = (os.getenv("DB_URL") or "").strip()
    if configured_db_url:
        # Render Postgres commonly provides postgres:// URLs, but SQLAlchemy expects postgresql://.
        if configured_db_url.startswith("postgres://"):
            return "postgresql://" + configured_db_url[len("postgres://"):]
        return configured_db_url

    sqlite_path = (os.getenv("SQLITE_PATH") or os.path.join(BASE_DIR, "yeongju_houses.db")).strip()
    sqlite_dir = os.path.dirname(sqlite_path)
    if sqlite_dir:
        os.makedirs(sqlite_dir, exist_ok=True)
    return f"sqlite:///{sqlite_path}"


DB_URL = _resolve_database_url()

KAKAO_API_KEY = os.getenv("KAKAO_REST_API_KEY", "")
KAKAO_BASE_URL = "https://dapi.kakao.com/v2/local/search"
DEFAULT_RADIUS = 10000
AI_INFRA_PREFILTER_LIMIT = int(os.getenv("AI_INFRA_PREFILTER_LIMIT", "8"))
VENDOR_PARTNER_COUNT = int(os.getenv("VENDOR_PARTNER_COUNT", "3"))
REQUEST_TIMEOUT = 5

# =========================================================
# 데모용 임시 좌표
# =========================================================
# 실제 빈집 상세 주소/좌표가 없는 공공데이터를 지도와 주변시설 분석에 연결하기 위한 좌표입니다.
# 정확한 집 위치가 아니라 읍면동 대표 좌표 + 작은 오프셋이므로, 제출/시연 때는
# “공공데이터에 좌표가 없어 데모용 대표 좌표를 보정 적용했다”고 설명하면 됩니다.
# 나중에 엑셀/CSV에 위도, 경도 컬럼을 추가하면 그 값이 우선 사용됩니다.
DEMO_COORDS_BY_DISTRICT: dict[str, tuple[float, float]] = {
    "풍기읍": (36.8719, 128.5248),
    "순흥면": (36.9144, 128.5775),
    "단산면": (36.9427, 128.6296),
    "부석면": (36.9777, 128.6561),
    "봉현면": (36.8446, 128.5155),
    "안정면": (36.8180, 128.5574),
    "장수면": (36.7790, 128.5785),
    "문수면": (36.7547, 128.6273),
    "평은면": (36.7316, 128.6865),
    "이산면": (36.8210, 128.6839),
    "휴천동": (36.8057, 128.6241),
    "가흥동": (36.8201, 128.6067),
    "상망동": (36.8351, 128.6319),
    "하망동": (36.8275, 128.6266),
    "영주동": (36.8260, 128.6230),
}

YEONGJU_CENTER_COORD = (36.8057, 128.6241)
ADMIN_ORG_CODE = os.getenv("YEONGJU_ADMIN_ORG_CODE", "YEONGJU2025")
AUTH_STATE_SECRET = os.getenv("YEONGJU_AUTH_STATE_SECRET", "yeongju-social-state-secret")
PUBLIC_BASE_URL = os.getenv("YEONGJU_PUBLIC_BASE_URL", "").strip()
FRONTEND_BASE_URL = os.getenv("YEONGJU_FRONTEND_BASE_URL", "").strip()
DEFAULT_LOCAL_API_BASE_URL = "http://localhost:8000"

ROLE_LABELS = {
    "guest": "투숙 희망자",
    "owner": "빈집 소유자",
    "admin": "공공기관 관리자",
}

ADMIN_ROLE_LABELS = {
    "reviewer": "검토 담당자",
    "approver": "승인 권한자",
    "super_admin": "총괄 관리자",
    "system_admin": "시스템 관리자",
}

SOCIAL_PROVIDER_LABELS = {
    "kakao": "카카오",
    "google": "구글",
}

SOCIAL_PROVIDER_SETTINGS = {
    "kakao": {
        "client_id_env": "KAKAO_CLIENT_ID",
        "client_secret_env": "KAKAO_CLIENT_SECRET",
        "redirect_uri_env": "KAKAO_REDIRECT_URI",
    },
    "google": {
        "client_id_env": "GOOGLE_CLIENT_ID",
        "client_secret_env": "GOOGLE_CLIENT_SECRET",
        "redirect_uri_env": "GOOGLE_REDIRECT_URI",
    },
}

connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {}
engine = create_engine(DB_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# =========================================================
# DB 모델
# =========================================================
class House(Base):
    __tablename__ = "houses"

    id = Column(Integer, primary_key=True, index=True)
    address = Column(String(255), nullable=False, index=True)
    house_type = Column(String(50), default="단독주택")
    area = Column(Float, default=0.0)
    status = Column(String(50), default="미상")
    lat = Column(Float, nullable=True, index=True)
    lon = Column(Float, nullable=True, index=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=True)
    name = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False, default="guest", index=True)
    admin_role = Column(String(20), nullable=True, default=None)
    status = Column(String(20), nullable=False, default="active")
    org_code_verified = Column(Boolean, nullable=False, default=False)
    department = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class SocialAccount(Base):
    __tablename__ = "social_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_social_accounts_provider_user_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String(20), nullable=False, index=True)
    provider_user_id = Column(String(255), nullable=False)
    provider_email = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    linked_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)


# =========================================================
# DB 초기화 / 세션
# =========================================================
def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_house_schema()
    _ensure_user_schema()


def _ensure_house_schema() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("houses"):
        return

    columns = {column["name"] for column in inspector.get_columns("houses")}
    statements: list[str] = []

    if "house_type" not in columns:
        statements.append("ALTER TABLE houses ADD COLUMN house_type VARCHAR(50) DEFAULT '단독주택'")
    if "area" not in columns:
        statements.append("ALTER TABLE houses ADD COLUMN area FLOAT DEFAULT 0")
    if "status" not in columns:
        statements.append("ALTER TABLE houses ADD COLUMN status VARCHAR(50) DEFAULT '미상'")
    if "lat" not in columns:
        statements.append("ALTER TABLE houses ADD COLUMN lat FLOAT")
    if "lon" not in columns:
        statements.append("ALTER TABLE houses ADD COLUMN lon FLOAT")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def _ensure_user_schema() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    statements: list[str] = []

    if "password_hash" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)")
    if "admin_role" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN admin_role VARCHAR(20)")
    if "department" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN department VARCHAR(100)")
    if "status" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'")
    if "org_code_verified" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN org_code_verified BOOLEAN DEFAULT 0")
    if "created_at" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN created_at DATETIME")
    if "updated_at" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN updated_at DATETIME")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

        connection.execute(
            text(
                "UPDATE users "
                "SET admin_role = 'super_admin' "
                "WHERE role = 'admin' AND (admin_role IS NULL OR admin_role = '')"
            )
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================================================
# 공통 유틸
# =========================================================
def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"{salt.hex()}${derived_key.hex()}"


def _verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash or "$" not in password_hash:
        return False

    salt_hex, expected_hash_hex = password_hash.split("$", 1)
    try:
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(expected_hash_hex)
    except ValueError:
        return False

    derived_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return hmac.compare_digest(derived_key, expected_hash)


def _normalize_admin_role_value(admin_role: str | None, fallback: str = "reviewer") -> str:
    normalized = str(admin_role or fallback).strip().lower()
    if normalized not in ADMIN_ROLE_LABELS:
        normalized = fallback
    return normalized


def _is_first_admin_account(db: Session, exclude_user_id: int | None = None) -> bool:
    query = select(User.id).where(User.role == "admin")
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)
    existing_admin_id = db.execute(query.limit(1)).scalar_one_or_none()
    return existing_admin_id is None


def _promote_first_admin_if_needed(user: User, db: Session) -> bool:
    if user.role != "admin" or user.status != "active":
        return False

    current_admin_role = _normalize_admin_role_value(user.admin_role, fallback="reviewer")
    if current_admin_role in {"super_admin", "system_admin"}:
        return False
    if not _is_first_admin_account(db, exclude_user_id=user.id):
        return False

    user.admin_role = "super_admin"
    user.org_code_verified = True
    db.add(user)
    return True


def _serialize_user(user: User) -> dict[str, Any]:
    admin_role = None
    admin_role_label = None

    if user.role == "admin":
        admin_role = _normalize_admin_role_value(user.admin_role, fallback="super_admin")
        admin_role_label = ADMIN_ROLE_LABELS[admin_role]

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "roleLabel": ROLE_LABELS.get(user.role, "사용자"),
        "adminRole": admin_role,
        "adminRoleLabel": admin_role_label,
        "status": user.status,
        "orgCodeVerified": bool(user.org_code_verified),
        "department": user.department or "",
    }


def _require_admin_operator(admin_user_id: int, db: Session, allowed_roles: set[str] | None = None) -> User:
    admin_user = db.execute(select(User).where(User.id == admin_user_id)).scalar_one_or_none()

    if not admin_user or admin_user.role != "admin" or admin_user.status != "active":
        raise HTTPException(status_code=403, detail="공공기관 관리자 권한이 없습니다.")

    admin_role = _normalize_admin_role_value(admin_user.admin_role, fallback="super_admin")
    if allowed_roles and admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="이 작업을 수행할 권한이 없습니다.")

    return admin_user


def _delete_user_account(user: User, db: Session) -> None:
    social_accounts = db.execute(select(SocialAccount).where(SocialAccount.user_id == user.id)).scalars().all()
    for social_account in social_accounts:
        db.delete(social_account)
    db.delete(user)


def _urlsafe_b64encode(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("utf-8").rstrip("=")


def _urlsafe_b64decode(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}").decode("utf-8")


# =========================================================
# CSV/XLSX 적재
# =========================================================
def _clean_value(value: Any, default: Any = None) -> Any:
    if pd is not None:
        try:
            if pd.isna(value):
                return default
        except TypeError:
            pass

    if value is None:
        return default

    if isinstance(value, str):
        value = value.strip()
        return value if value else default

    return value


def _parse_float(value: Any) -> float | None:
    value = _clean_value(value, None)
    if value is None:
        return None

    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _is_valid_korea_coord(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    return 33.0 <= lat <= 39.5 and 124.0 <= lon <= 132.0

GEOCODE_CACHE: dict[str, tuple[float, float] | None] = {}


def _is_valid_yeongju_coord(lat: float | None, lon: float | None) -> bool:
    if not _is_valid_korea_coord(lat, lon):
        return False

    # 영주시 주변 범위만 허용
    return 36.65 <= lat <= 37.05 and 128.40 <= lon <= 128.85


def _add_small_offset(base_lat: float, base_lon: float, seed: int) -> tuple[float, float]:
    # 같은 리에 여러 빈집이 있을 때 마커가 완전히 겹치지 않게 약간만 분산
    row = (seed // 5) % 5
    col = seed % 5

    lat_offset = (row - 2) * 0.00045
    lon_offset = (col - 2) * 0.00045

    return round(base_lat + lat_offset, 6), round(base_lon + lon_offset, 6)


def _geocode_yeongju_region(eup_myeon_dong: str, ri: str = "") -> tuple[float, float] | None:
    query = f"경상북도 영주시 {eup_myeon_dong} {ri}".strip()

    if query in GEOCODE_CACHE:
        return GEOCODE_CACHE[query]

    if not KAKAO_API_KEY:
        GEOCODE_CACHE[query] = None
        return None

    try:
        response = requests.get(
            f"{KAKAO_BASE_URL}/address.json",
            headers={"Authorization": f"KakaoAK {KAKAO_API_KEY}"},
            params={
                "query": query,
                "analyze_type": "similar",
            },
            timeout=REQUEST_TIMEOUT,
        )

        if response.status_code != 200:
            GEOCODE_CACHE[query] = None
            return None

        data = response.json()
        documents = data.get("documents", [])

        for doc in documents:
            address_name = doc.get("address_name", "")

            if "영주시" not in address_name:
                continue

            lat = _parse_float(doc.get("y"))
            lon = _parse_float(doc.get("x"))

            if _is_valid_yeongju_coord(lat, lon):
                GEOCODE_CACHE[query] = (lat, lon)
                return lat, lon

    except Exception:
        pass

    GEOCODE_CACHE[query] = None
    return None


def _find_demo_base_coord(text_value: str) -> tuple[float, float]:
    text_value = text_value or ""
    for district_name, coord in DEMO_COORDS_BY_DISTRICT.items():
        if district_name in text_value:
            return coord
    return YEONGJU_CENTER_COORD


def _make_demo_coord(eup_myeon_dong: str, ri: str = "", seed: int = 0) -> tuple[float, float]:
    kakao_coord = _geocode_yeongju_region(eup_myeon_dong, ri)

    if kakao_coord:
        base_lat, base_lon = kakao_coord
        return _add_small_offset(base_lat, base_lon, seed)

    base_lat, base_lon = _find_demo_base_coord(f"{eup_myeon_dong} {ri}")
    return _add_small_offset(base_lat, base_lon, seed)


def _resolve_row_coord(row: dict[str, Any], lat_col: str | None, lon_col: str | None, eup_myeon_dong: str, ri: str, seed: int) -> tuple[float, float]:
    # 1순위: 엑셀/CSV에 직접 넣은 실제 좌표
    lat = _parse_float(row.get(lat_col)) if lat_col else None
    lon = _parse_float(row.get(lon_col)) if lon_col else None
    if _is_valid_korea_coord(lat, lon):
        return lat, lon

    # 2순위: 읍면동 대표 좌표 기반 데모 좌표
    return _make_demo_coord(eup_myeon_dong, ri, seed)


def _resolve_address_coord(address: str, seed: int = 0) -> tuple[float, float]:
    clean_address = (address or "").replace("경상북도", "").replace("영주시", "").strip()
    parts = clean_address.split()

    eup_myeon_dong = parts[0] if len(parts) >= 1 else ""
    ri = parts[1] if len(parts) >= 2 else ""

    return _make_demo_coord(eup_myeon_dong, ri, seed)


def _pick_column(columns: list[str], candidates: list[str]) -> str | None:
    normalized = {str(col).strip(): str(col).strip() for col in columns}
    for candidate in candidates:
        if candidate in normalized:
            return normalized[candidate]
    return None


def import_csv_if_needed(reset: bool = False) -> None:
    init_db()

    if pd is None:
        print("[경고] pandas가 설치되어 있지 않아 CSV/XLSX 자동 적재를 건너뜁니다.")
        return

    if os.path.exists(XLSX_PATH):
        df = pd.read_excel(XLSX_PATH)
        source_name = XLSX_PATH
    elif os.path.exists(CSV_PATH):
        df = pd.read_csv(CSV_PATH, encoding="utf-8-sig")
        source_name = CSV_PATH
    else:
        print(f"[경고] CSV/XLSX 파일이 없습니다: {CSV_PATH}, {XLSX_PATH}")
        return

    df.columns = [str(col).strip() for col in df.columns]
    print("엑셀/CSV 컬럼명:", df.columns.tolist())

    district_col = _pick_column(df.columns.tolist(), ["읍면동", "행정구역", "지역", "동읍면"])
    ri_col = _pick_column(df.columns.tolist(), ["리", "마을", "세부지역"])
    area_col = _pick_column(df.columns.tolist(), ["건축면적(제곱미터)", "건축면적", "건축면적(㎡)", "면적"])
    type_col = _pick_column(df.columns.tolist(), ["주택유형", "유형", "건물유형"])
    status_col = _pick_column(df.columns.tolist(), ["등급판정결과", "등급", "판정결과", "상태"])
    lat_col = _pick_column(df.columns.tolist(), ["위도", "lat", "latitude", "Latitude", "Y", "y"])
    lon_col = _pick_column(df.columns.tolist(), ["경도", "lon", "lng", "longitude", "Longitude", "X", "x"])

    required_missing = []
    if not district_col:
        required_missing.append("읍면동")
    if not ri_col:
        required_missing.append("리")

    if required_missing:
        raise ValueError(f"파일 필수 컬럼 누락: {required_missing}")

    df = df.dropna(subset=[district_col, ri_col]).copy()

    with SessionLocal() as db:
        existing_count = db.query(House).count()

        if reset:
            db.query(House).delete()
            db.commit()
            print("[정보] 기존 빈집 데이터를 삭제하고 새로 적재합니다.")
        elif existing_count > 0:
            print(f"[정보] 기존 데이터 {existing_count}건을 유지한 채 {source_name} 데이터를 비교 후 추가합니다.")

        inserted = 0
        skipped = 0

        for row in df.to_dict(orient="records"):
            eup_myeon_dong = _clean_value(row.get(district_col), "")
            ri = _clean_value(row.get(ri_col), "")
            area_value = _clean_value(row.get(area_col), 0.0) if area_col else 0.0
            house_type = _clean_value(row.get(type_col), "단독주택") if type_col else "단독주택"
            status = _clean_value(row.get(status_col), "미상") if status_col else "미상"

            if not eup_myeon_dong:
                skipped += 1
                continue

            try:
                area_value = float(area_value or 0.0)
            except (TypeError, ValueError):
                area_value = 0.0

            address = f"영주시 {eup_myeon_dong} {ri}".strip()

            file_lat = _parse_float(row.get(lat_col)) if lat_col else None
            file_lon = _parse_float(row.get(lon_col)) if lon_col else None
            has_file_coord = _is_valid_korea_coord(file_lat, file_lon)
            if has_file_coord:
                lat, lon = file_lat, file_lon
            else:
                lat, lon = _make_demo_coord(eup_myeon_dong, ri, inserted + skipped)

            exists = db.execute(
                select(House).where(
                    House.address == address,
                    House.house_type == str(house_type),
                    House.area == area_value,
                    House.status == str(status),
                )
            ).scalar_one_or_none()

            if exists:
                # 엑셀/CSV에 실제 좌표가 들어 있으면 기존 데모 좌표보다 우선해서 갱신합니다.
                # 파일 좌표가 없고 DB 좌표도 비어 있을 때만 데모 좌표를 채웁니다.
                if has_file_coord or exists.lat is None or exists.lon is None:
                    exists.lat = lat
                    exists.lon = lon
                skipped += 1
                continue

            db.add(
                House(
                    address=address,
                    house_type=str(house_type),
                    area=area_value,
                    status=str(status),
                    lat=lat,
                    lon=lon,
                )
            )
            inserted += 1

        db.commit()
        print(f"[완료] 데이터 적재 완료: inserted={inserted}, skipped={skipped}")


def backfill_missing_house_coordinates() -> None:
    """기존 DB에 이미 들어가 있지만 좌표가 비어 있는 빈집에 데모 좌표를 채웁니다."""
    with SessionLocal() as db:
        houses = db.query(House).order_by(House.id.asc()).all()
        updated = 0

        for index, house in enumerate(houses):
            if house.lat is not None and house.lon is not None:
                continue

            lat, lon = _resolve_address_coord(house.address, index)
            house.lat = lat
            house.lon = lon
            updated += 1

        if updated:
            db.commit()
            print(f"[완료] 좌표 보완 완료: updated={updated}")


# =========================================================
# 프론트 응답 변환
# =========================================================
DISTRICT_NAME_TO_ID = {
    "풍기읍": "punggi",
    "순흥면": "sunheung",
    "안정면": "anjeong",
    "봉현면": "bonghyeon",
    "이산면": "isu",
    "평은면": "pyeongeunsam",
    "문수면": "munsu",
    "장수면": "jangsu",
    "단산면": "dansan",
    "부석면": "buseok",
    "영주동": "yeongju",
    "휴천동": "hyucheon",
    "가흥동": "gaheung",
    "상망동": "sangsang",
    "하망동": "hangangno",
}
DISTRICT_ID_TO_NAME = {value: key for key, value in DISTRICT_NAME_TO_ID.items()}


def _normalize_house_id(raw_id: str) -> int:
    value = str(raw_id).strip()
    if value.upper().startswith("VH"):
        value = value[2:]
    value = value.lstrip("0") or "0"
    try:
        return int(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="빈집 ID 형식이 올바르지 않습니다.")


def _format_house_id(house_id: int) -> str:
    return f"VH{house_id:03d}"


def _extract_district_name(address: str) -> str:
    for district_name in DISTRICT_NAME_TO_ID.keys():
        if district_name in (address or ""):
            return district_name
    return "영주동"


def _extract_district_id(address: str) -> str:
    district_name = _extract_district_name(address)
    return DISTRICT_NAME_TO_ID.get(district_name, "yeongju")


def _infer_condition_grade(status: str, area: float) -> str:
    s = (status or "").strip().upper()

    match = re.search(r"([1-4])\s*등급", s)
    if match:
        return match.group(1)

    if s in ["1", "2", "3", "4"]:
        return s

    legacy_map = {
        "A": "1",
        "B": "2",
        "C": "3",
        "D": "4",
        "양호": "1",
        "보통": "2",
        "불량": "3",
        "철거": "4",
    }
    if s in legacy_map:
        return legacy_map[s]

    if "1" in s or "양호" in s or "사용가능" in s:
        return "1"
    if "2" in s or "보통" in s:
        return "2"
    if "3" in s or "보수" in s or "수리" in s:
        return "3"
    if "4" in s or "철거" in s or "불량" in s:
        return "4"

    # 등급 정보가 없을 때만 면적으로 임시 추정
    if area >= 50:
        return "1"
    if area >= 30:
        return "2"
    if area >= 15:
        return "3"
    return "4"


def _infer_review_status(condition_grade: str, status: str) -> str:
    s = (status or "").strip()

    if any(word in s for word in ["검토", "보류", "미정"]):
        return "pending"
    if any(word in s for word in ["보수", "수리", "추후"]):
        return "repair"
    if condition_grade in ["1", "2", "A", "B"]:
        return "approved"
    return "pending"


def _infer_operation_type(house_type: str, area: float, district_name: str) -> str:
    t = (house_type or "").strip()

    if any(word in t for word in ["체험", "농가", "농촌"]):
        return "experience"
    if any(word in t for word in ["장기", "원룸"]):
        return "longterm"
    if district_name in ["안정면", "부석면", "단산면"] and area >= 35:
        return "longterm"
    return "lodging"


def _infer_max_capacity(area: float) -> int:
    if area >= 80:
        return 6
    if area >= 60:
        return 5
    if area >= 45:
        return 4
    if area >= 30:
        return 3
    if area >= 20:
        return 2
    return 1


def _infer_usage_purpose(operation_type: str) -> list[str]:
    if operation_type == "longterm":
        return ["장기체류", "거주 대체"]
    if operation_type == "experience":
        return ["체험", "문화 프로그램"]
    return ["가족여행", "단기체류"]


def _infer_facilities(area: float) -> list[str]:
    facilities = ["화장실", "기본 주방"]
    if area >= 25:
        facilities.append("침실 1개")
    if area >= 45:
        facilities.append("침실 2개")
    if area >= 60:
        facilities.append("주차 가능")
    if area >= 70:
        facilities.append("마당")
    return facilities


def _infer_price_range(operation_type: str, area: float) -> str:
    if operation_type == "longterm":
        if area >= 60:
            return "월 55만원 내외"
        if area >= 40:
            return "월 40만원 내외"
        return "월 30만원 내외"

    if area >= 60:
        return "1박 7만원 내외"
    if area >= 40:
        return "1박 6만원 내외"
    return "1박 5만원 내외"


def _infer_tags(district_name: str, operation_type: str, area: float) -> list[str]:
    tags: list[str] = []
    if district_name in ["휴천동", "영주동", "가흥동", "상망동", "하망동"]:
        tags.append("시내")
    else:
        tags.append("농촌")

    if operation_type == "longterm":
        tags.append("장기체류")
    elif operation_type == "experience":
        tags.append("체험")
    else:
        tags.append("숙박")

    tags.append("가족" if area >= 50 else "소형")
    return tags


def _make_house_name(house: House, district_name: str) -> str:
    house_type = (house.house_type or "빈집").strip()
    return f"{district_name} {house_type}"


def _serialize_house(house: House) -> dict[str, Any]:
    district_name = _extract_district_name(house.address)
    district_id = _extract_district_id(house.address)
    area = float(house.area or 0.0)
    status = (house.status or "").strip()

    condition_grade = _infer_condition_grade(status, area)
    review_status = _infer_review_status(condition_grade, status)
    operation_type = _infer_operation_type(house.house_type or "", area, district_name)

    is_approved = review_status == "approved"
    is_verified = condition_grade in ["1", "2"]
    is_cleaning_done = condition_grade in ["1", "2"]
    is_repair_done = condition_grade == "1"

    description = (
        f"영주시 {district_name}에 위치한 {house.house_type or '빈집'}입니다. "
        f"면적은 약 {area:.1f}㎡이며, 현재 상태는 '{status or '미상'}'으로 기록되어 있습니다."
    )

    review_summary = (
        f"현재 화면의 등급은 영주시 공공데이터의 등급판정결과를 기준으로 안내하는 값입니다. "
        f"공공데이터 원문 상태는 '{status or '미상'}'이며, 현재 {condition_grade}등급으로 표시됩니다. <br>"
        f"이 값은 서비스 이용 체험 적합성 확정 등급이 아니므로 실제 사용 전에는 현장 점검이 필요합니다."
    )

    return {
        "id": _format_house_id(house.id),
        "name": _make_house_name(house, district_name),
        "districtId": district_id,
        "districtName": district_name,
        "address": house.address,
        "conditionGrade": condition_grade,
        "reviewStatus": review_status,
        "operationType": operation_type,
        "isApproved": is_approved,
        "isVerified": is_verified,
        "isCleaningDone": is_cleaning_done,
        "isRepairDone": is_repair_done,
        "maxCapacity": _infer_max_capacity(area),
        "availablePeriod": "연중",
        "usagePurpose": _infer_usage_purpose(operation_type),
        "facilities": _infer_facilities(area),
        "description": description,
        "reviewSummary": review_summary,
        "partnerVendor": None,
        "registeredAt": "2025-04-01",
        "approvedAt": "2025-04-10" if is_approved else None,
        "image": "",
        "priceRange": _infer_price_range(operation_type, area),
        "tags": _infer_tags(district_name, operation_type, area),
        "area": area,
        "status": status,
        "lat": house.lat,
        "lon": house.lon,
    }


# =========================================================
# AI 추천 보조 로직
# =========================================================
def _parse_capacity(query: str) -> int | None:
    match = re.search(r"(\d+)\s*명", query)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _parse_district(query: str) -> tuple[str | None, str | None]:
    for district_name, district_id in DISTRICT_NAME_TO_ID.items():
        if district_name in query:
            return district_id, district_name
    return None, None


def _parse_stay_duration(query: str) -> str | None:
    if any(word in query for word in ["장기", "한달", "한 달", "정착", "거주", "이주"]):
        return "long"
    if any(word in query for word in ["주말", "1박", "2박", "하룻밤", "단기", "짧"]):
        return "short"
    if any(word in query for word in ["일주일", "며칠", "3박", "4박"]):
        return "medium"
    return None


def _parse_budget(query: str) -> str | None:
    if any(word in query for word in ["저렴", "가성비", "싼", "부담없"]):
        return "low"
    if any(word in query for word in ["괜찮", "중간", "보통"]):
        return "mid"
    if any(word in query for word in ["고급", "프리미엄", "비싼"]):
        return "high"
    return None


def _parse_moods(query: str) -> list[str]:
    mood_map = {
        "nature": ["자연", "산", "태양", "나무", "조용"],
        "family": ["가족", "아이", "부모님"],
        "experience": ["체험", "문화", "역사", "한옥"],
        "farming": ["귀촌", "텃밭", "농사", "시골"],
        "hiking": ["등산", "트레킹", "둘레길"],
        "city": ["시내", "교통", "편의", "생활 인프라", "접근성"],
    }
    selected: list[str] = []
    for mood, keywords in mood_map.items():
        if any(word in query for word in keywords):
            selected.append(mood)
    return selected


def _extract_query_conditions(query: str) -> dict[str, Any]:
    district_id, district_name = _parse_district(query)
    return {
        "districtId": district_id,
        "districtName": district_name,
        "capacity": _parse_capacity(query),
        "stayDuration": _parse_stay_duration(query),
        "budget": _parse_budget(query),
        "moods": _parse_moods(query),
    }


def _score_house_for_ai(house: dict[str, Any], conditions: dict[str, Any], query: str) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    moods = conditions.get("moods", [])

    district_id = conditions.get("districtId")
    if district_id:
        if house["districtId"] == district_id:
            score += 35
            reasons.append("희망 지역과 일치")
        else:
            score -= 5

    capacity = conditions.get("capacity")
    if capacity:
        if house["maxCapacity"] >= capacity:
            score += 25
            reasons.append(f"{capacity}명 이용 가능")
        else:
            score -= 20

    stay = conditions.get("stayDuration")
    if stay == "long" and house["operationType"] == "longterm":
        score += 24
        reasons.append("장기체류 성격에 적합")
    elif stay == "short" and house["operationType"] == "lodging":
        score += 18
        reasons.append("단기 숙박 성격에 적합")
    elif stay == "medium":
        score += 8
        reasons.append("중기 체류에도 무난")

    if "family" in moods and house["maxCapacity"] >= 3:
        score += 14
        reasons.append("가족 단위 이용에 무난")
    if "experience" in moods and house["operationType"] == "experience":
        score += 18
        reasons.append("체험 목적과 잘 맞음")
    if "farming" in moods and (house["operationType"] in ["experience", "longterm"] or "농촌" in house["tags"]):
        score += 18
        reasons.append("귀촌 또는 농촌 체험 성격과 잘 맞음")
    if "nature" in moods and "농촌" in house["tags"]:
        score += 12
        reasons.append("자연과 조용한 환경을 기대하기 좋음")
    if "city" in moods and "시내" in house["tags"]:
        score += 12
        reasons.append("시내 생활권에 가까움")
    if "hiking" in moods and house["districtName"] in ["풍기읍", "단산면", "부석면"]:
        score += 15
        reasons.append("등산과 자연 연동 동선에 잘 맞음")

    if any(word in query for word in ["저렴", "가성비", "부담없"]):
        if "5만원" in house["priceRange"] or "30만원" in house["priceRange"]:
            score += 10
            reasons.append("비용 부담이 비교적 낮음")

    if house["conditionGrade"] == "1":
        score += 10
        reasons.append("1등급으로 즉시 활용 가능성이 높음")
    elif house["conditionGrade"] == "2":
        score += 6
        reasons.append("2등급으로 기본 사용 가능")
    else:
        score -= 10

    if not reasons and house["isApproved"]:
        score += 5
        reasons.append("공개 승인된 기본 후보")

    return score, reasons


def _build_ai_candidates(houses: list[dict[str, Any]], conditions: dict[str, Any], query: str) -> list[dict[str, Any]]:
    scored: list[dict[str, Any]] = []

    for house in houses:
        if not house.get("isApproved"):
            continue
        score, reasons = _score_house_for_ai(house, conditions, query)
        if score <= 0:
            continue
        scored.append({"house": house, "score": score, "reasons": reasons})

    if not scored:
        for house in houses:
            if house.get("isApproved"):
                score, reasons = _score_house_for_ai(house, {"moods": []}, "")
                scored.append({
                    "house": house,
                    "score": max(score, 1),
                    "reasons": reasons or ["공개 승인된 기본 후보"],
                })

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:3]

AI_PREFERENCE_EXTRACT_RULE = """
사용자의 말을 보고 빈집 추천 조건을 JSON으로 정리해라.

반드시 JSON만 출력한다.

가능한 시설:
- 병원
- 편의점
- 음식점
- 마트
- 버스정류장
- 기차역

weight는 중요도이다.
0 = 중요하지 않음
1 = 조금 중요
3 = 보통 중요
5 = 매우 중요

minimum_count는 최소로 있으면 좋겠는 개수이다.
want_many는 많을수록 좋은지 여부이다.

예시:
기관지가 안 좋다 -> 병원 weight 5, want_many true
먹을 것을 좋아한다 -> 음식점 weight 5, want_many true
편의점은 하나만 있어도 된다 -> 편의점 weight 2, minimum_count 1, want_many false
교통이 편했으면 좋겠다 -> 버스정류장 weight 4, 기차역 weight 3
"""

FACILITY_ALIASES: dict[str, list[str]] = {
    "병원": ["병원", "의원", "약국", "의료", "진료", "내과", "호흡기", "기관지", "천식", "폐"],
    "편의점": ["편의점", "편의", "씨유", "cu", "gs25", "세븐일레븐"],
    "음식점": ["음식점", "식당", "맛집", "먹을", "밥집", "카페"],
    "마트": ["마트", "슈퍼", "장보기", "시장", "생활용품"],
    "버스정류장": ["버스정류장", "버스", "정류장", "교통"],
    "기차역": ["기차역", "역", "철도", "교통"],
}

FACILITY_SEARCH_CONFIG: dict[str, tuple[str, str]] = {
    "병원": ("category", "HP8"),
    "마트": ("category", "MT1"),
    "편의점": ("category", "CS2"),
    "음식점": ("category", "FD6"),
    "버스정류장": ("keyword", "버스정류장"),
    "기차역": ("keyword", "기차역"),
}

KOREAN_COUNT_WORDS = {
    "한": 1,
    "하나": 1,
    "두": 2,
    "둘": 2,
    "세": 3,
    "셋": 3,
    "네": 4,
    "넷": 4,
    "다섯": 5,
    "여섯": 6,
    "일곱": 7,
    "여덟": 8,
    "아홉": 9,
    "열": 10,
}


def _parse_count_expression(text: str) -> int | None:
    match = re.search(r"(\d+)\s*(?:곳|개|군데|개소)?\s*(?:이상|넘|보다\s*많|있)", text)
    if match:
        return int(match.group(1))

    for word, value in KOREAN_COUNT_WORDS.items():
        if re.search(rf"{word}\s*(?:곳|개|군데|개소)?\s*(?:이상|넘|보다\s*많|있)", text):
            return value

    return None


def _extract_count_near_alias(message: str, aliases: list[str]) -> int | None:
    for alias in aliases:
        for match in re.finditer(re.escape(alias), message, flags=re.IGNORECASE):
            start = max(0, match.start() - 18)
            end = min(len(message), match.end() + 28)
            count = _parse_count_expression(message[start:end])
            if count is not None:
                return count

    return None


def _merge_preference(
    preferences: dict[str, Any],
    facility_name: str,
    weight: int,
    minimum_count: int | None = None,
    want_many: bool = False,
) -> None:
    infra_preferences = preferences.setdefault("infra_preferences", {})
    current = infra_preferences.setdefault(
        facility_name,
        {"weight": 0, "minimum_count": 0, "want_many": False},
    )
    current["weight"] = max(int(current.get("weight") or 0), weight)
    current["minimum_count"] = max(int(current.get("minimum_count") or 0), int(minimum_count or 0))
    current["want_many"] = bool(current.get("want_many")) or want_many or bool(minimum_count and minimum_count >= 2)


def _extract_rule_based_preferences(user_message: str) -> dict[str, Any]:
    message = (user_message or "").strip()
    preferences: dict[str, Any] = {
        "infra_preferences": {},
        "summary": "규칙 기반 주변시설 조건 분석",
    }

    if not message:
        return preferences

    for facility_name, aliases in FACILITY_ALIASES.items():
        if not any(alias.lower() in message.lower() for alias in aliases):
            continue

        minimum_count = _extract_count_near_alias(message, aliases)
        weight = 5 if minimum_count else 4
        want_many = bool(minimum_count and minimum_count >= 2)
        _merge_preference(preferences, facility_name, weight, minimum_count, want_many)

    if any(word in message for word in ["근처", "가까", "주변", "인근", "접근"]):
        for facility_name in list(preferences.get("infra_preferences", {}).keys()):
            pref = preferences["infra_preferences"][facility_name]
            pref["weight"] = max(int(pref.get("weight") or 0), 4)

    if any(word in message for word in ["기관지", "호흡기", "천식", "폐", "숨", "기침"]):
        _merge_preference(preferences, "병원", 5, 1, True)
        preferences["medical_context"] = "기관지/호흡기 관련 진료 접근성"

    if preferences["infra_preferences"]:
        summary_parts = []
        for facility_name, pref in preferences["infra_preferences"].items():
            minimum_count = int(pref.get("minimum_count") or 0)
            if minimum_count:
                summary_parts.append(f"{facility_name} {minimum_count}곳 이상")
            else:
                summary_parts.append(f"{facility_name} 접근성")
        preferences["summary"] = ", ".join(summary_parts)

    return preferences


def _merge_ai_preferences(rule_based: dict[str, Any], ai_data: dict[str, Any]) -> dict[str, Any]:
    merged = {
        "infra_preferences": dict(rule_based.get("infra_preferences") or {}),
        "summary": rule_based.get("summary") or "조건 분석 완료",
    }

    for facility_name, pref in (ai_data.get("infra_preferences") or {}).items():
        if facility_name not in FACILITY_ALIASES or not isinstance(pref, dict):
            continue

        _merge_preference(
            merged,
            facility_name,
            int(pref.get("weight") or 0),
            int(pref.get("minimum_count") or 0),
            bool(pref.get("want_many")),
        )

    if ai_data.get("summary") and not rule_based.get("infra_preferences"):
        merged["summary"] = ai_data["summary"]
    if rule_based.get("medical_context"):
        merged["medical_context"] = rule_based["medical_context"]

    return merged


def extract_user_preferences(user_message: str) -> dict[str, Any]:
    rule_based = _extract_rule_based_preferences(user_message)
    if rule_based.get("infra_preferences"):
        return rule_based

    if not USE_OPENAI_PREFERENCE_EXTRACT or OpenAI is None or not os.getenv("OPENAI_API_KEY"):
        return rule_based

    try:
        client = OpenAI()

        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": AI_PREFERENCE_EXTRACT_RULE},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )

        text = response.choices[0].message.content
        data = json.loads(text)

        if not isinstance(data, dict):
            return rule_based

        data.setdefault("infra_preferences", {})
        data.setdefault("summary", "조건 분석 완료")
        return _merge_ai_preferences(rule_based, data)

    except Exception as error:
        print("[AI] 조건 분석 실패:", error)
        return rule_based


INFRA_CACHE: dict[str, dict[str, Any]] = {}


def _get_cached_infra(lat: float | None, lon: float | None) -> dict[str, Any]:
    if lat is None or lon is None:
        return {}

    key = f"{round(float(lat), 5)},{round(float(lon), 5)}"

    if key not in INFRA_CACHE:
        INFRA_CACHE[key] = get_nearby_infrastructure(float(lat), float(lon))

    return INFRA_CACHE[key]


def _get_cached_infra_for_preferences(
    lat: float | None,
    lon: float | None,
    preferences: dict[str, Any],
) -> dict[str, Any]:
    infra_preferences = preferences.get("infra_preferences", {})
    if not infra_preferences:
        return _get_cached_infra(lat, lon)
    if lat is None or lon is None:
        return {}

    facility_names = sorted(name for name in infra_preferences if name in FACILITY_SEARCH_CONFIG)
    return _get_cached_infra_for_facilities(lat, lon, facility_names)


def _get_cached_infra_for_facilities(
    lat: float | None,
    lon: float | None,
    facility_names: list[str],
) -> dict[str, Any]:
    if lat is None or lon is None:
        return {}

    facility_names = sorted(name for name in facility_names if name in FACILITY_SEARCH_CONFIG)
    if not facility_names:
        return {}

    key = f"{round(float(lat), 5)},{round(float(lon), 5)}|{'/'.join(facility_names)}"
    if key not in INFRA_CACHE:
        INFRA_CACHE[key] = get_nearby_infrastructure(float(lat), float(lon), facility_names=facility_names)

    return INFRA_CACHE[key]


def _score_infra_by_preferences(
    infra: dict[str, Any],
    preferences: dict[str, Any],
) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []

    infra_preferences = preferences.get("infra_preferences", {})

    if not infra_preferences:
        return 0, []

    for facility_name, pref in infra_preferences.items():
        if facility_name not in infra:
            continue

        item = infra.get(facility_name, {})
        count = int(item.get("count") or 0)
        distance = item.get("nearest_distance_m")

        weight = int(pref.get("weight") or 0)
        minimum_count = int(pref.get("minimum_count") or 0)
        want_many = bool(pref.get("want_many"))

        if weight <= 0:
            continue

        if count <= 0:
            score -= weight * 12
            reasons.append(f"{facility_name} 접근성이 약함")
            continue

        if minimum_count > 0:
            if count >= minimum_count:
                score += weight * 14
                reasons.append(f"{facility_name} 최소 조건({minimum_count}곳 이상) 충족")
            else:
                score -= weight * 18
                reasons.append(f"{facility_name} 수가 원하는 조건({minimum_count}곳 이상)보다 부족")

        if want_many:
            score += min(count, 10) * weight
            reasons.append(f"{facility_name}이 주변에 {count}곳 확인됨")
        else:
            score += weight * 5
            reasons.append(f"{facility_name}이 주변에 있음")

        if distance is not None:
            if distance <= 700:
                score += weight * 8
                reasons.append(f"{facility_name}이 약 {distance}m로 가까움")
            elif distance <= 1500:
                score += weight * 4
                reasons.append(f"{facility_name}이 약 {distance}m 거리")
            else:
                score -= weight * 2
                reasons.append(f"{facility_name}이 있긴 하지만 거리가 있음")

    return score, reasons


def _infra_preferences_satisfied(infra: dict[str, Any], preferences: dict[str, Any]) -> bool:
    infra_preferences = preferences.get("infra_preferences", {})
    if not infra_preferences:
        return True

    for facility_name, pref in infra_preferences.items():
        if facility_name not in infra:
            continue

        count = int(infra.get(facility_name, {}).get("count") or 0)
        weight = int(pref.get("weight") or 0)
        minimum_count = int(pref.get("minimum_count") or 0)

        if minimum_count > 0 and count < minimum_count:
            return False
        if weight >= 4 and count <= 0:
            return False

    return True


def _build_ai_candidates_with_infra(
    houses: list[dict[str, Any]],
    conditions: dict[str, Any],
    query: str,
    preferences: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    preferences = preferences or extract_user_preferences(query)
    base_scored: list[dict[str, Any]] = []

    for house in houses:
        if not house.get("isApproved"):
            continue

        base_score, base_reasons = _score_house_for_ai(house, conditions, query)
        base_scored.append({
            "house": house,
            "base_score": base_score,
            "base_reasons": base_reasons,
        })

    base_scored.sort(key=lambda item: item["base_score"], reverse=True)
    if AI_INFRA_PREFILTER_LIMIT > 0:
        base_scored = base_scored[:AI_INFRA_PREFILTER_LIMIT]

    matched_scored: list[dict[str, Any]] = []
    fallback_scored: list[dict[str, Any]] = []

    for base_item in base_scored:
        house = base_item["house"]
        base_score = int(base_item["base_score"] or 0)
        base_reasons = base_item["base_reasons"]

        infra = _get_cached_infra_for_preferences(house.get("lat"), house.get("lon"), preferences)
        infra_score, infra_reasons = _score_infra_by_preferences(infra, preferences)

        total_score = base_score + infra_score

        if total_score <= 0:
            continue

        item = {
            "house": house,
            "score": total_score,
            "reasons": base_reasons + infra_reasons,
        }

        if _infra_preferences_satisfied(infra, preferences):
            matched_scored.append(item)
        else:
            fallback_scored.append(item)

    scored = matched_scored or fallback_scored
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:3]




def _is_recommend_query(message: str, conditions: dict[str, Any]) -> bool:
    recommendation_keywords = [
        "추천", "숙소", "빈집", "체류", "머물", "여행", "가족",
        "귀촌", "농촌", "조용", "자연", "장기", "영주", "1박", "2박",
        "병원", "의원", "약국", "편의점", "마트", "교통", "버스", "역",
        "주변", "근처", "생활", "편리", "맛집", "음식점", "먹을", "식당",
        "기관지", "호흡기", "천식", "내과", "진료"
    ]
    if any(word in message for word in recommendation_keywords):
        return True
    if conditions.get("districtId") or conditions.get("capacity") or conditions.get("stayDuration") or conditions.get("moods"):
        return True
    return False


def _is_infra_query(message: str) -> bool:
    infra_keywords = [
        "병원", "의원", "약국", "마트", "편의점", "음식점", "맛집",
        "버스", "기차역", "역", "교통", "주변", "근처",
        "기관지", "호흡기", "천식", "내과", "진료"
    ]
    return any(word in message for word in infra_keywords)


def _pick_focus_house(approved_houses: list[dict[str, Any]], candidates: list[dict[str, Any]], conditions: dict[str, Any]) -> dict[str, Any] | None:
    if candidates:
        return candidates[0]["house"]

    district_id = conditions.get("districtId")
    if district_id:
        for house in approved_houses:
            if house.get("districtId") == district_id:
                return house

    return approved_houses[0] if approved_houses else None


# =========================================================
# 주변 인프라 분석
# =========================================================
def _safe_get_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    if not KAKAO_API_KEY:
        return {"documents": [], "meta": {"total_count": 0}}

    headers = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}
    try:
        response = requests.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return {"documents": [], "meta": {"total_count": 0}}


def _search_category(lat: float, lon: float, category_code: str, radius: int = DEFAULT_RADIUS) -> dict[str, Any]:
    return _safe_get_json(
        f"{KAKAO_BASE_URL}/category.json",
        {
            "category_group_code": category_code,
            "x": lon,
            "y": lat,
            "radius": radius,
            "size": 10,
            "sort": "distance",
        },
    )


def _search_keyword(lat: float, lon: float, query: str, radius: int = DEFAULT_RADIUS) -> dict[str, Any]:
    return _safe_get_json(
        f"{KAKAO_BASE_URL}/keyword.json",
        {
            "query": query,
            "x": lon,
            "y": lat,
            "radius": radius,
            "size": 10,
            "sort": "distance",
        },
    )


def _format_places(documents: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    places = []
    for doc in documents[:limit]:
        distance = doc.get("distance")
        places.append(
            {
                "name": doc.get("place_name", "이름 없음"),
                "distance_m": int(distance) if str(distance).isdigit() else None,
                "address": doc.get("road_address_name") or doc.get("address_name") or "",
            }
        )
    return places


def _pack_result(raw: dict[str, Any]) -> dict[str, Any]:
    documents = raw.get("documents", [])
    top_places = _format_places(documents)
    nearest_distance = top_places[0]["distance_m"] if top_places else None
    return {
        "count": raw.get("meta", {}).get("total_count", 0),
        "nearest_distance_m": nearest_distance,
        "top_places": top_places,
    }


def get_nearby_infrastructure(
    lat: float,
    lon: float,
    radius: int = DEFAULT_RADIUS,
    facility_names: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    categories = FACILITY_SEARCH_CONFIG
    if facility_names:
        categories = {name: FACILITY_SEARCH_CONFIG[name] for name in facility_names if name in FACILITY_SEARCH_CONFIG}

    results = {}
    for name, (mode, value) in categories.items():
        raw = _search_category(lat, lon, value, radius) if mode == "category" else _search_keyword(lat, lon, value, radius)
        results[name] = _pack_result(raw)
    return results


def _score_distance(distance: int | None, near: int, mid: int, far: int) -> int:
    if distance is None:
        return 0
    if distance <= near:
        return 3
    if distance <= mid:
        return 2
    if distance <= far:
        return 1
    return 0


def analyze_house_livability(house: House, infra: dict[str, dict[str, Any]]) -> dict[str, Any]:
    score = 0
    strengths = []
    weaknesses = []
    recommended_for = []

    hospital_score = _score_distance(infra["병원"]["nearest_distance_m"], 700, 1500, 3000)
    market_score = _score_distance(infra["마트"]["nearest_distance_m"], 700, 1500, 3000)
    convenience_score = _score_distance(infra["편의점"]["nearest_distance_m"], 500, 1200, 2500)
    bus_score = _score_distance(infra["버스정류장"]["nearest_distance_m"], 400, 800, 1500)
    station_score = _score_distance(infra["기차역"]["nearest_distance_m"], 1500, 3000, 5000)
    food_score = 2 if infra["음식점"]["count"] >= 5 else 1 if infra["음식점"]["count"] >= 1 else 0

    score += hospital_score * 10
    score += market_score * 9
    score += convenience_score * 8
    score += bus_score * 8
    score += station_score * 5
    score += food_score * 5

    status = (house.status or "").strip()
    area = float(house.area or 0.0)

    if any(word in status for word in ["양호", "좋음", "보통", "사용", "1", "2"]):
        score += 10
        strengths.append(f"주택 상태가 '{status}'로 기록되어 기본 활용 가능성이 있습니다.")
    else:
        weaknesses.append(f"주택 상태가 '{status or '미상'}'이어서 추가 현장 확인이 필요합니다.")

    if area >= 50:
        score += 8
        strengths.append("면적이 비교적 넓어 장기 체류나 가족 거주에 유리합니다.")
    elif area >= 30:
        score += 4
        strengths.append("1~2인 체류용으로는 무난한 면적입니다.")
    else:
        weaknesses.append("면적이 작아 장기 거주보다는 단기 체류에 더 적합할 수 있습니다.")

    if hospital_score >= 2:
        strengths.append("병원 접근성이 비교적 좋습니다.")
    else:
        weaknesses.append("병원 접근성이 약해 차량 이동 의존도가 높을 수 있습니다.")

    if market_score + convenience_score >= 4:
        strengths.append("생활 소비 시설 접근성이 좋은 편입니다.")
    else:
        weaknesses.append("장보기나 생활용품 구매 동선이 길 수 있습니다.")

    if bus_score >= 2 or station_score >= 2:
        strengths.append("대중교통 연결성이 상대적으로 괜찮습니다.")
    else:
        weaknesses.append("대중교통보다는 자가 이동 중심 생활에 가깝습니다.")

    if hospital_score >= 2 and market_score >= 2:
        recommended_for.append("대중교통과 생활권 중심 사용자")
    if area >= 30 and (bus_score >= 1 or station_score >= 1):
        recommended_for.append("1~2인 체류형 거주")
    if food_score >= 1 and market_score >= 1:
        recommended_for.append("생활 편의성을 중시하는 사용자")

    if not recommended_for:
        recommended_for.append("현장 확인 후 활용 검토가 필요한 사용자")

    score = max(0, min(score, 100))
    if score >= 75:
        grade = "상"
    elif score >= 50:
        grade = "중"
    else:
        grade = "하"

    return {
        "score": score,
        "grade": grade,
        "recommended_for": recommended_for,
        "strengths": strengths[:4],
        "weaknesses": weaknesses[:4],
        "house_summary": {
            "address": house.address,
            "house_type": house.house_type,
            "status": status,
            "area": area,
        },
    }


def generate_simple_report(house: House, infra: dict[str, Any], analysis_result: dict[str, Any]) -> str:
    strengths = "\n".join(f"- {item}" for item in analysis_result["strengths"]) or "- 뚜렷한 강점 데이터가 아직 없습니다."
    weaknesses = "\n".join(f"- {item}" for item in analysis_result["weaknesses"]) or "- 뚜렷한 약점 데이터가 아직 없습니다."
    targets = ", ".join(analysis_result["recommended_for"])

    return f"""
생활 편의성 점수: {analysis_result['score']}점 ({analysis_result['grade']})

추천 대상:
- {targets}

장점:
{strengths}

아쉬운 점:
{weaknesses}

종합 판단:
- {house.address}는 {house.house_type} 유형의 빈집이며, 현재 상태는 '{house.status}'입니다.
- 주변 병원 {infra['병원']['count']}곳, 마트 {infra['마트']['count']}곳, 편의점 {infra['편의점']['count']}곳, 음식점 {infra['음식점']['count']}곳이 확인되었습니다.
- 대회 데모 기준으로는 생활 적합성 참고 자료로 충분하지만, 실제 정착 판단 전에는 현장 접근성·실제 주택 상태를 추가 확인하는 것이 좋습니다.
""".strip()


def _make_infra_summary(
    db: Session,
    house_data: dict[str, Any] | None,
    facility_names: list[str] | None = None,
) -> str:
    if not house_data:
        return "주변 인프라를 분석할 빈집을 정하지 못했습니다."

    house_id = _normalize_house_id(house_data["id"])
    house = db.query(House).filter(House.id == house_id).first()
    if not house:
        return "대상 빈집을 찾지 못했습니다."

    if house.lat is None or house.lon is None:
        return f"{house.address}은 현재 좌표 정보가 없어 주변 인프라 분석이 불가능합니다."

    if facility_names:
        infra = _get_cached_infra_for_facilities(house.lat, house.lon, facility_names)
    else:
        infra = _get_cached_infra(house.lat, house.lon)

    def names(key: str) -> str:
        places = infra.get(key, {}).get("top_places", [])
        if not places:
            return "없음"
        return ", ".join(p["name"] for p in places[:3])

    return (
        f"대상 빈집: {house.address}\n"
        "\n".join(f"- {name}: {names(name)}" for name in (facility_names or list(FACILITY_SEARCH_CONFIG.keys())))
    )


# =========================================================
# 응답 모델
# =========================================================
class HouseFrontOut(BaseModel):
    id: str
    name: str
    districtId: str
    districtName: str
    address: str
    conditionGrade: str
    reviewStatus: str
    operationType: str
    isApproved: bool
    isVerified: bool
    isCleaningDone: bool
    isRepairDone: bool
    maxCapacity: int
    availablePeriod: str
    usagePurpose: list[str]
    facilities: list[str]
    description: str
    reviewSummary: str
    partnerVendor: str | None = None
    registeredAt: str
    approvedAt: str | None = None
    image: str
    priceRange: str
    tags: list[str]
    area: float | None = None
    status: str | None = None
    lat: float | None = None
    lon: float | None = None


class SiteStatsOut(BaseModel):
    registeredHouses: int
    approvedHouses: int
    districtCoverage: int
    vendors: int


class PlaceOut(BaseModel):
    name: str
    distance_m: int | None = None
    address: str = ""


class InfraItemOut(BaseModel):
    count: int
    nearest_distance_m: int | None = None
    top_places: list[PlaceOut]


class AnalysisResultOut(BaseModel):
    score: int
    grade: str
    recommended_for: list[str]
    strengths: list[str]
    weaknesses: list[str]
    house_summary: dict[str, Any]


class HouseAnalysisOut(BaseModel):
    house: HouseFrontOut
    infrastructure: dict[str, InfraItemOut]
    analysis_result: AnalysisResultOut
    ai_report: str


class AuthUserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    adminRole: str | None = None
    adminRoleLabel: str | None = None
    roleLabel: str
    status: str
    orgCodeVerified: bool
    department: str = ""


class SignupRequest(BaseModel):
    name: str
    email: str
    phone: str
    password: str
    role: str
    agreeTerms: bool = False
    ownerAddress: str | None = None
    adminOrgCode: str | None = None
    adminDept: str | None = None


class SignupResponse(BaseModel):
    message: str
    user: AuthUserOut


class LoginRequest(BaseModel):
    email: str
    password: str
    role: str | None = None


class LoginResponse(BaseModel):
    message: str
    user: AuthUserOut


class WithdrawRequest(BaseModel):
    userId: int


class AdminWithdrawApprovalRequest(BaseModel):
    adminUserId: int
    targetUserId: int


class AdminPublicUserActionRequest(BaseModel):
    adminUserId: int
    targetUserId: int
    adminRole: str | None = None


class AdminUserActionResponse(BaseModel):
    message: str
    user: AuthUserOut


class SocialAuthStartResponse(BaseModel):
    provider: str
    providerLabel: str
    authUrl: str


class AiRecommendRequest(BaseModel):
    query: str


class AiParsedConditionsOut(BaseModel):
    districtId: str | None = None
    districtName: str | None = None
    capacity: int | None = None
    stayDuration: str | None = None
    budget: str | None = None
    moods: list[str] = []


class AiRecommendationItemOut(BaseModel):
    house: HouseFrontOut
    score: int
    reasons: list[str]


class AiRecommendResponse(BaseModel):
    query: str
    parsedConditions: AiParsedConditionsOut
    message: str
    recommendations: list[AiRecommendationItemOut]
    knowledgeApplied: bool


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class AiChatRequest(BaseModel):
    message: str
    history: list[ChatHistoryItem] = []


class AiChatResponse(BaseModel):
    message: str
    recommendations: list[AiRecommendationItemOut] = []
    parsedConditions: AiParsedConditionsOut
    knowledgeApplied: bool


# =========================================================
# 소셜 로그인 보조
# =========================================================
def _sign_social_state(payload: str) -> str:
    return hmac.new(AUTH_STATE_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _create_social_state(provider: str, role: str) -> str:
    raw_payload = json.dumps(
        {"provider": provider, "role": role, "nonce": secrets.token_urlsafe(16)},
        separators=(",", ":"),
        ensure_ascii=False,
    )
    encoded_payload = _urlsafe_b64encode(raw_payload)
    signature = _sign_social_state(encoded_payload)
    return f"{encoded_payload}.{signature}"


def _parse_social_state(state: str, provider: str) -> dict[str, Any]:
    if not state or "." not in state:
        raise HTTPException(status_code=400, detail="소셜 로그인 상태값이 올바르지 않습니다.")

    encoded_payload, signature = state.split(".", 1)
    expected_signature = _sign_social_state(encoded_payload)
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=400, detail="소셜 로그인 상태 검증에 실패했습니다.")

    try:
        payload = json.loads(_urlsafe_b64decode(encoded_payload))
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="소셜 로그인 상태값을 해석할 수 없습니다.")

    if payload.get("provider") != provider:
        raise HTTPException(status_code=400, detail="소셜 로그인 제공자 정보가 일치하지 않습니다.")

    role = str(payload.get("role") or "").strip().lower()
    if role not in ROLE_LABELS:
        raise HTTPException(status_code=400, detail="회원 유형 정보가 올바르지 않습니다.")

    return payload


def _is_local_hostname(hostname: str) -> bool:
    normalized = (hostname or "").split(":", 1)[0].strip().lower()
    return normalized in {"127.0.0.1", "localhost", "0.0.0.0"}


def _is_local_url(url: str) -> bool:
    if not url:
        return False

    try:
        hostname = urlparse(url).hostname or ""
    except ValueError:
        return False

    return _is_local_hostname(hostname)


def _normalize_absolute_base_url(url: str) -> str:
    value = (url or "").strip().rstrip("/")
    if not value:
        return ""

    try:
        parsed = urlparse(value)
    except ValueError:
        return ""

    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""

    return value


def _get_request_base_url(request: Request | None = None) -> str:
    if request is None:
        return ""

    forwarded_host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
        or ""
    ).split(",", 1)[0].strip()
    forwarded_proto = (
        request.headers.get("x-forwarded-proto")
        or request.url.scheme
        or "http"
    ).split(",", 1)[0].strip()
    forwarded_port = (request.headers.get("x-forwarded-port") or "").split(",", 1)[0].strip()

    host = forwarded_host or request.url.netloc
    if forwarded_port and host and ":" not in host and forwarded_port not in {"80", "443"}:
        host = f"{host}:{forwarded_port}"

    if not host:
        return ""

    return f"{forwarded_proto}://{host}".rstrip("/")


def _get_public_base_url(request: Request | None = None) -> str:
    configured_public_base_url = _normalize_absolute_base_url(PUBLIC_BASE_URL)
    if configured_public_base_url:
        return configured_public_base_url
    return _get_request_base_url(request)


def _get_default_social_redirect_uri(provider: str) -> str:
    return f"{DEFAULT_LOCAL_API_BASE_URL}/auth/social/{provider}/callback"


def _resolve_social_redirect_uri(provider: str, request: Request | None = None) -> str:
    provider_config = SOCIAL_PROVIDER_SETTINGS.get(provider)
    if not provider_config:
        raise HTTPException(status_code=404, detail="지원하지 않는 소셜 로그인 제공자입니다.")

    configured_redirect_uri = os.getenv(provider_config["redirect_uri_env"], "").strip()
    public_base_url = _get_public_base_url(request)

    if configured_redirect_uri:
        if public_base_url and not _is_local_url(public_base_url) and _is_local_url(configured_redirect_uri):
            return f"{public_base_url}/auth/social/{provider}/callback"
        return configured_redirect_uri.rstrip("/")

    if public_base_url:
        return f"{public_base_url}/auth/social/{provider}/callback"

    return _get_default_social_redirect_uri(provider)


def _get_social_provider_settings(provider: str, request: Request | None = None) -> dict[str, str]:
    config = SOCIAL_PROVIDER_SETTINGS.get(provider)
    if not config:
        raise HTTPException(status_code=404, detail="지원하지 않는 소셜 로그인 제공자입니다.")
    return {
        "client_id": os.getenv(config["client_id_env"], "").strip(),
        "client_secret": os.getenv(config["client_secret_env"], "").strip(),
        "redirect_uri": _resolve_social_redirect_uri(provider, request),
    }


def _is_social_provider_configured(provider: str, request: Request | None = None) -> bool:
    config = _get_social_provider_settings(provider, request)
    if provider == "google":
        return bool(config.get("client_id") and config.get("client_secret") and config.get("redirect_uri"))
    return bool(config.get("client_id") and config.get("redirect_uri"))


def _build_social_authorization_url(provider: str, role: str, request: Request | None = None) -> str:
    config = _get_social_provider_settings(provider, request)
    if not _is_social_provider_configured(provider, request):
        raise HTTPException(status_code=503, detail=f"{SOCIAL_PROVIDER_LABELS.get(provider, provider)} 로그인 설정이 아직 완료되지 않았습니다.")

    state = _create_social_state(provider, role)

    if provider == "kakao":
        query = urlencode(
            {
                "response_type": "code",
                "client_id": config["client_id"],
                "redirect_uri": config["redirect_uri"],
                "state": state,
                "scope": "profile_nickname",
                "prompt": "select_account",
            }
        )
        return f"https://kauth.kakao.com/oauth/authorize?{query}"

    if provider == "google":
        query = urlencode(
            {
                "client_id": config["client_id"],
                "redirect_uri": config["redirect_uri"],
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "access_type": "online",
                "prompt": "select_account",
            }
        )
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    raise HTTPException(status_code=404, detail="지원하지 않는 소셜 로그인 제공자입니다.")


def _exchange_social_access_token(provider: str, code: str, request: Request | None = None) -> str:
    config = _get_social_provider_settings(provider, request)

    if provider == "kakao":
        token_url = "https://kauth.kakao.com/oauth/token"
        token_data = {
            "grant_type": "authorization_code",
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "code": code,
        }
        if config.get("client_secret"):
            token_data["client_secret"] = config["client_secret"]
    elif provider == "google":
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "grant_type": "authorization_code",
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "redirect_uri": config["redirect_uri"],
            "code": code,
        }
    else:
        raise HTTPException(status_code=404, detail="지원하지 않는 소셜 로그인 제공자입니다.")

    try:
        response = requests.post(token_url, data=token_data, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError):
        raise HTTPException(status_code=502, detail="소셜 로그인 토큰 발급에 실패했습니다.")

    access_token = result.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="소셜 로그인 토큰 응답이 올바르지 않습니다.")
    return str(access_token)


def _fetch_social_profile(provider: str, access_token: str) -> dict[str, str | None]:
    headers = {"Authorization": f"Bearer {access_token}"}

    if provider == "kakao":
        url = "https://kapi.kakao.com/v2/user/me"
        try:
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            result = response.json()
        except (requests.RequestException, ValueError):
            raise HTTPException(status_code=502, detail="소셜 로그인 사용자 정보를 가져오지 못했습니다.")

        kakao_account = result.get("kakao_account", {})
        profile = kakao_account.get("profile", {})
        return {
            "provider_user_id": str(result.get("id") or ""),
            "email": _normalize_email(kakao_account.get("email") or ""),
            "name": (profile.get("nickname") or "카카오 사용자").strip(),
        }

    if provider == "google":
        url = "https://openidconnect.googleapis.com/v1/userinfo"
        try:
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            result = response.json()
        except (requests.RequestException, ValueError):
            raise HTTPException(status_code=502, detail="소셜 로그인 사용자 정보를 가져오지 못했습니다.")

        return {
            "provider_user_id": str(result.get("sub") or ""),
            "email": _normalize_email(result.get("email") or ""),
            "name": (result.get("name") or "구글 사용자").strip(),
        }

    raise HTTPException(status_code=404, detail="지원하지 않는 소셜 로그인 제공자입니다.")


def _get_frontend_base_url(request: Request | None = None) -> str:
    public_base_url = _get_public_base_url(request)
    configured_frontend_base_url = _normalize_absolute_base_url(FRONTEND_BASE_URL)

    if configured_frontend_base_url:
        if public_base_url and not _is_local_url(public_base_url) and _is_local_url(configured_frontend_base_url):
            return public_base_url
        return configured_frontend_base_url

    if public_base_url:
        return public_base_url

    return DEFAULT_LOCAL_API_BASE_URL


def _build_frontend_auth_redirect(
    request: Request | None = None,
    user: dict[str, Any] | None = None,
    error: str | None = None,
) -> str:
    base_url = _get_frontend_base_url(request)
    params: dict[str, str] = {}

    if user:
        params["socialLogin"] = "success"
        params["user"] = _urlsafe_b64encode(json.dumps(user, ensure_ascii=False, separators=(",", ":")))

    if error:
        params["socialError"] = error

    query = urlencode(params)
    return f"{base_url}/auth/login.html{f'?{query}' if query else ''}"


def _upsert_social_user(db: Session, provider: str, provider_user_id: str, email: str, name: str, role: str) -> User:
    if not provider_user_id:
        raise HTTPException(status_code=400, detail="소셜 계정 식별값이 없습니다.")

    normalized_email = _normalize_email(email)
    provider_label = SOCIAL_PROVIDER_LABELS.get(provider, provider)

    social_account = db.execute(
        select(SocialAccount).where(
            SocialAccount.provider == provider,
            SocialAccount.provider_user_id == provider_user_id,
        )
    ).scalar_one_or_none()

    if social_account:
        linked_user = db.execute(select(User).where(User.id == social_account.user_id)).scalar_one_or_none()
        if linked_user is None:
            db.delete(social_account)
            db.commit()
        else:
            if linked_user.status != "active":
                raise HTTPException(status_code=403, detail="현재 사용할 수 없는 계정입니다.")
            if linked_user.role != role:
                raise HTTPException(status_code=409, detail="선택한 회원 유형과 기존 소셜 계정 유형이 일치하지 않습니다.")
            social_account.provider_email = normalized_email or social_account.provider_email
            social_account.last_login_at = datetime.utcnow()
            db.add(social_account)
            db.commit()
            db.refresh(linked_user)
            return linked_user

    user = None
    if normalized_email:
        user = db.execute(select(User).where(User.email == normalized_email)).scalar_one_or_none()

    if user:
        if user.status != "active":
            raise HTTPException(status_code=403, detail="현재 사용할 수 없는 계정입니다.")
        if user.role != role:
            raise HTTPException(status_code=409, detail="선택한 회원 유형과 기존 계정 정보가 일치하지 않습니다.")
    else:
        if role == "admin":
            raise HTTPException(status_code=403, detail="관리자 계정은 일반 회원가입 후 기관 인증을 거쳐야 합니다.")
        user = User(
            email=normalized_email or f"{provider}_{provider_user_id}@social.local",
            password_hash=None,
            name=name or f"{provider_label} 사용자",
            role=role,
            status="active",
            org_code_verified=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    new_social_account = SocialAccount(
        user_id=user.id,
        provider=provider,
        provider_user_id=provider_user_id,
        provider_email=normalized_email or None,
        last_login_at=datetime.utcnow(),
    )
    db.add(new_social_account)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 연결된 소셜 계정입니다. 기존 연결 정보를 확인해 주세요.")

    db.refresh(user)
    return user


# =========================================================
# FastAPI 앱
# =========================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        count = db.query(House).count()
    if count == 0:
        import_csv_if_needed(reset=False)

    # 기존 DB에 좌표가 비어 있으면 자동 보완합니다.
    backfill_missing_house_coordinates()
    yield


app = FastAPI(title="Yeongju Empty House API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# API
# =========================================================
@app.get("/")
def root():
    return RedirectResponse(url="/home/index.html", status_code=307)


@app.get("/index.html", include_in_schema=False)
def root_index():
    return RedirectResponse(url="/home/index.html", status_code=307)


@app.get("/api")
def api_root():
    return {
        "message": "Yeongju Empty House API is running",
        "health": "/health",
        "docs": "/docs"
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/uploads/house-photos")
async def upload_house_photos(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="업로드할 사진이 없습니다.")
    if len(files) > MAX_REGISTRATION_UPLOAD_FILES:
        raise HTTPException(status_code=400, detail=f"사진은 최대 {MAX_REGISTRATION_UPLOAD_FILES}장까지 업로드할 수 있습니다.")

    os.makedirs(REGISTRATION_UPLOAD_DIR, exist_ok=True)
    uploaded_photos: list[dict[str, Any]] = []

    for upload in files:
        content_type = (upload.content_type or "").lower()
        if content_type not in ALLOWED_REGISTRATION_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="JPG, PNG, WEBP 형식의 사진만 업로드할 수 있습니다.")

        content = await upload.read()
        if len(content) > MAX_REGISTRATION_UPLOAD_SIZE:
            raise HTTPException(status_code=400, detail="사진 1장당 최대 10MB까지 업로드할 수 있습니다.")

        extension = ALLOWED_REGISTRATION_IMAGE_TYPES[content_type]
        safe_filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(8)}{extension}"
        file_path = os.path.join(REGISTRATION_UPLOAD_DIR, safe_filename)

        with open(file_path, "wb") as file_obj:
            file_obj.write(content)

        uploaded_photos.append({
            "name": upload.filename or safe_filename,
            "size": len(content),
            "type": content_type,
            "url": f"{REGISTRATION_UPLOAD_URL_PREFIX}/{safe_filename}",
        })

    return {"photos": uploaded_photos}


@app.post("/auth/signup", response_model=SignupResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    name = (payload.name or "").strip()
    email = _normalize_email(payload.email)
    phone = (payload.phone or "").strip()
    password = payload.password or ""
    role = (payload.role or "").strip().lower()

    if not name or not email or not phone or not password:
        raise HTTPException(status_code=400, detail="필수 항목을 모두 입력해 주세요.")
    if role not in ROLE_LABELS:
        raise HTTPException(status_code=400, detail="유효하지 않은 회원 유형입니다.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")
    if not payload.agreeTerms:
        raise HTTPException(status_code=400, detail="이용약관 동의가 필요합니다.")

    existing_user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing_user:
        if existing_user.status == "withdrawn":
            _delete_user_account(existing_user, db)
            db.commit()
        else:
            raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다.")

    org_code_verified = False
    user_status = "active"
    admin_role = None
    department = None

    if role == "admin":
        admin_org_code = (payload.adminOrgCode or "").strip()
        if not admin_org_code:
            raise HTTPException(status_code=400, detail="기관 코드를 입력해 주세요.")
        org_code_verified = True
        user_status = "active"
        admin_role = "super_admin" if _is_first_admin_account(db) else "reviewer"
        department = (payload.adminDept or "").strip() or None

    user = User(
        email=email,
        password_hash=_hash_password(password),
        name=name,
        role=role,
        admin_role=admin_role,
        status=user_status,
        org_code_verified=org_code_verified,
        department=department,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "회원가입이 완료되었습니다.",
        "user": _serialize_user(user),
    }


@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    email = _normalize_email(payload.email)
    password = payload.password or ""
    selected_role = (payload.role or "").strip().lower()

    if not email or not password:
        raise HTTPException(status_code=400, detail="이메일과 비밀번호를 입력해 주세요.")

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user or not _verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    if selected_role and selected_role != user.role:
        raise HTTPException(status_code=403, detail="선택한 회원 유형과 계정 정보가 일치하지 않습니다.")

    if user.role == "admin" and user.status == "pending_approval":
        user.status = "active"
        db.add(user)
        db.commit()
        db.refresh(user)

    if _promote_first_admin_if_needed(user, db):
        db.commit()
        db.refresh(user)

    if user.status != "active":
        if user.status == "withdrawal_requested":
            raise HTTPException(status_code=403, detail="탈퇴 승인 대기 중인 계정입니다.")
        raise HTTPException(status_code=403, detail="현재 사용할 수 없는 계정입니다.")

    return {"message": "로그인이 완료되었습니다.", "user": _serialize_user(user)}


@app.post("/auth/withdraw")
def withdraw(payload: WithdrawRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    user = db.execute(select(User).where(User.id == payload.userId)).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.status != "active":
        raise HTTPException(status_code=400, detail="이미 비활성 상태인 계정입니다.")

    _delete_user_account(user, db)
    db.commit()
    return {"message": "회원 탈퇴가 완료되었습니다."}


@app.post("/admin/withdraw/approve")
def approve_owner_withdrawal(payload: AdminWithdrawApprovalRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    _require_admin_operator(payload.adminUserId, db, {"approver", "super_admin", "system_admin"})

    target_user = db.execute(select(User).where(User.id == payload.targetUserId)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="탈퇴 대상 사용자를 찾을 수 없습니다.")
    if target_user.role != "owner":
        raise HTTPException(status_code=400, detail="빈집 소유자 계정만 승인 탈퇴 처리할 수 있습니다.")
    if target_user.status not in {"active", "withdrawal_requested"}:
        raise HTTPException(status_code=400, detail="이미 비활성 상태인 계정입니다.")

    _delete_user_account(target_user, db)
    db.commit()
    return {"message": "빈집 소유자 탈퇴가 승인되었습니다."}


@app.get("/admin/users", response_model=list[AuthUserOut])
def list_admin_users(adminUserId: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _require_admin_operator(adminUserId, db, {"super_admin", "system_admin"})
    users = db.execute(
        select(User)
        .where(User.role == "admin")
        .order_by(User.status.asc(), User.created_at.desc(), User.id.desc())
    ).scalars().all()
    return [_serialize_user(user) for user in users]


@app.post("/admin/users/approve", response_model=AdminUserActionResponse)
def approve_public_admin_user(payload: AdminPublicUserActionRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    operator = _require_admin_operator(payload.adminUserId, db, {"super_admin", "system_admin"})
    operator_role = _normalize_admin_role_value(operator.admin_role, fallback="super_admin")

    target_user = db.execute(select(User).where(User.id == payload.targetUserId)).scalar_one_or_none()
    if not target_user or target_user.role != "admin":
        raise HTTPException(status_code=404, detail="승인할 공공기관 사용자를 찾을 수 없습니다.")
    if target_user.status == "withdrawn":
        raise HTTPException(status_code=400, detail="탈퇴 처리된 계정은 승인할 수 없습니다.")

    requested_role = _normalize_admin_role_value(payload.adminRole, fallback="reviewer")
    if requested_role == "system_admin" and operator_role != "system_admin":
        raise HTTPException(status_code=403, detail="시스템 관리자 권한은 시스템 관리자만 부여할 수 있습니다.")

    target_user.status = "active"
    target_user.admin_role = requested_role
    db.add(target_user)
    db.commit()
    db.refresh(target_user)

    return {"message": "공공기관 사용자 승인이 완료되었습니다.", "user": _serialize_user(target_user)}


@app.post("/admin/users/role", response_model=AdminUserActionResponse)
def update_public_admin_role(payload: AdminPublicUserActionRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    operator = _require_admin_operator(payload.adminUserId, db, {"super_admin", "system_admin"})
    operator_role = _normalize_admin_role_value(operator.admin_role, fallback="super_admin")

    target_user = db.execute(select(User).where(User.id == payload.targetUserId)).scalar_one_or_none()
    if not target_user or target_user.role != "admin":
        raise HTTPException(status_code=404, detail="권한을 변경할 공공기관 사용자를 찾을 수 없습니다.")
    if target_user.status != "active":
        raise HTTPException(status_code=400, detail="활성 상태의 공공기관 사용자만 권한을 변경할 수 있습니다.")

    requested_role = _normalize_admin_role_value(payload.adminRole, fallback="reviewer")
    if requested_role == "system_admin" and operator_role != "system_admin":
        raise HTTPException(status_code=403, detail="시스템 관리자 권한은 시스템 관리자만 부여할 수 있습니다.")
    if operator_role != "system_admin" and _normalize_admin_role_value(target_user.admin_role, fallback="reviewer") == "system_admin":
        raise HTTPException(status_code=403, detail="시스템 관리자 계정 권한은 시스템 관리자만 변경할 수 있습니다.")

    target_user.admin_role = requested_role
    db.add(target_user)
    db.commit()
    db.refresh(target_user)

    return {"message": "공공기관 사용자 권한이 변경되었습니다.", "user": _serialize_user(target_user)}


@app.get("/auth/social/{provider}/start", response_model=SocialAuthStartResponse)
def social_login_start(provider: str, role: str, request: Request) -> dict[str, str]:
    normalized_provider = (provider or "").strip().lower()
    normalized_role = (role or "").strip().lower()

    if normalized_role not in ROLE_LABELS:
        raise HTTPException(status_code=400, detail="회원 유형을 먼저 선택해 주세요.")

    auth_url = _build_social_authorization_url(normalized_provider, normalized_role, request)
    return {
        "provider": normalized_provider,
        "providerLabel": SOCIAL_PROVIDER_LABELS.get(normalized_provider, normalized_provider),
        "authUrl": auth_url,
    }


@app.get("/auth/social/{provider}/callback")
def social_login_callback(
    request: Request,
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    normalized_provider = (provider or "").strip().lower()

    if error:
        return RedirectResponse(url=_build_frontend_auth_redirect(request, error="소셜 로그인 인증이 취소되었거나 실패했습니다."))
    if not code or not state:
        return RedirectResponse(url=_build_frontend_auth_redirect(request, error="소셜 로그인 응답값이 올바르지 않습니다."))

    try:
        state_payload = _parse_social_state(state, normalized_provider)
        access_token = _exchange_social_access_token(normalized_provider, code, request)
        profile = _fetch_social_profile(normalized_provider, access_token)
        user = _upsert_social_user(
            db=db,
            provider=normalized_provider,
            provider_user_id=str(profile.get("provider_user_id") or ""),
            email=str(profile.get("email") or ""),
            name=str(profile.get("name") or ""),
            role=str(state_payload.get("role") or "guest"),
        )
        return RedirectResponse(url=_build_frontend_auth_redirect(request, user=_serialize_user(user)))
    except HTTPException as exc:
        return RedirectResponse(url=_build_frontend_auth_redirect(request, error=str(exc.detail)))


@app.get("/houses", response_model=list[HouseFrontOut])
def get_all_houses(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    houses = db.query(House).order_by(House.id.asc()).all()
    return [_serialize_house(house) for house in houses]


@app.get("/site/stats", response_model=SiteStatsOut)
def get_site_stats(db: Session = Depends(get_db)) -> dict[str, int]:
    houses = db.query(House).order_by(House.id.asc()).all()
    serialized_houses = [_serialize_house(house) for house in houses]
    approved_count = sum(
        1
        for house in serialized_houses
        if house.get("isApproved") and house.get("reviewStatus") == "approved"
    )
    district_ids = {
        str(house.get("districtId"))
        for house in serialized_houses
        if house.get("districtId")
    }

    return {
        "registeredHouses": len(serialized_houses),
        "approvedHouses": approved_count,
        "districtCoverage": len(district_ids),
        "vendors": VENDOR_PARTNER_COUNT,
    }


@app.get("/houses/{house_id}", response_model=HouseFrontOut)
def get_house_detail(house_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    real_id = _normalize_house_id(house_id)
    house = db.query(House).filter(House.id == real_id).first()
    if not house:
        raise HTTPException(status_code=404, detail="빈집을 찾을 수 없습니다.")
    return _serialize_house(house)


@app.get("/houses/{house_id}/analysis", response_model=HouseAnalysisOut)
def analyze_house(house_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    real_id = _normalize_house_id(house_id)
    house = db.query(House).filter(House.id == real_id).first()
    if not house:
        raise HTTPException(status_code=404, detail="빈집을 찾을 수 없습니다.")

    if house.lat is None or house.lon is None:
        return {
            "house": _serialize_house(house),
            "infrastructure": {
                "병원": {"count": 0, "nearest_distance_m": None, "top_places": []},
                "마트": {"count": 0, "nearest_distance_m": None, "top_places": []},
                "편의점": {"count": 0, "nearest_distance_m": None, "top_places": []},
                "음식점": {"count": 0, "nearest_distance_m": None, "top_places": []},
                "버스정류장": {"count": 0, "nearest_distance_m": None, "top_places": []},
                "기차역": {"count": 0, "nearest_distance_m": None, "top_places": []},
            },
            "analysis_result": {
                "score": 0,
                "grade": "하",
                "recommended_for": ["좌표 정보 보완 후 활용 검토가 필요한 사용자"],
                "strengths": [],
                "weaknesses": ["현재 데이터에 위도/경도 정보가 없어 주변 생활 인프라 분석이 불가능합니다."],
                "house_summary": {
                    "address": house.address,
                    "house_type": house.house_type,
                    "status": house.status,
                    "area": float(house.area or 0.0),
                },
            },
            "ai_report": "현재 데이터에 좌표 정보가 없어 주변 병원, 마트, 교통 접근성 분석을 수행할 수 없습니다.",
        }

    house_data = _serialize_house(house)
    infra_data = get_nearby_infrastructure(house.lat, house.lon)
    analysis_result = analyze_house_livability(house, infra_data)
    ai_report = generate_simple_report(house, infra_data, analysis_result)

    return {
        "house": house_data,
        "infrastructure": infra_data,
        "analysis_result": analysis_result,
        "ai_report": ai_report,
    }


@app.post("/ai/recommend", response_model=AiRecommendResponse)
def ai_recommend(payload: AiRecommendRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    query = (payload.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    houses = db.query(House).order_by(House.id.asc()).all()
    serialized_houses = [_serialize_house(house) for house in houses]
    approved_houses = [house for house in serialized_houses if house.get("isApproved")]

    conditions = _extract_query_conditions(query)

    if not approved_houses:
        return {
            "query": query,
            "parsedConditions": conditions,
            "message": "현재 공개 승인된 빈집 데이터가 없어 AI 추천을 진행할 수 없습니다.",
            "recommendations": [],
            "knowledgeApplied": has_ai_knowledge(),
        }

    candidates = _build_ai_candidates(approved_houses, conditions, query)
    message = generate_ai_recommendation_answer(query, conditions, candidates)

    return {
        "query": query,
        "parsedConditions": conditions,
        "message": message,
        "recommendations": candidates,
        "knowledgeApplied": has_ai_knowledge(),
    }

    
    
def format_ai_recommendation_report(candidates: list[dict[str, Any]], infra_summary: str = "") -> str:
    if not candidates:
        return (
            "추천 빈집 3곳\n\n"
            "현재 조건에 맞는 공개 승인 빈집을 찾지 못했습니다.\n\n"
            "최종 추천: 지역, 인원, 병원/편의점 등 조건을 조금 더 구체적으로 입력해 주세요."
        )

    lines = ["추천 빈집 3곳\n"]

    for index, item in enumerate(candidates[:3], start=1):
        house = item.get("house", {})
        reasons = item.get("reasons", [])

        lines.append(f"{index}. {house.get('name', '빈집')} / {house.get('districtName', '영주시')}")
        lines.append(f"- 추천 이유: {', '.join(reasons) if reasons else '조건에 맞는 공개 승인 빈집입니다.'}")
        lines.append(f"- 주변 편의시설: {infra_summary if index == 1 and infra_summary else '좌표 기반 주변시설 분석 결과를 상세페이지에서 확인할 수 있습니다.'}")
        lines.append(f"- 장점: {house.get('conditionGrade', '-')}등급, 최대 {house.get('maxCapacity', '-')}명 이용 가능, {house.get('priceRange', '가격 협의')} 조건입니다.")
        lines.append("- 주의사항: 실제 이용 전 현장 상태, 안전, 수도·전기 상태 확인이 필요합니다.")
        lines.append(f"- 적합한 사용자: {', '.join(house.get('usagePurpose', [])) if house.get('usagePurpose') else '단기 체류 또는 정착 체험 희망자'}\n")

    first_house = candidates[0].get("house", {})
    lines.append(f"최종 추천: 우선 {first_house.get('name', '첫 번째 후보')}을 먼저 검토하는 것이 좋습니다.")

    return "\n".join(lines)


@app.post("/ai/chat", response_model=AiChatResponse)
def ai_chat(payload: AiChatRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    houses = db.query(House).order_by(House.id.asc()).all()
    serialized_houses = [_serialize_house(house) for house in houses]
    approved_houses = [house for house in serialized_houses if house.get("isApproved")]

    conditions = _extract_query_conditions(message)
    is_infra_query = _is_infra_query(message)
    infra_preferences = extract_user_preferences(message) if is_infra_query else {"infra_preferences": {}}
    requested_facility_names = [
        name for name in infra_preferences.get("infra_preferences", {})
        if name in FACILITY_SEARCH_CONFIG
    ]

    recommendations: list[dict[str, Any]] = []
    if approved_houses and _is_recommend_query(message, conditions):
        if is_infra_query:
            recommendations = _build_ai_candidates_with_infra(approved_houses, conditions, message, infra_preferences)
        else:
            recommendations = _build_ai_candidates(approved_houses, conditions, message)

    infra_summary = ""
    if approved_houses and is_infra_query:
        focus_house = _pick_focus_house(approved_houses, recommendations, conditions)
        infra_summary = _make_infra_summary(db, focus_house, requested_facility_names or None)

    history = [{"role": item.role, "content": item.content} for item in payload.history]

    if recommendations:
        local_report = format_ai_recommendation_report(recommendations, infra_summary)

        openai_answer = None
        if USE_OPENAI_CHAT_ANSWER:
            openai_answer = generate_openai_answer(
                user_message=message,
                recommendations=recommendations,
                infra_summary=infra_summary,
                local_report=local_report,
            )

        answer = openai_answer or local_report
    else:
        fallback_answer = generate_ai_chat_answer(
            user_message=message,
            history=history,
            conditions=conditions,
            candidates=recommendations,
            infra_summary=infra_summary,
        )

        openai_answer = None
        if USE_OPENAI_CHAT_ANSWER:
            openai_answer = generate_openai_answer(
                user_message=message,
                recommendations=[],
                infra_summary=infra_summary,
                local_report=fallback_answer,
            )

        answer = openai_answer or fallback_answer
    return {
        "message": answer,
        "recommendations": recommendations,
        "parsedConditions": conditions,
        "knowledgeApplied": has_ai_knowledge(),
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    favicon_path = os.path.join(BASE_DIR, "favicon.ico")
    if not os.path.exists(favicon_path):
        raise HTTPException(status_code=404, detail="favicon not found")
    return FileResponse(favicon_path)


STATIC_DIR_NAMES = (
    "assets",
    "auth",
    "home",
    "guest",
    "owner",
    "admin",
    "legal",
    "community",
    "common",
    "data",
    "vendor",
)

for static_dir_name in STATIC_DIR_NAMES:
    static_dir_path = os.path.join(BASE_DIR, static_dir_name)
    if os.path.isdir(static_dir_path):
        app.mount(f"/{static_dir_name}", StaticFiles(directory=static_dir_path), name=f"{static_dir_name}-static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
