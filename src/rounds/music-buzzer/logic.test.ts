import { describe, expect, it } from 'vitest'
import type { Player } from '../../game/lobby'
import type { RoundContext } from '../../game/round'
import { clipElapsed, type MusicTrack } from '../music/track'
import { ANSWER_MS, BUZZ_PART_POINTS, BUZZ_WRONG_POINTS, BUZZER_CLIP_MS, musicBuzzer, songPoints, type MusicBuzzerState } from './logic'

const tracks: MusicTrack[] = [
  { id: 'a', artist: 'Europe', title: 'The Final Countdown', source: { kind: 'deezer', deezerId: 858371 } },
  { id: 'b', artist: 'Toto', title: 'Africa', source: { kind: 'deezer', deezerId: 1079668 } },
]

const player = (id: string, connected = true): Player => ({
  id,
  name: id,
  avatar: { emoji: '🦊', color: 'red' },
  score: 0,
  connected,
})
const everyone = [player('anna'), player('bo'), player('cilla')]

const T0 = 1_000_000
const ctx = (now = T0, players = everyone): RoundContext => ({ players, now })
const playing = (): MusicBuzzerState => {
  const s = musicBuzzer.start({ tracks }, ctx())
  return musicBuzzer.onHostAction(s, { type: 'music-ready', index: 0 }, ctx()).state
}
const buzz = (s: MusicBuzzerState, id: string, now = T0) =>
  musicBuzzer.onIntent(s, id, { type: 'music-buzz', questionIndex: s.index }, ctx(now))
const answer = (s: MusicBuzzerState, id: string, artist: string, title: string, now = T0) =>
  musicBuzzer.onIntent(s, id, { type: 'music-buzz-answer', questionIndex: s.index, artist, title }, ctx(now))

