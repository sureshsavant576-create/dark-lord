import hashlib
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Set
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
    base = os.path.basename(filename)
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", base)
    return clean or "unnamed_asset"

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
