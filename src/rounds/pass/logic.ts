// "Skicka vidare": the active player sees only the category, then keeps the
// question (±200) or sends it to someone else (±100), who becomes the next active
// player. Answers are free text, judged by the shared matcher with host override.
// The answerer has ANSWER_MS to reply; running out of time counts as wrong.
import { matchAnswer } from '../../game/matcher'
import type { Player } from '../../game/lobby'
import { activePlayers, type RoundDefinition, type RoundUpdate } from '../../game/round'
import type { Avatar } from '../../game/avatars'

export const KEEP_POINTS = 200
export const PASS_POINTS = 100
export const DEFAULT_QUESTIONS_PER_PLAYER = 2
export const MAX_ANSWER_LENGTH = 80
/** Time to answer once the question has been kept or sent. */
export const ANSWER_MS = 30_000

export interface PassQuestion {
  category: string
  question: string
  /** Accepted answers; the first is shown as "the" answer on reveal. */
  answers: string[]
  fact?: string
}

export interface PassSetup {
  questions: PassQuestion[]
  questionsPerPlayer: number
}

export interface PassState {
  /** Only the questions this round will use. */
  questions: PassQuestion[]
  index: number
  stage: 'choosing' | 'answering' | 'reveal' | 'done'
  /** The player deciding whether to keep or send the current question. */
  activeId: string
  answererId: string | null
  /** The typed answer, or null if the host judged it without one. */
  answer: string | null
  correct: boolean | null
  overridden: boolean
  /** When answering closes, or null outside the answering stage. */
  answerDeadline: number | null
  /** The answerer ran out of time. */
  timedOut: boolean
}

export type PassIntent =
  | { type: 'pass-decide'; questionIndex: number; target: 'self' | string }
  | { type: 'pass-answer'; questionIndex: number; text: string }

export type PassAction =
  | { type: 'pass-skip' }
  | { type: 'pass-judge'; correct: boolean }
  | { type: 'pass-override' }
  | { type: 'pass-next' }

export interface PassTarget {
  id: string
  name: string
  avatar: Avatar
}

export type PassView =
  | { kind: 'pass-watch' }
  | { kind: 'pass-choose'; questionIndex: number; category: string; targets: PassTarget[] }
  | { kind: 'pass-answer'; questionIndex: number; category: string; question: string; stake: number; msLeft: number }
  | { kind: 'pass-result'; correct: boolean; points: number }

export const isKept = (state: PassState) => state.answererId === state.activeId

/** Points won or lost on the current question. */
export const stakeOf = (state: PassState) => (isKept(state) ? KEEP_POINTS : PASS_POINTS)

/** Lowest score first, join order breaks ties. Prefers someone other than `excludeId`. */
export function lowestScoring(players: readonly Player[], excludeId?: string): Player | undefined {
  const pool = activePlayers(players)
  const candidates = pool.length > 1 ? pool.filter((p) => p.id !== excludeId) : pool
  return candidates.reduce<Player | undefined>((low, p) => (!low || p.score < low.score ? p : low), undefined)
}

function judged(
  state: PassState,
  answer: string | null,
  correct: boolean,
  overridden: boolean,
  timedOut = false,
): RoundUpdate<PassState> {
  const next: PassState = { ...state, stage: 'reveal', answer, correct, overridden, answerDeadline: null, timedOut }
  const stake = stakeOf(next)
  return { state: next, scoreDeltas: { [next.answererId!]: correct ? stake : -stake } }
}

