// "Musik – buzzer": the first buzz (in host arrival order) pauses the music. That
// player has 15 s to type the artist and the song title. Each part they get right
// scores and is solved for good; whatever is still unsolved stays hidden and the
// song plays on, up for grabs by the next player to buzz. Everyone buzzes at most
// once per song, and a buzz with nothing right costs points. The answer is only
// shown once both parts are solved, the clip runs out or the host reveals it.
import type { RoundContext, RoundDefinition, RoundUpdate } from '../../game/round'
import {
  clipElapsed,
  idleClip,
  matchesArtist,
  matchesTitle,
  pauseClip,
  resumeClip,
  shiftClip,
  startClip,
  type Clip,
  type MusicPlaybackAction,
  type MusicTrack,
} from '../music/track'

/** Per part (artist or title) solved. */
export const BUZZ_PART_POINTS = 250
/** A buzz where nothing new was right. */
export const BUZZ_WRONG_POINTS = -250
export const ANSWER_MS = 15_000
/** How long a song plays before nobody gets it. Longer than the 30 s preview, which loops. */
export const BUZZER_CLIP_MS = 60_000
export const MAX_ANSWER_LENGTH = 80

export interface MusicBuzzerSetup {
  tracks: MusicTrack[]
}

export interface BuzzAttempt {
  playerId: string
  /** What they typed; null if left empty, timed out or judged by the host. */
  artist: string | null
  title: string | null
  artistCorrect: boolean
  titleCorrect: boolean
}

export interface MusicBuzzerState {
  tracks: MusicTrack[]
  index: number
  stage: 'loading' | 'playing' | 'buzzed' | 'reveal' | 'done'
  clip: Clip
  buzzerId: string | null
  buzzedAt: number | null
  /** Players who have used their buzz for this song. */
  lockedIds: string[]
  /** Who solved each part, or null while it's still open. */
  solvedBy: { artist: string | null; title: string | null }
  /** Every buzz answer for the current song, in order. */
  attempts: BuzzAttempt[]
}

export type MusicBuzzerIntent =
  | { type: 'music-buzz'; questionIndex: number }
  | { type: 'music-buzz-answer'; questionIndex: number; artist: string; title: string }

export type MusicBuzzerAction =
  | MusicPlaybackAction
  | { type: 'music-reveal' }
  | { type: 'music-next' }
  /** The host judges the buzzing player's answer (e.g. said out loud), part by part. */
  | { type: 'music-judge'; artist: boolean; title: boolean }

export type MusicBuzzerView =
  | {
      kind: 'buzzer'
      questionIndex: number
      stage: 'loading' | 'playing' | 'buzzed'
      locked: boolean
      /** Name of whoever is answering right now (someone else). */
      buzzerName: string | null
      artistSolved: boolean
      titleSolved: boolean
    }
  | { kind: 'buzzer-answer'; questionIndex: number; buzzedAt: number; needArtist: boolean; needTitle: boolean }
  | { kind: 'buzzer-result'; artist: string; title: string; gotArtist: boolean; gotTitle: boolean; buzzed: boolean; points: number }

/** What one attempt was worth. */
export function attemptPoints(attempt: BuzzAttempt): number {
  const parts = Number(attempt.artistCorrect) + Number(attempt.titleCorrect)
  return parts > 0 ? parts * BUZZ_PART_POINTS : BUZZ_WRONG_POINTS
}

/** A player's points for the current song (they buzz at most once). */
export function songPoints(state: MusicBuzzerState, playerId: string): number {
  return state.attempts.filter((a) => a.playerId === playerId).reduce((sum, a) => sum + attemptPoints(a), 0)
}

function atTrack(state: MusicBuzzerState, index: number): MusicBuzzerState {
  return {
    ...state,
    index,
    stage: index < state.tracks.length ? 'loading' : 'done',
    clip: idleClip,
    buzzerId: null,
    buzzedAt: null,
    lockedIds: [],
    solvedBy: { artist: null, title: null },
    attempts: [],
  }
}

/** Scores the buzzing player's answer; only parts that were still open count. */
function judge(
  state: MusicBuzzerState,
  typed: { artist: string | null; title: string | null },
  right: { artist: boolean; title: boolean },
  ctx: RoundContext,
): RoundUpdate<MusicBuzzerState> {
  const playerId = state.buzzerId!
  const attempt: BuzzAttempt = {
    playerId,
    ...typed,
    artistCorrect: right.artist && state.solvedBy.artist === null,
    titleCorrect: right.title && state.solvedBy.title === null,
  }
  const solvedBy = {
    artist: attempt.artistCorrect ? playerId : state.solvedBy.artist,
    title: attempt.titleCorrect ? playerId : state.solvedBy.title,
  }
  const lockedIds = [...state.lockedIds, playerId]
  // Even when everyone has buzzed the song plays on: the answer isn't given away early.
  const done = solvedBy.artist !== null && solvedBy.title !== null
  const next: MusicBuzzerState = {
    ...state,
    solvedBy,
    lockedIds,
    attempts: [...state.attempts, attempt],
    buzzerId: null,
    buzzedAt: null,
    stage: done ? 'reveal' : 'playing',
    clip: done ? state.clip : resumeClip(state.clip, ctx.now),
  }
  return { state: next, scoreDeltas: { [playerId]: attemptPoints(attempt) } }
}

