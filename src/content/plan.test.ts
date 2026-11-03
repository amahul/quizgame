import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '../rounds/music/track'
import { catalog } from './catalog'
import {
  availableCount,
  buildGamePlan,
  looksSwedish,
  musicChoiceQuestions,
  optionSimilarity,
  pickItems,
  usageKey,
  type PlanContext,
} from './plan'
import type { Pack } from './schema'
import { presetSetup, reorderRounds, testRunSetup, type GameSetup, type RoundKey } from './setup'

const trivia = (id: string, region: Pack['region'], n: number, difficulty: Pack['difficulty'] = 'medium'): Pack => ({
  id,
  name: id,
  roundType: 'trivia',
  language: 'sv',
  region,
  difficulty,
  items: Array.from({ length: n }, (_, i) => ({ id: `q${i}`, question: `${id} ${i}?`, options: ['a', 'b'], correct: 0 })),
})

const themes = (id: string, n: number): Pack => ({
  id,
  name: id,
  roundType: 'letters',
  variant: 'themes',
  theme: id,
  language: 'sv',
  region: 'internationellt',
  difficulty: 'easy',
  items: Array.from({ length: n }, (_, i) => ({ id: `w${i}`, prompt: `${id} ${i}`, answer: `ord${i}` })),
})

const only = (keys: Partial<Record<RoundKey, number>>, extra: Partial<GameSetup> = {}): GameSetup => ({
  ...presetSetup('classic'),
  ...extra,
  rounds: presetSetup('classic').rounds.map((r) => ({
    ...r,
    enabled: r.key in keys,
    count: keys[r.key] ?? r.count,
  })),
})

const ctx = (packs: Pack[], extra: Partial<PlanContext> = {}): PlanContext => ({
  packs,
  used: new Set(),
  playerCount: 4,
  random: () => 0.5,
  ...extra,
})

describe('pickItems', () => {
  it('prefers unused items and only then reuses old ones', () => {
    const pack = trivia('t', 'sverige', 5)
    const used = new Set(['t/q0', 't/q1', 't/q2'].map(String))
    const picked = pickItems([pack], 4, () => true, ctx([pack], { used }))
    const ids = picked.map((p) => p.item.id)
    expect(ids.slice(0, 2).sort()).toEqual(['q3', 'q4'])
    expect(ids).toHaveLength(4)
  })

  it('alternates between packs so themes mix', () => {
    const a = themes('a', 3)
    const b = themes('b', 3)
    const picked = pickItems([a, b], 4, () => true, ctx([a, b]))
    expect(picked.map((p) => p.pack.id).sort()).toEqual(['a', 'a', 'b', 'b'])
    expect(picked[0].pack.id).not.toBe(picked[1].pack.id)
  })
})

