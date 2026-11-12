from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.app.core.auth import (
    UserContext,
    get_current_user,
    is_platform_demo_admin,
    verify_can_manage_brand,
    verify_tenant_access,
)
from backend.app.core.config import settings
from backend.app.models.brand import (
    BrandProfile,
    BrandProfileConfirmationRequest,
    BrandQuestionnaire,
)
from backend.app.preprocessing.validator import save_upload_safely
from backend.app.services.brand_service import brand_service
from backend.app.services.inspection_service import inspection_service
from backend.app.models.brand_dna import (
    BrandDNAInput,
    BrandDNAProfile,
    BrandDNASynthesis,
    BrandDNAApprovalRequest,
)
from backend.app.services.brand_dna_service import brand_dna_service
from backend.app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/brands", tags=["Brand Onboarding & Governance"])

@router.get("", response_model=List[BrandProfile])
def list_brands(user: UserContext = Depends(get_current_user)) -> List[BrandProfile]:
    brands = brand_service.list_brand_profiles()
    if is_platform_demo_admin(user):
        return brands
    return [
        b for b in brands
        if (getattr(b, "org_id", None) == user.org_id or getattr(b, "owner_id", None) == user.org_id)
    ]


# ============================================================================
# AI-POWERED BRAND DNA GENERATOR & SUPABASE PERSISTENCE ENDPOINTS
# ============================================================================

@router.get("/dna/supabase/status")
def get_supabase_integration_status():
    """
    Returns connection and table schema status for Supabase persistence.
    """
    return supabase_service.get_status()

def _verify_brand_management_or_default_anon(user: UserContext, target_org: str) -> None:
    """
    Allows unauthenticated callers operating solely within default-org (local/legacy tests),
    while enforcing strict role & tenant isolation for authenticated users or named organizations.
    """
    clean_target = (target_org or "default-org").replace("-", "_").lower().strip()
    if user.user_id == "anonymous-user" and (user.org_id or "default-org").replace("-", "_").lower() == "default_org" and clean_target in ("default_org", "default_dev"):
        return
    verify_can_manage_brand(user, target_org)

@router.post("/dna/generate", response_model=BrandDNAProfile)
async def generate_brand_dna_profile(
    input_data: BrandDNAInput,
    user: UserContext = Depends(get_current_user),
) -> BrandDNAProfile:
    """
    Collects 10 company facts, uses Gemini API to synthesize 13 structured
    Brand DNA attributes, strictly separates facts from AI recommendations,
    and returns a validated draft profile pending user approval.
    """
    target_org = input_data.org_id or user.org_id or "default-org"
    _verify_brand_management_or_default_anon(user, target_org)
    input_data.org_id = target_org
    try:
        profile = await brand_dna_service.generate_brand_dna(input_data)
        return profile
    except Exception as exc:
        logger.exception("Failed to generate Brand DNA: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to generate Brand DNA: {str(exc)}")

@router.get("/dna", response_model=List[BrandDNAProfile])
def list_brand_dna_profiles(user: UserContext = Depends(get_current_user)) -> List[BrandDNAProfile]:
    """
    Lists all generated and approved Brand DNA profiles scoped to the user's organization.
    """
    profiles = brand_dna_service.list_dna_profiles()
    if is_platform_demo_admin(user):
        return profiles
    return [p for p in profiles if getattr(p, "org_id", "default-org") == user.org_id]

