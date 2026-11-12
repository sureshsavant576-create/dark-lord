import json
from pathlib import Path
from backend.app.models.content_review import ContentReviewReport

p = Path("data/db/content_reviews.json")
data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

data["rev-4c19d2a"] = {
  "review_id": "rev-4c19d2a",
  "org_id": "apex-cloud",
  "brand_id": "apex-cloud",
  "brand_name": "Apex Cloud Systems",
  "content_type": "marketing_ad",
  "content_filename": "nike_compliant_poster.png",
  "department": "Marketing",
  "overall_score": 96.0,
  "is_approved": True,
  "detected_issues": [
    {
      "issue_category": "incorrect_brand_tone",
      "severity": "PASS",
      "description": "Copy aligns with approved direct, empowering, and authoritative tone.",
      "relevant_guideline": "Voice & Tone Standard v2",
      "explanation": "Messaging avoids hype and maintains technical precision.",
      "recommended_correction": "None required.",
      "confidence_level": 0.98,
      "source_engine": "hybrid_reviewer",
      "detected_snippet": None,
      "evidence_citation": None
    },
    {
      "issue_category": "visual_identity_violations",
      "severity": "PASS",
      "description": "Palette centroid conformance satisfied (Delta E = 2.1).",
      "relevant_guideline": "Colorimetric Centroid Specifications",
      "explanation": "Primary background and accents adhere to approved cobalt palette.",
      "recommended_correction": "None required.",
      "confidence_level": 0.96,
      "source_engine": "hybrid_reviewer",
      "detected_snippet": None,
      "evidence_citation": None
    }
  ],
  "measurable_properties": {
    "dimensions": {"width": 1080, "height": 1080},
    "aspect_ratio": 1.0,
    "aspect_ratio_label": "1:1 Square",
    "dominant_palette_hex": ["#0B132B", "#5BC0BE", "#FFFFFF"],
    "nearest_brand_colors": [],
    "dominant_color_delta_e": 2.1,
    "min_delta_e": 1.2,
    "whitespace_ratio": 0.42,
    "edge_density": 0.15,
    "luminance_mean": 45.2,
    "wcag_contrast_ratio": 7.4,
    "wcag_aa_compliant": True,
    "logo_detected": True,
    "logo_clear_space_px": 48.0,
    "logo_clear_space_compliant": True
  },
  "extracted_text": "Autonomous threat detection engineered for enterprise clouds. Verifiable zero-trust compliance.",
  "knowledge_base_citations": [],
  "text_model_used": "Gemini 3.1 Flash Lite",
  "vision_model_used": "Groq Llama 3.2 11B Vision",
  "created_at": "2026-11-12T10:00:00.000000+00:00"
}

data["rev-8a2f10b"] = {
  "review_id": "rev-8a2f10b",
  "org_id": "apex-cloud",
  "brand_id": "apex-cloud",
  "brand_name": "Apex Cloud Systems",
  "content_type": "marketing_ad",
  "content_filename": "nike_compliant_poster.png",
  "department": "Growth",
  "overall_score": 42.0,
  "is_approved": False,
  "detected_issues": [
    {
      "issue_category": "unsupported_promotional_claims",
      "severity": "CRITICAL",
      "description": "Unsubstantiated absolute claim: '#1 fastest cloud worldwide'",
      "relevant_guideline": "FTC Truth in Advertising Guidelines",
      "explanation": "Comparative superlative claims require certified third-party benchmark evidence.",
      "recommended_correction": "Replace with substantiated claim: 'Engineered for sub-10ms neural query throughput'",
      "confidence_level": 0.99,
      "source_engine": "hybrid_reviewer",
      "detected_snippet": "#1 fastest cloud worldwide",
      "evidence_citation": None
    },
    {
      "issue_category": "colour_inconsistencies",
      "severity": "CRITICAL",
      "description": "Rogue saturated orange detected (Delta E = 28.4)",
      "relevant_guideline": "Corporate Brand Palette Conformance",
      "explanation": "Saturated orange deviates heavily from dark cobalt corporate identity.",
      "recommended_correction": "Auto-Fix remapped pixel centroids to approved #0B132B / #5BC0BE",
      "confidence_level": 0.97,
      "source_engine": "hybrid_reviewer",
      "detected_snippet": None,
      "evidence_citation": None
    }
  ],
  "measurable_properties": {
    "dimensions": {"width": 1200, "height": 628},
    "aspect_ratio": 1.91,
    "aspect_ratio_label": "1.91:1 Landscape",
    "dominant_palette_hex": ["#FF5722", "#FF9800", "#1E293B"],
    "nearest_brand_colors": [],
    "dominant_color_delta_e": 28.4,
    "min_delta_e": 14.2,
    "whitespace_ratio": 0.18,
    "edge_density": 0.35,
    "luminance_mean": 62.0,
    "wcag_contrast_ratio": 3.2,
    "wcag_aa_compliant": False,
    "logo_detected": True,
    "logo_clear_space_px": 12.0,
    "logo_clear_space_compliant": False
  },
  "extracted_text": "#1 fastest cloud worldwide. Unhackable zero downtime cheap servers.",
  "knowledge_base_citations": [],
  "text_model_used": "Groq Llama 3.3 70B Versatile",
  "vision_model_used": "Groq Llama 3.2 11B Vision",
  "created_at": "2026-11-12T09:30:00.000000+00:00"
}

# Validate with Pydantic model
ContentReviewReport(**data["rev-4c19d2a"])
ContentReviewReport(**data["rev-8a2f10b"])

p.write_text(json.dumps(data, indent=2), encoding="utf-8")
print("Successfully validated and seeded rev-4c19d2a and rev-8a2f10b!")
