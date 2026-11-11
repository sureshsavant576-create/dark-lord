# Technical Architecture & Implementation Summary

This document details the engineering architecture, data isolation guarantees, modular AI orchestration, and deterministic vision pipelines powering **Sanket AI (संकेत AI)**.

---

## 1. System Architecture Overview

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                               FRONTEND TIER                                 │
 │  • Next.js 15 + React 19 Client (`frontend/src/app/`)                      │
 │  • Enterprise Static Shell (`backend/app/static/`)                          │
 │  • In-Browser HTML5 Canvas Pre-Flight Diagnostic Scanner                    │
 │  • Motion System: GPU-accelerated transforms & WCAG reduced-motion          │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ HTTPS / REST JSON
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                            API GATEWAY (FastAPI)                            │
 │  • Strict CORS & Magic-Bytes File Inspection Middleware                     │
 │  • Session Token & Role-Based Clearance Guards (PBKDF2-HMAC-SHA256)         │
 │  • Multi-Tenant Isolation Middleware (`org_id` context propagation)        │
 └──────────────────┬───────────────────────────────────────┬──────────────────┘
                    │                                       │
                    ▼                                       ▼
 ┌─────────────────────────────────────┐ ┌─────────────────────────────────────┐
 │      STAGE 1: DETERMINISTIC CV      │ │       STAGE 2: MULTIMODAL AI        │
 │  • Tesseract OCR Pixel Coordinate   │ │  • Modular AIGateway Orchestration  │
 │  • OpenCV Laplacian Whitespace Math │ │  • Google Gemini 1.5 Flash/Pro API  │
 │  • ColorThief CIELAB ΔE Colorimetry │ │  • Groq Cloud Llama 3.2 11B Vision  │
 │  • WCAG 2.1 Contrast Ratio Engine   │ │  • Pydantic Strict JSON Validation  │
 │  • Saliency-Preserved Auto-Fix Mask │ │  • Exponential Retry with Jitter    │
 └──────────────────┬──────────────────┘ └──────────────────┬──────────────────┘
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         STORAGE & PERSISTENCE TIER                          │
 │  • Supabase PostgreSQL with Row Level Security (RLS) Isolation              │
 │  • pgvector Cosine Semantic Retrieval for Knowledge Base Grounding          │
 │  • Tenant-Isolated Storage Buckets (`data/storage/tenants/{org_id}/`)       │
 │  • Immutable Append-Only Audit Logs (`data/db/audit_logs/audit_{org}.jsonl`)│
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dual-Layer Inspection & Remediation Pipeline

Sanket AI rejects the fragile paradigm of relying exclusively on generative LLMs for brand compliance. Instead, it executes a two-stage hybrid evaluation:

### Stage 1: Deterministic Computer Vision & OCR
1. **Pixel Extraction & Colorimetry**:
   - Computes dominant palette using Median Cut quantization and ColorThief.
   - Converts RGB coordinates to CIE 1976 $L^*a^*b^*$ perceptual color space.
   - Evaluates Euclidean distance $\Delta E = \sqrt{(\Delta L^*)^2 + (\Delta a^*)^2 + (\Delta b^*)^2}$ against approved brand centroids ($\Delta E \le 15.0$ tolerance).
2. **WCAG 2.1 Luminance Contrast Calculation**:
   - Calculates relative luminance:
     $$L = 0.2126 \cdot R_{sRGB} + 0.7152 \cdot G_{sRGB} + 0.0722 \cdot B_{sRGB}$$
   - Contrast ratio:
     $$\text{Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05}$$
   - Enforces $4.5:1$ for standard copy and $3.0:1$ for large display headings.
3. **Typography & Layout Density**:
   - Tesseract OCR extracts character bounding boxes, calculating text-to-canvas density.
   - OpenCV Laplacian variance measures background visual clutter and negative space percentage.

### Stage 2: Multimodal AI & Claim Verification
1. **Modular AI Gateway (`AIGateway`)**:
   - Seamlessly delegates between `GeminiProvider` (nuanced voice, tone, and brand identity synthesis) and `GroqProvider` (low-latency vision inference via Llama 3.2 Vision).
   - Enforces strict Pydantic model validation on all returned JSON schemas; rejects hallucinated structures.
2. **Knowledge Base Semantic Grounding**:
   - Extracts factual assertions from creative copy.
   - Queries the tenant's approved facts, certifications, and product metrics using cosine similarity in pgvector.
   - Classifies claims into 5 unambiguous states: `VERIFIED`, `UNSUPPORTED`, `CONTRADICTORY`, `POTENTIALLY_OUTDATED`, `REQUIRES_HUMAN_VERIFICATION`.

---

## 3. Generative Visual Auto-Fix Architecture

The Auto-Fix engine (`CreativeRemediationService`) corrects off-brand visuals without destructive overwrites:
1. **Visual Problem Detection**: Flags background color drift, low contrast, and unapproved palette choices.
2. **Centroid Remapping**: Maps off-brand pixels to the closest approved Brand DNA palette centroid in CIELAB space.
3. **Foreground Protection**: Applies Otsu thresholding and morphological gradient masks to preserve typography glyphs, logo vectors, and product photography.
4. **Non-Destructive Persistence**: Saves corrected variations separately (`data/storage/uploads/remediated_{id}.png`) and flags them with `requires_human_approval = True`.

---

## 4. Multi-Tenant Security & Role-Based Clearance (RBAC)

| Role | Clearances & Permissions |
| :--- | :--- |
| **Creator** | Submit creative copy and posters; view preliminary diagnostics; converse with Brand Co-Pilot; review proposed Auto-Fix variations; submit revisions. |
| **Manager** | Review department submissions; request revisions with structured feedback; view team compliance insights. |
| **Authorised Reviewer** | Sign off on escalated promotional claims; approve high-risk factual assertions; certify Brand DNA profiles. |
| **Administrator** | Full platform administration; invite users; configure AI provider routing; manage tenant profile and database retentions; view audit logs. |

### Data Isolation & RLS Guarantees
- Every database entity (`brand_id`, `review_id`, `claim_id`, `knowledge_item_id`) is strictly keyed by `org_id`.
- Tenant storage directories (`data/storage/tenants/{org_id}/`) reject path traversal attacks (`..`, `%2e%2e`, `/etc/`).
- File uploads are validated via binary magic bytes (`inspect_file_magic_bytes`) preventing executable disguised uploads.
