from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse

from backend.app.models.insights import (
    AmbiguousGuidelineInsight,
    BrandInsightsReport,
    DepartmentRecurringProblem,
    GuidelineViolationInsight,
    IncorrectTerminologyInsight,
    UnsupportedClaimInsight,
    VisualInconsistencyInsight,
)
from backend.app.services.brand_insights_service import brand_insights_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/insights", tags=["Brand Insights & Recurring Issues"])


@router.get("/{brand_id}", response_model=BrandInsightsReport)
def get_brand_insights_report(
    brand_id: str,
    background_tasks: BackgroundTasks,
    org_id: Optional[str] = Query(default=None, description="Tenant organization ID")
) -> BrandInsightsReport:
    """
    Generates and returns the complete Brand Insights & Recurring Issues report for a brand.
    Aggregates empirical data across reviews, inspections, claim verifications, and workflow approvals.
    Enforces the zero-fabrication governance guardrail: if fewer than 3 reviews exist,
    returns INSUFFICIENT_DATA and withholds statistical conclusions.
    """
    try:
        report = brand_insights_service.generate_report(brand_id=brand_id, org_id=org_id)
        from backend.app.services.supabase_service import supabase_service
        background_tasks.add_task(supabase_service.save_brand_insights, report)
        return report
    except Exception as exc:
        logger.error("Failed to generate brand insights report for %s: %s", brand_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to generate brand insights report: {str(exc)}")


@router.get("/{brand_id}/violations", response_model=List[GuidelineViolationInsight])
def get_repeated_violations(
    brand_id: str,
    org_id: Optional[str] = Query(default=None)
) -> List[GuidelineViolationInsight]:
    """
    Returns repeated brand guideline violations sorted by frequency and severity.
    """
    report = brand_insights_service.generate_report(brand_id=brand_id, org_id=org_id)
    return report.repeated_violations


@router.get("/{brand_id}/terminology", response_model=List[IncorrectTerminologyInsight])
def get_incorrect_terminology(
    brand_id: str,
    org_id: Optional[str] = Query(default=None)
) -> List[IncorrectTerminologyInsight]:
    """
    Returns frequently incorrect or prohibited terminology with approved brand replacements.
    """
    report = brand_insights_service.generate_report(brand_id=brand_id, org_id=org_id)
    return report.frequently_incorrect_terminology


@router.get("/{brand_id}/visual", response_model=List[VisualInconsistencyInsight])
def get_visual_inconsistencies(
    brand_id: str,
    org_id: Optional[str] = Query(default=None)
) -> List[VisualInconsistencyInsight]:
    """
    Returns common visual inconsistencies (off-brand color drift, contrast failures, clutter, logo spacing).
    """
    report = brand_insights_service.generate_report(brand_id=brand_id, org_id=org_id)
    return report.common_visual_inconsistencies


@router.get("/{brand_id}/claims", response_model=List[UnsupportedClaimInsight])
def get_unsupported_claims(
    brand_id: str,
    org_id: Optional[str] = Query(default=None)
) -> List[UnsupportedClaimInsight]:
    """
    Returns repeated unsupported, exaggerated, or contradictory promotional claims.
    """
    report = brand_insights_service.generate_report(brand_id=brand_id, org_id=org_id)
    return report.repeated_unsupported_claims


@router.get("/{brand_id}/departments", response_model=List[DepartmentRecurringProblem])
def get_department_problems(
    brand_id: str,
    org_id: Optional[str] = Query(default=None)
) -> List[DepartmentRecurringProblem]:
    """
    Returns department-level compliance metrics, risk index rankings, and recurring problem modes.
    """
    report = brand_insights_service.generate_report(brand_id=brand_id, org_id=org_id)
    return report.department_problems


@router.get("/{brand_id}/ambiguity", response_model=List[AmbiguousGuidelineInsight])
def get_ambiguous_guidelines(
    brand_id: str,
    org_id: Optional[str] = Query(default=None)
) -> List[AmbiguousGuidelineInsight]:
    """
    Identifies guidelines that appear unclear or frequently misunderstood across teams,
    along with concrete policy wording recommendations.
    """
    report = brand_insights_service.generate_report(brand_id=brand_id, org_id=org_id)
    return report.ambiguous_guidelines


@router.get("/{brand_id}/export")
def export_brand_insights_audit(
    brand_id: str,
    org_id: Optional[str] = Query(default=None)
) -> JSONResponse:
    """
    Exports the executive compliance audit report as structured JSON.
    """
    report = brand_insights_service.generate_report(brand_id=brand_id, org_id=org_id)
    return JSONResponse(
        content={
            "report_header": {
                "report_id": report.report_id,
                "brand_id": report.brand_id,
                "brand_name": report.brand_name,
                "org_id": report.org_id,
                "generated_at": report.generated_at,
                "data_sufficiency": report.data_sufficiency.value,
                "compliance_score": report.overall_brand_health_score,
                "trend": report.compliance_trend.value
            },
            "executive_summary": report.executive_summary,
            "repeated_violations_summary": [
                {
                    "guideline": v.guideline_name,
                    "category": v.category,
                    "occurrences": v.occurrence_count,
                    "rate_pct": v.violation_rate_pct,
                    "departments": v.affected_departments,
                    "trend": v.trend.value
                }
                for v in report.repeated_violations
            ],
            "incorrect_terminology_summary": [
                {
                    "banned_term": t.banned_term,
                    "suggested_replacement": t.suggested_replacement,
                    "occurrences": t.occurrence_count,
                    "departments": t.affected_departments
                }
                for t in report.frequently_incorrect_terminology
            ],
            "visual_inconsistencies": [
                {
                    "title": vi.title,
                    "observed": vi.observed_average,
                    "target": vi.benchmark_target,
                    "divergence_pct": vi.divergence_rate_pct
                }
                for vi in report.common_visual_inconsistencies
            ],
            "department_risk_rankings": [
                {
                    "department": d.department,
                    "submissions": d.total_submissions,
                    "compliance_rate": d.compliance_rate_pct,
                    "average_score": d.average_compliance_score,
                    "risk_level": d.risk_level,
                    "top_issues": d.top_recurring_issues
                }
                for d in report.department_problems
            ],
            "guideline_improvement_recommendations": [
                {
                    "guideline": ag.guideline_name,
                    "ambiguity_score": ag.ambiguity_score,
                    "signals": ag.confusion_signals,
                    "root_cause": ag.root_cause_explanation,
                    "recommended_revision": ag.recommended_guideline_revision,
                    "expected_impact": ag.expected_impact,
                    "priority": ag.priority
                }
                for ag in report.ambiguous_guidelines
            ],
            "chronological_trends": [
                {
                    "period": tb.period_label,
                    "average_score": tb.average_score,
                    "violations": tb.violation_count,
                    "escalations": tb.escalated_count,
                    "trend": tb.trend_direction.value
                }
                for tb in report.trend_timeline
            ]
        }
    )
