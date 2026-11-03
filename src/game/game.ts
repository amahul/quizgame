// Game flow on top of the lobby: for each round, an intro, the round itself and
// standings. Round-specific rules are delegated to the definitions in src/rounds.
import {
  ROUNDS,
  type ActiveRound,
  type AnyRound,
  type RoundAction,
  type RoundIntent,
  type RoundSetup,
  type RoundTitleKey,
  type RoundView,
} from '../rounds'
import { canStart, type Player, type RoomState } from './lobby'
import type { RoundContext, RoundUpdate } from './round'

export type GameStage = 'intro' | 'round' | 'standings'

export interface GameState {
  rounds: RoundSetup[]
  /** Index into `rounds`. */
  roundIndex: number
  stage: GameStage
  /** Set while stage is 'round' (and kept for 'standings'). */
  round: ActiveRound | null
  /** When the host paused the game; null while running. Clocks stop while paused. */
  pausedAt: number | null
}

/** Host controls that work in every round, for fixing mistakes mid-game. */
export type HostControlAction =
  | { type: 'pause' }
  | { type: 'resume' }
  /** Move on to the next question of the current round. */
  | { type: 'skip' }
  | { type: 'adjust-score'; playerId: string; delta: number }

export type GameAction = { type: 'continue' } | HostControlAction | RoundAction

/** Everything a phone can be told to show. */
export type PhoneView =
  | { kind: 'lobby' }
  | { kind: 'intro'; titleKey: RoundTitleKey }
  | { kind: 'standings'; rank: number; final: boolean }
  | { kind: 'paused' }
  | RoundView

export function beginGame(room: RoomState, rounds: RoundSetup[]): RoomState {
  if (!canStart(room) || rounds.length === 0) return room
  return { ...room, phase: 'playing', game: { rounds, roundIndex: 0, stage: 'intro', round: null, pausedAt: null } }
}

export function isFinalRound(game: GameState): boolean {
  return game.roundIndex === game.rounds.length - 1
}

/** Highest score first; join order breaks ties. Equal scores share a rank. */
export function standings(players: readonly Player[]): { player: Player; rank: number }[] {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  return sorted.map((player) => ({ player, rank: sorted.findIndex((p) => p.score === player.score) + 1 }))
}

function applyScores(room: RoomState, deltas: Record<string, number> | undefined): RoomState {
  if (!deltas || Object.keys(deltas).length === 0) return room
  const players = room.players.map((p) => (Object.hasOwn(deltas, p.id) ? { ...p, score: p.score + deltas[p.id] } : p))
  return { ...room, players }
}

/** Stores the round, moving on to standings once it's finished. */
function placeRound(room: RoomState, game: GameState, round: ActiveRound): RoomState {
  const finished = ROUNDS[round.type].isFinished(round.state)
  return {
    ...room,
    phase: finished && isFinalRound(game) ? 'finished' : room.phase,
    game: { ...game, stage: finished ? 'standings' : 'round', round },
  }
}

function withRound(
  room: RoomState,
  now: number,
  fn: (def: AnyRound, state: unknown, ctx: RoundContext) => RoundUpdate<unknown>,
): RoomState {
  const { game } = room
  if (!game || game.stage !== 'round' || !game.round) return room
  const ctx = { players: room.players, now }
  const update = fn(ROUNDS[game.round.type], game.round.state, ctx)
  if (update.state === game.round.state && !update.scoreDeltas) return room
  const round = { ...game.round, state: update.state } as ActiveRound
  return placeRound(applyScores(room, update.scoreDeltas), game, round)
}

export const isPaused = (room: RoomState) => room.game?.pausedAt != null

export function handleIntent(room: RoomState, playerId: string, intent: RoundIntent, now: number): RoomState {
  if (isPaused(room)) return room
  return withRound(room, now, (def, state, ctx) => {
    // Re-parse so an intent for a different round type is dropped here.
    const own = def.parseIntent(intent as unknown as Record<string, unknown>)
    return own ? def.onIntent(state, playerId, own, ctx) : { state }
  })
}

export function handleHostAction(room: RoomState, action: GameAction, now: number): RoomState {
  const { game } = room
  if (!game) return room
  switch (action.type) {
    case 'pause':
      // `== null`: games saved before pausing existed have no pausedAt at all.
      return game.pausedAt == null ? { ...room, game: { ...game, pausedAt: now } } : room
    case 'resume': {
      if (game.pausedAt == null) return room
      const pausedFor = Math.max(0, now - game.pausedAt)
      const round = game.round && ({ ...game.round, state: ROUNDS[game.round.type].shiftTime(game.round.state, pausedFor) } as ActiveRound)
      return { ...room, game: { ...game, round, pausedAt: null } }
    }
    case 'skip':
      return withRound(room, now, (def, state, ctx) => def.skip(state, ctx))
    case 'adjust-score':
      return applyScores(room, { [action.playerId]: action.delta })
    case 'continue':
      break
    default:
      return withRound(room, now, (def, state, ctx) => def.onHostAction(state, action, ctx))
  }

  if (game.stage === 'intro') {
    const setup = game.rounds[game.roundIndex]
    const def = ROUNDS[setup.type]
    const round = { type: setup.type, state: def.start(setup, { players: room.players, now }) } as ActiveRound
    return placeRound(room, game, round)
  }

  if (game.stage === 'standings' && !isFinalRound(game)) {
    return { ...room, game: { ...game, roundIndex: game.roundIndex + 1, stage: 'intro', round: null } }
  }

  return room
}

export function tick(room: RoomState, now: number): RoomState {
  if (isPaused(room)) return room
  return withRound(room, now, (def, state, ctx) => def.onTick(state, ctx))
}

export function phoneView(room: RoomState, playerId: string, now: number): PhoneView {
  const { game } = room
  if (!game) return { kind: 'lobby' }
  if (game.pausedAt != null) return { kind: 'paused' }
  switch (game.stage) {
    case 'intro':
      return { kind: 'intro', titleKey: game.rounds[game.roundIndex].titleKey }
    case 'standings': {
      const rank = standings(room.players).find((s) => s.player.id === playerId)?.rank ?? room.players.length
      return { kind: 'standings', rank, final: isFinalRound(game) }
    }
    case 'round': {
      const round = game.round!
      return ROUNDS[round.type].playerView(round.state, playerId, { players: room.players, now })
    }
  }
}
