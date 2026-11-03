import { describe, expect, it } from 'vitest'
import { isAudioFileName, parseTrackFileName, pickBestTrack, type DeezerTrack } from './pick'

const hit = (id: number, artist: string, title: string, rank: number, preview = 'https://x/p.mp3'): DeezerTrack => ({
  id,
  title,
  preview,
  rank,
  artist: { name: artist },
})

describe('pickBestTrack', () => {
  it('skips covers, live and acoustic versions even when they rank higher', () => {
    // Real Deezer results for "a-ha Take On Me" put the acoustic version first.
    const results = [
      hit(432951302, 'a-ha', 'Take On Me (2017 Acoustic)', 703300),
      hit(664107, 'a-ha', 'Take on Me', 988080),
      hit(412539792, 'a-ha', 'Take On Me (MTV Unplugged)', 662348),
    ]
    expect(pickBestTrack(results, 'a-ha', 'Take On Me')?.id).toBe(664107)
  })

  it('requires the same artist', () => {
    const results = [hit(2877084422, '한용진', 'ABBA - Dancing Queen', 9_000_000), hit(884025, 'ABBA', 'Dancing Queen', 941096)]
    expect(pickBestTrack(results, 'ABBA', 'Dancing Queen')?.id).toBe(884025)
  })

  it('prefers the most popular of several studio versions', () => {
    const results = [hit(5404529, 'Europe', 'The Final Countdown', 682338), hit(858371, 'Europe', 'The Final Countdown', 847358)]
    expect(pickBestTrack(results, 'Europe', 'The Final Countdown')?.id).toBe(858371)
  })

  it('returns null when nothing fits or nothing has a preview', () => {
    expect(pickBestTrack([hit(1, 'Toto', 'Rosanna', 1)], 'Toto', 'Africa')).toBeNull()
    expect(pickBestTrack([hit(1, 'Toto', 'Africa', 1, '')], 'Toto', 'Africa')).toBeNull()
  })
})

describe('parseTrackFileName', () => {
  it('reads artist and title', () => {
    expect(parseTrackFileName('ABBA - Dancing Queen.mp3')).toEqual({ artist: 'ABBA', title: 'Dancing Queen' })
    expect(parseTrackFileName('Musik/80-tal/03 - Europe - The Final Countdown.m4a')).toEqual({
      artist: 'Europe',
      title: 'The Final Countdown',
    })
    expect(parseTrackFileName('01. Håkan Hellström – Känn ingen sorg för mig Göteborg.flac')).toEqual({
      artist: 'Håkan Hellström',
      title: 'Känn ingen sorg för mig Göteborg',
    })
    expect(parseTrackFileName('a-ha - Take On Me.mp3')).toEqual({ artist: 'a-ha', title: 'Take On Me' })
    expect(parseTrackFileName('50 Cent - In Da Club.mp3')).toEqual({ artist: '50 Cent', title: 'In Da Club' })
    expect(parseTrackFileName('07) Toto - Africa.ogg')).toEqual({ artist: 'Toto', title: 'Africa' })
  })

  it('rejects names without "Artist - Title"', () => {
    expect(parseTrackFileName('track01.mp3')).toBeNull()
    expect(parseTrackFileName(' - Title.mp3')).toBeNull()
  })

  it('recognizes audio files', () => {
    expect(isAudioFileName('x.MP3')).toBe(true)
    expect(isAudioFileName('cover.jpg')).toBe(false)
  })
})
