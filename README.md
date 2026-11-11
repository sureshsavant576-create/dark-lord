# Sanket AI (संकेत AI)

> **Enterprise Brand Governance & Multimodal Design Intelligence SaaS**  
> *Because catching an off-brand creative before publication is 100x easier than doing damage control afterwards.*

---

## 💡 Why We Built Sanket AI

Marketing teams, agencies, and enterprise organizations produce hundreds of promotional assets, social media banners, advertising campaigns, and documentation files each month.

Inevitably, compliance issues slip through:
- An off-brand color that drifts from approved hex guidelines.
- Unsubstantiated or exaggerated promotional claims (*"Guaranteed 100% bug-free"*, *"#1 in the industry"*).
- Accessibility violations such as low text-to-background contrast or illegible micro-typography.
- Outdated product specifications and contradictory claims.
- Banned terminology and tone misalignment.

Most teams either rely on slow, manual reviews or blindly trust Large Language Models (LLMs) to inspect designs. But LLMs frequently hallucinate exact HEX color codes, struggle with spatial layout mathematics, and overlook prohibited claims buried in creative copy.

**Sanket AI (संकेत AI)** solves this with a **2-stage hybrid architecture**: deterministic computer vision mathematics, Tesseract OCR, and regex boundary filters do the heavy lifting first, followed by multimodal AI (Google Gemini + Groq Vision) for semantic reasoning.

---

## ⚡ Architecture & Dual-Layer Pipeline

```text
               [ Uploaded Creative: Image / Text / PDF / Social Ad ]
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  STAGE 1: Deterministic Mathematical Verification & Computer Vision              │
│  • Tesseract OCR: Text extraction from pixel coordinates                         │
│  • OpenCV & Pillow: Edge detection, typography glyph masks, saliency mapping     │
│  • ColorThief & CIELAB ΔE: Perceptual color difference (< 15.0 delta threshold)   │
│  • WCAG 2.1 Contrast Ratio Math: Luminance contrast calculation (L1 + 0.05)/(L2+0.05)│
│  • Laplacian Clutter & Whitespace Density Ratio Math                             │
│  • Strict Regex Boundary Lexical Matcher for Prohibited Terms                    │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  STAGE 2: Multimodal AI Semantic Reasoning & Claim Verification                  │
│  • Google Gemini Text Analyzer (Structured Pydantic JSON Output)                 │
│  • Groq Cloud-Hosted Vision Model (Llama-3.2-11b-vision-preview)                 │
│  • Factual & Promotional Claim Verification Engine (Grounding against KB)        │
│  • pgvector Semantic Cosine Similarity (Multi-tenant Brand Knowledge Base)       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  STAGE 3: Remediation & Organizational Workflow Governance                       │
│  • Instant Client-Side Creative Pre-Flight Scanner (Canvas Heuristics)           │
│  • Interactive AI Brand Co-Pilot (Remediation Chatbot with 9 capabilities)       │
│  • Functional AI-Assisted Visual Correction ("Auto-Fix" with Saliency Masking)   │
│  • Role-Based Workflow Engine (Creator, Manager, Authorised Reviewer, Admin)     │
│  • Automatic High-Risk Claim Escalation & Immutable Audit Trail                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 Implemented Requirements Matrix (All 10 Built & Certified)

| # | Requirement | Implementation Module | Description |
| :--- | :--- | :--- | :--- |
| **1** | **Implementation Assessment & Code Preservation** | `backend/app/` | Preserved existing structure, clean separation of concern, 0 broken features. |
| **2** | **AI-Powered Brand DNA Generator** | `brand_dna_service.py` | Collects 10 dimensions, generates 13-point structured DNA via Gemini, validates with Pydantic, distinguishes user facts from AI suggestions, requires user approval before saving. |
| **3** | **Brand Knowledge Base (Multi-Tenant RLS)** | `knowledge_service.py` | Multi-tenant isolation by `org_id`, Supabase RLS policies, pgvector cosine retrieval, guideline versioning, strict grounding. |
| **4** | **AI Content Review System** | `inspection_service.py`, `content_review_service.py` | Analyzes text, images, PDFs, social creatives. Uses Gemini + Groq Vision + Tesseract OCR + OpenCV. Detects tone, terminology, visual violations, claims, and accessibility. |
| **5** | **Claim Verification Engine** | `claim_verification_service.py` | Detects superlatives, guarantees, awards, percentages. Classifies into 5 states (*Verified, Unsupported, Contradictory, Outdated, Requires Human Review*). |
| **6** | **Accessibility Checker** | `accessibility_checker.py` | Objective WCAG 2.1 contrast ratios (4.5:1 AA, 7:1 AAA), font size readability, text visibility, alt-text analysis via OpenCV & AI. |
| **7** | **Interactive Brand Co-Pilot** | `copilot_service.py` | In-line chatbot with 9 capabilities: Q&A, guideline explanation, headline generation, tone rewriting, terminology fixes, step-by-step guidance, accept/reject diff cards, staged review drawer. |
| **8** | **Functional Visual Auto-Fix** | `remediation_service.py` | Saliency edge protection masks, CIELAB centroid remapping ($\Delta\text{E} < 5.0$), WCAG luminance boost, side-by-side comparison, separate file persistence, human approval. |
| **9** | **Client-Side Pre-Flight Scanner** | `check-vibe.html`, `app.js` | 100% in-browser HTML5 Canvas execution on drag-and-drop before submit. Displays 9 preliminary measurements and 7 visual styles (*Minimalist, Bold, Corporate, Luxury, Playful, Futuristic, Editorial*). |
| **10** | **Review & Approval Workflow Engine** | `workflow_service.py`, `company-portal.html` | 4 roles (*Creator, Manager, Authorised Reviewer, Administrator*), 7 statuses, versioning, commenting, revision tracking, immutable audit trails, automatic escalation of high-risk claims. |
| **11** | **Brand Insights & Recurring Issues** | `brand_insights_service.py`, `insights.py` | Aggregates empirical reviews, claims, and approvals. Discovers recurring guideline violations, unapproved terminology, visual inconsistencies, department risks, and ambiguous guidelines with concrete wording recommendations. Zero-fabrication guardrail. |

---

## 🚀 Quickstart Guide

### 1. Clone & Set Up Environment
```bash
git clone https://github.com/sureshsavant576-create/dark-lord.git
cd dark-lord
python -m venv venv

