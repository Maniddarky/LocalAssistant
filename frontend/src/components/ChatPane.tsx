import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Mic, Send, Volume2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { transcribeClip } from '@/lib/api'
import { browserRecognitionAvailable, createRecognition, speakAnswer } from '@/lib/speech'
import type { ChatMessage, DeskStatus } from '@/lib/types'

const SUGGESTIONS = [
  'What is density altitude in the desk notes?',
  'Which traffic pattern legs does the sample name?',
  'When does the sample say carburetor ice is possible?',
]

type ChatPaneProps = {
  messages: ChatMessage[]
  asking: boolean
  hasLibrary: boolean
  indexing: boolean
  stt: DeskStatus['stt'] | undefined
  onAsk: (question: string, spoken: boolean) => Promise<void>
}

export function ChatPane({ messages, asking, hasLibrary, indexing, stt, onAsk }: ChatPaneProps) {
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-6 pt-6 md:pt-12">
            <div>
              <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">Briefing</p>
              <h2 className="mt-2 font-serif text-3xl text-foreground md:text-4xl">Ask the books on this desk.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                {indexing && !hasLibrary
                  ? 'The sample notes are being indexed. You can type a question as soon as they appear in the library.'
                  : hasLibrary
                    ? 'Questions are answered from the PDFs in the library, with the document name and page attached. A language model is optional.'
                    : 'The library is empty. Upload a handbook, then ask about something inside it.'}
              </p>
            </div>
            {hasLibrary ? (
              <div className="grid gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm hover:border-primary/60"
                    onClick={() => void submit(suggestion, false)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <ol className="mx-auto grid max-w-2xl gap-5">
            {messages.map((message) => (
              <li key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
                {message.role === 'user' ? (
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-3 text-sm leading-6">
                    {message.content}
                  </p>
                ) : (
                  <article className="max-w-full">
                    {message.pending ? (
                      <p className="text-sm text-muted-foreground">Looking through the library…</p>
                    ) : (
                      <>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant={message.mode === 'llm' ? 'default' : 'outline'}>
                            {message.mode === 'llm' ? 'Model' : 'Quoted'}
                          </Badge>
                          {message.error ? <Badge variant="destructive">Not sent</Badge> : null}
                        </div>
                        {message.notice ? <p className="mb-2 text-sm text-primary">{message.notice}</p> : null}
                        <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
                        {message.citations && message.citations.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {message.citations.map((citation) => (
                              <figure
                                key={`${citation.documentId}-${citation.page}-${citation.excerpt.slice(0, 24)}`}
                                className="border-l-2 border-primary/80 bg-card/80 px-3 py-2"
                              >
                                <figcaption className="font-mono text-[11px] tracking-wide text-primary uppercase">
                                  {citation.document} · p. {citation.page}
                                </figcaption>
                                <blockquote className="mt-1 text-sm leading-5 text-muted-foreground">
                                  {citation.excerpt}
                                </blockquote>
                              </figure>
                            ))}
                          </div>
                        ) : null}
                        {!message.error && message.content ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-2 px-2 text-muted-foreground"
                            onClick={() => void speakAnswer(message.content)}
                          >
                            <Volume2 />
                            Speak
                          </Button>
                        ) : null}
                      </>
                    )}
                  </article>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
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
            placeholder={listening ? 'Listening…' : 'Ask about a page in the library'}
            className="min-h-16 resize-none bg-card"
            aria-label="Question"
          />
          <Button
            type="button"
            variant={listening ? 'default' : 'outline'}
            size="icon-lg"
            aria-pressed={listening}
            aria-label={listening ? 'Release to send speech' : 'Hold to talk'}
            title="Hold to talk"
            disabled={asking}
            onPointerDown={onPointerDown}
            onPointerUp={stopCapture}
            onPointerCancel={stopCapture}
            onContextMenu={(event) => event.preventDefault()}
          >
            <Mic />
          </Button>
          <Button type="submit" size="icon-lg" disabled={asking || !draft.trim()} aria-label="Send question">
            <Send />
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-xs text-muted-foreground">
          {voiceError
            ? voiceError
            : listening
              ? 'Release to send what you said.'
              : browserRecognitionAvailable() || stt === 'faster-whisper'
                ? 'Hold the microphone while you speak. Shift+Enter adds a line.'
                : 'Voice input needs Chrome or Edge on this machine, unless Faster-Whisper is installed.'}
        </p>
      </form>
    </div>
  )
}
