"""LLM service — Gemini for chat answers."""
import httpx

from app.config import settings

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


async def generate_answer(system_prompt: str, user_prompt: str) -> str:
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY chưa được cấu hình trong .env")

    model = settings.llm_model
    url = f"{GEMINI_BASE}/models/{model}:generateContent"
    params = {"key": settings.gemini_api_key}
    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
        },
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, params=params, json=body)
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    text_parts = [p.get("text", "") for p in parts if "text" in p]
    answer = "".join(text_parts).strip()
    if not answer:
        raise ValueError("Gemini returned empty text")
    return answer
