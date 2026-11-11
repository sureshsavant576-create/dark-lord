from __future__ import annotations
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.app.models.workflow import (
    ApprovalDecisionRequest,
    CommentRequest,
    ContentStatus,
    ContentVersion,
    ReviseContentRequest,
    RevisionRequest,
    SubmitContentRequest,
    WorkflowAuditLogEntry,
    WorkflowComment,
    WorkflowItem,
)
from backend.app.services.workflow_service import workflow_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflow", tags=["Organisational Content Review & Approval Workflow"])


@router.post("/items", response_model=WorkflowItem)
async def submit_content_for_review(payload: SubmitContentRequest):
    """
    Submits content for review.
    If high-risk factual or promotional claims are present, automatically escalates
    the content to an Authorised Reviewer.
    """
    try:
        return workflow_service.submit_content(payload)
    except Exception as exc:
        logger.exception("Failed to submit content for review: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to submit content for workflow review.")


@router.get("/items", response_model=List[WorkflowItem])
async def list_workflow_items(
    org_id: str = Query(..., description="Organization ID for company-level data isolation"),
    brand_id: Optional[str] = Query(default=None),
    status: Optional[ContentStatus] = Query(default=None)
):
    """
    Lists workflow items strictly scoped to the requester's organization.
    """
    return workflow_service.list_items(org_id=org_id, brand_id=brand_id, status=status)


@router.get("/items/{item_id}", response_model=WorkflowItem)
async def get_workflow_item(
    item_id: str,
    org_id: str = Query(..., description="Organization ID for company-level data isolation")
):
    """
    Retrieves workflow item details and current version analysis results.
    """
    item = workflow_service.get_item(item_id=item_id, org_id=org_id)
    if not item:
        raise HTTPException(status_code=404, detail="Workflow item not found in this organization.")
    return item


@router.post("/items/{item_id}/comments", response_model=WorkflowComment)
async def add_review_comment(
    item_id: str,
    payload: CommentRequest,
    org_id: str = Query(..., description="Organization ID for company-level data isolation")
):
    """
    Comments on specific issues or overall submission.
    Available to all authenticated roles.
    """
    try:
        return workflow_service.add_comment(item_id=item_id, org_id=org_id, req=payload)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as exc:
        logger.exception("Failed to add comment: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record review comment.")


@router.post("/items/{item_id}/revisions", response_model=WorkflowItem)
async def request_content_revision(
    item_id: str,
    payload: RevisionRequest,
    org_id: str = Query(..., description="Organization ID for company-level data isolation")
):
    """
    Requests revisions from the creator.
    Permitted roles: Manager, Authorised Reviewer, Administrator.
    """
    try:
        return workflow_service.request_revision(item_id=item_id, org_id=org_id, req=payload)
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as exc:
        logger.exception("Failed to request revision: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to request revision.")


@router.post("/items/{item_id}/revise", response_model=WorkflowItem)
async def submit_revised_version(
    item_id: str,
    payload: ReviseContentRequest,
    org_id: str = Query(..., description="Organization ID for company-level data isolation")
):
    """
    Submits an updated version addressing review feedback.
    Permitted roles: Creator, Administrator.
    """
    try:
        return workflow_service.submit_revision(item_id=item_id, org_id=org_id, req=payload)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as exc:
        logger.exception("Failed to submit revised version: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to submit revised version.")


@router.post("/items/{item_id}/decision", response_model=WorkflowItem)
async def record_approval_decision(
    item_id: str,
    payload: ApprovalDecisionRequest,
    org_id: str = Query(..., description="Organization ID for company-level data isolation")
):
    """
    Approves or rejects content.
    High-risk claims governance: If content is ESCALATED due to high-risk claims,
    approval strictly requires an Authorised Reviewer or Administrator.
    """
    try:
        return workflow_service.record_decision(item_id=item_id, org_id=org_id, req=payload)
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        logger.exception("Failed to record decision: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record approval decision.")


@router.get("/items/{item_id}/versions", response_model=List[ContentVersion])
async def get_version_history(
    item_id: str,
    org_id: str = Query(..., description="Organization ID for company-level data isolation")
):
    """
    Retrieves all historical iterations and versions of an item.
    """
    try:
        return workflow_service.get_version_history(item_id=item_id, org_id=org_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.get("/items/{item_id}/audit-trail", response_model=List[WorkflowAuditLogEntry])
async def get_approval_audit_trail(
    item_id: str,
    org_id: str = Query(..., description="Organization ID for company-level data isolation")
):
    """
    Retrieves complete, immutable audit trail of all review and approval actions.
    """
    try:
        return workflow_service.get_audit_trail(item_id=item_id, org_id=org_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
