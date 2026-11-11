from __future__ import annotations
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional
import uuid

from backend.app.core.config import settings
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
    WorkflowRole,
)

logger = logging.getLogger(__name__)


class WorkflowService:
    """
    Enterprise Organizational Content Review & Approval Workflow Engine.
    Enforces role-based permissions, company-level data isolation, version history,
    commenting, revision tracking, immutable audit trails, and automatic escalation of
    high-risk promotional/factual claims to Authorised Reviewers.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (settings.DB_DIR / "workflow_items.json")
        self._lock = threading.RLock()
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self.db_path.write_text("{}", encoding="utf-8")

    def _load_all(self) -> Dict[str, dict]:
        with self._lock:
            try:
                content = self.db_path.read_text(encoding="utf-8").strip()
                return json.loads(content) if content else {}
            except Exception as e:
                logger.error("Failed to load workflow database: %s", e)
                return {}

    def _save_all(self, data: Dict[str, dict]) -> None:
        with self._lock:
            tmp = self.db_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            tmp.replace(self.db_path)

    # -------------------------------------------------------------------------
    # 1. SUBMIT CONTENT FOR REVIEW
    # -------------------------------------------------------------------------

    def submit_content(self, req: SubmitContentRequest) -> WorkflowItem:
        """
        Submits new content for review.
        If high-risk factual or promotional claims are present, automatically escalates
        to an Authorised Reviewer.
        """
        now = datetime.now(timezone.utc).isoformat()
        item_id = f"wf_{uuid.uuid4().hex[:10]}"

        # Determine initial status: Escalated if high-risk claims detected
        initial_status = ContentStatus.UNDER_REVIEW
        escalated_to = None
        escalation_reason = None

        if req.has_high_risk_claims:
            initial_status = ContentStatus.ESCALATED
            escalated_to = WorkflowRole.AUTHORISED_REVIEWER.value
            escalation_reason = (
                "Mandatory escalation: High-risk promotional or factual claims detected. "
                "Requires authorized human review under corporate brand governance."
            )

        v1 = ContentVersion(
            version_number=1,
            content_text=req.content_text,
            image_url=req.image_url,
            submitted_by=req.user_name,
            submitted_at=now,
            change_summary="Initial submission",
            analysis_report_id=req.analysis_report_id,
            compliance_score=req.compliance_score,
            findings_summary=req.findings_summary,
            has_high_risk_claims=req.has_high_risk_claims
        )

        audit_entry = WorkflowAuditLogEntry(
            entry_id=f"audit_{uuid.uuid4().hex[:8]}",
            item_id=item_id,
            timestamp=now,
            actor_id=req.user_id,
            actor_name=req.user_name,
            actor_role=req.user_role,
            action="ESCALATE" if req.has_high_risk_claims else "SUBMIT_FOR_REVIEW",
            from_status=ContentStatus.DRAFT,
            to_status=initial_status,
            details=escalation_reason or f"Submitted version 1 for brand compliance review by {req.user_name} ({req.user_role.value}).",
            org_id=req.org_id
        )

        item = WorkflowItem(
            item_id=item_id,
            org_id=req.org_id,
            brand_id=req.brand_id,
            title=req.title,
            status=initial_status,
            current_version=1,
            versions=[v1],
            comments=[],
            approval_history=[audit_entry],
            has_high_risk_claims=req.has_high_risk_claims,
            escalated_to=escalated_to,
            escalation_reason=escalation_reason,
            created_by=req.user_name,
            created_at=now,
            updated_at=now
        )

        with self._lock:
            data = self._load_all()
            data[item_id] = item.model_dump()
            self._save_all(data)

        logger.info(
            "Created workflow item %s for org '%s' (status: %s, role: %s)",
            item_id, req.org_id, initial_status.value, req.user_role.value
        )
        return item

    # -------------------------------------------------------------------------
    # 2. VIEW ITEM & COMPANY-LEVEL ISOLATION
    # -------------------------------------------------------------------------

    def get_item(self, item_id: str, org_id: str) -> Optional[WorkflowItem]:
        """
        Retrieves a workflow item strictly partitioned by org_id for confidentiality.
        """
        data = self._load_all()
        raw = data.get(item_id)
        if not raw or raw.get("org_id") != org_id:
            return None
        return WorkflowItem(**raw)

    def list_items(
        self,
        org_id: str,
        brand_id: Optional[str] = None,
        status: Optional[ContentStatus] = None
    ) -> List[WorkflowItem]:
        """
        Lists all workflow items for an organization with optional brand and status filtering.
        """
        data = self._load_all()
        results = []
        for raw in data.values():
            if raw.get("org_id") != org_id:
                continue
            if brand_id and raw.get("brand_id") != brand_id:
                continue
            if status and raw.get("status") != status.value:
                continue
            results.append(WorkflowItem(**raw))

        return sorted(results, key=lambda x: x.updated_at, reverse=True)

    # -------------------------------------------------------------------------
    # 3. COMMENT ON ISSUES
    # -------------------------------------------------------------------------

    def add_comment(self, item_id: str, org_id: str, req: CommentRequest) -> WorkflowComment:
        """
        Adds a collaborative review comment to a specific version or issue.
        Available to all authenticated roles.
        """
        item = self.get_item(item_id, org_id)
        if not item:
            raise ValueError(f"Workflow item '{item_id}' not found in organization.")

        now = datetime.now(timezone.utc).isoformat()
        comment = WorkflowComment(
            comment_id=f"cmt_{uuid.uuid4().hex[:8]}",
            item_id=item_id,
            version_number=item.current_version,
            user_id=req.user_id,
            user_name=req.user_name,
            role=req.user_role,
            text=req.text,
            target_issue_id=req.target_issue_id,
            created_at=now
        )

        audit_entry = WorkflowAuditLogEntry(
            entry_id=f"audit_{uuid.uuid4().hex[:8]}",
            item_id=item_id,
            timestamp=now,
            actor_id=req.user_id,
            actor_name=req.user_name,
            actor_role=req.user_role,
            action="COMMENT",
            from_status=item.status,
            to_status=item.status,
            details=f"Comment added by {req.user_name} ({req.user_role.value}): {req.text[:50]}...",
            org_id=org_id
        )

        item.comments.append(comment)
        item.approval_history.append(audit_entry)
        item.updated_at = now

        with self._lock:
            data = self._load_all()
            data[item_id] = item.model_dump()
            self._save_all(data)

        return comment

    # -------------------------------------------------------------------------
    # 4. REQUEST REVISIONS
    # -------------------------------------------------------------------------

    def request_revision(self, item_id: str, org_id: str, req: RevisionRequest) -> WorkflowItem:
        """
        Transitions status to NEEDS_REVISION.
        Permission: Manager, Authorised Reviewer, Administrator.
        Creators cannot request revisions of their own items.
        """
        item = self.get_item(item_id, org_id)
        if not item:
            raise ValueError(f"Workflow item '{item_id}' not found.")

        # Role Permission Check
        if req.user_role == WorkflowRole.CREATOR:
            raise PermissionError("Creators cannot request revisions. Only Managers, Reviewers, or Admins may request revisions.")

        now = datetime.now(timezone.utc).isoformat()
        prev_status = item.status
        item.status = ContentStatus.NEEDS_REVISION
        item.updated_at = now

        audit_entry = WorkflowAuditLogEntry(
            entry_id=f"audit_{uuid.uuid4().hex[:8]}",
            item_id=item_id,
            timestamp=now,
            actor_id=req.user_id,
            actor_name=req.user_name,
            actor_role=req.user_role,
            action="REQUEST_REVISION",
            from_status=prev_status,
            to_status=ContentStatus.NEEDS_REVISION,
            details=f"Revision requested by {req.user_name} ({req.user_role.value}): {req.feedback}",
            org_id=org_id
        )
        item.approval_history.append(audit_entry)

        # Add comment with feedback
        feedback_comment = WorkflowComment(
            comment_id=f"cmt_{uuid.uuid4().hex[:8]}",
            item_id=item_id,
            version_number=item.current_version,
            user_id=req.user_id,
            user_name=req.user_name,
            role=req.user_role,
            text=f"REVISION REQUESTED: {req.feedback}",
            created_at=now
        )
        item.comments.append(feedback_comment)

        with self._lock:
            data = self._load_all()
            data[item_id] = item.model_dump()
            self._save_all(data)

        return item

    # -------------------------------------------------------------------------
    # 5. SUBMIT REVISED VERSION
    # -------------------------------------------------------------------------

    def submit_revision(self, item_id: str, org_id: str, req: ReviseContentRequest) -> WorkflowItem:
        """
        Submits an updated version (e.g. v2, v3) addressing feedback.
        Resets status to UNDER_REVIEW (or ESCALATED if high-risk claims persist).
        """
        item = self.get_item(item_id, org_id)
        if not item:
            raise ValueError(f"Workflow item '{item_id}' not found.")

        now = datetime.now(timezone.utc).isoformat()
        prev_status = item.status
        new_version_num = item.current_version + 1

        # Check for persistent high-risk claims
        new_status = ContentStatus.UNDER_REVIEW
        escalated_to = None
        escalation_reason = None

        if req.has_high_risk_claims:
            new_status = ContentStatus.ESCALATED
            escalated_to = WorkflowRole.AUTHORISED_REVIEWER.value
            escalation_reason = "Escalated to Authorised Reviewer: Revised content contains high-risk claims."

        new_version = ContentVersion(
            version_number=new_version_num,
            content_text=req.content_text,
            image_url=req.image_url,
            submitted_by=req.user_name,
            submitted_at=now,
            change_summary=req.change_summary,
            analysis_report_id=req.analysis_report_id,
            compliance_score=req.compliance_score,
            findings_summary=req.findings_summary,
            has_high_risk_claims=req.has_high_risk_claims
        )

        audit_entry = WorkflowAuditLogEntry(
            entry_id=f"audit_{uuid.uuid4().hex[:8]}",
            item_id=item_id,
            timestamp=now,
            actor_id=req.user_id,
            actor_name=req.user_name,
            actor_role=req.user_role,
            action="REVISE",
            from_status=prev_status,
            to_status=new_status,
            details=f"Submitted version {new_version_num} by {req.user_name}: {req.change_summary}",
            org_id=org_id
        )

        item.versions.append(new_version)
        item.current_version = new_version_num
        item.status = new_status
        item.has_high_risk_claims = req.has_high_risk_claims
        item.escalated_to = escalated_to
        item.escalation_reason = escalation_reason
        item.approval_history.append(audit_entry)
        item.updated_at = now

        with self._lock:
            data = self._load_all()
            data[item_id] = item.model_dump()
            self._save_all(data)

        return item

    # -------------------------------------------------------------------------
    # 6. APPROVE OR REJECT CONTENT (WITH HIGH-RISK CLAIM RESTRICTIONS)
    # -------------------------------------------------------------------------

    def record_decision(self, item_id: str, org_id: str, req: ApprovalDecisionRequest) -> WorkflowItem:
        """
        Approves (Approved / Approved with Warnings) or Rejects content.
        CRITICAL GOVERNANCE ENFORCEMENT:
        - If the item contains high-risk claims (ESCALATED), only an Authorised Reviewer
          or Administrator may approve. Managers cannot bypass escalation!
        - Creators can never approve or reject.
        """
        item = self.get_item(item_id, org_id)
        if not item:
            raise ValueError(f"Workflow item '{item_id}' not found.")

        # 1. Role Permission Check: Creators cannot approve/reject
        if req.user_role == WorkflowRole.CREATOR:
            raise PermissionError("Creators do not have permission to approve or reject content submissions.")

        # 2. High-Risk Claim Governance Check
        is_approval = req.decision.lower() in ("approve", "approved", "approve_with_warnings")
        if is_approval and (item.status == ContentStatus.ESCALATED or item.has_high_risk_claims):
            if req.user_role not in (WorkflowRole.AUTHORISED_REVIEWER, WorkflowRole.ADMINISTRATOR):
                raise PermissionError(
                    f"Governance Violation: Content is ESCALATED due to high-risk promotional/factual claims. "
                    f"Approval requires an Authorised Reviewer or Administrator. '{req.user_role.value}' is unauthorized."
                )

        now = datetime.now(timezone.utc).isoformat()
        prev_status = item.status

        # Determine target status
        dec_lower = req.decision.lower()
        if "warning" in dec_lower:
            target_status = ContentStatus.APPROVED_WITH_WARNINGS
            action_name = "APPROVE_WITH_WARNINGS"
        elif "approve" in dec_lower:
            target_status = ContentStatus.APPROVED
            action_name = "APPROVE"
        elif "reject" in dec_lower:
            target_status = ContentStatus.REJECTED
            action_name = "REJECT"
        else:
            raise ValueError(f"Unknown decision '{req.decision}'. Expected approve, approve_with_warnings, or reject.")

        item.status = target_status
        item.assigned_reviewer = req.user_name
        item.updated_at = now

        audit_entry = WorkflowAuditLogEntry(
            entry_id=f"audit_{uuid.uuid4().hex[:8]}",
            item_id=item_id,
            timestamp=now,
            actor_id=req.user_id,
            actor_name=req.user_name,
            actor_role=req.user_role,
            action=action_name,
            from_status=prev_status,
            to_status=target_status,
            details=f"Decision '{target_status.value}' rendered by {req.user_name} ({req.user_role.value}). Notes: {req.notes or 'None'}",
            org_id=org_id
        )
        item.approval_history.append(audit_entry)

        with self._lock:
            data = self._load_all()
            data[item_id] = item.model_dump()
            self._save_all(data)

        logger.info(
            "Workflow item %s transitioned from %s to %s by %s (%s)",
            item_id, prev_status.value, target_status.value, req.user_name, req.user_role.value
        )
        return item

    # -------------------------------------------------------------------------
    # 7. VIEW PREVIOUS VERSIONS & 8. TRACK APPROVAL HISTORY
    # -------------------------------------------------------------------------

    def get_version_history(self, item_id: str, org_id: str) -> List[ContentVersion]:
        """
        Returns all historical iterations and versions of an item.
        """
        item = self.get_item(item_id, org_id)
        if not item:
            raise ValueError(f"Workflow item '{item_id}' not found.")
        return item.versions

    def get_audit_trail(self, item_id: str, org_id: str) -> List[WorkflowAuditLogEntry]:
        """
        Returns the complete, immutable audit trail of actions.
        """
        item = self.get_item(item_id, org_id)
        if not item:
            raise ValueError(f"Workflow item '{item_id}' not found.")
        return item.approval_history


workflow_service = WorkflowService()
