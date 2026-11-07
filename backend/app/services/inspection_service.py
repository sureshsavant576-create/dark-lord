"""BrandShield AI - Content Inspection & Explainable Report Service.

Combines deterministic code-based validations (CIELAB color distance, disallowed terminology regex)
with lightweight AI model assessments (mood, tone, visual style) into an explainable governance report.
"""
import json
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
from backend.app.preprocessing.pipeline import PreprocessedContent, preprocessing_pipeline
from backend.app.services.brand_service import brand_service

logger = logging.getLogger(__name__)


class InspectionService:
    """Manages the full developer content inspection lifecycle and persistent report store."""

    def __init__(self, db_path: Optional[Path] = None, brand_svc: Optional[BrandService] = None):
        self.db_path = db_path or (settings.DB_DIR / "inspection_reports.json")
        self.brand_service = brand_svc or brand_service
        self._ensure_db()

    def _ensure_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self.db_path.write_text("{}", encoding="utf-8")

    def _load_all(self) -> Dict[str, dict]:
        try:
            content = self.db_path.read_text(encoding="utf-8").strip()
            return json.loads(content) if content else {}
        except Exception as exc:
            logger.error("Error reading inspection reports db: %s", exc)
            return {}

    def _save_all(self, data: Dict[str, dict]) -> None:
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
        data = self._load_all()
        data[report.inspection_id] = report.model_dump()
        self._save_all(data)
        return report

    async def inspect_submission(
        self,
        brand_id: str,
        file_path: Path,
        declared_mime_type: Optional[str] = None,
        preferred_ai_provider: Optional[str] = None
    ) -> InspectionReport:
        """Execute end-to-end inspection of a creative submission against a company's brand profile."""
        # 1. Retrieve Stored Brand Profile
        brand = self.brand_service.get_brand_profile(brand_id)
        if not brand:
            raise ValueError(f"Brand with ID '{brand_id}' not found. Company must complete onboarding first.")

        # 2. Run Preprocessing & Feature Extraction
        preprocessed = preprocessing_pipeline.preprocess(file_path, declared_mime_type)
        inspection_id = f"insp-{uuid.uuid4().hex[:8]}"

        findings: List[InspectionFinding] = []
        matching_chars: List[str] = []
        mismatches: List[str] = []
        violations: List[str] = []
        corrections: List[str] = []

        # If file itself is invalid/unsupported
        if not preprocessed.is_supported:
            finding = InspectionFinding(
                id=f"f-{uuid.uuid4().hex[:6]}",
                title="Unsupported File Format",
                category=FindingCategory.TECHNICAL,
                source=FindingSource.DETERMINISTIC_CHECK,
                severity=FindingSeverity.CRITICAL,
                detected_value=file_path.suffix,
                expected_value="PNG, JPEG, WEBP, PDF, TXT, MD, MP3, WAV",
                explanation=f"File validation failed: {', '.join(preprocessed.errors)}",
                suggested_correction="Convert asset into a supported format before submission."
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

        # 3. Deterministic Evaluations
        det_score = 100.0

        # A. Color Palette Adherence (CIELAB Delta E)
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

        # B. Disallowed Terminology & Avoidances (Deterministic Regex)
        text_content = ""
        if preprocessed.document_data:
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
                    expected_value=f"Term disallowed by brand guidelines",
                    explanation=f"Brand guidelines strictly prohibit the use of '{fm.forbidden_term}'.",
                    suggested_correction=f"Remove '{fm.forbidden_term}' from creative copy.",
                    evidence_snippet=snippet
                ))

        # C. Technical Specifications (Sharpness & Aspect Ratio)
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

        # D. Audio Specifications
        if preprocessed.audio_data:
            audio = preprocessed.audio_data
            if not audio.is_valid_audio:
                det_score -= 30.0
                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title="Audio Decoding Error",
                    category=FindingCategory.TECHNICAL,
                    source=FindingSource.DETERMINISTIC_CHECK,
                    severity=FindingSeverity.CRITICAL,
                    detected_value="Corrupt audio stream",
                    expected_value="Valid MP3 / WAV audio format",
                    explanation=audio.error_message or "Could not parse audio frames."
                ))
            else:
                matching_chars.append(f"Audio duration {audio.duration_seconds}s matches expected jingle / ad profile.")

        det_score = max(0.0, min(100.0, round(det_score, 1)))

        # 4. AI Semantic & Multimodal Inspection
        brand_target_profile = {
            "brand_name": brand.brand_name,
            "personality": ", ".join(brand.personality),
            "mood": ", ".join(brand.mood),
            "tone": ", ".join(brand.communication_tone),
            "visual_style": ", ".join(brand.visual_style),
            "palette": brand.approved_palette,
            "target_audience": brand.target_audience,
            "disallowed_elements": brand.disallowed_elements
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
            # Blended weighted score: 45% deterministic criteria, 55% AI subjective alignment
            overall_score = round((det_score * 0.45) + (float(ai_score or 50.0) * 0.55), 1)

            # Mood Finding
            findings.append(InspectionFinding(
                id=f"f-{uuid.uuid4().hex[:6]}",
                title="Mood Alignment",
                category=FindingCategory.MOOD,
                source=FindingSource.AI_MODEL_INFERENCE,
                severity=FindingSeverity.PASS if any(m.lower() in ai_eval.mood_detected.lower() for m in brand.mood) else FindingSeverity.WARNING,
                detected_value=ai_eval.mood_detected,
                expected_value=", ".join(brand.mood),
                explanation=f"AI model evaluated the emotional mood of the creative as '{ai_eval.mood_detected}'.",
                confidence_score=ai_eval.confidence_score
            ))

            # Personality & Tone Finding
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

            # Record AI-detected mismatches
            for m in ai_eval.mismatches_identified:
                mismatches.append(f"[AI Observation] {m}")
                findings.append(InspectionFinding(
                    id=f"f-{uuid.uuid4().hex[:6]}",
                    title="AI Observed Brand Discrepancy",
                    category=FindingCategory.VISUAL_STYLE,
                    source=FindingSource.AI_MODEL_INFERENCE,
                    severity=FindingSeverity.WARNING,
                    detected_value=m,
                    expected_value=f"Align with {', '.join(brand.visual_style)}",
                    explanation=f"The AI model identified an aesthetic or messaging departure: {m}",
                    suggested_correction="Adjust visual layout or messaging to match approved brand style.",
                    confidence_score=ai_eval.confidence_score
                ))

        else:
            # Rule 10 & 11: Do not invent AI scores when unconfigured
            ai_score = None
            overall_score = det_score
            findings.append(InspectionFinding(
                id=f"f-{uuid.uuid4().hex[:6]}",
                title="AI Reasoning Status: Unconfigured",
                category=FindingCategory.TECHNICAL,
                source=FindingSource.DETERMINISTIC_CHECK,
                severity=FindingSeverity.INFO,
                detected_value="Deterministic Checks Active Only",
                expected_value="Configure GEMINI_API_KEY or OPENAI_API_KEY in .env",
                explanation=ai_eval.detailed_analysis,
                suggested_correction="Add an API key to .env to unlock AI semantic and multimodal reasoning."
            ))

        # 5. Determine Overall Verdict
        has_critical = any(f.severity == FindingSeverity.CRITICAL for f in findings)
        effective_score = overall_score if overall_score is not None else det_score

        if has_critical or effective_score < 50.0:
            verdict = InspectionVerdict.REJECTED if effective_score < 40.0 else InspectionVerdict.CHANGES_REQUESTED
        elif effective_score >= settings.MIN_OVERALL_PASS_SCORE:
            verdict = InspectionVerdict.APPROVED
        else:
            verdict = InspectionVerdict.REQUIRES_HUMAN_REVIEW

        report = InspectionReport(
            inspection_id=inspection_id,
            brand_id=brand_id,
            brand_name=brand.brand_name,
            submission_filename=file_path.name,
            media_category=preprocessed.media_category,
            verdict=verdict,
            overall_score=overall_score,
            deterministic_score=det_score,
            ai_score=ai_score,
            findings=findings,
            matching_characteristics=matching_chars,
            mismatches=mismatches,
            guideline_violations=violations,
            suggested_corrections=corrections,
            human_review_required=True,
            human_decision="PENDING",
            technical_summary={
                "sha256": preprocessed.validation.sha256_hash,
                "file_size_bytes": preprocessed.validation.file_size_bytes,
                "dominant_color": preprocessed.dominant_color_hex,
                "detected_palette": preprocessed.extracted_colors_hex,
                "aspect_ratio": preprocessed.image_metadata.aspect_ratio if preprocessed.image_metadata else None,
                "duration_seconds": preprocessed.audio_data.duration_seconds if preprocessed.audio_data else None
            }
        )

        return self.save_report(report)

    def record_human_decision(self, submission: HumanReviewSubmission) -> InspectionReport:
        """Record the final approval or change request decision by a human reviewer."""
        report = self.get_report(submission.inspection_id)
        if not report:
            raise ValueError(f"Inspection report '{submission.inspection_id}' not found.")

        report.human_decision = submission.decision.upper()
        report.reviewed_by = submission.reviewer_name
        report.reviewer_notes = submission.reviewer_notes
        report.reviewed_at = datetime.now(timezone.utc).isoformat()

        if submission.decision.upper() == "APPROVED":
            report.verdict = InspectionVerdict.APPROVED
        elif submission.decision.upper() == "CHANGES_REQUESTED":
            report.verdict = InspectionVerdict.CHANGES_REQUESTED
        elif submission.decision.upper() == "REJECTED":
            report.verdict = InspectionVerdict.REJECTED

        return self.save_report(report)


inspection_service = InspectionService()
