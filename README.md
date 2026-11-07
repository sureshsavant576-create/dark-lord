# BrandShield

BrandShield verifies whether developer-submitted marketing content (posters, banners, ad copy, slogans) matches a company's approved brand vibes and guidelines before publication.

## What It Does

1. **Company Brand & Vibe Setup**:
   - A company creates an account and defines its approved brand identity: personality, mood, communication tone, visual style, approved HEX color palette, mission statement, and words/claims developers must strictly avoid.
   - **Multi-Filter Auto-Extraction**: The company can drop an approved reference poster or graphic. The engine automatically runs multiple filters (color centroid quantization, whitespace ratio, visual clutter index, and aesthetic reasoning) to identify and auto-populate all vibe fields.
   - **Full Editing**: The company can edit, customize, or toggle any extracted colors and attributes before saving, as well as update existing company profiles at any time.

2. **Pre-Publication Developer Inspection**:
   - Developers submit their creative work (posters/graphic images or advertising copy) to inspect compliance against any registered company profile.
   - Runs instantly and produces a verification report.

3. **Multi-Stage Biometric-Style Filtration**:
   - **Color Harmony**: Evaluates dominant colors against approved palettes using CIELAB ΔE perceptual distance math.
   - **Layout & Negative Space**: Measures whitespace ratios and visual clutter (Laplacian gradient energy) to detect aesthetic departures.
   - **Terminology Scanner**: Deterministically detects prohibited words and claims with context snippet reporting.

4. **Lightweight Intelligence Synthesis**:
   - Synthesizes the extracted feature vectors into fast, explainable feedback on tone, mood, and brand alignment without sending heavy media payloads to cloud servers, preserving free-tier quotas and minimizing server load.

5. **Actionable Fixes & Report**:
   - Produces an explainable inspection report with an overall Vibe Match score (0–100%), biometric breakdown metrics, detected discrepancies, and actionable remediation tips for the developer.
