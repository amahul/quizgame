import { describe, expect, it } from 'vitest'
import { MAX_POINTS, MIN_POINTS, scoreAnswer } from './scoring'

describe('scoreAnswer', () => {
  it('gives 0 for wrong answers', () => {
    expect(scoreAnswer(false, 0, 10_000)).toBe(0)
  })

  it('gives max points for an instant correct answer', () => {
    expect(scoreAnswer(true, 0, 10_000)).toBe(MAX_POINTS)
  })

  it('gives min points at the buzzer', () => {
    expect(scoreAnswer(true, 10_000, 10_000)).toBe(MIN_POINTS)
  })

  it('scales linearly in between', () => {
    expect(scoreAnswer(true, 5_000, 10_000)).toBe(750)
  })

  it('gives 0 for late or invalid timings', () => {
    expect(scoreAnswer(true, 10_001, 10_000)).toBe(0)
    expect(scoreAnswer(true, -1, 10_000)).toBe(0)
  })
})
