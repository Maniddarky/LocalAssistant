import type { DeskStatus, LibraryDoc, LlmSettings } from '@/lib/types'

export type AskResult = {
  answer: string
  citations: NonNullable<import('@/lib/types').ChatMessage['citations']>
  mode: 'llm' | 'excerpts'
  notice: string | null
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown }
    if (typeof data.detail === 'string' && data.detail) return data.detail
  } catch {
    /* response was not JSON */
  }
  return `The desk could not complete that request (${response.status}).`
}

export async function fetchDocuments(): Promise<{
  documents: LibraryDoc[]
  indexing: boolean
  indexError: string | null
}> {
  const response = await fetch('/api/documents')
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function fetchDefaults(): Promise<{ baseUrl: string; model: string; hasServerKey: boolean }> {
  const response = await fetch('/api/defaults')
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function fetchStatus(settings: LlmSettings): Promise<DeskStatus> {
  const response = await fetch('/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: settings.llmEnabled,
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: settings.apiKey,
    }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function uploadPdf(file: File): Promise<LibraryDoc> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch('/api/documents', { method: 'POST', body })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await errorMessage(response))
}

export async function askQuestion(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  settings: LlmSettings,
  documentIds: string[] = [],
): Promise<AskResult> {
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      history,
      documentIds,
      llm: {
        enabled: settings.llmEnabled,
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: settings.apiKey,
      },
    }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function transcribeClip(blob: Blob): Promise<string> {
  const body = new FormData()
  const type = blob.type || 'audio/webm'
  const ext = type.includes('wav') ? 'wav' : type.includes('mp4') ? 'm4a' : 'webm'
  body.append('file', new File([blob], `speech.${ext}`, { type }))
  const response = await fetch('/api/voice/transcribe', { method: 'POST', body })
  if (!response.ok) throw new Error(await errorMessage(response))
  const data = (await response.json()) as { text: string }
  return data.text
}
