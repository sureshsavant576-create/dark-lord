import base64
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from groq import AsyncGroq

from backend.app.ai.base import (
    AIProviderBase,
    BrandSynthesisEvaluation,
    ContentAnalysisRequest,
    MultimodalEvaluation,
    ProviderStatus,
)
from backend.app.core.config import settings
from backend.app.core.resilience import (
    is_rate_limit_error,
    retry_with_backoff,
    validate_ai_json_output,
)
from backend.app.ai.gemini_provider import sanitize_for_prompt

logger = logging.getLogger(__name__)


class GroqProvider(AIProviderBase):
    """
    Modular AI Provider integrating Groq Cloud API for ultra-low latency
    vision and text reasoning (e.g. Llama 3.2 Vision and Llama 3.3).
    Includes automatic retries, rate-limit backoff, timeouts, and JSON validation.
    """

    VISION_FALLBACK_MODELS = [
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
    ]

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None, timeout_seconds: float = 30.0):
        raw_key = api_key if api_key is not None else settings.GROQ_API_KEY
        self.api_key = raw_key.strip() if raw_key else ""
        self.model_name = model_name or settings.GROQ_TEXT_MODEL
        self.timeout_seconds = timeout_seconds
        self._client: Optional[AsyncGroq] = None

    def provider_name(self) -> str:
        return "groq"

    def _inject_provider_metadata(self, raw_text: str, used_model: str) -> str:
        """Ensures parsed LLM JSON carries provider and model_used prior to Pydantic validation."""
        try:
            data = json.loads(raw_text)
            if isinstance(data, dict):
                data.setdefault("provider", self.provider_name())
                data.setdefault("model_used", used_model)
                return json.dumps(data)
        except Exception:
            pass
        return raw_text

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _get_client(self) -> AsyncGroq:
        if not self.is_configured():
            raise ValueError("GROQ_API_KEY is not configured.")
        if self._client is None:
            http_client = httpx.AsyncClient(timeout=httpx.Timeout(self.timeout_seconds, connect=10.0))
            self._client = AsyncGroq(api_key=self.api_key, http_client=http_client, max_retries=0)
        return self._client

    @retry_with_backoff(max_retries=3, initial_delay=1.0, max_delay=10.0)
    async def _chat_completion_with_fallback(
        self,
        messages: List[Dict[str, Any]],
        response_format: Optional[Dict[str, str]] = None,
        is_vision: bool = False
    ) -> Tuple[str, str]:
        """
        Executes a Groq chat completion with model fallback on rate limits or errors.
        """
        client = self._get_client()
        models_to_try = [self.model_name] + [m for m in self.VISION_FALLBACK_MODELS if m != self.model_name]
        last_error = None

        for model in models_to_try:
            try:
                kwargs: Dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "temperature": 0.2,
                }
                if response_format:
                    kwargs["response_format"] = response_format

                response = await client.chat.completions.create(**kwargs)
                if response and response.choices and response.choices[0].message.content:
                    return response.choices[0].message.content, model
            except Exception as exc:
                last_error = exc
                logger.warning("Groq model '%s' call failed: %s. Trying next available model...", model, exc)
                continue

        raise last_error or RuntimeError("All Groq model attempts failed.")

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
                detailed_analysis="Groq API is not configured. Provide GROQ_API_KEY in .env for Groq vision & text analysis.",
                error_message="Missing GROQ_API_KEY"
            )

        try:
            sanitized_user_copy = sanitize_for_prompt(request.extracted_text)

            system_prompt = (
                "You are the BrandShield AI inspection engine powered by Groq. "
                "Analyze submitted creative copy and metadata against approved brand DNA with strict objectivity. "
                "Return ONLY a valid JSON object matching the requested schema."
            )

            prompt_text = f"""
### APPROVED COMPANY BRAND PROFILE:
- Brand Name: {target_profile.get('brand_name', 'Company')}
- Personality: {target_profile.get('personality', 'Not specified')}
- Mood: {target_profile.get('mood', 'Not specified')}
- Communication Tone: {target_profile.get('tone', 'Not specified')}
- Visual Style: {target_profile.get('visual_style', 'Not specified')}
- Approved Colors: {target_profile.get('palette', [])}
- Target Audience: {target_profile.get('target_audience', 'General audience')}
- Disallowed Elements: {target_profile.get('disallowed_elements', [])}

### CREATIVE SUBMISSION DATA:
- MIME Type: {request.mime_type}
- Extracted Copy: {sanitized_user_copy}
- Extracted Colors: {request.extracted_colors or 'None'}

### REQUIRED JSON SCHEMA:
{{
  "mood_detected": "<detected mood>",
  "personality_detected": "<detected personality>",
  "tone_detected": "<detected communication tone>",
  "visual_style_detected": "<detected visual or aesthetic style>",
  "typography_detected": "<detected font style and legibility>",
  "layout_detected": "<detected layout structure and whitespace>",
  "target_audience_alignment": "<assessment of audience fit>",
  "detailed_analysis": "<objective explanation of alignment or divergence>",
  "mismatches_identified": ["<list of specific off-brand elements>"],
  "alignment_score": <number 0.0 to 100.0>,
  "confidence_score": <number 0.0 to 1.0>
}}
"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt_text}
            ]

            raw_text, used_model = await self._chat_completion_with_fallback(
                messages=messages,
                response_format={"type": "json_object"},
                is_vision=False
            )

            enriched_raw = self._inject_provider_metadata(raw_text, used_model)

            validated = validate_ai_json_output(
                enriched_raw,
                MultimodalEvaluation,
                default_factory=lambda: MultimodalEvaluation(
                    provider=self.provider_name(),
                    model_used=used_model,
                    status=ProviderStatus.OPERATIONAL,
                    is_ai_generated=True,
                    detailed_analysis=raw_text[:300] if raw_text else "Analyzed via Groq.",
                    alignment_score=75.0,
                    confidence_score=0.85
                )
            )
            validated.provider = self.provider_name()
            validated.model_used = used_model
            validated.status = ProviderStatus.OPERATIONAL
            validated.is_ai_generated = True

            if validated.alignment_score is not None:
                validated.alignment_score = max(0.0, min(100.0, float(validated.alignment_score)))
            validated.confidence_score = max(0.0, min(1.0, float(validated.confidence_score)))

            return validated

        except Exception as exc:
            status = ProviderStatus.RATE_LIMITED if is_rate_limit_error(exc) else ProviderStatus.ERROR
            logger.error("Groq analyze_creative_content failed: %s", exc)
            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=status,
                is_ai_generated=False,
                detailed_analysis=f"Groq evaluation could not complete: {exc}",
                error_message=str(exc),
                alignment_score=None,
                confidence_score=0.0
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
                error_message="Cannot synthesize brand profile via Groq without GROQ_API_KEY in .env."
            )

        try:
            combined_refs = "\n---\n".join([sanitize_for_prompt(t, 2000) for t in reference_texts[:5]])

            prompt_text = f"""