function settle(state: MusicBuzzerState, ctx: RoundContext): RoundUpdate<MusicBuzzerState> {
  if (state.stage === 'buzzed' && state.buzzedAt !== null && ctx.now - state.buzzedAt >= ANSWER_MS) {
    return judge(state, { artist: null, title: null }, { artist: false, title: false }, ctx)
  }
  if (state.stage === 'playing' && clipElapsed(state.clip, ctx.now) >= BUZZER_CLIP_MS) {
    return { state: { ...state, stage: 'reveal' } }
  }
  return { state }
}

export const musicBuzzer: RoundDefinition<MusicBuzzerSetup, MusicBuzzerState, MusicBuzzerIntent, MusicBuzzerAction, MusicBuzzerView> = {
  start({ tracks }) {
    return atTrack(
      {
        tracks,
        index: 0,
        stage: 'loading',
        clip: idleClip,
        buzzerId: null,
        buzzedAt: null,
        lockedIds: [],
        solvedBy: { artist: null, title: null },
        attempts: [],
      },
      0,
    )
  },

  parseIntent(data) {
    const { type, questionIndex } = data
    if (!Number.isInteger(questionIndex)) return null
    if (type === 'music-buzz') return { type: 'music-buzz', questionIndex: questionIndex as number }
    if (type === 'music-buzz-answer') {
      const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, MAX_ANSWER_LENGTH) : '')
      return { type: 'music-buzz-answer', questionIndex: questionIndex as number, artist: text(data.artist), title: text(data.title) }
    }
    return null
  },

  onIntent(state, playerId, intent, ctx) {
    // Apply anything that's already due (clip end, answer timeout) first.
    const settled = settle(state, ctx)
    if (settled.state !== state) return settled
    if (intent.questionIndex !== state.index || !ctx.players.some((p) => p.id === playerId)) return { state }

    if (intent.type === 'music-buzz') {
      // Messages are handled in arrival order, so the first one here wins.
      if (state.stage !== 'playing' || state.lockedIds.includes(playerId)) return { state }
      return {
        state: { ...state, stage: 'buzzed', buzzerId: playerId, buzzedAt: ctx.now, clip: pauseClip(state.clip, ctx.now) },
      }
    }

    if (state.stage !== 'buzzed' || state.buzzerId !== playerId) return { state }
    const artist = intent.artist.trim() || null
    const title = intent.title.trim() || null
    if (!artist && !title) return { state }
    const track = state.tracks[state.index]
    return judge(
      state,
      { artist, title },
      { artist: artist !== null && matchesArtist(artist, track), title: title !== null && matchesTitle(title, track) },
      ctx,
    )
  },

  onHostAction(state, action, ctx) {
    switch (action.type) {
      case 'music-ready':
        if (state.stage !== 'loading' || action.index !== state.index) return { state }
        return { state: { ...state, stage: 'playing', clip: startClip(ctx.now) } }
      case 'music-failed':
        if (state.stage !== 'loading' || action.index !== state.index) return { state }
        return { state: atTrack(state, state.index + 1) }
      case 'music-judge':
        return state.stage === 'buzzed' ? judge(state, { artist: null, title: null }, action, ctx) : { state }
      case 'music-reveal':
        if (state.stage !== 'playing' && state.stage !== 'loading') return { state }
        return { state: { ...state, stage: 'reveal' } }
      case 'music-next':
        return { state: state.stage === 'reveal' ? atTrack(state, state.index + 1) : state }
      default:
        return { state }
    }
  },

  onTick: settle,

  skip: (state) => ({ state: atTrack(state, state.index + 1) }),

  shiftTime: (state, ms) => ({
    ...state,
    clip: shiftClip(state.clip, ms),
    buzzedAt: state.buzzedAt === null ? null : state.buzzedAt + ms,
  }),

  isFinished: (state) => state.stage === 'done',

  playerView(state, playerId, ctx) {
    const locked = state.lockedIds.includes(playerId)
    if (state.stage === 'reveal' || state.stage === 'done') {
      const track = state.tracks[state.index]
      return {
        kind: 'buzzer-result',
        artist: track.artist,
        title: track.title,
        gotArtist: state.solvedBy.artist === playerId,
        gotTitle: state.solvedBy.title === playerId,
        buzzed: locked,
        points: songPoints(state, playerId),
      }
    }
    if (state.stage === 'buzzed' && state.buzzerId === playerId) {
      return {
        kind: 'buzzer-answer',
        questionIndex: state.index,
        buzzedAt: state.buzzedAt!,
        needArtist: state.solvedBy.artist === null,
        needTitle: state.solvedBy.title === null,
      }
    }
    const buzzer = state.stage === 'buzzed' ? ctx.players.find((p) => p.id === state.buzzerId) : undefined
    return {
      kind: 'buzzer',
      questionIndex: state.index,
      stage: state.stage,
      locked,
      buzzerName: buzzer?.name ?? null,
      artistSolved: state.solvedBy.artist !== null,
      titleSolved: state.solvedBy.title !== null,
    }
  },
}
