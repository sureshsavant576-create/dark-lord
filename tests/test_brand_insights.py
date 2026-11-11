import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.insights import (
    DataSufficiencyStatus,
    TrendDirection,
)
from backend.app.services.brand_insights_service import brand_insights_service


def test_brand_insights_seeded_data_statistical_sufficiency():
    """
    Verifies that a brand with sufficient historical review records (Apex Cloud)
    produces a statistically sufficient report with all 6 required insight dimensions:
    1. Repeated violations
    2. Frequently incorrect terminology
    3. Common visual inconsistencies
    4. Repeated unsupported promotional claims
    5. Department recurring problem breakdown
    6. Ambiguous guidelines with concrete wording recommendations
    """
    report = brand_insights_service.generate_report(brand_id="apex_cloud", org_id="apex_cloud")

    # 1. Sufficiency
    assert report.total_reviews_analyzed >= 6
    assert report.data_sufficiency == DataSufficiencyStatus.STATISTICALLY_SUFFICIENT
    assert 0.0 <= report.overall_brand_health_score <= 100.0
    assert report.compliance_trend in [TrendDirection.IMPROVING, TrendDirection.STABLE, TrendDirection.DEGRADING]

    # 2. Repeated Guideline Violations
    assert len(report.repeated_violations) >= 2
    for v in report.repeated_violations:
        assert v.occurrence_count >= 1
        assert 0.0 <= v.violation_rate_pct <= 100.0
        assert isinstance(v.affected_departments, list)
        assert len(v.affected_departments) >= 1

    # 3. Frequently Incorrect Terminology
    assert len(report.frequently_incorrect_terminology) >= 1
    term_insight = report.frequently_incorrect_terminology[0]
    assert term_insight.banned_term != ""
    assert term_insight.suggested_replacement != ""
    assert term_insight.occurrence_count >= 1
    assert 0.0 <= term_insight.frequency_pct <= 100.0

    # 4. Common Visual Inconsistencies
    assert len(report.common_visual_inconsistencies) >= 2
    inconsistency_types = [vi.inconsistency_type for vi in report.common_visual_inconsistencies]
    assert "OFF_BRAND_COLOR_DRIFT" in inconsistency_types
    assert "LOW_WCAG_CONTRAST" in inconsistency_types

    # Check rogue color detail
    color_insight = next(vi for vi in report.common_visual_inconsistencies if vi.inconsistency_type == "OFF_BRAND_COLOR_DRIFT")
    assert len(color_insight.rogue_colors) >= 1
    assert color_insight.rogue_colors[0].delta_e > 0.0

    # 5. Repeated Unsupported Promotional Claims
    assert len(report.repeated_unsupported_claims) >= 1
    claim = report.repeated_unsupported_claims[0]
    assert claim.claim_pattern != ""
    assert claim.missing_evidence_required != ""
    assert claim.occurrence_count >= 1

    # 6. Department Breakdown
    assert len(report.department_problems) >= 3
    depts = [dp.department for dp in report.department_problems]
    assert "Growth & Social" in depts
    assert "Product Marketing" in depts

    # 7. Ambiguous Guidelines & Recommendations
    assert len(report.ambiguous_guidelines) >= 2
    ambig = report.ambiguous_guidelines[0]
    assert 0.0 <= ambig.ambiguity_score <= 1.0
    assert len(ambig.confusion_signals) >= 1
    assert len(ambig.root_cause_explanation) > 10
    assert len(ambig.recommended_guideline_revision) > 10


def test_data_sufficiency_guardrail_zero_fabrication():
    """
    CRITICAL GOVERNANCE RULE:
    Do not fabricate statistics or generate conclusions from insufficient data.
    When a brand has 0 review records, the system MUST return INSUFFICIENT_DATA,
    withhold statistical extrapolations, department risk tiers, and trend regressions.
    """
    empty_brand_id = "brand_no_reviews_registered"
    report = brand_insights_service.generate_report(brand_id=empty_brand_id, org_id=empty_brand_id)

    assert report.total_reviews_analyzed == 0
    assert report.data_sufficiency == DataSufficiencyStatus.INSUFFICIENT_DATA
    assert "Zero review or approval records found" in report.data_sufficiency_explanation
    assert "no statistics, trends, or department risk scores have been generated or fabricated" in report.data_sufficiency_explanation

    # Zero phantom metrics
    assert len(report.repeated_violations) == 0
    assert len(report.frequently_incorrect_terminology) == 0
    assert len(report.common_visual_inconsistencies) == 0
    assert len(report.repeated_unsupported_claims) == 0
    assert len(report.department_problems) == 0
    assert len(report.ambiguous_guidelines) == 0
    assert len(report.trend_timeline) == 0


