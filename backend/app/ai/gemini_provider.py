"""BrandShield AI - Google Gemini Multimodal Provider.

Integrates the official Google GenAI SDK for lightweight, fast multimodal inspection
(supporting image, audio, document text, and JSON schema reasoning).
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from google import genai
from google.genai import types

from backend.app.ai.base import (
    AIProviderBase,
    BrandSynthesisEvaluation,
    ContentAnalysisRequest,
    MultimodalEvaluation,
    ProviderStatus,
)
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class GeminiProvider(AIProviderBase):
    """Real AI provider utilizing Google Gemini (gemini-3.5-flash / gemini-3.5-flash-lite) with resilient fallback."""

    FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        raw_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.api_key = raw_key.strip() if raw_key else ""
        self.model_name = model_name or settings.DEFAULT_VISION_MODEL
        self._client: Optional[genai.Client] = None

    def provider_name(self) -> str:
        return "gemini"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _get_client(self) -> genai.Client:
        if not self.is_configured():
            raise ValueError("GEMINI_API_KEY is not configured.")
        if self._client is None:
            self._client = genai.Client(api_key=self.api_key.strip())
        return self._client

    def _generate_with_fallback(self, contents: Any) -> Tuple[str, str]:
        """Try primary model; if temporary 503/404 occurs, automatically try candidate models."""
        client = self._get_client()
        models_to_try = [self.model_name] + [m for m in self.FALLBACK_MODELS if m != self.model_name]
        last_error = None

        for model in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                    )
                )
                if response and response.text:
                    return response.text, model
            except Exception as exc:
                last_error = exc
                logger.warning("Gemini model '%s' call failed: %s. Trying fallback...", model, exc)
                continue

        raise last_error or RuntimeError("All Gemini model attempts failed.")

    async def analyze_creative_content(
        self,
        request: ContentAnalysisRequest,
        target_profile: Dict[str, Any]
    ) -> MultimodalEvaluation:
        """Inspect creative content (image, audio, document) against target brand profile."""
        if not self.is_configured():
            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                detailed_analysis="Gemini API is not configured. Provide GEMINI_API_KEY in .env for live multimodal AI inspection.",
                error_message="Missing GEMINI_API_KEY"
            )

        try:
            client = self._get_client()
            contents: List[Any] = []

            # Attach media file if present on disk
            if request.file_path and request.file_path.exists():
                file_bytes = request.file_path.read_bytes()
                contents.append(types.Part.from_bytes(data=file_bytes, mime_type=request.mime_type))

            # Build structured evaluation prompt
            prompt_text = f"""
You are the BrandShield AI inspection engine. Inspect the submitted creative material against the company's approved brand identity.

### APPROVED COMPANY BRAND PROFILE:
- Brand Name: {target_profile.get('brand_name', 'Company')}
- Personality: {target_profile.get('personality', 'Not specified')}
- Mood: {target_profile.get('mood', 'Not specified')}
- Communication Tone: {target_profile.get('tone', 'Not specified')}
- Visual Style: {target_profile.get('visual_style', 'Not specified')}
- Approved Colors: {target_profile.get('palette', [])}
- Target Audience: {target_profile.get('target_audience', 'General audience')}
- Disallowed Elements / Strict Avoidances: {target_profile.get('disallowed_elements', [])}

### EXTRACTED CONTENT FEATURES FROM SUBMISSION:
- MIME Type: {request.mime_type}
- Extracted Text/Copy: {request.extracted_text or 'None extracted'}
- Extracted Dominant Colors: {request.extracted_colors or 'None'}

### YOUR TASK:
Analyze the submitted creative content in detail. Compare its mood, personality, tone, visual aesthetics, and audience alignment with the approved brand profile.

