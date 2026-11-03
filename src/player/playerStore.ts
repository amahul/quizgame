// Phone session: joins a room, keeps a heartbeat going and reconnects on its own
// when the connection drops (screen lock, Wi-Fi hiccup, reloaded tab).
import { create } from 'zustand'
import { randomAvatar, type Avatar } from '../game/avatars'
import type { PhoneView } from '../game/game'
import { validateName, type JoinRejection, type PlayerView } from '../game/lobby'
import { normalizeRoomCode } from '../game/roomCode'
import type { HostMessage } from '../net/protocol'
import type { RoundIntent } from '../rounds'
import { transport, TransportError, type ClientTransport, type TransportErrorKind, type Unsubscribe } from '../net/transport'
import { getPlayerId, loadSession, saveSession, setStorageSlot } from './storage'

export type PlayerError =
  | Exclude<TransportErrorKind, 'room-code-taken'>
  | Exclude<JoinRejection, 'kicked'>
  | 'invalid-room-code'

type Screen = 'form' | 'connecting' | 'joined' | 'ended'

interface Draft {
  roomCode: string
  name: string
  avatar: Avatar
}

interface PlayerStore {
  screen: Screen
  error: PlayerError | null
  endReason: 'kicked' | 'replaced' | null
  reconnecting: boolean
  lateJoin: boolean
  me: PlayerView | null
  /** What the host says this phone should show. */
  view: PhoneView | null
  score: number
  draft: Draft
  init(params: { room: string | null; slot: string | null }): void
  setDraft(patch: Partial<Draft>): void
  join(): void
  /** Sends a round intent (an answer, a choice…) to the host. */
  send(intent: RoundIntent): void
  backToForm(): void
}

const HEARTBEAT_MS = 3_000
/** No message from the host for this long means the connection is dead. */
const HOST_SILENCE_MS = 10_000
/** On returning to the tab, reconnect at once if the host has been quiet this long. */
const STALE_ON_RETURN_MS = 5_000
const MAX_BACKOFF_MS = 5_000
/** Consecutive "room not found" while reconnecting before giving up (host may be reloading). */
const MAX_ROOM_NOT_FOUND = 8

/**
 * join:      the player pressed "Gå med"; failures go straight back to the form.
 * resume:    page load with a saved session; a vanished room silently shows the form.
 * reconnect: we were in the room and lost the connection; retry with backoff.
 */
type Mode = 'join' | 'resume' | 'reconnect'

let client: ClientTransport | null = null
let unsubs: Unsubscribe[] = []
let heartbeat: ReturnType<typeof setInterval> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let lastHostMessageAt = 0
let attempt = 0
let roomNotFoundCount = 0
/** Bumped on every teardown so stale async connects can tell they've been superseded. */
let generation = 0
let mode: Mode = 'join'
let initialized = false

