import { describe, expect, it } from 'vitest'
import type { RoundSetup } from '../rounds'
import { backToLobby, beginGame, handleHostAction, handleIntent, phoneView, standings, tick } from './game'
import { createRoom, joinRoom, type RoomState } from './lobby'

const avatar = { emoji: '🦊', color: 'red' } as const

function roomWith(...names: string[]): RoomState {
  let room = createRoom('ABCD')
  for (const name of names) {
    const result = joinRoom(room, { playerId: name, name, avatar }, 0)
    if (!result.ok) throw new Error(result.reason)
    room = result.state
  }
  return room
}

const rounds: RoundSetup[] = [
  { type: 'trivia', titleKey: 'trivia', questions: [{ question: 'Q', options: ['a', 'b', 'c', 'd'], correct: 2 }] },
  { type: 'pass', titleKey: 'pass', questions: [{ category: 'Sport', question: 'Q', answers: ['Argentina'] }], questionsPerPlayer: 2 },
]

const go = (room: RoomState) => handleHostAction(room, { type: 'continue' }, 0)

describe('game flow', () => {
  it('needs a connected player to begin, then shows the first intro', () => {
    expect(beginGame(createRoom('ABCD'), rounds).game).toBeNull()
    const room = beginGame(roomWith('anna'), rounds)
    expect(room.phase).toBe('playing')
    expect(room.game).toMatchObject({ roundIndex: 0, stage: 'intro' })
    expect(phoneView(room, 'anna', 0)).toEqual({ kind: 'intro', titleKey: 'trivia' })
  })

  it('plays a trivia round, applies scores and moves to standings', () => {
    let room = go(beginGame(roomWith('anna', 'bo'), rounds))
    expect(room.game?.stage).toBe('round')
    expect(phoneView(room, 'anna', 0)).toMatchObject({ kind: 'trivia-question' })

    room = handleIntent(room, 'anna', { type: 'trivia-answer', questionIndex: 0, choice: 2 }, 0)
    room = handleIntent(room, 'bo', { type: 'trivia-answer', questionIndex: 0, choice: 1 }, 100)
    room = tick(room, 2000)
    expect(room.players.map((p) => p.score)).toEqual([100, 0])

    room = handleHostAction(room, { type: 'trivia-next' }, 2100)
    expect(room.game?.stage).toBe('standings')
    expect(phoneView(room, 'anna', 0)).toEqual({ kind: 'standings', rank: 1, final: false })
    expect(phoneView(room, 'bo', 0)).toEqual({ kind: 'standings', rank: 2, final: false })
  })

  it('goes on to the next round and finishes the game after the last one', () => {
    let room = go(beginGame(roomWith('anna'), rounds))
    room = handleHostAction(room, { type: 'trivia-reveal' }, 0)
    room = tick(room, 2000)
    room = handleHostAction(room, { type: 'trivia-next' }, 0)
    room = go(room)
    expect(room.game).toMatchObject({ roundIndex: 1, stage: 'intro' })

    room = go(room)
    expect(room.game?.round?.type).toBe('pass')
    room = handleIntent(room, 'anna', { type: 'pass-decide', questionIndex: 0, target: 'self' }, 0)
    room = handleIntent(room, 'anna', { type: 'pass-answer', questionIndex: 0, text: 'argentina' }, 0)
    expect(room.players[0].score).toBe(200)
    room = handleHostAction(room, { type: 'pass-next' }, 0)

    expect(room.phase).toBe('finished')
    expect(phoneView(room, 'anna', 0)).toEqual({ kind: 'standings', rank: 1, final: true })
    expect(go(room)).toBe(room)
  })

  it('ignores intents and actions meant for another round type', () => {
    const room = go(beginGame(roomWith('anna'), rounds))
    expect(handleIntent(room, 'anna', { type: 'pass-decide', questionIndex: 0, target: 'self' }, 0)).toBe(room)
    expect(handleHostAction(room, { type: 'pass-next' }, 0)).toBe(room)
  })

  it('lets scores go below zero', () => {
    let room = beginGame(roomWith('anna'), [rounds[1]])
    room = go(room)
    room = handleIntent(room, 'anna', { type: 'pass-decide', questionIndex: 0, target: 'self' }, 0)
    room = handleIntent(room, 'anna', { type: 'pass-answer', questionIndex: 0, text: 'Brasilien' }, 0)
    expect(room.players[0].score).toBe(-200)
  })

  it('goes back to the lobby after the final standings, with fresh scores and only connected players', () => {
    let room = beginGame(roomWith('anna', 'bo'), [rounds[1]])
    expect(backToLobby(room)).toBe(room)
    room = go(room)
    room = handleIntent(room, 'anna', { type: 'pass-decide', questionIndex: 0, target: 'self' }, 0)
    room = handleIntent(room, 'anna', { type: 'pass-answer', questionIndex: 0, text: 'argentina' }, 0)
    room = handleHostAction(room, { type: 'pass-next' }, 0)
    room = handleHostAction(room, { type: 'pass-next' }, 0)
    room = { ...room, players: room.players.map((p) => (p.id === 'bo' ? { ...p, connected: false } : p)) }
    expect(room.phase).toBe('finished')

    const lobby = backToLobby(room)
    expect(lobby).toMatchObject({ phase: 'lobby', game: null })
    expect(lobby.players.map((p) => [p.id, p.score])).toEqual([['anna', 0]])
    expect(phoneView(lobby, 'anna', 0)).toEqual({ kind: 'lobby' })
    expect(beginGame(lobby, rounds).phase).toBe('playing')
  })

  it('shows the lobby view before the game starts', () => {
    expect(phoneView(roomWith('anna'), 'anna', 0)).toEqual({ kind: 'lobby' })
  })
})