def test_department_recurring_problems_breakdown():
    """
    Verifies that department risk ratings and compliance percentages
    faithfully reflect the submitted records without arbitrary hallucination.
    """
    report = brand_insights_service.generate_report(brand_id="apex_cloud", org_id="apex_cloud")
    dept_map = {dp.department: dp for dp in report.department_problems}

    # Growth & Social submitted high-risk claims & rogue colors -> high/critical risk
    if "Growth & Social" in dept_map:
        gs = dept_map["Growth & Social"]
        assert gs.total_submissions >= 2
        assert gs.risk_level in ["CRITICAL", "HIGH"]
        assert gs.compliance_rate_pct < 60.0

    # Product Marketing had passing/minor issues -> low risk
    if "Product Marketing" in dept_map:
        pm = dept_map["Product Marketing"]
        assert pm.total_submissions >= 2
        assert pm.compliance_rate_pct >= 80.0
        assert pm.risk_level == "LOW"


def test_ambiguous_guidelines_and_improvement_recommendations():
    """
    Verifies that ambiguous guidelines identify root causes and output
    concrete, actionable policy wording updates.
    """
    report = brand_insights_service.generate_report(brand_id="apex_cloud", org_id="apex_cloud")
    assert len(report.ambiguous_guidelines) >= 1

    color_rule = next((ag for ag in report.ambiguous_guidelines if "Color" in ag.category), None)
    assert color_rule is not None
    assert color_rule.ambiguity_score >= 0.50
    # Must provide concrete replacement text
    assert "#2684FF" in color_rule.recommended_guideline_revision or "Dark Mode" in color_rule.recommended_guideline_revision
    assert color_rule.priority in ["IMMEDIATE", "RECOMMENDED"]


def test_insights_api_endpoints():
    """
    Verifies all 8 REST API endpoints mounted on /api/v1/insights.
    """
    client = TestClient(app)

    # 1. Full report
    r1 = client.get("/api/v1/insights/apex_cloud?org_id=apex_cloud")
    assert r1.status_code == 200
    data1 = r1.json()
    assert data1["brand_id"] == "apex_cloud"
    assert data1["data_sufficiency"] == "STATISTICALLY_SUFFICIENT"

    # 2. Repeated violations
    r2 = client.get("/api/v1/insights/apex_cloud/violations?org_id=apex_cloud")
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)

    # 3. Terminology
    r3 = client.get("/api/v1/insights/apex_cloud/terminology?org_id=apex_cloud")
    assert r3.status_code == 200
    assert isinstance(r3.json(), list)

    # 4. Visual
    r4 = client.get("/api/v1/insights/apex_cloud/visual?org_id=apex_cloud")
    assert r4.status_code == 200
    assert isinstance(r4.json(), list)

    # 5. Claims
    r5 = client.get("/api/v1/insights/apex_cloud/claims?org_id=apex_cloud")
    assert r5.status_code == 200
    assert isinstance(r5.json(), list)

    # 6. Departments
    r6 = client.get("/api/v1/insights/apex_cloud/departments?org_id=apex_cloud")
    assert r6.status_code == 200
    assert isinstance(r6.json(), list)

    # 7. Ambiguity
    r7 = client.get("/api/v1/insights/apex_cloud/ambiguity?org_id=apex_cloud")
    assert r7.status_code == 200
    assert isinstance(r7.json(), list)

    # 8. Export Audit
    r8 = client.get("/api/v1/insights/apex_cloud/export?org_id=apex_cloud")
    assert r8.status_code == 200
    export_data = r8.json()
    assert "report_header" in export_data
    assert "repeated_violations_summary" in export_data
    assert "department_risk_rankings" in export_data
    assert "guideline_improvement_recommendations" in export_data

    # 9. Guardrail verification via API for empty brand
    r9 = client.get("/api/v1/insights/brand_totally_empty?org_id=org_totally_empty")
    assert r9.status_code == 200
    assert r9.json()["data_sufficiency"] == "INSUFFICIENT_DATA"
    assert len(r9.json()["repeated_violations"]) == 0
