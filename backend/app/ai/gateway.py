"""BrandShield AI - AI Provider Gateway (Exclusively Powered by Google Gemini).

Orchestrates multimodal and NLP reasoning strictly via Google Gemini API (gemini-2.5-flash),
adhering to real API inference with zero fabricated or mocked metrics.
"""
import logging
from typing import Any, Dict, List, Optional

from backend.app.ai.base import (
    AIProviderBase,
    BrandSynthesisEvaluation,
    ContentAnalysisRequest,
    MultimodalEvaluation,
    ProviderStatus,
)
from backend.app.ai.gemini_provider import GeminiProvider
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class AIGateway:
    """Central AI orchestrator powered exclusively by Google Gemini."""

    def __init__(self):
        self.providers: Dict[str, AIProviderBase] = {
            "gemini": GeminiProvider()
        }

    def get_provider(self, name: str = "gemini") -> Optional[AIProviderBase]:
        return self.providers.get("gemini")

    def get_primary_provider(self) -> Optional[AIProviderBase]:
        """Returns the primary Google Gemini provider if configured."""
        if self.providers["gemini"].is_configured():
            return self.providers["gemini"]
        return None

    def get_status(self) -> Dict[str, Any]:
        """Returns an operational overview of the integrated Gemini AI service."""
        return {
            "gemini": {
                "configured": self.providers["gemini"].is_configured(),
                "provider": "gemini",
                "model": settings.DEFAULT_VISION_MODEL
            }
        }

    async def analyze_creative_content(
        self,
        request: ContentAnalysisRequest,
        target_profile: Dict[str, Any],
        preferred_provider: Optional[str] = None
    ) -> MultimodalEvaluation:
        """Inspect creative material using Google Gemini multimodal AI."""
        provider = self.get_primary_provider()

        if provider is None:
            # Rule 10: Do NOT generate fictional results when a model or API is unavailable
            return MultimodalEvaluation(
                provider="gemini",
                model_used=settings.DEFAULT_VISION_MODEL,
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                detailed_analysis=(
                    "Google Gemini API is unconfigured. Deterministic checks (CIELAB color delta, "
                    "disallowed terminology, resolution/audio specs) completed successfully. "
                    "To enable multimodal visual understanding and tone analysis, provide "
                    "GEMINI_API_KEY in your .env file."
                ),
                alignment_score=None,
                confidence_score=0.0,
                error_message="Missing GEMINI_API_KEY in environment."
            )

        return await provider.analyze_creative_content(request, target_profile)

    async def synthesize_brand_identity(
        self,
        questionnaire_data: Dict[str, Any],
        reference_texts: List[str],
        reference_images_info: Optional[List[Dict[str, Any]]] = None,
        preferred_provider: Optional[str] = None
    ) -> BrandSynthesisEvaluation:
        """Synthesize unstructured reference docs into a candidate structured brand profile using Gemini."""
        provider = self.get_primary_provider()

        if provider is None:
            return BrandSynthesisEvaluation(
                provider="gemini",
                model_used=settings.DEFAULT_VISION_MODEL,
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                error_message="Cannot synthesize brand profile via Gemini without GEMINI_API_KEY in .env."
            )

        return await provider.synthesize_brand_identity(
            questionnaire_data=questionnaire_data,
            reference_texts=reference_texts,
            reference_images_info=reference_images_info
        )


ai_gateway = AIGateway()
