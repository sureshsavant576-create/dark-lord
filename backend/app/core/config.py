"""BrandShield AI - Central Configuration System.

Loads and validates environment variables, manages API keys securely,
and establishes platform-wide directory pathways and model defaults.
"""
from pathlib import Path
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application Info
    APP_NAME: str = Field(default="BrandShield AI", description="System application name")
    ENVIRONMENT: str = Field(default="development", description="Environment: development, test, or production")
    API_V1_PREFIX: str = Field(default="/api/v1", description="API version prefix")

    # Directory Paths
    BASE_DIR: Path = Field(default_factory=lambda: Path(__file__).resolve().parent.parent.parent.parent)
    DATA_DIR: Path = Field(default_factory=lambda: Path("data"))
    STORAGE_DIR: Path = Field(default_factory=lambda: Path("data/storage"))
    UPLOADS_DIR: Path = Field(default_factory=lambda: Path("data/storage/uploads"))
    GUIDELINES_DIR: Path = Field(default_factory=lambda: Path("data/storage/guidelines"))
    DB_DIR: Path = Field(default_factory=lambda: Path("data/db"))

    # AI Provider API Keys (Exclusively Google Gemini)
    GEMINI_API_KEY: Optional[str] = Field(default=None, description="Google Gemini API Key")

    # Model Defaults
    DEFAULT_VISION_MODEL: str = Field(default="gemini-2.5-flash", description="Default multimodal vision model")
    DEFAULT_TEXT_MODEL: str = Field(default="gemini-2.5-flash", description="Default text reasoning model")
    DEFAULT_EMBEDDING_MODEL: str = Field(default="text-embedding-004", description="Default embedding model")

    # Inspection Thresholds (Objective & Subjective)
    MAX_COLOR_DELTA_E: float = Field(default=15.0, description="Max acceptable CIELAB Delta E color deviation")
    MIN_OVERALL_PASS_SCORE: float = Field(default=70.0, description="Minimum overall score for automatic pass")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def init_directories(self) -> None:
        """Ensure all required local storage directories exist."""
        for path in [self.DATA_DIR, self.STORAGE_DIR, self.UPLOADS_DIR, self.GUIDELINES_DIR, self.DB_DIR]:
            path.mkdir(parents=True, exist_ok=True)

    @property
    def has_gemini(self) -> bool:
        """Check if Gemini API key is configured with a non-empty string."""
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())

    @property
    def available_providers(self) -> List[str]:
        """List provider names that currently have active API keys configured."""
        return ["gemini"] if self.has_gemini else []

    def get_provider_status_dict(self) -> dict:
        """Safe status summary for frontend health checks without revealing raw keys."""
        return {
            "gemini": {
                "configured": self.has_gemini,
                "model": self.DEFAULT_VISION_MODEL,
                "role": "Multimodal Vision, Audio & Tone Reasoning (Primary & Exclusive AI)"
            },
            "deterministic_local": {
                "configured": True,
                "components": ["Pillow", "PyMuPDF", "Colorthief", "Mutagen", "NumPy"],
                "role": "Palette Extraction, PDF Parsing, Audio Metadata, Rule Validation"
            }
        }


settings = Settings()
settings.init_directories()
