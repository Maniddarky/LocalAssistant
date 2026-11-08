import type { ChatMessage } from '@/lib/types'

const CHATS_KEY = 'local-ai-chats'
const COLLECTIONS_KEY = 'local-ai-collections'

export type ChatThread = {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: string
  collectionId: string | null
}

export type DocCollection = {
  id: string
  name: string
  documentIds: string[]
}

export function loadChats(): ChatThread[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatThread[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveChats(chats: ChatThread[]) {
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 40)))
}

export function loadCollections(): DocCollection[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DocCollection[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCollections(collections: DocCollection[]) {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections))
}

export function titleFromMessages(messages: ChatMessage[]) {
  const first = messages.find((message) => message.role === 'user' && message.content.trim())
  if (!first) return 'New chat'
  const text = first.content.trim().replace(/\s+/g, ' ')
  return text.length > 42 ? `${text.slice(0, 42)}…` : text
}
