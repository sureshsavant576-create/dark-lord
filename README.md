# Sanket AI (संकेत AI)

> **Enterprise Brand Governance & Multimodal Design Intelligence SaaS**  
> *Because catching an off-brand creative before publication is 100x easier than doing damage control afterwards.*

---

## 💡 Why We Built Sanket AI

Marketing teams, agencies, and developers move at lightning speed. Every week, dozens of promotional banners, social graphics, and ad campaigns are created across different teams. 

Inevitably, things slip through the cracks:
- An accent color that doesn't match the brand palette.
- Copy containing banned words or unverified legal claims.
- Cluttered, loud layouts that clash with a minimalist brand identity.
- A visual "vibe" that just feels completely off.

Most teams either rely on slow, manual reviews or blindly ask a Large Language Model (LLM) to review their designs. But LLMs frequently hallucinate exact HEX color codes, struggle with spatial layout math, and miss prohibited phrases buried in creative copy.

**Sanket AI (संकेत AI)** solves this with a **two-stage hybrid architecture**: deterministic computer vision math and regex filters do the heavy lifting first, followed by multimodal AI for aesthetic reasoning.

---

## ⚡ How It Works (The 2-Stage Pipeline)

```text
  [ Developer Creative (Image + Copy) ]
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 1: Deterministic Mathematical Verification      │
│  • CIELAB ΔE Perceptual Color Matching (< 15.0 delta)   │
│  • Laplacian Clutter & Whitespace Density Ratio Math   │
│  • Zero-Hallucination Regex Lexical Scanner            │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 2: Multimodal AI Semantic Reasoning             │
│  • Google Gemini Vision (Gemini 2.5 Flash / Flash-Lite)│
│  • Evaluates Mood, Visual Aesthetics & Creative Tone   │
│  • Automated Structured JSON Schema Output             │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
  [ Instant Compliance Verdict & Actionable Fix Report ]
    (APPROVED / CHANGES_REQUESTED / REJECTED)
```

1. **Stage 1 — Objective Math & Rules (Zero Guesswork):**
   Before touching any AI, the system runs deterministic algorithms. It extracts dominant colors using Pillow and ColorThief, converts them to the CIELAB perceptual color space, and measures Delta-E (ΔE) mathematical distance against approved brand palettes. It measures negative space and visual clutter with Laplacian gradient calculations, and catches banned terms using regex pattern boundaries.
   
2. **Stage 2 — Subjective Aesthetic Reasoning (Google Gemini Vision):**
   Once the hard numbers are validated, the asset is passed to Google Gemini 2.5 Flash / Flash-Lite Vision with a structured JSON schema. The model evaluates what math cannot: creative vibe, humor vs. seriousness, typography harmony, and emotional alignment.

---

## ✨ Key Features (Including Round 3 Major Capabilities)

- **Interactive Brand Co-Pilot (Round 3 Improvement 1):** In-line conversational AI brand guardian embedded right next to audit reports. Chats in the brand's authentic voice, provides 3 one-click compliant copy rewrites, and gives step-by-step guidance to get certified.
- **1-Click Generative Auto-Remediation (Round 3 Improvement 2):** Move from detecting errors to fixing them. Automatically shifts off-brand colors to approved brand palette centroids (ΔE < 5.0) and generates a certified download-ready graphic with a before/after split comparison.
- **Instant Drag-and-Drop Pre-Flight Scanner (Round 3 Improvement 3):** Runs in < 35ms the moment an image is dropped into the browser—before clicking submit. Calculates Kelvin Color Temperature, Negative Space density ratio, and predicted visual vibe.
- **Evaluator & Judge 1-Click Test Presets:** Zero-setup test buttons for judges (Nike Certified Compliant, Off-Brand Auto-Fix Demo, and GRB Heritage Traditional).
- **Multi-Company Brand Management:** Register distinct brand profiles with custom mood definitions, mission statements, approved HEX color palettes, and prohibited terminology lists.
- **Auto-Extract Brand Guidelines:** Drop in an existing reference graphic or logo to automatically detect dominant centroids, whitespace density, and brand attributes.
- **Interactive Colour Intelligence Studio:** Built-in HTML5 Canvas eyedropper with magnifying pixel loupe for precision color selection.
- **Dual-Engine Inspection (Deterministic CIELAB ΔE + Multimodal Gemini 2.5 Flash):** Zero-hallucination mathematical verification combined with contextual aesthetic reasoning.
- **Audit Lifecycle & Admin Purge:** Full historical audit logs with cascade-delete safeguards for compliance data retention.

---

## 🛠️ Technology Stack

| Layer | Technologies Used | What It Does |
| :--- | :--- | :--- |
| **Backend Framework** | Python 3, FastAPI, Uvicorn | High-throughput asynchronous REST API server |
| **Deterministic Vision** | Pillow (PIL), ColorThief | Dominant centroid extraction, thumbnail generation |
| **Color Science Math** | CIELAB (CIE76 / CIE2000), Delta-E (ΔE) | Perceptual color difference scoring (< 15.0 threshold) |
| **Spatial Analysis** | Laplacian Gradient Energy, NumPy | Whitespace density ratio & layout clutter indexing |
| **Lexical Engine** | Python Regex (`re`) | Boundary token matching for prohibited claims and words |
| **Multimodal AI** | Google Gemini Vision (2.5 Flash / Flash-Lite) | Aesthetic reasoning, mood evaluation, and tone scoring |
| **Frontend** | Vanilla ES6+ JavaScript, HTML5 Canvas, Modern CSS | Pixel loupe, eyedropper, responsive dual-sidebar dashboard |
| **Automated Testing** | pytest, pytest-asyncio (48 tests) | 100% test coverage across units, integration, and security |

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
Copy `.env.example` to `.env` and configure your API key:
```env
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
APP_ENV=development
```

### 3. Run the Application
```bash
uvicorn backend.app.main:app --reload --port 8000
```
Open your browser and navigate to:  
👉 **`http://localhost:8000`**

---

## 🧪 Testing & Verification

Sanket AI comes with a rigorous automated test suite of **48 unit, integration, security, and Round 3 improvement tests**:

```bash
python -m pytest
```

Output:
```text
============================= test session starts =============================
collected 48 items

tests/test_ai_gateway.py ....                                            [  8%]
tests/test_api_endpoints.py ...                                          [ 14%]
tests/test_brand_identity.py ..                                          [ 18%]
tests/test_config.py ...                                                 [ 25%]
tests/test_deletion_lifecycle.py ...                                     [ 31%]
tests/test_inspection_engine.py .....                                    [ 41%]
tests/test_phase8_validation.py ........                                 [ 58%]
tests/test_preprocessing.py .....                                        [ 68%]
tests/test_round3_improvements.py ....                                   [ 77%]
tests/test_security_audit.py ...........                                 [100%]

============================== 48 passed in 1.55s ==============================
```

---

## 🛡️ License & Acknowledgements
Built with dedication for Round 3 — The Final Round (100% Shipped & Certified).  
© 2026 Sanket AI. All rights reserved.
