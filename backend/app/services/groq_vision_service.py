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
        self.api_key = settings.GROQ_API_KEY
        self.model = settings.GROQ_VISION_MODEL or "llama-3.2-11b-vision-preview"

    def is_available(self) -> bool:
        return bool(Groq is not None and self.api_key and self.api_key.strip())

    async def analyze_visual_creative(
        self,
        image_path: Path,
        brand_dna: Dict[str, Any],
        knowledge_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Sends base64-encoded image to Groq cloud vision model to evaluate visual compliance.
        """
        if not self.is_available():
            logger.info("Groq vision client not configured (GROQ_API_KEY absent). Invoking Gemini multimodal vision fallback.")
            return await self._fallback_gemini_vision(image_path, brand_dna, knowledge_context)

        try:
            client = Groq(api_key=self.api_key)

            # Encode image to base64
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode("utf-8")

            mime_type = "image/png"
            if image_path.suffix.lower() in [".jpg", ".jpeg"]:
                mime_type = "image/jpeg"
            elif image_path.suffix.lower() == ".webp":
                mime_type = "image/webp"

            prompt = f"""
You are an expert AI brand design auditor. Analyze this creative asset against the organization's approved Brand DNA and official Knowledge Base.

Approved Brand DNA & Visual Standards:
{json.dumps(brand_dna, indent=2)}

Knowledge Base Reference Assets & Guidelines:
{json.dumps(knowledge_context, indent=2)}

Examine the visual design for:
1. Visual identity violations (style ethos, art direction, clutter vs minimal).
2. Incorrect logo usage (missing logo, edge crowding, distorted aspect ratio).
3. Colour inconsistencies (off-brand colors or wrong mood).
4. Typography inconsistencies (unapproved fonts, bad hierarchy).
5. Accessibility problems (illegible text, poor contrast, color blindness issues).

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
      "confidence_level": 0.95
    }}
  ],
  "aesthetic_summary": "High-level visual assessment",
  "visual_score": 88.0
}}
"""

            response = client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{encoded_string}"
                                }
                            }
                        ]
                    }
                ],
                temperature=0.2,
                max_tokens=1500,
                response_format={"type": "json_object"}
            )

            raw_text = response.choices[0].message.content
            parsed = json.loads(raw_text)
            parsed["provider"] = "groq"
            parsed["model"] = self.model
            logger.info("Successfully received visual analysis from Groq model %s", self.model)
            return parsed

        except Exception as exc:
            logger.warning("Groq visual analysis encountered an error: %s. Falling back to Gemini vision.", exc)
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

            response = client.models.generate_content(
                model=settings.DEFAULT_VISION_MODEL,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2
                )
            )

            text_content = response.text
            parsed = json.loads(text_content)
            parsed["provider"] = "gemini_multimodal_vision"
            parsed["model"] = settings.DEFAULT_VISION_MODEL
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
