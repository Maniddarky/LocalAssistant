"""Optional local speech. Browser speech is the fallback when these are absent."""

from __future__ import annotations

import shutil
import tempfile
import wave
from pathlib import Path

from app.paths import MODELS, PIPER_DIR

_whisper = None
_piper = None


def stt_backend() -> str:
    if shutil.which("ffmpeg") is None and not _module_available("faster_whisper"):
        return "browser"
    if _module_available("faster_whisper"):
        return "faster-whisper"
    return "browser"


def tts_backend() -> str:
    if _piper_model() and _module_available("piper"):
        return "piper"
    return "browser"


def _module_available(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def _piper_model() -> Path | None:
    if not PIPER_DIR.exists():
        return None
    models = sorted(PIPER_DIR.glob("*.onnx"))
    return models[0] if models else None


def transcribe(blob: bytes, suffix: str) -> str:
    global _whisper
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Faster-Whisper is not installed.") from exc

    if _whisper is None:
        _whisper = WhisperModel(
            "tiny",
            device="cpu",
            compute_type="int8",
            download_root=str(MODELS / "whisper"),
        )
    with tempfile.NamedTemporaryFile(suffix=suffix or ".webm", delete=False) as handle:
        handle.write(blob)
        path = handle.name
    try:
        segments, _info = _whisper.transcribe(path, vad_filter=True)
        text = " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        Path(path).unlink(missing_ok=True)
    if not text:
        raise RuntimeError("No speech was recognized.")
    return text


def synthesize(text: str) -> bytes:
    global _piper
    model = _piper_model()
    if model is None:
        raise RuntimeError("No Piper voice is installed.")
    try:
        from piper import PiperVoice
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Piper is not installed.") from exc
    if _piper is None:
        _piper = PiperVoice.load(str(model))

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        wav_path = handle.name
    try:
        with wave.open(wav_path, "wb") as wav_file:
            _piper.synthesize_wav(text, wav_file)
        return Path(wav_path).read_bytes()
    finally:
        Path(wav_path).unlink(missing_ok=True)
