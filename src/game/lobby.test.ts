import { describe, expect, it } from 'vitest'
import type { Avatar } from './avatars'
import {
  canStart,
  createRoom,
  disconnectAll,
  disconnectPlayer,
  joinRoom,
  kickPlayer,
  MAX_PLAYERS,
  type RoomState,
  sweepStale,
  toPlayerView,
  touchPlayer,
  validateName,
} from './lobby'

const fox: Avatar = { emoji: '🦊', color: 'red' }

function join(state: RoomState, playerId: string, name: string, now = 0): RoomState {
  const result = joinRoom(state, { playerId, name, avatar: fox }, now)
  if (!result.ok) throw new Error(`join failed: ${result.reason}`)
  return result.state
}

describe('validateName', () => {
  it('trims and collapses whitespace', () => {
    expect(validateName('  Anna   Karin ')).toBe('Anna Karin')
  })

  it('rejects empty and too-long names', () => {
    expect(validateName('   ')).toBeNull()
    expect(validateName('a'.repeat(17))).toBeNull()
    expect(validateName('a'.repeat(16))).toBe('a'.repeat(16))
  })

  it('counts emoji as single characters', () => {
    expect(validateName('🦊'.repeat(16))).not.toBeNull()
  })
})

describe('joinRoom', () => {
  it('adds a new player in join order', () => {
    const state = join(join(createRoom('ABCD'), 'p1', 'Anna'), 'p2', 'Bo')
    expect(state.players.map((p) => p.name)).toEqual(['Anna', 'Bo'])
    expect(state.players[0]).toMatchObject({ score: 0, connected: true, avatar: fox })
  })

  it('rejects duplicate nicknames case-insensitively, including å/ä/ö', () => {
    const state = join(createRoom('ABCD'), 'p1', 'Åsa')
    expect(joinRoom(state, { playerId: 'p2', name: 'åSA', avatar: fox }, 0)).toEqual({
      ok: false,
      reason: 'name-taken',
    })
  })

  it('keeps a disconnected player\'s name reserved', () => {
    const state = disconnectPlayer(join(createRoom('ABCD'), 'p1', 'Anna'), 'p1')
    expect(joinRoom(state, { playerId: 'p2', name: 'Anna', avatar: fox }, 0)).toMatchObject({ ok: false })
  })

  it('rejects invalid names', () => {
    expect(joinRoom(createRoom('ABCD'), { playerId: 'p1', name: ' ', avatar: fox }, 0)).toEqual({
      ok: false,
      reason: 'invalid-name',
    })
  })

  it('rejects when the room is full', () => {
    let state = createRoom('ABCD')
    for (let i = 0; i < MAX_PLAYERS; i++) state = join(state, `p${i}`, `P${i}`)
    expect(joinRoom(state, { playerId: 'late', name: 'Sen', avatar: fox }, 0)).toEqual({
      ok: false,
      reason: 'room-full',
    })
  })

  it('resumes a known playerId with its name and score intact', () => {
    let state = join(createRoom('ABCD'), 'p1', 'Anna')
    state = { ...state, players: state.players.map((p) => ({ ...p, score: 1200 })) }
    state = disconnectPlayer(state, 'p1')

    const result = joinRoom(state, { playerId: 'p1', name: 'Something else', avatar: { emoji: '🐼', color: 'blue' } }, 5)
    expect(result.ok && result.resumed).toBe(true)
    if (!result.ok) return
    expect(result.player).toMatchObject({ name: 'Anna', score: 1200, avatar: fox, connected: true })
    expect(result.state.players).toHaveLength(1)
    expect(result.state.lastSeen.p1).toBe(5)
  })

  it('allows late joins after the game has started', () => {
    const started: RoomState = { ...join(createRoom('ABCD'), 'p1', 'Anna'), phase: 'playing' }
    const result = joinRoom(started, { playerId: 'p2', name: 'Bo', avatar: fox }, 0)
    expect(result).toMatchObject({ ok: true, resumed: false })
    expect(result.ok && result.state.phase).toBe('playing')
  })
})

describe('heartbeats and disconnects', () => {
  it('marks players stale after the timeout and back when they ping', () => {
    let state = join(createRoom('ABCD'), 'p1', 'Anna', 0)
    state = join(state, 'p2', 'Bo', 0)
    state = touchPlayer(state, 'p2', 8_000)

    state = sweepStale(state, 11_000, 10_000)
    expect(state.players.map((p) => p.connected)).toEqual([false, true])

    state = touchPlayer(state, 'p1', 12_000)
    expect(state.players[0].connected).toBe(true)
  })

  it('returns the same object when nothing is stale, so the UI does not re-render', () => {
    const state = join(createRoom('ABCD'), 'p1', 'Anna', 0)
    expect(sweepStale(state, 1_000, 10_000)).toBe(state)
  })

  it('does not change the players array on a plain heartbeat', () => {
    const state = join(createRoom('ABCD'), 'p1', 'Anna', 0)
    expect(touchPlayer(state, 'p1', 1_000).players).toBe(state.players)
  })

  it('ignores heartbeats from unknown players', () => {
    const state = createRoom('ABCD')
    expect(touchPlayer(state, 'ghost', 1)).toBe(state)
  })

  it('disconnects without removing', () => {
    const state = disconnectPlayer(join(createRoom('ABCD'), 'p1', 'Anna'), 'p1')
    expect(state.players).toHaveLength(1)
    expect(state.players[0].connected).toBe(false)
  })

  it('disconnectAll marks everyone offline', () => {
    const state = disconnectAll(join(join(createRoom('ABCD'), 'p1', 'Anna'), 'p2', 'Bo'))
    expect(state.players.every((p) => !p.connected)).toBe(true)
  })
})

describe('kickPlayer', () => {
  it('removes the player, frees the name and blocks the playerId', () => {
    const state = kickPlayer(join(createRoom('ABCD'), 'p1', 'Anna'), 'p1')
    expect(state.players).toHaveLength(0)
    expect(joinRoom(state, { playerId: 'p1', name: 'Anna', avatar: fox }, 0)).toEqual({ ok: false, reason: 'kicked' })
    expect(joinRoom(state, { playerId: 'p2', name: 'Anna', avatar: fox }, 0).ok).toBe(true)
  })
})

describe('canStart', () => {
  it('needs at least one connected player', () => {
    const empty = createRoom('ABCD')
    expect(canStart(empty)).toBe(false)
    expect(canStart(disconnectPlayer(join(empty, 'p1', 'Anna'), 'p1'))).toBe(false)
    expect(canStart(join(empty, 'p1', 'Anna'))).toBe(true)
  })

  it('is false once the game is under way', () => {
    expect(canStart({ ...join(createRoom('ABCD'), 'p1', 'Anna'), phase: 'playing' })).toBe(false)
  })
})

describe('toPlayerView', () => {
  it('exposes only what the phone needs', () => {
    const [player] = join(createRoom('ABCD'), 'p1', 'Anna').players
    expect(toPlayerView(player)).toEqual({ id: 'p1', name: 'Anna', avatar: fox, score: 0 })
  })
})
