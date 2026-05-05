import os
import pandas as pd
from sqlalchemy import select

from db import SessionLocal, House, init_db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "yeongju_houses.csv")


def _clean_value(value, default=None):
    if pd.isna(value):
        return default
    if isinstance(value, str):
        value = value.strip()
        return value if value else default
    return value


def run_import(csv_path: str = CSV_PATH, reset: bool = True) -> None:
    init_db()

    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV 파일을 찾을 수 없습니다: {csv_path}")

    df = pd.read_csv(csv_path, encoding="utf-8-sig")
    df.columns = [str(col).strip() for col in df.columns]

    required_columns = ["주소", "위도", "경도"]
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise ValueError(f"CSV 필수 컬럼 누락: {missing}")

    df = df.dropna(subset=["주소", "위도", "경도"]).copy()

    with SessionLocal() as db:
        if reset:
            db.query(House).delete()
            db.commit()

        inserted = 0
        skipped = 0

        for row in df.to_dict(orient="records"):
            address = _clean_value(row.get("주소"))
            lat = _clean_value(row.get("위도"))
            lon = _clean_value(row.get("경도"))

            if not address or lat is None or lon is None:
                skipped += 1
                continue

            try:
                lat = float(lat)
                lon = float(lon)
            except (TypeError, ValueError):
                skipped += 1
                continue

            exists = db.execute(
                select(House).where(
                    House.address == address,
                    House.lat == lat,
                    House.lon == lon,
                )
            ).scalar_one_or_none()

            if exists:
                skipped += 1
                continue

            area_value = _clean_value(row.get("면적"), 0.0)
            try:
                area_value = float(area_value or 0.0)
            except (TypeError, ValueError):
                area_value = 0.0

            db.add(
                House(
                    address=address,
                    house_type=_clean_value(row.get("유형"), "단독주택"),
                    area=area_value,
                    status=_clean_value(row.get("상태"), "보통"),
                    lat=lat,
                    lon=lon,
                )
            )
            inserted += 1

        db.commit()

    print(f"CSV 데이터 적재 완료: inserted={inserted}, skipped={skipped}")


if __name__ == "__main__":
    run_import()