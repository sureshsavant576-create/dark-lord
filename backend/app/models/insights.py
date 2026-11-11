from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DataSufficiencyStatus(str, Enum):
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"          # < 3 reviews: no statistical conclusions
    PRELIMINARY_SAMPLE = "PRELIMINARY_SAMPLE"        # 3-5 reviews: preliminary indicators only
    STATISTICALLY_SUFFICIENT = "STATISTICALLY_SUFFICIENT"  # >= 6 reviews: full statistical significance


class TrendDirection(str, Enum):
    IMPROVING = "IMPROVING"
    STABLE = "STABLE"
    DEGRADING = "DEGRADING"


class SeverityBreakdown(BaseModel):
    critical: int = Field(default=0, description="Count of critical severity violations")
    warning: int = Field(default=0, description="Count of warning severity violations")
    info: int = Field(default=0, description="Count of info severity notes")


class GuidelineViolationInsight(BaseModel):
    """
    Repeated brand guideline violation pattern aggregated across review submissions.
    """
    guideline_key: str = Field(..., description="Unique key or category slug of the guideline")
    guideline_name: str = Field(..., description="Human-readable guideline title")
    category: str = Field(..., description="Mandated violation category")
    occurrence_count: int = Field(..., ge=0, description="Total times this violation was detected")
    violation_rate_pct: float = Field(..., ge=0.0, le=100.0, description="Percentage of reviews exhibiting this issue")
    severity_breakdown: SeverityBreakdown = Field(default_factory=SeverityBreakdown)
    affected_departments: List[str] = Field(default_factory=list, description="Departments where violation occurred")
    recent_examples: List[str] = Field(default_factory=list, description="Recent creative titles or context snippets")
    trend: TrendDirection = Field(default=TrendDirection.STABLE, description="Chronological trajectory")
    is_recurring: bool = Field(default=False, description="True if detected 2 or more times")


class IncorrectTerminologyInsight(BaseModel):
    """
    Frequently misused or prohibited terminology with recommended brand replacements.
    """
    banned_term: str = Field(..., description="Off-brand or prohibited term detected")
    suggested_replacement: str = Field(..., description="Approved terminology from Brand DNA / Knowledge Base")
    occurrence_count: int = Field(..., ge=0, description="Number of times detected across copy")
    frequency_pct: float = Field(..., ge=0.0, le=100.0, description="Percentage of textual submissions containing this term")
    sample_contexts: List[str] = Field(default_factory=list, description="Snippets of copy where term was used")
    affected_departments: List[str] = Field(default_factory=list, description="Departments frequently using this term")
    severity: str = Field(default="WARNING", description="Severity classification")


class RogueColorUsage(BaseModel):
    detected_hex: str = Field(..., description="Non-compliant hex code detected in creatives")
    occurrence_count: int = Field(..., ge=1, description="Times detected")
    closest_brand_hex: str = Field(..., description="Closest approved brand palette centroid")
    delta_e: float = Field(..., description="CIELAB Delta-E color distance")
    sample_context: str = Field(default="", description="Where color appeared, e.g. background fill or CTA button")


class VisualInconsistencyInsight(BaseModel):
    """
    Common visual and spatial layout inconsistencies detected via OpenCV & color science.
    """
    inconsistency_type: str = Field(..., description="Type: OFF_BRAND_COLOR_DRIFT, LOW_WCAG_CONTRAST, LAYOUT_CLUTTER, LOGO_CLEAR_SPACE")
    title: str = Field(..., description="Human-readable title")
    description: str = Field(..., description="Detailed description of the recurring inconsistency")
    observed_average: str = Field(..., description="Empirical measured value (e.g. 3.2:1 contrast, 18% whitespace)")
    benchmark_target: str = Field(..., description="Brand standard threshold (e.g. >= 4.5:1 contrast, >= 35% whitespace)")
    divergence_rate_pct: float = Field(..., ge=0.0, le=100.0, description="Percentage of visual submissions exhibiting this issue")
    rogue_colors: List[RogueColorUsage] = Field(default_factory=list, description="Common off-brand hex codes")
    affected_departments: List[str] = Field(default_factory=list)
    severity: str = Field(default="WARNING")


class UnsupportedClaimInsight(BaseModel):
    """
    Repeated unsupported, exaggerated, or contradictory promotional claims.
    """
    claim_type: str = Field(..., description="Claim category: performance_claims, guaranteed_results, market_leadership, award_certification")
    claim_pattern: str = Field(..., description="Generalized claim pattern or superlative")
    sample_claims: List[str] = Field(default_factory=list, description="Exact phrases detected across reviews")
    occurrence_count: int = Field(..., ge=0, description="Frequency of occurrence")
    repetition_rate_pct: float = Field(..., ge=0.0, le=100.0)
    missing_evidence_required: str = Field(..., description="Documentary evidence required by brand policy")
    escalation_count: int = Field(default=0, description="Times this claim triggered workflow escalation")
    affected_departments: List[str] = Field(default_factory=list)


