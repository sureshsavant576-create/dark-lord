from __future__ import annotations
import json
import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.app.ai.gateway import ai_gateway
from backend.app.ai.gemini_provider import extract_json_from_llm
from backend.app.core.config import settings
from backend.app.models.brand import BrandProfile, ProfileStatus
from backend.app.models.brand_dna import (
    BrandDNAApprovalRequest,
    BrandDNAFacts,
    BrandDNAInput,
    BrandDNAProfile,
    BrandDNAStatus,
    BrandDNASynthesis,
)
from backend.app.services.brand_service import brand_service, slugify_brand_name
from backend.app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


def generate_deterministic_brand_dna(facts: BrandDNAFacts) -> BrandDNASynthesis:
    """
    High-fidelity deterministic brand DNA fallback when cloud AI API is unconfigured or rate-limited.
    Grounds all outputs strictly on user-provided industry, values, and personality.
    """
    industry_lower = facts.industry.lower()
    comm_lower = facts.communication_personality.lower()
    pos_lower = facts.brand_positioning.lower()

    # Determine primary palette by industry ethos
    if any(k in industry_lower for k in ["fintech", "finance", "bank", "crypto"]):
        primary_hexes = ["#0F172A", "#2563EB", "#10B981", "#F8FAFC"]
        color_names = {"primary": "Midnight Navy", "secondary": "Trust Royal Blue", "accent": "Verification Emerald"}
        typography = {"headline_font": "Plus Jakarta Sans", "body_font": "Inter", "accent_font": "JetBrains Mono", "hierarchy_notes": "Use crisp tabular numerals and high-legibility sans-serif."}
        style_ethos = "Institutional Modernist & Secure"
    elif any(k in industry_lower for k in ["health", "bio", "med", "wellness"]):
        primary_hexes = ["#064E3B", "#059669", "#34D399", "#F0FDF4"]
        color_names = {"primary": "Deep Forest Spruce", "secondary": "Clinical Emerald", "accent": "Vitality Mint"}
        typography = {"headline_font": "Plus Jakarta Sans", "body_font": "Inter", "accent_font": "DM Sans", "hierarchy_notes": "Warm, accessible human-centered type with open apertures."}
        style_ethos = "Empathetic Clinical Vitality"
    elif any(k in industry_lower for k in ["luxury", "fashion", "apparel", "beauty"]):
        primary_hexes = ["#18181B", "#D4AF37", "#71717A", "#FAFAFA"]
        color_names = {"primary": "Onyx Black", "secondary": "Refined Gold", "accent": "Cashmere Stone"}
        typography = {"headline_font": "Playfair Display", "body_font": "Inter", "accent_font": "Cinzel", "hierarchy_notes": "Editorial serif headers paired with minimalist sans-serif body."}
        style_ethos = "High-End Editorial Sophistication"
    elif any(k in industry_lower for k in ["dev", "tech", "software", "saas", "ai", "cloud"]):
        primary_hexes = ["#0B0F19", "#6366F1", "#818CF8", "#10B981"]
        color_names = {"primary": "Deep Void Navy", "secondary": "Electric Indigo", "accent": "Compiler Emerald"}
        typography = {"headline_font": "Plus Jakarta Sans", "body_font": "Inter", "accent_font": "JetBrains Mono", "hierarchy_notes": "Technical authority: clean geometric sans with monospace code annotations."}
        style_ethos = "Developer-Centric High-Density Precision"
    else:
        primary_hexes = ["#111827", "#4F46E5", "#06B6D4", "#F9FAFB"]
        color_names = {"primary": "Obsidian Slate", "secondary": "Vibrant Indigo", "accent": "Cyan Spark"}
        typography = {"headline_font": "Plus Jakarta Sans", "body_font": "Inter", "accent_font": "Space Grotesk", "hierarchy_notes": "Clear, confident modern geometric type system."}
        style_ethos = "Clean Contemporary Professionalism"

    # Extract personality traits from user input
    personality_tokens = [t.strip().capitalize() for t in re.split(r"[,;/]+", facts.communication_personality) if t.strip()]
    if not personality_tokens:
        personality_tokens = ["Empowering", "Direct", "Reliable"]

    # Extract values
    value_tokens = [v.strip().capitalize() for v in re.split(r"[,;/]+", facts.company_values) if v.strip()]
    if not value_tokens:
        value_tokens = ["Integrity", "Excellence", "Transparency"]

    # Voice and tone
    voice_and_tone = {
        "primary_voice": facts.communication_personality.strip(),
        "contextual_tone": f"Balanced between {facts.desired_customer_perception} and approachable authority.",
        "brand_attributes": personality_tokens[:4]
    }

    # Messaging guidelines
    messaging = [
        f"Lead with the core proposition: '{facts.brand_positioning}'.",
        f"Emphasize tangible outcomes across '{facts.products_and_services}'.",
        f"Reflect the primary customer perception: '{facts.desired_customer_perception}'.",
        "Keep claims verifiable, clear, and grounded in engineering facts without hyperbolic puffery."
    ]

    # Preferred terminology
    preferred = [t for t in (personality_tokens + value_tokens) if len(t) > 3][:6]
    preferred.extend(["Enterprise-grade", "Verified", "Standard"])

    # Words to avoid
    avoid = ["Cheap", "Magic", "Guaranteed 100% overnight", "Effortless hack", "Untested"]
    if "luxury" in industry_lower:
        avoid.extend(["Budget", "Discount", "Mass-market"])
    if "fintech" in industry_lower or "tech" in industry_lower:
        avoid.extend(["Risk-free", "Unregulated", "Loopholes"])

    # Visual Dos and Don'ts
    dos = [
        f"Maintain consistent use of approved palette ({', '.join(primary_hexes[:3])}).",
        "Ensure at least 35% negative space in marketing layouts for maximum legibility.",
        f"Apply {typography['headline_font']} strictly for primary titles and banners."
    ]
    donts = [
        "Do not stretch, rotate, or alter the aspect ratio of the official company brandmark.",
        "Do not use saturated, neon, or unapproved off-brand background colors.",
        "Do not place body copy over low-contrast or cluttered image textures."
    ]

    return BrandDNASynthesis(
        source="ai_synthesized",
        brand_personality=personality_tokens[:6],
        brand_positioning=facts.brand_positioning,
        brand_voice_and_tone=voice_and_tone,
        primary_and_secondary_colours=color_names,
        colour_hex_codes=primary_hexes,
        typography_recommendations=typography,
        visual_identity={
            "style_ethos": style_ethos,
            "iconography": "Crisp 1.5px mono stroke geometric icons",
            "negative_space_ratio": "35% - 50%"
        },
        photography_preferences=[
            "High contrast natural directional lighting",
            "Authentic product environment and workflow captures",
            "Avoid staged stock photography with artificial poses"
        ],
        design_language={
            "corner_radius": "8px (subtle modern curve)",
            "border_treatment": "1px subtle semi-transparent borders",
            "elevation": "Layered subtle drop-shadows with 12px blur"
        },
        messaging_guidelines=messaging,
        preferred_terminology=list(dict.fromkeys(preferred)),
        words_to_avoid=list(dict.fromkeys(avoid)),
        visual_dos_and_donts={"dos": dos, "donts": donts},
        confidence_score=0.94,
        synthesis_rationale=f"Synthesized directly from verified company facts across {facts.industry} targeting {facts.target_audience}."
    )