describe('host controls', () => {
  it('pausing freezes the clock and the phones; resuming shifts round timers', () => {
    let room = go(beginGame(roomWith('anna', 'bo'), rounds))
    room = handleIntent(room, 'anna', { type: 'trivia-answer', questionIndex: 0, choice: 2 }, 0)
    room = handleIntent(room, 'bo', { type: 'trivia-answer', questionIndex: 0, choice: 2 }, 100)
    room = handleHostAction(room, { type: 'pause' }, 500)
    expect(phoneView(room, 'anna', 600)).toEqual({ kind: 'paused' })
    expect(tick(room, 60_000)).toBe(room)
    expect(handleIntent(room, 'anna', { type: 'trivia-answer', questionIndex: 0, choice: 1 }, 700)).toBe(room)

    room = handleHostAction(room, { type: 'resume' }, 10_500)
    expect(room.game?.pausedAt).toBeNull()
    // The reveal was due at 1600; ten seconds of pause push it to 11600.
    expect(tick(room, 11_599).game?.round?.state).toMatchObject({ stage: 'question' })
    expect(tick(room, 11_600).players.map((p) => p.score)).toEqual([100, 100])
  })

  it('can pause a game saved before pausing existed (no pausedAt field)', () => {
    const room = go(beginGame(roomWith('anna'), rounds))
    const { pausedAt: _, ...oldGame } = room.game!
    const old = { ...room, game: oldGame as typeof room.game }
    expect(handleHostAction(old, { type: 'pause' }, 42).game?.pausedAt).toBe(42)
  })

  it('skip moves to the next question, finishing the round after the last one', () => {
    let room = go(beginGame(roomWith('anna'), rounds))
    room = handleHostAction(room, { type: 'skip' }, 0)
    expect(room.game?.stage).toBe('standings')
    expect(room.players[0].score).toBe(0)
  })

  it('adjust-score fixes a score in any stage, also below zero', () => {
    let room = beginGame(roomWith('anna', 'bo'), rounds)
    room = handleHostAction(room, { type: 'adjust-score', playerId: 'bo', delta: 300 }, 0)
    room = handleHostAction(room, { type: 'adjust-score', playerId: 'anna', delta: -100 }, 0)
    expect(room.players.map((p) => p.score)).toEqual([-100, 300])
  })
})

describe('standings', () => {
  it('sorts by score and shares ranks on ties', () => {
    const room = roomWith('anna', 'bo', 'cilla')
    const scored = room.players.map((p, i) => ({ ...p, score: [100, 300, 100][i] }))
    expect(standings(scored).map((s) => [s.player.id, s.rank])).toEqual([
      ['bo', 1],
      ['anna', 2],
      ['cilla', 2],
    ])
  })
})
