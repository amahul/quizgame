// "Musik – snabbast vinner": a clip plays and the screen asks either "who is the
// artist?" or "what is the song called?" with four options, Kahoot-style. One answer
// per player; the faster a right answer, the more points.
import type { RoundContext, RoundDefinition, RoundUpdate } from '../../game/round'
import {
  CLIP_MS,
  clipElapsed,
  idleClip,
  shiftClip,
  speedPoints,
  startClip,
  type Clip,
  type MusicPlaybackAction,
  type MusicTrack,
} from '../music/track'

export const CHOICE_MAX_POINTS = 1000
export const CHOICE_MIN_POINTS = 100
export const MAX_OPTIONS = 4

export type MusicField = 'artist' | 'title'

export interface MusicChoiceQuestion {
  track: MusicTrack
  /** What the options are: artists or song titles. */
  field: MusicField
  options: string[]
  correct: number
}

export interface MusicRaceSetup {
  questions: MusicChoiceQuestion[]
}

export interface ChoiceAnswer {
  choice: number
  /** Clip time (ms) when the answer arrived. */
  atMs: number
}

export interface MusicRaceState {
  questions: MusicChoiceQuestion[]
  index: number
  stage: 'loading' | 'playing' | 'reveal' | 'done'
  clip: Clip
  answers: Record<string, ChoiceAnswer>
}

export type MusicRaceIntent = { type: 'music-choice'; questionIndex: number; choice: number }

export type MusicRaceAction = MusicPlaybackAction | { type: 'music-reveal' } | { type: 'music-next' }

export type MusicRaceView =
  | { kind: 'music-choice'; questionIndex: number; loading: boolean; field: MusicField; optionCount: number; answered: number | null }
  | {
      kind: 'music-choice-result'
      answered: number | null
      correct: boolean
      points: number
      artist: string
      title: string
    }

const answerOf = (state: MusicRaceState, playerId: string): ChoiceAnswer | undefined =>
  Object.hasOwn(state.answers, playerId) ? state.answers[playerId] : undefined

/** Points a player gets for their answer to the current question (0 if wrong or none). */
export function pointsFor(state: MusicRaceState, playerId: string): number {
  const answer = answerOf(state, playerId)
  const question = state.questions[state.index]
  if (!answer || !question || answer.choice !== question.correct) return 0
  return speedPoints(answer.atMs, CHOICE_MAX_POINTS, CHOICE_MIN_POINTS)
}

/** How many players picked each option. */
export function choiceCounts(state: MusicRaceState): number[] {
  const counts = state.questions[state.index].options.map(() => 0)
  for (const { choice } of Object.values(state.answers)) counts[choice]++
  return counts
}

function atQuestion(state: MusicRaceState, index: number): MusicRaceState {
  return { ...state, index, stage: index < state.questions.length ? 'loading' : 'done', clip: idleClip, answers: {} }
}

/** Points are handed out on the reveal, so nobody can tell from the scores who was right. */
function reveal(state: MusicRaceState): RoundUpdate<MusicRaceState> {
  const scoreDeltas: Record<string, number> = {}
  for (const playerId of Object.keys(state.answers)) {
    const points = pointsFor(state, playerId)
    if (points > 0) scoreDeltas[playerId] = points
  }
  return { state: { ...state, stage: 'reveal' }, scoreDeltas }
}

function everyoneAnswered(state: MusicRaceState, ctx: RoundContext): boolean {
  const connected = ctx.players.filter((p) => p.connected)
  return connected.length > 0 && connected.every((p) => answerOf(state, p.id))
}

function settle(state: MusicRaceState, ctx: RoundContext): RoundUpdate<MusicRaceState> {
  if (state.stage !== 'playing') return { state }
  if (clipElapsed(state.clip, ctx.now) >= CLIP_MS || everyoneAnswered(state, ctx)) return reveal(state)
  return { state }
}

export const musicRace: RoundDefinition<MusicRaceSetup, MusicRaceState, MusicRaceIntent, MusicRaceAction, MusicRaceView> = {
  start({ questions }) {
    return atQuestion({ questions, index: 0, stage: 'loading', clip: idleClip, answers: {} }, 0)
  },

  parseIntent(data) {
    const { type, questionIndex, choice } = data
    if (type !== 'music-choice' || !Number.isInteger(questionIndex) || !Number.isInteger(choice)) return null
    if ((choice as number) < 0 || (choice as number) >= MAX_OPTIONS) return null
    return { type: 'music-choice', questionIndex: questionIndex as number, choice: choice as number }
  },

  onIntent(state, playerId, intent, ctx) {
    // Apply a clip end that is already due before accepting late answers.
    const settled = settle(state, ctx)
    if (settled.state !== state) return settled
    if (state.stage !== 'playing' || intent.questionIndex !== state.index) return { state }
    if (answerOf(state, playerId) || !ctx.players.some((p) => p.id === playerId)) return { state }
    if (intent.choice >= state.questions[state.index].options.length) return { state }
    const answers = { ...state.answers, [playerId]: { choice: intent.choice, atMs: clipElapsed(state.clip, ctx.now) } }
    return settle({ ...state, answers }, ctx)
  },

  onHostAction(state, action, ctx) {
    switch (action.type) {
      case 'music-ready':
        if (state.stage !== 'loading' || action.index !== state.index) return { state }
        return { state: { ...state, stage: 'playing', clip: startClip(ctx.now) } }
      case 'music-failed':
        if (state.stage !== 'loading' || action.index !== state.index) return { state }
        return { state: atQuestion(state, state.index + 1) }
      case 'music-reveal':
        return state.stage === 'playing' || state.stage === 'loading' ? reveal(state) : { state }
      case 'music-next':
        return { state: state.stage === 'reveal' ? atQuestion(state, state.index + 1) : state }
      default:
        return { state }
    }
  },

  onTick: settle,

  skip: (state) => ({ state: atQuestion(state, state.index + 1) }),

  shiftTime: (state, ms) => ({ ...state, clip: shiftClip(state.clip, ms) }),

  isFinished: (state) => state.stage === 'done',

  playerView(state, playerId) {
    const question = state.questions[state.index]
    const answered = answerOf(state, playerId)?.choice ?? null
    if (state.stage === 'reveal') {
      return {
        kind: 'music-choice-result',
        answered,
        correct: answered === question.correct,
        points: pointsFor(state, playerId),
        artist: question.track.artist,
        title: question.track.title,
      }
    }
    return {
      kind: 'music-choice',
      questionIndex: state.index,
      loading: state.stage === 'loading',
      field: question.field,
      optionCount: question.options.length,
      answered,
    }
  },
}
