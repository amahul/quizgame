import { describe, expect, it } from 'vitest'
import {
  estimateMinutes,
  parseSetup,
  PRESET_IDS,
  presetSetup,
  reorderRounds,
  ROUND_INFO,
  ROUND_KEYS,
  updateRound,
} from './setup'

describe('presets', () => {
  it('each preset lists every round once', () => {
    for (const id of PRESET_IDS) {
      expect(presetSetup(id).rounds.map((r) => r.key).sort()).toEqual([...ROUND_KEYS].sort())
    }
  })

  it('Klassisk kväll and Bara Sverige play every round; Bara Sverige filters to Sweden', () => {
    expect(presetSetup('classic').rounds.every((r) => r.enabled)).toBe(true)
    expect(presetSetup('sweden')).toMatchObject({ region: 'sverige' })
    expect(presetSetup('sweden').rounds.every((r) => r.enabled)).toBe(true)
  })

  it('Snabb runda is four rounds of about 15 minutes', () => {
    const quick = presetSetup('quick')
    expect(quick.rounds.filter((r) => r.enabled)).toHaveLength(4)
    expect(estimateMinutes(quick)).toBeGreaterThanOrEqual(13)
    expect(estimateMinutes(quick)).toBeLessThanOrEqual(17)
  })

  it('Musikkväll only plays music', () => {
    expect(presetSetup('music').rounds.filter((r) => r.enabled).map((r) => r.key)).toEqual(['musicRace', 'musicBuzzer'])
  })
})

describe('estimateMinutes', () => {
  it('counts per-player rounds by player count', () => {
    const passOnly = { ...presetSetup('classic'), rounds: presetSetup('classic').rounds.map((r) => ({ ...r, enabled: r.key === 'pass' })) }
    const seconds = (players: number) => 60 + 2 * players * ROUND_INFO.pass.secondsPerItem
    expect(estimateMinutes(passOnly, 3)).toBe(Math.round(seconds(3) / 60))
    expect(estimateMinutes(passOnly, 10)).toBe(Math.round(seconds(10) / 60))
  })
})

describe('editing', () => {
  it('updateRound clamps the count and marks the setup custom', () => {
    const edited = updateRound(presetSetup('classic'), 'trivia', { count: 999, packId: 'x' })
    expect(edited.preset).toBe('custom')
    expect(edited.rounds.find((r) => r.key === 'trivia')).toMatchObject({ count: ROUND_INFO.trivia.maxCount, packId: 'x' })
  })

  it('reorderRounds follows the given order', () => {
    const order = [...ROUND_KEYS].reverse()
    expect(reorderRounds(presetSetup('classic'), order).rounds.map((r) => r.key)).toEqual(order)
  })
})

describe('parseSetup', () => {
  it('round-trips a valid setup', () => {
    const setup = updateRound(presetSetup('quick'), 'themes', { count: 7 })
    expect(parseSetup(JSON.parse(JSON.stringify(setup)))).toEqual(setup)
  })

  it('rejects junk', () => {
    expect(parseSetup(null)).toBeNull()
    expect(parseSetup({ preset: 'nope' })).toBeNull()
  })

  it('repairs old or tampered setups', () => {
    const stored = {
      preset: 'custom',
      region: 'alla',
      difficulty: 'easy',
      rounds: [
        { key: 'themes', enabled: true, packId: null, count: 500 },
        { key: 'themes', enabled: false, packId: null, count: 5 },
      ],
    }
    const parsed = parseSetup(stored)!
    expect(parsed.rounds[0]).toMatchObject({ key: 'themes', enabled: true, count: ROUND_INFO.themes.maxCount })
    expect(parsed.rounds.map((r) => r.key).sort()).toEqual([...ROUND_KEYS].sort())
    expect(parsed.rounds.slice(1).every((r) => !r.enabled)).toBe(true)
  })
})