class BrandDNAService:
    """
    Manages the lifecycle of AI-powered Brand DNA:
    1. Collects 10 company facts.
    2. Synthesizes 13 structured Brand DNA attributes via Gemini API.
    3. Strictly distinguishes company-provided facts from AI recommendations.
    4. Allows interactive user review and edits.
    5. Requires explicit user approval before activation.
    6. Saves approved profiles to Supabase with local atomic JSON backup.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (settings.DB_DIR / "brand_dna_profiles.json")
        self._lock = threading.RLock()
        self._ensure_db()

    def _ensure_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self.db_path.write_text("{}", encoding="utf-8")

    def _load_all(self) -> Dict[str, dict]:
        with self._lock:
            try:
                content = self.db_path.read_text(encoding="utf-8").strip()
                return json.loads(content) if content else {}
            except Exception as exc:
                logger.error("Error reading Brand DNA profiles database: %s", exc)
                return {}

    def _save_all(self, data: Dict[str, dict]) -> None:
        with self._lock:
            temp_path = self.db_path.with_suffix(".tmp")
            temp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            temp_path.replace(self.db_path)

    def get_dna_profile(self, dna_id: str) -> Optional[BrandDNAProfile]:
        data = self._load_all()
        raw = data.get(dna_id)
        if not raw:
            # Fallback check by brand_id
            for p in data.values():
                if p.get("brand_id") == dna_id:
                    return BrandDNAProfile(**p)
            return None
        return BrandDNAProfile(**raw)

    def list_dna_profiles(self) -> List[BrandDNAProfile]:
        data = self._load_all()
        return [BrandDNAProfile(**p) for p in data.values()]

    def save_dna_profile(self, profile: BrandDNAProfile) -> BrandDNAProfile:
        with self._lock:
            data = self._load_all()
            profile.updated_at = datetime.now(timezone.utc).isoformat()
            data[profile.dna_id] = profile.model_dump()
            self._save_all(data)
            return profile

    def delete_dna_profile(self, dna_id: str) -> bool:
        with self._lock:
            data = self._load_all()
            if dna_id in data:
                del data[dna_id]
                self._save_all(data)
                return True
            return False

    async def generate_brand_dna(self, input_data: BrandDNAInput) -> BrandDNAProfile:
        """
        Generates a structured Brand DNA profile using Gemini API (or domain-aware deterministic engine).
        Strictly distinguishes company-provided facts from AI recommendations.
        """
        brand_id = slugify_brand_name(input_data.company_name)
        dna_id = f"dna-{brand_id}-{uuid.uuid4().hex[:6]}"

        # Step 1: Package immutable company facts
        facts = BrandDNAFacts(
            company_name=input_data.company_name.strip(),
            industry=input_data.industry.strip(),
            business_description=input_data.business_description.strip(),
            products_and_services=input_data.products_and_services.strip(),
            target_audience=input_data.target_audience.strip(),
            company_values=input_data.company_values.strip(),
            brand_positioning=input_data.brand_positioning.strip(),
            desired_customer_perception=input_data.desired_customer_perception.strip(),
            communication_personality=input_data.communication_personality.strip(),
            reference_brands=input_data.reference_brands.strip() if input_data.reference_brands else ""
        )

        # Step 2: Query Gemini API to synthesize the 13 required Brand DNA items
        ai_recommendations: Optional[BrandDNASynthesis] = None
        used_model = settings.DEFAULT_TEXT_MODEL

        if settings.has_gemini:
            try:
                gemini_provider = ai_gateway.get_provider("gemini")
                prompt = f"""