describe('music buzzer round', () => {
  it('the first buzz wins and pauses the music', () => {
    let s = buzz(playing(), 'bo', T0 + 4000).state
    expect(s).toMatchObject({ stage: 'buzzed', buzzerId: 'bo', buzzedAt: T0 + 4000 })
    expect(clipElapsed(s.clip, T0 + 9000)).toBe(4000)
    s = buzz(s, 'anna', T0 + 4001).state
    expect(s.buzzerId).toBe('bo')
  })

  it('artist and title both right: 500 points and the song ends', () => {
    const s = buzz(playing(), 'bo').state
    expect(answer(s, 'anna', 'Europe', 'x').state).toBe(s) // only the buzzer may answer
    const update = answer(s, 'bo', 'europe', 'final countdown')
    expect(update.scoreDeltas).toEqual({ bo: 2 * BUZZ_PART_POINTS })
    expect(update.state).toMatchObject({ stage: 'reveal', solvedBy: { artist: 'bo', title: 'bo' } })
  })

  it('one part right: points for it, the music resumes and the next buzzer only needs the rest', () => {
    let s = buzz(playing(), 'bo', T0 + 5000).state
    const first = answer(s, 'bo', 'Europe', 'Carrie', T0 + 8000)
    expect(first.scoreDeltas).toEqual({ bo: BUZZ_PART_POINTS })
    s = first.state
    expect(s).toMatchObject({ stage: 'playing', solvedBy: { artist: 'bo', title: null }, lockedIds: ['bo'] })
    expect(clipElapsed(s.clip, T0 + 10_000)).toBe(7000)
    expect(buzz(s, 'bo').state).toBe(s) // one buzz per song

    s = buzz(s, 'anna', T0 + 11_000).state
    expect(musicBuzzer.playerView(s, 'anna', ctx())).toMatchObject({ kind: 'buzzer-answer', needArtist: false, needTitle: true })
    // Repeating the already-solved artist earns nothing more.
    const second = answer(s, 'anna', 'Europe', 'The Final Countdown', T0 + 12_000)
    expect(second.scoreDeltas).toEqual({ anna: BUZZ_PART_POINTS })
    expect(second.state).toMatchObject({ stage: 'reveal', solvedBy: { artist: 'bo', title: 'anna' } })
  })

  it('nothing right costs 250, locks the player and resumes the music', () => {
    let s = buzz(playing(), 'bo').state
    const update = answer(s, 'bo', 'Roxette', '')
    expect(update.scoreDeltas).toEqual({ bo: BUZZ_WRONG_POINTS })
    s = update.state
    expect(s).toMatchObject({ stage: 'playing', lockedIds: ['bo'], buzzerId: null })
    expect(songPoints(s, 'bo')).toBe(BUZZ_WRONG_POINTS)
  })

  it('needs at least one field filled in', () => {
    const s = buzz(playing(), 'bo').state
    expect(answer(s, 'bo', '  ', '').state).toBe(s)
  })

  it('running out of the answer time counts as nothing right', () => {
    const s = buzz(playing(), 'bo').state
    expect(musicBuzzer.onTick(s, ctx(T0 + ANSWER_MS - 1)).state.stage).toBe('buzzed')
    const timedOut = musicBuzzer.onTick(s, ctx(T0 + ANSWER_MS))
    expect(timedOut.scoreDeltas).toEqual({ bo: BUZZ_WRONG_POINTS })
    expect(timedOut.state.attempts[0]).toMatchObject({ playerId: 'bo', artist: null, title: null })
  })

  it('reveals at the end of the clip, or when the host asks', () => {
    expect(musicBuzzer.onTick(playing(), ctx(T0 + BUZZER_CLIP_MS - 1)).state.stage).toBe('playing')
    expect(musicBuzzer.onTick(playing(), ctx(T0 + BUZZER_CLIP_MS)).state.stage).toBe('reveal')
    expect(musicBuzzer.onHostAction(playing(), { type: 'music-reveal' }, ctx()).state.stage).toBe('reveal')
  })

  it('keeps the song playing and the answer hidden after wrong or half-right buzzes', () => {
    let s = answer(buzz(playing(), 'anna').state, 'anna', 'Europe', 'fel').state
    expect(s).toMatchObject({ stage: 'playing', solvedBy: { artist: 'anna', title: null } })
    expect(musicBuzzer.playerView(s, 'bo', ctx())).toMatchObject({ kind: 'buzzer', stage: 'playing', titleSolved: false })
    // Even once everyone has used their buzz, nothing is given away before the clip ends.
    for (const id of ['bo', 'cilla']) s = answer(buzz(s, id).state, id, 'fel', 'fel').state
    expect(s.stage).toBe('playing')
    expect(JSON.stringify(musicBuzzer.playerView(s, 'bo', ctx()))).not.toContain('Final Countdown')
  })

  it('the host can judge a spoken answer part by part', () => {
    const s = buzz(playing(), 'cilla').state
    const update = musicBuzzer.onHostAction(s, { type: 'music-judge', artist: false, title: true }, ctx())
    expect(update.scoreDeltas).toEqual({ cilla: BUZZ_PART_POINTS })
    expect(update.state).toMatchObject({ stage: 'playing', solvedBy: { artist: null, title: 'cilla' } })
  })

  it('skips tracks that fail to load and finishes after the last one', () => {
    let s = musicBuzzer.start({ tracks }, ctx())
    s = musicBuzzer.onHostAction(s, { type: 'music-failed', index: 0 }, ctx()).state
    expect(s).toMatchObject({ index: 1, stage: 'loading' })
    s = musicBuzzer.onHostAction(s, { type: 'music-failed', index: 1 }, ctx()).state
    expect(musicBuzzer.isFinished(s)).toBe(true)
  })

  it('shows each phone the right screen and never leaks the answer early', () => {
    let s = playing()
    expect(musicBuzzer.playerView(s, 'anna', ctx())).toEqual({
      kind: 'buzzer',
      questionIndex: 0,
      stage: 'playing',
      locked: false,
      buzzerName: null,
      artistSolved: false,
      titleSolved: false,
    })
    s = buzz(s, 'bo').state
    expect(musicBuzzer.playerView(s, 'bo', ctx())).toEqual({
      kind: 'buzzer-answer',
      questionIndex: 0,
      buzzedAt: T0,
      needArtist: true,
      needTitle: true,
    })
    expect(musicBuzzer.playerView(s, 'anna', ctx())).toMatchObject({ stage: 'buzzed', buzzerName: 'bo' })
    expect(JSON.stringify(musicBuzzer.playerView(s, 'bo', ctx()))).not.toContain('Countdown')

    s = answer(s, 'bo', 'nope', 'nope').state
    s = answer(buzz(s, 'anna').state, 'anna', 'Europe', 'The Final Countdown').state
    expect(musicBuzzer.playerView(s, 'anna', ctx())).toMatchObject({ gotArtist: true, gotTitle: true, points: 500, title: 'The Final Countdown' })
    expect(musicBuzzer.playerView(s, 'bo', ctx())).toMatchObject({ gotArtist: false, buzzed: true, points: -250 })
    expect(musicBuzzer.playerView(s, 'cilla', ctx())).toMatchObject({ buzzed: false, points: 0 })
  })

  it('parses answers, treating a missing field as empty', () => {
    expect(musicBuzzer.parseIntent({ type: 'music-buzz-answer', questionIndex: 0, artist: 'ABBA' })).toEqual({
      type: 'music-buzz-answer',
      questionIndex: 0,
      artist: 'ABBA',
      title: '',
    })
    expect(musicBuzzer.parseIntent({ type: 'music-buzz', questionIndex: 'x' })).toBeNull()
  })
})
