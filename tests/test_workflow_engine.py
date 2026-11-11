import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.workflow import (
    ApprovalDecisionRequest,
    CommentRequest,
    ContentStatus,
    ReviseContentRequest,
    RevisionRequest,
    SubmitContentRequest,
    WorkflowRole,
)
from backend.app.services.workflow_service import workflow_service


@pytest.fixture(autouse=True)
def clean_workflow_db(tmp_path):
    orig_path = workflow_service.db_path
    workflow_service.db_path = tmp_path / "test_workflow_items.json"
    workflow_service._ensure_storage()
    yield
    workflow_service.db_path = orig_path


def test_submit_standard_content_for_review():
    # 1. Creator submits content for review
    req = SubmitContentRequest(
        org_id="org-acme-corp",
        brand_id="acme",
        title="Q4 Cloud Innovation Campaign",
        content_text="Accelerate your digital transformation with AcmeVibe.",
        user_id="user_creator_01",
        user_name="Alice (Creator)",
        user_role=WorkflowRole.CREATOR,
        has_high_risk_claims=False,
        compliance_score=94.0
    )
    item = workflow_service.submit_content(req)

    assert item.item_id.startswith("wf_")
    assert item.status == ContentStatus.UNDER_REVIEW
    assert item.current_version == 1
    assert len(item.versions) == 1
    assert item.versions[0].compliance_score == 94.0
    assert len(item.approval_history) == 1
    assert item.approval_history[0].action == "SUBMIT_FOR_REVIEW"
    assert item.approval_history[0].actor_role == WorkflowRole.CREATOR


def test_high_risk_claims_auto_escalation_and_permissions():
    # 2. Content with high-risk claims MUST auto-escalate to Authorised Reviewer
    req = SubmitContentRequest(
        org_id="org-acme-corp",
        brand_id="acme",
        title="Superlative Performance Ad",
        content_text="Acme is #1 in the universe with guaranteed 100% bug-free uptime.",
        user_id="user_creator_01",
        user_name="Alice (Creator)",
        user_role=WorkflowRole.CREATOR,
        has_high_risk_claims=True, # High risk claim present!
        compliance_score=42.0
    )
    item = workflow_service.submit_content(req)

    # Status must be ESCALATED
    assert item.status == ContentStatus.ESCALATED
    assert item.has_high_risk_claims is True
    assert item.escalated_to == WorkflowRole.AUTHORISED_REVIEWER.value
    assert "Mandatory escalation" in item.escalation_reason
    assert item.approval_history[0].action == "ESCALATE"

    # Governance: Manager CANNOT approve escalated content!
    mgr_approval = ApprovalDecisionRequest(
        user_id="user_mgr_01",
        user_name="Bob (Manager)",
        user_role=WorkflowRole.MANAGER,
        decision="approve",
        notes="Looks okay to me"
    )
    with pytest.raises(PermissionError) as exc_info:
        workflow_service.record_decision(item.item_id, "org-acme-corp", mgr_approval)
    assert "Governance Violation" in str(exc_info.value)
    assert "Authorised Reviewer" in str(exc_info.value)

    # Governance: Authorised Reviewer CAN approve escalated content
    reviewer_approval = ApprovalDecisionRequest(
        user_id="user_rev_01",
        user_name="Carol (Authorised Reviewer)",
        user_role=WorkflowRole.AUTHORISED_REVIEWER,
        decision="approve_with_warnings",
        notes="Approved with warning: Evidence validated in legal addendum #402."
    )
    approved_item = workflow_service.record_decision(item.item_id, "org-acme-corp", reviewer_approval)
    assert approved_item.status == ContentStatus.APPROVED_WITH_WARNINGS
    assert approved_item.assigned_reviewer == "Carol (Authorised Reviewer)"
    assert len(approved_item.approval_history) == 2
    assert approved_item.approval_history[1].action == "APPROVE_WITH_WARNINGS"


