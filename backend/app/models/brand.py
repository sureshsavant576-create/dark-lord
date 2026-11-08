from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class ProfileStatus(str, Enum):
    DRAFT_PENDING_CONFIRMATION = "DRAFT_PENDING_CONFIRMATION"
    CONFIRMED = "CONFIRMED"
    REVISED = "REVISED"

class BrandQuestionnaire(BaseModel):
    brand_name: str = Field(description="Official name of the company / brand")
    personality: str = Field(description="e.g. Youthful, Prestigious, Innovative, Rugged")
    mood: str = Field(description="e.g. Energetic, Calm, Inspiring, Serious")
    communication_tone: str = Field(description="e.g. Friendly, Formal, Playful, Direct")
    target_audience: str = Field(description="e.g. Tech-savvy professionals, Gen-Z students")
    visual_style: str = Field(description="e.g. Minimalist, Modern, High-contrast, Retro")
    typography: Optional[str] = Field(default="", description="e.g. Modern Sans-Serif, Inter, Playfair Display")
    palette: List[str] = Field(default_factory=list, description="Approved brand HEX colors, e.g. ['#0055FF', '#FFCC00']")
    disallowed_elements: List[str] = Field(default_factory=list, description="Explicit avoidances, forbidden words, or aesthetics")
    tagline_or_mission: Optional[str] = Field(default="", description="Core motto or brand promise")
    owner_id: Optional[str] = Field(default="default-org", description="Organization or user identity owning this brand")
    logo_url: Optional[str] = Field(default="", description="Official brand logo image URL or path")

class ReferenceAssetInfo(BaseModel):
    asset_id: str
    original_filename: str
    media_category: str
    stored_path: str
    sha256: str
    extracted_summary: str = ""

class BrandProfile(BaseModel):
    brand_id: str = Field(description="Unique identifier for the brand (slugified name or UUID)")
    brand_name: str
    status: ProfileStatus = Field(default=ProfileStatus.DRAFT_PENDING_CONFIRMATION)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    owner_id: str = Field(default="default-org", description="Organization or user identity that owns this brand standard")

    personality: List[str] = Field(default_factory=list)
    mood: List[str] = Field(default_factory=list)
    communication_tone: List[str] = Field(default_factory=list)
    visual_style: List[str] = Field(default_factory=list)
    typography: List[str] = Field(default_factory=list, description="Approved typography styles or detected font families")
    target_audience: str = ""
    approved_palette: List[str] = Field(default_factory=list, description="Validated uppercase HEX colors")
    disallowed_elements: List[str] = Field(default_factory=list, description="Strict avoidances & forbidden terms")
    brand_dna: Optional[Dict[str, Any]] = Field(default=None, description="Biometric brand DNA vector targets (whitespace, complexity, colors)")
    key_values: List[str] = Field(default_factory=list)
    mission_statement: str = ""
    logo_url: Optional[str] = ""

    reference_assets: List[ReferenceAssetInfo] = Field(default_factory=list)

    is_human_confirmed: bool = Field(default=False)
    confirmed_by: Optional[str] = None
    confirmation_notes: Optional[str] = None

    ai_synthesized: bool = Field(default=False)
    ai_provider_used: Optional[str] = None
    ai_confidence_score: float = 0.0
    synthesis_explanation: str = ""

class BrandProfileConfirmationRequest(BaseModel):
    brand_id: str
    personality: List[str]
    mood: List[str]
    communication_tone: List[str]
    visual_style: List[str]
    typography: Optional[List[str]] = Field(default_factory=list)
    target_audience: str
    approved_palette: List[str]
    disallowed_elements: List[str]
    key_values: List[str] = Field(default_factory=list)
    mission_statement: Optional[str] = Field(default="")
    confirmed_by: str = Field(default="Brand Manager", description="Name or email of the approver")
    confirmation_notes: Optional[str] = Field(default="Approved after onboarding review")
    owner_id: Optional[str] = Field(default="default-org", description="Owner user or organization ID")
    logo_url: Optional[str] = Field(default="", description="Official brand logo image URL or path")