You are the BrandShield Brand DNA Synthesis Engine powered by Groq.
Synthesize a comprehensive, authoritative brand guideline profile from the provided inputs.

### QUESTIONNAIRE INPUTS:
- Company Name: {questionnaire_data.get('brand_name', 'Brand')}
- Mission / Vision: {questionnaire_data.get('mission', '')}
- Target Audience: {questionnaire_data.get('target_audience', '')}
- Stated Tone: {questionnaire_data.get('tone', '')}
- Colors Preferred: {questionnaire_data.get('colors', [])}

### REFERENCE MATERIALS:
{combined_refs if combined_refs else 'None provided.'}

### OUTPUT JSON SCHEMA:
{{
  "brand_personality": ["trait1", "trait2", "trait3"],
  "brand_mood": ["mood1", "mood2"],
  "communication_tone": ["tone1", "tone2"],
  "visual_style": ["aesthetic guideline 1", "guideline 2"],
  "suggested_typography": ["Primary: Inter", "Secondary: Roboto"],
  "target_audience": "Detailed audience description",
  "key_values": ["value1", "value2"],
  "disallowed_elements": ["avoidance1", "avoidance2"],
  "suggested_palette": ["#HEX1", "#HEX2", "#HEX3"],
  "confidence_score": 0.9,
  "raw_explanation": "Summary of synthesis reasoning"
}}
"""
            messages = [
                {"role": "system", "content": "You are a brand strategy expert AI. Output strict JSON."},
                {"role": "user", "content": prompt_text}
            ]

            raw_text, used_model = await self._chat_completion_with_fallback(
                messages=messages,
                response_format={"type": "json_object"},
                is_vision=False
            )

            enriched_raw = self._inject_provider_metadata(raw_text, used_model)

            validated = validate_ai_json_output(
                enriched_raw,
                BrandSynthesisEvaluation,
                default_factory=lambda: BrandSynthesisEvaluation(
                    provider=self.provider_name(),
                    model_used=used_model,
                    status=ProviderStatus.OPERATIONAL,
                    is_ai_generated=True,
                    target_audience=questionnaire_data.get("target_audience", "General audience"),
                    confidence_score=0.85,
                    raw_explanation="Synthesized via Groq."
                )
            )
            validated.provider = self.provider_name()
            validated.model_used = used_model
            validated.status = ProviderStatus.OPERATIONAL
            validated.is_ai_generated = True

            return validated

        except Exception as exc:
            status = ProviderStatus.RATE_LIMITED if is_rate_limit_error(exc) else ProviderStatus.ERROR
            logger.error("Groq synthesize_brand_identity failed: %s", exc)
            return BrandSynthesisEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=status,
                is_ai_generated=False,
                error_message=f"Groq brand synthesis failed: {exc}"
            )
