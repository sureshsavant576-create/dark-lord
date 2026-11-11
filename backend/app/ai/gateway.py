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
from backend.app.ai.groq_provider import GroqProvider
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class AIGateway:
    """
    Unified AI Gateway orchestrating multiple cloud and vision providers.
    Supports Google Gemini API, Groq Cloud API, and graceful fallbacks with retries.
    """

    def __init__(self):
        self.providers: Dict[str, AIProviderBase] = {
            "gemini": GeminiProvider(),
            "groq": GroqProvider(),
        }

    def get_provider(self, name: str = "gemini") -> Optional[AIProviderBase]:
        key = name.lower().strip() if name else "gemini"
        return self.providers.get(key) or self.providers.get("gemini")

    def get_primary_provider(self, preferred: Optional[str] = None) -> Optional[AIProviderBase]:
        if preferred:
            pref_key = preferred.lower().strip()
            if pref_key in self.providers and self.providers[pref_key].is_configured():
                return self.providers[pref_key]

        if self.providers["gemini"].is_configured():
            return self.providers["gemini"]
        if self.providers["groq"].is_configured():
            return self.providers["groq"]
        return None

    def get_status(self) -> Dict[str, Any]:
        return {
            "gemini": {
                "configured": self.providers["gemini"].is_configured(),
                "provider": "gemini",
                "model": settings.DEFAULT_VISION_MODEL,
                "role": "Multimodal Vision, Audio & Tone Reasoning (Primary)"
            },
            "groq": {
                "configured": self.providers["groq"].is_configured(),
                "provider": "groq",
                "model": settings.GROQ_VISION_MODEL,
                "role": "Cloud-hosted vision-capable model (Llama 3.2 Vision Preview)"
            }
        }

    async def analyze_creative_content(
        self,
        request: ContentAnalysisRequest,
        target_profile: Dict[str, Any],
        preferred_provider: Optional[str] = None
    ) -> MultimodalEvaluation:
        provider = self.get_primary_provider(preferred=preferred_provider)

        if provider is None:
            active_name = preferred_provider or "gemini"
            return MultimodalEvaluation(
                provider=active_name,
                model_used=settings.DEFAULT_VISION_MODEL if active_name == "gemini" else settings.GROQ_VISION_MODEL,
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                detailed_analysis=(
                    "AI Provider is unconfigured. Deterministic checks (CIELAB color delta, "
                    "disallowed terminology, resolution/audio specs, contrast ratios) completed successfully. "
                    "To enable multimodal visual understanding and tone analysis, provide "
                    "GEMINI_API_KEY or GROQ_API_KEY in your environment."
                ),
                alignment_score=None,
                confidence_score=0.0,
                error_message="Missing GEMINI_API_KEY / GROQ_API_KEY in environment."
            )

        return await provider.analyze_creative_content(request, target_profile)

    async def synthesize_brand_identity(
        self,
        questionnaire_data: Dict[str, Any],
        reference_texts: List[str],
        reference_images_info: Optional[List[Dict[str, Any]]] = None,
        preferred_provider: Optional[str] = None
    ) -> BrandSynthesisEvaluation:
        provider = self.get_primary_provider(preferred=preferred_provider)

        if provider is None:
            active_name = preferred_provider or "gemini"
            return BrandSynthesisEvaluation(
                provider=active_name,
                model_used=settings.DEFAULT_VISION_MODEL if active_name == "gemini" else settings.GROQ_VISION_MODEL,
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                error_message=f"Cannot synthesize brand profile without GEMINI_API_KEY or GROQ_API_KEY in environment."
            )

        return await provider.synthesize_brand_identity(
            questionnaire_data=questionnaire_data,
            reference_texts=reference_texts,
            reference_images_info=reference_images_info
        )


ai_gateway = AIGateway()
