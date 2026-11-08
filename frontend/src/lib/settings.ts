import type { ChatMessage, LlmSettings } from '@/lib/types'

const SETTINGS_KEY = 'ground-school-settings'
const THREAD_KEY = 'ground-school-thread'

export const defaultSettings: LlmSettings = {
  llmEnabled: false,
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'llama3.2',
  apiKey: '',
}

export function loadSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw) as Partial<LlmSettings>
    return { ...defaultSettings, ...parsed, llmEnabled: Boolean(parsed.llmEnabled) }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: LlmSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadThread(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(THREAD_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(parsed) ? parsed.filter((item) => !item.pending) : []
  } catch {
    return []
  }
}

export function saveThread(messages: ChatMessage[]) {
  const kept = messages.filter((item) => !item.pending).slice(-40)
  sessionStorage.setItem(THREAD_KEY, JSON.stringify(kept))
}
