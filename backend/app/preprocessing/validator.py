from __future__ import annotations
import hashlib
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from fastapi import HTTPException
from pydantic import BaseModel, Field

SUPPORTED_IMAGE_TYPES: Dict[str, Set[str]] = {
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/webp": {".webp"},
    "image/svg+xml": {".svg"}
}

SUPPORTED_DOCUMENT_TYPES: Dict[str, Set[str]] = {
    "application/pdf": {".pdf"},
    "text/plain": {".txt"},
    "text/markdown": {".md"}
}

SUPPORTED_AUDIO_TYPES: Dict[str, Set[str]] = {
    "audio/wav": {".wav"},
    "audio/x-wav": {".wav"},
    "audio/mpeg": {".mp3"},
    "audio/ogg": {".ogg"}
}

MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024

class ValidationResult(BaseModel):
    is_valid: bool
    mime_type: str
    media_category: str
    file_size_bytes: int
    sha256_hash: str
    normalized_filename: str
    errors: List[str] = Field(default_factory=list)

def sanitize_filename(filename: str) -> str:
    norm = filename.replace("\\", "/").rstrip("/").split("/")[-1]
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", norm)
    clean = clean.strip("._")
    return clean or "unnamed_asset"

def inspect_file_content_safety(file_path: Path, suffix: str) -> Tuple[bool, Optional[str]]:
    try:
        with open(file_path, "rb") as f:
            header = f.read(4096)
    except Exception as exc:
        return False, f"Could not read file header: {str(exc)}"

    if not header:
        return False, "File is empty (0 bytes)."

    if header.startswith(b"MZ"):
        return False, "Executable file detected (Windows PE binary). Upload blocked for security."
    if header.startswith(b"\x7fELF"):
        return False, "Executable file detected (Linux ELF binary). Upload blocked for security."
    if header.startswith((b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe")):
        return False, "Executable file detected (Mach-O binary). Upload blocked for security."
    if header.startswith(b"#!"):
        return False, "Script execution shebang detected. Script uploads are forbidden."

    if suffix in (".png", ".jpg", ".jpeg", ".webp"):
        if suffix == ".png" and not header.startswith(b"\x89PNG\r\n\x1a\n"):
            return False, "File header does not match authentic PNG magic bytes."
        elif suffix in (".jpg", ".jpeg") and not header.startswith(b"\xff\xd8\xff"):
            return False, "File header does not match authentic JPEG magic bytes."
        elif suffix == ".webp" and not (header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"WEBP"):
            return False, "File header does not match authentic WEBP magic bytes."
        try:
            from PIL import Image
            with Image.open(file_path) as img:
                w, h = img.size
                if w * h > 25_000_000:
                    return False, f"Image dimensions ({w}x{h} = {w*h} pixels) exceed safe processing threshold of 25 Megapixels (Decompression Bomb protection)."
        except Exception as exc:
            return False, f"Invalid or unreadable image stream: {str(exc)}"
    elif suffix == ".pdf":
        if not header.startswith(b"%PDF-"):
            return False, "File header does not match authentic PDF magic bytes."
        try:
            import pymupdf
            with pymupdf.open(str(file_path)) as doc:
                if len(doc) > 100:
                    return False, f"PDF page count ({len(doc)}) exceeds safe maximum limit of 100 pages."
        except Exception as exc:
            return False, f"Malformed or unreadable PDF: {str(exc)}"
    elif suffix == ".svg":
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore").lower()
        except Exception:
            return False, "SVG file cannot be decoded as valid UTF-8 text."
        if "<svg" not in content:
            return False, "SVG file does not contain a valid <svg> root element."
        dangerous_patterns = [
            r"<script",
            r"javascript:",
            r"on\w+\s*=",
            r"<!entity",
            r"<!doctype.*system",
            r"<foreignobject",
            r"<iframe",
            r"<embed",
            r"<object",
        ]
        for pattern in dangerous_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return False, f"SVG file contains prohibited active script or XML entity construct ({pattern})."
    elif suffix in (".txt", ".md"):
        if b"\x00" in header:
            return False, "Binary null bytes detected in text document."

    return True, None

def save_upload_safely(
    upload_file: Any,
    destination_dir: Path,
    prefix: str = "",
    max_size_bytes: int = MAX_FILE_SIZE_BYTES
) -> Path:
    destination_dir.mkdir(parents=True, exist_ok=True)
    raw_name = getattr(upload_file, "filename", None) or "upload.bin"
    clean_name = sanitize_filename(raw_name)
    unique_id = uuid.uuid4().hex[:8]
    dest_filename = f"{prefix}_{unique_id}_{clean_name}" if prefix else f"{unique_id}_{clean_name}"
    dest_path = destination_dir / dest_filename

    total_bytes = 0
    chunk_size = 64 * 1024

    if hasattr(upload_file, "size") and upload_file.size and upload_file.size > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum allowed size of {max_size_bytes // (1024 * 1024)}MB."
        )

    with open(dest_path, "wb") as buffer:
        while True:
            chunk = upload_file.file.read(chunk_size)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > max_size_bytes:
                buffer.close()
                if dest_path.exists():
                    dest_path.unlink()
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds maximum allowed size of {max_size_bytes // (1024 * 1024)}MB."
                )
            buffer.write(chunk)

    suffix = dest_path.suffix.lower()
    is_safe, error_msg = inspect_file_content_safety(dest_path, suffix)
    if not is_safe:
        if dest_path.exists():
            dest_path.unlink()
        raise HTTPException(
            status_code=400,
            detail=f"Security verification failed: {error_msg}"
        )

    return dest_path

def calculate_sha256(file_path: Path) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def validate_file(file_path: Path, declared_mime_type: Optional[str] = None) -> ValidationResult:
    errors: List[str] = []

    if not file_path.exists():
        return ValidationResult(
            is_valid=False,
            mime_type="unknown",
            media_category="unsupported",
            file_size_bytes=0,
            sha256_hash="",
            normalized_filename=sanitize_filename(file_path.name),
            errors=["File does not exist on disk."]
        )

    file_size = file_path.stat().st_size
    if file_size == 0:
        errors.append("File is empty (0 bytes).")
    elif file_size > MAX_FILE_SIZE_BYTES:
        errors.append(f"File size ({file_size / (1024*1024):.1f}MB) exceeds maximum limit (30MB).")

    suffix = file_path.suffix.lower()
    sha256 = calculate_sha256(file_path)
    clean_name = sanitize_filename(file_path.name)

    is_safe, error_msg = inspect_file_content_safety(file_path, suffix)
    if not is_safe:
        errors.append(f"Content security violation: {error_msg}")

    media_category = "unsupported"
    canonical_mime = declared_mime_type or "application/octet-stream"

    for mime, exts in SUPPORTED_IMAGE_TYPES.items():
        if suffix in exts:
            media_category = "image"
            canonical_mime = mime
            break

    if media_category == "unsupported":
        for mime, exts in SUPPORTED_DOCUMENT_TYPES.items():
            if suffix in exts:
                media_category = "document"
                canonical_mime = mime
                break

    if media_category == "unsupported":
        for mime, exts in SUPPORTED_AUDIO_TYPES.items():
            if suffix in exts:
                media_category = "audio"
                canonical_mime = mime
                break

    if media_category == "unsupported":
        errors.append(f"Unsupported creative format '{suffix}'. Supported formats: PNG, JPG, JPEG, WEBP, PDF, TXT, MD.")

    return ValidationResult(
        is_valid=len(errors) == 0,
        mime_type=canonical_mime,
        media_category=media_category,
        file_size_bytes=file_size,
        sha256_hash=sha256,
        normalized_filename=clean_name,
        errors=errors
    )
