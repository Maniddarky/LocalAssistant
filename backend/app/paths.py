from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PDFS = DATA / "pdfs"
CHROMA = DATA / "chroma"
MODELS = DATA / "models"
PIPER_DIR = MODELS / "piper"
LIBRARY_FILE = DATA / "library.json"


def ensure_dirs() -> None:
    PDFS.mkdir(parents=True, exist_ok=True)
    CHROMA.mkdir(parents=True, exist_ok=True)
    PIPER_DIR.mkdir(parents=True, exist_ok=True)
