// The contract every round type implements. Round logic lives in
// src/rounds/<type>/logic.ts and follows the same purity rules as src/game:
// no React, DOM, network or clocks. Time arrives through RoundContext.now.
import type { Player } from './lobby'

export interface RoundContext {
  /** All players in join order, with current scores and connection state. */
  players: readonly Player[]
  now: number
}

export interface RoundUpdate<State> {
  state: State
  /** Points to add (negative to subtract) per player id. The game engine applies them. */
  scoreDeltas?: Record<string, number>
}

export interface RoundDefinition<Setup, State, Intent extends { type: string }, Action extends { type: string }, View> {
  start(setup: Setup, ctx: RoundContext): State
  /** Validates untrusted phone data. Returns null if it isn't a well-formed intent of this round. */
  parseIntent(data: Record<string, unknown>): Intent | null
  /** A phone's intent. Ignore anything that doesn't fit the current state (stale, wrong player…). */
  onIntent(state: State, playerId: string, intent: Intent, ctx: RoundContext): RoundUpdate<State>
  /** A button press on the host screen. Must ignore actions belonging to other round types. */
  onHostAction(state: State, action: Action, ctx: RoundContext): RoundUpdate<State>
  /** Called a few times a second, for time-based transitions. */
  onTick(state: State, ctx: RoundContext): RoundUpdate<State>
  /** Host override: move on to the next question without awarding anything more. */
  skip(state: State, ctx: RoundContext): RoundUpdate<State>
  /** After a pause of `ms`, push every timestamp forward so no time is lost. */
  shiftTime(state: State, ms: number): State
  isFinished(state: State): boolean
  /** What one phone should show. Must never leak answers before they're revealed. */
  playerView(state: State, playerId: string, ctx: RoundContext): View
}

/** Connected players, falling back to everyone if nobody is connected. */
export function activePlayers(players: readonly Player[]): readonly Player[] {
  const connected = players.filter((p) => p.connected)
  return connected.length > 0 ? connected : players
}
