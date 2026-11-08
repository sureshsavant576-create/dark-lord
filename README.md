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

## ✨ Key Features

- **Multi-Company Brand Management:** Register distinct brand profiles with custom mood definitions, mission statements, approved HEX color palettes, and prohibited terminology lists.
- **Auto-Extract Brand Guidelines:** Simply drop in an existing reference graphic or logo. The engine automatically detects dominant colors, visual density, and brand attributes to pre-populate guidelines.
- **Interactive Colour Intelligence Studio:** Built-in HTML5 Canvas eyedropper with a pixel loupe and magnifier. Hover over any pixel to inspect real-time HEX/RGB values and add them to approved palettes.
- **Multimodal AI Vibe Scoring:** Scored from 0 to 100%, breaking down exact reasons why a creative passed or failed compliance.
- **Actionable Remediation Reports:** Instead of vague errors, creators get specific, line-by-line feedback on what to adjust (e.g. *"Change background #2E1065 to approved brand primary #0F172A to bring ΔE within compliance"*).
- **Audit Lifecycle & Admin Purge:** Full historical audit logs with cascade-delete safeguards for compliance data retention.
- **Responsive Dual-Sidebar UI:** Built with modern CSS and vanilla ES6+ JavaScript—fast, lightweight, and responsive without bloated frontend frameworks.

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
| **Automated Testing** | pytest, pytest-asyncio (43 tests) | 100% test coverage across units, integration, and security |

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

Sanket AI comes with a rigorous test suite of **43 automated unit, integration, and security tests**:

```bash
python -m pytest
```

Output:
```text
============================= test session starts =============================
collected 43 items

tests/test_ai_gateway.py ....                                            [  9%]
tests/test_api_endpoints.py ...                                          [ 16%]
tests/test_brand_identity.py ..                                          [ 20%]
tests/test_config.py ...                                                 [ 27%]
tests/test_deletion_lifecycle.py ...                                     [ 34%]
tests/test_inspection_engine.py ....                                     [ 44%]
tests/test_phase8_validation.py ........                                 [ 62%]
tests/test_preprocessing.py .....                                        [ 74%]
tests/test_security_audit.py ...........                                 [100%]

============================== 43 passed in 1.45s ==============================
```

---

## 🛡️ License & Acknowledgements
Built with dedication for Round 2 — The Build.  
© 2026 Sanket AI. All rights reserved.
