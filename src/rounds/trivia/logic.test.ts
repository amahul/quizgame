import { describe, expect, it } from 'vitest'
import type { Player } from '../../game/lobby'
import type { RoundContext } from '../../game/round'
import { answerCounts, AUTO_REVEAL_DELAY_MS, trivia, TRIVIA_POINTS, type TriviaQuestion, type TriviaState } from './logic'

const questions: TriviaQuestion[] = [
  { question: 'Q1', options: ['a', 'b', 'c', 'd'], correct: 1 },
  { question: 'Q2', options: ['a', 'b'], correct: 0 },
]

const player = (id: string, connected = true): Player => ({
  id,
  name: id,
  avatar: { emoji: '🦊', color: 'red' },
  score: 0,
  connected,
})

const ctx = (now = 0, players = [player('anna'), player('bo')]): RoundContext => ({ players, now })

const answer = (state: TriviaState, id: string, choice: number, now = 0, c = ctx(now)) =>
  trivia.onIntent(state, id, { type: 'trivia-answer', questionIndex: state.index, choice }, c)

describe('trivia round', () => {
  it('records one answer per player and ignores changes', () => {
    let state = trivia.start({ questions }, ctx())
    state = answer(state, 'anna', 2).state
    state = answer(state, 'anna', 1).state
    expect(state.answers).toEqual({ anna: 2 })
  })

  it('ignores stale, out-of-range and unknown-player answers', () => {
    const state = trivia.start({ questions }, ctx())
    expect(trivia.onIntent(state, 'anna', { type: 'trivia-answer', questionIndex: 1, choice: 0 }, ctx()).state).toBe(state)
    expect(answer(state, 'ghost', 0).state).toBe(state)
    const second = { ...state, index: 1 }
    expect(answer(second, 'anna', 3).state).toBe(second)
  })

  it('auto-reveals 1.5 s after everyone connected has answered', () => {
    let state = trivia.start({ questions }, ctx())
    state = answer(state, 'anna', 1, 1000).state
    expect(state.revealAt).toBeNull()
    state = answer(state, 'bo', 0, 2000).state
    expect(state.revealAt).toBe(2000 + AUTO_REVEAL_DELAY_MS)

    expect(trivia.onTick(state, ctx(2000 + AUTO_REVEAL_DELAY_MS - 1)).state.stage).toBe('question')
    const revealed = trivia.onTick(state, ctx(2000 + AUTO_REVEAL_DELAY_MS))
    expect(revealed.state.stage).toBe('reveal')
    expect(revealed.scoreDeltas).toEqual({ anna: TRIVIA_POINTS })
  })

  it('does not wait for disconnected players', () => {
    const players = [player('anna'), player('bo', false)]
    let state = trivia.start({ questions }, ctx(0, players))
    state = answer(state, 'anna', 1, 0, ctx(0, players)).state
    expect(state.revealAt).toBe(AUTO_REVEAL_DELAY_MS)
  })

  it('cancels the countdown if a new player shows up', () => {
    let state = trivia.start({ questions }, ctx())
    state = answer(state, 'anna', 1).state
    state = answer(state, 'bo', 1).state
    const withNewcomer = ctx(500, [player('anna'), player('bo'), player('cilla')])
    expect(trivia.onTick(state, withNewcomer).state.revealAt).toBeNull()
  })

  it('never auto-reveals with nobody connected', () => {
    const state = trivia.start({ questions }, ctx())
    expect(trivia.onTick(state, ctx(99_999, [player('anna', false)])).state.stage).toBe('question')
  })

  it('lets the host force the reveal after a drumroll, even if a newcomer arrives, with no negative points', () => {
    let state = trivia.start({ questions }, ctx())
    state = answer(state, 'anna', 3).state
    state = trivia.onHostAction(state, { type: 'trivia-reveal' }, ctx(1000)).state
    expect(state).toMatchObject({ stage: 'question', revealAt: 1000 + AUTO_REVEAL_DELAY_MS, revealForced: true })
    const withNewcomer = [player('anna'), player('bo'), player('cilla')]
    expect(trivia.onTick(state, ctx(1100, withNewcomer)).state.revealAt).toBe(1000 + AUTO_REVEAL_DELAY_MS)
    const update = trivia.onTick(state, ctx(1000 + AUTO_REVEAL_DELAY_MS))
    expect(update.state.stage).toBe('reveal')
    expect(update.scoreDeltas).toEqual({})
  })

  it('can skip a question and shift its timer after a pause', () => {
    let state = answer(trivia.start({ questions }, ctx()), 'anna', 1).state
    state = answer(state, 'bo', 1, 500).state
    expect(trivia.shiftTime(state, 10_000).revealAt).toBe(500 + AUTO_REVEAL_DELAY_MS + 10_000)
    const skipped = trivia.skip(state, ctx())
    expect(skipped.state).toMatchObject({ index: 1, stage: 'question', answers: {}, revealAt: null })
    expect(skipped.scoreDeltas).toBeUndefined()
  })

  it('counts answers per option', () => {
    const three = ctx(0, [player('a'), player('b'), player('c')])
    let state = trivia.start({ questions }, three)
    for (const [id, choice] of [['a', 1], ['b', 1], ['c', 3]] as const) state = answer(state, id, choice, 0, three).state
    expect(answerCounts(state)).toEqual([0, 2, 0, 1])
  })

  it('moves through questions and finishes', () => {
    let state = trivia.start({ questions }, ctx())
    state = trivia.onHostAction(state, { type: 'trivia-next' }, ctx()).state
    expect(state.index).toBe(0) // can't skip an unrevealed question
    const revealNow = (s: TriviaState) =>
      trivia.onTick(trivia.onHostAction(s, { type: 'trivia-reveal' }, ctx()).state, ctx(AUTO_REVEAL_DELAY_MS)).state
    state = revealNow(state)
    state = trivia.onHostAction(state, { type: 'trivia-next' }, ctx()).state
    expect(state).toMatchObject({ index: 1, stage: 'question', answers: {} })
    state = revealNow(state)
    state = trivia.onHostAction(state, { type: 'trivia-next' }, ctx()).state
    expect(trivia.isFinished(state)).toBe(true)
  })

  it('shows phones only buttons, then their own result', () => {
    let state = trivia.start({ questions }, ctx())
    expect(trivia.playerView(state, 'anna', ctx())).toEqual({
      kind: 'trivia-question',
      questionIndex: 0,
      optionCount: 4,
      answered: null,
    })
    state = answer(state, 'anna', 1).state
    state = trivia.onTick(trivia.onHostAction(state, { type: 'trivia-reveal' }, ctx()).state, ctx(AUTO_REVEAL_DELAY_MS)).state
    expect(trivia.playerView(state, 'anna', ctx())).toMatchObject({ kind: 'trivia-reveal', correct: true, points: 100 })
    expect(trivia.playerView(state, 'bo', ctx())).toMatchObject({ answered: null, correct: false, points: 0 })
  })

  it('parses intents strictly', () => {
    expect(trivia.parseIntent({ type: 'trivia-answer', questionIndex: 0, choice: 2 })).not.toBeNull()
    expect(trivia.parseIntent({ type: 'trivia-answer', questionIndex: 0, choice: 4 })).toBeNull()
    expect(trivia.parseIntent({ type: 'trivia-answer', questionIndex: '0', choice: 1 })).toBeNull()
    expect(trivia.parseIntent({ type: 'pass-answer', questionIndex: 0, text: 'x' })).toBeNull()
  })
})
