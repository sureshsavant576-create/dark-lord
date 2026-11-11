from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class BrandDNAStatus(str, Enum):
    DRAFT_PENDING_APPROVAL = "DRAFT_PENDING_APPROVAL"
    APPROVED = "APPROVED"
    ACTIVE = "ACTIVE"
    REVISED = "REVISED"


class BrandDNAInput(BaseModel):
    """
    10 required inputs collected from the company.
    """
    company_name: str = Field(..., description="Official name of the company or brand")
    industry: str = Field(..., description="Industry or sector (e.g., Fintech, Healthcare, Developer Tools, Luxury Retail)")
    business_description: str = Field(..., description="What the company does, its core mission and operating domain")
    products_and_services: str = Field(..., description="Main products, software, hardware, or services offered")
    target_audience: str = Field(..., description="Primary audience (demographics, job roles, consumer/B2B)")
    company_values: str = Field(..., description="Core organizational values and principles")
    brand_positioning: str = Field(..., description="Unique market position, differentiator, or value anchor")
    desired_customer_perception: str = Field(..., description="How customers and users should perceive the brand (e.g., authoritative, trusted, high-velocity)")
    communication_personality: str = Field(..., description="Tone of voice and character (e.g., empowering, direct, empathetic, scientific)")
    reference_brands: Optional[str] = Field(default="", description="Optional benchmark or reference brands (e.g., Stripe, Apple, Linear, Patagonia)")


class BrandDNAFacts(BaseModel):
    """
    Immutable company-provided facts, strictly separated from AI suggestions.
    """
    source: str = Field(default="company_provided", description="Explicit marker indicating origin as verified company fact")
    company_name: str
    industry: str
    business_description: str
    products_and_services: str
    target_audience: str
    company_values: str
    brand_positioning: str
    desired_customer_perception: str
    communication_personality: str
    reference_brands: Optional[str] = ""
    collected_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BrandDNASynthesis(BaseModel):
    """
    The 13 structured AI-generated recommendations.
    """
    source: str = Field(default="ai_synthesized", description="Explicit marker indicating origin as AI recommendation")

    # 1. Brand personality
    brand_personality: List[str] = Field(
        default_factory=list,
        description="Key personality traits defining how the brand expresses itself"
    )

    # 2. Brand positioning
    brand_positioning: str = Field(
        default="",
        description="Formal positioning statement anchoring the company in its competitive landscape"
    )

    # 3. Brand voice and tone
    brand_voice_and_tone: Dict[str, Any] = Field(
        default_factory=dict,
        description="Core voice characteristics and contextual tone rules (e.g., formal documentation vs social)"
    )

    # 4. Primary and secondary colours
    primary_and_secondary_colours: Dict[str, str] = Field(
        default_factory=dict,
        description="Descriptive color names and roles (e.g. {'primary': 'Deep Cobalt', 'secondary': 'Slate', 'accent': 'Electric Emerald'})"
    )

    # 5. Colour HEX codes
    colour_hex_codes: List[str] = Field(
        default_factory=list,
        description="Approved 6-digit uppercase HEX color codes (e.g. ['#1E3A8A', '#0F172A', '#10B981'])"
    )

    # 6. Typography recommendations
    typography_recommendations: Dict[str, str] = Field(
        default_factory=dict,
        description="Recommended font families, weights, and typographic hierarchy"
    )

    # 7. Visual identity
    visual_identity: Dict[str, Any] = Field(
        default_factory=dict,
        description="Visual style ethos, iconography guidelines, and layout composition standards"
    )

    # 8. Photography preferences
    photography_preferences: List[str] = Field(
        default_factory=list,
        description="Art direction, lighting styles, framing, and authentic imagery guidelines"
    )

    # 9. Design language
    design_language: Dict[str, Any] = Field(
        default_factory=dict,
        description="UI and graphic system attributes: corner radius, border styles, contrast, and elevation"
    )

    # 10. Messaging guidelines
    messaging_guidelines: List[str] = Field(
        default_factory=list,
        description="Key messaging pillars, elevator pitch angles, and value proposition framing"
    )

    # 11. Preferred terminology
    preferred_terminology: List[str] = Field(
        default_factory=list,
        description="Approved vocabulary, phrases, and technical terms to use consistently"
    )

    # 12. Words to avoid
    words_to_avoid: List[str] = Field(
        default_factory=list,
        description="Prohibited buzzwords, off-brand claims, or misleading terminology"
    )

    # 13. Visual do's and don'ts
    visual_dos_and_donts: Dict[str, List[str]] = Field(
        default_factory=lambda: {"dos": [], "donts": []},
        description="Explicit visual rules: what creators MUST do and what they MUST NOT do"
    )

    confidence_score: float = Field(default=0.92, description="AI confidence score between 0.0 and 1.0")
    synthesis_rationale: str = Field(default="", description="Explanation of how the DNA was synthesized from company facts")

    @field_validator("colour_hex_codes")
    @classmethod
    def validate_hex_codes(cls, v: List[str]) -> List[str]:
        cleaned = []
        for code in v:
            c = code.strip().upper()
            if not c.startswith("#"):
                c = f"#{c}"
            if len(c) == 7 and all(ch in "0123456789ABCDEF" for ch in c[1:]):
                cleaned.append(c)
        return cleaned or ["#6366F1", "#0B0F19", "#10B981"]


class BrandDNAProfile(BaseModel):
    """
    Unified Brand DNA Profile holding company-provided facts and AI recommendations,
    with approval tracking and Supabase persistence metadata.
    """
    dna_id: str = Field(..., description="Unique DNA identifier (e.g. dna-nike-9a2f)")
    brand_id: str = Field(..., description="Associated brand slug (e.g. nike)")
    company_name: str
    status: BrandDNAStatus = Field(default=BrandDNAStatus.DRAFT_PENDING_APPROVAL)
    is_approved: bool = Field(default=False)
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    approval_notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # Strict separation
    company_facts: BrandDNAFacts = Field(..., description="Facts provided by company (truth anchor)")
    ai_recommendations: BrandDNASynthesis = Field(..., description="AI synthesized brand guidelines")

    # Supabase synchronization metadata
    saved_to_supabase: bool = Field(default=False)
    supabase_synced_at: Optional[str] = None
    supabase_table: Optional[str] = None
    supabase_record_id: Optional[str] = None
    supabase_error: Optional[str] = None

    # AI Model Provenance
    ai_provider_used: str = Field(default="gemini")
    ai_model_used: str = Field(default="gemini-3.1-flash-lite")


class BrandDNAApprovalRequest(BaseModel):
    """
    Payload when user reviews, optionally edits, and officially approves the Brand DNA.
    """
    approved_by: str = Field(default="Brand Director", description="Identity or role of the approver")
    approval_notes: Optional[str] = Field(default="Approved and activated brand standard", description="Optional notes")
    edited_recommendations: Optional[BrandDNASynthesis] = Field(
        default=None,
        description="User-edited version of the 13 Brand DNA sections, if user made adjustments before approving"
    )
    sync_to_platform_brand: bool = Field(
        default=True,
        description="Whether to also update/create the active BrandProfile in Sanket AI governance registry"
    )
