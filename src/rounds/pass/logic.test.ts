import { describe, expect, it } from 'vitest'
import type { Player } from '../../game/lobby'
import type { RoundContext } from '../../game/round'
import { KEEP_POINTS, lowestScoring, pass, PASS_POINTS, type PassQuestion, type PassState } from './logic'

const q = (n: number): PassQuestion => ({ category: `Kat ${n}`, question: `Fråga ${n}`, answers: ['Canberra'] })
const questions = Array.from({ length: 10 }, (_, i) => q(i))

const player = (id: string, score = 0, connected = true): Player => ({
  id,
  name: id,
  avatar: { emoji: '🦊', color: 'red' },
  score,
  connected,
})

const players = [player('anna', 300), player('bo', 100), player('cilla', 100)]
const ctx = (ps: Player[] = players): RoundContext => ({ players: ps, now: 0 })
const start = (ps = players, perPlayer = 2) => pass.start({ questions, questionsPerPlayer: perPlayer }, ctx(ps))

const decide = (s: PassState, id: string, target: string, ps = players) =>
  pass.onIntent(s, id, { type: 'pass-decide', questionIndex: s.index, target }, ctx(ps))
const reply = (s: PassState, id: string, text: string) =>
  pass.onIntent(s, id, { type: 'pass-answer', questionIndex: s.index, text }, ctx())

describe('lowestScoring', () => {
  it('picks the lowest score, first in join order on ties, skipping the excluded player', () => {
    expect(lowestScoring(players)?.id).toBe('bo')
    expect(lowestScoring(players, 'bo')?.id).toBe('cilla')
  })

  it('prefers connected players', () => {
    expect(lowestScoring([player('anna', 300), player('bo', 0, false)])?.id).toBe('anna')
  })
})

