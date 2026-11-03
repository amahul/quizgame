// Host session: wires the transport to the pure lobby and game logic. The room
// state here is the single source of truth; phones only see what we send them.
import { create } from 'zustand'
import { playJoinSound } from '../audio'
import { registerLocalFiles } from '../audio/music/local'
import { catalog } from '../content/catalog'
import { buildGamePlan } from '../content/plan'
import { parseSetup, presetSetup, testRunSetup, type GameSetup } from '../content/setup'
import { loadUsed, markUsed } from '../content/usage'
import * as game from '../game/game'
import type { GameAction } from '../game/game'
import * as lobby from '../game/lobby'
import type { RoomState } from '../game/lobby'
import { generateRoomCode } from '../game/roomCode'
import { parseClientMessage, type HostMessage } from '../net/protocol'
import { transport, TransportError, type HostTransport, type Unsubscribe } from '../net/transport'
import type { MusicTrack } from '../rounds/music/track'

type HostStatus = 'idle' | 'opening' | 'open' | 'error'

export type MusicSource = 'deezer' | 'local'

interface HostStore {
  status: HostStatus
  room: RoomState | null
  /** The game builder's choices; remembered between games. */
  setup: GameSetup
  /** True while the host is in the game builder (before or instead of the lobby). */
  building: boolean
  setSetup(setup: GameSetup): void
  /** Hidden test mode (five clicks in the top right corner): one question per round. */
  testMode: boolean
  toggleTestMode(): void
  /** Dev only: how many fake players to add when the room opens (#/host?bots=8). */
  botCount: number
  setBotCount(count: number): void
  /** Leaves the builder for the lobby (opening the room if needed). */
  finishBuilding(): void
  editSetup(): void
  musicSource: MusicSource
  /** Tracks from the host's own folder ("Lokal musik"); the files stay in this browser. */
  localTracks: MusicTrack[]
  /** Audio files in the folder that weren't named "Artist - Title". */
  localSkipped: number
  setMusicSource(source: MusicSource): void
  setLocalFiles(files: File[]): void
  open(): Promise<void>
  kick(playerId: string): void
  start(): void
  /** A host button press during the game ("Visa svar", "Nästa", override…). */
  act(action: GameAction): void
  /** After the final standings: back to the lobby to start a new game. */
  backToLobby(): void
  close(): void
}

const SAVED_ROOM_KEY = 'quizgame.host.room'
const SETUP_KEY = 'quizgame.setup'
const TEST_MODE_KEY = 'quizgame.testMode'
const SWEEP_INTERVAL_MS = 2_000
const TICK_INTERVAL_MS = 250
const NEW_CODE_ATTEMPTS = 5
/** After a reload the broker may still hold our old ID for a moment. */
const SAVED_CODE_ATTEMPTS = 3
const SAVED_CODE_RETRY_MS = 2_000
const KICK_CLOSE_DELAY_MS = 300

let host: HostTransport | null = null
let unsubs: Unsubscribe[] = []
let timers: ReturnType<typeof setInterval>[] = []
let stopBots: (() => void) | null = null
const peerOfPlayer = new Map<string, string>()
const playerOfPeer = new Map<string, string>()
/** Last view message sent to each player, so unchanged views aren't resent. */
const lastSentView = new Map<string, string>()

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const isCodeTaken = (err: unknown) => err instanceof TransportError && err.kind === 'room-code-taken'

// The room survives a host page reload (sessionStorage is per tab), so phones can reconnect.
function loadSavedRoom(): RoomState | null {
  try {
    const raw = sessionStorage.getItem(SAVED_ROOM_KEY)
    const room = raw ? (JSON.parse(raw) as RoomState) : null
    if (!room || typeof room.code !== 'string' || !Array.isArray(room.players)) return null
    return { ...room, game: room.game ? { ...room.game, pausedAt: room.game.pausedAt ?? null } : null }
  } catch {
    return null
  }
}

function saveRoom(room: RoomState | null) {
  try {
    if (room) sessionStorage.setItem(SAVED_ROOM_KEY, JSON.stringify(room))
    else sessionStorage.removeItem(SAVED_ROOM_KEY)
  } catch {
    // Reload recovery is best-effort.
  }
}

