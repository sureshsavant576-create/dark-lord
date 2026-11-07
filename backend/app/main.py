"""BrandShield AI - Main FastAPI Application Gateway."""
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.api.brands import router as brands_router
from backend.app.api.inspections import router as inspections_router
from backend.app.api.system import router as system_router
from backend.app.api.tasks import router as tasks_router
from backend.app.core.config import settings

# Initialize FastAPI App
app = FastAPI(
    title=settings.APP_NAME,
    description="Intelligent Brand Inspection & Governance Platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for local development and web frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 Routers
app.include_router(system_router, prefix=settings.API_V1_PREFIX)
app.include_router(brands_router, prefix=settings.API_V1_PREFIX)
app.include_router(inspections_router, prefix=settings.API_V1_PREFIX)
app.include_router(tasks_router, prefix=settings.API_V1_PREFIX)

# Ensure static and storage directories exist
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
settings.init_directories()

# Mount uploaded asset storage for previewing submitted content in the UI
app.mount("/storage/uploads", StaticFiles(directory=str(settings.UPLOADS_DIR)), name="uploads")
app.mount("/storage/guidelines", StaticFiles(directory=str(settings.GUIDELINES_DIR)), name="guidelines")

# Serve Web UI
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "BrandShield AI API is operational. Visit /docs for OpenAPI specifications."}


@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
def serve_favicon():
    fav = STATIC_DIR / "assets" / "favicon.svg"
    if fav.exists():
        return FileResponse(fav, media_type="image/svg+xml")
    return {"message": "No favicon"}

