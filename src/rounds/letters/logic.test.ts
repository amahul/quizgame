import { describe, expect, it } from 'vitest'
import type { Player } from '../../game/lobby'
import type { RoundContext } from '../../game/round'
import {
  FLIP_INTERVAL_MS,
  flipIntervalFor,
  letterPositions,
  letters,
  MAX_POINTS,
  MIN_POINTS,
  pointsAt,
  revealedPositions,
  seededShuffle,
  statusOf,
  type LettersItem,
  type LettersState,
} from './logic'

const items: LettersItem[] = [
  { prompt: 'Borta bra men…', answer: 'hemma bäst', aliases: ['hemma är bäst'], theme: 'Svenska ordspråk' },
  { prompt: 'Yrke', answer: 'Pilot', theme: 'Yrken' },
]

const player = (id: string, connected = true): Player => ({
  id,
  name: id,
  avatar: { emoji: '🦊', color: 'red' },
  score: 0,
  connected,
})

const T0 = 1_000_000
const ctx = (now = T0, players = [player('anna'), player('bo')]): RoundContext => ({ players, now })
const start = () => letters.start({ items }, ctx())
const guess = (s: LettersState, id: string, text: string, now = T0, c = ctx(now)) =>
  letters.onIntent(s, id, { type: 'letters-guess', questionIndex: s.index, text }, c)

describe('letterPositions', () => {
  it('hides letters and digits but not spaces or punctuation', () => {
    expect(letterPositions('hemma bäst')).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9])
    expect(letterPositions("I'll be back!")).toEqual([0, 2, 3, 5, 6, 8, 9, 10, 11])
  })
})

