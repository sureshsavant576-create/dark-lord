"""BrandShield AI - AI Provider Interfaces & Evaluation Data Models.

Defines standardized schemas for multimodal evaluation and brand profile synthesis.
Adheres strictly to development rules:
- Differentiates AI-generated findings from deterministic checks.
- Refuses to fabricate mock or fictional results when providers are unconfigured.
- Emits transparent error states with explicit remediation instructions.
"""
from abc import ABC, abstractmethod
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ProviderStatus(str, Enum):
    OPERATIONAL = "OPERATIONAL"
    UNCONFIGURED = "UNCONFIGURED"
    ERROR = "ERROR"
    RATE_LIMITED = "RATE_LIMITED"


class ContentAnalysisRequest(BaseModel):
    """Payload representing content to be inspected by an AI model."""
    file_path: Optional[Path] = Field(default=None, description="Path to image, audio, or document file")
    mime_type: str = Field(description="MIME type, e.g. image/png, audio/mpeg, application/pdf, text/plain")
    extracted_text: Optional[str] = Field(default=None, description="Deterministic OCR / PDF text extracted beforehand")
    extracted_colors: Optional[List[str]] = Field(default=None, description="Extracted hex colors from Pillow/Colorthief")
    context_prompt: Optional[str] = Field(default="", description="Instructional context for the evaluation")


class MultimodalEvaluation(BaseModel):
    """Outcome of an AI model's inspection of creative content against a brand profile."""
    provider: str = Field(description="Name of the model provider (e.g., gemini, openai)")
    model_used: str = Field(description="Exact model name/checkpoint utilized")
    status: ProviderStatus = Field(default=ProviderStatus.OPERATIONAL)
    is_ai_generated: bool = Field(default=True, description="Explicit marker distinguishing AI output from deterministic checks")
    
    # Detected Subjective Attributes
    mood_detected: str = Field(default="Unspecified", description="Mood detected by the AI in the submission")
    personality_detected: str = Field(default="Unspecified", description="Brand personality reflected")
    tone_detected: str = Field(default="Unspecified", description="Communication tone reflected")
    visual_style_detected: str = Field(default="Unspecified", description="Visual/aesthetic style detected")
    target_audience_alignment: str = Field(default="Unspecified", description="How well the content speaks to the target audience")

    # Detailed Qualitative Findings
    detailed_analysis: str = Field(default="", description="Explainable analysis of creative alignment")
    mismatches_identified: List[str] = Field(default_factory=list, description="Specific off-brand elements detected")
    alignment_score: Optional[float] = Field(default=None, description="Model-assessed subjective alignment score (0-100) or None if unconfigured")
    confidence_score: float = Field(default=0.0, description="Model confidence indicator (0.0 - 1.0)")
    
    # Operational Diagnostics
    error_message: Optional[str] = Field(default=None, description="Error details if the call failed or was unconfigured")


class BrandSynthesisEvaluation(BaseModel):
    """Structured brand profile dynamically synthesized by AI from questionnaire + reference files."""
    provider: str
    model_used: str
    status: ProviderStatus = Field(default=ProviderStatus.OPERATIONAL)
    is_ai_generated: bool = Field(default=True)
    
    # Synthesized Core Brand Profile
    brand_personality: List[str] = Field(default_factory=list, description="Extracted personality traits")
    brand_mood: List[str] = Field(default_factory=list, description="Approved moods and emotional resonance")
    communication_tone: List[str] = Field(default_factory=list, description="Approved verbal and written tones")
    visual_style: List[str] = Field(default_factory=list, description="Visual style guidelines and rules")
    target_audience: str = Field(default="", description="Target demographic definition")
    key_values: List[str] = Field(default_factory=list, description="Core corporate values")
    disallowed_elements: List[str] = Field(default_factory=list, description="Specific terms, aesthetics, or tropes to avoid")
    suggested_palette: List[str] = Field(default_factory=list, description="Extracted or recommended hex color codes")

    confidence_score: float = Field(default=0.0)
    raw_explanation: str = Field(default="")
    error_message: Optional[str] = Field(default=None)


class ProviderNotConfiguredError(Exception):
    """Raised when an AI operation is requested but the required API key is not configured."""
    def __init__(self, provider_name: str, key_env_var: str):
        self.provider_name = provider_name
        self.key_env_var = key_env_var
        super().__init__(
            f"AI Provider '{provider_name}' is not configured. "
            f"Please set '{key_env_var}' in your .env file or environment variables."
        )


class ProviderInferenceError(Exception):
    """Raised when an external AI API call fails during execution."""
    pass


class AIProviderBase(ABC):
    """Abstract base class for all AI model providers."""

    @abstractmethod
    def provider_name(self) -> str:
        """Unique identifier for this provider."""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True if the provider has the credentials required to make live calls."""
        pass

    @abstractmethod
    async def analyze_creative_content(
        self,
        request: ContentAnalysisRequest,
        target_profile: Dict[str, Any]
    ) -> MultimodalEvaluation:
        """Inspect creative submission against the target company's stored brand profile."""
        pass

    @abstractmethod
    async def synthesize_brand_identity(
        self,
        questionnaire_data: Dict[str, Any],
        reference_texts: List[str],
        reference_images_info: Optional[List[Dict[str, Any]]] = None
    ) -> BrandSynthesisEvaluation:
        """Synthesize unstructured reference docs & questionnaire into a structured brand profile."""
        pass
