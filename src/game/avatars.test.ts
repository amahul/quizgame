import { describe, expect, it } from 'vitest'
import { isValidAvatar, randomAvatar } from './avatars'

describe('isValidAvatar', () => {
  it('accepts a known emoji and color', () => {
    expect(isValidAvatar({ emoji: '🦊', color: 'red' })).toBe(true)
  })

  it('rejects unknown emoji, unknown color and junk', () => {
    expect(isValidAvatar({ emoji: '💩', color: 'red' })).toBe(false)
    expect(isValidAvatar({ emoji: '🦊', color: 'toString' })).toBe(false)
    expect(isValidAvatar({ emoji: '🦊' })).toBe(false)
    expect(isValidAvatar(null)).toBe(false)
    expect(isValidAvatar('🦊')).toBe(false)
  })
})

describe('randomAvatar', () => {
  it('always returns a valid avatar', () => {
    for (const r of [0, 0.5, 0.9999]) expect(isValidAvatar(randomAvatar(() => r))).toBe(true)
  })
})