describe('pass round', () => {
  it('starts with the lowest scorer and uses 2 questions per player', () => {
    const state = start()
    expect(state).toMatchObject({ activeId: 'bo', stage: 'choosing', index: 0 })
    expect(state.questions).toHaveLength(6)
  })

  it('caps the length at the number of available questions', () => {
    expect(start(players, 5).questions).toHaveLength(10)
  })

  it('keeping it: correct earns 200', () => {
    let s = decide(start(), 'bo', 'self').state
    expect(s).toMatchObject({ stage: 'answering', answererId: 'bo' })
    const update = reply(s, 'bo', 'canbera')
    s = update.state
    expect(s).toMatchObject({ stage: 'reveal', correct: true, answer: 'canbera' })
    expect(update.scoreDeltas).toEqual({ bo: KEEP_POINTS })
  })

  it('keeping it: wrong costs 200', () => {
    const s = decide(start(), 'bo', 'self').state
    expect(reply(s, 'bo', 'Sydney').scoreDeltas).toEqual({ bo: -KEEP_POINTS })
  })

  it('sending it: the receiver answers for ±100 and becomes active next', () => {
    let s = decide(start(), 'bo', 'anna').state
    expect(s.answererId).toBe('anna')
    expect(reply(s, 'bo', 'Canberra').state).toBe(s) // only the receiver may answer
    const update = reply(s, 'anna', 'Canberra')
    expect(update.scoreDeltas).toEqual({ anna: PASS_POINTS })
    s = pass.onHostAction(update.state, { type: 'pass-next' }, ctx()).state
    expect(s).toMatchObject({ index: 1, stage: 'choosing', activeId: 'anna', answererId: null })
  })

  it('after keeping, the lowest scorer other than the keeper goes next', () => {
    let s = decide(start(), 'bo', 'self').state
    s = reply(s, 'bo', 'Canberra').state
    s = pass.onHostAction(s, { type: 'pass-next' }, ctx([player('anna', 300), player('bo', 300), player('cilla', 100)])).state
    expect(s.activeId).toBe('cilla')
  })

  it('rejects decisions from non-active players and sends to self-id or disconnected players', () => {
    const s = start()
    expect(decide(s, 'anna', 'self').state).toBe(s)
    expect(decide(s, 'bo', 'bo').state).toBe(s)
    expect(decide(s, 'bo', 'ghost').state).toBe(s)
    const offline = [player('anna', 300, false), player('bo', 100), player('cilla', 100)]
    expect(decide(s, 'bo', 'anna', offline).state).toBe(s)
  })

  it('ignores empty answers and stale question indexes', () => {
    const s = decide(start(), 'bo', 'self').state
    expect(reply(s, 'bo', '   ').state).toBe(s)
    expect(pass.onIntent(s, 'bo', { type: 'pass-answer', questionIndex: 3, text: 'Canberra' }, ctx()).state).toBe(s)
  })

  it('host override flips the verdict and swings the score', () => {
    let s = decide(start(), 'bo', 'anna').state
    s = reply(s, 'anna', 'Kanberra city').state
    expect(s.correct).toBe(false)
    const flipped = pass.onHostAction(s, { type: 'pass-override' }, ctx())
    expect(flipped.state).toMatchObject({ correct: true, overridden: true })
    expect(flipped.scoreDeltas).toEqual({ anna: 2 * PASS_POINTS })
    const back = pass.onHostAction(flipped.state, { type: 'pass-override' }, ctx())
    expect(back.scoreDeltas).toEqual({ anna: -2 * PASS_POINTS })
  })

  it('host can judge a spoken answer and skip a stuck active player', () => {
    let s = start()
    s = pass.onHostAction(s, { type: 'pass-skip' }, ctx()).state
    expect(s.activeId).toBe('cilla')
    s = decide(s, 'cilla', 'self').state
    const judged = pass.onHostAction(s, { type: 'pass-judge', correct: true }, ctx())
    expect(judged.state).toMatchObject({ stage: 'reveal', answer: null, correct: true })
    expect(judged.scoreDeltas).toEqual({ cilla: KEEP_POINTS })
  })

  it('finishes after the last question', () => {
    let s = start([player('solo')], 1)
    expect(s.questions).toHaveLength(1)
    s = decide(s, 'solo', 'self', [player('solo')]).state
    s = reply(s, 'solo', 'x').state
    s = pass.onHostAction(s, { type: 'pass-next' }, ctx([player('solo')])).state
    expect(pass.isFinished(s)).toBe(true)
  })

  it('phones only see what concerns them, and never the answer', () => {
    let s = start()
    expect(pass.playerView(s, 'bo', ctx())).toEqual({
      kind: 'pass-choose',
      questionIndex: 0,
      category: 'Kat 0',
      targets: [
        { id: 'anna', name: 'anna', avatar: players[0].avatar },
        { id: 'cilla', name: 'cilla', avatar: players[2].avatar },
      ],
    })
    expect(pass.playerView(s, 'anna', ctx())).toEqual({ kind: 'pass-watch' })

    s = decide(s, 'bo', 'anna').state
    expect(pass.playerView(s, 'anna', ctx())).toEqual({
      kind: 'pass-answer',
      questionIndex: 0,
      category: 'Kat 0',
      question: 'Fråga 0',
      stake: PASS_POINTS,
    })
    expect(JSON.stringify(pass.playerView(s, 'anna', ctx()))).not.toContain('Canberra')
    expect(pass.playerView(s, 'bo', ctx())).toEqual({ kind: 'pass-watch' })

    s = reply(s, 'anna', 'Oslo').state
    expect(pass.playerView(s, 'anna', ctx())).toEqual({ kind: 'pass-result', correct: false, points: -PASS_POINTS })
  })

  it('parses intents and truncates long answers', () => {
    const parsed = pass.parseIntent({ type: 'pass-answer', questionIndex: 0, text: 'x'.repeat(500) })
    expect(parsed?.type === 'pass-answer' && parsed.text.length).toBe(80)
    expect(pass.parseIntent({ type: 'pass-decide', questionIndex: 0, target: 'self' })).not.toBeNull()
    expect(pass.parseIntent({ type: 'pass-decide', questionIndex: 0, target: 7 })).toBeNull()
    expect(pass.parseIntent({ type: 'trivia-answer', questionIndex: 0, choice: 1 })).toBeNull()
  })
})
