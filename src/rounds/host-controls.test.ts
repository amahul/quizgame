// skip() and shiftTime() for every round type: the host's "Hoppa över" and pause.
import { describe, expect, it } from 'vitest'
import type { Player } from '../game/lobby'
import type { RoundContext } from '../game/round'
import { letters } from './letters/logic'
import { musicBuzzer } from './music-buzzer/logic'
import { musicRace } from './music-race/logic'
import { clipElapsed, type MusicTrack } from './music/track'
import { pass } from './pass/logic'

const player = (id: string, score = 0): Player => ({ id, name: id, avatar: { emoji: '🦊', color: 'red' }, score, connected: true })
const ctx = (now: number, players = [player('anna'), player('bo', 100)]): RoundContext => ({ players, now })
const tracks: MusicTrack[] = ['a', 'b'].map((id) => ({ id, artist: id, title: id, source: { kind: 'deezer', deezerId: 1 } }))

describe('letters', () => {
  const items = [
    { prompt: 'p', answer: 'hemma bäst', theme: 't' },
    { prompt: 'q', answer: 'pilot', theme: 't' },
  ]

  it('a pause neither flips tiles nor changes recorded guess times', () => {
    let s = letters.start({ items }, ctx(0))
    s = letters.onIntent(s, 'anna', { type: 'letters-guess', questionIndex: 0, text: 'fel' }, ctx(3000)).state
    const shifted = letters.shiftTime(s, 60_000)
    expect(shifted.startedAt).toBe(60_000)
    expect(shifted.guesses.anna.at - shifted.startedAt).toBe(3000)
    // One tile had flipped by 3 s; a minute later (after a minute-long pause) still only one.
    expect(s.revealedCount).toBe(1)
    expect(letters.onTick(shifted, ctx(63_500)).state.revealedCount).toBe(1)
  })

  it('skip goes to the next item with a fresh clock', () => {
    const s = letters.skip(letters.start({ items }, ctx(0)), ctx(5000)).state
    expect(s).toMatchObject({ index: 1, stage: 'playing', startedAt: 5000, revealedCount: 0 })
  })
})

describe('music rounds', () => {
  it('race: a pause does not count as played time', () => {
    const questions = tracks.map((track) => ({ track, field: 'artist' as const, options: [track.artist, 'x'], correct: 0 }))
    let s = musicRace.start({ questions }, ctx(0))
    s = musicRace.onHostAction(s, { type: 'music-ready', index: 0 }, ctx(1000)).state
    const shifted = musicRace.shiftTime(s, 20_000)
    expect(clipElapsed(shifted.clip, 26_000)).toBe(5000)
    expect(musicRace.skip(s, ctx(0)).state).toMatchObject({ index: 1, stage: 'loading' })
  })

  it('buzzer: a pause extends the 10 s answer window too', () => {
    let s = musicBuzzer.start({ tracks }, ctx(0))
    s = musicBuzzer.onHostAction(s, { type: 'music-ready', index: 0 }, ctx(0)).state
    s = musicBuzzer.onIntent(s, 'anna', { type: 'music-buzz', questionIndex: 0 }, ctx(2000)).state
    const shifted = musicBuzzer.shiftTime(s, 30_000)
    expect(shifted.buzzedAt).toBe(32_000)
    expect(musicBuzzer.onTick(shifted, ctx(35_000)).state.stage).toBe('buzzed')
    expect(musicBuzzer.skip(s, ctx(0)).state).toMatchObject({ index: 1, stage: 'loading', buzzerId: null })
  })
})

describe('pass', () => {
  const questions = ['a', 'b', 'c'].map((q) => ({ category: 'K', question: q, answers: ['x'] }))

  it('skip before the answer keeps the same chooser; after the reveal it acts like "Nästa"', () => {
    let s = pass.start({ questions, questionsPerPlayer: 2 }, ctx(0))
    expect(s.activeId).toBe('anna')
    s = pass.skip(s, ctx(0)).state
    expect(s).toMatchObject({ index: 1, stage: 'choosing', activeId: 'anna' })

    s = pass.onIntent(s, 'anna', { type: 'pass-decide', questionIndex: 1, target: 'bo' }, ctx(0)).state
    s = pass.onIntent(s, 'bo', { type: 'pass-answer', questionIndex: 1, text: 'x' }, ctx(0)).state
    s = pass.skip(s, ctx(0)).state
    expect(s).toMatchObject({ index: 2, stage: 'choosing', activeId: 'bo' })
    expect(pass.shiftTime(s, 1000)).toBe(s)
  })
})
