// "Närmast vinner": everyone types a number. Exactly right scores big, the closest
// and second closest guesses score too, everyone else gets nothing. Like trivia it
// reveals after a drumroll once everyone has guessed, time runs out or the host asks.
import type { RoundContext, RoundDefinition, RoundUpdate } from '../../game/round'

export const EXACT_POINTS = 500
export const CLOSEST_POINTS = 200
export const RUNNER_UP_POINTS = 100
export const AUTO_REVEAL_DELAY_MS = 1_500
/** Time to guess each question. */
export const QUESTION_MS = 30_000
/** Guesses beyond this are typos or trolling; numbers in the packs stay far below. */
export const MAX_GUESS = 1e12

export interface ClosestQuestion {
  question: string
  answer: number
  /** Shown after numbers, e.g. "km" or "%". */
  unit?: string
  /** The answer is a year, so it's printed without a thousands separator. */
  year?: boolean
  fact?: string
}

export interface ClosestSetup {
  questions: ClosestQuestion[]
}

export interface ClosestState {
  questions: ClosestQuestion[]
  index: number
  stage: 'question' | 'reveal' | 'done'
  /** Guess per player id. Guesses can't be changed. */
  guesses: Record<string, number>
  /** When the reveal happens (after the drumroll), or null if none is scheduled. */
  revealAt: number | null
  /** The host asked for the reveal or time ran out, so a newcomer joining does not cancel it. */
  revealForced: boolean
  /** When guessing closes. */
  deadline: number
}

export type ClosestPlace = 'exact' | 'closest' | 'runnerUp'

export type ClosestIntent = { type: 'closest-guess'; questionIndex: number; value: number }

export type ClosestAction = { type: 'closest-reveal' } | { type: 'closest-next' }

export type ClosestView =
  | {
      kind: 'closest-question'
      questionIndex: number
      question: string
      unit?: string
      year?: boolean
      guessed: number | null
      msLeft: number
    }
  | {
      kind: 'closest-result'
      questionIndex: number
      guessed: number | null
      answer: number
      unit?: string
      year?: boolean
      place: ClosestPlace | null
      points: number
    }

export const PLACE_POINTS: Record<ClosestPlace, number> = {
  exact: EXACT_POINTS,
  closest: CLOSEST_POINTS,
  runnerUp: RUNNER_UP_POINTS,
}

/** Reads what a player typed: "1 665", "42,195" and "-3" all work. Null if it isn't a number. */
export function parseGuess(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, '').replace(',', '.').replace('−', '-')
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && Math.abs(value) <= MAX_GUESS ? value : null
}

/** Rounded so that 42.2 − 42.195 and 42.19 − 42.195 count as the same distance. */
const distance = (guess: number, answer: number) => Math.round(Math.abs(guess - answer) * 1e6) / 1e6

/**
 * Who placed: an exact guess is "exact", the smallest distance is "closest" and the
 * next smallest "runnerUp". Ties share a place, so several players can score.
 */
export function placings(guesses: Record<string, number>, answer: number): Record<string, ClosestPlace> {
  const distances = [...new Set(Object.values(guesses).map((g) => distance(g, answer)))].sort((a, b) => a - b)
  const places: Record<string, ClosestPlace> = {}
  for (const [playerId, guess] of Object.entries(guesses)) {
    const d = distance(guess, answer)
    if (d === 0) places[playerId] = 'exact'
    else if (d === distances[0]) places[playerId] = 'closest'
    else if (d === distances[1]) places[playerId] = 'runnerUp'
  }
  return places
}

/** Every guess of the current question, closest first. */
export function rankedGuesses(state: ClosestState): { playerId: string; guess: number; place: ClosestPlace | null }[] {
  const { answer } = state.questions[state.index]
  const places = placings(state.guesses, answer)
  return Object.entries(state.guesses)
    .map(([playerId, guess]) => ({ playerId, guess, place: places[playerId] ?? null }))
    .sort((a, b) => distance(a.guess, answer) - distance(b.guess, answer))
}

export function hasGuessed(state: ClosestState, playerId: string): boolean {
  return Object.hasOwn(state.guesses, playerId)
}

function everyoneGuessed(state: ClosestState, ctx: RoundContext): boolean {
  const connected = ctx.players.filter((p) => p.connected)
  return connected.length > 0 && connected.every((p) => hasGuessed(state, p.id))
}