function teardown() {
  generation++
  clearInterval(heartbeat)
  clearTimeout(retryTimer)
  retryTimer = undefined
  unsubs.forEach((unsub) => unsub())
  unsubs = []
  client?.close()
  client = null
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  async function connect(nextMode: Mode) {
    teardown()
    mode = nextMode
    const myGeneration = generation
    const { roomCode, name, avatar } = get().draft
    try {
      const c = await transport.joinRoom(roomCode)
      if (myGeneration !== generation) {
        c.close()
        return
      }
      client = c
      lastHostMessageAt = Date.now()
      unsubs = [c.onMessage(handleMessage), c.onClose(connectionLost)]
      c.send({ type: 'join', playerId: getPlayerId(), name, avatar })
      heartbeat = setInterval(tick, HEARTBEAT_MS)
    } catch (err) {
      if (myGeneration !== generation) return
      connectFailed(err instanceof TransportError ? err.kind : 'connection-failed')
    }
  }

  function tick() {
    if (Date.now() - lastHostMessageAt > HOST_SILENCE_MS) connectionLost()
    else client?.send({ type: 'ping' })
  }

  function connectionLost() {
    if (mode === 'join') giveUp('connection-failed')
    else scheduleReconnect()
  }

  function connectFailed(kind: TransportErrorKind) {
    const error = kind === 'room-code-taken' ? 'connection-failed' : kind
    if (mode === 'join') return giveUp(error)
    if (kind === 'room-not-found') {
      roomNotFoundCount++
      if (mode === 'resume') return giveUp(null)
      if (roomNotFoundCount >= MAX_ROOM_NOT_FOUND) return giveUp('room-not-found')
    }
    scheduleReconnect()
  }

  function scheduleReconnect() {
    teardown()
    set({ reconnecting: true })
    const wait = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)
    attempt++
    const nextMode = mode
    retryTimer = setTimeout(() => void connect(nextMode), wait)
  }

  /** Skips the backoff wait, e.g. when the phone wakes up or comes back online. */
  function reconnectNow() {
    const { screen } = get()
    const waiting = retryTimer !== undefined
    const stale = client !== null && Date.now() - lastHostMessageAt > STALE_ON_RETURN_MS
    if ((screen === 'joined' || screen === 'connecting') && mode !== 'join' && (waiting || stale)) {
      attempt = 0
      void connect(mode)
    }
  }

  function forgetRoom() {
    const { name, avatar } = get().draft
    saveSession({ roomCode: null, name, avatar })
  }

  function giveUp(error: PlayerError | null) {
    teardown()
    forgetRoom()
    attempt = 0
    roomNotFoundCount = 0
    set({ screen: 'form', error, reconnecting: false, me: null, view: null })
  }

  function end(reason: 'kicked' | 'replaced') {
    teardown()
    // A replaced tab leaves the session alone: it belongs to the tab that took over.
    if (reason === 'kicked') forgetRoom()
    set({ screen: 'ended', endReason: reason, reconnecting: false, me: null, view: null })
  }

  function handleMessage(msg: HostMessage) {
    lastHostMessageAt = Date.now()
    switch (msg.type) {
      case 'welcome': {
        const wasLate = !msg.resumed && msg.phase !== 'lobby'
        mode = 'reconnect'
        attempt = 0
        roomNotFoundCount = 0
        const draft = { ...get().draft, name: msg.player.name, avatar: msg.player.avatar }
        saveSession(draft)
        set({
          screen: 'joined',
          me: msg.player,
          draft,
          error: null,
          reconnecting: false,
          lateJoin: msg.resumed ? get().lateJoin : wasLate,
        })
        return
      }
      case 'rejected':
        if (msg.reason === 'kicked') end('kicked')
        else giveUp(msg.reason)
        return
      case 'kicked':
        end('kicked')
        return
      case 'replaced':
        end('replaced')
        return
      case 'view': {
        // The late-join notice lasts until the game moves on to another screen.
        const previous = get().view
        const movedOn = previous !== null && previous.kind !== msg.view.kind
        set({ view: msg.view, score: msg.score, lateJoin: get().lateJoin && !movedOn })
        return
      }
      case 'pong':
        return
    }
  }

  return {
    screen: 'form',
    error: null,
    endReason: null,
    reconnecting: false,
    lateJoin: false,
    me: null,
    view: null,
    score: 0,
    draft: { roomCode: '', name: '', avatar: randomAvatar() },

    init({ room, slot }) {
      if (initialized) return
      initialized = true
      setStorageSlot(slot)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reconnectNow()
      })
      window.addEventListener('online', reconnectNow)

      const saved = loadSession()
      const urlCode = room ? room.trim().toUpperCase().slice(0, 4) : null
      set({
        draft: {
          roomCode: urlCode ?? saved?.roomCode ?? '',
          name: saved?.name ?? '',
          avatar: saved?.avatar ?? get().draft.avatar,
        },
      })
      if (saved?.roomCode && (!urlCode || urlCode === saved.roomCode)) {
        set({ screen: 'connecting' })
        void connect('resume')
      }
    },

    setDraft(patch) {
      set({ draft: { ...get().draft, ...patch }, error: null })
    },

    join() {
      const { draft, screen } = get()
      if (screen === 'connecting') return
      const roomCode = normalizeRoomCode(draft.roomCode)
      if (!roomCode) return set({ error: 'invalid-room-code' })
      const name = validateName(draft.name)
      if (!name) return set({ error: 'invalid-name' })
      attempt = 0
      roomNotFoundCount = 0
      set({ draft: { ...draft, roomCode, name }, screen: 'connecting', error: null, lateJoin: false })
      void connect('join')
    },

    send(intent) {
      client?.send(intent)
    },

    backToForm() {
      set({ screen: 'form', endReason: null, error: null })
    },
  }
})
