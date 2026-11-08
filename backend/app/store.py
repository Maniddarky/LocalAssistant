"""PDF library and Chroma collection."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

import pymupdf

from app.chunking import chunk_page
from app.paths import CHROMA, LIBRARY_FILE, PDFS, ensure_dirs

_lock = threading.Lock()
_collection = None
_embedder_error: str | None = None
_indexing = False
_index_error: str | None = None


class IngestError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_catalog() -> list[dict[str, Any]]:
    if not LIBRARY_FILE.exists():
        return []
    data = json.loads(LIBRARY_FILE.read_text(encoding="utf-8"))
    return list(data.get("documents", []))


def _write_catalog(documents: list[dict[str, Any]]) -> None:
    ensure_dirs()
    LIBRARY_FILE.write_text(
        json.dumps({"documents": documents}, indent=2),
        encoding="utf-8",
    )


def collection():
    global _collection, _embedder_error
    if _collection is not None:
        return _collection
    try:
        import chromadb
        from chromadb.config import Settings
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

        ensure_dirs()
        embedder = ONNXMiniLM_L6_V2(preferred_providers=["CPUExecutionProvider"])
        client = chromadb.PersistentClient(
            path=str(CHROMA),
            settings=Settings(anonymized_telemetry=False),
        )
        _collection = client.get_or_create_collection(
            name="library",
            embedding_function=embedder,
            metadata={"hnsw:space": "cosine"},
        )
        _embedder_error = None
        return _collection
    except Exception as exc:  # noqa: BLE001 — surface any model/runtime failure
        _embedder_error = str(exc)
        raise


def embedder_state() -> str:
    if _embedder_error:
        return "error"
    if _collection is None:
        return "idle"
    return "ready"


def embedder_error() -> str | None:
    return _embedder_error


def indexing() -> bool:
    return _indexing


def index_error() -> str | None:
    return _index_error


def list_documents() -> list[dict[str, Any]]:
    with _lock:
        return _read_catalog()


def chunk_count() -> int:
    try:
        return int(collection().count())
    except Exception:  # noqa: BLE001
        return 0


def _page_texts(path) -> list[tuple[int, str]]:
    doc = pymupdf.open(path)
    try:
        pages: list[tuple[int, str]] = []
        for index, page in enumerate(doc, start=1):
            pages.append((index, page.get_text("text") or ""))
        return pages
    finally:
        doc.close()


def add_pdf(source, name: str, *, sample: bool = False) -> dict[str, Any]:
    safe_name = _safe_name(name)
    doc_id = str(uuid.uuid4())
    dest = PDFS / f"{doc_id}.pdf"
    ensure_dirs()
    if hasattr(source, "read"):
        dest.write_bytes(source.read())
    else:
        dest.write_bytes(source)

    try:
        pages = _page_texts(dest)
    except Exception as exc:  # noqa: BLE001
        dest.unlink(missing_ok=True)
        raise IngestError(f"Could not read that PDF ({exc}).") from exc

    text_pages = [(number, text) for number, text in pages if text.strip()]
    if not text_pages:
        dest.unlink(missing_ok=True)
        raise IngestError(
            "No text layer was found. Scanned pages need a text layer before they can be searched."
        )

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, Any]] = []
    for number, text in text_pages:
        for offset, piece in enumerate(chunk_page(text)):
            ids.append(f"{doc_id}:{number}:{offset}")
            documents.append(piece)
            metadatas.append(
                {
                    "document_id": doc_id,
                    "document": safe_name,
                    "page": number,
                }
            )

    try:
        collection().add(ids=ids, documents=documents, metadatas=metadatas)
    except Exception as exc:  # noqa: BLE001
        dest.unlink(missing_ok=True)
        raise IngestError(f"Could not index that PDF ({exc}).") from exc

    record = {
        "id": doc_id,
        "name": safe_name,
        "pages": len(pages),
        "chunks": len(ids),
        "bytes": dest.stat().st_size,
        "addedAt": _now(),
        "sample": sample,
    }
    with _lock:
        catalog = _read_catalog()
        catalog.append(record)
        _write_catalog(catalog)
    return record


def delete_document(doc_id: str) -> bool:
    with _lock:
        catalog = _read_catalog()
        kept = [item for item in catalog if item["id"] != doc_id]
        if len(kept) == len(catalog):
            return False
        _write_catalog(kept)
    try:
        collection().delete(where={"document_id": doc_id})
    except Exception:
        pass
    (PDFS / f"{doc_id}.pdf").unlink(missing_ok=True)
    return True


def retrieve(question: str, k: int = 4, document_ids: list[str] | None = None) -> list[dict[str, Any]]:
    col = collection()
    if col.count() == 0:
        return []
    where = None
    if document_ids:
        where = {"document_id": {"$in": document_ids}} if len(document_ids) > 1 else {"document_id": document_ids[0]}
    query: dict[str, Any] = {
        "query_texts": [question],
        "n_results": min(k, col.count()),
        "include": ["documents", "metadatas", "distances"],
    }
    if where is not None:
        query["where"] = where
    result = col.query(**query)
    docs = (result.get("documents") or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]
    hits: list[dict[str, Any]] = []
    for text, meta, distance in zip(docs, metas, distances, strict=False):
        if not text or not meta:
            continue
        hits.append(
            {
                "document": meta.get("document") or "Document",
                "documentId": meta.get("document_id") or "",
                "page": int(meta.get("page") or 1),
                "excerpt": text.strip(),
                "distance": float(distance) if distance is not None else None,
            }
        )
    return hits


def seed_sample_if_needed() -> None:
    ensure_dirs()
    if LIBRARY_FILE.exists():
        return
    _write_catalog([])


def _safe_name(name: str) -> str:
    base = name.replace("\\", "/").split("/")[-1].strip() or "document.pdf"
    cleaned = "".join(ch if ch.isprintable() else "_" for ch in base)
    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf"
    return cleaned[:180]
