import pytest
from datetime import datetime, timezone
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.claim_verification import (
    ClaimClassification,
    ClaimRiskLevel,
    ClaimType,
    ClaimVerificationFinding,
    ClaimVerificationRequest,
    HumanClaimReviewDecision,
)
from backend.app.models.knowledge_base import (
    ClaimEvidence,
    KnowledgeCategory,
    KnowledgeItemCreate,
    KnowledgeProvenance,
)
from backend.app.services.claim_verification_service import claim_verification_engine
from backend.app.services.knowledge_service import knowledge_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def seed_test_knowledge():
    """
    Seeds test knowledge base for org-claim-test with both valid and expired claims.
    """
    # 1. Active claim with current evidence valid until 2027
    knowledge_service.create_item(KnowledgeItemCreate(
        org_id="org-claim-test",
        brand_id="apex-cloud",
        category=KnowledgeCategory.PROMOTIONAL_CLAIM,
        title="Sub-millisecond packet latency",
        content="Evidence: UW Cloud Lab TR-2025-08 Benchmark",
        structured_data={
            "claim_text": "Sub-millisecond packet latency",
            "evidence_source": "UW Cloud Lab Benchmark (TR-2025-08)",
            "evidence_ref": "https://apexcloud.io/benchmarks/ebpf",
            "valid_until": "2027-12-31T23:59:59Z",
            "substantiated": True
        },
        provenance=KnowledgeProvenance.COMPANY_FACT,
        is_approved=True
    ))

    # 2. Expired claim with outdated evidence valid only until 2024
    knowledge_service.create_item(KnowledgeItemCreate(
        org_id="org-claim-test",
        brand_id="apex-cloud",
        category=KnowledgeCategory.PROMOTIONAL_CLAIM,
        title="Gartner Magic Quadrant Leader 2023",
        content="Evidence: Gartner 2023 Cloud Infrastructure Report",
        structured_data={
            "claim_text": "Gartner Magic Quadrant Leader",
            "evidence_source": "Gartner 2023 Cloud Report",
            "evidence_ref": "https://gartner.com/2023/report",
            "valid_until": "2024-01-01T00:00:00Z",  # In the past -> OUTDATED
            "substantiated": True
        },
        provenance=KnowledgeProvenance.COMPANY_FACT,
        is_approved=True
    ))

    # 3. Company fact: Founding year 2021
    knowledge_service.create_item(KnowledgeItemCreate(
        org_id="org-claim-test",
        brand_id="apex-cloud",
        category=KnowledgeCategory.COMPANY_FACT,
        title="Founding Date",
        content="Apex Cloud Systems was founded in 2021 in San Francisco.",
        provenance=KnowledgeProvenance.COMPANY_FACT,
        is_approved=True
    ))


@pytest.mark.asyncio
async def test_claim_classification_verified_against_approved_evidence():
    """
    Classification 1: Verified against approved evidence.
    Claim with valid current evidence in the Knowledge Base must pass with citation.
    """
    req = ClaimVerificationRequest(
        org_id="org-claim-test",
        brand_id="apex-cloud",
        text="Apex Shield Mesh delivers sub-millisecond packet latency across distributed nodes."
    )
    report = await claim_verification_engine.verify_claims(req)

    assert report.total_claims_detected >= 1
    verified_finding = next(
        (f for f in report.findings if f.classification == ClaimClassification.VERIFIED),
        None
    )
    assert verified_finding is not None
    assert verified_finding.claim_type == ClaimType.PERFORMANCE_METRIC
    assert "UW Cloud Lab" in verified_finding.supporting_evidence
    assert verified_finding.missing_evidence is None
    assert verified_finding.risk_level == ClaimRiskLevel.LOW
    assert verified_finding.requires_human_review is False


@pytest.mark.asyncio
async def test_claim_classification_unsupported():
    """
    Classification 2: Unsupported.
    A promotional assertion (e.g. percentage improvement) lacking evidence in Knowledge Base.
    Never assume true based only on AI model knowledge.
    """
    req = ClaimVerificationRequest(
        org_id="org-claim-test",
        brand_id="apex-cloud",
        text="Our new engine provides 75% faster deployment than any other solution."
    )
    report = await claim_verification_engine.verify_claims(req)

    unsupported_finding = next(
        (f for f in report.findings if f.classification == ClaimClassification.UNSUPPORTED),
        None
    )
    assert unsupported_finding is not None
    assert unsupported_finding.claim_type == ClaimType.PERCENTAGE_IMPROVEMENT
    assert unsupported_finding.supporting_evidence is None
    assert unsupported_finding.missing_evidence is not None
    assert "Methodology report" in unsupported_finding.missing_evidence or "dataset" in unsupported_finding.missing_evidence
    assert len(unsupported_finding.explanation) > 0
    assert len(unsupported_finding.recommended_action) > 0


