import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Copy, Mic, RotateCcw, Send, Sparkles, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { transcribeClip } from '@/lib/api'
import { browserRecognitionAvailable, createRecognition, speakAnswer } from '@/lib/speech'
import type { ChatMessage, DeskStatus } from '@/lib/types'

type ChatPaneProps = {
  messages: ChatMessage[]
  asking: boolean
  hasLibrary: boolean
  indexing: boolean
  stt: DeskStatus['stt'] | undefined
  onAsk: (question: string, spoken: boolean) => Promise<void>
  onAttach: (file: File) => void
}

export function ChatPane({ messages, asking, hasLibrary, indexing, stt, onAsk, onAttach }: ChatPaneProps) {
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const heardRef = useRef('')
  const holdingRef = useRef(false)

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, listening])

  async function submit(text: string, spoken: boolean) {
    const question = text.trim()
    if (!question || asking) return
    setDraft('')
    setVoiceError(null)
    await onAsk(question, spoken)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void submit(draft, false)
  }

  function stopCapture() {
    holdingRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setListening(false)
  }

  async function beginCapture() {
    if (listening || asking) return
    holdingRef.current = true
    setVoiceError(null)
    heardRef.current = ''

    if (stt === 'faster-whisper' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!holdingRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const recorder = new MediaRecorder(stream)
        const chunks: Blob[] = []
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop())
          recorderRef.current = null
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          if (blob.size < 800) {
            setVoiceError('That clip was too short. Hold the button while you speak.')
            return
          }
          void transcribeClip(blob)
            .then((text) => submit(text, true))
            .catch((error: unknown) => {
              setVoiceError(error instanceof Error ? error.message : 'Speech recognition failed.')
            })
        }
        recorderRef.current = recorder
        if (!holdingRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          recorderRef.current = null
          return
        }
        recorder.start()
        if (!holdingRef.current && recorder.state !== 'inactive') recorder.stop()
        setListening(true)
        return
      } catch {
        setVoiceError('Microphone permission was blocked. Type the question instead.')
        return
      }
    }

    const recognition = createRecognition()
    if (!recognition) {
      setVoiceError('This browser has no speech recognition. Type the question, or install Faster-Whisper on the API.')
      return
    }
    recognition.onresult = (event) => {
      heardRef.current = event.results[0]?.[0]?.transcript ?? ''
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError('Microphone permission was blocked. Type the question instead.')
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setVoiceError('Speech recognition stopped. Type the question instead.')
      }
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
      const heard = heardRef.current.trim()
      if (heard) void submit(heard, true)
    }
    if (!holdingRef.current) return
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setVoiceError('Speech recognition is already running. Release the button and try again.')
    }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    void beginCapture()
  }

  const lastUser = [...messages].reverse().find((message) => message.role === 'user')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-8 md:px-10">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center pt-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Sparkles className="size-5" />
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">Ask anything about your files</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {indexing && !hasLibrary
                ? 'Files are being indexed. You can ask as soon as they appear in Knowledge.'
                : hasLibrary
                  ? 'Questions are answered from the PDFs on this device, with the file name and page attached.'
                  : 'Add a PDF in Knowledge, then ask about something inside it.'}
            </p>
          </div>
        ) : (
          <ol className="mx-auto grid max-w-2xl gap-6">
            {messages.map((message) => (
              <li key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex gap-3'}>
                {message.role === 'assistant' ? (
                  <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <Sparkles className="size-4" />
                  </span>
                ) : null}
                {message.role === 'user' ? (
                  <div className="max-w-[80%]">
                    <p className="rounded-2xl rounded-br-md bg-secondary px-4 py-3 text-sm leading-6 text-secondary-foreground">
                      {message.content}
                    </p>
                  </div>
                ) : message.pending ? (
                  <p className="pt-2 text-sm text-muted-foreground">Looking through your files…</p>
                ) : (
                  <article className="min-w-0 flex-1">
                    {message.notice ? <p className="mb-2 text-sm text-primary">{message.notice}</p> : null}
                    <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
                    {message.citations && message.citations.length > 0 ? (
                      <div className="mt-3 grid gap-2">
                        {message.citations.map((citation) => (
                          <div
                            key={`${citation.documentId}-${citation.page}-${citation.excerpt.slice(0, 20)}`}
                            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                          >
                            <span className="grid size-7 place-items-center rounded-md bg-red-50 text-[10px] font-semibold text-red-600">PDF</span>
                            <span className="truncate">
                              {citation.document} · Page {citation.page}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!message.error ? (
                      <div className="mt-2 flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Copy answer"
                          onClick={() => {
                            void navigator.clipboard.writeText(message.content)
                            setCopiedId(message.id)
                          }}
                        >
                          <Copy />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Speak answer" onClick={() => void speakAnswer(message.content)}>
                          <Volume2 />
                        </Button>
                        {lastUser ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Ask again"
                            onClick={() => void submit(lastUser.content, false)}
                          >
                            <RotateCcw />
                          </Button>
                        ) : null}
                        {copiedId === message.id ? <span className="self-center text-xs text-muted-foreground">Copied</span> : null}
                      </div>
                    ) : null}
                  </article>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={onSubmit} className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-10">
        <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card px-3 py-2 shadow-sm">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit(draft, false)
              }
            }}
            rows={2}
            placeholder={listening ? 'Listening…' : 'Ask anything about your files or beyond...'}
            className="min-h-12 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            aria-label="Question"
          />
          <div className="flex items-center gap-1 px-1 pb-1">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onAttach(file)
                event.target.value = ''
              }}
            />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Attach a PDF" onClick={() => fileRef.current?.click()}>
              <span className="text-base leading-none">＋</span>
            </Button>
            <p className="mr-auto text-xs text-muted-foreground">
              {voiceError ? voiceError : 'Enter to send · Shift+Enter for a new line'}
            </p>
            <Button
              type="button"
              variant={listening ? 'default' : 'ghost'}
              size="icon"
              aria-pressed={listening}
              aria-label={listening ? 'Release to send speech' : 'Hold to talk'}
              disabled={asking}
              onPointerDown={onPointerDown}
              onPointerUp={stopCapture}
              onPointerCancel={stopCapture}
              onContextMenu={(event) => event.preventDefault()}
            >
              <Mic />
            </Button>
            <Button type="submit" size="icon" className="rounded-full" disabled={asking || !draft.trim()} aria-label="Send question">
              <Send />
            </Button>
          </div>
        </div>
        {!browserRecognitionAvailable() && stt !== 'faster-whisper' ? (
          <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-muted-foreground">
            Voice input needs Chrome or Edge, unless Faster-Whisper is installed.
          </p>
        ) : null}
      </form>
    </div>
  )
}
