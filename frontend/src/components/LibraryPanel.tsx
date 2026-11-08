import { useState, type DragEvent } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { LibraryDoc } from '@/lib/types'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type LibraryPanelProps = {
  documents: LibraryDoc[]
  indexing: boolean
  uploading: boolean
  error: string | null
  onUpload: (file: File) => void
  onDelete: (id: string) => void
}

export function LibraryPanel({ documents, indexing, uploading, error, onUpload, onDelete }: LibraryPanelProps) {
  const [armedId, setArmedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  function takeFile(file: File | undefined) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setLocalError('Choose a PDF.')
      return
    }
    setLocalError(null)
    onUpload(file)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    takeFile(event.dataTransfer.files[0])
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-6 py-8">
      <p className="text-sm text-muted-foreground">Knowledge</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Files on this device</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Answers are retrieved from these PDFs. A scan without a text layer cannot be searched.
      </p>

      <label
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-6 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center ${
          dragging ? 'border-primary bg-secondary' : 'border-border bg-card hover:border-primary/50'
        }`}
      >
        <Upload className="size-4 text-primary" />
        <span className="text-sm font-medium">{uploading ? 'Reading the PDF…' : 'Drop a PDF or choose a file'}</span>
        <span className="text-xs text-muted-foreground">Up to 40 MB, text layer required</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            takeFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </label>

      {localError || error ? <p className="mt-3 text-sm text-destructive">{localError || error}</p> : null}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {indexing && documents.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-4 text-sm text-muted-foreground">Indexing your files…</p>
        ) : null}
        {!indexing && documents.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-4 text-sm text-muted-foreground">
            No files yet. Add a text-based PDF, then ask about it in a chat.
          </p>
        ) : null}
        <ul className="grid gap-2">
          {documents.map((doc) => (
            <li key={doc.id} className="rounded-2xl border border-border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {doc.pages} {doc.pages === 1 ? 'page' : 'pages'} · {doc.chunks} passages · {formatBytes(doc.bytes)}
                  </p>
                </div>
                {doc.sample ? <Badge variant="outline">Sample</Badge> : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 px-2 text-muted-foreground"
                onClick={() => {
                  if (armedId === doc.id) {
                    onDelete(doc.id)
                    setArmedId(null)
                  } else {
                    setArmedId(doc.id)
                  }
                }}
              >
                <Trash2 />
                {armedId === doc.id ? 'Confirm remove' : 'Remove'}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
