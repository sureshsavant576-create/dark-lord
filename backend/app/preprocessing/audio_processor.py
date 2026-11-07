"""BrandShield AI - Audio Feature & Metadata Extractor.

Inspects audio advertisements and brand jingles using Mutagen to extract
technical audio properties, duration, sample rate, and format characteristics.
"""
from pathlib import Path
from typing import Optional
import mutagen
from pydantic import BaseModel, Field


class AudioMetadataResult(BaseModel):
    duration_seconds: float
    channels: int
    sample_rate_hz: int
    bitrate_kbps: int
    codec: str
    is_jingle_length: bool = Field(description="True if duration is between 2s and 60s, typical of brand jingles/audio ads")
    is_valid_audio: bool = True
    error_message: Optional[str] = None


def process_audio_metadata(audio_path: Path) -> AudioMetadataResult:
    """Extract technical and acoustic container properties from an audio file."""
    try:
        audio = mutagen.File(str(audio_path))
        if audio is None or audio.info is None:
            return AudioMetadataResult(
                duration_seconds=0.0,
                channels=0,
                sample_rate_hz=0,
                bitrate_kbps=0,
                codec=audio_path.suffix.lstrip("."),
                is_jingle_length=False,
                is_valid_audio=False,
                error_message="Could not decode audio header."
            )

        info = audio.info
        duration = round(float(getattr(info, "length", 0.0)), 2)
        channels = int(getattr(info, "channels", 2))
        sample_rate = int(getattr(info, "sample_rate", 44100))
        bitrate = int(getattr(info, "bitrate", 0) / 1000) if getattr(info, "bitrate", 0) else 192

        # Brand jingles are typically 3 to 60 seconds
        is_jingle = 2.0 <= duration <= 60.0

        return AudioMetadataResult(
            duration_seconds=duration,
            channels=channels,
            sample_rate_hz=sample_rate,
            bitrate_kbps=bitrate,
            codec=type(info).__name__,
            is_jingle_length=is_jingle,
            is_valid_audio=True
        )

    except Exception as exc:
        return AudioMetadataResult(
            duration_seconds=0.0,
            channels=0,
            sample_rate_hz=0,
            bitrate_kbps=0,
            codec="unknown",
            is_jingle_length=False,
            is_valid_audio=False,
            error_message=str(exc)
        )
