export const MAX_POINTS = 1000
export const MIN_POINTS = 500

/**
 * Points for one answer. Correct answers earn between MIN_POINTS and MAX_POINTS,
 * linearly fewer the longer the player took. Wrong or late answers earn 0.
 */
export function scoreAnswer(correct: boolean, elapsedMs: number, timeLimitMs: number): number {
  if (!correct || elapsedMs < 0 || elapsedMs > timeLimitMs) return 0
  const speed = 1 - elapsedMs / timeLimitMs
  return Math.round(MIN_POINTS + (MAX_POINTS - MIN_POINTS) * speed)
}
