"""Tests for BrandShield AI - Phase 4: Brand Identity Processing & Confirmation."""
from pathlib import Path
from PIL import Image
import pytest

from backend.app.models.brand import (
    BrandProfileConfirmationRequest,
    BrandQuestionnaire,
    ProfileStatus,
)
from backend.app.services.brand_service import BrandService


@pytest.mark.asyncio
async def test_brand_onboarding_draft_creation(tmp_path: Path):
    """Verify company questionnaire ingestion and reference processing into a draft profile."""
    service = BrandService(db_path=tmp_path / "profiles.json")

    # Create dummy reference guideline and approved image
    guide_path = tmp_path / "guidelines.txt"
    guide_path.write_text("Acme Corp Brand Guidelines: Always inspire confidence. Primary color is blue.", encoding="utf-8")

    img_path = tmp_path / "approved_logo.png"
    Image.new("RGB", (400, 400), color=(0, 85, 255)).save(img_path)

    questionnaire = BrandQuestionnaire(
        brand_name="Acme Corp",
        personality="Youthful, Energetic",
        mood="Optimistic",
        communication_tone="Friendly",
        target_audience="Young Adults",
        visual_style="Modern, Minimalist",
        palette=["#0055FF"],
        disallowed_elements=["cheap", "guarantee"],
        tagline_or_mission="Empowering tomorrow's creators"
    )

    draft = await service.create_brand_profile_draft(
        questionnaire=questionnaire,
        uploaded_reference_paths=[guide_path, img_path]
    )

    assert draft.brand_id == "acme-corp"
    assert draft.status == ProfileStatus.DRAFT_PENDING_CONFIRMATION
    assert draft.is_human_confirmed is False
    assert len(draft.reference_assets) == 2
    assert "#0055FF" in draft.approved_palette


def test_brand_profile_confirmation(tmp_path: Path):
    """Verify the company Brand Profile Confirmation step: review, edit, and lock."""
    service = BrandService(db_path=tmp_path / "profiles.json")

    # Setup initial draft
    questionnaire = BrandQuestionnaire(
        brand_name="Solaris",
        personality="Bold",
        mood="Energetic",
        communication_tone="Inspiring",
        target_audience="Fitness enthusiasts",
        visual_style="Dynamic",
        palette=["#FFCC00"],
        disallowed_elements=["lazy", "formal"]
    )
    import asyncio
    draft = asyncio.run(service.create_brand_profile_draft(questionnaire))
    assert draft.status == ProfileStatus.DRAFT_PENDING_CONFIRMATION

    # Company reviews and corrects the profile
    confirmation = BrandProfileConfirmationRequest(
        brand_id="solaris",
        personality=["Bold", "Adventurous"],  # Added Adventurous
        mood=["Energetic", "Driven"],
        communication_tone=["Inspiring", "Direct"],
        visual_style=["Dynamic", "High-Contrast"],
        target_audience="Athletes and active creators",
        approved_palette=["#FFCC00", "#111111"],  # Added accent black
        disallowed_elements=["lazy", "formal", "corporate jargon"],
        key_values=["Excellence", "Velocity"],
        confirmed_by="sarah@solaris.io",
        confirmation_notes="Verified by Marketing Director"
    )

    confirmed = service.confirm_brand_profile(confirmation)

    assert confirmed.status == ProfileStatus.CONFIRMED
    assert confirmed.is_human_confirmed is True
    assert confirmed.confirmed_by == "sarah@solaris.io"
    assert "Adventurous" in confirmed.personality
    assert "#111111" in confirmed.approved_palette

    # Verify retrieval from storage
    retrieved = service.get_brand_profile("solaris")
    assert retrieved is not None
    assert retrieved.status == ProfileStatus.CONFIRMED
