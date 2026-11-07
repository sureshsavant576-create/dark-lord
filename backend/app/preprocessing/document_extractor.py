"""BrandShield AI - Document Text & Terminology Extractor.

Extracts text from PDF brand guidelines and promotional copy using PyMuPDF,
and provides deterministic disallowed terminology checking.
"""
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple
import pymupdf
from pydantic import BaseModel, Field


class TerminologyMatch(BaseModel):
    forbidden_term: str
    occurrences: int
    context_snippets: List[str] = Field(default_factory=list)


class DocumentExtractionResult(BaseModel):
    full_text: str
    page_count: int
    word_count: int
    character_count: int
    title: str = ""
    author: str = ""
    snippets: List[str] = Field(default_factory=list)
    forbidden_terms_found: List[TerminologyMatch] = Field(default_factory=list)


def extract_text_from_pdf(pdf_path: Path) -> DocumentExtractionResult:
    """Extract clean text, metadata, and structural metrics from a PDF document using PyMuPDF."""
    doc = pymupdf.open(str(pdf_path))
    pages_text: List[str] = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        text = page.get_text("text")
        if text.strip():
            pages_text.append(text.strip())

    meta = doc.metadata or {}
    full_text = "\n\n".join(pages_text)
    words = full_text.split()

    # Create top paragraph snippets for fast overview
    snippets = [p.strip() for p in full_text.split("\n\n") if len(p.strip()) > 30][:10]

    return DocumentExtractionResult(
        full_text=full_text,
        page_count=len(doc),
        word_count=len(words),
        character_count=len(full_text),
        title=meta.get("title", "") or "",
        author=meta.get("author", "") or "",
        snippets=snippets
    )


def extract_text_from_plain_file(file_path: Path) -> DocumentExtractionResult:
    """Extract text from plain text or Markdown files."""
    content = file_path.read_text(encoding="utf-8", errors="replace")
    words = content.split()
    snippets = [p.strip() for p in content.split("\n\n") if len(p.strip()) > 20][:10]

    return DocumentExtractionResult(
        full_text=content,
        page_count=1,
        word_count=len(words),
        character_count=len(content),
        title=file_path.stem,
        author="",
        snippets=snippets
    )


def check_forbidden_terms(text: str, disallowed_terms: List[str]) -> List[TerminologyMatch]:
    """Deterministically scan text for disallowed terminology or off-brand phrases (case-insensitive)."""
    matches: List[TerminologyMatch] = []
    if not text or not disallowed_terms:
        return matches

    for term in disallowed_terms:
        cleaned_term = term.strip()
        if not cleaned_term:
            continue

        # Word-boundary regex check
        pattern = re.compile(rf"\b{re.escape(cleaned_term)}\b", re.IGNORECASE)
        found_matches = list(pattern.finditer(text))

        if found_matches:
            snippets = []
            for match in found_matches[:3]:  # Capture context of up to 3 occurrences
                start = max(0, match.start() - 40)
                end = min(len(text), match.end() + 40)
                snippet = "..." + text[start:end].replace("\n", " ").strip() + "..."
                snippets.append(snippet)

            matches.append(TerminologyMatch(
                forbidden_term=cleaned_term,
                occurrences=len(found_matches),
                context_snippets=snippets
            ))

    return matches
