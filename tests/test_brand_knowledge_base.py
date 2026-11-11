import pytest
from datetime import datetime, timezone
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.knowledge_base import (
    ClaimEvidence,
    KnowledgeCategory,
    KnowledgeItemCreate,
    KnowledgeItemUpdate,
    KnowledgeProvenance,
    KnowledgeSearchQuery,
    PolicyExceptionData,
)
from backend.app.services.knowledge_service import (
    KnowledgeBaseService,
    cosine_similarity,
    generate_semantic_embedding,
    knowledge_service,
)

client = TestClient(app)


def test_knowledge_base_provenance_rule_6():
    """
    Requirement 6: Never treat AI-generated recommendations as official company facts without approval.
    Attempts to create an unapproved AI recommendation marked as approved must be rejected.
    """
    test_svc = KnowledgeBaseService(
        db_path=Path("data/db/test_kb.json"),
        history_path=Path("data/db/test_kb_hist.json")
    )

    with pytest.raises(ValueError) as exc:
        test_svc.create_item(KnowledgeItemCreate(
            org_id="org-test-security",
            brand_id="test-brand",
            category=KnowledgeCategory.COMPANY_FACT,
            title="Unverified AI Claim",
            content="AI hallucinated company fact",
            provenance=KnowledgeProvenance.UNAPPROVED_AI,
            is_approved=True  # FORBIDDEN: unapproved AI cannot be marked approved
        ))

    assert "Violation" in str(exc.value) or "approval" in str(exc.value)


def test_knowledge_base_multi_tenant_isolation():
    """
    Requirement 1: Store information separately for each organisation.
    Tenant A (org-alpha) and Tenant B (org-beta) must have complete data confidentiality.
    """
    test_svc = KnowledgeBaseService(
        db_path=Path("data/db/test_kb_iso.json"),
        history_path=Path("data/db/test_kb_hist_iso.json")
    )

    # Org Alpha creates secret guideline
    item_alpha = test_svc.create_item(KnowledgeItemCreate(
        org_id="org-alpha",
        brand_id="brand-alpha",
        category=KnowledgeCategory.COMPANY_FACT,
        title="Confidential Merger Fact Alpha",
        content="Alpha will acquire competitor Beta in Q4.",
        provenance=KnowledgeProvenance.COMPANY_FACT,
        is_approved=True
    ))

    # Org Beta creates standard guideline
    item_beta = test_svc.create_item(KnowledgeItemCreate(
        org_id="org-beta",
        brand_id="brand-beta",
        category=KnowledgeCategory.COMPANY_FACT,
        title="Public Product Launch Beta",
        content="Beta launches smart sneakers in Q3.",
        provenance=KnowledgeProvenance.COMPANY_FACT,
        is_approved=True
    ))

    # Org Beta attempts to list items: must ONLY see Org Beta items
    beta_items = test_svc.list_items(org_id="org-beta")
    beta_titles = [i.title for i in beta_items]
    assert "Public Product Launch Beta" in beta_titles
    assert "Confidential Merger Fact Alpha" not in beta_titles

    # Org Beta attempts to directly fetch Alpha's secret item: must return None
    cross_tenant_item = test_svc.get_item(item_id=item_alpha.item_id, org_id="org-beta")
    assert cross_tenant_item is None

    # Org Beta attempts to update Alpha's item: must raise PermissionError
    with pytest.raises(PermissionError):
        test_svc.update_item(
            item_id=item_alpha.item_id,
            org_id="org-beta",
            update_in=KnowledgeItemUpdate(
                title="Tampered Title",
                changed_by="malicious-actor",
                change_reason="Unauthorized tamper attempt"
            )
        )


