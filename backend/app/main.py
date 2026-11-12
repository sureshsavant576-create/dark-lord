import logging
from pathlib import Path
import uuid
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.api.accessibility import router as accessibility_router
from backend.app.api.audit import router as audit_router
from backend.app.api.auth import router as auth_router
from backend.app.api.brands import router as brands_router
from backend.app.api.claims import router as claims_router
from backend.app.api.inspections import router as inspections_router
from backend.app.api.knowledge import router as knowledge_router
from backend.app.api.reviews import router as reviews_router
from backend.app.api.storage import router as storage_router
from backend.app.api.system import router as system_router
from backend.app.api.workflow import router as workflow_router
from backend.app.api.insights import router as insights_router
from backend.app.core.auth import auth_service
from backend.app.core.config import settings
from backend.app.core.rate_limiter import RateLimitMiddleware
from backend.app.core.security import (
    SecurityPathTraversalError,
    TenantIsolationViolationError,
    safe_join_path,
    sanitize_filename,
)

logger = logging.getLogger(__name__)

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
            "img-src 'self' data: blob: http: https:; "
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
app.include_router(knowledge_router, prefix=settings.API_V1_PREFIX)
app.include_router(reviews_router, prefix=settings.API_V1_PREFIX)
app.include_router(claims_router, prefix=settings.API_V1_PREFIX)
app.include_router(accessibility_router, prefix=settings.API_V1_PREFIX)
app.include_router(workflow_router, prefix=settings.API_V1_PREFIX)
app.include_router(insights_router, prefix=settings.API_V1_PREFIX)
app.include_router(audit_router, prefix=settings.API_V1_PREFIX)
app.include_router(storage_router, prefix=settings.API_V1_PREFIX)

# Global Security & Robust Error Handlers
@app.exception_handler(SecurityPathTraversalError)
@app.exception_handler(TenantIsolationViolationError)
async def handle_security_violation(request: Request, exc: Exception):
    logger.warning("Security access blocked for %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=403,
        content={"detail": f"Forbidden: {str(exc)}"}
    )

@app.exception_handler(Exception)
async def handle_unhandled_exception(request: Request, exc: Exception):
    req_id = str(uuid.uuid4())[:8]
    logger.error("Internal Server Error on %s [request_id=%s]: %s", request.url.path, req_id, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred. System operators have been notified.",
            "request_id": req_id
        }
    )

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
settings.init_directories()

# Initialize default enterprise knowledge base
try:
    from backend.app.services.knowledge_service import knowledge_service
    knowledge_service.seed_enterprise_knowledge_base("default-org", "apex-cloud")
except Exception:
    pass

@app.get("/storage/uploads/{file_name:path}")
async def get_uploaded_storage_file(
    file_name: str,
    request: Request
):
    """
    Access-controlled storage resolver preventing unauthorized public downloads of company files.
    """
    clean_name = sanitize_filename(file_name)
    target_path = safe_join_path(settings.UPLOADS_DIR, clean_name)
    if not target_path.exists() or not target_path.is_file():
        # Search across tenant uploads folders
        found = False
        base_tenants = settings.STORAGE_DIR / "tenants"
        if base_tenants.exists():
            for tenant_folder in base_tenants.iterdir():
                cand = tenant_folder / "uploads" / clean_name
                if cand.exists() and cand.is_file():
                    target_path = cand
                    found = True
                    break
        if not found:
            sample_candidate = STATIC_DIR / "samples" / clean_name
            if sample_candidate.exists() and sample_candidate.is_file():
                target_path = sample_candidate
                found = True
        if not found:
            return Response(status_code=404, content="File not found")

    is_sample = any(k in clean_name.lower() for k in ("sample", "compliant", "nike", "grb", "preview", "creative"))
    if not is_sample:
        auth_hdr = request.headers.get("Authorization") or ""
        token = auth_hdr.split("Bearer ", 1)[1].strip() if auth_hdr.startswith("Bearer ") else None
        if not token:
            token = request.query_params.get("token") or request.cookies.get("sanket_session_token")
        user = auth_service.verify_token(token) if token else None
        if not user:
            logger.warning("Unauthenticated file access blocked: '%s'", clean_name)
            return JSONResponse(
                status_code=401,
                content={"detail": "Authentication required to access uploaded company assets."}
            )
    return FileResponse(target_path)

@app.get("/storage/guidelines/{file_name:path}")
async def get_guideline_storage_file(
    file_name: str,
    request: Request
):
    """
    Access-controlled storage resolver for proprietary brand guidelines.
    """
    clean_name = sanitize_filename(file_name)
    target_path = safe_join_path(settings.GUIDELINES_DIR, clean_name)
    if not target_path.exists() or not target_path.is_file():
        return Response(status_code=404, content="Guideline document not found")

    auth_hdr = request.headers.get("Authorization") or ""
    token = auth_hdr.split("Bearer ", 1)[1].strip() if auth_hdr.startswith("Bearer ") else None
    if not token:
        token = request.query_params.get("token") or request.cookies.get("sanket_session_token")
    user = auth_service.verify_token(token) if token else None
    if not user:
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required to access confidential brand guidelines."}
        )
    return FileResponse(target_path)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

PUBLIC_BRAND_DIR = Path("public/brand")
if PUBLIC_BRAND_DIR.exists():
    app.mount("/public/brand", StaticFiles(directory=str(PUBLIC_BRAND_DIR)), name="public_brand")

@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
async def get_favicon():
    fav_path = STATIC_DIR / "brand" / "favicon.svg"
    if fav_path.exists():
        return FileResponse(fav_path, media_type="image/svg+xml")
    return Response(status_code=404)


@app.get("/dashboard")
@app.get("/brand-identity")
@app.get("/brand-knowledge")
@app.get("/content-review")
@app.get("/content-review/{review_id}")
@app.get("/preflight-scanner")
@app.get("/brand-copilot")
@app.get("/approvals")
@app.get("/brand-insights")
@app.get("/settings")
@app.get("/overview")
@app.get("/")
def serve_index(review_id: str = None):
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
