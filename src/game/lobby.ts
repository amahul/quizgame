// Room and player state, owned by the host. Pure: every function returns a new
// state (or the same object when nothing changed) and takes time as a parameter.
import type { Avatar } from './avatars'
import type { GameState } from './game'

export const MAX_PLAYERS = 50
export const MAX_NAME_LENGTH = 16
/** A player who hasn't been heard from for this long is shown as disconnected. */
export const HEARTBEAT_TIMEOUT_MS = 10_000

export type Phase = 'lobby' | 'playing' | 'finished'

export interface Player {
  id: string
  name: string
  avatar: Avatar
  score: number
  connected: boolean
}

/** What a phone is allowed to know about its own player. */
export type PlayerView = Pick<Player, 'id' | 'name' | 'avatar' | 'score'>

export interface RoomState {
  code: string
  phase: Phase
  /** In join order. Disconnected players stay so they can come back. */
  players: Player[]
  kickedIds: string[]
  /** Last heartbeat per player id. Kept apart from `players` so pings don't re-render the lobby. */
  lastSeen: Record<string, number>
  /** Null until the host starts the game (see game.ts). */
  game: GameState | null
}

export interface JoinRequest {
  playerId: string
  name: string
  avatar: Avatar
}

export type JoinRejection = 'invalid-name' | 'name-taken' | 'room-full' | 'kicked'

export type JoinResult =
  | { ok: true; state: RoomState; player: Player; resumed: boolean }
  | { ok: false; reason: JoinRejection }

export function createRoom(code: string): RoomState {
  return { code, phase: 'lobby', players: [], kickedIds: [], lastSeen: {}, game: null }
}

/** Trims and collapses whitespace. Returns null if the result isn't an acceptable nickname. */
export function validateName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ')
  const length = [...name].length
  return length > 0 && length <= MAX_NAME_LENGTH ? name : null
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('sv') === b.toLocaleLowerCase('sv')

function updatePlayer(state: RoomState, id: string, patch: Partial<Player>): RoomState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
}

/**
 * Handles a join intent. A known playerId resumes its existing player (name, avatar
 * and score are kept, whatever the phone sent). Late joins during a game are allowed.
 */
export function joinRoom(state: RoomState, req: JoinRequest, now: number): JoinResult {
  if (state.kickedIds.includes(req.playerId)) return { ok: false, reason: 'kicked' }

  const lastSeen = { ...state.lastSeen, [req.playerId]: now }
  const existing = state.players.find((p) => p.id === req.playerId)
  if (existing) {
    const next = { ...updatePlayer(state, existing.id, { connected: true }), lastSeen }
    return { ok: true, state: next, player: { ...existing, connected: true }, resumed: true }
  }

  const name = validateName(req.name)
  if (!name) return { ok: false, reason: 'invalid-name' }
  if (state.players.some((p) => sameName(p.name, name))) return { ok: false, reason: 'name-taken' }
  if (state.players.length >= MAX_PLAYERS) return { ok: false, reason: 'room-full' }

  const player: Player = { id: req.playerId, name, avatar: req.avatar, score: 0, connected: true }
  return { ok: true, state: { ...state, players: [...state.players, player], lastSeen }, player, resumed: false }
}

/** Records a heartbeat. Marks the player connected again if they had timed out. */
export function touchPlayer(state: RoomState, playerId: string, now: number): RoomState {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return state
  const next = player.connected ? state : updatePlayer(state, playerId, { connected: true })
  return { ...next, lastSeen: { ...state.lastSeen, [playerId]: now } }
}

export function disconnectPlayer(state: RoomState, playerId: string): RoomState {
  const player = state.players.find((p) => p.id === playerId)
  if (!player?.connected) return state
  return updatePlayer(state, playerId, { connected: false })
}

/** Marks connected players whose last heartbeat is older than `timeoutMs` as disconnected. */
export function sweepStale(state: RoomState, now: number, timeoutMs = HEARTBEAT_TIMEOUT_MS): RoomState {
  const isStale = (p: Player) => p.connected && now - (state.lastSeen[p.id] ?? 0) > timeoutMs
  if (!state.players.some(isStale)) return state
  return { ...state, players: state.players.map((p) => (isStale(p) ? { ...p, connected: false } : p)) }
}

/** Marks everyone disconnected, e.g. when the host restores a room after a page reload. */
export function disconnectAll(state: RoomState): RoomState {
  return { ...state, players: state.players.map((p) => ({ ...p, connected: false })) }
}

/** Removes a player and blocks their playerId from rejoining this room. */
export function kickPlayer(state: RoomState, playerId: string): RoomState {
  if (!state.players.some((p) => p.id === playerId)) return state
  const { [playerId]: _, ...lastSeen } = state.lastSeen
  return {
    ...state,
    players: state.players.filter((p) => p.id !== playerId),
    kickedIds: [...state.kickedIds, playerId],
    lastSeen,
  }
}

export function canStart(state: RoomState): boolean {
  return state.phase === 'lobby' && state.players.some((p) => p.connected)
}

export function toPlayerView({ id, name, avatar, score }: Player): PlayerView {
  return { id, name, avatar, score }
}
