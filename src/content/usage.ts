// Which questions earlier games on this computer used, so new games prefer fresh
// ones. Stored in localStorage; every access is guarded and failures just mean
// no history.
const KEY = 'quizgame.usedItems'

export function loadUsed(): Set<string> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(data) ? data.filter((k): k is string => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

export function markUsed(keys: Iterable<string>): void {
  try {
    const used = loadUsed()
    for (const key of keys) used.add(key)
    localStorage.setItem(KEY, JSON.stringify([...used]))
  } catch {
    // History is a nicety; the game works without it.
  }
}

export function resetUsed(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to reset if storage is unavailable.
  }
}
