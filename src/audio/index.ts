// Sound effects, jingles and the master volume for the host. Everything is
// synthesized with Web Audio — no audio files. Browsers block audio until the
// first user gesture, so call unlockAudio() from a click handler.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

// ---- Volume -----------------------------------------------------------------

export interface VolumeSettings {
  /** 0–1. */
  volume: number
  muted: boolean
}

const VOLUME_KEY = 'quizgame.volume'
const volumeListeners = new Set<() => void>()

function loadVolume(): VolumeSettings {
  try {
    const data = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? 'null') as Partial<VolumeSettings> | null
    const volume = typeof data?.volume === 'number' ? Math.min(1, Math.max(0, data.volume)) : 0.8
    return { volume, muted: data?.muted === true }
  } catch {
    return { volume: 0.8, muted: false }
  }
}

let volumeSettings = loadVolume()

function applyVolume() {
  if (!master || !ctx) return
  const target = volumeSettings.muted ? 0 : volumeSettings.volume
  master.gain.setTargetAtTime(target, ctx.currentTime, 0.02)
}

export function getVolume(): VolumeSettings {
  return volumeSettings
}

export function setVolume(patch: Partial<VolumeSettings>): void {
  volumeSettings = { ...volumeSettings, ...patch }
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(volumeSettings))
  } catch {
    // Remembered for this page load only.
  }
  applyVolume()
  volumeListeners.forEach((fn) => fn())
}

export function subscribeVolume(fn: () => void): () => void {
  volumeListeners.add(fn)
  return () => volumeListeners.delete(fn)
}

// ---- Context ----------------------------------------------------------------

/** The one AudioContext for sound effects and music. May start suspended. */
export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.connect(ctx.destination)
    applyVolume()
  }
  return ctx
}

/** Where every sound (music included) should connect: the master volume. */
export function getOutput(): AudioNode {
  getAudioContext()
  return master!
}

export function unlockAudio(): void {
  const audio = getAudioContext()
  if (audio.state === 'suspended') void audio.resume()
}

/** Null when audio isn't running yet: effects are then silently skipped. */
function running(): AudioContext | null {
  return ctx?.state === 'running' ? ctx : null
}

// ---- Synth building blocks ----------------------------------------------------

const NOTE: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }

/** "C5", "F#4", "Bb3" → Hz. */
export function noteHz(name: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name)
  if (!match) throw new Error(`bad note ${name}`)
  const semis = NOTE[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + (Number(match[3]) - 4) * 12
  return 440 * 2 ** (semis / 12)
}

interface ToneOptions {
  type?: OscillatorType
  volume?: number
  attack?: number
  release?: number
  /** Glide to this frequency over the note. */
  slideTo?: number
  /** Lowpass cutoff; omit for none. */
  cutoff?: number
  detune?: number
}

/** One enveloped oscillator note, `start` seconds from now. */
function tone(audio: AudioContext, freq: number, start: number, duration: number, o: ToneOptions = {}) {
  const t = audio.currentTime + start
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = o.type ?? 'triangle'
  osc.frequency.setValueAtTime(freq, t)
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + duration)
  if (o.detune) osc.detune.value = o.detune
  const peak = o.volume ?? 0.2
  const attack = o.attack ?? 0.01
  const release = o.release ?? 0.12
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + attack)
  gain.gain.setValueAtTime(peak, t + Math.max(attack, duration - release))
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  let node: AudioNode = osc
  if (o.cutoff) {
    const filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = o.cutoff
    node.connect(filter)
    node = filter
  }
  node.connect(gain).connect(getOutput())
  osc.start(t)
  osc.stop(t + duration + 0.05)
}

/** A brassy chord: two detuned saws per note through a lowpass. */
function brass(audio: AudioContext, notes: string[], start: number, duration: number, volume = 0.07) {
  for (const n of notes) {
    for (const detune of [-8, 8]) {
      tone(audio, noteHz(n), start, duration, { type: 'sawtooth', volume, attack: 0.03, release: 0.2, cutoff: 2600, detune })
    }
  }
}

