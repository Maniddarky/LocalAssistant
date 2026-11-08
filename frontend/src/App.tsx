import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Folder, Lock, Menu, MessageSquare, Plus, Settings, Sparkles } from 'lucide-react'
import { ChatPane } from '@/components/ChatPane'
import { CollectionsView } from '@/components/CollectionsView'
import { LibraryPanel } from '@/components/LibraryPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { SourcesPanel } from '@/components/SourcesPanel'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { askQuestion, deleteDocument, fetchDefaults, fetchDocuments, fetchStatus, uploadPdf } from '@/lib/api'
import { loadSettings, saveSettings } from '@/lib/settings'
import { speakAnswer } from '@/lib/speech'
import type { ChatMessage, DeskStatus, LibraryDoc, LlmSettings } from '@/lib/types'
import {
  loadChats,
  loadCollections,
  saveChats,
  saveCollections,
  titleFromMessages,
  type ChatThread,
  type DocCollection,
} from '@/lib/workspace'

type View = 'chat' | 'knowledge' | 'collections'

function nextId() {
  return crypto.randomUUID()
}

function blankChat(): ChatThread {
  return {
    id: nextId(),
    title: 'New chat',
    messages: [],
    updatedAt: new Date().toISOString(),
    collectionId: null,
  }
}