function loadSetup(): GameSetup {
  try {
    return parseSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null')) ?? presetSetup('classic')
  } catch {
    return presetSetup('classic')
  }
}

function loadTestMode(): boolean {
  try {
    return sessionStorage.getItem(TEST_MODE_KEY) === '1'
  } catch {
    return false
  }
}

function saveTestMode(on: boolean) {
  try {
    if (on) sessionStorage.setItem(TEST_MODE_KEY, '1')
    else sessionStorage.removeItem(TEST_MODE_KEY)
  } catch {
    // Lasts for this page load only.
  }
}

function saveSetup(setup: GameSetup) {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup))
  } catch {
    // Not remembered; the builder still works.
  }
}

async function claimRoom(saved: RoomState | null): Promise<HostTransport> {
  if (saved) {
    for (let i = 0; i < SAVED_CODE_ATTEMPTS; i++) {
      try {
        return await transport.createHost(saved.code)
      } catch (err) {
        if (!isCodeTaken(err)) throw err
        await delay(SAVED_CODE_RETRY_MS)
      }
    }
  }
  for (let i = 0; i < NEW_CODE_ATTEMPTS; i++) {
    try {
      return await transport.createHost(generateRoomCode())
    } catch (err) {
      if (!isCodeTaken(err)) throw err
    }
  }
  throw new TransportError('connection-failed')
}

function teardown() {
  stopBots?.()
  stopBots = null
  unsubs.forEach((unsub) => unsub())
  unsubs = []
  timers.forEach(clearInterval)
  timers = []
  host?.close()
  host = null
  peerOfPlayer.clear()
  playerOfPeer.clear()
  lastSentView.clear()
}

/** Sends every connected phone its current view, if it changed. */
function syncViews(room: RoomState) {
  const now = Date.now()
  for (const [playerId, peerId] of peerOfPlayer) {
    const player = room.players.find((p) => p.id === playerId)
    if (!player) continue
    const message: HostMessage = { type: 'view', view: game.phoneView(room, playerId, now), score: player.score }
    const json = JSON.stringify(message)
    if (lastSentView.get(playerId) === json) continue
    lastSentView.set(playerId, json)
    host?.send(peerId, message)
  }
}

