// Dev-only fake players (#/host?bots=8). Each bot is a loopback client that speaks the
// normal phone protocol: it joins, pings, and reacts to the views the host sends with
// human-ish delays. To answer correctly some of the time, bots peek at the host's
// state (cheating is fine for a test harness). Never bundled in production builds.
import { AVATAR_COLORS, AVATAR_EMOJIS, type AvatarColor } from '../game/avatars'
import type { PhoneView } from '../game/game'
import type { RoomState } from '../game/lobby'
import type { LoopbackHub } from '../net/loopback'
import type { HostMessage } from '../net/protocol'
import type { RoundIntent } from '../rounds'

const NAMES = ['Agda', 'Bertil', 'Cissi', 'Dagge', 'Ebba', 'Frasse', 'Gittan', 'Hasse', 'Inga', 'Janne', 'Kicki', 'Lasse', 'Majken', 'Nisse', 'Ottilia', 'Pelle']
const WRONG = ['vet inte', 'Kalle', 'Stockholm', 'banan', '1999', 'Nej', 'ABBA?', 'hmm']
const PING_MS = 3_000

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]
const between = (min: number, max: number) => min + Math.random() * (max - min)

/** What the right answer is right now, read from the host's own state. */
function cheatSheet(room: RoomState | null): { choice?: number; number?: number; text?: string; artist?: string; title?: string } {
  const round = room?.game?.round
  if (!round) return {}
  switch (round.type) {
    case 'trivia':
      return { choice: round.state.questions[round.state.index]?.correct }
    case 'closest':
      return { number: round.state.questions[round.state.index]?.answer }
    case 'pass':
      return { text: round.state.questions[round.state.index]?.answers[0] }
    case 'letters':
      return { text: round.state.items[round.state.index]?.answer }
    case 'musicRace':
      return { choice: round.state.questions[round.state.index]?.correct }
    case 'musicBuzzer': {
      const track = round.state.tracks[round.state.index]
      return { artist: track?.artist, title: track?.title }
    }
  }
}

class Bot {
  private readonly client
  private readonly playerId = `bot-${Math.random().toString(36).slice(2, 10)}`
  private readonly skill = between(0.3, 0.85)
  private timers: ReturnType<typeof setTimeout>[] = []
  private readonly ping: ReturnType<typeof setInterval>
  private lastView = ''

  constructor(
    hub: LoopbackHub,
    private readonly name: string,
    private readonly room: () => RoomState | null,
  ) {
    this.client = hub.connect()
    this.client.onMessage((m) => this.receive(m))
    const color = pick(Object.keys(AVATAR_COLORS) as AvatarColor[])
    this.later(between(300, 2500), () =>
      this.client.send({ type: 'join', playerId: this.playerId, name: this.name, avatar: { emoji: pick(AVATAR_EMOJIS), color } }),
    )
    this.ping = setInterval(() => this.client.send({ type: 'ping' }), PING_MS)
  }

  stop() {
    this.timers.forEach(clearTimeout)
    clearInterval(this.ping)
    this.client.close()
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms))
  }

  private send(intent: RoundIntent) {
    this.client.send(intent)
  }

  private knows() {
    return Math.random() < this.skill
  }

  private receive(message: HostMessage) {
    if (message.type !== 'view') return
    const key = JSON.stringify(message.view)
    if (key === this.lastView) return
    this.lastView = key
    // A new screen: forget whatever we were about to do on the old one.
    this.timers.forEach(clearTimeout)
    this.timers = []
    this.react(message.view)
  }

  private react(view: PhoneView) {
    const answer = cheatSheet(this.room())
    switch (view.kind) {
      case 'trivia-question':
        if (view.answered !== null) return
        return this.later(between(1500, 7000), () =>
          this.send({
            type: 'trivia-answer',
            questionIndex: view.questionIndex,
            choice: this.knows() && answer.choice !== undefined ? answer.choice : Math.floor(Math.random() * view.optionCount),
          }),
        )
      case 'closest-question': {
        if (view.guessed !== null || answer.number === undefined) return
        // Good bots land within ±10 %, the rest within ±50 %; whole answers get whole guesses.
        const spread = this.knows() ? 0.1 : 0.5
        const raw = answer.number * (1 + between(-spread, spread))
        const value = Number.isInteger(answer.number) ? Math.round(raw) : Math.round(raw * 10) / 10
        return this.later(between(2000, 9000), () =>
          this.send({ type: 'closest-guess', questionIndex: view.questionIndex, value }),
        )
      }
      case 'pass-choose':
        return this.later(between(1500, 4000), () =>
          this.send({
            type: 'pass-decide',
            questionIndex: view.questionIndex,
            target: Math.random() < 0.4 || view.targets.length === 0 ? 'self' : pick(view.targets).id,
          }),
        )
      case 'pass-answer':
        return this.later(between(3000, 8000), () =>
          this.send({ type: 'pass-answer', questionIndex: view.questionIndex, text: this.knows() && answer.text ? answer.text : pick(WRONG) }),
        )
      case 'letters-guess':
        if (view.status !== 'open' || Math.random() < 0.2) return
        return this.later(between(2500, 14000), () =>
          this.send({ type: 'letters-guess', questionIndex: view.questionIndex, text: this.knows() && answer.text ? answer.text : pick(WRONG) }),
        )
      case 'music-choice':
        if (view.loading || view.answered !== null) return
        return this.later(between(2000, 12000), () =>
          this.send({
            type: 'music-choice',
            questionIndex: view.questionIndex,
            choice: this.knows() && answer.choice !== undefined ? answer.choice : Math.floor(Math.random() * view.optionCount),
          }),
        )
      case 'buzzer':
        if (view.stage !== 'playing' || view.locked || Math.random() < 0.5) return
        return this.later(between(2000, 14000), () => this.send({ type: 'music-buzz', questionIndex: view.questionIndex }))
      case 'buzzer-answer':
        // Each part right on its own, so bots sometimes solve just one of them.
        return this.later(between(1500, 6000), () =>
          this.send({
            type: 'music-buzz-answer',
            questionIndex: view.questionIndex,
            artist: view.needArtist ? (this.knows() && answer.artist ? answer.artist : pick(WRONG)) : '',
            title: view.needTitle ? (this.knows() && answer.title ? answer.title : pick(WRONG)) : '',
          }),
        )
      default:
        return
    }
  }
}

/** Starts `count` bots; returns a function that disconnects them all. */
export function startBots(hub: LoopbackHub, count: number, room: () => RoomState | null): () => void {
  const names = [...NAMES].sort(() => Math.random() - 0.5)
  const bots = Array.from({ length: count }, (_, i) => new Bot(hub, `${names[i % names.length]} 🤖`, room))
  return () => bots.forEach((bot) => bot.stop())
}
