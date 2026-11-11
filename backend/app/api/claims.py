from __future__ import annotations
import logging
from typing import Any, Dict
from fastapi import APIRouter, HTTPException

from backend.app.models.claim_verification import (
    ClaimVerificationReport,
    ClaimVerificationRequest,
    HumanClaimReviewDecision,
)
from backend.app.services.claim_verification_service import claim_verification_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/claims", tags=["Promotional Claim Verification Engine"])


@router.post("/verify", response_model=ClaimVerificationReport)
async def verify_claims_endpoint(request: ClaimVerificationRequest):
    """
    Audits creative copy and media assets against the organization's approved
    Brand Knowledge Base to detect and verify promotional claims.

    Classifies findings into:
    1. Verified against approved evidence
    2. Unsupported
    3. Contradictory
    4. Potentially outdated
    5. Requires human verification

    Enforces:
    - Never assume a claim is true based only on AI model knowledge.
    - High-risk claims must require authorised human review.
    """
    try:
        return await claim_verification_engine.verify_claims(request)
    except Exception as exc:
        logger.error("Claim verification execution failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Claim verification failed: {str(exc)}")


@router.post("/human-review")
def submit_human_review_decision(decision: HumanClaimReviewDecision):
    """
    Records an authorized human compliance review decision for high-risk claims
    (General Counsel, Chief Compliance Officer, Brand Director).
    """
    try:
        return claim_verification_engine.record_human_decision(decision)
    except Exception as exc:
        logger.error("Failed to record human claim decision: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to record review: {str(exc)}")
