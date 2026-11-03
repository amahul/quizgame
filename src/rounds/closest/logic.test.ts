import { describe, expect, it } from 'vitest'
import type { Player } from '../../game/lobby'
import type { RoundContext } from '../../game/round'
import {
  AUTO_REVEAL_DELAY_MS,
  closest,
  CLOSEST_POINTS,
  EXACT_POINTS,
  parseGuess,
  QUESTION_MS,
  placings,
  rankedGuesses,
  RUNNER_UP_POINTS,
  type ClosestQuestion,
  type ClosestState,
} from './logic'

const questions: ClosestQuestion[] = [
  { question: 'Hur många ben har en vuxen människa?', answer: 206 },
  { question: 'Hur långt är ett maraton?', answer: 42.195, unit: 'km' },
]

const player = (id: string, connected = true): Player => ({
  id,
  name: id,
  avatar: { emoji: '🦊', color: 'red' },
  score: 0,
  connected,
})

const ctx = (now = 0, players = [player('anna'), player('bo'), player('cia')]): RoundContext => ({ players, now })

const guess = (state: ClosestState, id: string, value: number, now = 0, c = ctx(now)) =>
  closest.onIntent(state, id, { type: 'closest-guess', questionIndex: state.index, value }, c)

describe('parseGuess', () => {
  it('accepts spaces, decimal commas and minus signs', () => {
    expect(parseGuess('1 665')).toBe(1665)
    expect(parseGuess(' 42,195 ')).toBe(42.195)
    expect(parseGuess('-3')).toBe(-3)
    expect(parseGuess('−3')).toBe(-3)
    expect(parseGuess('0.5')).toBe(0.5)
  })

  it('rejects text, empty input and absurd numbers', () => {
    expect(parseGuess('')).toBeNull()
    expect(parseGuess('tolv')).toBeNull()
    expect(parseGuess('12a')).toBeNull()
    expect(parseGuess('1e5')).toBeNull()
    expect(parseGuess('9'.repeat(20))).toBeNull()
  })
})

describe('placings', () => {
  it('gives closest and second closest a place, the rest nothing', () => {
    expect(placings({ a: 200, b: 210, c: 150, d: 300 }, 206)).toEqual({ a: 'runnerUp', b: 'closest' })
  })

  it('marks exact guesses, and the next distance is second closest', () => {
    expect(placings({ a: 206, b: 210, c: 150 }, 206)).toEqual({ a: 'exact', b: 'runnerUp' })
  })

  it('lets ties share a place', () => {
    expect(placings({ a: 200, b: 212, c: 220, d: 190 }, 206)).toEqual({ a: 'closest', b: 'closest', c: 'runnerUp' })
  })

  it('treats float noise as a tie', () => {
    expect(placings({ a: 42.2, b: 42.19 }, 42.195)).toEqual({ a: 'closest', b: 'closest' })
  })
})