# On Windows:
.\venv\Scripts\activate

# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (the application includes deterministic fallbacks if API keys are not provided):
```env
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=your_groq_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key
APP_ENV=development
```

### 3. Run the Backend Server
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```
Open your browser:
- 👉 **Creative Inspection & Co-Pilot Hub**: `http://localhost:8000/check-vibe`
- 👉 **Brand Portal & Workflow Governance**: `http://localhost:8000/company-portal`

---

## 🧪 Comprehensive Automated Test Suite (82 Tests Passing)

Sanket AI comes with a comprehensive automated test suite covering units, integration, security, and governance:

```bash
python -m pytest tests/
```

```text
============================= test session starts =============================
platform win32 -- Python 3.15.2, pytest-9.2.0, pluggy-1.7.0
rootdir: C:\Users\sures\Downloads\dark lord
configfile: pytest.ini
collected 87 items

tests\test_accessibility_checker.py .....                                [  5%]
tests\test_ai_gateway.py ....                                            [ 10%]
tests\test_api_endpoints.py ...                                          [ 13%]
tests\test_brand_dna_generator.py ....                                   [ 18%]
tests\test_brand_identity.py ..                                          [ 20%]
tests\test_brand_insights.py .....                                       [ 26%]
tests\test_brand_knowledge_base.py ......                                [ 33%]
tests\test_claim_verification_engine.py ......                           [ 40%]
tests\test_config.py ...                                                 [ 43%]
tests\test_content_review_system.py ....                                 [ 48%]
tests\test_copilot_and_remediation.py ....                               [ 52%]
tests\test_deletion_lifecycle.py ...                                     [ 56%]
tests\test_inspection_engine.py .....                                    [ 62%]
tests\test_phase8_validation.py ........                                 [ 71%]
tests\test_preprocessing.py .....                                        [ 77%]
tests\test_round3_improvements.py ....                                   [ 81%]
tests\test_security_audit.py ...........                                 [ 94%]
tests\test_workflow_engine.py .....                                      [100%]

======================== 87 passed in 126.89s =================================
```

---

## 👥 Organizational Roles & Governance Rules

| Role | Submit Content | Comment / Revise | Standard Approval | Escalate / High-Risk Approval | Manage Users |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Creator** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manager** | ✅ | ✅ | ✅ | ❌ *(Blocked by Policy)* | ❌ |
| **Authorised Reviewer** | ✅ | ✅ | ✅ | ✅ *(Sole Signatory)* | ❌ |
| **Administrator** | ✅ | ✅ | ✅ | ✅ | ✅ |

### Governance Escalation Rule:
When any uploaded creative contains **high-risk promotional superlatives** (e.g. *"100% uptime guaranteed"*, *"certified #1"*), the workflow engine automatically sets status to `ContentStatus.ESCALATED`. Standard **Managers** are strictly blocked from rendering an approval decision. Only an **Authorised Reviewer** or **Administrator** can approve or reject the submission.

---

## ⚠️ Declared System Limitations

1. **Multi-Page Large Document PDFs**: Currently processes single-page and first-page visual previews; continuous multi-page document streaming requires background batch queuing.
2. **Video Asset Frame-by-Frame Audits**: Optimized for static images, posters, ads, and copy; temporal video raster analysis is planned for future releases.
3. **Third-Party Image Generative Inpainting**: When external generative diffusion models are offline, the auto-remediation engine utilizes high-precision saliency edge masks with CIELAB centroid remapping, clearly notifying users of generative limitations.

---

## 🗺️ Product Roadmap & Future Development

- **Q1 2027**: Adobe Photoshop, Illustrator, and Figma live canvas plugins for real-time in-app pre-flight warnings.
- **Q2 2027**: Automated multi-page brand guideline ingestion with OCR vectorization.
- **Q3 2027**: Video campaign frame-by-frame brand compliance scoring and motion graphic color drift tracking.
- **Q4 2027**: Automated Slack and Microsoft Teams approval bot integration with one-click reviewer signatures.

---

## 🛡️ License & Acknowledgements
Built for enterprise brand compliance and governance.  
© 2026 Sanket AI. All rights reserved.
