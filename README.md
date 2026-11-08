# Ground School

A local aviation study desk. Upload a PDF handbook, ask a question, and read the answer next to the document name and page it came from. Speech is push-to-talk. Nothing is sent to a model unless you turn that on.

This is a study aid. It is not a substitute for current official publications, a flight instructor, or a decision in the airplane.

## What you can do

- Ask questions against the PDFs in the library. With no API key, the desk quotes the closest passages.
- See the file name and page under each answer.
- Hold the microphone to talk. Chrome and Edge can recognize speech in the browser. A reply can be spoken back.
- Optionally connect any OpenAI-compatible server (Ollama on this machine, or a cloud API). The key stays in the browser.

A short original sample, **Ground School Desk Notes**, is indexed on first launch so you can try a question before you upload anything.

## Run it locally

You need Python 3.12 and Node 22. The first launch downloads an embedding model (about 80 MB) from Chroma's model host. After that, search works without a network. There is no GPU requirement.

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8765
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The page proxies `/api` to port 8765.

Copy `.env.example` to `.env` only if you want a server-side model key. Leave it blank to stay in quoted-passage mode.

### Optional language model

1. Install [Ollama](https://ollama.com) and run `ollama pull llama3.2`.
2. In the app, open Settings, turn on **Use a language model**, and keep the base URL at `http://127.0.0.1:11434/v1`.
3. If that server is down, the desk still shows the retrieved pages and says the model did not answer.

A cloud server works the same way: set its base URL, model name, and key in Settings. The question and the retrieved passages are sent to that server. The rest of the library is not.

### Optional local voice models

The browser voice is the default. For speech that does not call a cloud recognizer, install the extra packages and a Piper voice:

```bash
backend/.venv/bin/pip install -r backend/requirements-voice.txt
mkdir -p backend/data/models/piper
curl -L -o backend/data/models/piper/en_US-lessac-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -L -o backend/data/models/piper/en_US-lessac-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

Restart the API. The footer switches to **Local speech recognition** and **Piper voice** when those pieces are present. Faster-Whisper downloads its `tiny` model on the first transcription. `ffmpeg` must be on the PATH for some audio formats.

### Docker

If you have Docker:

```bash
docker compose up --build
```

The desk is published on port 4317 and the API on port 8765. Library data is kept in the `school-data` volume.

## Limits

- PDFs need a text layer. A scan that is only an image is rejected.
- Uploads are limited to 40 MB.
- Quoted mode does not write a new explanation. It shows the closest passages, which can be only loosely related.
- When a model is enabled, it is instructed to stay inside those passages. Still check the cited page.
- The installable app shell is produced by `npm run build` in `frontend`. `npm run dev` is the live desk while you are working.
