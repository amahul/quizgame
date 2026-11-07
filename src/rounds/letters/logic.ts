// "Bokstavsjakt": the answer is hidden as letter tiles that flip one at a time.
// Guess early for more points; a wrong guess locks you out of the question.
// Used for both "Gissa ordspråket" and "Gissa ordet – teman", depending on the pack.
import { matchAnswer } from '../../game/matcher'
import type { RoundContext, RoundDefinition, RoundUpdate } from '../../game/round'

/** One tile every two seconds… */
export const FLIP_INTERVAL_MS = 2_000
/** …but long answers (whole proverbs) flip faster, so the reveal takes at most this long… */
export const MAX_REVEAL_MS = 36_000
/** …and never faster than one tile a second. */
export const MIN_FLIP_INTERVAL_MS = 1_000
/** The gaps grow as more tiles show: the last one is this much longer than the first. */
export const SLOWDOWN = 1
export const MAX_POINTS = 1000
export const MIN_POINTS = 100
export const MAX_GUESS_LENGTH = 80

export interface LettersItem {
  /** Shown from the start: the beginning of a proverb, or a clue. */
  prompt: string
  answer: string
  /** Other accepted spellings or wordings. */
  aliases?: string[]
  theme: string
}

export interface LettersSetup {
  items: LettersItem[]
}

export interface Guess {
  correct: boolean
  /** When the guess arrived (ms timestamp). */
  at: number
  points: number
}

export interface LettersState {
  items: LettersItem[]
  index: number
  stage: 'playing' | 'reveal' | 'done'
  /** Positions in the answer of the hideable characters, in the order they flip. */
  flipOrder: number[]
  revealedCount: number
  /** Time between flips for the current item (shorter for long answers). */
  flipIntervalMs: number
  startedAt: number
  /** One guess per player per question. */
  guesses: Record<string, Guess>
}

export type LettersIntent = { type: 'letters-guess'; questionIndex: number; text: string }

export type LettersAction = { type: 'letters-reveal' } | { type: 'letters-next' }

export type LetterStatus = 'open' | 'correct' | 'locked'

export type LettersView =
  | { kind: 'letters-guess'; questionIndex: number; theme: string; prompt: string; status: LetterStatus; points: number }
  | { kind: 'letters-result'; status: LetterStatus; points: number; answer: string }

/** Letters and digits are hidden; spaces and punctuation are always visible. */
export const isHideable = (char: string) => /[\p{L}\p{N}]/u.test(char)

export function letterPositions(answer: string): number[] {
  return [...answer].flatMap((char, i) => (isHideable(char) ? [i] : []))
}

/** Small deterministic PRNG, so the flip order is pure and reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const random = mulberry32(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function flipIntervalFor(tiles: number): number {
  return Math.min(FLIP_INTERVAL_MS, Math.max(MIN_FLIP_INTERVAL_MS, Math.floor(MAX_REVEAL_MS / Math.max(1, tiles))))
}

/** States saved before the interval was per item don't have it. */
const intervalOf = (state: LettersState) => state.flipIntervalMs ?? FLIP_INTERVAL_MS

/**
 * Ms after the start when tile `n` (1-based) flips. The first gap is the item's
 * interval and each later one is a bit longer, so the end slows down.
 */
export function flipAt(state: LettersState, n: number): number {
  const steps = Math.max(1, state.flipOrder.length - 1)
  return Math.round(intervalOf(state) * (n + (SLOWDOWN * n * (n - 1)) / (2 * steps)))
}

function flipsDue(state: LettersState, now: number): number {
  const tiles = state.flipOrder.length
  let n = state.revealedCount
  while (n < tiles && flipAt(state, n + 1) <= now - state.startedAt) n++
  return n
}

export function revealedPositions(state: LettersState): Set<number> {
  return new Set(state.flipOrder.slice(0, state.revealedCount))
}

export const statusOf = (state: LettersState, playerId: string): LetterStatus => {
  if (!Object.hasOwn(state.guesses, playerId)) return 'open'
  return state.guesses[playerId].correct ? 'correct' : 'locked'
}

/**
 * Points for a correct guess right now: 1000 at the start, falling linearly to 100
 * when only one tile is left hidden.
 */
