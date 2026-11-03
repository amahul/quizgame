import { describe, expect, it } from 'vitest'
import { noteHz } from '.'

describe('noteHz', () => {
  it('converts note names to frequencies', () => {
    expect(noteHz('A4')).toBe(440)
    expect(noteHz('A5')).toBe(880)
    expect(noteHz('C4')).toBeCloseTo(261.63, 1)
    expect(noteHz('F#3')).toBeCloseTo(185.0, 1)
    expect(noteHz('Bb3')).toBeCloseTo(233.08, 1)
  })

  it('rejects nonsense', () => {
    expect(() => noteHz('H2')).toThrow()
  })
})