export const useHostStore = create<HostStore>((set, get) => {
  const setRoom = (room: RoomState) => {
    const prev = get().room
    if (room === prev) return
    set({ room })
    saveRoom(room)
    // Heartbeats only touch lastSeen; skip the view diff for them.
    if (!prev || room.players !== prev.players || room.game !== prev.game || room.phase !== prev.phase) {
      syncViews(room)
    }
  }

  const sendTo = (playerId: string, message: HostMessage) => {
    const peerId = peerOfPlayer.get(playerId)
    if (peerId) host?.send(peerId, message)
  }

  function handleMessage(peerId: string, data: unknown) {
    const room = get().room
    const msg = parseClientMessage(data)
    if (!room || !host || !msg) return

    switch (msg.type) {
      case 'join': {
        const result = lobby.joinRoom(room, msg, Date.now())
        if (!result.ok) {
          host.send(peerId, { type: 'rejected', reason: result.reason })
          return
        }
        const previousPeer = peerOfPlayer.get(msg.playerId)
        if (previousPeer && previousPeer !== peerId) {
          host.send(previousPeer, { type: 'replaced' })
          playerOfPeer.delete(previousPeer)
          host.disconnect(previousPeer)
        }
        peerOfPlayer.set(msg.playerId, peerId)
        playerOfPeer.set(peerId, msg.playerId)
        lastSentView.delete(msg.playerId)
        host.send(peerId, {
          type: 'welcome',
          player: lobby.toPlayerView(result.player),
          phase: result.state.phase,
          resumed: result.resumed,
        })
        setRoom(result.state)
        if (!result.resumed) playJoinSound()
        return
      }
      case 'ping': {
        const playerId = playerOfPeer.get(peerId)
        if (!playerId) return
        setRoom(lobby.touchPlayer(room, playerId, Date.now()))
        host.send(peerId, { type: 'pong' })
        return
      }
      default: {
        const playerId = playerOfPeer.get(peerId)
        if (playerId) setRoom(game.handleIntent(room, playerId, msg, Date.now()))
      }
    }
  }

  function handleDisconnect(peerId: string) {
    const playerId = playerOfPeer.get(peerId)
    playerOfPeer.delete(peerId)
    if (!playerId || peerOfPlayer.get(playerId) !== peerId) return
    peerOfPlayer.delete(playerId)
    lastSentView.delete(playerId)
    const room = get().room
    if (room) setRoom(lobby.disconnectPlayer(room, playerId))
  }

  /** Runs a pure update on the current room, if there is one. */
  const update = (fn: (room: RoomState, now: number) => RoomState) => {
    const room = get().room
    if (room) setRoom(fn(room, Date.now()))
  }

  return {
    status: 'idle',
    room: null,
    setup: loadSetup(),
    // After a reload during a game, go straight back to it.
    building: loadSavedRoom() === null,

    setSetup(setup) {
      set({ setup })
      saveSetup(setup)
    },

    finishBuilding() {
      set({ building: false })
      void get().open()
    },

    editSetup() {
      set({ building: true })
    },

    testMode: loadTestMode(),
    toggleTestMode() {
      const testMode = !get().testMode
      set({ testMode })
      saveTestMode(testMode)
    },

    botCount: 0,
    setBotCount(botCount) {
      set({ botCount })
    },

    musicSource: 'deezer',
    localTracks: [],
    localSkipped: 0,

    setMusicSource(musicSource) {
      set({ musicSource })
    },

    setLocalFiles(files) {
      const { tracks, skipped } = registerLocalFiles(files)
      set({ localTracks: tracks, localSkipped: skipped, musicSource: 'local' })
    },

    async open() {
      if (get().status === 'opening' || get().status === 'open') return
      set({ status: 'opening' })
      const saved = loadSavedRoom()
      try {
        host = await claimRoom(saved)
      } catch {
        set({ status: 'error' })
        return
      }
      const room =
        saved && saved.code === host.roomCode ? lobby.disconnectAll(saved) : lobby.createRoom(host.roomCode)
      // Dev bots connect through a loopback wrapped around the real transport.
      let launchBots: (() => void) | null = null
      if (import.meta.env.DEV && get().botCount > 0) {
        const [{ withLoopback }, { startBots }] = await Promise.all([import('../net/loopback'), import('../dev/bots')])
        const hub = withLoopback(host)
        host = hub.transport
        launchBots = () => (stopBots = startBots(hub, get().botCount, () => get().room))
      }
      unsubs = [host.onMessage(handleMessage), host.onDisconnect(handleDisconnect)]
      timers = [
        setInterval(() => update((r, now) => lobby.sweepStale(r, now)), SWEEP_INTERVAL_MS),
        setInterval(() => update(game.tick), TICK_INTERVAL_MS),
      ]
      set({ status: 'open' })
      setRoom(room)
      launchBots?.()
    },

    kick(playerId) {
      sendTo(playerId, { type: 'kicked' })
      const peerId = peerOfPlayer.get(playerId)
      if (peerId) {
        peerOfPlayer.delete(playerId)
        playerOfPeer.delete(peerId)
        lastSentView.delete(playerId)
        setTimeout(() => host?.disconnect(peerId), KICK_CLOSE_DELAY_MS)
      }
      update((room) => lobby.kickPlayer(room, playerId))
    },

    start() {
      const { room, setup, musicSource, localTracks, testMode } = get()
      if (!room || !lobby.canStart(room)) return
      const plan = buildGamePlan(testMode ? testRunSetup(setup) : setup, {
        packs: catalog,
        used: loadUsed(),
        // Test mode: one player's worth, so "per player" rounds also get a single question.
        playerCount: testMode ? 1 : room.players.filter((p) => p.connected).length,
        random: Math.random,
        localTracks: musicSource === 'local' ? localTracks : undefined,
      })
      if (plan.rounds.length === 0) return
      // Test runs don't use up questions for real games.
      if (!testMode) markUsed(plan.picked)
      update((r) => game.beginGame(r, plan.rounds))
    },

    act(action) {
      update((room, now) => game.handleHostAction(room, action, now))
    },

    backToLobby() {
      update(game.backToLobby)
    },

    close() {
      teardown()
      saveRoom(null)
      set({ status: 'idle', room: null })
    },
  }
})