function reveal(state: ClosestState): RoundUpdate<ClosestState> {
  const places = placings(state.guesses, state.questions[state.index].answer)
  const scoreDeltas: Record<string, number> = {}
  for (const [playerId, place] of Object.entries(places)) scoreDeltas[playerId] = PLACE_POINTS[place]
  return { state: { ...state, stage: 'reveal', revealAt: null, revealForced: false }, scoreDeltas }
}

/** Schedules, cancels or performs the reveal. */
function settle(state: ClosestState, ctx: RoundContext): RoundUpdate<ClosestState> {
  if (state.stage !== 'question') return { state }
  if (state.revealAt !== null && ctx.now >= state.revealAt) return reveal(state)
  if (state.revealForced) return { state }
  if (ctx.now >= state.deadline) {
    // Time's up: drumroll, then reveal, whoever is still thinking.
    return { state: { ...state, revealAt: ctx.now + AUTO_REVEAL_DELAY_MS, revealForced: true } }
  }
  if (!everyoneGuessed(state, ctx)) {
    // Someone new joined (or reconnected) before the reveal: wait for them too.
    return { state: state.revealAt === null ? state : { ...state, revealAt: null } }
  }
  if (state.revealAt === null) return { state: { ...state, revealAt: ctx.now + AUTO_REVEAL_DELAY_MS } }
  return { state }
}

function atQuestion(state: ClosestState, index: number, now: number): ClosestState {
  return {
    ...state,
    index,
    stage: index < state.questions.length ? 'question' : 'done',
    guesses: {},
    revealAt: null,
    revealForced: false,
    deadline: now + QUESTION_MS,
  }
}

export const closest: RoundDefinition<ClosestSetup, ClosestState, ClosestIntent, ClosestAction, ClosestView> = {
  start({ questions }, ctx) {
    return atQuestion(
      { questions, index: 0, stage: 'question', guesses: {}, revealAt: null, revealForced: false, deadline: 0 },
      0,
      ctx.now,
    )
  },

  parseIntent(data) {
    if (data.type !== 'closest-guess') return null
    const { questionIndex, value } = data
    if (!Number.isInteger(questionIndex) || typeof value !== 'number') return null
    if (!Number.isFinite(value) || Math.abs(value) > MAX_GUESS) return null
    return { type: 'closest-guess', questionIndex: questionIndex as number, value }
  },

  onIntent(state, playerId, intent, ctx) {
    if (state.stage !== 'question' || intent.questionIndex !== state.index) return { state }
    if (ctx.now >= state.deadline) return settle(state, ctx)
    if (hasGuessed(state, playerId) || !ctx.players.some((p) => p.id === playerId)) return { state }
    return settle({ ...state, guesses: { ...state.guesses, [playerId]: intent.value } }, ctx)
  },

  onHostAction(state, action, ctx) {
    switch (action.type) {
      case 'closest-reveal':
        // Start the drumroll now (or keep an earlier one that is already running).
        if (state.stage !== 'question') return { state }
        return {
          state: {
            ...state,
            revealAt: Math.min(state.revealAt ?? Infinity, ctx.now + AUTO_REVEAL_DELAY_MS),
            revealForced: true,
          },
        }
      case 'closest-next':
        return state.stage === 'reveal' ? { state: atQuestion(state, state.index + 1, ctx.now) } : { state }
      default:
        return { state }
    }
  },

  onTick: settle,

  skip: (state, ctx) => ({ state: atQuestion(state, state.index + 1, ctx.now) }),

  shiftTime: (state, ms) => ({
    ...state,
    deadline: state.deadline + ms,
    revealAt: state.revealAt === null ? null : state.revealAt + ms,
  }),

  isFinished: (state) => state.stage === 'done',

  playerView(state, playerId, ctx) {
    const guessed = hasGuessed(state, playerId) ? state.guesses[playerId] : null
    const { question, answer, unit, year } = state.questions[state.index]
    if (state.stage === 'reveal') {
      const place = placings(state.guesses, answer)[playerId] ?? null
      return {
        kind: 'closest-result',
        questionIndex: state.index,
        guessed,
        answer,
        unit,
        year,
        place,
        points: place ? PLACE_POINTS[place] : 0,
      }
    }
    return {
      kind: 'closest-question',
      questionIndex: state.index,
      question,
      unit,
      year,
      guessed,
      msLeft: Math.max(0, state.deadline - ctx.now),
    }
  },
}