describe('buildGamePlan', () => {
  it('builds enabled rounds in setup order and reports what it picked', () => {
    const packs = [trivia('t', 'sverige', 10), themes('th', 10)]
    const plan = buildGamePlan(reorderRounds(only({ themes: 3, trivia: 4 }), ['themes', 'trivia']), ctx(packs))
    expect(plan.rounds.map((r) => r.titleKey)).toEqual(['themes', 'trivia'])
    expect(plan.picked).toHaveLength(7)
  })

  it('applies region and difficulty filters, item overrides included', () => {
    const se = trivia('se', 'sverige', 3)
    const world = trivia('world', 'internationellt', 3)
    world.items[0] = { ...world.items[0], region: 'sverige' }
    const plan = buildGamePlan(only({ trivia: 30 }, { region: 'sverige' }), ctx([se, world]))
    expect(plan.picked.sort()).toEqual(['se/q0', 'se/q1', 'se/q2', 'world/q0'])

    const hard = trivia('hard', 'sverige', 2, 'hard')
    expect(availableCount(only({ trivia: 5 }).rounds[0], { ...only({ trivia: 5 }), difficulty: 'hard' }, [se, hard])).toBe(2)
  })

  it('turns music race tracks into four-option questions, alternating artist and title', () => {
    const tracks: MusicTrack[] = ['ABBA', 'Roxette', 'Europe', 'Robyn', 'Avicii'].map((artist, i) => ({
      id: `t${i}`,
      artist,
      title: `Låt ${i}`,
      source: { kind: 'deezer', deezerId: i + 1 },
    }))
    const questions = musicChoiceQuestions(tracks.slice(0, 2), tracks, () => 0.3)
    expect(questions.map((q) => q.field)).toEqual(['artist', 'title'])
    for (const q of questions) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options[q.correct]).toBe(q.track[q.field])
    }
  })

  it('picks wrong options that resemble the right answer: same region and era first', () => {
    const t = (artist: string, title: string, year: number, region: string): MusicTrack => ({
      id: artist,
      artist,
      title,
      year,
      region,
      source: { kind: 'deezer', deezerId: 1 },
    })
    const pool = [
      t('Tomas Ledin', 'Sommaren är kort', 1981, 'sverige'),
      t('Gyllene Tider', 'Sommartider', 1982, 'sverige'),
      t('Ted Gärdestad', 'Jag vill ha en egen måne', 1972, 'sverige'),
      t('Roxette', 'The Look', 1989, 'sverige'),
      t('Dua Lipa', 'Levitating', 2020, 'internationellt'),
      t('The Weeknd', 'Blinding Lights', 2019, 'internationellt'),
      t('Ed Sheeran', 'Shape of You', 2017, 'internationellt'),
    ]
    const [q] = musicChoiceQuestions([pool[0]], pool, () => 0.4)
    expect(q.field).toBe('artist')
    expect(q.options.filter((o) => o !== 'Tomas Ledin').sort()).toEqual(['Gyllene Tider', 'Roxette', 'Ted Gärdestad'])
    expect(optionSimilarity(pool[0], pool[1], 'title')).toBeGreaterThan(optionSimilarity(pool[0], pool[4], 'title'))
  })

  it('prefers Swedish-language titles for a Swedish-language title', () => {
    expect(looksSwedish('Jag vill ha en egen måne')).toBe(true)
    expect(looksSwedish('Vem vet')).toBe(true)
    expect(looksSwedish('The Final Countdown')).toBe(false)
    const t = (title: string): MusicTrack => ({ id: title, artist: title, title, year: 1980, region: 'sverige', source: { kind: 'deezer', deezerId: 1 } })
    const mane = t('Jag vill ha en egen måne')
    expect(optionSimilarity(mane, t('Sommaren är kort'), 'title')).toBeGreaterThan(optionSimilarity(mane, t('The Final Countdown'), 'title'))
  })

  it('offers fewer options when the pool is small, never repeating the right answer', () => {
    const two: MusicTrack[] = ['A', 'a'].map((artist, i) => ({ id: `${i}`, artist, title: `T${i}`, source: { kind: 'deezer', deezerId: i + 1 } }))
    const [q] = musicChoiceQuestions([two[0]], two, () => 0.1)
    expect(q.options).toEqual(['A'])
  })

  it('never repeats an item within one game, even across rounds sharing packs', () => {
    const tracks: Pack = {
      id: 'm',
      name: 'm',
      roundType: 'music',
      language: 'sv',
      region: 'blandat',
      difficulty: 'medium',
      items: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, artist: `A${i}`, title: `T${i}`, deezerId: i + 1 })),
    }
    const plan = buildGamePlan(only({ musicRace: 4, musicBuzzer: 4 }), ctx([tracks]))
    expect(new Set(plan.picked).size).toBe(plan.picked.length)
    expect(plan.picked).toHaveLength(6)
  })

  it('picks Skicka vidare questions per player and skips rounds with nothing available', () => {
    const pass: Pack = {
      id: 'p',
      name: 'p',
      roundType: 'pass',
      language: 'sv',
      region: 'blandat',
      difficulty: 'medium',
      items: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, category: 'K', question: `Q${i}?`, answers: ['x'] })),
    }
    const plan = buildGamePlan(only({ pass: 2, trivia: 5 }), ctx([pass], { playerCount: 3 }))
    expect(plan.rounds).toHaveLength(1)
    expect(plan.rounds[0]).toMatchObject({ type: 'pass', questionsPerPlayer: 2 })
    expect(plan.rounds[0].type === 'pass' && plan.rounds[0].questions).toHaveLength(6)
  })

  it('uses local tracks for music rounds when given, without marking them used', () => {
    const local: MusicTrack[] = ['a', 'b', 'c'].map((n) => ({ id: `local:${n}`, artist: n, title: n, source: { kind: 'local', fileKey: n } }))
    const plan = buildGamePlan(only({ musicRace: 2, musicBuzzer: 2 }), ctx([], { localTracks: local }))
    const ids = plan.rounds.flatMap((r) =>
      r.type === 'musicRace' ? r.questions.map((q) => q.track.id) : r.type === 'musicBuzzer' ? r.tracks.map((t) => t.id) : [],
    )
    expect(ids.sort()).toEqual(['local:a', 'local:b', 'local:c'])
    expect(plan.picked).toEqual([])
  })

  it('builds every round of Klassisk kväll from the real catalog', () => {
    const plan = buildGamePlan(presetSetup('classic'), ctx([...catalog]))
    expect(plan.rounds.map((r) => r.titleKey)).toEqual(['trivia', 'closest', 'pass', 'proverbs', 'themes', 'musicRace', 'musicBuzzer'])
  })

  it('test mode gives every round exactly one question, Skicka vidare included', () => {
    const plan = buildGamePlan(testRunSetup(presetSetup('classic')), ctx([...catalog], { playerCount: 1 }))
    expect(plan.rounds).toHaveLength(7)
    const sizes = plan.rounds.map((r) => {
      switch (r.type) {
        case 'trivia':
        case 'closest':
        case 'pass':
          return r.questions.length
        case 'letters':
          return r.items.length
        case 'musicRace':
          return r.questions.length
        case 'musicBuzzer':
          return r.tracks.length
      }
    })
    expect(sizes).toEqual([1, 1, 1, 1, 1, 1, 1])
  })

  it('Bara Sverige only picks Swedish content', () => {
    const plan = buildGamePlan(presetSetup('sweden'), ctx([...catalog]))
    const regions = plan.picked.map((key) => {
      const [packId, itemId] = key.split('/')
      const pack = catalog.find((p) => p.id === packId)!
      const item = pack.items.find((i) => i.id === itemId)!
      return item.region ?? pack.region
    })
    expect(new Set(regions)).toEqual(new Set(['sverige']))
    expect(plan.rounds.length).toBeGreaterThanOrEqual(5)
  })

  it('uses stable usage keys', () => {
    expect(usageKey('pack', 'item')).toBe('pack/item')
  })
})
