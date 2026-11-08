import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { DeskStatus, LlmSettings } from '@/lib/types'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: LlmSettings
  onChange: (settings: LlmSettings) => void
  status: DeskStatus | null
}

export function SettingsDialog({ open, onOpenChange, settings, onChange, status }: SettingsDialogProps) {
  function patch(partial: Partial<LlmSettings>) {
    onChange({ ...settings, ...partial })
  }

  const llm = status?.llm

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Model connection</DialogTitle>
          <DialogDescription>
            Leave this off to quote passages from your PDFs. Turn it on to send the question and those passages to an
            OpenAI-compatible server, such as Ollama on this machine. The key stays in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-3">
          <Label htmlFor="use-model">Use a language model</Label>
          <Switch
            id="use-model"
            checked={settings.llmEnabled}
            onCheckedChange={(checked) => patch({ llmEnabled: checked })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="base-url">Base URL</Label>
          <Input
            id="base-url"
            value={settings.baseUrl}
            spellCheck={false}
            onChange={(event) => patch({ baseUrl: event.target.value })}
            placeholder="http://127.0.0.1:11434/v1"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="model-name">Model name</Label>
          <Input
            id="model-name"
            value={settings.model}
            spellCheck={false}
            onChange={(event) => patch({ model: event.target.value })}
            placeholder="llama3.2"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="api-key">API key, if the server requires one</Label>
          <Input
            id="api-key"
            type="password"
            autoComplete="off"
            value={settings.apiKey}
            onChange={(event) => patch({ apiKey: event.target.value })}
            placeholder="Optional"
          />
        </div>

        {llm ? (
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground">{llm.state === 'ready' ? 'Server reachable.' : llm.state === 'off' ? 'Model off.' : 'Server not reachable.'}</span>{' '}
            {llm.detail}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
