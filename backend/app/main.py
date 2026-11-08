from pathlib import Path
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.api.auth import router as auth_router
from backend.app.api.brands import router as brands_router
from backend.app.api.inspections import router as inspections_router
from backend.app.api.system import router as system_router
from backend.app.core.config import settings
from backend.app.core.rate_limiter import RateLimitMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), "
            "microphone=(), payment=(), usb=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self' 'unsafe-inline' data: blob:; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob: /storage/ http: https:; "
            "connect-src 'self' http: https: ws: wss:; "
            "frame-ancestors 'none';"
        )
        return response

app = FastAPI(
    title=settings.APP_NAME,
    description="Intelligent Brand Inspection & Governance Platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system_router, prefix=settings.API_V1_PREFIX)
app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(brands_router, prefix=settings.API_V1_PREFIX)
app.include_router(inspections_router, prefix=settings.API_V1_PREFIX)

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
settings.init_directories()

app.mount("/storage/uploads", StaticFiles(directory=str(settings.UPLOADS_DIR)), name="uploads")
app.mount("/storage/guidelines", StaticFiles(directory=str(settings.GUIDELINES_DIR)), name="guidelines")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/overview")
@app.get("/")
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Sanket AI API is operational. Visit /docs for OpenAPI specifications."}

@app.get("/check-vibe")
@app.get("/vibe-inspector")
@app.get("/inspect")
def serve_check_vibe():
    f = STATIC_DIR / "check-vibe.html"
    if f.exists():
        return FileResponse(f)
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/company-portal")
@app.get("/company")
def serve_company_portal():
    f = STATIC_DIR / "company-portal.html"
    if f.exists():
        return FileResponse(f)
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/account")
@app.get("/company-account")
def serve_account():
    f = STATIC_DIR / "account.html"
    if f.exists():
        return FileResponse(f)
    return FileResponse(STATIC_DIR / "index.html")
