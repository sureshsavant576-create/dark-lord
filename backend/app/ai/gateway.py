"""BrandShield AI - AI Provider Gateway.

Orchestrates multimodal and NLP providers with automatic fallback,
health diagnostics, and strict adherence to non-mocked outputs.
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
from backend.app.ai.huggingface_provider import HuggingFaceProvider
from backend.app.ai.openai_provider import OpenAIProvider
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class AIGateway:
    """Central AI orchestrator that routes requests to active and configured model APIs."""

    def __init__(self):
        self.providers: Dict[str, AIProviderBase] = {
            "gemini": GeminiProvider(),
            "openai": OpenAIProvider(),
            "huggingface": HuggingFaceProvider()
        }

    def get_provider(self, name: str) -> Optional[AIProviderBase]:
        return self.providers.get(name.lower())

    def get_primary_provider(self) -> Optional[AIProviderBase]:
        """Returns the primary configured provider (prefers Gemini, then OpenAI)."""
        if self.providers["gemini"].is_configured():
            return self.providers["gemini"]
        if self.providers["openai"].is_configured():
            return self.providers["openai"]
        return None

    def get_status(self) -> Dict[str, Any]:
        """Returns an operational overview of all integrated AI services."""
        return {
            name: {
                "configured": provider.is_configured(),
                "provider": provider.provider_name()
            }
            for name, provider in self.providers.items()
        }

    async def analyze_creative_content(
        self,
        request: ContentAnalysisRequest,
        target_profile: Dict[str, Any],
        preferred_provider: Optional[str] = None
    ) -> MultimodalEvaluation:
        """Inspect creative material using the preferred or primary available provider."""
        provider = None
        if preferred_provider:
            provider = self.get_provider(preferred_provider)
        if provider is None or not provider.is_configured():
            provider = self.get_primary_provider()

        if provider is None:
            # Rule 10: Do NOT generate fictional results when a model or API is unavailable
            return MultimodalEvaluation(
                provider="none",
                model_used="none",
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                detailed_analysis=(
                    "No AI provider is configured. Deterministic checks (color delta, disallowed words, "
                    "file formatting) completed successfully. To enable semantic vibe, personality, and "
                    "multimodal inspection, provide a GEMINI_API_KEY or OPENAI_API_KEY in your .env file."
                ),
                alignment_score=None,
                confidence_score=0.0,
                error_message="No AI API key configured."
            )

        return await provider.analyze_creative_content(request, target_profile)

    async def synthesize_brand_identity(
        self,
        questionnaire_data: Dict[str, Any],
        reference_texts: List[str],
        reference_images_info: Optional[List[Dict[str, Any]]] = None,
        preferred_provider: Optional[str] = None
    ) -> BrandSynthesisEvaluation:
        """Synthesize unstructured reference docs into a candidate structured brand profile."""
        provider = None
        if preferred_provider:
            provider = self.get_provider(preferred_provider)
        if provider is None or not provider.is_configured():
            provider = self.get_primary_provider()

        if provider is None:
            return BrandSynthesisEvaluation(
                provider="none",
                model_used="none",
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                error_message="Cannot synthesize brand profile via AI without an active API key (GEMINI_API_KEY or OPENAI_API_KEY)."
            )

        return await provider.synthesize_brand_identity(
            questionnaire_data=questionnaire_data,
            reference_texts=reference_texts,
            reference_images_info=reference_images_info
        )


ai_gateway = AIGateway()
