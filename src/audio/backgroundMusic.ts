// Background music ("hissmusik") for the lobby and while players are answering.
// Two original, looping tunes, synthesized like everything else: a laid-back one
// for the lobby and a driving one for questions. A small lookahead scheduler plays
// them through their own gain bus, so switching tunes cross-fades and stopping
// fades out (e.g. right before the drumroll).
import { getAudioContext, getOutput, noteHz } from '.'

export type BackgroundTrack = 'lobby' | 'question'

/** One note: start and length in 16th-note steps. */
export type NoteEvent = [step: number, note: string, length: number]

export interface Song {
  bpm: number
  /** Loop length in 16th-note steps. */
  steps: number
  bass: NoteEvent[]
  /** Short chord stabs: [step, notes, length]. */
  chords: [step: number, notes: string[], length: number][]
  melody: NoteEvent[]
  /** Steps with a hi-hat, and the louder (accented) ones. */
  hats: number[]
  accents: number[]
  kicks: number[]
}

/** Repeats a one-bar pattern of steps over `bars` bars of 16 steps. */
const everyBar = (steps: number[], bars: number) => Array.from({ length: bars }, (_, b) => steps.map((s) => b * 16 + s)).flat()

/** Bass for four bars: root, fifth and a pickup per bar. */
function bassLine(roots: [root: string, fifth: string][], pattern: [offset: number, which: 0 | 1, length: number][]): NoteEvent[] {
  return roots.flatMap(([root, fifth], bar) => pattern.map(([s, which, len]): NoteEvent => [bar * 16 + s, which ? fifth : root, len]))
}

// F – Dm – Gm – C, swinging along at an easy pace.
const LOBBY_CHORDS = [
  ['F4', 'A4', 'C5'],
  ['D4', 'F4', 'A4'],
  ['D4', 'G4', 'Bb4'],
  ['E4', 'G4', 'C5'],
]

export const LOBBY_SONG: Song = {
  bpm: 112,
  steps: 64,
  bass: bassLine(
    [
      ['F2', 'C3'],
      ['D2', 'A2'],
      ['G2', 'D3'],
      ['C2', 'G2'],
    ],
    [
      [0, 0, 3],
      [6, 1, 2],
      [8, 0, 3],
      [14, 1, 2],
    ],
  ),
  chords: LOBBY_CHORDS.flatMap((notes, bar) => [2, 6, 10, 14].map((s): [number, string[], number] => [bar * 16 + s, notes, 2])),
  melody: [
    [0, 'A5', 2],
    [4, 'C6', 2],
    [6, 'A5', 2],
    [8, 'F5', 4],
    [14, 'G5', 2],
    [16, 'A5', 4],
    [22, 'F5', 2],
    [24, 'D5', 6],
    [32, 'Bb5', 2],
    [34, 'A5', 2],
    [36, 'G5', 4],
    [40, 'D5', 2],
    [42, 'F5', 2],
    [44, 'G5', 4],
    [48, 'E5', 2],
    [50, 'G5', 2],
    [52, 'C6', 4],
    [56, 'Bb5', 2],
    [58, 'A5', 2],
    [60, 'G5', 4],
  ],
  hats: everyBar([2, 6, 10, 14], 4),
  accents: [],
  kicks: everyBar([0, 8], 4),
}

// Am – F – C – G, ticking along like a countdown.
const QUESTION_CHORDS = [
  ['A4', 'C5', 'E5'],
  ['F4', 'A4', 'C5'],
  ['E4', 'G4', 'C5'],
  ['D4', 'G4', 'B4'],
]
/** Chord tones arpeggiated in 8ths, an octave up: 1-3-5-3-1-3-5-8. */
const ARPEGGIO = [0, 1, 2, 1, 0, 1, 2, 3]
const octaveUp = (note: string) => note.replace(/\d$/, (d) => String(Number(d) + 1))

export const QUESTION_SONG: Song = {
  bpm: 128,
  steps: 64,
  bass: bassLine(
    [
      ['A2', 'A3'],
      ['F2', 'F3'],
      ['C3', 'C4'],
      ['G2', 'G3'],
    ],
    [0, 2, 4, 6, 8, 10, 12, 14].map((s): [number, 0 | 1, number] => [s, s === 6 || s === 14 ? 1 : 0, 1]),
  ),
  chords: QUESTION_CHORDS.flatMap((notes, bar) => [0, 3, 6, 10].map((s): [number, string[], number] => [bar * 16 + s, notes, 1])),
  melody: QUESTION_CHORDS.flatMap((notes, bar) =>
    ARPEGGIO.map((i, n): NoteEvent => [bar * 16 + n * 2, i === 3 ? octaveUp(octaveUp(notes[0])) : octaveUp(notes[i]), 1]),
  ),
  hats: Array.from({ length: 64 }, (_, i) => i),
  accents: everyBar([2, 6, 10, 14], 4),
  kicks: everyBar([0, 4, 8, 12], 4),
}

export const SONGS: Record<BackgroundTrack, Song> = { lobby: LOBBY_SONG, question: QUESTION_SONG }

// ---- Settings -----------------------------------------------------------------

const ENABLED_KEY = 'quizgame.backgroundMusic'
const listeners = new Set<() => void>()

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off'
  } catch {
    return true
  }
}

let enabled = loadEnabled()

export function getBackgroundMusicEnabled(): boolean {
  return enabled
}

