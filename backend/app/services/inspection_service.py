from __future__ import annotations
import json
import threading
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from backend.app.ai.base import ContentAnalysisRequest, ProviderStatus
from backend.app.ai.gateway import ai_gateway
from backend.app.core.config import settings
from backend.app.models.brand import BrandProfile
from backend.app.models.inspection import (
    FindingCategory,
    FindingSeverity,
    FindingSource,
    HumanReviewSubmission,
    InspectionFinding,
    InspectionReport,
    InspectionVerdict,
)
from backend.app.preprocessing.color_extractor import calculate_delta_e, find_closest_brand_color
from backend.app.preprocessing.document_extractor import check_forbidden_terms
from backend.app.preprocessing.fingerprint_engine import (
    BrandDNAFingerprint,
    compute_biometric_vector_match,
    extract_text_fingerprint,
)
from backend.app.preprocessing.pipeline import PreprocessedContent, preprocessing_pipeline
from backend.app.services.brand_service import brand_service

logger = logging.getLogger(__name__)

class InspectionService:

    def __init__(self, db_path: Optional[Path] = None, brand_svc: Optional[BrandService] = None):
        self.db_path = db_path or (settings.DB_DIR / "inspection_reports.json")
        self.brand_service = brand_svc or brand_service
        self._lock = threading.RLock()
        self._ensure_db()

    def _ensure_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self.db_path.write_text("{}", encoding="utf-8")

    def _load_all(self) -> Dict[str, dict]:
        with self._lock:
            try:
                content = self.db_path.read_text(encoding="utf-8").strip()
                return json.loads(content) if content else {}
            except Exception as exc:
                logger.error("Error reading inspection reports db: %s", exc)
                return {}

    def _save_all(self, data: Dict[str, dict]) -> None:
        with self._lock:
            temp_path = self.db_path.with_suffix(".tmp")
            temp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            temp_path.replace(self.db_path)

    def get_report(self, inspection_id: str) -> Optional[InspectionReport]:
        data = self._load_all()
        raw = data.get(inspection_id)
        return InspectionReport(**raw) if raw else None

    def list_reports(self, brand_id: Optional[str] = None) -> List[InspectionReport]:
        data = self._load_all()
        reports = [InspectionReport(**item) for item in data.values()]
        if brand_id:
            reports = [r for r in reports if r.brand_id == brand_id]
        return sorted(reports, key=lambda r: r.created_at, reverse=True)

    def save_report(self, report: InspectionReport) -> InspectionReport:
        with self._lock:
            data = self._load_all()
            data[report.inspection_id] = report.model_dump()
            self._save_all(data)
            return report

    def delete_report(self, inspection_id: str, delete_files: bool = True) -> bool:
        with self._lock:
            data = self._load_all()
            if inspection_id in data:
                raw = data[inspection_id]
                if delete_files:
                    sub_path = raw.get("submission_file_path")
                    if sub_path:
                        try:
                            p = Path(sub_path)
                            if p.exists() and p.is_file():
                                p.unlink(missing_ok=True)
                        except Exception as e:
                            logger.warning("Failed to remove submission file %s: %s", sub_path, e)

                    annotated_path = raw.get("annotated_preview_path")
                    if annotated_path:
                        try:
                            ap = Path(annotated_path)
                            if ap.exists() and ap.is_file():
                                ap.unlink(missing_ok=True)
                        except Exception:
                            pass

                    filename = raw.get("submission_filename")
                    if filename:
                        try:
                            for candidate in settings.UPLOADS_DIR.glob(f"*{filename}*"):
                                if candidate.is_file():
                                    candidate.unlink(missing_ok=True)
                        except Exception:
                            pass

                del data[inspection_id]
                self._save_all(data)
                return True
            return False

    def delete_reports_for_brand(self, brand_id: str, delete_files: bool = True) -> int:
        with self._lock:
            data = self._load_all()
            targets = [k for k, v in data.items() if v.get("brand_id") == brand_id]
            count = 0
            for tid in targets:
                if self.delete_report(tid, delete_files=delete_files):
                    count += 1
            return count

    def clear_all_reports(self, brand_id: Optional[str] = None, org_id: Optional[str] = None, delete_files: bool = True) -> int:
        with self._lock:
            data = self._load_all()
            targets = []
            for k, v in data.items():
                if brand_id and v.get("brand_id") != brand_id:
                    continue
                if org_id and v.get("org_id") not in (org_id, "default-org"):
                    continue
                targets.append(k)

            count = 0
            for tid in targets:
                if self.delete_report(tid, delete_files=delete_files):
                    count += 1
            return count

    async def inspect_submission(
        self,
        brand_id: str,
        file_path: Path,
        declared_mime_type: Optional[str] = None,
        preferred_ai_provider: Optional[str] = None,
        submission_copy_text: Optional[str] = None,
        submitted_by: str = "default-dev",
        org_id: str = "default-org"
    ) -> InspectionReport:
        brand = self.brand_service.get_brand_profile(brand_id)
        if not brand:
            raise ValueError(f"Brand with ID '{brand_id}' not found. Company must complete onboarding first.")

        preprocessed = preprocessing_pipeline.preprocess(
            file_path=file_path,
            declared_mime_type=declared_mime_type,
            prohibited_terms=brand.disallowed_elements
        )
        inspection_id = f"insp-{uuid.uuid4().hex[:8]}"

        findings: List[InspectionFinding] = []
        matching_chars: List[str] = []
        mismatches: List[str] = []
        violations: List[str] = []
        corrections: List[str] = []

        if not preprocessed.is_supported:
            finding = InspectionFinding(
                id=f"f-{uuid.uuid4().hex[:6]}",
                title="Unsupported File Format",
                category=FindingCategory.TECHNICAL,
                source=FindingSource.DETERMINISTIC_CHECK,
                severity=FindingSeverity.CRITICAL,
                detected_value=file_path.suffix,
                expected_value="PNG, JPEG, WEBP, PDF, TXT, MD",
                explanation=f"File validation failed: {', '.join(preprocessed.errors)}",
                suggested_correction="Convert asset into a supported visual creative or document format before submission."
            )
            return self.save_report(InspectionReport(
                inspection_id=inspection_id,
                brand_id=brand_id,
                brand_name=brand.brand_name,
                submission_filename=file_path.name,
                media_category="unsupported",
                verdict=InspectionVerdict.REJECTED,
                overall_score=0.0,
                deterministic_score=0.0,
                findings=[finding],
                guideline_violations=["Submitted file is corrupted or in an unsupported format."],
                human_review_required=True
            ))

        brand_dna_data = brand.brand_dna or {}
        is_minimalist = any("minimal" in s.lower() for s in (brand.visual_style + brand.personality))
        target_ws = brand_dna_data.get("target_whitespace_ratio", 0.65 if is_minimalist else 0.40)
        target_cx = brand_dna_data.get("target_complexity_index", 0.20 if is_minimalist else 0.45)
        target_lum = brand_dna_data.get("target_luminance_mean", 0.85 if is_minimalist else 0.40)

        brand_dna = BrandDNAFingerprint(
            brand_id=brand.brand_id,
            target_palette_hex=brand.approved_palette,
            target_whitespace_ratio=target_ws,
            target_complexity_index=target_cx,
            target_luminance_mean=target_lum,
            prohibited_terms=brand.disallowed_elements
        )

        active_text_fp = preprocessed.text_fingerprint
        if not active_text_fp and submission_copy_text and submission_copy_text.strip():
            active_text_fp = extract_text_fingerprint(submission_copy_text.strip(), brand.disallowed_elements)

        bio_result = compute_biometric_vector_match(
            brand_dna=brand_dna,
            visual_fp=preprocessed.visual_fingerprint,
            text_fp=active_text_fp
        )

        det_score = 100.0

        if preprocessed.color_palette and brand.approved_palette:
            dominant_hex = preprocessed.dominant_color_hex or ""
            closest_brand_color, delta_e = find_closest_brand_color(dominant_hex, brand.approved_palette)

            if delta_e <= settings.MAX_COLOR_DELTA_E:
                matching_chars.append(f"Dominant color {dominant_hex} closely aligns with approved brand color {closest_brand_color} (ΔE = {delta_e:.1f})")
                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title="Approved Color Palette Alignment",
                    category=FindingCategory.COLOR,
                    source=FindingSource.DETERMINISTIC_CHECK,
                    severity=FindingSeverity.PASS,
                    detected_value=dominant_hex,
                    expected_value=closest_brand_color,
                    explanation=f"Dominant color matches approved brand palette within acceptable perceptual tolerance (CIELAB ΔE = {delta_e:.1f} ≤ {settings.MAX_COLOR_DELTA_E})."
                ))
            else:
                det_score -= 25.0
                mismatch_desc = f"Dominant color {dominant_hex} deviates significantly from nearest approved brand color {closest_brand_color} (ΔE = {delta_e:.1f} > {settings.MAX_COLOR_DELTA_E})"
                mismatches.append(mismatch_desc)
                violations.append("Off-brand dominant color palette")
                correction_msg = f"Replace or tint background/primary elements to use approved brand colors ({', '.join(brand.approved_palette)})."
                corrections.append(correction_msg)

                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title="Color Palette Mismatch",
                    category=FindingCategory.COLOR,
                    source=FindingSource.DETERMINISTIC_CHECK,
                    severity=FindingSeverity.WARNING if delta_e < 25.0 else FindingSeverity.CRITICAL,
                    detected_value=dominant_hex,
                    expected_value=f"Approved colors: {', '.join(brand.approved_palette)}",
                    explanation=mismatch_desc,
                    suggested_correction=correction_msg
                ))

        text_content = ""
        if submission_copy_text and submission_copy_text.strip():
            text_content = submission_copy_text.strip()
            if preprocessed.document_data:
                text_content += f"\n{preprocessed.document_data.full_text}"
        elif preprocessed.document_data:
            text_content = preprocessed.document_data.full_text
        elif preprocessed.extracted_text_summary:
            text_content = preprocessed.extracted_text_summary

        if text_content and brand.disallowed_elements:
            forbidden_matches = check_forbidden_terms(text_content, brand.disallowed_elements)
            for fm in forbidden_matches:
                det_score -= 20.0
                violation_text = f"Forbidden brand term '{fm.forbidden_term}' detected ({fm.occurrences}x)."
                violations.append(violation_text)
                corrections.append(f"Remove or replace prohibited term '{fm.forbidden_term}' with an approved alternative.")
                
                snippet = fm.context_snippets[0] if fm.context_snippets else ""
                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title=f"Disallowed Terminology: '{fm.forbidden_term}'",
                    category=FindingCategory.TERMINOLOGY,
                    source=FindingSource.DETERMINISTIC_CHECK,
                    severity=FindingSeverity.CRITICAL,
                    detected_value=f"'{fm.forbidden_term}' ({fm.occurrences} occurrences)",
                    expected_value="Term disallowed by brand guidelines",
                    explanation=f"Brand guidelines strictly prohibit the use of '{fm.forbidden_term}'.",
                    suggested_correction=f"Remove '{fm.forbidden_term}' from creative copy.",
                    evidence_snippet=snippet
                ))

        if preprocessed.image_metadata:
            meta = preprocessed.image_metadata
            if meta.is_blurry:
                det_score -= 15.0
                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title="Low Image Sharpness",
                    category=FindingCategory.TECHNICAL,
                    source=FindingSource.DETERMINISTIC_CHECK,
                    severity=FindingSeverity.WARNING,
                    detected_value=f"Sharpness Score: {meta.sharpness_score:.1f}",
                    expected_value="Sharpness Score ≥ 60.0",
                    explanation="Image appears blurry or low-fidelity under Laplacian edge analysis.",
                    suggested_correction="Export creative at high resolution without lossy compression artifacts."
                ))
            else:
                matching_chars.append(f"Image sharpness ({meta.sharpness_score:.1f}) meets quality threshold.")

        bio_severity = FindingSeverity.PASS if bio_result.composite_biometric_score >= 70.0 else (
            FindingSeverity.WARNING if bio_result.composite_biometric_score >= 45.0 else FindingSeverity.CRITICAL
        )
        findings.append(InspectionFinding(
            id=f"f-{uuid.uuid4().hex[:6]}",
            title="Biometric Brand Vector DNA Match",
            category=FindingCategory.BIOMETRIC_VECTOR,
            source=FindingSource.DETERMINISTIC_CHECK,
            severity=bio_severity,
            detected_value=f"Biometric Match: {bio_result.composite_biometric_score:.1f}% (Color: {bio_result.color_dna_score:.0f}%, Whitespace: {bio_result.whitespace_dna_score:.0f}%, Clutter: {bio_result.complexity_dna_score:.0f}%)",
            expected_value="Brand DNA Match ≥ 70.0%",
            explanation=f"Mathematical feature vector compared against brand DNA template. Divergences: {', '.join(bio_result.divergent_factors) if bio_result.divergent_factors else 'None detected.'}",
            suggested_correction="Harmonize layout whitespace and palette distribution to match company brand DNA." if bio_result.composite_biometric_score < 70.0 else None
        ))

        if not violations and det_score >= 85.0:
            det_score = det_score
        else:
            det_score = max(0.0, min(100.0, round((det_score * 0.8) + (bio_result.composite_biometric_score * 0.2), 1)))

        brand_target_profile = {
            "brand_name": brand.brand_name,
            "personality": ", ".join(brand.personality),
            "mood": ", ".join(brand.mood),
            "tone": ", ".join(brand.communication_tone),
            "visual_style": ", ".join(brand.visual_style),
            "palette": brand.approved_palette,
            "target_audience": brand.target_audience,
            "disallowed_elements": brand.disallowed_elements,
            "logo_url": getattr(brand, "logo_url", "") or ""
        }

        ai_req = ContentAnalysisRequest(
            file_path=file_path,
            mime_type=preprocessed.validation.mime_type,
            extracted_text=text_content,
            extracted_colors=preprocessed.extracted_colors_hex
        )

        ai_eval = await ai_gateway.analyze_creative_content(
            request=ai_req,
            target_profile=brand_target_profile,
            preferred_provider=preferred_ai_provider
        )

        ai_score: Optional[float] = None
        overall_score: Optional[float] = None

        if ai_eval.status == ProviderStatus.OPERATIONAL and ai_eval.is_ai_generated:
            ai_score = ai_eval.alignment_score
            overall_score = round((det_score * 0.45) + (float(ai_score or 50.0) * 0.55), 1)

            findings.append(InspectionFinding(
                id=f"f-{uuid.uuid4().hex[:6]}",
                title="Mood Alignment",
                category=FindingCategory.MOOD,
                source=FindingSource.AI_MODEL_INFERENCE,
                severity=FindingSeverity.PASS if any(m.lower() in ai_eval.mood_detected.lower() for m in brand.mood) else FindingSeverity.WARNING,
                detected_value=ai_eval.mood_detected,
                expected_value=", ".join(brand.mood),
                explanation=f"Evaluated emotional mood of the creative as '{ai_eval.mood_detected}'.",
                confidence_score=ai_eval.confidence_score
            ))

            findings.append(InspectionFinding(
                id=f"f-{uuid.uuid4().hex[:6]}",
                title="Brand Personality & Tone Alignment",
                category=FindingCategory.PERSONALITY,
                source=FindingSource.AI_MODEL_INFERENCE,
                severity=FindingSeverity.PASS if any(p.lower() in ai_eval.personality_detected.lower() for p in brand.personality) else FindingSeverity.INFO,
                detected_value=f"Personality: {ai_eval.personality_detected} | Tone: {ai_eval.tone_detected}",
                expected_value=f"Personality: {', '.join(brand.personality)} | Tone: {', '.join(brand.communication_tone)}",
                explanation=ai_eval.detailed_analysis or "Creative tone analyzed against target personality guidelines.",
                confidence_score=ai_eval.confidence_score
            ))

            if ai_eval.typography_detected and ai_eval.typography_detected.lower() not in ("unspecified", "unknown", "none"):
                expected_typo = ", ".join(brand.typography) if hasattr(brand, "typography") and brand.typography else "Harmonious typographic hierarchy"
                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title="Typography & Text Hierarchy",
                    category=FindingCategory.TYPOGRAPHY,
                    source=FindingSource.AI_MODEL_INFERENCE,
                    severity=FindingSeverity.PASS,
                    detected_value=ai_eval.typography_detected,
                    expected_value=expected_typo,
                    explanation=f"Detected font choices, weights and readability: {ai_eval.typography_detected}",
                    confidence_score=ai_eval.confidence_score
                ))

            if ai_eval.layout_detected and ai_eval.layout_detected.lower() not in ("unspecified", "unknown", "none"):
                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title="Layout Composition & Whitespace",
                    category=FindingCategory.LAYOUT,
                    source=FindingSource.AI_MODEL_INFERENCE,
                    severity=FindingSeverity.PASS,
                    detected_value=ai_eval.layout_detected,
                    expected_value=f"Align with {', '.join(brand.visual_style)}",
                    explanation=f"Detected spatial layout and composition density: {ai_eval.layout_detected}",
                    confidence_score=ai_eval.confidence_score
                ))

            
            if ai_eval.is_logo_verified is not None:
                if ai_eval.is_logo_verified:
                    matching_chars.append(f"Official {brand.brand_name} brand logo verified on creative.")
                    findings.append(InspectionFinding(
                        id=f"f-{uuid.uuid4().hex[:6]}",
                        title="Brand Logo Verified",
                        category=FindingCategory.VISUAL_STYLE,
                        source=FindingSource.AI_MODEL_INFERENCE,
                        severity=FindingSeverity.PASS,
                        detected_value=ai_eval.logo_detected or "Official brand logo present",
                        expected_value=f"{brand.brand_name} official logo",
                        explanation=f"The creative correctly incorporates the authentic {brand.brand_name} logo.",
                        confidence_score=ai_eval.confidence_score
                    ))
                else:
                    det_score -= 20.0
                    mismatches.append(f"Logo departure: {ai_eval.logo_detected or 'No brand logo detected'}")
                    violations.append(f"Missing or incorrect {brand.brand_name} brand logo")
                    corrections.append(f"Include the authentic, un-distorted {brand.brand_name} logo on the creative asset.")
                    findings.append(InspectionFinding(
                        id=f"f-{uuid.uuid4().hex[:6]}",
                        title="Brand Logo Missing or Deprecated",
                        category=FindingCategory.VISUAL_STYLE,
                        source=FindingSource.AI_MODEL_INFERENCE,
                        severity=FindingSeverity.WARNING,
                        detected_value=ai_eval.logo_detected or "No brand logo detected",
                        expected_value=f"{brand.brand_name} approved logo",
                        explanation=f"Brand compliance requires official {brand.brand_name} insignia on promotional media. {ai_eval.logo_detected or ''}".strip(),
                        suggested_correction=f"Add the official {brand.brand_name} logo in accordance with brand guidelines.",
                        confidence_score=ai_eval.confidence_score
                    ))
            elif getattr(brand, "logo_url", None) and preprocessed.is_visual_media:
                has_name = brand.brand_name.lower() in text_content.lower()
                if has_name:
                    matching_chars.append(f"Brand wordmark '{brand.brand_name}' detected on creative.")
                    findings.append(InspectionFinding(
                        id=f"f-{uuid.uuid4().hex[:6]}",
                        title="Brand Mark Identified",
                        category=FindingCategory.VISUAL_STYLE,
                        source=FindingSource.AI_MODEL_INFERENCE,
                        severity=FindingSeverity.PASS,
                        detected_value=f"Wordmark '{brand.brand_name}'",
                        expected_value=f"{brand.brand_name} logo",
                        explanation=f"Brand reference text '{brand.brand_name}' identified on submitted asset."
                    ))

            for m in ai_eval.mismatches_identified:
                mismatches.append(f"[Observation] {m}")
                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title="Observed Brand Departure",
                    category=FindingCategory.VISUAL_STYLE,
                    source=FindingSource.AI_MODEL_INFERENCE,
                    severity=FindingSeverity.WARNING,
                    detected_value=m,
                    expected_value=f"Align with {', '.join(brand.visual_style)}",
                    explanation=f"Identified an aesthetic or messaging departure: {m}",
                    suggested_correction="Adjust visual layout or messaging to match approved brand style.",
                    confidence_score=ai_eval.confidence_score
                ))

        else:
            ai_score = None
            overall_score = det_score
            findings.append(InspectionFinding(
                id=f"f-{uuid.uuid4().hex[:6]}",
                title="Semantic Reasoning: Unconfigured",
                category=FindingCategory.TECHNICAL,
                source=FindingSource.DETERMINISTIC_CHECK,
                severity=FindingSeverity.INFO,
                detected_value="Deterministic Checks Active Only",
                expected_value="Configure GEMINI_API_KEY or OPENAI_API_KEY in .env",
                explanation=ai_eval.detailed_analysis,
                suggested_correction="Add an API key to .env to unlock AI semantic and multimodal reasoning."
            ))

        has_critical = any(f.severity == FindingSeverity.CRITICAL for f in findings)
        effective_score = overall_score if overall_score is not None else det_score

        if has_critical or (violations and effective_score < 50.0) or effective_score < 30.0:
            verdict = InspectionVerdict.REJECTED if (effective_score < 35.0 and violations) else InspectionVerdict.CHANGES_REQUESTED
        elif effective_score >= settings.MIN_OVERALL_PASS_SCORE and not violations:
            verdict = InspectionVerdict.APPROVED
        else:
            verdict = InspectionVerdict.REQUIRES_HUMAN_REVIEW

        report = InspectionReport(
            inspection_id=inspection_id,
            brand_id=brand_id,
            brand_name=brand.brand_name,
            submitted_by=submitted_by,
            org_id=org_id,
            submission_filename=file_path.name,
            media_category=preprocessed.media_category,
            verdict=verdict,
            overall_score=overall_score,
            deterministic_score=det_score,
            ai_score=ai_score,
            ai_explanation=ai_eval.detailed_analysis if (ai_eval.status == ProviderStatus.OPERATIONAL and ai_eval.is_ai_generated) else None,
            ai_mood_detected=ai_eval.mood_detected if (ai_eval.status == ProviderStatus.OPERATIONAL and ai_eval.is_ai_generated) else None,
            ai_personality_detected=ai_eval.personality_detected if (ai_eval.status == ProviderStatus.OPERATIONAL and ai_eval.is_ai_generated) else None,
            ai_tone_detected=ai_eval.tone_detected if (ai_eval.status == ProviderStatus.OPERATIONAL and ai_eval.is_ai_generated) else None,
            ai_typography_detected=ai_eval.typography_detected if (ai_eval.status == ProviderStatus.OPERATIONAL and ai_eval.is_ai_generated and ai_eval.typography_detected.lower() not in ("unspecified", "none")) else None,
            ai_layout_detected=ai_eval.layout_detected if (ai_eval.status == ProviderStatus.OPERATIONAL and ai_eval.is_ai_generated and ai_eval.layout_detected.lower() not in ("unspecified", "none")) else None,
            biometric_match={
                "composite_score": bio_result.composite_biometric_score,
                "color_dna_score": bio_result.color_dna_score,
                "whitespace_dna_score": bio_result.whitespace_dna_score,
                "complexity_dna_score": bio_result.complexity_dna_score,
                "copy_dna_score": bio_result.copy_dna_score,
                "divergent_factors": bio_result.divergent_factors
            },
            findings=findings,
            matching_characteristics=matching_chars,
            mismatches=mismatches,
            guideline_violations=violations,
            suggested_corrections=corrections,
            human_review_required=True,
            human_decision="PENDING",
            submission_file_path=str(file_path.resolve()) if file_path else None,
            technical_summary={
                "sha256": preprocessed.validation.sha256_hash,
                "file_size_bytes": preprocessed.validation.file_size_bytes,
                "dominant_color": preprocessed.dominant_color_hex,
                "detected_palette": preprocessed.extracted_colors_hex,
                "aspect_ratio": preprocessed.image_metadata.aspect_ratio if preprocessed.image_metadata else None,
                "whitespace_ratio": preprocessed.visual_fingerprint.whitespace_ratio if preprocessed.visual_fingerprint else None,
                "complexity_index": preprocessed.visual_fingerprint.complexity_index if preprocessed.visual_fingerprint else None,
                "duration_seconds": preprocessed.audio_metadata.duration_seconds if preprocessed.audio_metadata else None
            }
        )

        return self.save_report(report)

    def record_human_decision(self, submission: HumanReviewSubmission) -> InspectionReport:
        report = self.get_report(submission.inspection_id)
        if not report:
            raise ValueError(f"Inspection report '{submission.inspection_id}' not found.")

        report.human_decision = submission.decision.upper()
        report.reviewed_by = submission.reviewer_name or submission.reviewer_email or "Compliance Reviewer"
        report.reviewer_notes = submission.reviewer_notes
        report.reviewed_at = datetime.now(timezone.utc).isoformat()

        if submission.decision.upper() == "APPROVED":
            report.verdict = InspectionVerdict.APPROVED
            report.human_review_required = False
        elif submission.decision.upper() == "CHANGES_REQUESTED":
            report.verdict = InspectionVerdict.CHANGES_REQUESTED
            report.human_review_required = True
        elif submission.decision.upper() == "REJECTED":
            report.verdict = InspectionVerdict.REJECTED
            report.human_review_required = False

        return self.save_report(report)

inspection_service = InspectionService()