export const pass: RoundDefinition<PassSetup, PassState, PassIntent, PassAction, PassView> = {
  start({ questions, questionsPerPlayer }, ctx) {
    const total = Math.min(questionsPerPlayer * Math.max(1, activePlayers(ctx.players).length), questions.length)
    const first = lowestScoring(ctx.players)
    return {
      questions: questions.slice(0, total),
      index: 0,
      stage: first && total > 0 ? 'choosing' : 'done',
      activeId: first?.id ?? '',
      answererId: null,
      answer: null,
      correct: null,
      overridden: false,
      answerDeadline: null,
      timedOut: false,
    }
  },

  parseIntent(data) {
    const { type, questionIndex } = data
    if (!Number.isInteger(questionIndex)) return null
    if (type === 'pass-decide' && typeof data.target === 'string' && data.target.length <= 64) {
      return { type: 'pass-decide', questionIndex: questionIndex as number, target: data.target }
    }
    if (type === 'pass-answer' && typeof data.text === 'string') {
      return { type: 'pass-answer', questionIndex: questionIndex as number, text: data.text.slice(0, MAX_ANSWER_LENGTH) }
    }
    return null
  },

  onIntent(state, playerId, intent, ctx) {
    if (intent.questionIndex !== state.index) return { state }

    if (intent.type === 'pass-decide') {
      if (state.stage !== 'choosing' || playerId !== state.activeId) return { state }
      const deadline = ctx.now + ANSWER_MS
      if (intent.target === 'self') {
        return { state: { ...state, stage: 'answering', answererId: playerId, answerDeadline: deadline } }
      }
      const target = ctx.players.find((p) => p.id === intent.target)
      if (!target || target.id === playerId || !target.connected) return { state }
      return { state: { ...state, stage: 'answering', answererId: target.id, answerDeadline: deadline } }
    }

    if (state.stage !== 'answering' || playerId !== state.answererId) return { state }
    if (state.answerDeadline !== null && ctx.now >= state.answerDeadline) return pass.onTick(state, ctx)
    const text = intent.text.trim()
    if (!text) return { state }
    return judged(state, text, matchAnswer(text, state.questions[state.index].answers).correct, false)
  },

  onHostAction(state, action, ctx) {
    switch (action.type) {
      case 'pass-skip': {
        // The active player is away or stuck: hand the decision to someone else.
        if (state.stage !== 'choosing') return { state }
        const next = lowestScoring(ctx.players, state.activeId)
        return { state: next ? { ...state, activeId: next.id } : state }
      }
      case 'pass-judge':
        // Answered out loud, or the answerer dropped out.
        return state.stage === 'answering' ? judged(state, null, action.correct, true) : { state }
      case 'pass-override': {
        if (state.stage !== 'reveal' || state.correct === null) return { state }
        const correct = !state.correct
        // Undo the old verdict and apply the new one.
        const swing = 2 * stakeOf(state) * (correct ? 1 : -1)
        return {
          state: { ...state, correct, overridden: true },
          scoreDeltas: { [state.answererId!]: swing },
        }
      }
      case 'pass-next': {
        if (state.stage !== 'reveal') return { state }
        // A receiver takes over; whoever kept it hands over to the lowest scorer.
        const nextActive = isKept(state) ? lowestScoring(ctx.players, state.activeId)?.id : state.answererId
        const index = state.index + 1
        return {
          state: {
            ...state,
            index,
            stage: index < state.questions.length ? 'choosing' : 'done',
            activeId: nextActive ?? state.activeId,
            answererId: null,
            answer: null,
            correct: null,
            overridden: false,
            answerDeadline: null,
            timedOut: false,
          },
        }
      }
      default:
        return { state }
    }
  },

  onTick(state, ctx) {
    if (state.stage !== 'answering' || state.answerDeadline === null || ctx.now < state.answerDeadline) return { state }
    return judged(state, null, false, false, true)
  },

  skip(state, ctx) {
    // After a reveal, skipping is the same as "Nästa fråga"; before it, the same player chooses again.
    if (state.stage === 'reveal') return pass.onHostAction(state, { type: 'pass-next' }, ctx)
    const index = state.index + 1
    return {
      state: {
        ...state,
        index,
        stage: index < state.questions.length ? 'choosing' : 'done',
        answererId: null,
        answer: null,
        correct: null,
        overridden: false,
        answerDeadline: null,
        timedOut: false,
      },
    }
  },

  shiftTime: (state, ms) =>
    state.answerDeadline === null ? state : { ...state, answerDeadline: state.answerDeadline + ms },

  isFinished: (state) => state.stage === 'done',

  playerView(state, playerId, ctx) {
    const question = state.questions[state.index]
    if (state.stage === 'choosing' && playerId === state.activeId) {
      const targets = ctx.players
        .filter((p) => p.connected && p.id !== playerId)
        .map(({ id, name, avatar }) => ({ id, name, avatar }))
      return { kind: 'pass-choose', questionIndex: state.index, category: question.category, targets }
    }
    if (state.stage === 'answering' && playerId === state.answererId) {
      return {
        kind: 'pass-answer',
        questionIndex: state.index,
        category: question.category,
        question: question.question,
        stake: stakeOf(state),
        msLeft: Math.max(0, (state.answerDeadline ?? ctx.now) - ctx.now),
      }
    }
    if (state.stage === 'reveal' && playerId === state.answererId && state.correct !== null) {
      const stake = stakeOf(state)
      return { kind: 'pass-result', correct: state.correct, points: state.correct ? stake : -stake }
    }
    return { kind: 'pass-watch' }
  },
}
