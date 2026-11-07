import logging
from typing import Any, Dict, List, Optional
import httpx

from backend.app.ai.base import (
    AIProviderBase,
    BrandSynthesisEvaluation,
    ContentAnalysisRequest,
    MultimodalEvaluation,
    ProviderStatus,
)
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

class HuggingFaceProvider(AIProviderBase):

    HF_API_BASE = "https://api-inference.huggingface.co/models"
    DEFAULT_SENTIMENT_MODEL = "distilbert-base-uncased-finetuned-sst-2-english"

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self.api_key = api_key or settings.HUGGINGFACE_API_KEY
        self.model_name = model_name or self.DEFAULT_SENTIMENT_MODEL

    def provider_name(self) -> str:
        return "huggingface"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    async def analyze_creative_content(
        self,
        request: ContentAnalysisRequest,
        target_profile: Dict[str, Any]
    ) -> MultimodalEvaluation:
        if not self.is_configured():
            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                detailed_analysis="Hugging Face Inference API is not configured. Set HUGGINGFACE_API_KEY in .env.",
                error_message="Missing HUGGINGFACE_API_KEY"
            )

        if not request.extracted_text:
            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.OPERATIONAL,
                is_ai_generated=True,
                detailed_analysis="No text content provided for Hugging Face NLP tone analysis.",
                confidence_score=1.0
            )

        try:
            url = f"{self.HF_API_BASE}/{self.model_name}"
            headers = {"Authorization": f"Bearer {self.api_key}"}
            payload = {"inputs": request.extracted_text[:1000]}

            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()

            scores = data[0] if isinstance(data, list) and data and isinstance(data[0], list) else []
            top_prediction = max(scores, key=lambda x: x.get("score", 0.0)) if scores else {}

            detected_label = top_prediction.get("label", "NEUTRAL")
            detected_confidence = float(top_prediction.get("score", 0.5))

            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.OPERATIONAL,
                is_ai_generated=True,
                tone_detected=detected_label,
                detailed_analysis=f"Hugging Face NLP model classified text sentiment as {detected_label} with confidence {detected_confidence:.2f}.",
                confidence_score=detected_confidence,
                alignment_score=85.0 if detected_label == "POSITIVE" else 45.0
            )

        except Exception as exc:
            logger.error("Hugging Face API error: %s", exc)
            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.ERROR,
                is_ai_generated=False,
                error_message=str(exc)
            )

    async def synthesize_brand_identity(
        self,
        questionnaire_data: Dict[str, Any],
        reference_texts: List[str],
        reference_images_info: Optional[List[Dict[str, Any]]] = None
    ) -> BrandSynthesisEvaluation:
        return BrandSynthesisEvaluation(
            provider=self.provider_name(),
            model_used=self.model_name,
            status=ProviderStatus.UNCONFIGURED if not self.is_configured() else ProviderStatus.OPERATIONAL,
            is_ai_generated=False,
            error_message="Multi-document brand identity synthesis is handled by primary multimodal providers (Gemini / OpenAI)."
        )
