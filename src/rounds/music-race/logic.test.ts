import { describe, expect, it } from 'vitest'
import type { Player } from '../../game/lobby'
import type { RoundContext } from '../../game/round'
import { CLIP_MS, type MusicTrack } from '../music/track'
import { choiceCounts, musicRace, type MusicChoiceQuestion, type MusicRaceState } from './logic'

const track = (artist: string, title: string): MusicTrack => ({
  id: `${artist}-${title}`,
  artist,
  title,
  source: { kind: 'deezer', search: `${artist} ${title}` },
})
const questions: MusicChoiceQuestion[] = [
  { track: track('ABBA', 'Dancing Queen'), field: 'artist', options: ['Roxette', 'ABBA', 'Europe', 'Robyn'], correct: 1 },
  { track: track('Toto', 'Africa'), field: 'title', options: ['Africa', 'Rosanna'], correct: 0 },
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
const playing = (): MusicRaceState => {
  const s = musicRace.start({ questions }, ctx())
  return musicRace.onHostAction(s, { type: 'music-ready', index: 0 }, ctx()).state
}
const choose = (s: MusicRaceState, id: string, choice: number, now = T0) =>
  musicRace.onIntent(s, id, { type: 'music-choice', questionIndex: s.index, choice }, ctx(now))

describe('music race round (multiple choice)', () => {
  it('waits for the host audio before accepting answers', () => {
    const s = musicRace.start({ questions }, ctx())
    expect(s.stage).toBe('loading')
    expect(choose(s, 'anna', 1).state).toBe(s)
    expect(musicRace.onHostAction(s, { type: 'music-ready', index: 1 }, ctx()).state).toBe(s) // stale
    expect(playing()).toMatchObject({ stage: 'playing', clip: { playedMs: 0, segmentStartedAt: T0 } })
  })

  it('skips a track that fails to load', () => {
    const s = musicRace.onHostAction(musicRace.start({ questions }, ctx()), { type: 'music-failed', index: 0 }, ctx()).state
    expect(s).toMatchObject({ index: 1, stage: 'loading' })
  })

  it('takes one answer per player and reveals when everyone has answered, scoring by speed', () => {
    let s = choose(playing(), 'anna', 1, T0).state
    s = choose(s, 'anna', 2, T0 + 100).state
    expect(s.answers.anna.choice).toBe(1)
    const update = choose(s, 'bo', 3, T0 + CLIP_MS / 2)
    expect(update.state.stage).toBe('reveal')
    expect(update.scoreDeltas).toEqual({ anna: 1000 })
  })

  it('gives fewer points for a slow right answer and none for a wrong one', () => {
    let s = choose(playing(), 'anna', 1, T0 + CLIP_MS / 2).state
    s = choose(s, 'bo', 0, T0 + 1000).state
    expect(musicRace.playerView(s, 'anna', ctx())).toMatchObject({ kind: 'music-choice-result', correct: true, points: 550 })
    expect(musicRace.playerView(s, 'bo', ctx())).toMatchObject({ correct: false, points: 0, answered: 0 })
  })

  it('reveals at the end of the clip and refuses answers after it', () => {
    const s = playing()
    expect(musicRace.onTick(s, ctx(T0 + CLIP_MS - 1)).state.stage).toBe('playing')
    expect(musicRace.onTick(s, ctx(T0 + CLIP_MS)).state.stage).toBe('reveal')
    expect(choose(s, 'anna', 1, T0 + CLIP_MS).scoreDeltas).toEqual({})
  })

  it('ignores stale and out-of-range choices', () => {
    const s = playing()
    expect(musicRace.onIntent(s, 'anna', { type: 'music-choice', questionIndex: 1, choice: 0 }, ctx()).state).toBe(s)
    const second = musicRace.onHostAction(musicRace.skip(s, ctx()).state, { type: 'music-ready', index: 1 }, ctx()).state
    expect(choose(second, 'anna', 3).state).toBe(second) // only two options there
  })

  it('counts choices per option for the reveal bars', () => {
    let s = choose(playing(), 'anna', 1).state
    s = choose(s, 'bo', 1).state
    expect(choiceCounts(s)).toEqual([0, 2, 0, 0])
  })

  it('lets the host reveal early, then moves on and finishes', () => {
    let s = musicRace.onHostAction(playing(), { type: 'music-reveal' }, ctx()).state
    expect(s.stage).toBe('reveal')
    s = musicRace.onHostAction(s, { type: 'music-next' }, ctx()).state
    expect(s).toMatchObject({ index: 1, stage: 'loading', answers: {} })
    s = musicRace.onHostAction(s, { type: 'music-reveal' }, ctx()).state
    s = musicRace.onHostAction(s, { type: 'music-next' }, ctx()).state
    expect(musicRace.isFinished(s)).toBe(true)
  })

  it('phones see only the field and number of options until the reveal', () => {
    let s = playing()
    const view = musicRace.playerView(s, 'anna', ctx())
    expect(view).toEqual({ kind: 'music-choice', questionIndex: 0, loading: false, field: 'artist', optionCount: 4, answered: null })
    expect(JSON.stringify(view)).not.toContain('ABBA')
    s = musicRace.onHostAction(s, { type: 'music-reveal' }, ctx()).state
    expect(musicRace.playerView(s, 'bo', ctx())).toMatchObject({ artist: 'ABBA', title: 'Dancing Queen', answered: null, points: 0 })
  })

  it('parses choices strictly', () => {
    expect(musicRace.parseIntent({ type: 'music-choice', questionIndex: 0, choice: 3 })).not.toBeNull()
    expect(musicRace.parseIntent({ type: 'music-choice', questionIndex: 0, choice: 4 })).toBeNull()
    expect(musicRace.parseIntent({ type: 'music-guess', questionIndex: 0, field: 'artist', text: 'x' })).toBeNull()
  })
})
