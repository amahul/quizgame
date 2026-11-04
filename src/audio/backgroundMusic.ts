// Background music ("hissmusik") for the lobby and while players are answering.
// Two original, looping dance-pop tunes, synthesized like everything else: a
// bouncy one for the lobby and a faster, driving one for questions. A small
// lookahead scheduler plays them through their own gain bus, so switching tunes
// cross-fades and stopping fades out (e.g. right before the drumroll).
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
  claps: number[]
}

/** Repeats a one-bar pattern of steps over `bars` bars of 16 steps. */
const everyBar = (steps: number[], bars: number) => Array.from({ length: bars }, (_, b) => steps.map((s) => b * 16 + s)).flat()

const octaveUp = (note: string) => note.replace(/\d$/, (d) => String(Number(d) + 1))

/** Disco bass: 8th notes bouncing between the root and its octave, one bar per root. */
const bounceBass = (roots: string[]): NoteEvent[] =>
  roots.flatMap((root, bar) => [0, 2, 4, 6, 8, 10, 12, 14].map((s, i): NoteEvent => [bar * 16 + s, i % 2 ? octaveUp(root) : root, 1]))

/** The same chord stab rhythm in every bar. */
const stabs = (chords: string[][], steps: [step: number, length: number][]) =>
  chords.flatMap((notes, bar) => steps.map(([s, len]): [number, string[], number] => [bar * 16 + s, notes, len]))

const FOUR_ON_THE_FLOOR = everyBar([0, 4, 8, 12], 4)
const BACKBEAT = everyBar([4, 12], 4)
const ALL_SIXTEENTHS = Array.from({ length: 64 }, (_, i) => i)
const OFFBEAT_EIGHTHS = everyBar([2, 6, 10, 14], 4)

// C – G – Am – F with a sing-along hook.
export const LOBBY_SONG: Song = {
  bpm: 124,
  steps: 64,
  bass: bounceBass(['C2', 'G2', 'A2', 'F2']),
  chords: stabs(
    [
      ['C4', 'E4', 'G4'],
      ['B3', 'D4', 'G4'],
      ['C4', 'E4', 'A4'],
      ['C4', 'F4', 'A4'],
    ],
    [
      [0, 2],
      [3, 1],
      [6, 2],
      [10, 1],
      [12, 2],
    ],
  ),
  melody: [
    [0, 'E5', 1],
    [2, 'G5', 1],
    [3, 'A5', 1],
    [4, 'G5', 2],
    [7, 'E5', 1],
    [8, 'C6', 2],
    [10, 'A5', 1],
    [12, 'G5', 3],
    [16, 'D5', 1],
    [18, 'G5', 1],
    [19, 'A5', 1],
    [20, 'B5', 2],
    [23, 'A5', 1],
    [24, 'G5', 2],
    [26, 'D5', 1],
    [28, 'B4', 3],
    [32, 'E5', 1],
    [34, 'A5', 1],
    [35, 'B5', 1],
    [36, 'C6', 2],
    [39, 'B5', 1],
    [40, 'A5', 2],
    [42, 'E5', 1],
    [44, 'C5', 3],
    [48, 'F5', 1],
    [50, 'A5', 1],
    [51, 'C6', 1],
    [52, 'D6', 2],
    [54, 'C6', 1],
    [56, 'A5', 2],
    [58, 'G5', 2],
    [60, 'E5', 1],
    [62, 'G5', 1],
  ],
  hats: ALL_SIXTEENTHS,
  accents: OFFBEAT_EIGHTHS,
  kicks: FOUR_ON_THE_FLOOR,
  claps: BACKBEAT,
}

// Em – C – G – D, racing along with a 16th-note arpeggio like a countdown.
const QUESTION_CHORDS = [
  ['E4', 'G4', 'B4'],
  ['E4', 'G4', 'C5'],
  ['D4', 'G4', 'B4'],
  ['D4', 'F#4', 'A4'],
]
/** Chord tone per 16th: 0–2 are the chord (an octave up), 3 the top note another octave up. */
const ARPEGGIO = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 1]

export const QUESTION_SONG: Song = {
  bpm: 140,
  steps: 64,
  bass: bounceBass(['E2', 'C2', 'G2', 'D2']),
  chords: stabs(QUESTION_CHORDS, [
    [2, 1],
    [6, 1],
    [10, 1],
    [14, 1],
  ]),
  melody: QUESTION_CHORDS.flatMap((notes, bar) =>
    ARPEGGIO.map((i, n): NoteEvent => [bar * 16 + n, i === 3 ? octaveUp(octaveUp(notes[0])) : octaveUp(notes[i]), 1]),
  ),
  hats: ALL_SIXTEENTHS,
  accents: OFFBEAT_EIGHTHS,
  kicks: FOUR_ON_THE_FLOOR,
  claps: BACKBEAT,
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
  for (const [s, note, len] of song.bass) if (s === step) pluck(audio, out, noteHz(note), t, len * stepS, 'sawtooth', 0.2, 750)
  for (const [s, notes, len] of song.chords) {
    if (s === step) for (const note of notes) pluck(audio, out, noteHz(note), t, len * stepS, 'square', 0.035, 2200)
  }
  for (const [s, note, len] of song.melody) if (s === step) bell(audio, out, noteHz(note), t, len * stepS)
  if (song.hats.includes(step)) hat(audio, out, t, song.accents.includes(step) ? 0.06 : 0.025)
  if (song.kicks.includes(step)) kick(audio, out, t)
  if (song.claps.includes(step)) clap(audio, out, t)
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
  pluck(audio, out, freq, t, Math.max(length, 0.15), 'triangle', 0.08, 5000)
  pluck(audio, out, freq * 2, t, Math.max(length * 0.5, 0.1), 'sine', 0.025, 8000)
}

let noiseBuffer: AudioBuffer | null = null

function noise(audio: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.25), audio.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

/** A handclap: three quick noise bursts and a short tail. */
function clap(audio: AudioContext, out: AudioNode, t: number) {
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1500
  filter.Q.value = 0.8
  filter.connect(out)
  for (const [offset, volume, decay] of [
    [0, 0.14, 0.02],
    [0.011, 0.12, 0.02],
    [0.022, 0.16, 0.13],
  ]) {
    const src = audio.createBufferSource()
    src.buffer = noise(audio)
    const gain = audio.createGain()
    gain.gain.setValueAtTime(volume, t + offset)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + decay)
    src.connect(gain).connect(filter)
    src.start(t + offset, Math.random() * 0.1)
    src.stop(t + offset + decay + 0.02)
  }
}

function hat(audio: AudioContext, out: AudioNode, t: number, volume: number) {
  const src = audio.createBufferSource()
  src.buffer = noise(audio)
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
