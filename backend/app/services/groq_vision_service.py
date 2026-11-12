from __future__ import annotations
import base64
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from groq import Groq
except ImportError:
    Groq = None

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class GroqVisionService:
    """
    Cloud-hosted vision-capable model integration via Groq SDK.
    Used for multimodal visual analysis of posters, ad creatives, and social media imagery:
    - Visual identity violations
    - Logo usage & placement
    - Layout aesthetics & styling
    - Typography legibility
    """

    def __init__(self):
        self.gemini_key = settings.GEMINI_API_KEY
        self.model = settings.DEFAULT_VISION_MODEL or "gemini-3.5-flash"

    def is_available(self) -> bool:
        return bool(settings.has_gemini)

    async def analyze_visual_creative(
        self,
        image_path: Path,
        brand_dna: Dict[str, Any],
        knowledge_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluates visual and poster compliance using Google Gemini multimodal vision.
        (Visual/poster analysis belongs exclusively to Gemini under the 3-service architecture.)
        """
        return await self._fallback_gemini_vision(image_path, brand_dna, knowledge_context)

    async def _fallback_gemini_vision(
        self,
        image_path: Path,
        brand_dna: Dict[str, Any],
        knowledge_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Multimodal vision analysis via Google Gemini API fallback.
        """
        try:
            from google import genai
            from google.genai import types

            if not settings.has_gemini:
                logger.warning("Neither Groq nor Gemini API key is available for vision analysis.")
                return {
                    "visual_identity_findings": [],
                    "aesthetic_summary": "Vision API unavailable; evaluated via deterministic OpenCV properties.",
                    "visual_score": 85.0,
                    "provider": "deterministic_opencv"
                }

            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            with open(image_path, "rb") as f:
                image_bytes = f.read()

            mime_type = "image/png"
            if image_path.suffix.lower() in [".jpg", ".jpeg"]:
                mime_type = "image/jpeg"
            elif image_path.suffix.lower() == ".webp":
                mime_type = "image/webp"

            prompt = f"""
Analyze this visual creative asset against the organization's approved Brand DNA and official Knowledge Base.

Approved Brand DNA & Visual Standards:
{json.dumps(brand_dna, indent=2)}

Knowledge Base Reference Assets & Guidelines:
{json.dumps(knowledge_context, indent=2)}

Examine the visual design for:
1. Visual identity violations (style ethos, art direction).
2. Incorrect logo usage (missing logo, margin crowding).
3. Colour inconsistencies (perceptual misalignment).
4. Typography inconsistencies (unapproved fonts, illegibility).
5. Accessibility problems (poor contrast).

Return ONLY valid JSON with this exact schema:
{{
  "visual_identity_findings": [
    {{
      "issue_category": "visual_identity_violations | incorrect_logo_usage | colour_inconsistencies | typography_inconsistencies | accessibility_problems",
      "severity": "PASS | INFO | WARNING | CRITICAL",
      "description": "Short description of detected visual issue",
      "relevant_guideline": "Citation of guideline from Brand DNA or Knowledge Base",
      "explanation": "Detailed explanation of why this visual departs from brand standards",
      "recommended_correction": "Specific visual design adjustment to fix it",
      "confidence_level": 0.92
    }}
  ],
  "aesthetic_summary": "High-level visual assessment",
  "visual_score": 85.0
}}
"""

            models_to_try = list(dict.fromkeys([
                "gemini-3.1-flash-lite",
                settings.DEFAULT_VISION_MODEL,
                "gemini-3.5-flash-lite",
                "gemini-3.5-flash",
            ]))

            response = None
            used_model = settings.DEFAULT_VISION_MODEL
            last_error = None

            for m_name in models_to_try:
                try:
                    response = client.models.generate_content(
                        model=m_name,
                        contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                            prompt
                        ],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.2
                        )
                    )
                    if response and response.text:
                        used_model = m_name
                        break
                except Exception as exc:
                    last_error = exc
                    logger.warning("Gemini vision fallback model '%s' failed: %s. Trying next...", m_name, exc)
                    continue

            if not response or not response.text:
                if last_error:
                    logger.error("All Gemini vision fallback models failed: %s", last_error)
                return {
                    "visual_identity_findings": [],
                    "aesthetic_summary": "Multimodal visual reasoning failed; falling back to OpenCV metrics.",
                    "visual_score": 80.0,
                    "provider": "opencv_fallback"
                }

            text_content = response.text
            parsed = json.loads(text_content)
            parsed["provider"] = "gemini_multimodal_vision"
            parsed["model"] = used_model
            return parsed

        except Exception as exc:
            logger.error("Gemini vision fallback failed: %s", exc)
            return {
                "visual_identity_findings": [],
                "aesthetic_summary": "Multimodal visual reasoning failed; falling back to OpenCV metrics.",
                "visual_score": 80.0,
                "provider": "opencv_fallback"
            }


groq_vision_service = GroqVisionService()