def test_knowledge_base_updating_and_versioning():
    """
    Requirement 4: Support updating and versioning of guidelines.
    Ensures immutable version snapshot history and version number incrementation.
    """
    test_svc = KnowledgeBaseService(
        db_path=Path("data/db/test_kb_ver.json"),
        history_path=Path("data/db/test_kb_hist_ver.json")
    )

    created = test_svc.create_item(KnowledgeItemCreate(
        org_id="org-corp",
        brand_id="corp-brand",
        category=KnowledgeCategory.GUIDELINE,
        title="Editorial Guidelines v1",
        content="Headline copy should be concise.",
        provenance=KnowledgeProvenance.OFFICIAL_POLICY,
        is_approved=True,
        version_notes="Initial baseline editorial guideline"
    ))
    assert created.version == 1

    # Update guideline to v2
    updated_v2 = test_svc.update_item(
        item_id=created.item_id,
        org_id="org-corp",
        update_in=KnowledgeItemUpdate(
            title="Editorial Guidelines v2",
            content="Headline copy must strictly not exceed 6 words.",
            changed_by="Chief Editor",
            change_reason="Executive council updated max word count constraint"
        )
    )
    assert updated_v2.version == 2
    assert updated_v2.version_notes == "Executive council updated max word count constraint"

    # Verify history snapshot
    history = test_svc.get_version_history(item_id=created.item_id, org_id="org-corp")
    assert len(history) == 1
    assert history[0].version == 1
    assert history[0].previous_data["content"] == "Headline copy should be concise."
    assert history[0].changed_by == "Chief Editor"


def test_pgvector_semantic_search():
    """
    Requirement 5: Use pgvector where semantic retrieval is required.
    Validates 384-dimensional unit vector embedding and cosine similarity ranking.
    """
    v1 = generate_semantic_embedding("zero-trust Kubernetes network security mesh")
    v2 = generate_semantic_embedding("cloud container network firewall and security mesh")
    v3 = generate_semantic_embedding("organic cotton running shoes with carbon plate")

    assert len(v1) == 384
    assert len(v2) == 384

    sim_related = cosine_similarity(v1, v2)
    sim_unrelated = cosine_similarity(v1, v3)

    assert sim_related > sim_unrelated
    assert sim_related > 0.20


def test_supabase_rls_sql_schema_generation():
    """
    Requirement 2: Implement Supabase Row Level Security.
    Validates generated SQL contains RLS enablement, tenant policies, and vector match function.
    """
    sql = knowledge_service.get_supabase_rls_sql()
    assert "CREATE EXTENSION IF NOT EXISTS vector;" in sql
    assert "ALTER TABLE brand_knowledge_items ENABLE ROW LEVEL SECURITY;" in sql
    assert "CREATE POLICY \"org_isolation_select_policy\"" in sql
    assert "CREATE POLICY \"org_isolation_insert_policy\"" in sql
    assert "CREATE OR REPLACE FUNCTION match_brand_knowledge" in sql
    assert "auth.jwt() ->> 'org_id'" in sql


def test_knowledge_base_api_endpoints():
    """
    Tests REST API endpoints for Brand Knowledge Base.
    """
    # 1. Seed enterprise knowledge
    seed_res = client.post("/api/v1/knowledge/seed?org_id=org-api-test&brand_id=test-brand")
    assert seed_res.status_code == 200
    assert seed_res.json()["total_items"] >= 10

    # 2. List items for org
    list_res = client.get("/api/v1/knowledge/items?org_id=org-api-test")
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 10

    # 3. Semantic search
    search_res = client.post("/api/v1/knowledge/search", json={
        "query": "zero trust SLA 99.999% uptime",
        "org_id": "org-api-test",
        "top_k": 3
    })
    assert search_res.status_code == 200
    results = search_res.json()
    assert len(results) > 0
    assert results[0]["similarity_score"] > 0.40

    # 4. Supabase Schema endpoint
    schema_res = client.get("/api/v1/knowledge/supabase/schema")
    assert schema_res.status_code == 200
    assert schema_res.json()["rls_enabled"] is True
