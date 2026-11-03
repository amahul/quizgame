// "Allmänbildning": multiple choice with a time limit per question. Reveals after a
// short drumroll once every connected player has answered, the time runs out, or
// the host asks for it.
import type { RoundContext, RoundDefinition, RoundUpdate } from '../../game/round'

export const TRIVIA_POINTS = 100
export const AUTO_REVEAL_DELAY_MS = 1_500
export const MAX_OPTIONS = 4
/** Time to answer each question. */
export const QUESTION_MS = 20_000

export interface TriviaQuestion {
  question: string
  /** 2–4 options. */
  options: string[]
  correct: number
  fact?: string
}

export interface TriviaSetup {
  questions: TriviaQuestion[]
}

export interface TriviaState {
  questions: TriviaQuestion[]
  index: number
  stage: 'question' | 'reveal' | 'done'
  /** Chosen option per player id. Answers can't be changed. */
  answers: Record<string, number>
  /** When the reveal happens (after the drumroll), or null if none is scheduled. */
  revealAt: number | null
  /** The host asked for the reveal or time ran out, so a newcomer joining does not cancel it. */
  revealForced: boolean
  /** When answering closes. */
  deadline: number
}

export type TriviaIntent = { type: 'trivia-answer'; questionIndex: number; choice: number }

export type TriviaAction = { type: 'trivia-reveal' } | { type: 'trivia-next' }

export type TriviaView =
  | { kind: 'trivia-question'; questionIndex: number; optionCount: number; answered: number | null; msLeft: number }
  | { kind: 'trivia-reveal'; questionIndex: number; answered: number | null; correct: boolean; points: number }

export function hasAnswered(state: TriviaState, playerId: string): boolean {
  return Object.hasOwn(state.answers, playerId)
}

/** How many players picked each option of the current question. */
export function answerCounts(state: TriviaState): number[] {
  const counts = state.questions[state.index].options.map(() => 0)
  for (const choice of Object.values(state.answers)) counts[choice]++
  return counts
}

function everyoneAnswered(state: TriviaState, ctx: RoundContext): boolean {
  const connected = ctx.players.filter((p) => p.connected)
  return connected.length > 0 && connected.every((p) => hasAnswered(state, p.id))
}

function reveal(state: TriviaState): RoundUpdate<TriviaState> {
  const { correct } = state.questions[state.index]
  const scoreDeltas: Record<string, number> = {}
  for (const [playerId, choice] of Object.entries(state.answers)) {
    if (choice === correct) scoreDeltas[playerId] = TRIVIA_POINTS
  }
  return { state: { ...state, stage: 'reveal', revealAt: null, revealForced: false }, scoreDeltas }
}

/** Schedules, cancels or performs the reveal. */
function settle(state: TriviaState, ctx: RoundContext): RoundUpdate<TriviaState> {
  if (state.stage !== 'question') return { state }
  if (state.revealAt !== null && ctx.now >= state.revealAt) return reveal(state)
  if (state.revealForced) return { state }
  if (ctx.now >= state.deadline) {
    // Time's up: drumroll, then reveal, whoever is still thinking.
    return { state: { ...state, revealAt: ctx.now + AUTO_REVEAL_DELAY_MS, revealForced: true } }
  }
  if (!everyoneAnswered(state, ctx)) {
    // Someone new joined (or reconnected) before the reveal: wait for them too.
    return { state: state.revealAt === null ? state : { ...state, revealAt: null } }
  }
  if (state.revealAt === null) return { state: { ...state, revealAt: ctx.now + AUTO_REVEAL_DELAY_MS } }
  return { state }
}

function atQuestion(state: TriviaState, index: number, now: number): TriviaState {
  return {
    ...state,
    index,
    stage: index < state.questions.length ? 'question' : 'done',
    answers: {},
    revealAt: null,
    revealForced: false,
    deadline: now + QUESTION_MS,
  }
}

export const trivia: RoundDefinition<TriviaSetup, TriviaState, TriviaIntent, TriviaAction, TriviaView> = {
  start({ questions }, ctx) {
    return atQuestion(
      { questions, index: 0, stage: 'question', answers: {}, revealAt: null, revealForced: false, deadline: 0 },
      0,
      ctx.now,
    )
  },

  parseIntent(data) {
    if (data.type !== 'trivia-answer') return null
    const { questionIndex, choice } = data
    if (!Number.isInteger(questionIndex) || !Number.isInteger(choice)) return null
    if ((choice as number) < 0 || (choice as number) >= MAX_OPTIONS) return null
    return { type: 'trivia-answer', questionIndex: questionIndex as number, choice: choice as number }
  },

  onIntent(state, playerId, intent, ctx) {
    if (state.stage !== 'question' || intent.questionIndex !== state.index) return { state }
    if (ctx.now >= state.deadline) return settle(state, ctx)
    if (hasAnswered(state, playerId) || !ctx.players.some((p) => p.id === playerId)) return { state }
    if (intent.choice >= state.questions[state.index].options.length) return { state }
    return settle({ ...state, answers: { ...state.answers, [playerId]: intent.choice } }, ctx)
  },

  onHostAction(state, action, ctx) {
    switch (action.type) {
      case 'trivia-reveal':
        // Start the drumroll now (or keep an earlier one that is already running).
        if (state.stage !== 'question') return { state }
        return {
          state: {
            ...state,
            revealAt: Math.min(state.revealAt ?? Infinity, ctx.now + AUTO_REVEAL_DELAY_MS),
            revealForced: true,
          },
        }
      case 'trivia-next':
        return state.stage === 'reveal' ? { state: atQuestion(state, state.index + 1, ctx.now) } : { state }
      default:
        return { state }
    }
  },

  onTick: settle,

  skip: (state, ctx) => ({ state: atQuestion(state, state.index + 1, ctx.now) }),

  shiftTime: (state, ms) => ({
    ...state,
    deadline: state.deadline + ms,
    revealAt: state.revealAt === null ? null : state.revealAt + ms,
  }),

  isFinished: (state) => state.stage === 'done',

  playerView(state, playerId, ctx) {
    const answered = hasAnswered(state, playerId) ? state.answers[playerId] : null
    const question = state.questions[state.index]
    if (state.stage === 'reveal') {
      const correct = answered === question.correct
      return { kind: 'trivia-reveal', questionIndex: state.index, answered, correct, points: correct ? TRIVIA_POINTS : 0 }
    }
    return {
      kind: 'trivia-question',
      questionIndex: state.index,
      optionCount: question.options.length,
      answered,
      msLeft: Math.max(0, state.deadline - ctx.now),
    }
  },
}
