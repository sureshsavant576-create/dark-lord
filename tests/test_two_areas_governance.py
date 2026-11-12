from __future__ import annotations

import uuid
from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _register_company(name: str, email: str, password: str = "EnterprisePass2026!"):
    res = client.post(
        "/api/v1/orgs/register",
        json={
            "company_name": name,
            "industry": "Enterprise Technology",
            "primary_domain": f"{name.lower().replace(' ', '')}.io",
            "business_description": f"AI platform built by {name}",
            "admin_name": f"{name} Owner",
            "admin_email": email,
            "admin_password": password,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_two_areas_company_registration_team_invites_and_developer_boundaries():
    tag = _unique("alpha")
    alpha_email = f"admin-{tag}@alpha.io"
    alpha_reg = _register_company(f"Alpha Corp {tag}", alpha_email)
    alpha_org = alpha_reg["org_id"]
    alpha_admin_headers = {"Authorization": f"Bearer {alpha_reg['session_token']}"}

    assert alpha_reg["role"] == "admin"
    assert alpha_reg["role_label"] == "Administrator"

    # Area 1: Admin updates company details & retrieves current org
    upd = client.put(
        f"/api/v1/orgs/current?org_id={alpha_org}",
        headers=alpha_admin_headers,
        json={"industry": "Zero-Trust Cloud", "subscription_tier": "Enterprise Governance"},
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["industry"] == "Zero-Trust Cloud"

    # Area 1: Admin invites a Creator and a Developer
    creator_email = f"creator-{tag}@alpha.io"
    inv_creator = client.post(
        f"/api/v1/orgs/invitations?org_id={alpha_org}",
        headers=alpha_admin_headers,
        json={
            "email": creator_email,
            "role": "Creator",
            "department": "Marketing",
        },
    )
    assert inv_creator.status_code == 200, inv_creator.text
    creator_code = inv_creator.json()["invite_code"]

    dev_email = f"dev-{tag}@alpha.io"
    inv_dev = client.post(
        f"/api/v1/orgs/invitations?org_id={alpha_org}",
        headers=alpha_admin_headers,
        json={
            "email": dev_email,
            "role": "Developer",
            "department": "Platform Engineering",
        },
    )
    assert inv_dev.status_code == 200, inv_dev.text
    dev_code = inv_dev.json()["invite_code"]

    # Employees accept invitations and join Company Alpha
    acc_creator = client.post(
        "/api/v1/orgs/invitations/accept",
        json={
            "invite_code": creator_code,
            "email": creator_email,
            "full_name": "Clara Creator",
            "password": "CreatorPass2026!",
        },
    )
    assert acc_creator.status_code == 200, acc_creator.text
    creator_data = acc_creator.json()
    assert creator_data["org_id"] == alpha_org
    assert creator_data["role"] == "viewer"
    assert creator_data["role_label"] == "Creator"

    acc_dev = client.post(
        "/api/v1/orgs/invitations/accept",
        json={
            "invite_code": dev_code,
            "email": dev_email,
            "full_name": "Devon Developer",
            "password": "DeveloperPass2026!",
        },
    )
    assert acc_dev.status_code == 200, acc_dev.text
    dev_data = acc_dev.json()
    assert dev_data["org_id"] == alpha_org
    assert dev_data["role"] == "developer"
    assert dev_data["role_label"] == "Developer"
    dev_headers = {"Authorization": f"Bearer {dev_data['session_token']}"}

    # Area 1: Admin can list users and assign role labels
    roster = client.get(f"/api/v1/orgs/users?org_id={alpha_org}", headers=alpha_admin_headers)
    assert roster.status_code == 200, roster.text
    emails = [u["email"] for u in roster.json()]
    assert alpha_email in emails
    assert creator_email in emails
    assert dev_email in emails

    role_upd = client.put(
        f"/api/v1/orgs/users/{creator_data['user_id']}/role?org_id={alpha_org}",
        headers=alpha_admin_headers,
        json={"role": "Manager"},
    )
    assert role_upd.status_code == 200, role_upd.text
    assert role_upd.json()["role_label"] == "Manager"

    # Area 1: Admin creates public/internal & confidential knowledge items + Brand DNA
    kb_public = client.post(
        "/api/v1/knowledge/items",
        headers=alpha_admin_headers,
        json={
            "org_id": alpha_org,
            "brand_id": alpha_org,
            "category": "COMPANY_FACT",
            "title": "Public Architecture Spec",
            "content": "Alpha Corp uses redundant Kubernetes clusters.",
            "is_approved": True,
            "confidentiality_level": "INTERNAL",
        },
    )
    assert kb_public.status_code == 200, kb_public.text

    kb_secret = client.post(
        "/api/v1/knowledge/items",
        headers=alpha_admin_headers,
        json={
            "org_id": alpha_org,
            "brand_id": alpha_org,
            "category": "PROHIBITED_MESSAGING",
            "title": "Executive M&A Embargo",
            "content": "Confidential unannounced merger strategy.",
            "is_approved": True,
            "confidentiality_level": "CONFIDENTIAL",
            "tags": ["confidential", "executive"],
        },
    )
    assert kb_secret.status_code == 200, kb_secret.text
    secret_item_id = kb_secret.json()["item_id"]

    # Developer Permission Checks:
    # 1) Developer CAN update technical integration fields
    dev_tech = client.put(
        f"/api/v1/orgs/current?org_id={alpha_org}",
        headers=dev_headers,
        json={"ai_provider_preference": "groq", "api_webhook_url": "https://hooks.alpha.io/brand"},
    )
    assert dev_tech.status_code == 200, dev_tech.text
    assert dev_tech.json()["ai_provider_preference"] == "groq"

    # 2) Developer CANNOT modify company business profile or invite team members
    dev_org_mutate = client.put(
        f"/api/v1/orgs/current?org_id={alpha_org}",
        headers=dev_headers,
        json={"company_name": "Hijacked Name"},
    )
    assert dev_org_mutate.status_code == 403

    dev_invite = client.post(
        f"/api/v1/orgs/invitations?org_id={alpha_org}",
        headers=dev_headers,
        json={"email": "rogue@alpha.io", "role": "Administrator", "department": "Security"},
    )
    assert dev_invite.status_code == 403

    # 3) Developer CANNOT see confidential company documents or audit logs
    dev_kb_list = client.get(f"/api/v1/knowledge/items?org_id={alpha_org}", headers=dev_headers)
    assert dev_kb_list.status_code == 200, dev_kb_list.text
    returned_ids = [i["item_id"] for i in dev_kb_list.json()]
    assert kb_public.json()["item_id"] in returned_ids
    assert secret_item_id not in returned_ids

    dev_kb_secret = client.get(
        f"/api/v1/knowledge/items/{secret_item_id}?org_id={alpha_org}",
        headers=dev_headers,
    )
    assert dev_kb_secret.status_code == 403

    dev_audit = client.get(f"/api/v1/audit/logs?org_id={alpha_org}", headers=dev_headers)
    assert dev_audit.status_code == 403

    # Area 2: Creator logs in via email/password and runs copy check + workflow submission
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": f"creator-{tag}@alpha.io", "password": "CreatorPass2026!"},
    )
    assert login_res.status_code == 200, login_res.text
    creator_fresh_headers = {"Authorization": f"Bearer {login_res.json()['session_token']}"}

    review_res = client.post(
        "/api/v1/reviews/audit",
        headers=creator_fresh_headers,
        json={
            "org_id": alpha_org,
            "brand_id": alpha_org,
            "copy_text": "Alpha Corp cloud infrastructure built for security teams.",
            "content_type": "social_media_creative",
        },
    )
    assert review_res.status_code == 200, review_res.text

    wf_submit = client.post(
        "/api/v1/workflow/items",
        headers=creator_fresh_headers,
        json={
            "org_id": alpha_org,
            "brand_id": alpha_org,
            "title": "Q4 Launch Copy",
            "content_type": "social_media_creative",
            "user_id": creator_data["user_id"],
            "user_name": "Clara Creator",
            "content_text": "Alpha Corp cloud infrastructure built for security teams.",
        },
    )
    assert wf_submit.status_code == 200, wf_submit.text


def test_strict_cross_company_isolation_even_between_company_admins():
    tag_a = _unique("co-a")
    tag_b = _unique("co-b")
    co_a = _register_company(f"Company A {tag_a}", f"admin-{tag_a}@companya.io")
    co_b = _register_company(f"Company B {tag_b}", f"admin-{tag_b}@companyb.io")

    headers_a = {"Authorization": f"Bearer {co_a['session_token']}"}
    headers_b = {"Authorization": f"Bearer {co_b['session_token']}"}
    org_a = co_a["org_id"]
    org_b = co_b["org_id"]
    assert org_a != org_b

    # Company B creates an isolated Knowledge Base item & workflow item
    kb_b = client.post(
        "/api/v1/knowledge/items",
        headers=headers_b,
        json={
            "org_id": org_b,
            "brand_id": org_b,
            "category": "COMPANY_FACT",
            "title": "Company B Exclusive Fact",
            "content": "Proprietary Company B formula.",
            "is_approved": True,
        },
    )
    assert kb_b.status_code == 200, kb_b.text

    # Company A Admin is strictly blocked (403) from reading or mutating Company B resources
    assert client.get(f"/api/v1/orgs/current?org_id={org_b}", headers=headers_a).status_code == 403
    assert client.get(f"/api/v1/orgs/users?org_id={org_b}", headers=headers_a).status_code == 403
    assert client.get(f"/api/v1/knowledge/items?org_id={org_b}", headers=headers_a).status_code == 403
    assert client.get(f"/api/v1/workflow/items?org_id={org_b}", headers=headers_a).status_code == 403
    assert client.get(f"/api/v1/audit/logs?org_id={org_b}", headers=headers_a).status_code == 403
    assert client.get(f"/api/v1/reviews?org_id={org_b}", headers=headers_a).status_code == 403