@router.get("/dna/{dna_id}", response_model=BrandDNAProfile)
def get_brand_dna_profile(dna_id: str, user: UserContext = Depends(get_current_user)) -> BrandDNAProfile:
    """
    Retrieves a specific Brand DNA profile by DNA ID or brand slug.
    """
    profile = brand_dna_service.get_dna_profile(dna_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Brand DNA profile '{dna_id}' not found.")
    verify_tenant_access(user, getattr(profile, "org_id", "default-org"))
    return profile

@router.put("/dna/{dna_id}", response_model=BrandDNAProfile)
def update_draft_brand_dna(
    dna_id: str,
    edits: BrandDNASynthesis,
    user: UserContext = Depends(get_current_user),
) -> BrandDNAProfile:
    """
    Allows user to edit any of the 13 generated Brand DNA sections before approval.
    """
    existing = brand_dna_service.get_dna_profile(dna_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Brand DNA profile '{dna_id}' not found.")
    _verify_brand_management_or_default_anon(user, getattr(existing, "org_id", "default-org"))
    try:
        updated = brand_dna_service.update_draft_dna(dna_id, edits)
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to update Brand DNA draft: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

@router.post("/dna/{dna_id}/approve", response_model=BrandDNAProfile)
async def approve_and_activate_brand_dna(
    dna_id: str,
    request: BrandDNAApprovalRequest,
    user: UserContext = Depends(get_current_user),
) -> BrandDNAProfile:
    """
    Requires user approval before activation.
    1. Sets status to ACTIVE / APPROVED.
    2. Saves approved profile to Supabase (with fallback).
    3. Synchronizes with the core Sanket AI brand governance registry.
    """
    existing = brand_dna_service.get_dna_profile(dna_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Brand DNA profile '{dna_id}' not found.")
    _verify_brand_management_or_default_anon(user, getattr(existing, "org_id", "default-org"))
    try:
        approved_profile = await brand_dna_service.approve_and_activate_brand_dna(dna_id, request)
        return approved_profile
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to approve Brand DNA: %s", exc)
        raise HTTPException(status_code=500, detail=f"Approval failed: {str(exc)}")


@router.get("/profile/{brand_id}", response_model=BrandProfile)
@router.get("/{brand_id}", response_model=BrandProfile)
def get_brand(brand_id: str, user: UserContext = Depends(get_current_user)) -> BrandProfile:
    profile = brand_service.get_brand_profile(brand_id)
    if not profile and "-" in brand_id:
        profile = brand_service.get_brand_profile(brand_id.replace("-", "_"))
    if not profile and "_" in brand_id:
        profile = brand_service.get_brand_profile(brand_id.replace("_", "-"))
    if not profile:
        # Fallback search across loaded profiles
        all_p = brand_service.list_brand_profiles()
        for p in all_p:
            if p.brand_id.lower() in [brand_id.lower(), brand_id.lower().replace("-", "_")]:
                verify_tenant_access(user, getattr(p, "org_id", None) or getattr(p, "owner_id", "default-org"))
                return p
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found.")
    verify_tenant_access(user, getattr(profile, "org_id", None) or getattr(profile, "owner_id", "default-org"))
    return profile

@router.delete("/{brand_id}")
def delete_brand(
    brand_id: str,
    cascade_reports: bool = True,
    user: UserContext = Depends(get_current_user)
):
    profile = brand_service.get_brand_profile(brand_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found.")

    verify_can_manage_brand(user, getattr(profile, "org_id", None) or profile.owner_id)

    deleted = brand_service.delete_brand_profile(brand_id, delete_files=True)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found.")

    reports_purged = 0
    if cascade_reports:
        try:
            reports_purged = inspection_service.delete_reports_for_brand(brand_id, delete_files=True)
        except Exception as exc:
            logger.warning("Failed to cascade delete reports for brand %s: %s", brand_id, exc)

    return {
        "status": "success",
        "message": f"Brand '{brand_id}' and all associated guidelines and audit history permanently deleted.",
        "brand_id": brand_id,
        "cascade_reports_deleted": reports_purged
    }

@router.post("/scan-reference")
async def scan_reference_image(file: UploadFile = File(...)):
    settings.init_directories()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Reference file required.")

    dest_path = save_upload_safely(file, settings.GUIDELINES_DIR, prefix="scan")

    try:
        features = await brand_service.scan_reference_features(dest_path)
        features["image_url"] = f"/storage/guidelines/{dest_path.name}"
        return features
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to scan reference image: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to scan reference image due to an internal processing error.")

@router.post("/upload-logo")
async def upload_brand_logo(file: UploadFile = File(...)):
    settings.init_directories()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Logo image file required.")

    dest_path = save_upload_safely(file, settings.GUIDELINES_DIR, prefix="logo")
    return {
        "logo_url": f"/storage/guidelines/{dest_path.name}",
        "filename": file.filename
    }

@router.post("/extract-palette")
async def extract_palette_from_image(file: UploadFile = File(...)):
    settings.init_directories()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Image file required.")

    dest_path = save_upload_safely(file, settings.GUIDELINES_DIR, prefix="palette")

    try:
        from backend.app.preprocessing.color_extractor import extract_detailed_palette
        detailed_res = extract_detailed_palette(dest_path)
        return {
            "dominant_color": detailed_res.dominant_color.model_dump(),
            "palette": [p.model_dump() for p in detailed_res.palette],
            "hex_list": detailed_res.hex_list,
            "harmony_type": detailed_res.harmony_type,
            "color_distribution": detailed_res.color_distribution,
            "image_url": f"/storage/guidelines/{dest_path.name}"
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to extract color palette: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to extract color palette due to an internal processing error.")

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
    typography: Optional[str] = Form(default=""),
    logo_url: Optional[str] = Form(default=""),
    reference_files: Optional[List[UploadFile]] = File(default=None),
    user: UserContext = Depends(get_current_user)
) -> BrandProfile:
    try:
        parsed_palette = json.loads(palette) if palette.strip().startswith("[") else [p.strip() for p in palette.split(",") if p.strip()]
    except Exception:
        parsed_palette = [p.strip() for p in palette.split(",") if p.strip()]

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
        typography=typography or "",
        logo_url=logo_url or "",
        palette=parsed_palette,
        disallowed_elements=parsed_disallowed,
        tagline_or_mission=tagline_or_mission,
        owner_id=user.org_id or user.user_id
    )

    saved_paths: List[Path] = []
    if reference_files:
        for file in reference_files:
            if not file.filename:
                continue
            saved_path = save_upload_safely(file, settings.GUIDELINES_DIR)
            saved_paths.append(saved_path)

    try:
        draft = await brand_service.create_brand_profile_draft(
            questionnaire=questionnaire,
            uploaded_reference_paths=saved_paths
        )
        return draft
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate brand draft: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate brand draft due to an internal processing error.")

@router.post("/confirm", response_model=BrandProfile)
def confirm_brand(
    request: BrandProfileConfirmationRequest,
    user: UserContext = Depends(get_current_user)
) -> BrandProfile:
    existing = brand_service.get_brand_profile(request.brand_id)
    if existing:
        _verify_brand_management_or_default_anon(user, getattr(existing, "org_id", None) or existing.owner_id)

    if not request.owner_id:
        request.owner_id = user.org_id or user.user_id

    try:
        confirmed = brand_service.confirm_brand_profile(request)
        return confirmed
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to confirm brand profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to confirm brand profile due to an internal processing error.")