Return ONLY a valid JSON object matching the following structure:
{{
  "mood_detected": "<detected mood>",
  "personality_detected": "<detected personality>",
  "tone_detected": "<detected communication tone>",
  "visual_style_detected": "<detected visual or audio style>",
  "target_audience_alignment": "<assessment of audience fit>",
  "detailed_analysis": "<objective explanation of why the content aligns or diverges>",
  "mismatches_identified": ["<list of specific off-brand elements or guideline divergences>"],
  "alignment_score": <number from 0.0 to 100.0 based on degree of alignment>,
  "confidence_score": <number from 0.0 to 1.0 indicating model confidence>
}}
"""
            contents.append(prompt_text)

            # Call Gemini with resilient automatic fallback
            raw_text, used_model = self._generate_with_fallback(contents)

            # Parse JSON safely
            try:
                response_data = json.loads(raw_text)
            except Exception:
                json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
                response_data = json.loads(json_match.group(0)) if json_match else {}

            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=used_model,
                status=ProviderStatus.OPERATIONAL,
                is_ai_generated=True,
                mood_detected=str(response_data.get("mood_detected", "Unknown")),
                personality_detected=str(response_data.get("personality_detected", "Unknown")),
                tone_detected=str(response_data.get("tone_detected", "Unknown")),
                visual_style_detected=str(response_data.get("visual_style_detected", "Unknown")),
                target_audience_alignment=str(response_data.get("target_audience_alignment", "Unknown")),
                detailed_analysis=str(response_data.get("detailed_analysis", "")),
                mismatches_identified=list(response_data.get("mismatches_identified", [])),
                alignment_score=float(response_data.get("alignment_score", 50.0)),
                confidence_score=float(response_data.get("confidence_score", 0.85))
            )

        except Exception as exc:
            logger.error("Gemini inspection error: %s", exc)
            return MultimodalEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.ERROR,
                is_ai_generated=False,
                detailed_analysis="AI inspection failed during API execution.",
                error_message=str(exc)
            )

    async def synthesize_brand_identity(
        self,
        questionnaire_data: Dict[str, Any],
        reference_texts: List[str],
        reference_images_info: Optional[List[Dict[str, Any]]] = None
    ) -> BrandSynthesisEvaluation:
        """Synthesize questionnaire and reference guidelines into a candidate structured brand profile."""
        if not self.is_configured():
            return BrandSynthesisEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.UNCONFIGURED,
                is_ai_generated=False,
                error_message="Missing GEMINI_API_KEY. Configure in .env to synthesize brand profiles via AI."
            )

        try:
            client = self._get_client()
            reference_combined = "\n\n--- REFERENCE DOC ---\n\n".join(reference_texts[:5])

            prompt = f"""
You are the BrandShield AI Brand Intelligence Engine.
Analyze the company's onboarding questionnaire answers and uploaded reference document excerpts to synthesize a unified, structured Brand Profile.

### QUESTIONNAIRE RESPONSES:
{json.dumps(questionnaire_data, indent=2)}

### EXTRACTED REFERENCE MATERIAL:
{reference_combined or 'No additional reference text provided.'}

### INSTRUCTIONS:
Extract and synthesize the brand's true identity. Do NOT invent missing values.
Return ONLY a valid JSON object matching this schema:
{{
  "brand_personality": ["list of personality traits, e.g. 'Youthful', 'Innovative'"],
  "brand_mood": ["list of emotional vibes, e.g. 'Energetic', 'Optimistic'"],
  "communication_tone": ["list of communication tones, e.g. 'Friendly', 'Direct'"],
  "visual_style": ["list of visual rules, e.g. 'Minimalist', 'Flat Design', 'High Contrast'"],
  "target_audience": "Concise description of the target demographic",
  "key_values": ["Core brand values"],
  "disallowed_elements": ["Specific concepts, terms, tones, or aesthetics to strictly avoid"],
  "suggested_palette": ["List of representative HEX colors if mentioned, e.g. '#0055FF'"],
  "confidence_score": <number between 0.0 and 1.0>,
  "raw_explanation": "A concise explanation of how this profile was synthesized from the questionnaire and reference material."
}}
"""
            raw_text, used_model = self._generate_with_fallback(prompt)

            try:
                data = json.loads(raw_text)
            except Exception:
                json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
                data = json.loads(json_match.group(0)) if json_match else {}

            return BrandSynthesisEvaluation(
                provider=self.provider_name(),
                model_used=used_model,
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
                confidence_score=float(data.get("confidence_score", 0.9)),
                raw_explanation=str(data.get("raw_explanation", ""))
            )

        except Exception as exc:
            logger.error("Gemini brand synthesis error: %s", exc)
            return BrandSynthesisEvaluation(
                provider=self.provider_name(),
                model_used=self.model_name,
                status=ProviderStatus.ERROR,
                is_ai_generated=False,
                error_message=str(exc)
            )
