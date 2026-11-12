from __future__ import annotations
import time
import threading
from typing import Dict, List, Tuple
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class InMemorySlidingWindowRateLimiter:

    def __init__(self):
        self._lock = threading.Lock()
        self._requests: Dict[str, List[float]] = {}
        self._last_cleanup = time.time()

    def _cleanup_old_entries(self, now: float) -> None:
        if now - self._last_cleanup > 60:
            for key in list(self._requests.keys()):
                self._requests[key] = [t for t in self._requests[key] if now - t < 60]
                if not self._requests[key]:
                    del self._requests[key]
            self._last_cleanup = now

    def is_allowed(self, client_ip: str, endpoint_category: str, max_requests: int, window_seconds: int = 60) -> Tuple[bool, int]:
        now = time.time()
        key = f"{client_ip}:{endpoint_category}"
        with self._lock:
            self._cleanup_old_entries(now)
            timestamps = self._requests.get(key, [])
            valid_timestamps = [t for t in timestamps if now - t < window_seconds]
            if len(valid_timestamps) >= max_requests:
                earliest = valid_timestamps[0]
                retry_after = max(1, int(window_seconds - (now - earliest)))
                self._requests[key] = valid_timestamps
                return False, retry_after

            valid_timestamps.append(now)
            self._requests[key] = valid_timestamps
            return True, 0

rate_limiter = InMemorySlidingWindowRateLimiter()

class RateLimitMiddleware(BaseHTTPMiddleware):

    HEAVY_ENDPOINTS = [
        "/api/v1/inspect",
        "/api/v1/brands/draft",
        "/api/v1/brands/scan-reference",
    ]
    AUTH_ENDPOINTS = [
        "/api/v1/auth/login",
        "/api/v1/auth/register",
    ]

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/v1"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "127.0.0.1"

        if any(path.startswith(ep) for ep in self.AUTH_ENDPOINTS):
            max_limit = 15
            category = "auth"
        elif any(path.startswith(ep) for ep in self.HEAVY_ENDPOINTS):
            max_limit = 45
            category = "heavy"
        else:
            max_limit = 200
            category = "standard"

        allowed, retry_after = rate_limiter.is_allowed(client_ip, category, max_limit, 60)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please wait before retrying.",
                    "retry_after_seconds": retry_after
                },
                headers={"Retry-After": str(retry_after)}
            )

        return await call_next(request)
