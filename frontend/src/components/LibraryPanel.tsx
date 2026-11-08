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

export function LibraryPanel({
  documents,
  indexing,
  uploading,
  error,
  onUpload,
  onDelete,
}: LibraryPanelProps) {
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-4 pb-2">
        <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">Library</p>
        <h2 className="mt-1 font-serif text-xl text-foreground">Handbooks on this machine</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Answers are retrieved from these PDFs. A scan without a text layer cannot be searched.
        </p>
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mx-4 mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
          dragging ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:border-primary/60'
        }`}
      >
        <Upload className="size-4 text-primary" />
        <span className="text-sm">{uploading ? 'Reading the PDF…' : 'Drop a PDF or choose a file'}</span>
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

      {localError || error ? <p className="mx-4 mt-3 text-sm text-destructive">{localError || error}</p> : null}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {indexing && documents.length === 0 ? (
          <p className="rounded-lg bg-card px-3 py-4 text-sm text-muted-foreground">
            Indexing the sample desk notes…
          </p>
        ) : null}
        {!indexing && documents.length === 0 ? (
          <p className="rounded-lg bg-card px-3 py-4 text-sm text-muted-foreground">
            No handbooks yet. Upload a text-based PDF, or restart the API if the sample notes did not finish indexing.
          </p>
        ) : null}
        <ul className="grid gap-2">
          {documents.map((doc) => (
            <li key={doc.id} className="rounded-xl border border-border bg-card px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
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
