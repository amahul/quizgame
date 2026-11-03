// Persists the phone's identity so a dropped connection or reloaded tab can resume.
// Storage can throw (private mode, blocked cookies), so every access is guarded and
// falls back to memory for this page load.
import { isValidAvatar, type Avatar } from '../game/avatars'

export interface SavedSession {
  /** The room to resume on next load; null once the player has left or been kicked. */
  roomCode: string | null
  name: string
  avatar: Avatar
}

// `#/play?player=2` gives a separate identity, for testing several players in one browser.
let suffix = ''
let memoryPlayerId: string | null = null

export function setStorageSlot(slot: string | null): void {
  suffix = slot ? `.${slot}` : ''
}

const playerIdKey = () => `quizgame.playerId${suffix}`
const sessionKey = () => `quizgame.session${suffix}`

function randomId(): string {
  // crypto.randomUUID needs a secure context, which http://192.168.x.x is not.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getPlayerId(): string {
  try {
    const stored = localStorage.getItem(playerIdKey())
    if (stored) return stored
    const id = randomId()
    localStorage.setItem(playerIdKey(), id)
    return id
  } catch {
    return (memoryPlayerId ??= randomId())
  }
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(sessionKey())
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<SavedSession>
    if (typeof data.name !== 'string' || !isValidAvatar(data.avatar)) return null
    const roomCode = typeof data.roomCode === 'string' ? data.roomCode : null
    return { roomCode, name: data.name, avatar: data.avatar }
  } catch {
    return null
  }
}

export function saveSession(session: SavedSession): void {
  try {
    localStorage.setItem(sessionKey(), JSON.stringify(session))
  } catch {
    // Not persisted; reconnects within this page load still work.
  }
}
