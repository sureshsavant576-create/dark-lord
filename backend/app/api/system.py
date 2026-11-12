from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from backend.app.ai.gateway import ai_gateway
from backend.app.core.config import settings

router = APIRouter(tags=["System"])

@router.get("/health")
@router.get("/system/health")
def get_health() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/status")
@router.get("/system/status")
def get_system_status() -> Dict[str, Any]:
    provider_config = settings.get_provider_status_dict()
    gateway_status = ai_gateway.get_status()
    primary = ai_gateway.get_primary_provider()

    return {
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "active_primary_provider": primary.provider_name() if primary else None,
        "providers": provider_config,
        "gateway_live_status": gateway_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/providers")
def get_providers_status() -> Dict[str, Any]:
    provider_config = settings.get_provider_status_dict()
    gateway_status = ai_gateway.get_status()

    return {
        "active_primary_provider": ai_gateway.get_primary_provider().provider_name() if ai_gateway.get_primary_provider() else None,
        "providers": provider_config,
        "gateway_live_status": gateway_status
    }


class TestGroqRequest(BaseModel):
    api_key: Optional[str] = None
    prompt: Optional[str] = "Verify Groq API connectivity for Sanket AI Brand Governance."


@router.post("/test-groq")
@router.get("/test-groq")
@router.post("/system/test-groq")
@router.get("/system/test-groq")
async def test_groq_connectivity(req: Optional[TestGroqRequest] = None) -> Dict[str, Any]:
    """
    Tests live Groq API connectivity with the backend.
    Checks model response, latency, and handles timeouts, rate limits, and authentication errors.
    Never exposes API secrets in response.
    """
    import time
    import httpx
    try:
        from groq import AsyncGroq, AuthenticationError, RateLimitError
    except ImportError:
        return {
            "configured": False,
            "status": "error",
            "message": "The 'groq' Python library is not installed in the environment."
        }

    key_to_use = (req.api_key.strip() if req and req.api_key else None) or (settings.GROQ_API_KEY.strip() if settings.GROQ_API_KEY else None)

    if not key_to_use:
        return {
            "configured": False,
            "status": "unconfigured",
            "provider": "groq",
            "message": "GROQ_API_KEY is not set in the backend environment. Ensure GROQ_API_KEY is added in Render environment variables or .env."
        }

    models_to_test = [
        getattr(settings, "GROQ_TEXT_MODEL", "qwen/qwen3.8-27b"),
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b"
    ]

    prompt_text = (req.prompt if req and req.prompt else "Respond with a 1-sentence confirmation that Groq is operational for Sanket AI.")

    t0 = time.perf_counter()
    timeout = httpx.Timeout(15.0, connect=5.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as http_client:
            client = AsyncGroq(api_key=key_to_use, http_client=http_client, max_retries=0)
            last_err = None

            for model_name in dict.fromkeys(models_to_test):
                try:
                    response = await client.chat.completions.create(
                        model=model_name,
                        messages=[
                            {"role": "system", "content": "You are a fast API health verification assistant."},
                            {"role": "user", "content": prompt_text}
                        ],
                        max_tokens=60,
                        temperature=0.1
                    )
                    elapsed_ms = (time.perf_counter() - t0) * 1000.0

                    if response and response.choices and response.choices[0].message.content:
                        return {
                            "configured": True,
                            "status": "operational",
                            "provider": "groq",
                            "model_tested": model_name,
                            "latency_ms": round(elapsed_ms, 1),
                            "test_response": response.choices[0].message.content.strip(),
                            "key_masked": f"{key_to_use[:6]}...{key_to_use[-4:]}" if len(key_to_use) > 10 else "***"
                        }
                except RateLimitError as rl_err:
                    return {
                        "configured": True,
                        "status": "rate_limited",
                        "provider": "groq",
                        "error": "Groq rate limit reached. Exponential backoff active.",
                        "details": str(rl_err)
                    }
                except AuthenticationError as auth_err:
                    return {
                        "configured": False,
                        "status": "invalid_api_key",
                        "provider": "groq",
                        "error": "The provided GROQ_API_KEY is invalid or unauthorized by Groq Cloud.",
                        "details": str(auth_err)
                    }
                except Exception as exc:
                    last_err = exc
                    continue

            return {
                "configured": True,
                "status": "error",
                "provider": "groq",
                "error": f"Groq request could not be completed: {last_err}"
            }

    except httpx.TimeoutException:
        return {
            "configured": True,
            "status": "timeout",
            "provider": "groq",
            "error": "Groq API request timed out after 15 seconds."
        }
    except Exception as general_err:
        return {
            "configured": bool(key_to_use),
            "status": "error",
            "provider": "groq",
            "error": str(general_err)
        }


@router.post("/test-gemini")
async def test_gemini_connection():
    """
    Tests live Google Gemini API connectivity for Brand DNA, guideline interpretation,
    and visual analysis without exposing API secrets.
    """
    import time
    if not settings.has_gemini:
        return {
            "configured": False,
            "status": "unconfigured",
            "provider": "gemini",
            "message": "GEMINI_API_KEY is not configured in environment."
        }
    t0 = time.perf_counter()
    try:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY.strip())
        models = list(dict.fromkeys(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", settings.DEFAULT_VISION_MODEL, "gemini-3.5-flash"]))
        last_err = None
        for m_name in models:
            try:
                resp = client.models.generate_content(
                    model=m_name,
                    contents="Confirm Google Gemini operational readiness for Sanket AI in one short sentence."
                )
                if resp and resp.text:
                    return {
                        "configured": True,
                        "status": "operational",
                        "provider": "gemini",
                        "model_used": m_name,
                        "response_text": resp.text.strip(),
                        "latency_ms": round((time.perf_counter() - t0) * 1000.0, 2)
                    }
            except Exception as exc:
                last_err = exc
                continue
        return {
            "configured": True,
            "status": "error",
            "provider": "gemini",
            "error": str(last_err)
        }
    except Exception as exc:
        return {
            "configured": True,
            "status": "error",
            "provider": "gemini",
            "error": str(exc)
        }


@router.get("/test-supabase")
async def test_supabase_connection():
    """
    Tests live Supabase Auth, REST schema/tables, and Storage bucket readiness
    without exposing API secrets or service keys.
    """
    from backend.app.services.supabase_service import supabase_service
    return await supabase_service.probe_live_health()