export function setBackgroundMusicEnabled(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off')
  } catch {
    // Remembered for this page load only.
  }
  listeners.forEach((fn) => fn())
  play(on ? wanted : null)
}

export function subscribeBackgroundMusic(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---- Playback -----------------------------------------------------------------

/** How far ahead notes are scheduled, and how often the scheduler wakes up. */
const LOOKAHEAD_S = 0.25
const TICK_MS = 80
/** The background music sits under the effects and jingles. */
const BUS_VOLUME = 0.32
const FADE_IN_S = 0.8
const FADE_OUT_S = 0.35

interface Playing {
  track: BackgroundTrack
  bus: GainNode
  timer: ReturnType<typeof setInterval>
  step: number
  /** AudioContext time of the next step, or null until audio is running. */
  nextTime: number | null
}

let playing: Playing | null = null
/** What the game asks for, even while the music is switched off. */
let wanted: BackgroundTrack | null = null

/** Play this tune (looping), or fade out with null. Calling again with the same tune keeps it going. */
export function setBackgroundMusic(track: BackgroundTrack | null): void {
  wanted = track
  play(enabled ? track : null)
}

function play(track: BackgroundTrack | null) {
  if (playing?.track === track) return
  if (playing) stop(playing)
  playing = null
  if (!track) return
  const audio = getAudioContext()
  const bus = audio.createGain()
  bus.gain.setValueAtTime(0.0001, audio.currentTime)
  bus.connect(getOutput())
  const p: Playing = { track, bus, step: 0, nextTime: null, timer: setInterval(() => schedule(p), TICK_MS) }
  playing = p
  schedule(p)
}

function stop(p: Playing) {
  clearInterval(p.timer)
  const audio = getAudioContext()
  const t = audio.currentTime
  p.bus.gain.cancelScheduledValues(t)
  p.bus.gain.setValueAtTime(Math.max(0.0001, p.bus.gain.value), t)
  p.bus.gain.exponentialRampToValueAtTime(0.0001, t + FADE_OUT_S)
  setTimeout(() => p.bus.disconnect(), (FADE_OUT_S + LOOKAHEAD_S + 0.2) * 1000)
}

function schedule(p: Playing) {
  const audio = getAudioContext()
  // Browsers keep audio suspended until the first click; start once it runs.
  if (audio.state !== 'running') return
  const now = audio.currentTime
  if (p.nextTime === null || p.nextTime < now - 0.1) {
    if (p.nextTime === null) {
      p.bus.gain.setValueAtTime(0.0001, now)
      p.bus.gain.exponentialRampToValueAtTime(BUS_VOLUME, now + FADE_IN_S)
    }
    // First start, or the tab was in the background: carry on from now instead of catching up.
    p.nextTime = now + 0.05
  }
  const song = SONGS[p.track]
  const stepS = 60 / song.bpm / 4
  while (p.nextTime < now + LOOKAHEAD_S) {
    playStep(audio, p.bus, song, p.step % song.steps, p.nextTime, stepS)
    p.step++
    p.nextTime += stepS
  }
}

function playStep(audio: AudioContext, out: AudioNode, song: Song, step: number, t: number, stepS: number) {
  for (const [s, note, len] of song.bass) if (s === step) pluck(audio, out, noteHz(note), t, len * stepS, 'triangle', 0.32, 900)
  for (const [s, notes, len] of song.chords) {
    if (s === step) for (const note of notes) pluck(audio, out, noteHz(note), t, len * stepS, 'sine', 0.07, 3000)
  }
  for (const [s, note, len] of song.melody) if (s === step) bell(audio, out, noteHz(note), t, len * stepS)
  if (song.hats.includes(step)) hat(audio, out, t, song.accents.includes(step) ? 0.05 : 0.025)
  if (song.kicks.includes(step)) kick(audio, out, t)
}

/** A short plucked note that decays quickly (bass, marimba-like stabs). */
function pluck(audio: AudioContext, out: AudioNode, freq: number, t: number, length: number, type: OscillatorType, volume: number, cutoff: number) {
  const osc = audio.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  const gain = audio.createGain()
  const end = t + Math.max(0.08, length * 0.9)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(filter).connect(gain).connect(out)
  osc.start(t)
  osc.stop(end + 0.02)
}

/** A soft vibraphone-ish bell: a sine plus a quiet octave overtone. */
function bell(audio: AudioContext, out: AudioNode, freq: number, t: number, length: number) {
  pluck(audio, out, freq, t, Math.max(length, 0.25), 'sine', 0.09, 6000)
  pluck(audio, out, freq * 2, t, Math.max(length * 0.5, 0.12), 'sine', 0.02, 8000)
}

let hatNoise: AudioBuffer | null = null

function hat(audio: AudioContext, out: AudioNode, t: number, volume: number) {
  if (!hatNoise) {
    hatNoise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.1), audio.sampleRate)
    const data = hatNoise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = audio.createBufferSource()
  src.buffer = hatNoise
  const filter = audio.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 7000
  const gain = audio.createGain()
  gain.gain.setValueAtTime(volume, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  src.connect(filter).connect(gain).connect(out)
  src.start(t)
  src.stop(t + 0.07)
}

function kick(audio: AudioContext, out: AudioNode, t: number) {
  const osc = audio.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120, t)
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.15)
  const gain = audio.createGain()
  gain.gain.setValueAtTime(0.35, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  osc.connect(gain).connect(out)
  osc.start(t)
  osc.stop(t + 0.2)
}
