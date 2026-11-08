"""Local AI API."""

from __future__ import annotations

import os
import threading
from contextlib import asynccontextmanager
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.llm import answer as llm_answer
from app.llm import probe, server_defaults
from app.paths import ensure_dirs
from app.store import (
    IngestError,
    add_pdf,
    chunk_count,
    delete_document,
    embedder_error,
    embedder_state,
    index_error,
    indexing,
    list_documents,
    retrieve,
    seed_sample_if_needed,
)
from app.voice import stt_backend, synthesize, transcribe, tts_backend

load_dotenv()

MAX_UPLOAD = 40 * 1024 * 1024
MAX_AUDIO = 15 * 1024 * 1024


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_dirs()
    threading.Thread(target=seed_sample_if_needed, daemon=True).start()
    yield


app = FastAPI(title="Local AI", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = ""


class LlmSettings(BaseModel):
    enabled: bool = False
    baseUrl: str = ""
    model: str = ""
    apiKey: str = ""


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[Turn] = []
    llm: LlmSettings = LlmSettings()
    documentIds: list[str] = []


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1500)


def _status_payload(llm: LlmSettings | None = None) -> dict:
    llm = llm or LlmSettings()
    if not llm.enabled:
        llm_state, llm_detail = "off", "Quoted answers only. Turn on a language model in Settings to draft a reply."
    else:
        llm_state, llm_detail = probe(llm.baseUrl, llm.apiKey)
    return {
        "documents": len(list_documents()),
        "chunks": chunk_count() if embedder_state() != "error" else 0,
        "indexing": indexing(),
        "indexError": index_error() or embedder_error(),
        "embedder": embedder_state(),
        "stt": stt_backend(),
        "tts": tts_backend(),
        "llm": {"state": llm_state, "detail": llm_detail},
    }


def _excerpt_answer(hits: list[dict], loose: bool) -> str:
    lines = [
        "This answer is quoted from your files so you can check the page."
    ]
    if loose:
        lines.append("These are the closest passages, and they may only partly match the question.")
    lines.append("")
    for hit in hits:
        lines.append(f"From {hit['document']}, page {hit['page']}:")
        lines.append(hit["excerpt"])
        lines.append("")
    return "\n".join(lines).strip()


def _public_hits(hits: list[dict]) -> list[dict]:
    return [
        {
            "document": hit["document"],
            "documentId": hit["documentId"],
            "page": hit["page"],
            "excerpt": hit["excerpt"][:700],
        }
        for hit in hits
    ]


@app.get("/api/health")
def health() -> dict:
    return _status_payload()


@app.get("/api/defaults")
def defaults() -> dict:
    return server_defaults()


@app.post("/api/status")
def status(body: LlmSettings) -> dict:
    return _status_payload(body)


@app.get("/api/documents")
def documents() -> dict:
    return {
        "documents": list_documents(),
        "indexing": indexing(),
        "indexError": index_error(),
    }


@app.post("/api/documents")
async def upload(file: UploadFile = File(...)) -> dict:
    name = file.filename or "document.pdf"
    if not name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF.")
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="That file is empty.")
    if len(payload) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="PDFs are limited to 40 MB.")
    try:
        record = add_pdf(payload, name)
    except IngestError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return record


@app.delete("/api/documents/{doc_id}")
def remove(doc_id: str) -> dict:
    if not delete_document(doc_id):
        raise HTTPException(status_code=404, detail="That document is not in the library.")
    return {"ok": True}


@app.post("/api/ask")
def ask(body: AskRequest) -> dict:
    question = body.question.strip()
    if indexing() and not list_documents():
        return {
            "answer": "Your files are still being indexed. Ask again in a moment.",
            "citations": [],
            "mode": "excerpts",
            "notice": None,
        }
    try:
        hits = retrieve(question, document_ids=body.documentIds or None)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Search failed ({exc}).") from exc

    if not hits:
        return {
            "answer": "Nothing in the selected files matched that question. Upload a text PDF, or choose All files.",
            "citations": [],
            "mode": "excerpts",
            "notice": None,
        }

    best_by_page: dict[tuple, dict] = {}
    for hit in hits:
        key = (hit["documentId"], hit["page"])
        current = best_by_page.get(key)
        if current is None or (hit.get("distance") or 1) < (current.get("distance") or 1):
            best_by_page[key] = hit
    ordered = sorted(best_by_page.values(), key=lambda hit: hit.get("distance") or 1)
    chosen = [ordered[0]]
    for hit in ordered[1:]:
        distance = hit.get("distance")
        if distance is not None and distance > 0.50:
            continue
        chosen.append(hit)
        if len(chosen) == 3:
            break
    best = ordered[0].get("distance")
    loose = best is not None and best > 0.55
    citations = _public_hits(chosen)
    history = [turn.model_dump() for turn in body.history]

    if body.llm.enabled:
        try:
            text = llm_answer(
                body.llm.baseUrl,
                body.llm.model or os.getenv("LLM_MODEL", ""),
                body.llm.apiKey,
                question,
                history,
                hits[:4],
            )
            return {
                "answer": text,
                "citations": citations,
                "mode": "llm",
                "notice": None,
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "answer": _excerpt_answer(citations, loose),
                "citations": citations,
                "mode": "excerpts",
                "notice": f"The language model did not answer ({exc}). Showing library passages instead.",
            }

    return {
        "answer": _excerpt_answer(citations, loose),
        "citations": citations,
        "mode": "excerpts",
        "notice": None,
    }


@app.post("/api/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)) -> dict:
    if stt_backend() != "faster-whisper":
        raise HTTPException(status_code=503, detail="stt_unavailable")
    blob = await file.read()
    if not blob or len(blob) > MAX_AUDIO:
        raise HTTPException(status_code=400, detail="Record a short clip and try again.")
    suffix = ".webm"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    try:
        text = transcribe(blob, suffix)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"text": text}


@app.post("/api/voice/speak")
def voice_speak(body: SpeakRequest) -> Response:
    if tts_backend() != "piper":
        raise HTTPException(status_code=503, detail="tts_unavailable")
    try:
        wav = synthesize(body.text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(content=wav, media_type="audio/wav")