export function pointsAt(state: LettersState, now: number): number {
  const tiles = state.flipOrder.length
  if (tiles <= 1) return MAX_POINTS
  const progress = Math.min(1, Math.max(0, (now - state.startedAt) / flipAt(state, tiles - 1)))
  return Math.round(MAX_POINTS - (MAX_POINTS - MIN_POINTS) * progress)
}

function atItem(state: LettersState, index: number, now: number): LettersState {
  const item = state.items[index]
  const positions = item ? letterPositions(item.answer) : []
  return {
    ...state,
    index,
    stage: item ? 'playing' : 'done',
    flipOrder: seededShuffle(positions, now + index),
    flipIntervalMs: flipIntervalFor(positions.length),
    revealedCount: 0,
    startedAt: now,
    guesses: {},
  }
}

const reveal = (state: LettersState): LettersState => ({ ...state, stage: 'reveal', revealedCount: state.flipOrder.length })

function everyoneDone(state: LettersState, ctx: RoundContext): boolean {
  const connected = ctx.players.filter((p) => p.connected)
  return connected.length > 0 && connected.every((p) => Object.hasOwn(state.guesses, p.id))
}

/** Flips the tiles that are due and ends the question when nothing is left to play for. */
function settle(state: LettersState, ctx: RoundContext): RoundUpdate<LettersState> {
  if (state.stage !== 'playing') return { state }
  const tiles = state.flipOrder.length
  const due = flipsDue(state, ctx.now)
  const flipped = due > state.revealedCount ? { ...state, revealedCount: due } : state
  return { state: due >= tiles || everyoneDone(flipped, ctx) ? reveal(flipped) : flipped }
}

export const letters: RoundDefinition<LettersSetup, LettersState, LettersIntent, LettersAction, LettersView> = {
  start({ items }, ctx) {
    return atItem(
      { items, index: 0, stage: 'playing', flipOrder: [], revealedCount: 0, flipIntervalMs: FLIP_INTERVAL_MS, startedAt: 0, guesses: {} },
      0,
      ctx.now,
    )
  },

  parseIntent(data) {
    if (data.type !== 'letters-guess' || !Number.isInteger(data.questionIndex) || typeof data.text !== 'string') return null
    return { type: 'letters-guess', questionIndex: data.questionIndex as number, text: data.text.slice(0, MAX_GUESS_LENGTH) }
  },

  onIntent(state, playerId, intent, ctx) {
    // Catch up on flips first, so a guess after the last tile doesn't count.
    const current = settle(state, ctx).state
    if (current.stage !== 'playing' || intent.questionIndex !== current.index) return { state: current }
    if (Object.hasOwn(current.guesses, playerId) || !ctx.players.some((p) => p.id === playerId)) return { state: current }
    const text = intent.text.trim()
    if (!text) return { state: current }

    const item = current.items[current.index]
    const correct = matchAnswer(text, [item.answer, ...(item.aliases ?? [])]).correct
    const points = correct ? pointsAt(current, ctx.now) : 0
    const guessed = { ...current, guesses: { ...current.guesses, [playerId]: { correct, at: ctx.now, points } } }
    return { state: settle(guessed, ctx).state, scoreDeltas: correct ? { [playerId]: points } : undefined }
  },

  onHostAction(state, action, ctx) {
    switch (action.type) {
      case 'letters-reveal':
        return { state: state.stage === 'playing' ? reveal(state) : state }
      case 'letters-next':
        return { state: state.stage === 'reveal' ? atItem(state, state.index + 1, ctx.now) : state }
      default:
        return { state }
    }
  },

  onTick: settle,

  skip: (state, ctx) => ({ state: atItem(state, state.index + 1, ctx.now) }),

  // Guess times shift too, so "how fast" on the reveal stays right.
  shiftTime: (state, ms) => ({
    ...state,
    startedAt: state.startedAt + ms,
    guesses: Object.fromEntries(Object.entries(state.guesses).map(([id, g]) => [id, { ...g, at: g.at + ms }])),
  }),

  isFinished: (state) => state.stage === 'done',

  playerView(state, playerId) {
    const item = state.items[state.index]
    const status = statusOf(state, playerId)
    const points = Object.hasOwn(state.guesses, playerId) ? state.guesses[playerId].points : 0
    if (state.stage === 'reveal') return { kind: 'letters-result', status, points, answer: item.answer }
    return { kind: 'letters-guess', questionIndex: state.index, theme: item.theme, prompt: item.prompt, status, points }
  },
}
