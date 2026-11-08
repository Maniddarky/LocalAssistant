import { FileText } from 'lucide-react'
import type { ChatMessage, LibraryDoc } from '@/lib/types'

type SourcesPanelProps = {
  message: ChatMessage | null
  documents: LibraryDoc[]
}

export function SourcesPanel({ message, documents }: SourcesPanelProps) {
  const citations = message?.citations ?? []

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-sm font-semibold">Sources used</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {citations.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Pages cited in the answer show up here.
          </p>
        ) : (
          <ul className="grid gap-3">
            {citations.map((citation) => (
              <li key={`${citation.documentId}-${citation.page}-${citation.excerpt.slice(0, 16)}`} className="rounded-2xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{citation.document}</p>
                    <p className="text-xs text-muted-foreground">Page {citation.page}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs font-medium text-muted-foreground">Relevant passage</p>
                <p className="mt-1 line-clamp-5 text-sm leading-5 text-foreground">{citation.excerpt}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Knowledge base</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {documents.length} {documents.length === 1 ? 'document' : 'documents'} indexed
          </p>
        </div>
      </div>
    </aside>
  )
}
