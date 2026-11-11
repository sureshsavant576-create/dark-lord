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

    GEMINI_API_KEY: Optional[str] = Field(default=None, description="Google Gemini API Key")
    OPENAI_API_KEY: Optional[str] = Field(default=None, description="OpenAI API Key (optional fallback)")
    HUGGINGFACE_API_KEY: Optional[str] = Field(default=None, description="Hugging Face API Key (optional fallback)")
    GROQ_API_KEY: Optional[str] = Field(default=None, description="Groq Cloud API Key for vision-capable models")

    DEFAULT_VISION_MODEL: str = Field(default="gemini-3.1-flash-lite", description="Default multimodal vision model")
    DEFAULT_TEXT_MODEL: str = Field(default="gemini-3.1-flash-lite", description="Default text reasoning model")
    DEFAULT_EMBEDDING_MODEL: str = Field(default="gemini-embedding-001", description="Default embedding model")
    GROQ_VISION_MODEL: str = Field(default="llama-3.2-11b-vision-preview", description="Groq cloud-hosted vision model")

    MAX_COLOR_DELTA_E: float = Field(default=15.0, description="Max acceptable CIELAB Delta E color deviation")
    MIN_OVERALL_PASS_SCORE: float = Field(default=70.0, description="Minimum overall score for automatic pass")

    SUPABASE_URL: Optional[str] = Field(default=None, description="Supabase project URL")
    SUPABASE_KEY: Optional[str] = Field(default=None, description="Supabase API key anon or service role")
    SUPABASE_TABLE: str = Field(default="brand_dna_profiles", description="Supabase table for storing approved Brand DNA profiles")
    SUPABASE_KNOWLEDGE_TABLE: str = Field(default="brand_knowledge_items", description="Supabase table for Brand Knowledge Base with RLS")
    SUPABASE_RLS_ENABLED: bool = Field(default=True, description="Enforce Row Level Security on Supabase knowledge queries")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def init_directories(self) -> None:
        for path in [self.DATA_DIR, self.STORAGE_DIR, self.UPLOADS_DIR, self.GUIDELINES_DIR, self.DB_DIR]:
            path.mkdir(parents=True, exist_ok=True)

    @property
    def has_gemini(self) -> bool:
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())

    @property
    def has_openai(self) -> bool:
        return bool(self.OPENAI_API_KEY and self.OPENAI_API_KEY.strip())

    @property
    def has_groq(self) -> bool:
        return bool(self.GROQ_API_KEY and self.GROQ_API_KEY.strip())

    @property
    def has_huggingface(self) -> bool:
        return bool(self.HUGGINGFACE_API_KEY and self.HUGGINGFACE_API_KEY.strip())

    @property
    def available_providers(self) -> List[str]:
        providers = []
        if self.has_gemini:
            providers.append("gemini")
        if self.has_groq:
            providers.append("groq")
        if self.has_openai:
            providers.append("openai")
        if self.has_huggingface:
            providers.append("huggingface")
        return providers

    @property
    def has_supabase(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_KEY and self.SUPABASE_URL.strip() and self.SUPABASE_KEY.strip())

    def get_provider_status_dict(self) -> dict:
        return {
            "gemini": {
                "configured": self.has_gemini,
                "model": self.DEFAULT_VISION_MODEL,
                "role": "Multimodal Vision, Audio & Tone Reasoning (Primary)"
            },
            "groq": {
                "configured": self.has_groq,
                "model": self.GROQ_VISION_MODEL,
                "role": "Cloud-Hosted Vision & Fast Text Reasoning (Llama 3.2 Vision)"
            },
            "openai": {
                "configured": self.has_openai,
                "model": "gpt-4o-mini",
                "role": "Secondary Multimodal & Vision Fallback"
            },
            "deterministic_local": {
                "configured": True,
                "components": ["Pillow", "PyMuPDF", "Colorthief", "Mutagen", "NumPy"],
                "role": "Palette Extraction, PDF Parsing, Audio Metadata, Rule Validation"
            }
        }

settings = Settings()
settings.init_directories()
