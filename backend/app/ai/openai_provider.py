import base64
import json
import logging
from typing import Any, Dict, List, Optional
from openai import OpenAI

from backend.app.ai.base import (
    AIProviderBase,
    BrandSynthesisEvaluation,
    ContentAnalysisRequest,
    MultimodalEvaluation,
    ProviderStatus,
)
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

class OpenAIProvider(AIProviderBase):

    def __init__(self, api_key: Optional[str] = None, model_name: str = "gpt-4o-mini"):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.model_name = model_name
        self._client: Optional[OpenAI] = None

    def provider_name(self) -> str:
        return "openai"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _get_client(self) -> OpenAI:
        if not self.is_configured():
            raise ValueError("OPENAI_API_KEY is not configured.")
        if self._client is None:
            self._client = OpenAI(api_key=self.api_key)
        return self._client

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
                detailed_analysis="OpenAI API is not configured. Provide OPENAI_API_KEY in .env to enable OpenAI inspections.",
                error_message="Missing OPENAI_API_KEY"
            )

        try:
            client = self._get_client()
            content_payload: List[Dict[str, Any]] = []

            if request.file_path and request.file_path.exists() and request.mime_type.startswith("image/"):
                b64 = base64.b64encode(request.file_path.read_bytes()).decode("utf-8")
                content_payload.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{request.mime_type};base64,{b64}"}
                })

            prompt_text = f"""
Compare the submitted creative material against the approved company brand profile:

Approved Profile:
- Personality: {target_profile.get('personality')}
- Mood: {target_profile.get('mood')}
- Tone: {target_profile.get('tone')}
- Visual Style: {target_profile.get('visual_style')}
- Approved Colors: {target_profile.get('palette')}
- Avoidances: {target_profile.get('disallowed_elements')}

Submission Info:
- Extracted Text: {request.extracted_text or 'None'}
- Extracted Colors: {request.extracted_colors or 'None'}

Return ONLY valid JSON matching:
{{
  "mood_detected": "<detected mood>",
  "personality_detected": "<detected personality>",
  "tone_detected": "<detected tone>",
  "visual_style_detected": "<detected style>",
  "target_audience_alignment": "<fit>",
  "detailed_analysis": "<rationale>",
  "mismatches_identified": ["<list of discrepancies>"],
  "alignment_score": <number 0-100>,
  "confidence_score": <number 0-1>
}}
"""
            content_payload.append({"type": "text", "text": prompt_text})

            response = client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": content_payload}],
                response_format={"type": "json_object"},
                temperature=0.2
            )

            raw_text = response.choices[0].message.content or "{}"
            data = json.loads(raw_text)

            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.OPERATIONAL,
                is_ai_generated=True,
                mood_detected=str(data.get("mood_detected", "Unknown")),
                personality_detected=str(data.get("personality_detected", "Unknown")),
                tone_detected=str(data.get("tone_detected", "Unknown")),
                visual_style_detected=str(data.get("visual_style_detected", "Unknown")),
                target_audience_alignment=str(data.get("target_audience_alignment", "Unknown")),
                detailed_analysis=str(data.get("detailed_analysis", "")),
                mismatches_identified=list(data.get("mismatches_identified", [])),
                alignment_score=float(data.get("alignment_score", 50.0)),
                confidence_score=float(data.get("confidence_score", 0.85))
            )

        except Exception as exc:
            logger.error("OpenAI inspection error: %s", exc)
            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.ERROR,
                is_ai_generated=False,
                detailed_analysis="OpenAI API execution encountered an error.",
                error_message=str(exc)
            )

    async def synthesize_brand_identity(
        self,
        questionnaire_data: Dict[str, Any],
        reference_texts: List[str],
        reference_images_info: Optional[List[Dict[str, Any]]] = None
    ) -> BrandSynthesisEvaluation:
        if not self.is_configured():
            return BrandSynthesisEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                error_message="Missing OPENAI_API_KEY. Configure in .env to synthesize brand profiles via OpenAI."
            )

        try:
            client = self._get_client()
            reference_combined = "\n\n--- REFERENCE DOC ---\n\n".join(reference_texts[:5])

            prompt = f"""
Synthesize the company onboarding questionnaire answers and reference text into a structured brand profile.
Questionnaire: {json.dumps(questionnaire_data)}
Reference Material: {reference_combined}

Return ONLY valid JSON matching:
{{
  "brand_personality": ["traits"],
  "brand_mood": ["moods"],
  "communication_tone": ["tones"],
  "visual_style": ["styles"],
  "target_audience": "description",
  "key_values": ["values"],
  "disallowed_elements": ["avoidances"],
  "suggested_palette": ["#HEX"],
  "confidence_score": 0.85,
  "raw_explanation": "summary of synthesis"
}}
"""
            response = client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.2
            )

            data = json.loads(response.choices[0].message.content or "{}")
            return BrandSynthesisEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.OPERATIONAL,
                is_ai_generated=True,
                brand_personality=list(data.get("brand_personality", [])),
                brand_mood=list(data.get("brand_mood", [])),
                communication_tone=list(data.get("communication_tone", [])),
                visual_style=list(data.get("visual_style", [])),
                target_audience=str(data.get("target_audience", "")),
                key_values=list(data.get("key_values", [])),
                disallowed_elements=list(data.get("disallowed_elements", [])),
                suggested_palette=list(data.get("suggested_palette", [])),
                confidence_score=float(data.get("confidence_score", 0.85)),
                raw_explanation=str(data.get("raw_explanation", ""))
            )

        except Exception as exc:
            logger.error("OpenAI brand synthesis error: %s", exc)
            return BrandSynthesisEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.ERROR,
                is_ai_generated=False,
                error_message=str(exc)
            )