@pytest.mark.asyncio
async def test_claim_classification_contradictory():
    """
    Classification 3: Contradictory.
    Claim asserting a founding year that directly contradicts certified company facts.
    """
    req = ClaimVerificationRequest(
        org_id="org-claim-test",
        brand_id="apex-cloud",
        text="Founded in 2012, Apex Cloud has over a decade of enterprise security leadership."
    )
    report = await claim_verification_engine.verify_claims(req)

    contra_finding = next(
        (f for f in report.findings if f.classification == ClaimClassification.CONTRADICTORY),
        None
    )
    assert contra_finding is not None
    assert "2012" in contra_finding.claim
    assert contra_finding.risk_level == ClaimRiskLevel.CRITICAL
    assert contra_finding.requires_human_review is True
    assert "contradicting certified company fact" in contra_finding.explanation
    assert "2021" in contra_finding.explanation or "2021" in contra_finding.recommended_action


@pytest.mark.asyncio
async def test_claim_classification_potentially_outdated():
    """
    Classification 4: Potentially outdated.
    Claim matching an approved award/certification whose validity period has expired.
    """
    req = ClaimVerificationRequest(
        org_id="org-claim-test",
        brand_id="apex-cloud",
        text="Recognized as a Gartner Magic Quadrant Leader in cloud security."
    )
    report = await claim_verification_engine.verify_claims(req)

    outdated_finding = next(
        (f for f in report.findings if f.classification == ClaimClassification.OUTDATED),
        None
    )
    assert outdated_finding is not None
    assert outdated_finding.claim_type == ClaimType.AWARD_CERTIFICATION
    assert "Expired" in outdated_finding.supporting_evidence
    assert outdated_finding.missing_evidence is not None
    assert outdated_finding.risk_level == ClaimRiskLevel.HIGH
    assert outdated_finding.requires_human_review is True


@pytest.mark.asyncio
async def test_claim_classification_requires_human_verification():
    """
    Classification 5: Requires human verification.
    High-risk claims such as absolute guarantees or clinical proof require authorized human review.
    """
    req = ClaimVerificationRequest(
        org_id="org-claim-test",
        brand_id="apex-cloud",
        text="We deliver 100% guaranteed results with zero risk and money-back guarantee."
    )
    report = await claim_verification_engine.verify_claims(req)

    human_finding = next(
        (f for f in report.findings if f.classification == ClaimClassification.REQUIRES_HUMAN_VERIFICATION),
        None
    )
    assert human_finding is not None
    assert human_finding.claim_type == ClaimType.GUARANTEED_RESULTS
    assert human_finding.risk_level == ClaimRiskLevel.CRITICAL
    assert human_finding.requires_human_review is True
    assert "General Counsel" in human_finding.recommended_action or "Compliance" in human_finding.recommended_action
    assert report.requires_human_review is True
    assert report.human_review_routing is not None


def test_claims_api_endpoints():
    """
    Tests REST API endpoints for claim verification and human sign-off.
    """
    # 1. POST /api/v1/claims/verify
    res = client.post("/api/v1/claims/verify", json={
        "org_id": "org-claim-test",
        "brand_id": "apex-cloud",
        "text": "Apex Shield Mesh delivers sub-millisecond packet latency. Ranked #1 industry leader with 100% guaranteed results."
    })
    assert res.status_code == 200
    data = res.json()
    assert "report_id" in data
    assert data["total_claims_detected"] >= 2
    assert "findings" in data
    assert data["requires_human_review"] is True

    # 2. POST /api/v1/claims/human-review
    decision_res = client.post("/api/v1/claims/human-review", json={
        "finding_id": data["findings"][0]["finding_id"],
        "reviewer_name": "Marcus Vance",
        "reviewer_role": "Chief Compliance Officer",
        "decision": "APPROVED",
        "evidence_file_or_memo": "Legal Memo #2026-104",
        "notes": "Reviewed empirical packet capture benchmark. Substantiated."
    })
    assert decision_res.status_code == 200
    assert decision_res.json()["status"] == "RECORDED"
    assert "Marcus Vance" in decision_res.json()["authorized_reviewer"]