export default function App() {
  const [settings, setSettings] = useState<LlmSettings>(() => loadSettings())
  const [documents, setDocuments] = useState<LibraryDoc[]>([])
  const [indexing, setIndexing] = useState(true)
  const [status, setStatus] = useState<DeskStatus | null>(null)
  const [chats, setChats] = useState<ChatThread[]>(() => {
    const stored = loadChats()
    return stored.length > 0 ? stored : [blankChat()]
  })
  const [activeChatId, setActiveChatId] = useState(() => chats[0]?.id ?? '')
  const [collections, setCollections] = useState<DocCollection[]>(() => loadCollections())
  const [view, setView] = useState<View>('chat')
  const [navOpen, setNavOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [offline, setOffline] = useState(false)

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0]
  const messages = activeChat?.messages ?? []
  const activeCollection = collections.find((collection) => collection.id === activeChat?.collectionId) ?? null

  function updateActive(nextMessages: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) {
    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== activeChat?.id) return chat
        const resolved = typeof nextMessages === 'function' ? nextMessages(chat.messages) : nextMessages
        return {
          ...chat,
          messages: resolved,
          title: titleFromMessages(resolved),
          updatedAt: new Date().toISOString(),
        }
      }),
    )
  }

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    saveChats(chats)
  }, [chats])

  useEffect(() => {
    saveCollections(collections)
  }, [collections])

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
        await refreshLibrary()
        setStatus(await fetchStatus(settings))
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
      setView('knowledge')
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
      setCollections((current) => current.map((collection) => ({ ...collection, documentIds: collection.documentIds.filter((docId) => docId !== id) })))
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
    setView('chat')
    updateActive((current) => [
      ...current,
      { id: userId, role: 'user', content: question },
      { id: pendingId, role: 'assistant', content: '', pending: true },
    ])
    try {
      const result = await askQuestion(question, history, settings, activeCollection?.documentIds ?? [])
      const answer: ChatMessage = {
        id: pendingId,
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        mode: result.mode,
        notice: result.notice,
      }
      updateActive((current) => current.map((message) => (message.id === pendingId ? answer : message)))
      if (spoken) void speakAnswer(result.answer)
    } catch (error) {
      updateActive((current) =>
        current.map((message) =>
          message.id === pendingId
            ? {
                id: pendingId,
                role: 'assistant',
                content: error instanceof Error ? error.message : 'Local AI could not answer.',
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

  function newChat() {
    const chat = blankChat()
    setChats((current) => [chat, ...current])
    setActiveChatId(chat.id)
    setView('chat')
    setNavOpen(false)
  }

  const latestAnswer = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant' && !message.pending) ?? null,
    [messages],
  )

  const modelName = settings.model || 'No model'
  const usingCloud = settings.llmEnabled && !/localhost|127\.0\.0\.1/.test(settings.baseUrl)
  const modelLabel = !settings.llmEnabled ? 'Library quotes' : status?.llm.state === 'ready' ? `Local model · ${modelName}` : status?.llm.state === 'unreachable' ? 'Model unreachable' : `Model · ${modelName}`
  const statusLine = offline ? 'API not reachable' : indexing ? 'Indexing files' : 'Running locally'

  const nav = (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-none">Local AI</p>
          <p className="mt-1 text-xs text-muted-foreground">Your private AI workspace</p>
        </div>
      </div>
      <div className="px-3">
        <Button type="button" className="w-full justify-start rounded-xl" onClick={newChat}>
          <Plus />
          New chat
        </Button>
      </div>
      <nav className="mt-4 grid gap-1 px-3">
        <NavButton icon={<MessageSquare className="size-4" />} label="Chats" active={view === 'chat'} onClick={() => { setView('chat'); setNavOpen(false) }} />
        <NavButton icon={<Sparkles className="size-4" />} label="Knowledge" active={view === 'knowledge'} onClick={() => { setView('knowledge'); setNavOpen(false) }} />
        <NavButton icon={<Folder className="size-4" />} label="Collections" active={view === 'collections'} onClick={() => { setView('collections'); setNavOpen(false) }} />
        <NavButton icon={<Settings className="size-4" />} label="Settings" active={false} onClick={() => setSettingsOpen(true)} />
      </nav>
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
        <p className="px-2 text-xs font-medium text-muted-foreground">Recent</p>
        <ul className="mt-2 grid gap-1">
          {chats.map((chat) => (
            <li key={chat.id}>
              <button
                type="button"
                className={`w-full truncate rounded-xl px-3 py-2 text-left text-sm ${chat.id === activeChat?.id && view === 'chat' ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted'}`}
                onClick={() => {
                  setActiveChatId(chat.id)
                  setView('chat')
                  setNavOpen(false)
                }}
              >
                {chat.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${offline ? 'bg-destructive' : 'bg-emerald-500'}`} />
          {statusLine}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Model, data and files stay on this device.</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <aside className="hidden w-[260px] shrink-0 border-r border-border md:block">{nav}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-card/70 px-3 py-3 md:px-5">
          <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Menu />
          </Button>
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            Workspace <span className="text-foreground">/ {activeChat?.title ?? 'New chat'}</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="max-w-[220px] truncate" onClick={() => setSettingsOpen(true)}>
              {modelLabel}
            </Button>
            <span className={`hidden items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${usingCloud ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
              <Lock className="size-3" />
              {usingCloud ? 'Cloud model' : 'Private'}
            </span>
            <Button type="button" variant="ghost" size="icon" className="xl:hidden" aria-label="Show sources" onClick={() => setSourcesOpen(true)}>
              <Sparkles />
            </Button>
          </div>
        </header>
        {activeCollection && view === 'chat' ? (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2 text-sm">
            <span>Searching {activeCollection.name}</span>
            <button
              type="button"
              className="text-primary"
              onClick={() =>
                setChats((current) => current.map((chat) => (chat.id === activeChat?.id ? { ...chat, collectionId: null } : chat)))
              }
            >
              All files
            </button>
          </div>
        ) : null}
        <div className="grid min-h-0 flex-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="flex min-h-0 flex-col overflow-hidden">
            {view === 'chat' ? (
              <ChatPane
                messages={messages}
                asking={asking}
                hasLibrary={documents.length > 0}
                indexing={indexing}
                stt={status?.stt}
                onAsk={onAsk}
                onAttach={(file) => void onUpload(file)}
              />
            ) : null}
            {view === 'knowledge' ? (
              <LibraryPanel
                documents={documents}
                indexing={indexing}
                uploading={uploading}
                error={uploadError}
                onUpload={(file) => void onUpload(file)}
                onDelete={(id) => void onDelete(id)}
              />
            ) : null}
            {view === 'collections' ? (
              <CollectionsView
                documents={documents}
                collections={collections}
                activeId={activeChat?.collectionId ?? null}
                onCreate={(name) => setCollections((current) => [...current, { id: nextId(), name, documentIds: [] }])}
                onToggleDoc={(collectionId, documentId) =>
                  setCollections((current) =>
                    current.map((collection) => {
                      if (collection.id !== collectionId) return collection
                      const has = collection.documentIds.includes(documentId)
                      return {
                        ...collection,
                        documentIds: has ? collection.documentIds.filter((id) => id !== documentId) : [...collection.documentIds, documentId],
                      }
                    }),
                  )
                }
                onSelect={(collectionId) => {
                  setChats((current) => current.map((chat) => (chat.id === activeChat?.id ? { ...chat, collectionId } : chat)))
                  setView('chat')
                }}
                onDelete={(collectionId) => {
                  setCollections((current) => current.filter((collection) => collection.id !== collectionId))
                  setChats((current) => current.map((chat) => (chat.collectionId === collectionId ? { ...chat, collectionId: null } : chat)))
                }}
              />
            ) : null}
          </main>
          <div className="hidden border-l border-border xl:block">
            <SourcesPanel message={latestAnswer} documents={documents} />
          </div>
        </div>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[280px] max-w-[85vw] border-border bg-card p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          {nav}
        </SheetContent>
      </Sheet>
      <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <SheetContent side="right" className="w-full max-w-sm border-border bg-card p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Sources</SheetTitle>
          </SheetHeader>
          <SourcesPanel message={latestAnswer} documents={documents} />
        </SheetContent>
      </Sheet>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={setSettings} status={status} />
    </div>
  )
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${active ? 'bg-secondary font-medium text-secondary-foreground' : 'text-foreground hover:bg-muted'}`}
    >
      {icon}
      {label}
    </button>
  )
}
