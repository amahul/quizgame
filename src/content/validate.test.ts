import { describe, expect, it } from 'vitest'
import { validatePacks, type RawPack } from './validate'

const modules = import.meta.glob('./**/*.json', { eager: true, import: 'default' })
const real = validatePacks(Object.entries(modules).map(([source, data]) => ({ source, data })))

const triviaPack = (id: string, items: unknown[]) => ({
  id,
  name: id,
  roundType: 'trivia',
  language: 'sv',
  region: 'sverige',
  difficulty: 'easy',
  items,
})
const q = (id: string, question: string, extra: object = {}) => ({
  id,
  question,
  options: ['a', 'b', 'c', 'd'],
  correct: 0,
  ...extra,
})
const run = (...packs: object[]): ReturnType<typeof validatePacks> =>
  validatePacks(packs.map((data, i): RawPack => ({ source: `p${i}.json`, data })))

describe('the bundled content', () => {
  it('is valid', () => {
    expect(real.errors).toEqual([])
  })

  it('has the promised amounts', () => {
    const count = (pred: (p: (typeof real.packs)[number]) => boolean) =>
      real.packs.filter(pred).reduce((n, p) => n + p.items.length, 0)
    expect(count((p) => p.roundType === 'trivia')).toBeGreaterThanOrEqual(60)
    expect(count((p) => p.roundType === 'pass')).toBeGreaterThanOrEqual(40)
    expect(count((p) => p.roundType === 'letters' && p.variant === 'proverbs')).toBeGreaterThanOrEqual(40)
    expect(count((p) => p.roundType === 'music')).toBeGreaterThanOrEqual(40)
    for (const [id, min] of [['tema-yrken', 25], ['tema-artister', 25], ['tema-stader', 25], ['tema-filmcitat', 20]] as const) {
      expect(real.packs.find((p) => p.id === id)?.items.length).toBeGreaterThanOrEqual(min)
    }
  })

  it('has plenty of trivia about both Sweden and the world, and passes across 8+ categories', () => {
    const trivia = real.packs.filter((p) => p.roundType === 'trivia')
    const swedish = trivia.flatMap((p) => p.items.filter((i) => (i.region ?? p.region) === 'sverige'))
    const total = trivia.reduce((n, p) => n + p.items.length, 0)
    expect(swedish.length).toBeGreaterThanOrEqual(30)
    expect(total - swedish.length).toBeGreaterThanOrEqual(30)
    const categories = new Set(real.packs.flatMap((p) => (p.roundType === 'pass' ? p.items.map((i) => i.category) : [])))
    expect(categories.size).toBeGreaterThanOrEqual(8)
  })
})

describe('validatePacks', () => {
  it('accepts a good pack', () => {
    const report = run(triviaPack('ok', [q('one', 'Fråga?')]))
    expect(report.errors).toEqual([])
    expect(report.packs).toHaveLength(1)
  })

  it('reports schema problems with their path', () => {
    const report = run(triviaPack('bad', [q('one', 'Fråga?', { correct: 7 })]), { id: 'Bad Id!', roundType: 'quiz' })
    expect(report.errors.some((e) => e.includes('items.0.correct'))).toBe(true)
    expect(report.errors.some((e) => e.startsWith('p1.json'))).toBe(true)
    expect(report.packs).toHaveLength(0)
  })

  it('rejects duplicate options and missing music sources', () => {
    const dupOptions = run(triviaPack('t', [q('one', 'Fråga?', { options: ['Ja', 'ja', 'Nej'] })]))
    expect(dupOptions.errors.some((e) => e.includes('unique'))).toBe(true)
    const music = run({ ...triviaPack('m', []), roundType: 'music', items: [{ id: 'x', artist: 'A', title: 'T' }] })
    expect(music.errors.some((e) => e.includes('deezerId or a search'))).toBe(true)
  })

  it('flags duplicate pack ids, item ids and questions', () => {
    const report = run(
      triviaPack('same', [q('one', 'Vilken färg har himlen?'), q('one', 'Annan fråga?')]),
      triviaPack('same', [q('two', 'vilken färg har HIMLEN')]),
    )
    expect(report.errors.some((e) => e.includes('pack id "same"'))).toBe(true)
    expect(report.errors.some((e) => e.includes('duplicate item id "one"'))).toBe(true)
    expect(report.errors.some((e) => e.includes('duplicates same/one'))).toBe(true)
  })

  it('lists items that need verification and warns about short option lists', () => {
    const report = run(triviaPack('v', [q('one', 'Fråga?', { verify: true, options: ['a', 'b'] })]))
    expect(report.needsVerification).toEqual(['v/one'])
    expect(report.warnings).toHaveLength(1)
  })
})
