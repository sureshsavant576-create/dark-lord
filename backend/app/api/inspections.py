from __future__ import annotations
import logging
from pathlib import Path
from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.app.core.auth import (
    UserContext,
    UserRole,
    get_current_user,
    verify_can_access_report,
    verify_can_clear_reports,
    verify_can_delete_report,
    verify_can_review_report,
)
from backend.app.core.config import settings
from backend.app.models.inspection import (
    HumanReviewSubmission,
    InspectionReport,
)
from backend.app.preprocessing.validator import save_upload_safely
from backend.app.services.brand_service import brand_service
from backend.app.services.inspection_service import inspection_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Content Inspection & Governance"])

@router.post("/inspect/prefilter-colors/{brand_id}")
async def prefilter_poster_colors(
    brand_id: str,
    file: UploadFile = File(...)
):
    settings.init_directories()
    brand = brand_service.get_brand_profile(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Image file required for color pre-filtering.")

    dest_path = save_upload_safely(file, settings.UPLOADS_DIR, prefix="prefilter")

    try:
        from backend.app.preprocessing.color_extractor import extract_detailed_palette, prefilter_color_compliance
        detailed = extract_detailed_palette(dest_path)
        compliance = prefilter_color_compliance(detailed.hex_list, brand.approved_palette or [])
        return {
            "brand_id": brand_id,
            "brand_name": brand.brand_name,
            "approved_palette": brand.approved_palette or [],
            "detected_palette": [p.model_dump() for p in detailed.palette],
            "dominant_color": detailed.dominant_color.model_dump(),
            "color_distribution": detailed.color_distribution,
            "harmony_type": detailed.harmony_type,
            "compliance": compliance,
            "image_url": f"/storage/uploads/{dest_path.name}"
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to pre-filter colors: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to pre-filter colors due to an internal processing error.")

from backend.app.services.preflight_service import preflight_scanner_service

@router.post("/inspect/preflight-scan")
async def preflight_scan_creative(
    file: UploadFile = File(...),
    brand_id: Optional[str] = Form(default=None)
):
    settings.init_directories()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Image file required for pre-flight scanning.")

    target_path = save_upload_safely(file, settings.UPLOADS_DIR, prefix="preflight")
    try:
        return preflight_scanner_service.analyze_image_preflight(target_path, brand_id=brand_id)
    except Exception as exc:
        logger.exception("Pre-flight scan failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to run pre-flight scan.")


@router.post("/inspect/{brand_id}", response_model=InspectionReport)
async def inspect_developer_content(
    brand_id: str,
    file: Optional[UploadFile] = File(default=None),
    copy_text: Optional[str] = Form(default=None),
    preferred_ai_provider: Optional[str] = Form(default=None),
    user: UserContext = Depends(get_current_user)
) -> InspectionReport:
    settings.init_directories()

    brand = brand_service.get_brand_profile(brand_id)
    if not brand:
        raise HTTPException(
            status_code=404,
            detail=f"Brand profile '{brand_id}' not found. Please register/confirm the company brand first."
        )

    has_file = file is not None and bool(file.filename)
    has_text = copy_text is not None and bool(copy_text.strip())

    if not has_file and not has_text:
        raise HTTPException(
            status_code=400,
            detail="Submission required: provide either a creative file upload or direct marketing copy text."
        )

    if has_file:
        dest_path = save_upload_safely(file, settings.UPLOADS_DIR)
        declared_mime = file.content_type
    else:
        dest_name = f"copy_{uuid.uuid4().hex[:8]}.txt"
        dest_path = settings.UPLOADS_DIR / dest_name
        dest_path.write_text(copy_text.strip(), encoding="utf-8")
        declared_mime = "text/plain"

    try:
        report = await inspection_service.inspect_submission(
            brand_id=brand_id,
            file_path=dest_path,
            declared_mime_type=declared_mime,
            preferred_ai_provider=preferred_ai_provider,
            submission_copy_text=copy_text if has_text else None,
            submitted_by=user.user_id,
            org_id=user.org_id
        )
        return report
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Inspection error for brand %s: %s", brand_id, exc)
        raise HTTPException(status_code=500, detail="Content inspection failed due to an internal processing error.")

@router.get("/reports", response_model=List[InspectionReport])
def list_reports(
    brand_id: Optional[str] = None,
    user: UserContext = Depends(get_current_user)
) -> List[InspectionReport]:
    all_reports = inspection_service.list_reports(brand_id=brand_id)
    if user.role == UserRole.ADMIN:
        return all_reports
    return [
        r for r in all_reports
        if r.org_id in (user.org_id, "default-org") or r.submitted_by in (user.user_id, "default-dev")
    ]

@router.get("/reports/{inspection_id}", response_model=InspectionReport)
def get_report(
    inspection_id: str,
    user: UserContext = Depends(get_current_user)
) -> InspectionReport:
    report = inspection_service.get_report(inspection_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Inspection report '{inspection_id}' not found.")
    verify_can_access_report(user, report.org_id, report.submitted_by)
    return report

@router.post("/reports/{inspection_id}/review", response_model=InspectionReport)
def submit_human_review(
    inspection_id: str,
    submission: HumanReviewSubmission,
    user: UserContext = Depends(get_current_user)
) -> InspectionReport:
    verify_can_review_report(user)

    if inspection_id != submission.inspection_id:
        submission.inspection_id = inspection_id

    try:
        updated = inspection_service.record_human_decision(submission)
        return updated
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to record review decision: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record review decision due to an internal processing error.")

@router.delete("/reports/{inspection_id}")
def delete_report(
    inspection_id: str,
    user: UserContext = Depends(get_current_user)
):
    report = inspection_service.get_report(inspection_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Inspection report '{inspection_id}' not found.")

    verify_can_delete_report(user, report.org_id, report.submitted_by)

    deleted = inspection_service.delete_report(inspection_id, delete_files=True)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Inspection report '{inspection_id}' not found.")

    return {
        "status": "success",
        "message": f"Inspection report '{inspection_id}' permanently deleted.",
        "inspection_id": inspection_id
    }

@router.delete("/reports")
def clear_all_reports(
    brand_id: Optional[str] = None,
    user: UserContext = Depends(get_current_user)
):
    verify_can_clear_reports(user)

    count = inspection_service.clear_all_reports(
        brand_id=brand_id,
        org_id=user.org_id if user.role != UserRole.ADMIN else None,
        delete_files=True
    )

    return {
        "status": "success",
        "message": f"Permanently deleted {count} inspection report(s).",
        "deleted_count": count
    }


# =========================================================================
# ROUND 3 IMPROVEMENTS: BRAND CO-PILOT, AUTO-REMEDIATION, PRE-FLIGHT
# =========================================================================

from backend.app.services.copilot_service import (
    CopilotChatRequest,
    CopilotChatResponse,
    brand_copilot_service,
)
from backend.app.services.remediation_service import creative_remediation_service


@router.post("/inspect/{brand_id}/copilot-chat", response_model=CopilotChatResponse)
async def chat_with_brand_copilot(
    brand_id: str,
    payload: CopilotChatRequest
):
    try:
        payload.brand_id = brand_id
        return await brand_copilot_service.chat(payload)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as exc:
        logger.exception("Brand Co-Pilot error: %s", exc)
        raise HTTPException(status_code=500, detail="Brand Co-Pilot encountered an internal processing error.")


@router.post("/inspect/{brand_id}/auto-remediate")
async def auto_remediate_creative(
    brand_id: str,
    file: Optional[UploadFile] = File(default=None),
    image_url: Optional[str] = Form(default=None)
):
    settings.init_directories()
    target_path = None

    if file and file.filename:
        target_path = save_upload_safely(file, settings.UPLOADS_DIR, prefix="remed_src")
    elif image_url:
        clean_name = Path(image_url.split("?")[0]).name
        local_path = settings.UPLOADS_DIR / clean_name
        if not local_path.exists():
            static_sample = settings.STATIC_DIR / "samples" / clean_name
            if static_sample.exists():
                local_path = static_sample
            else:
                static_direct = settings.STATIC_DIR / clean_name
                if static_direct.exists():
                    local_path = static_direct
        if local_path.exists():
            target_path = local_path

    if not target_path or not target_path.exists():
        raise HTTPException(status_code=400, detail="Valid creative image file or existing uploaded image URL is required.")

    try:
        result = creative_remediation_service.auto_remediate_image(target_path, brand_id)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as exc:
        logger.exception("Creative Auto-Remediation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to auto-remediate creative due to an internal processing error.")