def test_commenting_and_revision_cycle():
    # 1. Submit initial draft
    req = SubmitContentRequest(
        org_id="org-acme-corp",
        brand_id="acme",
        title="Product Launch Poster",
        content_text="Get the cheapest deal in cloud computing.",
        user_id="user_creator_01",
        user_name="Alice",
        user_role=WorkflowRole.CREATOR
    )
    item = workflow_service.submit_content(req)

    # 2. Manager adds comment on issue
    cmt_req = CommentRequest(
        user_id="user_mgr_01",
        user_name="Bob",
        user_role=WorkflowRole.MANAGER,
        text="Please avoid using 'cheapest'; Acme Brand DNA requires 'accessible'.",
        target_issue_id="issue_terminology_01"
    )
    comment = workflow_service.add_comment(item.item_id, "org-acme-corp", cmt_req)
    assert comment.text.startswith("Please avoid")
    assert comment.version_number == 1

    # 3. Manager requests revision
    rev_req = RevisionRequest(
        user_id="user_mgr_01",
        user_name="Bob",
        user_role=WorkflowRole.MANAGER,
        feedback="Revise terminology and resubmit."
    )
    rev_item = workflow_service.request_revision(item.item_id, "org-acme-corp", rev_req)
    assert rev_item.status == ContentStatus.NEEDS_REVISION

    # 4. Creator submits revision (v2)
    revise_req = ReviseContentRequest(
        user_id="user_creator_01",
        user_name="Alice",
        user_role=WorkflowRole.CREATOR,
        content_text="Experience accessible enterprise cloud computing.",
        change_summary="Replaced 'cheapest' with 'accessible' per brand guidelines.",
        compliance_score=98.0
    )
    v2_item = workflow_service.submit_revision(item.item_id, "org-acme-corp", revise_req)
    assert v2_item.current_version == 2
    assert len(v2_item.versions) == 2
    assert v2_item.status == ContentStatus.UNDER_REVIEW
    assert "accessible" in v2_item.versions[1].content_text

    # 5. Review previous versions
    versions = workflow_service.get_version_history(item.item_id, "org-acme-corp")
    assert len(versions) == 2
    assert versions[0].version_number == 1
    assert versions[1].version_number == 2

    # 6. Audit trail tracking
    trail = workflow_service.get_audit_trail(item.item_id, "org-acme-corp")
    actions = [t.action for t in trail]
    assert "SUBMIT_FOR_REVIEW" in actions
    assert "COMMENT" in actions
    assert "REQUEST_REVISION" in actions
    assert "REVISE" in actions


def test_company_level_data_isolation():
    # Submit item for Org A
    req = SubmitContentRequest(
        org_id="org-alpha",
        brand_id="alpha-brand",
        title="Alpha Confidential",
        content_text="Alpha secret launch copy",
        user_id="user_a",
        user_name="Alice",
        user_role=WorkflowRole.CREATOR
    )
    item = workflow_service.submit_content(req)

    # Org B must NOT be able to access Org A's item
    item_for_org_b = workflow_service.get_item(item.item_id, org_id="org-beta")
    assert item_for_org_b is None

    # Org B listing must be empty
    list_b = workflow_service.list_items(org_id="org-beta")
    assert len(list_b) == 0

    # Org A listing must have 1 item
    list_a = workflow_service.list_items(org_id="org-alpha")
    assert len(list_a) == 1
    assert list_a[0].title == "Alpha Confidential"


def test_api_workflow_endpoints():
    client = TestClient(app)

    # 1. Submit content via API
    submit_payload = {
        "org_id": "org-test-api",
        "brand_id": "test-brand",
        "title": "API Launch Test",
        "content_text": "Groundbreaking velocity for cloud apps",
        "user_id": "api_creator",
        "user_name=" : "Dave",
        "user_name": "Dave",
        "user_role": "Creator"
    }
    r = client.post("/api/v1/workflow/items", json=submit_payload)
    assert r.status_code == 200
    data = r.json()
    item_id = data["item_id"]
    assert data["status"] == "Under Review"

    # 2. Add Comment via API
    cmt_payload = {
        "user_id": "api_mgr",
        "user_name": "Eve",
        "user_role": "Manager",
        "text": "Check typography hierarchy."
    }
    r2 = client.post(f"/api/v1/workflow/items/{item_id}/comments?org_id=org-test-api", json=cmt_payload)
    assert r2.status_code == 200
    assert r2.json()["text"] == "Check typography hierarchy."

    # 3. Decision (Approve) via API
    dec_payload = {
        "user_id": "api_mgr",
        "user_name": "Eve",
        "user_role": "Manager",
        "decision": "approve",
        "notes": "Verified and passed."
    }
    r3 = client.post(f"/api/v1/workflow/items/{item_id}/decision?org_id=org-test-api", json=dec_payload)
    assert r3.status_code == 200
    assert r3.json()["status"] == "Approved"

    # 4. View Audit Trail via API
    r4 = client.get(f"/api/v1/workflow/items/{item_id}/audit-trail?org_id=org-test-api")
    assert r4.status_code == 200
    trail = r4.json()
    assert len(trail) >= 3
