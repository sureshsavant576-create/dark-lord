from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.ai.base import ContentAnalysisRequest, ProviderStatus
from backend.app.ai.gateway import ai_gateway
from backend.app.models.brand import BrandProfile
from backend.app.services.brand_service import brand_service

logger = logging.getLogger(__name__)


class CopilotChatRequest(BaseModel):
    brand_id: str
    message: str
    inspection_id: Optional[str] = None
    copy_text: Optional[str] = None
    discrepancies: List[str] = Field(default_factory=list)
    prohibited_claims: List[str] = Field(default_factory=list)
    history: List[Dict[str, str]] = Field(default_factory=list)


class CopilotChatResponse(BaseModel):
    reply: str
    suggested_rewrites: List[str] = Field(default_factory=list)
    palette_recommendations: List[str] = Field(default_factory=list)
    quick_prompts: List[str] = Field(default_factory=list)
    brand_name: str
    brand_persona: str


class BrandCopilotService:
    def __init__(self, brand_svc=None, gateway=None):
        self.brand_service = brand_svc or brand_service
        self.ai_gateway = gateway or ai_gateway

    async def chat(self, req: CopilotChatRequest) -> CopilotChatResponse:
        brand = self.brand_service.get_brand_profile(req.brand_id)
        if not brand:
            raise ValueError(f"Brand '{req.brand_id}' not found.")

        brand_name = brand.brand_name
        tone_str = ", ".join(brand.communication_tone or ["Professional", "Direct"])
        personality_str = ", ".join(brand.personality or ["Authoritative", "Modern"])
        palette_str = ", ".join(brand.approved_palette or [])
        avoid_str = ", ".join(brand.disallowed_elements or [])
        mission = brand.mission_statement or f"To be the leader in {brand_name}'s market."

        persona_desc = f"{brand_name} Brand Guardian ({tone_str})"

        reply_text = ""
        suggested_rewrites = []

        try:
            # Construct analysis request with conversational query
            brand_dict = brand.model_dump()
            brand_dict["strict_avoidances"] = brand.disallowed_elements or []
            brand_dict["approved_palette"] = brand.approved_palette or []

            combined_text = (
                f"User Question: {req.message}\n"
                f"Current Ad Copy: {req.copy_text or 'None'}\n"
                f"Discrepancies: {', '.join(req.discrepancies) if req.discrepancies else 'None'}\n"
                f"Prohibited Claims: {', '.join(req.prohibited_claims) if req.prohibited_claims else 'None'}"
            )

            ai_req = ContentAnalysisRequest(
                extracted_text=combined_text,
                extracted_colors=brand.approved_palette or []
            )

            eval_res = await self.ai_gateway.analyze_creative_content(
                request=ai_req,
                target_profile=brand_dict
            )

            if eval_res and eval_res.status == ProviderStatus.OPERATIONAL and eval_res.summary:
                reply_text, suggested_rewrites = self._parse_ai_reply(eval_res.summary)
        except Exception as exc:
            logger.debug("AI Gateway analysis call for copilot chat used fallback: %s", exc)

        # Fallback if AI response was empty or failed
        if not reply_text:
            reply_text, suggested_rewrites = self._generate_fallback_response(brand, req)

        quick_prompts = [
            f"Suggest 3 headlines in {brand_name}'s voice",
            "How do I fix the color palette discrepancy?",
            f"Draft an Instagram caption aligned with {brand_name}",
            "Explain step-by-step how to pass brand certification"
        ]

        return CopilotChatResponse(
            reply=reply_text,
            suggested_rewrites=suggested_rewrites,
            palette_recommendations=brand.approved_palette or [],
            quick_prompts=quick_prompts[:3],
            brand_name=brand_name,
            brand_persona=persona_desc
        )

    def _parse_ai_reply(self, raw_text: str) -> tuple[str, List[str]]:
        lines = raw_text.splitlines()
        rewrites = []
        clean_lines = []

        for line in lines:
            line_stripped = line.strip()
            if any(line_stripped.upper().startswith(f"REWRITE {i}:") or line_stripped.upper().startswith(f"REWRITE {i} :") for i in (1, 2, 3)):
                rewrites.append(line_stripped.split(":", 1)[1].strip().strip('"').strip("'"))
            else:
                clean_lines.append(line)

        clean_reply = "\n".join(clean_lines).strip()
        return clean_reply or raw_text, rewrites

    def _generate_fallback_response(self, brand: BrandProfile, req: CopilotChatRequest) -> tuple[str, List[str]]:
        brand_name = brand.brand_name
        personality = brand.personality[0] if brand.personality else "Bold"
        palette = brand.approved_palette or ["#111111", "#FFFFFF"]

        if req.prohibited_claims or req.discrepancies:
            reply = (
                f"As the {brand_name} Brand Guardian, I reviewed your submission. "
                f"Your asset triggered brand policy flags due to non-approved phrasing or color shifts. "
                f"Our standards demand a {personality.lower()} and authentic voice. "
                f"Here are 3 pre-certified copy alternatives that embody our core principles while steering clear of banned claims:"
            )
            base_idea = req.copy_text or "Engineered for uncompromising performance and modern excellence."
            cleaned = base_idea
            for avoid in (brand.disallowed_elements or []):
                cleaned = cleaned.replace(avoid, "")

            clean_seed = cleaned.strip() or "Find your greatness"
            rewrites = [
                f"{clean_seed}. Find your true potential.",
                f"Built with authentic purpose: {clean_seed}.",
                f"Unrivaled quality and precision, crafted the {brand_name} way."
            ]
        elif "COLOR" in req.message.upper() or "PALETTE" in req.message.upper():
            reply = (
                f"For {brand_name}, all creative assets must adhere strictly to our approved palette: "
                f"{', '.join(palette)}. Make sure primary graphic accents match our target centroids to pass CIELAB perceptual thresholds (ΔE < 15.0)."
            )
            rewrites = []
        else:
            reply = (
                f"Hello from the {brand_name} Brand Co-Pilot. Our brand identity stands for {', '.join(brand.personality or ['authenticity', 'boldness'])}. "
                f"I'm here to guide your creative toward 100% brand certification. Ask me to rewrite headlines, align visual tones, or fix color discrepancies."
            )
            rewrites = [
                f"Lead the journey with {brand_name}.",
                f"Precision craftsmanship, uncompromising quality.",
                f"Designed to empower every step of the way."
            ]

        return reply, rewrites


brand_copilot_service = BrandCopilotService()