function noise(audio: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

/** A burst of filtered noise: snare hits, cymbals, whooshes. */
function hiss(audio: AudioContext, start: number, duration: number, volume: number, filter: BiquadFilterType, freq: number) {
  const t = audio.currentTime + start
  const src = audio.createBufferSource()
  src.buffer = noise(audio)
  const f = audio.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  const gain = audio.createGain()
  gain.gain.setValueAtTime(volume, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(f).connect(gain).connect(getOutput())
  src.start(t, Math.random() * 0.5)
  src.stop(t + duration + 0.05)
}

/** A timpani-like boom. */
function boom(audio: AudioContext, start: number, volume = 0.5) {
  tone(audio, 110, start, 0.6, { type: 'sine', volume, attack: 0.005, release: 0.5, slideTo: 45 })
}

const cymbal = (audio: AudioContext, start: number, volume = 0.18) => hiss(audio, start, 1.6, volume, 'highpass', 6000)

// ---- Effects ----------------------------------------------------------------

/** A short, bright "pling" when a player joins. */
export function playJoinSound(): void {
  const a = running()
  if (!a) return
  tone(a, noteHz('E6'), 0, 0.12, { volume: 0.14 })
  tone(a, noteHz('B6'), 0.07, 0.25, { volume: 0.12 })
}

/** A crisp tick for a letter tile flipping over. */
export function playFlipSound(): void {
  const a = running()
  if (!a) return
  hiss(a, 0, 0.05, 0.25, 'bandpass', 3500)
  tone(a, noteHz('A5'), 0, 0.09, { type: 'square', volume: 0.04, cutoff: 3000 })
}

/** A loud game-show buzzer. */
export function playBuzzSound(): void {
  const a = running()
  if (!a) return
  tone(a, 110, 0, 0.6, { type: 'sawtooth', volume: 0.22, cutoff: 1800 })
  tone(a, 165, 0, 0.6, { type: 'square', volume: 0.1, cutoff: 1800 })
}

/** A whoosh for a question flying to another player. */
export function playPassSound(): void {
  const a = running()
  if (!a) return
  const t = a.currentTime
  const src = a.createBufferSource()
  src.buffer = noise(a)
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 3
  f.frequency.setValueAtTime(300, t)
  f.frequency.exponentialRampToValueAtTime(4000, t + 0.7)
  const gain = a.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.35)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
  src.connect(f).connect(gain).connect(getOutput())
  src.start(t)
  src.stop(t + 0.85)
}

/** A happy major arpeggio, or a sad "wah-wah". */
export function playRevealSound(correct: boolean): void {
  const a = running()
  if (!a) return
  if (correct) {
    ;['C5', 'E5', 'G5', 'C6'].forEach((n, i) => tone(a, noteHz(n), i * 0.07, 0.35, { volume: 0.13 }))
  } else {
    tone(a, noteHz('G3'), 0, 0.35, { type: 'sawtooth', volume: 0.08, cutoff: 900, slideTo: noteHz('F#3') })
    tone(a, noteHz('F3'), 0.35, 0.6, { type: 'sawtooth', volume: 0.08, cutoff: 700, slideTo: noteHz('D3') })
  }
}

// ---- Jingles ------------------------------------------------------------------

/** The gameshow intro sting: brass hits rising to a big chord with a cymbal. */
export function playIntroSting(): void {
  const a = running()
  if (!a) return
  boom(a, 0)
  brass(a, ['C4', 'E4', 'G4'], 0, 0.22)
  brass(a, ['C4', 'E4', 'G4'], 0.25, 0.18)
  brass(a, ['F4', 'A4', 'C5'], 0.45, 0.25)
  brass(a, ['G4', 'B4', 'D5'], 0.75, 0.25)
  boom(a, 1.05, 0.6)
  brass(a, ['C4', 'G4', 'C5', 'E5', 'G5'], 1.05, 1.4, 0.06)
  cymbal(a, 1.05, 0.2)
  ;['G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone(a, noteHz(n), 1.1 + i * 0.06, 0.4, { volume: 0.06 }))
}

/** A short "ta-da!" for each round's intro screen. */
export function playRoundIntro(): void {
  const a = running()
  if (!a) return
  ;['G4', 'C5', 'E5'].forEach((n, i) => tone(a, noteHz(n), i * 0.08, 0.16, { type: 'square', volume: 0.05, cutoff: 2400 }))
  brass(a, ['C4', 'E4', 'G4', 'C5'], 0.3, 0.9)
  boom(a, 0.3, 0.4)
  cymbal(a, 0.3, 0.1)
}

/** A snare roll building up for `seconds`, ending in a crash. */
export function playDrumroll(seconds = 1.5): void {
  const a = running()
  if (!a) return
  const hits = Math.floor(seconds / 0.045)
  for (let i = 0; i < hits; i++) {
    const start = i * 0.045
    hiss(a, start, 0.06, 0.05 + 0.25 * (i / hits), 'bandpass', 1800 + Math.random() * 400)
  }
  boom(a, seconds, 0.55)
  cymbal(a, seconds, 0.22)
}

/** The final fanfare for the winner. */
export function playFanfare(): void {
  const a = running()
  if (!a) return
  const melody: [string, number, number][] = [
    ['G4', 0, 0.18],
    ['C5', 0.2, 0.18],
    ['E5', 0.4, 0.18],
    ['G5', 0.6, 0.45],
    ['E5', 1.1, 0.18],
    ['G5', 1.3, 1.2],
  ]
  for (const [n, start, dur] of melody) {
    for (const detune of [-6, 6]) tone(a, noteHz(n), start, dur, { type: 'sawtooth', volume: 0.06, cutoff: 3000, detune })
  }
  brass(a, ['C4', 'E4', 'G4'], 0.6, 0.45)
  brass(a, ['C4', 'E4', 'G4', 'C5'], 1.3, 1.6)
  boom(a, 0.6, 0.4)
  boom(a, 1.3, 0.6)
  cymbal(a, 1.3, 0.22)
  ;[1.9, 2.05, 2.2].forEach((s) => hiss(a, s, 0.08, 0.15, 'bandpass', 2000))
}