describe('seededShuffle', () => {
  it('is a deterministic permutation', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6], 42)
    expect(a).toEqual(seededShuffle([1, 2, 3, 4, 5, 6], 42))
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('letters round', () => {
  it('starts with every tile hidden', () => {
    const s = start()
    expect(s).toMatchObject({ index: 0, stage: 'playing', revealedCount: 0, startedAt: T0 })
    expect([...s.flipOrder].sort((a, b) => a - b)).toEqual(letterPositions('hemma bäst'))
  })

  it('flips one tile every interval, regardless of tick jitter', () => {
    const s = start()
    expect(letters.onTick(s, ctx(T0 + FLIP_INTERVAL_MS - 1)).state.revealedCount).toBe(0)
    expect(letters.onTick(s, ctx(T0 + FLIP_INTERVAL_MS)).state.revealedCount).toBe(1)
    const later = letters.onTick(s, ctx(T0 + 3.5 * FLIP_INTERVAL_MS)).state
    expect(later.revealedCount).toBe(3)
    expect(revealedPositions(later)).toEqual(new Set(s.flipOrder.slice(0, 3)))
  })

  it('ends when every tile is revealed', () => {
    const s = start()
    const end = letters.onTick(s, ctx(T0 + 9 * FLIP_INTERVAL_MS)).state
    expect(end).toMatchObject({ stage: 'reveal', revealedCount: 9 })
  })

  it('scores 1000 at the start, falling linearly to 100 with one tile left', () => {
    const s = start() // 9 tiles: 100 points once 8 have flipped
    expect(pointsAt(s, T0)).toBe(MAX_POINTS)
    expect(pointsAt(s, T0 + 4 * FLIP_INTERVAL_MS)).toBe(550)
    expect(pointsAt(s, T0 + 8 * FLIP_INTERVAL_MS)).toBe(MIN_POINTS)
    expect(pointsAt(s, T0 + 100 * FLIP_INTERVAL_MS)).toBe(MIN_POINTS)
  })

  it('awards points immediately for a correct guess, accepting aliases', () => {
    const update = guess(start(), 'anna', 'Hemma är bäst', T0 + 2 * FLIP_INTERVAL_MS)
    expect(update.scoreDeltas).toEqual({ anna: 775 })
    expect(statusOf(update.state, 'anna')).toBe('correct')
    expect(update.state.stage).toBe('playing')
  })

  it('locks a player out after a wrong guess', () => {
    let s = guess(start(), 'anna', 'borta bäst').state
    expect(statusOf(s, 'anna')).toBe('locked')
    const retry = guess(s, 'anna', 'hemma bäst')
    expect(retry.scoreDeltas).toBeUndefined()
    s = retry.state
    expect(s.guesses.anna).toMatchObject({ correct: false, points: 0 })
  })

  it('ends when all connected players are done', () => {
    let s = guess(start(), 'anna', 'hemma bäst').state
    expect(s.stage).toBe('playing')
    s = guess(s, 'bo', 'fel').state
    expect(s).toMatchObject({ stage: 'reveal', revealedCount: 9 })
  })

  it('does not wait for disconnected players', () => {
    const players = [player('anna'), player('bo', false)]
    const s = guess(start(), 'anna', 'hemma bäst', T0, ctx(T0, players)).state
    expect(s.stage).toBe('reveal')
  })

  it('rejects guesses after the last tile has flipped, even before a tick', () => {
    const update = guess(start(), 'anna', 'hemma bäst', T0 + 9 * FLIP_INTERVAL_MS)
    expect(update.scoreDeltas).toBeUndefined()
    expect(update.state.stage).toBe('reveal')
  })

  it('ignores empty, stale and unknown-player guesses', () => {
    const s = start()
    expect(guess(s, 'anna', '   ').state).toBe(s)
    expect(guess(s, 'ghost', 'hemma bäst').state).toBe(s)
    expect(letters.onIntent(s, 'anna', { type: 'letters-guess', questionIndex: 1, text: 'pilot' }, ctx()).state).toBe(s)
  })

  it('lets the host reveal early, then moves on and finishes', () => {
    let s = letters.onHostAction(start(), { type: 'letters-reveal' }, ctx()).state
    expect(s.stage).toBe('reveal')
    s = letters.onHostAction(s, { type: 'letters-next' }, ctx(T0 + 50_000)).state
    expect(s).toMatchObject({ index: 1, stage: 'playing', revealedCount: 0, startedAt: T0 + 50_000, guesses: {} })
    expect(s.flipOrder).toHaveLength(5)
    s = letters.onHostAction(s, { type: 'letters-reveal' }, ctx()).state
    s = letters.onHostAction(s, { type: 'letters-next' }, ctx()).state
    expect(letters.isFinished(s)).toBe(true)
  })

  it('flips long answers faster so a whole proverb takes at most ~36 s', () => {
    expect(flipIntervalFor(9)).toBe(FLIP_INTERVAL_MS)
    expect(flipIntervalFor(30)).toBe(1200)
    expect(flipIntervalFor(80)).toBe(1000)

    const proverb = { prompt: 'Stora saker tar tid', answer: 'Rom byggdes inte på en dag', theme: 'Svenska ordspråk' }
    const s = letters.start({ items: [proverb] }, ctx())
    expect(s.flipIntervalMs).toBe(flipIntervalFor(letterPositions(proverb.answer).length))
    expect(letters.onTick(s, ctx(T0 + 2 * s.flipIntervalMs)).state.revealedCount).toBe(2)
    expect(pointsAt(s, T0 + (s.flipOrder.length - 1) * s.flipIntervalMs)).toBe(MIN_POINTS)
  })

  it('never shows the answer on phones before the reveal', () => {
    let s = start()
    const view = letters.playerView(s, 'anna', ctx())
    expect(view).toEqual({
      kind: 'letters-guess',
      questionIndex: 0,
      theme: 'Svenska ordspråk',
      prompt: 'Borta bra men…',
      status: 'open',
      points: 0,
    })
    expect(JSON.stringify(view)).not.toContain('hemma')

    s = guess(s, 'anna', 'hemma bäst').state
    expect(letters.playerView(s, 'anna', ctx())).toMatchObject({ status: 'correct', points: 1000 })
    s = letters.onHostAction(s, { type: 'letters-reveal' }, ctx()).state
    expect(letters.playerView(s, 'bo', ctx())).toEqual({ kind: 'letters-result', status: 'open', points: 0, answer: 'hemma bäst' })
  })

  it('parses guesses and truncates long ones', () => {
    const parsed = letters.parseIntent({ type: 'letters-guess', questionIndex: 0, text: 'x'.repeat(300) })
    expect(parsed?.text).toHaveLength(80)
    expect(letters.parseIntent({ type: 'letters-guess', questionIndex: 0 })).toBeNull()
    expect(letters.parseIntent({ type: 'pass-answer', questionIndex: 0, text: 'x' })).toBeNull()
  })
})
