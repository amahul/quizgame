import { describe, expect, it } from 'vitest'
import {
  clipElapsed,
  idleClip,
  matchesArtist,
  matchesTitle,
  pauseClip,
  resumeClip,
  speedPoints,
  startClip,
  type MusicTrack,
} from './track'

const track: MusicTrack = {
  id: 't',
  artist: 'Håkan Hellström',
  title: 'Känn ingen sorg för mig Göteborg',
  artistAliases: ['Håkan'],
  titleAliases: ['Känn ingen sorg'],
  source: { kind: 'deezer', deezerId: 1 },
}

describe('clip timing', () => {
  it('counts only time spent playing', () => {
    expect(clipElapsed(idleClip, 5000)).toBe(0)
    let clip = startClip(1000)
    expect(clipElapsed(clip, 4000)).toBe(3000)
    clip = pauseClip(clip, 4000)
    expect(clipElapsed(clip, 60_000)).toBe(3000)
    clip = resumeClip(clip, 60_000)
    expect(clipElapsed(clip, 62_000)).toBe(5000)
  })
})

describe('speedPoints', () => {
  it('falls linearly from max to min over the clip', () => {
    expect(speedPoints(0, 1000, 100)).toBe(1000)
    expect(speedPoints(15_000, 1000, 100)).toBe(550)
    expect(speedPoints(30_000, 1000, 100)).toBe(100)
    expect(speedPoints(99_000, 1000, 100)).toBe(100)
  })
})

describe('matching', () => {
  it('accepts names, aliases and small typos', () => {
    expect(matchesArtist('hakan hellstrom', track)).toBe(true)
    expect(matchesArtist('Håkan', track)).toBe(true)
    expect(matchesTitle('känn ingen sorg', track)).toBe(true)
    expect(matchesTitle('Göteborg', track)).toBe(false)
  })
})
