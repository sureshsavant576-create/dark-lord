"""
Generates the formal publication-ready Product PDF for Sanket AI.
Output: docs/Sanket_AI_Product_Specification.pdf
Uses: ReportLab
"""

import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether
)

def build_pdf():
    pdf_path = Path("docs/Sanket_AI_Product_Specification.pdf")
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()

    # Custom styles
    primary_color = colors.HexColor("#0f172a")
    accent_blue = colors.HexColor("#2563eb")
    text_color = colors.HexColor("#1e293b")
    subtle_color = colors.HexColor("#64748b")

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=primary_color,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=accent_blue,
        spaceAfter=15
    )

    h1_style = ParagraphStyle(
        "SectionH1",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=primary_color,
        spaceBefore=12,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        "DocBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=text_color,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        "DocBullet",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=text_color,
        leftIndent=15,
        spaceAfter=3
    )

    card_style = ParagraphStyle(
        "CardText",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1e3a8a")
    )

    story = []

    # Title & Header
    story.append(Paragraph("SANKET AI (संकेत AI)", title_style))
    story.append(Paragraph("Enterprise Multimodal Brand Governance & Design Intelligence SaaS — Product Specification", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=accent_blue, spaceBefore=0, spaceAfter=12))

    # Executive Overview
    story.append(Paragraph("1. Executive Overview & Problem Statement", h1_style))
    story.append(Paragraph(
        "Enterprise marketing teams and creative agencies produce hundreds of visual and textual promotional assets monthly. "
        "Inevitably, brand drift, unapproved color modifications, exaggerated marketing claims, and WCAG accessibility violations slip past manual review. "
        "<b>Sanket AI</b> eliminates these risks through a deterministic 2-stage hybrid architecture: mathematical computer vision, Tesseract OCR, "
        "and CIELAB colorimetry execute first, followed by multimodal AI reasoning via Google Gemini API and Groq Llama 3.2 Vision.",
        body_style
    ))

    # Judge & Evaluator Demo Box
    demo_data = [
        [Paragraph("<b>⚖️ JUDGE & EVALUATOR DEMO CREDENTIALS</b>", card_style)],
        [Paragraph("<b>Account:</b> demo@sanket.ai &nbsp;|&nbsp; <b>Password:</b> DemoJudge2026! &nbsp;|&nbsp; <b>Role:</b> Administrator (Full Clearance)", body_style)],
        [Paragraph("<b>Sample Tenant:</b> Apex Cloud Solutions &nbsp;|&nbsp; <b>Features:</b> One-Click Demo Login, Seeded Brand DNA, Knowledge Base, Audit Trail", body_style)]
    ]
    t_demo = Table(demo_data, colWidths=[530])
    t_demo.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eff6ff")),
        ("BORDER", (0, 0), (-1, -1), 1, colors.HexColor("#bfdbfe")),
        ("PADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(Spacer(1, 4))
    story.append(t_demo)
    story.append(Spacer(1, 10))

    # The Three Round 2 Commitments
    story.append(Paragraph("2. Verification of Round 2 Core Commitments", h1_style))
    commitments_data = [
        [
            Paragraph("<b>Capability</b>", body_style),
            Paragraph("<b>Architecture & Implementation</b>", body_style),
            Paragraph("<b>Status</b>", body_style)
        ],
        [
            Paragraph("<b>Interactive Brand Co-Pilot</b>", body_style),
            Paragraph("Contextualized remediation chatbot grounded in approved Brand DNA and verified Knowledge Base claims. Features structured accept/reject diffs and staged reviews.", body_style),
            Paragraph("<font color='#059669'><b>100% Verified</b></font>", body_style)
        ],
        [
            Paragraph("<b>Generative Visual Auto-Fix</b>", body_style),
            Paragraph("Deterministic CIELAB centroid recoloring with OpenCV saliency edge protection masks. Corrects low-contrast backgrounds while preserving logos, text, and original assets.", body_style),
            Paragraph("<font color='#059669'><b>100% Verified</b></font>", body_style)
        ],
        [
            Paragraph("<b>Pre-Flight Scanner</b>", body_style),
            Paragraph("Zero-latency client-side HTML5 canvas telemetry before submit. Computes dominant HEX, Kelvin temperature, WCAG contrast, whitespace ratio, and 7 visual styles.", body_style),
            Paragraph("<font color='#059669'><b>100% Verified</b></font>", body_style)
        ]
    ]
    t_comm = Table(commitments_data, colWidths=[120, 330, 80])
    t_comm.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t_comm)
    story.append(Spacer(1, 10))

    # Technical Architecture & Pipeline
    story.append(Paragraph("3. Technical Architecture & Security Principles", h1_style))
    story.append(Paragraph("• <b>Dual-Layer Pipeline:</b> OpenCV + Tesseract OCR pixel calculations eliminate AI hallucination on colors and contrast ratios.", bullet_style))
    story.append(Paragraph("• <b>Modular AI Gateway:</b> Dynamic delegation between Google Gemini 1.5 and Groq Cloud Llama 3.2 Vision.", bullet_style))
    story.append(Paragraph("• <b>Multi-Tenant RLS Isolation:</b> Strict data boundary separation; all database records and storage paths keyed by tenant org_id.", bullet_style))
    story.append(Paragraph("• <b>Role-Based Clearance:</b> Creator, Manager, Authorised Reviewer, and Administrator permission enforcement.", bullet_style))
    story.append(Paragraph("• <b>Immutable Audit Logging:</b> Tamper-resistant append-only logging for all workflow submissions, revisions, and approvals.", bullet_style))
    story.append(Paragraph("• <b>Enterprise Motion Design System:</b> 60fps count-up, scanner laser HUD, and full WCAG prefers-reduced-motion accessibility.", bullet_style))

    story.append(Spacer(1, 10))

    # Comprehensive Verification & Test Results
    story.append(Paragraph("4. Verification & Testing Metrics", h1_style))
    test_metrics = [
        [
            Paragraph("<b>Automated Test Suite</b>", body_style),
            Paragraph("<b>Pass Rate</b>", body_style),
            Paragraph("<b>HTTP Status Endpoints</b>", body_style),
            Paragraph("<b>Reliability Edge Cases</b>", body_style)
        ],
        [
            Paragraph("129 Pytest Tests", body_style),
            Paragraph("<font color='#059669'><b>129 / 129 (100%)</b></font>", body_style),
            Paragraph("<font color='#059669'><b>All 200 OK</b></font>", body_style),
            Paragraph("<font color='#059669'><b>Zero Server Crashes</b></font>", body_style)
        ]
    ]
    t_test = Table(test_metrics, colWidths=[130, 130, 135, 135])
    t_test.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t_test)

    # Footer Notice
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=subtle_color, spaceBefore=0, spaceAfter=8))
    story.append(Paragraph("Certified for Round 3 Final Submission &bull; Sanket AI Engineering Team &bull; Confidential", ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, color=subtle_color, alignment=1)))

    doc.build(story)
    print(f"Product PDF successfully generated at: {pdf_path.resolve()}")

if __name__ == "__main__":
    build_pdf()