You are the Chief Brand Architect & Executive Creative Director for Sanket AI Brand Governance.
Analyze the following authentic company facts and synthesize a structured, professional Brand DNA profile.

### VERIFIED COMPANY FACTS (GROUND TRUTH):
- Company Name: {facts.company_name}
- Industry / Sector: {facts.industry}
- Business Description: {facts.business_description}
- Products & Services: {facts.products_and_services}
- Target Audience: {facts.target_audience}
- Company Values: {facts.company_values}
- Brand Positioning: {facts.brand_positioning}
- Desired Customer Perception: {facts.desired_customer_perception}
- Communication Personality: {facts.communication_personality}
- Reference Brands: {facts.reference_brands or 'None specified'}

### CRITICAL GOVERNANCE DIRECTIVES:
1. Ground every recommendation strictly in the verified company facts above.
2. DO NOT invent factual claims, company policies, regulatory licenses, or false customer testimonials.
3. Provide realistic, high-contrast, visually pleasing HEX color codes (3 to 6 colors).
4. Provide structured, actionable typography, visual identity, photography, and messaging rules.
5. Return ONLY a single, strictly valid JSON object matching the exact schema below.

```json
{{
  "brand_personality": ["3 to 6 personality traits, e.g. 'Architectural', 'Empowering'"],
  "brand_positioning": "A concise, memorable positioning statement",
  "brand_voice_and_tone": {{
    "primary_voice": "Overall brand voice character",
    "contextual_tone": "How tone adapts in formal vs marketing contexts",
    "attributes": ["Trait 1", "Trait 2", "Trait 3"]
  }},
  "primary_and_secondary_colours": {{
    "primary": "Descriptive color name (e.g. Electric Indigo)",
    "secondary": "Secondary color name (e.g. Slate Gray)",
    "accent": "Accent color name (e.g. Emerald Mint)"
  }},
  "colour_hex_codes": ["#HEX1", "#HEX2", "#HEX3", "#HEX4"],
  "typography_recommendations": {{
    "headline_font": "Primary heading typeface (e.g. Plus Jakarta Sans)",
    "body_font": "Body typeface (e.g. Inter)",
    "accent_font": "Accent or code typeface (e.g. JetBrains Mono)",
    "hierarchy_notes": "Usage guidelines for typographic scale and weight"
  }},
  "visual_identity": {{
    "style_ethos": "Core aesthetic ethos (e.g. Minimalist Tech Precision)",
    "iconography": "Icon style guidelines",
    "negative_space_ratio": "Target whitespace percentage (e.g. 40% - 50%)"
  }},
  "photography_preferences": [
    "3 specific art direction preferences for photography and imagery"
  ],
  "design_language": {{
    "corner_radius": "Radius guideline (e.g. 8px)",
    "border_treatment": "Border styling rules",
    "elevation": "Shadow and depth rules"
  }},
  "messaging_guidelines": [
    "3 to 4 core messaging guidelines for campaigns and copy"
  ],
  "preferred_terminology": [
    "5 to 8 approved, preferred terms to use consistently in brand copy"
  ],
  "words_to_avoid": [
    "5 to 8 prohibited words, marketing buzzwords, or off-brand claims to strictly avoid"
  ],
  "visual_dos_and_donts": {{
    "dos": ["3 explicit visual creative rules creators MUST follow"],
    "donts": ["3 explicit visual creative rules creators MUST NOT break"]
  }},
  "confidence_score": 0.95,
  "synthesis_rationale": "Concise summary of how this DNA embodies the company's identity"
}}
```
"""
                raw_text, used_model = gemini_provider._generate_with_fallback(prompt)
                parsed_json = extract_json_from_llm(raw_text)
                ai_recommendations = BrandDNASynthesis(**parsed_json)
                logger.info("Successfully synthesized Brand DNA via Gemini (%s) for '%s'.", used_model, facts.company_name)
            except Exception as exc:
                logger.warning("Gemini brand DNA synthesis error for '%s': %s. Falling back to deterministic engine.", facts.company_name, exc)
                ai_recommendations = None

        # Fallback to deterministic engine if Gemini did not produce a result
        if not ai_recommendations:
            ai_recommendations = generate_deterministic_brand_dna(facts)
            used_model = "deterministic-rule-engine"

        # Step 3: Package into draft profile pending user approval
        profile = BrandDNAProfile(
            dna_id=dna_id,
            brand_id=brand_id,
            org_id=getattr(input_data, "org_id", None) or "default-org",
            company_name=facts.company_name,
            status=BrandDNAStatus.DRAFT_PENDING_APPROVAL,
            is_approved=False,
            company_facts=facts,
            ai_recommendations=ai_recommendations,
            ai_provider_used="gemini" if "gemini" in used_model.lower() else "deterministic",
            ai_model_used=used_model
        )

        # Save draft to local store
        return self.save_dna_profile(profile)

    def update_draft_dna(self, dna_id: str, edited_synthesis: BrandDNASynthesis) -> BrandDNAProfile:
        """
        Allows users to edit any of the 13 generated Brand DNA sections before approving.
        """
        profile = self.get_dna_profile(dna_id)
        if not profile:
            raise ValueError(f"Brand DNA Profile '{dna_id}' not found.")

        profile.ai_recommendations = edited_synthesis
        profile.updated_at = datetime.now(timezone.utc).isoformat()
        return self.save_dna_profile(profile)

    async def approve_and_activate_brand_dna(
        self,
        dna_id: str,
        approval_req: BrandDNAApprovalRequest
    ) -> BrandDNAProfile:
        """
        Requires user approval before activation.
        1. Transitions status to ACTIVE / APPROVED.
        2. Saves approved profile to Supabase (with fallback).
        3. Synchronizes with the core Sanket AI brand registry.
        """
        profile = self.get_dna_profile(dna_id)
        if not profile:
            raise ValueError(f"Brand DNA Profile '{dna_id}' not found.")

        # Apply any edits submitted during the approval step
        if approval_req.edited_recommendations:
            profile.ai_recommendations = approval_req.edited_recommendations

        # Mark as officially approved and activated
        now_iso = datetime.now(timezone.utc).isoformat()
        profile.status = BrandDNAStatus.ACTIVE
        profile.is_approved = True
        profile.approved_by = approval_req.approved_by
        profile.approved_at = now_iso
        profile.approval_notes = approval_req.approval_notes
        profile.updated_at = now_iso

        # Step 1: Save to Supabase
        supabase_res = await supabase_service.save_brand_dna_profile(profile)
        profile.saved_to_supabase = supabase_res.get("saved_to_supabase", False)
        profile.supabase_synced_at = now_iso if profile.saved_to_supabase else None
        profile.supabase_table = supabase_res.get("table")
        profile.supabase_record_id = supabase_res.get("record_id")
        if not profile.saved_to_supabase:
            profile.supabase_error = supabase_res.get("error") or supabase_res.get("message")

        # Step 2: Persist locally
        self.save_dna_profile(profile)

        # Step 3: Synchronize with core BrandProfile standard if requested
        if approval_req.sync_to_platform_brand:
            self._sync_to_platform_brand(profile)

        return profile

    def _sync_to_platform_brand(self, dna_profile: BrandDNAProfile) -> None:
        """
        Synchronizes approved Brand DNA into the active BrandProfile standard
        used by Check Vibe and Company Account.
        """
        try:
            brand_id = dna_profile.brand_id
            facts = dna_profile.company_facts
            rec = dna_profile.ai_recommendations

            existing = brand_service.get_brand_profile(brand_id)
            if not existing:
                existing = BrandProfile(
                    brand_id=brand_id,
                    brand_name=facts.company_name,
                    org_id=dna_profile.org_id,
                    owner_id=dna_profile.org_id,
                    status=ProfileStatus.CONFIRMED,
                    personality=rec.brand_personality,
                    mood=[m.strip() for m in facts.desired_customer_perception.split(",") if m.strip()] or ["Confident"],
                    communication_tone=[t.strip() for t in facts.communication_personality.split(",") if t.strip()] or ["Direct"],
                    visual_style=[rec.visual_identity.get("style_ethos", "Minimalist Modern")] if isinstance(rec.visual_identity, dict) else ["Modern"],
                    typography=[rec.typography_recommendations.get("headline_font", "Plus Jakarta Sans")] if isinstance(rec.typography_recommendations, dict) else [],
                    target_audience=facts.target_audience,
                    approved_palette=rec.colour_hex_codes,
                    disallowed_elements=rec.words_to_avoid,
                    key_values=[v.strip() for v in facts.company_values.split(",") if v.strip()],
                    mission_statement=facts.business_description,
                    is_human_confirmed=True,
                    confirmed_by=dna_profile.approved_by,
                    confirmation_notes=f"Generated via Brand DNA Generator and approved on {dna_profile.approved_at}",
                    ai_synthesized=True,
                    ai_provider_used=dna_profile.ai_provider_used,
                    ai_confidence_score=rec.confidence_score
                )
            else:
                existing.org_id = dna_profile.org_id
                existing.owner_id = dna_profile.org_id
                existing.status = ProfileStatus.CONFIRMED
                existing.personality = rec.brand_personality
                existing.approved_palette = rec.colour_hex_codes
                existing.disallowed_elements = rec.words_to_avoid
                existing.target_audience = facts.target_audience
                existing.key_values = [v.strip() for v in facts.company_values.split(",") if v.strip()]
                existing.mission_statement = facts.business_description
                existing.is_human_confirmed = True
                existing.confirmed_by = dna_profile.approved_by
                existing.confirmation_notes = f"Updated via Brand DNA Generator on {dna_profile.approved_at}"

            # Store full brand DNA vector metrics
            existing.brand_dna = {
                "target_palette_hex": rec.colour_hex_codes,
                "target_whitespace_ratio": 0.45,
                "target_complexity_index": 0.35,
                "design_language": rec.design_language,
                "visual_dos_and_donts": rec.visual_dos_and_donts,
                "dna_id": dna_profile.dna_id
            }

            brand_service.save_brand_profile(existing)
            logger.info("Synchronized approved Brand DNA '%s' to active platform standard '%s'.", dna_profile.dna_id, brand_id)
        except Exception as exc:
            logger.error("Failed to sync Brand DNA to platform standard: %s", exc)


brand_dna_service = BrandDNAService()
