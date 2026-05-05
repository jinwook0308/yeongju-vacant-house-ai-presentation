import json
import os
from typing import Any
from openai import OpenAI

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KNOWLEDGE_PATH = os.path.join(BASE_DIR, "ai_knowledge.txt")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


def load_ai_knowledge() -> str:
    if not os.path.exists(KNOWLEDGE_PATH):
        return ""
    try:
        with open(KNOWLEDGE_PATH, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def has_ai_knowledge() -> bool:
    return bool(load_ai_knowledge())


def _fallback_report(house: Any, infra: dict[str, Any], analysis_result: dict[str, Any]) -> str:
    strengths = "\n".join(f"- {item}" for item in analysis_result["strengths"]) or "- 뚜렷한 강점 데이터가 아직 없습니다."
    weaknesses = "\n".join(f"- {item}" for item in analysis_result["weaknesses"]) or "- 뚜렷한 약점 데이터가 아직 없습니다."
    targets = ", ".join(analysis_result["recommended_for"])

    return f"""
생활 편의성 점수: {analysis_result['score']}점 ({analysis_result['grade']})

추천 타겟:
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


def generate_ai_report(house: Any, infra: dict[str, Any], analysis_result: dict[str, Any]) -> str:
    if client is None:
        return _fallback_report(house, infra, analysis_result)

    prompt = f"""
당신은 영주시 체류·정착 컨설턴트입니다.
아래 데이터를 바탕으로 빈집의 생활 적합성을 한국어로 간결하고 현실적으로 평가하세요.
과장하지 말고, 없는 사실을 만들지 마세요.

[집 정보]
- 주소: {house.address}
- 유형: {house.house_type}
- 상태: {house.status}
- 면적: {house.area}㎡

[주변 인프라 요약]
{infra}

[규칙 기반 분석 결과]
{analysis_result}

다음 형식으로 답하세요.
1. 생활 편의성
2. 추천 타겟
3. 장점
4. 아쉬운 점
5. 종합 판단
""".strip()

    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "당신은 근거 기반으로만 설명하는 지역 정착 분석 도우미입니다."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or _fallback_report(house, infra, analysis_result)
    except Exception:
        return _fallback_report(house, infra, analysis_result)
    
def _candidate_lines(candidates: list[dict[str, Any]]) -> str:
    if not candidates:
        return "- 후보 없음"

    lines: list[str] = []
    for idx, item in enumerate(candidates, start=1):
        house = item.get("house", {})
        reasons = item.get("reasons", [])
        lines.append(
            f"{idx}. {house.get('name', '이름없음')} | "
            f"지역: {house.get('districtName', '-')} | "
            f"최대인원: {house.get('maxCapacity', '-')}명 | "
            f"운영유형: {house.get('operationType', '-')} | "
            f"가격: {house.get('priceRange', '-')} | "
            f"등급: {house.get('conditionGrade', '-')} | "
            f"태그: {', '.join(house.get('tags', [])) or '-'} | "
            f"이유: {', '.join(reasons) or '조건 일부 일치'}"
        )
    return "\n".join(lines)


def _history_lines(history: list[dict[str, Any]]) -> str:
    if not history:
        return "- 이전 대화 없음"

    lines = []
    for item in history[-8:]:
        role = item.get("role", "user")
        content = item.get("content", "")
        if not content:
            continue
        if role == "assistant":
            lines.append(f"assistant: {content}")
        else:
            lines.append(f"user: {content}")
    return "\n".join(lines) if lines else "- 이전 대화 없음"


def _fallback_recommendation_answer(query: str, conditions: dict[str, Any], candidates: list[dict[str, Any]], knowledge_text: str) -> str:
    if not candidates:
        return "현재 공개 승인된 빈집 중에서 질문 조건과 충분히 맞는 후보를 찾지 못했습니다. 지역, 인원, 체류 기간을 조금 더 구체적으로 입력해 주세요."

    top = candidates[0]
    house = top["house"]
    reasons = ", ".join(top.get("reasons", [])) or "조건 일부 일치"
    district_hint = conditions.get("districtName") or house.get("districtName") or "영주시"

    lines = [
        f"질문을 기준으로 보면 우선 {house.get('name')}을 가장 먼저 추천할 수 있습니다.",
        f"이 후보는 {district_hint} 권역에서 검토했고, 최대 {house.get('maxCapacity')}명 이용 가능하며 {house.get('priceRange')} 수준입니다.",
        f"추천 이유는 {reasons}입니다.",
    ]

    extra = candidates[1:3]
    if extra:
        names = ", ".join(item["house"].get("name", "이름없음") for item in extra)
        lines.append(f"함께 비교해볼 후보로는 {names}도 있습니다.")

    if knowledge_text:
        lines.append("지식 파일에 포함된 기준도 함께 반영해, 과장 없이 공공데이터에 맞춰 추천했습니다.")

    lines.append("상세페이지에서 집 상태, 검토 결과, 이용 목적을 꼭 같이 확인해 주세요.")
    return "\n".join(lines)


def generate_ai_recommendation_answer(
    query: str,
    conditions: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> str:
    knowledge_text = load_ai_knowledge()

    if client is None:
        return _fallback_recommendation_answer(query, conditions, candidates, knowledge_text)

    prompt = f"""
당신은 영주시 공공형 빈집 활용 플랫폼의 AI 추천 도우미입니다.
아래 정보를 바탕으로만 한국어로 답하세요. 없는 사실은 만들지 마세요.
답변은 6문장 이내로 간결하게 작성하세요.

[사용자 질문]
{query}

[추출된 조건]
{json.dumps(conditions, ensure_ascii=False, indent=2)}

[후보 빈집 목록]
{_candidate_lines(candidates)}

[학습 데이터 / 지식 문맥]
{knowledge_text or '별도 지식 파일 없음'}

반드시 아래 원칙을 지키세요.
- 후보 목록에 있는 빈집만 추천할 것
- 가장 적합한 후보부터 설명할 것
- 추천 이유를 구체적으로 쓸 것
- 조건이 애매하면 부족한 점도 솔직히 말할 것
- 마지막 문장은 상세페이지 확인 유도로 끝낼 것
""".strip()

    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "당신은 공공데이터와 제공된 지식 문맥만 바탕으로 추천하는 한국어 AI 비서입니다."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.35,
        )
        content = response.choices[0].message.content
        return content or _fallback_recommendation_answer(query, conditions, candidates, knowledge_text)
    except Exception:
        return _fallback_recommendation_answer(query, conditions, candidates, knowledge_text)
    
    
    

def generate_ai_chat_answer(
    user_message: str,
    history: list[dict[str, Any]],
    conditions: dict[str, Any],
    candidates: list[dict[str, Any]],
    infra_summary: str,
) -> str:
    knowledge_text = load_ai_knowledge()
    candidate_text = _candidate_lines(candidates) if candidates else "- 추천 후보 없음"
    history_text = _history_lines(history)

    fallback = "안녕하세요. 영주시 빈집 AI 도우미입니다. 질문하신 내용과 관련된 영주시 빈집, 주변시설, 체류 조건을 기준으로 안내드릴게요."

    if client is None:
        return fallback

    prompt = f"""
당신은 영주시 공공형 빈집 활용 플랫폼의 대화형 AI 도우미입니다.
평소에는 자연스럽고 일반적인 GPT처럼 한국어로 대화하세요.
다만 영주시 빈집, 체류, 숙소, 주변 시설, 귀농, 지역 정보와 관련되면 반드시 제공된 자료를 우선 참고해서 답하세요.
없는 사실은 만들지 마세요.

[이전 대화]
{history_text}

[현재 사용자 메시지]
{user_message}

[추출된 조건]
{json.dumps(conditions, ensure_ascii=False, indent=2)}

[후보 빈집 목록]
{candidate_text}

[주변 인프라 요약]
{infra_summary or '- 없음'}

[지식 문맥]
{knowledge_text or '- 별도 지식 파일 없음'}

반드시 지킬 규칙:
- 일반 대화는 자연스럽게 답할 것
- 영주시 빈집 추천 관련이면 후보 빈집 목록을 우선 활용할 것
- 주변 병원/마트/음식점/교통 질문이면 주변 인프라 요약을 우선 활용할 것
- 후보가 없으면 억지 추천하지 말 것
- 해외여행, 영주시와 무관한 질문이면 서비스 범위를 설명하되 대화는 자연스럽게 이어갈 것
- 답변은 딱딱한 공지문 말투보다 자연스러운 대화체로 할 것
- 필요할 때만 추천을 언급하고, 항상 추천을 강요하지 말 것
""".strip()

    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "당신은 자연스럽게 대화하지만, 제공된 공공데이터와 지식 문맥을 우선 참고하는 한국어 AI 도우미입니다."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
        )
        content = response.choices[0].message.content
        return content or fallback
    except Exception:
        return fallback