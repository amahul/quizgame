import { describe, expect, it } from 'vitest'
import { editDistance, matchAnswer, normalizeAnswer } from './matcher'

describe('normalizeAnswer', () => {
  it('lowercases, folds accents and strips punctuation', () => {
    expect(normalizeAnswer('  Vänern! ')).toBe('vanern')
    expect(normalizeAnswer('Côte d’Ivoire')).toBe('cote d ivoire')
  })

  it('drops a leading article but not a lone word', () => {
    expect(normalizeAnswer('The Beatles')).toBe('beatles')
    expect(normalizeAnswer('en älg')).toBe('alg')
    expect(normalizeAnswer('A')).toBe('a')
  })
})

describe('editDistance', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('', 'abc')).toBe(3)
    expect(editDistance('same', 'same')).toBe(0)
  })
})

describe('matchAnswer', () => {
  it('matches any alias regardless of case, accents and spacing', () => {
    expect(matchAnswer('jarn', ['Järn', 'Iron'])).toEqual({ correct: true, matched: 'Järn' })
    expect(matchAnswer('IRON', ['Järn', 'Iron'])).toEqual({ correct: true, matched: 'Iron' })
    expect(matchAnswer('new york', ['NewYork'])).toMatchObject({ correct: true })
    expect(matchAnswer('the beatles', ['Beatles'])).toMatchObject({ correct: true })
  })

  it('forgives small typos in longer words', () => {
    expect(matchAnswer('Stokholm', ['Stockholm']).correct).toBe(true)
    expect(matchAnswer('Canbera', ['Canberra']).correct).toBe(true)
    expect(matchAnswer('Argentinia', ['Argentina']).correct).toBe(true)
  })

  it('forgives proportionally more in whole sentences', () => {
    const proverb = ['Man ska inte sälja skinnet förrän björnen är skjuten']
    expect(matchAnswer('man ska inte salja skinet innan björnen är skjuten', proverb).correct).toBe(true)
    expect(matchAnswer('Som man bäddar så får man ligga', ['Som man bäddar får man ligga']).correct).toBe(true)
    expect(matchAnswer('Man ska inte sälja björnen', proverb).correct).toBe(false)
  })

  it('is strict about short words and numbers', () => {
    expect(matchAnswer('Rim', ['Rom']).correct).toBe(false)
    expect(matchAnswer('1524', ['1523']).correct).toBe(false)
    expect(matchAnswer('1523', ['1523']).correct).toBe(true)
  })

  it('rejects clearly different answers and empty input', () => {
    expect(matchAnswer('Sydney', ['Canberra']).correct).toBe(false)
    expect(matchAnswer('   ', ['Canberra'])).toEqual({ correct: false, matched: null })
    expect(matchAnswer('!!!', ['Canberra']).correct).toBe(false)
  })
})
