import { describe, expect, it } from 'vitest'
import { parseClientMessage } from './protocol'

const avatar = { emoji: '🦊', color: 'red' }

describe('parseClientMessage', () => {
  it('accepts a valid join and strips extra fields', () => {
    expect(parseClientMessage({ type: 'join', playerId: 'abc', name: 'Anna', avatar: { ...avatar, x: 1 }, admin: true })).toEqual({
      type: 'join',
      playerId: 'abc',
      name: 'Anna',
      avatar,
    })
  })

  it('accepts ping', () => {
    expect(parseClientMessage({ type: 'ping' })).toEqual({ type: 'ping' })
  })

  it('delegates round intents to the round definitions', () => {
    expect(parseClientMessage({ type: 'trivia-answer', questionIndex: 0, choice: 3 })).toEqual({
      type: 'trivia-answer',
      questionIndex: 0,
      choice: 3,
    })
    expect(parseClientMessage({ type: 'pass-answer', questionIndex: 1, text: 'ABBA', extra: 1 })).toEqual({
      type: 'pass-answer',
      questionIndex: 1,
      text: 'ABBA',
    })
    expect(parseClientMessage({ type: 'trivia-answer', questionIndex: 0, choice: 9 })).toBeNull()
  })

  it('only accepts plain playerIds', () => {
    expect(parseClientMessage({ type: 'join', playerId: '__proto__', name: 'Anna', avatar })).toBeNull()
    expect(parseClientMessage({ type: 'join', playerId: 'a b', name: 'Anna', avatar })).toBeNull()
  })

  it('rejects malformed joins', () => {
    expect(parseClientMessage({ type: 'join', playerId: '', name: 'Anna', avatar })).toBeNull()
    expect(parseClientMessage({ type: 'join', playerId: 'x'.repeat(65), name: 'Anna', avatar })).toBeNull()
    expect(parseClientMessage({ type: 'join', playerId: 'abc', name: 42, avatar })).toBeNull()
    expect(parseClientMessage({ type: 'join', playerId: 'abc', name: 'x'.repeat(65), avatar })).toBeNull()
    expect(parseClientMessage({ type: 'join', playerId: 'abc', name: 'Anna', avatar: { emoji: '💣', color: 'red' } })).toBeNull()
  })

  it('rejects unknown types and non-objects', () => {
    expect(parseClientMessage({ type: 'welcome' })).toBeNull()
    expect(parseClientMessage({})).toBeNull()
    expect(parseClientMessage(null)).toBeNull()
    expect(parseClientMessage('ping')).toBeNull()
  })
})
