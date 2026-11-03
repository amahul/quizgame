// A game setup: which rounds, in which order, with which packs and how many
// questions. Pure; the builder UI edits it and plan.ts turns it into a game.
import { z } from 'zod'
import type { RoundTitleKey } from '../rounds'
import { DIFFICULTIES, type Difficulty, type PackRoundType } from './schema'

/** A round as the host sees it in the builder (letters appears twice, as two rounds). */
export type RoundKey = RoundTitleKey

export interface RoundInfo {
  packType: PackRoundType
  /** For letters packs: which of the two letters rounds can use the pack. */
  variant?: 'proverbs' | 'themes'
  defaultCount: number
  minCount: number
  maxCount: number
  /** Count means "questions per player" (Skicka vidare). */
  perPlayer?: boolean
  /** Rough time per question, for the length estimate. */
  secondsPerItem: number
}

export const ROUND_INFO: Record<RoundKey, RoundInfo> = {
  trivia: { packType: 'trivia', defaultCount: 12, minCount: 3, maxCount: 30, secondsPerItem: 30 },
  closest: { packType: 'closest', defaultCount: 8, minCount: 3, maxCount: 20, secondsPerItem: 35 },
  pass: { packType: 'pass', defaultCount: 2, minCount: 1, maxCount: 4, perPlayer: true, secondsPerItem: 40 },
  proverbs: { packType: 'letters', variant: 'proverbs', defaultCount: 8, minCount: 3, maxCount: 20, secondsPerItem: 40 },
  themes: { packType: 'letters', variant: 'themes', defaultCount: 10, minCount: 3, maxCount: 20, secondsPerItem: 25 },
  musicRace: { packType: 'music', defaultCount: 8, minCount: 3, maxCount: 15, secondsPerItem: 35 },
  musicBuzzer: { packType: 'music', defaultCount: 8, minCount: 3, maxCount: 15, secondsPerItem: 40 },
}

/** Every round in its default order. */
export const ROUND_KEYS: RoundKey[] = ['trivia', 'closest', 'pass', 'proverbs', 'themes', 'musicRace', 'musicBuzzer']

/** Intro + standings per round. */
export const ROUND_OVERHEAD_SECONDS = 60
/** Player count assumed for estimates before anyone has joined. */
export const ESTIMATE_PLAYERS = 6

export type RegionFilter = 'alla' | 'sverige' | 'internationellt'
export type DifficultyFilter = 'alla' | Difficulty
export type PresetId = 'classic' | 'quick' | 'music' | 'sweden'

export interface RoundConfig {
  key: RoundKey
  enabled: boolean
  /** A specific pack, or null for all matching packs. */
  packId: string | null
  count: number
}

export interface GameSetup {
  preset: PresetId | 'custom'
  rounds: RoundConfig[]
  region: RegionFilter
  difficulty: DifficultyFilter
}

export const PRESET_IDS: PresetId[] = ['classic', 'quick', 'music', 'sweden']

const allRounds = (overrides: Partial<Record<RoundKey, Partial<RoundConfig>>>, enabledByDefault: boolean): RoundConfig[] =>
  ROUND_KEYS.map((key) => ({
    key,
    enabled: enabledByDefault,
    packId: null,
    count: ROUND_INFO[key].defaultCount,
    ...overrides[key],
  }))

export function presetSetup(preset: PresetId): GameSetup {
  switch (preset) {
    case 'classic':
      // Every round there is.
      return { preset, rounds: allRounds({}, true), region: 'alla', difficulty: 'alla' }
    case 'quick':
      // About 15 minutes: four short rounds.
      return {
        preset,
        rounds: allRounds(
          {
            trivia: { enabled: true, count: 6 },
            themes: { enabled: true, count: 6 },
            proverbs: { enabled: true, count: 5 },
            musicRace: { enabled: true, count: 5 },
          },
          false,
        ),
        region: 'alla',
        difficulty: 'alla',
      }
    case 'music':
      return {
        preset,
        rounds: allRounds({ musicRace: { enabled: true, count: 15 }, musicBuzzer: { enabled: true, count: 15 } }, false),
        region: 'alla',
        difficulty: 'alla',
      }
    case 'sweden':
      return { preset, rounds: allRounds({}, true), region: 'sverige', difficulty: 'alla' }
  }
}

/** Changes one round; any edit turns the setup into a custom one. */
export function updateRound(setup: GameSetup, key: RoundKey, patch: Partial<Omit<RoundConfig, 'key'>>): GameSetup {
  const { minCount, maxCount } = ROUND_INFO[key]
  return {
    ...setup,
    preset: 'custom',
    rounds: setup.rounds.map((r) => {
      if (r.key !== key) return r
      const next = { ...r, ...patch }
      return { ...next, count: Math.min(maxCount, Math.max(minCount, next.count)) }
    }),
  }
}

/** Puts the rounds in the given order (keys not listed keep their relative order at the end). */
export function reorderRounds(setup: GameSetup, order: readonly RoundKey[]): GameSetup {
  const byKey = new Map(setup.rounds.map((r) => [r.key, r]))
  const ordered = order.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []))
  const rest = setup.rounds.filter((r) => !order.includes(r.key))
  return { ...setup, preset: 'custom', rounds: [...ordered, ...rest] }
}

/** The hidden test mode: every enabled round gets exactly one question. */
export function testRunSetup(setup: GameSetup): GameSetup {
  return { ...setup, rounds: setup.rounds.map((r) => ({ ...r, count: 1 })) }
}

export function estimateMinutes(setup: GameSetup, playerCount = ESTIMATE_PLAYERS): number {
  const seconds = setup.rounds
    .filter((r) => r.enabled)
    .reduce((sum, r) => {
      const info = ROUND_INFO[r.key]
      const items = info.perPlayer ? r.count * Math.max(1, playerCount) : r.count
      return sum + ROUND_OVERHEAD_SECONDS + items * info.secondsPerItem
    }, 0)
  return Math.round(seconds / 60)
}

const setupSchema = z.object({
  preset: z.enum([...PRESET_IDS, 'custom']),
  rounds: z.array(
    z.object({
      key: z.enum(ROUND_KEYS as [RoundKey, ...RoundKey[]]),
      enabled: z.boolean(),
      packId: z.string().nullable(),
      count: z.number().int(),
    }),
  ),
  region: z.enum(['alla', 'sverige', 'internationellt']),
  difficulty: z.enum(['alla', ...DIFFICULTIES]),
})

/**
 * Reads a stored setup. Invalid data gives null; counts are clamped, unknown or
 * repeated rounds dropped and rounds added since it was saved appended (disabled).
 */
export function parseSetup(data: unknown): GameSetup | null {
  const parsed = setupSchema.safeParse(data)
  if (!parsed.success) return null
  const seen = new Set<RoundKey>()
  const rounds: RoundConfig[] = []
  for (const r of parsed.data.rounds) {
    if (seen.has(r.key)) continue
    seen.add(r.key)
    const { minCount, maxCount } = ROUND_INFO[r.key]
    rounds.push({ ...r, count: Math.min(maxCount, Math.max(minCount, r.count)) })
  }
  for (const key of ROUND_KEYS) {
    if (!seen.has(key)) rounds.push({ key, enabled: false, packId: null, count: ROUND_INFO[key].defaultCount })
  }
  return { ...parsed.data, rounds }
}
