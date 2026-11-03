/** "+200", "−100" (with a real minus sign) or "0". */
export function formatPoints(points: number): string {
  if (points > 0) return `+${points}`
  if (points < 0) return `−${-points}`
  return '0'
}

/** Milliseconds as seconds with a Swedish decimal comma, e.g. "4,2". */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * A guess or answer in Swedish style: "1 665", "42,195", "96 %". Years skip the
 * thousands separator ("1789", not "1 789").
 */
export function formatNumber(value: number, opts: { unit?: string; year?: boolean } = {}): string {
  const text = value.toLocaleString('sv-SE', { maximumFractionDigits: 3, useGrouping: !opts.year })
  return opts.unit ? `${text} ${opts.unit}` : text
}

/** A total score; negative totals get a real minus sign too. */
export function formatScore(score: number): string {
  return score < 0 ? `−${-score}` : String(score)
}
