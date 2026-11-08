export function browserRecognitionAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function createRecognition(): SpeechRecognition | null {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.lang = 'en-US'
  recognition.interimResults = false
  recognition.continuous = false
  return recognition
}

export async function speakAnswer(text: string): Promise<void> {
  const spoken = text.replace(/\s+/g, ' ').trim().slice(0, 700)
  if (!spoken) return
  try {
    const response = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spoken }),
    })
    if (response.ok) {
      const url = URL.createObjectURL(await response.blob())
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      return
    }
  } catch {
    /* fall through to the browser voice */
  }
  if (!('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(spoken)
  utterance.rate = 1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
