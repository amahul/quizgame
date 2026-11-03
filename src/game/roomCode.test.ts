import { describe, expect, it } from 'vitest'
import { generateRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './roomCode'

describe('generateRoomCode', () => {
  it('produces a code of the right length from the safe alphabet', () => {
    const code = generateRoomCode()
    expect(code).toHaveLength(ROOM_CODE_LENGTH)
    for (const c of code) expect(ROOM_CODE_ALPHABET).toContain(c)
  })

  it('is deterministic for a given random source', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAA')
    expect(generateRoomCode(() => 0.9999)).toBe('ZZZZ')
  })

  it('never uses confusing characters', () => {
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z]+$/)
    for (const c of 'IO01') expect(ROOM_CODE_ALPHABET).not.toContain(c)
  })
})

describe('normalizeRoomCode', () => {
  it('uppercases and trims', () => {
    expect(normalizeRoomCode('  abcd ')).toBe('ABCD')
  })

  it('rejects wrong length, digits and ambiguous letters', () => {
    expect(normalizeRoomCode('ABC')).toBeNull()
    expect(normalizeRoomCode('ABCDE')).toBeNull()
    expect(normalizeRoomCode('AB0D')).toBeNull()
    expect(normalizeRoomCode('ABID')).toBeNull()
    expect(normalizeRoomCode('AB2D')).toBeNull()
  })
})
