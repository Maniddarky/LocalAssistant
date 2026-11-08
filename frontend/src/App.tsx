import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Settings } from 'lucide-react'
import { ChatPane } from '@/components/ChatPane'
import { LibraryPanel } from '@/components/LibraryPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { askQuestion, deleteDocument, fetchDefaults, fetchDocuments, fetchStatus, uploadPdf } from '@/lib/api'
import { loadSettings, loadThread, saveSettings, saveThread } from '@/lib/settings'
import { speakAnswer } from '@/lib/speech'
import type { ChatMessage, DeskStatus, LibraryDoc, LlmSettings } from '@/lib/types'

function nextId() {
  return crypto.randomUUID()
}

export default function App() {
  const [settings, setSettings] = useState<LlmSettings>(() => loadSettings())
  const [documents, setDocuments] = useState<LibraryDoc[]>([])
  const [indexing, setIndexing] = useState(true)
  const [status, setStatus] = useState<DeskStatus | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadThread())
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    saveThread(messages)
  }, [messages])

  const refreshLibrary = useCallback(async () => {
    const library = await fetchDocuments()
    setDocuments(library.documents)
    setIndexing(library.indexing)
    if (library.indexError) setUploadError(library.indexError)
    return library
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchDefaults()
      .then((defaults) => {
        if (cancelled) return
        const stored = localStorage.getItem('ground-school-settings')
        if (stored) return
        setSettings((current) => ({
          ...current,
          baseUrl: defaults.baseUrl || current.baseUrl,
          model: defaults.model || current.model,
        }))
      })
      .catch(() => {
        /* defaults are already filled in */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let timer = 0
    async function tick() {
      try {
        const library = await refreshLibrary()
        const next = await fetchStatus(settings)
        if (!library.indexing) setStatus(next)
        else setStatus(next)
        setOffline(false)
      } catch {
        setOffline(true)
      }
    }
    void tick()
    timer = window.setInterval(() => void tick(), 5000)
    return () => window.clearInterval(timer)
  }, [refreshLibrary, settings])

  async function onUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      await uploadPdf(file)
      await refreshLibrary()
      setLibraryOpen(false)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(id: string) {
    setUploadError(null)
    try {
      await deleteDocument(id)
      await refreshLibrary()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not remove that document.')
    }
  }

  async function onAsk(question: string, spoken: boolean) {
    const history = messages
      .filter((message) => !message.pending && !message.error)
      .slice(-6)
      .map((message) => ({ role: message.role, content: message.content }))
    const userId = nextId()
    const pendingId = nextId()
    setAsking(true)
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', content: question },
      { id: pendingId, role: 'assistant', content: '', pending: true },
    ])
    try {
      const result = await askQuestion(question, history, settings)
      const answer: ChatMessage = {
        id: pendingId,
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        mode: result.mode,
        notice: result.notice,
      }
      setMessages((current) => current.map((message) => (message.id === pendingId ? answer : message)))
      if (spoken) void speakAnswer(result.answer)
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId
            ? {
                id: pendingId,
                role: 'assistant',
                content: error instanceof Error ? error.message : 'The desk could not answer.',
                error: true,
                mode: 'excerpts',
              }
            : message,
        ),
      )
    } finally {
      setAsking(false)
    }
  }

  const library = (
    <LibraryPanel
      documents={documents}
      indexing={indexing}
      uploading={uploading}
      error={uploadError}
      onUpload={(file) => void onUpload(file)}
      onDelete={(id) => void onDelete(id)}
    />
  )

  const voiceLabel =
    status?.stt === 'faster-whisper' ? 'Local speech recognition' : 'Browser speech recognition'
  const speakLabel = status?.tts === 'piper' ? 'Piper voice' : 'Browser voice'
  const modelLabel =
    status?.llm.state === 'ready' ? 'Model connected' : status?.llm.state === 'unreachable' ? 'Model unreachable' : 'Quoting the library'

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="grid size-9 place-items-center rounded-lg border border-primary/40 bg-card text-primary" aria-hidden>
          <svg viewBox="0 0 32 32" className="size-5">
            <path d="M6 22h20M9 22 16 10l7 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="font-serif text-lg leading-none">Ground School</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">Local study desk · handbooks stay on this machine</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setLibraryOpen(true)} aria-label="Open library">
            <BookOpen />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings />
            Settings
          </Button>
        </div>
      </header>

      <p className="border-b border-border bg-primary/10 px-4 py-2 text-xs leading-5 text-foreground md:px-6">
        Study aid only. Not a substitute for current official publications, a flight instructor, or a decision in the airplane.
      </p>

      <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="hidden h-full min-h-0 overflow-hidden border-r border-border md:block">{library}</aside>
        <main className="flex h-full min-h-0 flex-col overflow-hidden">
          <ChatPane
            messages={messages}
            asking={asking}
            hasLibrary={documents.length > 0}
            indexing={indexing}
            stt={status?.stt}
            onAsk={onAsk}
          />
        </main>
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 font-mono text-[11px] text-muted-foreground md:px-6">
        <span>{offline ? 'API not reachable' : status?.embedder === 'error' ? 'Search failed' : status?.indexing ? 'Indexing' : 'Search ready'}</span>
        <span>{voiceLabel}</span>
        <span>{speakLabel}</span>
        <span>{modelLabel}</span>
      </footer>

      <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
        <SheetContent side="left" className="h-full w-full max-w-full border-border bg-background p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>Library</SheetTitle>
          </SheetHeader>
          {library}
        </SheetContent>
      </Sheet>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSettings}
        status={status}
      />
    </div>
  )
}
