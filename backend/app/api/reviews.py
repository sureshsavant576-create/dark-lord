from __future__ import annotations
import logging
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.core.config import settings
from backend.app.models.content_review import (
    ContentType,
    ContentReviewReport,
    ContentReviewRequest,
)
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
    """
    settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix.lower() if file.filename else ".png"
    safe_name = f"creative_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = settings.UPLOADS_DIR / safe_name

    try:
        content_bytes = await file.read()
        dest_path.write_bytes(content_bytes)

        req = ContentReviewRequest(
            org_id=org_id,
            brand_id=brand_id,
            content_type=content_type,
            copy_text=copy_text,
            file_path=str(dest_path),
            campaign_context=campaign_context
        )

        return await content_review_service.review_content(req)

    except Exception as exc:
        logger.error("File upload review failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Creative upload audit failed: {str(exc)}")
