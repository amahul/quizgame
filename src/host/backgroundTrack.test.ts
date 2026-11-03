import { describe, expect, it } from 'vitest'
import { noteHz } from '../audio'
import { SONGS } from '../audio/backgroundMusic'
import { backToLobby, beginGame, handleHostAction, handleIntent, tick } from '../game/game'
import { createRoom, joinRoom, type RoomState } from '../game/lobby'
import type { RoundSetup } from '../rounds'
import { backgroundTrackFor } from './backgroundTrack'

const avatar = { emoji: '🦊', color: 'red' } as const

function lobbyWith(...names: string[]): RoomState {
  let room = createRoom('ABCD')
  for (const name of names) {
    const result = joinRoom(room, { playerId: name, name, avatar }, 0)
    if (!result.ok) throw new Error(result.reason)
    room = result.state
  }
  return room
}

const trivia: RoundSetup = { type: 'trivia', titleKey: 'trivia', questions: [{ question: 'Q', options: ['a', 'b'], correct: 0 }] }
const pass: RoundSetup = {
  type: 'pass',
  titleKey: 'pass',
  questions: [{ category: 'K', question: 'Q', answers: ['x'] }],
  questionsPerPlayer: 1,
}
const go = (room: RoomState) => handleHostAction(room, { type: 'continue' }, 0)

describe('backgroundTrackFor', () => {
  it('plays the lobby tune in the lobby, but not in the builder or before a room exists', () => {
    expect(backgroundTrackFor(lobbyWith('anna'), false)).toBe('lobby')
    expect(backgroundTrackFor(lobbyWith('anna'), true)).toBeNull()
    expect(backgroundTrackFor(null, false)).toBeNull()
  })

  it('is silent on intros, then plays the question tune until the drumroll', () => {
    let room = beginGame(lobbyWith('anna'), [trivia])
    expect(backgroundTrackFor(room, false)).toBeNull()
    room = go(room)
    expect(backgroundTrackFor(room, false)).toBe('question')
    room = handleIntent(room, 'anna', { type: 'trivia-answer', questionIndex: 0, choice: 0 }, 0)
    // Everyone answered: the drumroll is scheduled, so the music stops.
    expect(backgroundTrackFor(room, false)).toBeNull()
    room = tick(room, 10_000)
    expect(backgroundTrackFor(room, false)).toBeNull()
  })

  it('stops while paused', () => {
    const room = handleHostAction(go(beginGame(lobbyWith('anna'), [trivia])), { type: 'pause' }, 0)
    expect(backgroundTrackFor(room, false)).toBeNull()
  })

  it('plays while choosing and answering in Skicka vidare, not on the reveal', () => {
    let room = go(beginGame(lobbyWith('anna'), [pass]))
    expect(backgroundTrackFor(room, false)).toBe('question')
    room = handleIntent(room, 'anna', { type: 'pass-decide', questionIndex: 0, target: 'self' }, 0)
    expect(backgroundTrackFor(room, false)).toBe('question')
    room = handleIntent(room, 'anna', { type: 'pass-answer', questionIndex: 0, text: 'x' }, 0)
    expect(backgroundTrackFor(room, false)).toBeNull()
    room = handleHostAction(room, { type: 'pass-next' }, 0)
    expect(room.phase).toBe('finished')
    expect(backgroundTrackFor(room, false)).toBeNull()
    expect(backgroundTrackFor(backToLobby(room), false)).toBe('lobby')
  })
})

describe('background songs', () => {
  it('only use real notes and stay inside their loop', () => {
    for (const song of Object.values(SONGS)) {
      const notes = [...song.bass.map(([, n]) => n), ...song.melody.map(([, n]) => n), ...song.chords.flatMap(([, ns]) => ns)]
      for (const n of notes) expect(noteHz(n)).toBeGreaterThan(30)
      const steps = [...song.bass, ...song.melody, ...song.chords].map(([s]) => s)
      for (const s of [...steps, ...song.hats, ...song.kicks]) {
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThan(song.steps)
      }
      for (const [, , len] of [...song.bass, ...song.melody, ...song.chords]) expect(len).toBeGreaterThan(0)
    }
  })
})
