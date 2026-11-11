from __future__ import annotations
import json
import logging
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.app.core.config import settings
from backend.app.models.content_review import (
    ContentType,
    ContentReviewReport,
    ContentReviewRequest,
    MeasurableImageProperties,
    ReviewDetectedIssue,
    ReviewIssueCategory,
    ReviewSeverity,
)
from backend.app.services.brand_service import brand_service
from backend.app.services.gemini_text_analyzer import gemini_text_analyzer
from backend.app.services.groq_vision_service import groq_vision_service
from backend.app.services.knowledge_service import knowledge_service
from backend.app.services.ocr_service import ocr_service
from backend.app.services.opencv_analyzer import opencv_analyzer

logger = logging.getLogger(__name__)


class ContentReviewService:
    """
    Central AI Content Review System orchestrator.
    Analyzes uploaded text, posters, images, PDFs, social media creatives, and marketing ads
    against the organization's approved Brand DNA and official Knowledge Base.
    Detects all 10 mandated categories:
    1. Incorrect brand tone
    2. Terminology inconsistencies
    3. Messaging mismatches
    4. Visual identity violations
    5. Incorrect logo usage
    6. Colour inconsistencies
    7. Typography inconsistencies
    8. Unsupported promotional claims
    9. Incorrect or outdated information
    10. Accessibility problems
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (settings.DB_DIR / "content_reviews.json")
        self._lock = threading.RLock()
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self.db_path.write_text("{}", encoding="utf-8")

    async def review_content(self, request: ContentReviewRequest) -> ContentReviewReport:
        review_id = f"cr-{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()

        # 1. Retrieve Brand profile & approved Brand DNA
        brand = brand_service.get_brand_profile(request.brand_id)
        brand_name = brand.brand_name if brand else request.brand_id
        approved_palette = brand.approved_palette if brand else ["#0B132B", "#5BC0BE", "#FFFFFF"]
        brand_dna_data = (brand.brand_dna or {}) if brand else {}

        # 2. Retrieve Organization-isolated Knowledge Base Context
        kb_context = knowledge_service.retrieve_for_content_analysis(
            org_id=request.org_id,
            brand_id=request.brand_id,
            copy_text=request.copy_text
        )

        all_findings: List[ReviewDetectedIssue] = []
        measurable_props: Optional[MeasurableImageProperties] = None
        extracted_text_content = request.copy_text or ""
        file_path_obj = Path(request.file_path) if request.file_path else None

        # 3. Text Extraction via Tesseract OCR (or PyMuPDF for documents)
        if file_path_obj and file_path_obj.exists():
            ocr_result = ocr_service.extract_text(file_path_obj)
            ocr_text = ocr_result.get("text", "").strip()
            if ocr_text:
                if extracted_text_content:
                    extracted_text_content += f"\n\n[OCR Text from Asset]:\n{ocr_text}"
                else:
                    extracted_text_content = ocr_text

        # 4. Measurable Image Properties via OpenCV (cv2)
        if file_path_obj and file_path_obj.exists() and file_path_obj.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
            measurable_props = opencv_analyzer.analyze_image(
                image_path=file_path_obj,
                approved_palette_hex=approved_palette,
                min_clear_space_px=24
            )

            # Generate OpenCV findings for empirical metrics
            # A. Colour inconsistencies (perceptual CIELAB Delta E)
            if measurable_props.nearest_brand_colors:
                for nc in measurable_props.nearest_brand_colors:
                    if not nc.get("compliant", True):
                        all_findings.append(ReviewDetectedIssue(
                            issue_category=ReviewIssueCategory.COLOUR_INCONSISTENCIES,
                            severity=ReviewSeverity.WARNING,
                            description=f"Dominant color {nc['detected_hex']} deviates from approved palette (CIELAB ΔE = {nc['delta_e']} > {settings.MAX_COLOR_DELTA_E})",
                            relevant_guideline=f"Brand Color Standard (Approved Palette: {', '.join(approved_palette)})",
                            explanation=f"Color {nc['detected_hex']} falls outside acceptable perceptual distance from closest approved swatch {nc['nearest_brand_hex']}.",
                            recommended_correction=f"Shift background and accent fills to approved brand colors ({', '.join(approved_palette)}).",
                            confidence_level=0.98,
                            source_engine="opencv_metrics",
                            detected_snippet=nc["detected_hex"]
                        ))
                    else:
                        all_findings.append(ReviewDetectedIssue(
                            issue_category=ReviewIssueCategory.COLOUR_INCONSISTENCIES,
                            severity=ReviewSeverity.PASS,
                            description=f"Approved Brand Color Alignment: {nc['detected_hex']} matches {nc['nearest_brand_hex']} (ΔE = {nc['delta_e']})",
                            relevant_guideline="Brand Color Standard & CIELAB Perceptual Tolerance",
                            explanation="Color is verified within allowable perceptual distance threshold.",
                            recommended_correction="Maintain approved color fidelity.",
                            confidence_level=0.99,
                            source_engine="opencv_metrics",
                            detected_snippet=nc["detected_hex"]
                        ))

            # B. Accessibility problems (WCAG contrast ratio)
            if not measurable_props.wcag_aa_compliant:
                all_findings.append(ReviewDetectedIssue(
                    issue_category=ReviewIssueCategory.ACCESSIBILITY_PROBLEMS,
                    severity=ReviewSeverity.CRITICAL,
                    description=f"WCAG 2.1 AA Contrast Failure: Contrast ratio is {measurable_props.wcag_contrast_ratio}:1 (< 4.5:1 required)",
                    relevant_guideline="W3C Web Content Accessibility Guidelines (WCAG 2.1 Level AA)",
                    explanation="Insufficient luminance contrast between text and background impairs readability for low-vision and color-blind users.",
                    recommended_correction="Increase contrast between text and background pixels to achieve a minimum 4.5:1 ratio (e.g. darken background or lighten typography).",
                    confidence_level=0.97,
                    source_engine="opencv_metrics",
                    detected_snippet=f"{measurable_props.wcag_contrast_ratio}:1"
                ))
            else:
                all_findings.append(ReviewDetectedIssue(
                    issue_category=ReviewIssueCategory.ACCESSIBILITY_PROBLEMS,
                    severity=ReviewSeverity.PASS,
                    description=f"WCAG 2.1 AA Contrast Adherent: Contrast ratio is {measurable_props.wcag_contrast_ratio}:1 (>= 4.5:1)",
                    relevant_guideline="W3C Web Content Accessibility Guidelines (WCAG 2.1 Level AA)",
                    explanation="Text and background possess sufficient luminance separation for high legibility.",
                    recommended_correction="Preserve high-contrast color scheme.",
                    confidence_level=0.99,
                    source_engine="opencv_metrics"
                ))

            # C. Incorrect logo usage (minimum clear space)
            if measurable_props.logo_detected and not measurable_props.logo_clear_space_compliant:
                all_findings.append(ReviewDetectedIssue(
                    issue_category=ReviewIssueCategory.INCORRECT_LOGO_USAGE,
                    severity=ReviewSeverity.WARNING,
                    description=f"Logo Clear Space Violation: Margin is {measurable_props.logo_clear_space_px}px (< 24px required)",
                    relevant_guideline="Official Brand Logo Usage & Minimum Isolation Area Standard",
                    explanation=f"Logo is placed too close to the canvas boundary ({measurable_props.logo_clear_space_px}px). Brand guidelines require at least 24px of unobstructed clear space.",
                    recommended_correction="Reposition logo inward by at least 24px from all margins and surrounding graphic elements.",
                    confidence_level=0.91,
                    source_engine="opencv_metrics"
                ))

            # D. Visual identity violations (whitespace / layout)
            if measurable_props.whitespace_ratio < 0.25:
                all_findings.append(ReviewDetectedIssue(
                    issue_category=ReviewIssueCategory.VISUAL_IDENTITY_VIOLATIONS,
                    severity=ReviewSeverity.WARNING,
                    description=f"Layout Clutter: Measured whitespace ratio is {int(measurable_props.whitespace_ratio * 100)}% (< 40% recommended)",
                    relevant_guideline="Visual Identity & Minimalist Composition Standard",
                    explanation="Asset is overly dense with minimal breathing room, deviating from clean brand aesthetic.",
                    recommended_correction="Increase negative space by reducing decorative elements and enlarging padding around key subjects.",
                    confidence_level=0.89,
                    source_engine="opencv_metrics"
                ))

        # 5. Deep Text Analysis via Gemini (Tone, Terminology, Messaging, Claims, Outdated Info)
        if extracted_text_content.strip():
            text_findings = await gemini_text_analyzer.analyze_text_copy(
                copy_text=extracted_text_content,
                brand_dna=brand_dna_data,
                knowledge_context=kb_context
            )
            all_findings.extend(text_findings)

        # 6. Multimodal Visual Analysis via Groq Cloud Vision (or Gemini Vision fallback)
        vision_provider_label = "none"
        if file_path_obj and file_path_obj.exists() and file_path_obj.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
            vision_analysis = await groq_vision_service.analyze_visual_creative(
                image_path=file_path_obj,
                brand_dna=brand_dna_data,
                knowledge_context=kb_context
            )
            vision_provider_label = f"{vision_analysis.get('provider', 'groq')}:{vision_analysis.get('model', 'vision')}"
            v_findings = vision_analysis.get("visual_identity_findings", [])
            for vf in v_findings:
                try:
                    cat_str = vf.get("issue_category", "").lower().replace(" ", "_")
                    all_findings.append(ReviewDetectedIssue(
                        issue_category=ReviewIssueCategory(cat_str),
                        severity=ReviewSeverity(vf.get("severity", "WARNING").upper()),
                        description=vf.get("description", "Visual discrepancy detected"),
                        relevant_guideline=vf.get("relevant_guideline", "Official Visual Guidelines"),
                        explanation=vf.get("explanation", ""),
                        recommended_correction=vf.get("recommended_correction", "Adjust visual presentation"),
                        confidence_level=float(vf.get("confidence_level", 0.90)),
                        source_engine=vision_provider_label
                    ))
                except Exception as e:
                    logger.debug("Skipping invalid vision finding: %s", e)

        # 7. Deduplicate findings by (category, description)
        unique_findings: List[ReviewDetectedIssue] = []
        seen_keys = set()
        for f in all_findings:
            key = (f.issue_category.value, f.description[:50].lower())
            if key not in seen_keys:
                seen_keys.add(key)
                unique_findings.append(f)

        # 8. Compute Overall Compliance Score
        score = 100.0
        critical_count = 0
        warning_count = 0
        pass_count = 0

        for f in unique_findings:
            if f.severity == ReviewSeverity.CRITICAL:
                score -= 25.0
                critical_count += 1
            elif f.severity == ReviewSeverity.WARNING:
                score -= 10.0
                warning_count += 1
            elif f.severity == ReviewSeverity.PASS:
                pass_count += 1

        overall_score = round(max(0.0, min(100.0, score)), 1)
        is_approved = (overall_score >= 70.0) and (critical_count == 0)

        # 9. Knowledge Base Citations
        citations = []
        for claim in kb_context.get("approved_promotional_claims", []):
            citations.append({
                "type": "approved_claim",
                "title": claim.get("claim_text"),
                "evidence": claim.get("evidence_source")
            })
        for exc in kb_context.get("active_policy_exceptions", []):
            citations.append({
                "type": "policy_exception",
                "title": exc.get("rule_name"),
                "permitted_phrase": exc.get("permitted_phrase")
            })

        report = ContentReviewReport(
            review_id=review_id,
            org_id=request.org_id,
            brand_id=request.brand_id,
            brand_name=brand_name,
            content_type=request.content_type,
            content_filename=file_path_obj.name if file_path_obj else None,
            overall_score=overall_score,
            is_approved=is_approved,
            detected_issues=unique_findings,
            measurable_properties=measurable_props,
            extracted_text=extracted_text_content,
            knowledge_base_citations=citations,
            text_model_used="gemini-3.5-flash-lite",
            vision_model_used=vision_provider_label,
            created_at=now
        )

        self._save_report(report)
        return report

    def _save_report(self, report: ContentReviewReport) -> None:
        with self._lock:
            try:
                data = self._load_all()
                data[report.review_id] = report.model_dump()
                tmp = self.db_path.with_suffix(".tmp")
                tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
                tmp.replace(self.db_path)
            except Exception as e:
                logger.error("Failed to save content review report: %s", e)

    def _load_all(self) -> Dict[str, dict]:
        with self._lock:
            try:
                if not self.db_path.exists():
                    return {}
                content = self.db_path.read_text(encoding="utf-8").strip()
                return json.loads(content) if content else {}
            except Exception as e:
                logger.error("Failed to load content review reports: %s", e)
                return {}

    def list_reports(self, org_id: Optional[str] = None, brand_id: Optional[str] = None) -> List[ContentReviewReport]:
        data = self._load_all()
        results: List[ContentReviewReport] = []
        for raw in data.values():
            if org_id and raw.get("org_id") != org_id:
                continue
            if brand_id and raw.get("brand_id") != brand_id:
                continue
            try:
                results.append(ContentReviewReport(**raw))
            except Exception:
                pass
        return results


content_review_service = ContentReviewService()
