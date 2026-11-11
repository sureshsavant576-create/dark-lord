from __future__ import annotations
import asyncio
from datetime import datetime, timezone
import functools
import inspect
import json
import logging
import random
import re
import time
from typing import Any, Callable, Coroutine, Dict, List, Optional, Tuple, Type, TypeVar
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Common rate limit and transient error substrings across AI APIs (Gemini, Groq, OpenAI)
RATE_LIMIT_MARKERS = [
    "429",
    "rate_limit",
    "ratelimit",
    "resource_exhausted",
    "quota",
    "too many requests",
    "exceeded your current quota",
    "capacity"
]

TRANSIENT_NETWORK_MARKERS = [
    "502",
    "503",
    "504",
    "timeout",
    "timed out",
    "connection reset",
    "connection refused",
    "service unavailable",
    "temporary failure"
]


def is_rate_limit_error(exc: Exception) -> bool:
    """Detects if an exception is attributable to API rate limits or quota exhaustion."""
    msg = str(exc).lower()
    return any(marker in msg for marker in RATE_LIMIT_MARKERS)


def is_transient_error(exc: Exception) -> bool:
    """Detects if an exception is a transient network or server unavailability error."""
    msg = str(exc).lower()
    return any(marker in msg for marker in TRANSIENT_NETWORK_MARKERS) or is_rate_limit_error(exc)


def retry_with_backoff(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 15.0,
    backoff_factor: float = 2.0,
    retry_predicate: Optional[Callable[[Exception], bool]] = None
):
    """
    Decorator for async and sync operations to execute with exponential backoff and jitter.
    Guarantees graceful degradation under API rate limits (HTTP 429) and transient network blips.
    """
    predicate = retry_predicate or is_transient_error

    def decorator(func: Callable):
        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                attempt = 0
                delay = initial_delay

                while True:
                    try:
                        return await func(*args, **kwargs)
                    except Exception as exc:
                        attempt += 1
                        if attempt > max_retries or not predicate(exc):
                            logger.error(
                                "Function '%s' failed after %d attempt(s): %s",
                                func.__name__, attempt, exc
                            )
                            raise

                        # Exponential backoff + full jitter to prevent thundering herds
                        jitter = random.uniform(0.1, 0.5) * delay
                        sleep_time = min(max_delay, delay + jitter)
                        logger.warning(
                            "Transient error in '%s' (attempt %d/%d): %s. Backing off for %.2fs...",
                            func.__name__, attempt, max_retries, exc, sleep_time
                        )
                        await asyncio.sleep(sleep_time)
                        delay = min(max_delay, delay * backoff_factor)
            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                attempt = 0
                delay = initial_delay

                while True:
                    try:
                        return func(*args, **kwargs)
                    except Exception as exc:
                        attempt += 1
                        if attempt > max_retries or not predicate(exc):
                            logger.error(
                                "Function '%s' failed after %d attempt(s): %s",
                                func.__name__, attempt, exc
                            )
                            raise

                        jitter = random.uniform(0.1, 0.5) * delay
                        sleep_time = min(max_delay, delay + jitter)
                        logger.warning(
                            "Transient error in '%s' (attempt %d/%d): %s. Backing off for %.2fs...",
                            func.__name__, attempt, max_retries, exc, sleep_time
                        )
                        time.sleep(sleep_time)
                        delay = min(max_delay, delay * backoff_factor)
            return sync_wrapper

    return decorator


def sanitize_raw_llm_json(raw_text: str) -> str:
    """
    Strips markdown code fences (```json ... ```), removes trailing commas,
    and extracts balanced JSON objects from raw LLM responses.
    """
    if not raw_text or not raw_text.strip():
        return "{}"

    text = raw_text.strip()

    # 1. Strip triple backtick blocks
    fence_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
    match = re.search(fence_pattern, text)
    if match:
        text = match.group(1).strip()

    # 2. Extract balanced JSON substring between { and }
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        text = text[first_brace:last_brace + 1]

    # 3. Clean up trailing commas before closing braces/brackets
    text = re.sub(r",\s*([\]}])", r"\1", text)

    return text


def validate_ai_json_output(
    raw_text: str,
    pydantic_model: Type[T],
    default_factory: Optional[Callable[[], T]] = None
) -> T:
    """
    Strictly validates raw AI text outputs against a target Pydantic model.
    Guarantees:
    - Never passes unvalidated raw AI JSON to internal business logic.
    - If JSON parsing or validation fails, logs the anomaly and returns default_factory or raises.
    """
    cleaned_json = sanitize_raw_llm_json(raw_text)

    try:
        data = json.loads(cleaned_json)
        validated = pydantic_model.model_validate(data)
        return validated
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning(
            "AI output failed Pydantic validation for model '%s': %s. Raw snippet: %s",
            pydantic_model.__name__, exc, cleaned_json[:120]
        )
        if default_factory is not None:
            return default_factory()
        raise ValueError(f"AI JSON output failed schema validation for {pydantic_model.__name__}: {exc}") from exc
