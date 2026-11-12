from pathlib import Path
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = Field(default="Sanket AI", description="System application name")
    ENVIRONMENT: str = Field(default="development", description="Environment: development, test, or production")
    API_V1_PREFIX: str = Field(default="/api/v1", description="API version prefix")

    BASE_DIR: Path = Field(default_factory=lambda: Path(__file__).resolve().parent.parent.parent.parent)
    DATA_DIR: Path = Field(default_factory=lambda: Path("data"))
    STORAGE_DIR: Path = Field(default_factory=lambda: Path("data/storage"))
    UPLOADS_DIR: Path = Field(default_factory=lambda: Path("data/storage/uploads"))
    GUIDELINES_DIR: Path = Field(default_factory=lambda: Path("data/storage/guidelines"))
    STATIC_DIR: Path = Field(default_factory=lambda: Path("backend/app/static"))
    DB_DIR: Path = Field(default_factory=lambda: Path("data/db"))
    BACKUP_DIR: Path = Field(default_factory=lambda: Path("data/backups"))

    GEMINI_API_KEY: Optional[str] = Field(default=None, description="Google Gemini API Key")
    GROQ_API_KEY: Optional[str] = Field(default=None, description="Groq Cloud API Key for compliance reasoning & Co-Pilot")

    DEFAULT_VISION_MODEL: str = Field(default="gemini-3.1-flash-lite", description="Default Gemini multimodal vision model")
    DEFAULT_TEXT_MODEL: str = Field(default="gemini-3.1-flash-lite", description="Default Gemini Brand DNA & guideline model")
    GEMINI_MODEL: str = Field(default="gemini-3.1-flash-lite", description="Default Gemini model")
    GEMINI_IMAGE_MODEL: str = Field(default="gemini-2.5-flash-image", description="Gemini generative image editing model")
    DEFAULT_EMBEDDING_MODEL: str = Field(default="gemini-embedding-001", description="Default embedding model")
    GROQ_VISION_MODEL: str = Field(default="qwen/qwen3.8-27b", description="Fallback text reasoning identifier (vision analysis runs on Gemini)")
    GROQ_TEXT_MODEL: str = Field(default="qwen/qwen3.8-27b", description="Groq cloud-hosted fast text compliance & Co-Pilot model")

    MAX_COLOR_DELTA_E: float = Field(default=15.0, description="Max acceptable CIELAB Delta E color deviation")
    MIN_OVERALL_PASS_SCORE: float = Field(default=70.0, description="Minimum overall score for automatic pass")

    SUPABASE_URL: Optional[str] = Field(default=None, description="Supabase project URL or dashboard project URL")
    SUPABASE_KEY: Optional[str] = Field(default=None, description="Legacy Supabase API key fallback")
    SUPABASE_ANON_KEY: Optional[str] = Field(default=None, description="Supabase publishable/anon key")
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = Field(default=None, description="Supabase service role secret key")
    SUPABASE_ORGANIZATIONS_TABLE: str = Field(default="organizations", description="Supabase table for organisations")
    SUPABASE_TABLE: str = Field(default="brand_dna_profiles", description="Supabase table for storing approved Brand DNA profiles")
    SUPABASE_KNOWLEDGE_TABLE: str = Field(default="brand_knowledge_items", description="Supabase table for Brand Knowledge Base with RLS")
    SUPABASE_REVIEWS_TABLE: str = Field(default="content_reviews", description="Supabase table for AI analysis history")
    SUPABASE_WORKFLOW_TABLE: str = Field(default="workflow_items", description="Supabase table for approval workflows")
    SUPABASE_INSIGHTS_TABLE: str = Field(default="brand_insights_reports", description="Supabase table for Brand Insights data")
    SUPABASE_STORAGE_BUCKET: str = Field(default="brand-assets", description="Supabase Storage bucket for uploaded files & images")
    SUPABASE_RLS_ENABLED: bool = Field(default=True, description="Enforce Row Level Security on Supabase knowledge queries")

    ALLOWED_ORIGINS: str = Field(default="*", description="Comma-separated list of allowed CORS origins")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def init_directories(self) -> None:
        for path in [self.DATA_DIR, self.STORAGE_DIR, self.UPLOADS_DIR, self.GUIDELINES_DIR, self.DB_DIR, self.BACKUP_DIR]:
            path.mkdir(parents=True, exist_ok=True)

    @property
    def has_gemini(self) -> bool:
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())

    @property
    def has_groq(self) -> bool:
        return bool(self.GROQ_API_KEY and self.GROQ_API_KEY.strip())

    @property
    def available_providers(self) -> List[str]:
        providers = []
        if self.has_gemini:
            providers.append("gemini")
        if self.has_groq:
            providers.append("groq")
        return providers

    @property
    def resolved_supabase_url(self) -> str:
        raw = (self.SUPABASE_URL or "").strip()
        if not raw:
            return ""
        import re
        match = re.search(r"supabase\.com/dashboard/project/([a-zA-Z0-9]+)", raw)
        if match:
            return f"https://{match.group(1)}.supabase.co"
        return raw.rstrip("/")

    @property
    def supabase_service_key(self) -> str:
        if self.SUPABASE_SERVICE_ROLE_KEY and self.SUPABASE_SERVICE_ROLE_KEY.strip():
            return self.SUPABASE_SERVICE_ROLE_KEY.strip()
        if self.SUPABASE_KEY and self.SUPABASE_KEY.strip():
            return self.SUPABASE_KEY.strip()
        return ""

    @property
    def supabase_anon_key(self) -> str:
        if self.SUPABASE_ANON_KEY and self.SUPABASE_ANON_KEY.strip():
            return self.SUPABASE_ANON_KEY.strip()
        if self.SUPABASE_KEY and self.SUPABASE_KEY.strip():
            return self.SUPABASE_KEY.strip()
        return ""

    @property
    def has_supabase(self) -> bool:
        return bool(self.resolved_supabase_url and (self.supabase_service_key or self.supabase_anon_key))

    def get_provider_status_dict(self) -> dict:
        return {
            "gemini": {
                "configured": self.has_gemini,
                "model": self.DEFAULT_VISION_MODEL,
                "image_model": self.GEMINI_IMAGE_MODEL,
                "role": "Brand DNA, Company & Guideline Interpretation, Visual/Poster Analysis, Optional Auto-Fix Image Editing"
            },
            "groq": {
                "configured": self.has_groq,
                "model": self.GROQ_TEXT_MODEL,
                "role": "Content Compliance Reasoning, Brand Co-Pilot, Text Analysis & Corrections"
            },
            "supabase": {
                "configured": self.has_supabase,
                "url_configured": bool(self.resolved_supabase_url),
                "anon_key_configured": bool(self.supabase_anon_key),
                "service_role_configured": bool(self.supabase_service_key),
                "role": "Auth, Company Registration, Brand DNA, Knowledge Base, File Storage, Analysis History, Workflows & Insights"
            },
            "deterministic_local": {
                "configured": True,
                "components": ["Pillow", "PyMuPDF", "Colorthief", "Mutagen", "NumPy", "OpenCV", "Tesseract"],
                "role": "Palette Extraction, PDF Parsing, OCR, Image Metrics, Accessibility Contrast, Rule Validation"
            }
        }

settings = Settings()
settings.init_directories()