class DepartmentRecurringProblem(BaseModel):
    """
    Department-level compliance health, risk index, and recurring problem breakdown.
    """
    department: str = Field(..., description="Department name: e.g. Growth & Social, Product Marketing, Field Sales")
    total_submissions: int = Field(..., ge=0, description="Number of submissions evaluated")
    approved_count: int = Field(default=0)
    needs_revision_count: int = Field(default=0)
    escalated_count: int = Field(default=0)
    rejected_count: int = Field(default=0)
    compliance_rate_pct: float = Field(..., ge=0.0, le=100.0, description="Percentage of submissions passing or approved")
    average_compliance_score: float = Field(..., ge=0.0, le=100.0, description="Mean compliance score")
    risk_level: str = Field(default="LOW", description="LOW, MEDIUM, HIGH, CRITICAL")
    top_recurring_issues: List[str] = Field(default_factory=list, description="Primary failure modes for this department")
    frequent_banned_terms: List[str] = Field(default_factory=list, description="Common terminology errors")


class AmbiguousGuidelineInsight(BaseModel):
    """
    Brand guidelines that appear unclear, ambiguous, or frequently misunderstood by creators,
    with actionable recommendations for policy improvements.
    """
    guideline_id: str = Field(..., description="Unique guideline identifier or standard rule name")
    guideline_name: str = Field(..., description="Guideline title")
    category: str = Field(..., description="Brand dimension: Color, Typography, Tone, Claims, Layout")
    ambiguity_score: float = Field(..., ge=0.0, le=1.0, description="Calculated ambiguity index (0.0 clear to 1.0 highly ambiguous)")
    confusion_signals: List[str] = Field(default_factory=list, description="Empirical evidence indicating creator confusion")
    root_cause_explanation: str = Field(..., description="Root cause why creators misunderstand or misapply the guideline")
    recommended_guideline_revision: str = Field(..., description="Concrete, actionable text to clarify the brand guideline")
    expected_impact: str = Field(..., description="Projected compliance improvement upon adopting recommendation")
    priority: str = Field(default="RECOMMENDED", description="IMMEDIATE, RECOMMENDED, OPTIONAL")


class TimeTrendBucket(BaseModel):
    """
    Time-sliced compliance trends for tracking progression over weeks or batches.
    """
    period_label: str = Field(..., description="Period identifier, e.g. 2026-W44, 2026-W45")
    start_date: str = Field(..., description="ISO start date")
    end_date: str = Field(..., description="ISO end date")
    submission_count: int = Field(..., ge=0)
    average_score: float = Field(..., ge=0.0, le=100.0)
    violation_count: int = Field(..., ge=0)
    escalated_count: int = Field(default=0)
    trend_direction: TrendDirection = Field(default=TrendDirection.STABLE)


class BrandInsightsReport(BaseModel):
    """
    Comprehensive Brand Insights & Recurring Issues Report.
    Adheres strictly to the governance requirement:
    - Generates reports using actual review and approval data.
    - Shows trends and recurring issues.
    - Recommends improvements to brand guidelines where repeated mistakes suggest ambiguity.
    - Never fabricates statistics or generates conclusions from insufficient data.
    """
    report_id: str = Field(..., description="Unique report identifier")
    org_id: str = Field(..., description="Tenant organization ID")
    brand_id: str = Field(..., description="Audited brand ID")
    brand_name: str = Field(..., description="Audited brand name")
    generated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    total_reviews_analyzed: int = Field(..., ge=0, description="Total review & inspection records analyzed")
    total_workflow_items_analyzed: int = Field(..., ge=0, description="Total workflow items analyzed")
    data_sufficiency: DataSufficiencyStatus = Field(..., description="Statistical sufficiency assessment")
    data_sufficiency_explanation: str = Field(..., description="Clear disclosure on sample size and statistical confidence")
    overall_brand_health_score: float = Field(..., ge=0.0, le=100.0, description="Aggregate health score 0-100")
    compliance_trend: TrendDirection = Field(default=TrendDirection.STABLE)
    score_delta_pct: float = Field(default=0.0, description="Percentage point change compared to previous period")
    repeated_violations: List[GuidelineViolationInsight] = Field(default_factory=list)
    frequently_incorrect_terminology: List[IncorrectTerminologyInsight] = Field(default_factory=list)
    common_visual_inconsistencies: List[VisualInconsistencyInsight] = Field(default_factory=list)
    repeated_unsupported_claims: List[UnsupportedClaimInsight] = Field(default_factory=list)
    department_problems: List[DepartmentRecurringProblem] = Field(default_factory=list)
    ambiguous_guidelines: List[AmbiguousGuidelineInsight] = Field(default_factory=list)
    trend_timeline: List[TimeTrendBucket] = Field(default_factory=list)
    executive_summary: str = Field(..., description="Executive summary of key findings, risks, and recommended actions")
