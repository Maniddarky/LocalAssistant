import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LibraryDoc } from '@/lib/types'
import type { DocCollection } from '@/lib/workspace'

type CollectionsViewProps = {
  documents: LibraryDoc[]
  collections: DocCollection[]
  activeId: string | null
  onCreate: (name: string) => void
  onToggleDoc: (collectionId: string, documentId: string) => void
  onSelect: (collectionId: string | null) => void
  onDelete: (collectionId: string) => void
}

export function CollectionsView({
  documents,
  collections,
  activeId,
  onCreate,
  onToggleDoc,
  onSelect,
  onDelete,
}: CollectionsViewProps) {
  const [name, setName] = useState('')

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-6 py-8">
      <p className="text-sm text-muted-foreground">Collections</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Group files for a chat</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        A collection limits the next question to the files you tick. Choose All files in the chat header to search everything.
      </p>

      <form
        className="mt-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          onCreate(trimmed)
          setName('')
        }}
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Collection name" />
        <Button type="submit" disabled={!name.trim()}>
          Create
        </Button>
      </form>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {collections.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-4 text-sm text-muted-foreground">No collections yet.</p>
        ) : (
          <ul className="grid gap-3">
            {collections.map((collection) => (
              <li key={collection.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{collection.name}</p>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant={activeId === collection.id ? 'default' : 'outline'} onClick={() => onSelect(collection.id)}>
                      {activeId === collection.id ? 'Selected' : 'Use in chat'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(collection.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
                <ul className="mt-3 grid gap-1">
                  {documents.length === 0 ? (
                    <li className="text-sm text-muted-foreground">Add a PDF in Knowledge first.</li>
                  ) : (
                    documents.map((doc) => (
                      <li key={doc.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={collection.documentIds.includes(doc.id)}
                            onChange={() => onToggleDoc(collection.id, doc.id)}
                          />
                          <span className="truncate">{doc.name}</span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
