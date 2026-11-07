"""BrandShield AI - Company Brand Identity & Onboarding Endpoints."""
import json
import shutil
from pathlib import Path
from typing import List, Optional
import uuid
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.core.config import settings
from backend.app.models.brand import (
    BrandProfile,
    BrandProfileConfirmationRequest,
    BrandQuestionnaire,
)
from backend.app.services.brand_service import brand_service

router = APIRouter(prefix="/brands", tags=["Brand Onboarding & Governance"])


@router.get("", response_model=List[BrandProfile])
def list_brands() -> List[BrandProfile]:
    """Retrieve all company brand profiles."""
    return brand_service.list_brand_profiles()


@router.get("/{brand_id}", response_model=BrandProfile)
def get_brand(brand_id: str) -> BrandProfile:
    """Retrieve a single company brand profile by its ID."""
    profile = brand_service.get_brand_profile(brand_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found.")
    return profile


@router.post("/draft", response_model=BrandProfile)
async def create_brand_draft(
    brand_name: str = Form(...),
    personality: str = Form(...),
    mood: str = Form(...),
    communication_tone: str = Form(...),
    target_audience: str = Form(...),
    visual_style: str = Form(...),
    palette: str = Form(default="[]", description="JSON array or comma-separated hex strings"),
    disallowed_elements: str = Form(default="[]", description="JSON array or comma-separated terms"),
    tagline_or_mission: Optional[str] = Form(default=""),
    reference_files: Optional[List[UploadFile]] = File(default=None)
) -> BrandProfile:
    """Stage 1 & 2: Ingest company onboarding questionnaire and reference files to generate a draft profile."""
    # Parse palette
    try:
        parsed_palette = json.loads(palette) if palette.strip().startswith("[") else [p.strip() for p in palette.split(",") if p.strip()]
    except Exception:
        parsed_palette = [p.strip() for p in palette.split(",") if p.strip()]

    # Parse disallowed elements
    try:
        parsed_disallowed = json.loads(disallowed_elements) if disallowed_elements.strip().startswith("[") else [d.strip() for d in disallowed_elements.split(",") if d.strip()]
    except Exception:
        parsed_disallowed = [d.strip() for d in disallowed_elements.split(",") if d.strip()]

    questionnaire = BrandQuestionnaire(
        brand_name=brand_name,
        personality=personality,
        mood=mood,
        communication_tone=communication_tone,
        target_audience=target_audience,
        visual_style=visual_style,
        palette=parsed_palette,
        disallowed_elements=parsed_disallowed,
        tagline_or_mission=tagline_or_mission
    )

    saved_paths: List[Path] = []
    if reference_files:
        for file in reference_files:
            if not file.filename:
                continue
            dest_name = f"{uuid.uuid4().hex[:6]}_{file.filename}"
            dest_path = settings.GUIDELINES_DIR / dest_name
            with open(dest_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_paths.append(dest_path)

    try:
        draft = await brand_service.create_brand_profile_draft(
            questionnaire=questionnaire,
            uploaded_reference_paths=saved_paths
        )
        return draft
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate brand draft: {str(exc)}")


@router.post("/confirm", response_model=BrandProfile)
def confirm_brand(request: BrandProfileConfirmationRequest) -> BrandProfile:
    """Stage 3: Company executive reviews, corrects, and confirms their brand identity."""
    try:
        confirmed = brand_service.confirm_brand_profile(request)
        return confirmed
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to confirm brand profile: {str(exc)}")