describe('closest round', () => {
  it('records one guess per player and ignores changes, stale and unknown players', () => {
    let state = closest.start({ questions }, ctx())
    state = guess(state, 'anna', 100).state
    state = guess(state, 'anna', 206).state
    expect(state.guesses).toEqual({ anna: 100 })
    expect(closest.onIntent(state, 'bo', { type: 'closest-guess', questionIndex: 1, value: 1 }, ctx()).state).toBe(state)
    expect(guess(state, 'ghost', 1).state).toBe(state)
  })

  it('validates untrusted intents', () => {
    expect(closest.parseIntent({ type: 'closest-guess', questionIndex: 0, value: 12.5 })).toEqual({
      type: 'closest-guess',
      questionIndex: 0,
      value: 12.5,
    })
    expect(closest.parseIntent({ type: 'closest-guess', questionIndex: 0, value: '12' })).toBeNull()
    expect(closest.parseIntent({ type: 'closest-guess', questionIndex: 0, value: Infinity })).toBeNull()
    expect(closest.parseIntent({ type: 'closest-guess', questionIndex: 0.5, value: 1 })).toBeNull()
    expect(closest.parseIntent({ type: 'trivia-answer', questionIndex: 0, choice: 1 })).toBeNull()
  })

  it('reveals after everyone guessed and hands out points', () => {
    let state = closest.start({ questions }, ctx())
    state = guess(state, 'anna', 206, 0).state
    state = guess(state, 'bo', 150, 0).state
    expect(state.revealAt).toBeNull()
    state = guess(state, 'cia', 300, 1000).state
    expect(state.revealAt).toBe(1000 + AUTO_REVEAL_DELAY_MS)
    const revealed = closest.onTick(state, ctx(1000 + AUTO_REVEAL_DELAY_MS))
    expect(revealed.state.stage).toBe('reveal')
    expect(revealed.scoreDeltas).toEqual({ anna: EXACT_POINTS, bo: RUNNER_UP_POINTS })
  })

  it('lets the host force the reveal, and moves on with next', () => {
    let state = closest.start({ questions }, ctx())
    state = guess(state, 'anna', 100).state
    state = closest.onHostAction(state, { type: 'closest-reveal' }, ctx(500)).state
    expect(state.revealAt).toBe(500 + AUTO_REVEAL_DELAY_MS)
    const revealed = closest.onTick(state, ctx(500 + AUTO_REVEAL_DELAY_MS))
    expect(revealed.scoreDeltas).toEqual({ anna: CLOSEST_POINTS })
    const next = closest.onHostAction(revealed.state, { type: 'closest-next' }, ctx()).state
    expect(next).toMatchObject({ index: 1, stage: 'question', guesses: {} })
  })

  it('shifts the reveal after a pause and finishes after the last question', () => {
    let state = closest.start({ questions }, ctx())
    state = closest.onHostAction(state, { type: 'closest-reveal' }, ctx(0)).state
    expect(closest.shiftTime(state, 5000).revealAt).toBe(AUTO_REVEAL_DELAY_MS + 5000)
    state = closest.skip(closest.skip(state, ctx()).state, ctx()).state
    expect(closest.isFinished(state)).toBe(true)
  })

  it('reveals when time runs out and ignores guesses after that', () => {
    let state = closest.start({ questions }, ctx(0))
    state = guess(state, 'anna', 200, 1000).state
    state = closest.onTick(state, ctx(QUESTION_MS)).state
    expect(state).toMatchObject({ revealAt: QUESTION_MS + AUTO_REVEAL_DELAY_MS, revealForced: true })
    expect(guess(state, 'bo', 206, QUESTION_MS + 100).state.guesses).toEqual({ anna: 200 })
    const revealed = closest.onTick(state, ctx(QUESTION_MS + AUTO_REVEAL_DELAY_MS))
    expect(revealed.scoreDeltas).toEqual({ anna: CLOSEST_POINTS })
    expect(closest.shiftTime(closest.start({ questions }, ctx(0)), 5000).deadline).toBe(QUESTION_MS + 5000)
  })

  it('never shows the answer on phones before the reveal', () => {
    let state = closest.start({ questions }, ctx())
    state = guess(state, 'anna', 200).state
    const view = closest.playerView(state, 'anna', ctx())
    expect(view).toMatchObject({
      kind: 'closest-question',
      questionIndex: 0,
      question: questions[0].question,
      guessed: 200,
      msLeft: QUESTION_MS,
    })
    expect(JSON.stringify(view)).not.toContain('206')
  })

  it('tells each phone its place and points after the reveal', () => {
    let state = closest.start({ questions }, ctx())
    state = guess(state, 'anna', 200).state
    state = guess(state, 'bo', 100).state
    state = guess(state, 'cia', 1).state
    state = closest.onTick(state, ctx(AUTO_REVEAL_DELAY_MS)).state
    expect(closest.playerView(state, 'anna', ctx())).toMatchObject({ place: 'closest', points: CLOSEST_POINTS, answer: 206 })
    expect(closest.playerView(state, 'cia', ctx())).toMatchObject({ place: null, points: 0 })
    expect(rankedGuesses(state).map((r) => r.playerId)).toEqual(['anna', 'bo', 'cia'])
  })
})
