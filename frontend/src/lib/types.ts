export type Citation = {
  document: string
  documentId: string
  page: number
  excerpt: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  mode?: 'llm' | 'excerpts'
  notice?: string | null
  pending?: boolean
  error?: boolean
}

export type LibraryDoc = {
  id: string
  name: string
  pages: number
  chunks: number
  bytes: number
  addedAt: string
  sample: boolean
}

export type LlmSettings = {
  llmEnabled: boolean
  baseUrl: string
  model: string
  apiKey: string
}

export type DeskStatus = {
  documents: number
  chunks: number
  indexing: boolean
  indexError: string | null
  embedder: 'ready' | 'error' | 'idle'
  stt: 'faster-whisper' | 'browser'
  tts: 'piper' | 'browser'
  llm: { state: 'off' | 'ready' | 'unreachable'; detail: string }
}
