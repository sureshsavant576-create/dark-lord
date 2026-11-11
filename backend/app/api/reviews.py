from __future__ import annotations
import logging
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from backend.app.core.config import settings
from backend.app.core.security import (
    get_tenant_storage_path,
    inspect_file_magic_bytes,
    safe_join_path,
    sanitize_filename,
    sanitize_org_id,
)
from backend.app.models.audit import AuditEventSeverity, AuditEventType
from backend.app.models.content_review import (
    ContentType,
    ContentReviewReport,
    ContentReviewRequest,
)
from backend.app.services.audit_service import audit_service
from backend.app.services.content_review_service import content_review_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reviews", tags=["AI Content Review System"])


@router.post("/audit", response_model=ContentReviewReport)
async def audit_content(request: ContentReviewRequest):
    """
    Analyzes submitted creative copy or asset against the organisation's approved
    Brand DNA and official Knowledge Base.
    Detects 10 categories:
    1. Incorrect brand tone
    2. Terminology inconsistencies
    3. Messaging mismatches
    4. Visual identity violations
    5. Incorrect logo usage
    6. Colour inconsistencies
    7. Typography inconsistencies
    8. Unsupported promotional claims
    9. Incorrect or outdated information
    10. Accessibility problems
    """
    try:
        return await content_review_service.review_content(request)
    except Exception as exc:
        logger.error("Content review failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Review analysis failed: {str(exc)}")


@router.post("/upload", response_model=ContentReviewReport)
async def upload_and_review_creative(
    file: UploadFile = File(...),
    brand_id: str = Form(...),
    org_id: str = Form(default="default-org"),
    content_type: ContentType = Form(default=ContentType.MARKETING_AD),
    copy_text: Optional[str] = Form(default=None),
    campaign_context: Optional[str] = Form(default=None)
):
    """
    Uploads a poster, image, PDF, or creative asset and performs an end-to-end
    content audit using Tesseract OCR, OpenCV, Groq Vision, and Gemini Text against
    the Brand Knowledge Base.
    Enforces magic-bytes verification, organization tenant isolation, and audit logging.
    """
    clean_org = sanitize_org_id(org_id)

    try:
        content_bytes = await file.read()
    except Exception as read_err:
        raise HTTPException(status_code=400, detail=f"Failed to read upload stream: {read_err}")

    # 1. Magic bytes validation
    is_valid, detected_mime, message = inspect_file_magic_bytes(content_bytes, file.filename or "creative.png")
    if not is_valid:
        audit_service.log_event(
            event_type=AuditEventType.ACCESS_DENIED,
            org_id=clean_org,
            severity=AuditEventSeverity.WARNING,
            resource_type="creative_upload",
            resource_id=file.filename or "unknown",
            action="UPLOAD_REJECTED_MAGIC_BYTES",
            details={"reason": message, "filename": file.filename},
            success=False
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Upload rejected: {message}"
        )

    # 2. Store in tenant-isolated directory
    tenant_dir = get_tenant_storage_path(clean_org, subfolder="uploads")
    ext = Path(file.filename or "creative.png").suffix.lower()
    safe_name = sanitize_filename(f"creative_{uuid.uuid4().hex[:8]}{ext}")
    dest_path = safe_join_path(tenant_dir, safe_name)

    try:
        dest_path.write_bytes(content_bytes)

        # Audit file upload
        audit_service.log_event(
            event_type=AuditEventType.FILE_UPLOAD,
            org_id=clean_org,
            resource_type="creative_asset",
            resource_id=safe_name,
            action="CREATIVE_UPLOAD_SUCCESS",
            details={
                "detected_mime": detected_mime,
                "size_bytes": len(content_bytes),
                "brand_id": brand_id,
            },
            success=True
        )

        req = ContentReviewRequest(
            org_id=clean_org,
            brand_id=brand_id,
            content_type=content_type,
            copy_text=copy_text,
            file_path=str(dest_path),
            campaign_context=campaign_context
        )

        report = await content_review_service.review_content(req)

        # Audit content review completion
        audit_service.log_event(
            event_type=AuditEventType.REVIEW_SUBMITTED,
            org_id=clean_org,
            resource_type="content_review",
            resource_id=report.review_id,
            action="CREATIVE_AUDIT_COMPLETED",
            details={
                "overall_score": report.overall_score,
                "is_approved": report.is_approved,
                "detected_issues_count": len(report.detected_issues)
            },
            success=True
        )

        return report

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("File upload review failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Creative upload audit failed: {str(exc)}")
