# Quizgame

A browser-based party quiz game in the style of a TV gameshow. One computer hosts the game on a big screen (TV or projector). Players join on their phones by scanning a QR code or typing a room code.

## Hard constraints

- **Static site only.** The game is hosted for free on GitHub Pages, so there is no backend server. Never add one.
- **The host's browser is the game server.** Phones connect to it peer-to-peer over WebRTC using PeerJS and the free public PeerJS cloud broker.
- **Hash routing.** Routes are `#/` (landing), `#/host` and `#/play`, so refreshing on GitHub Pages never returns a 404. Vite `base` is `'./'`, so the build works under `https://<user>.github.io/<repo>/` without hardcoding the repo name.
- **Swedish first.** Every UI string lives in `src/i18n/sv.ts`. Components never hardcode text.

If a change would break one of these constraints, ask the user first.

## Stack

Vite, React, TypeScript (strict), Tailwind CSS v4 (via `@tailwindcss/vite`), Framer Motion, Zustand and Vitest.

```
npm run dev        # dev server
npm test           # vitest run
npm run build      # typecheck + production build into dist/
npm run typecheck
npm run validate-content   # schema + duplicate check of every pack; lists items marked "verify"
```

## Layout

| Folder | Purpose |
|---|---|
| `src/net` | Networking. `transport.ts` defines the `HostTransport` and `ClientTransport` interfaces, `protocol.ts` defines the messages, and `peerjs.ts` is the only file that imports PeerJS. |
| `src/game` | Pure game logic: the lobby (`lobby.ts`), the game flow (`game.ts`), the `RoundDefinition` interface (`round.ts`), the free-text matcher (`matcher.ts`), scoring and room codes. No React, DOM, PeerJS or timers. |
| `src/rounds/<round-type>` | One folder per round type (`trivia` is "Allmänbildning", `closest` is "Närmast vinner", `pass` is "Skicka vidare", `letters` is "Bokstavsjakt"). Each holds `logic.ts` (pure, implements `RoundDefinition`, tested in `logic.test.ts`), `*Host.tsx` for the big screen and `*Phone.tsx` for the phone. `src/rounds/index.ts` registers the round types. |
| `src/content` | Content packs (`packs/**/*.json`) and the code around them: `schema.ts` (Zod), `validate.ts`, `catalog.ts` (glob import), `setup.ts` (builder presets and estimates), `plan.ts` (picks the questions for a game) and `usage.ts` (used-question history). See "Content packs" below. |
| `src/host` | The big-screen UI. |
| `src/player` | The phone UI. |
| `src/i18n` | `sv.ts` holds all strings and `en.ts` holds partial translations that fall back to Swedish. Import `strings` from `src/i18n`. |
| `src/audio` | Sound effects (`index.ts`) and the host-only music layer (`music/`). Audio must be unlocked from a user gesture. |
| `src/app` | The app shell: hash router, `App` and landing page. |
| `src/ui` | Small presentational components shared by the host and player UIs, such as `AvatarBadge`. |

Session wiring lives in Zustand stores: `src/host/hostStore.ts` and `src/player/playerStore.ts`. They connect the transport to `src/game` and hold the connection bookkeeping (peer↔player maps, timers and reconnects). Components only read from the stores and call their actions.

## Game flow and rounds

- `RoomState.game` runs through the rounds in order. Each round goes intro → round → standings, and standings after the last round is the final result (`phase: 'finished'`). The host moves on with a `continue` action. On the final result, "Nytt spel – tillbaka till lobbyn" calls `backToLobby` (`game.ts`): same room code, connected players stay with scores reset to 0, disconnected ones are dropped.
- Every `RoundSetup` has a `titleKey`, which picks the title and rules from `strings.rounds`. One round type can appear several times under different names. For example, `letters` is used for both "Gissa ordspråket" (`proverbs`: the whole proverb is hidden and its meaning is the clue) and "Gissa ordet – teman" (`themes`), with different packs. Long answers start flipping faster (`flipIntervalFor`) and get smaller tiles. The flips slow down as more tiles show (`flipAt`): the last gap is twice the first (`SLOWDOWN`). The host's `GameSetup` (from the builder) is turned into rounds by `buildGamePlan()` in `src/content/plan.ts`.
- Randomness inside round logic must be seeded so it stays pure. The letters round shuffles its flip order with a PRNG seeded from the question's start time.
- Round logic implements `RoundDefinition` (`src/game/round.ts`). It returns `scoreDeltas` rather than touching scores, and `game.ts` applies them. Totals may go negative.
- **"Närmast vinner"** (`closest`): everyone types one number. Exact scores 500, the closest distance 200 and the second closest 100; ties share a place (`placings` in `logic.ts`). It reveals like trivia: after a drumroll once everyone has guessed, or on "Visa svar".
- **Timers:** trivia (20 s) and closest (30 s) have a `deadline` per question; when it passes, the reveal starts and late answers are ignored. In pass the answerer gets 30 s (`answerDeadline`) and running out counts as wrong. Views carry `msLeft` (not a timestamp, since phone clocks differ) and phones count down from when the view arrived (`useCountdown` in `src/ui/Countdown.tsx`).
- Time-based behavior, such as the trivia auto-reveal, goes in `onTick`. The host store calls `game.tick` every 250 ms with `Date.now()`.
- **Phones are dumb views.** After every state change the host computes `phoneView(room, playerId)` for each phone and sends it as `{ type: 'view', view, score }`, skipping unchanged views. A reconnecting phone gets its current screen back the same way. `playerView` must never include answers before they're revealed.
- Intents carry a `questionIndex`, so late or stale taps are ignored.
- Free-text answers go through `matchAnswer` in `src/game/matcher.ts`. It ignores case, accents, punctuation and leading articles, and forgives small typos, but numbers must match exactly. The host can always override the verdict.
- **Adding a round type:** create `src/rounds/<type>/logic.ts` with tests, add it to the unions and to `ROUNDS` in `src/rounds/index.ts`, add host and phone views to `GameScreen` and `PlayerScreen`, put its strings in `sv.ts`, add a pack schema to `src/content/schema.ts`, and add the round to `ROUND_INFO`, `ROUND_KEYS` and `buildGamePlan` in `src/content`.

## Content packs

- **One JSON file per pack** anywhere under `src/content/packs/`. `catalog.ts` bundles them all with `import.meta.glob`.
- **Pack fields:** `id`, `name`, `roundType` (`trivia` | `closest` | `pass` | `letters` | `music`), `language`, `region` (`sverige` | `internationellt` | `blandat`), `difficulty` (`easy` | `medium` | `hard`) and `items`.
  - Letters packs also have `variant` (`proverbs` | `themes`) and `theme`.
  - Closest items have a numeric `answer`, an optional `unit` ("km", "%") and `year: true` for years (printed without a thousands separator).
  - Items can override `region` and `difficulty`. A `blandat` pack should set `region` on each item, so the "Sverige" filter can find them.
- **Every item has a stable `id`.** The used-question history (`localStorage` `quizgame.usedItems`) stores `packId/itemId`, so never rename ids.
- **Uncertain facts** get `"verify": true`. `npm run validate-content` lists them for a human to check.
- **Validation:** run `npm run validate-content` after editing content. It applies the Zod schema and flags duplicate pack ids, item ids, questions (per round type, normalized) and Deezer IDs. `validate.test.ts` also fails `npm test` on any error.
- **Music packs** store a verified `deezerId` plus a `search` fallback. Resolve IDs against the API rather than guessing them. Search results are full of covers and live versions, and artist names must match exactly.
- **Picking questions:** `buildGamePlan` takes unused items first (random order), then reuses old ones. It alternates between packs so themes mix, never repeats an item within a game, and skips rounds with nothing available. The host store marks the picked items as used when a game starts.

## Game builder

- `#/host` opens the builder (`src/host/GameBuilder.tsx`) before the lobby. It has four presets (`presetSetup` in `src/content/setup.ts`):
  - "Klassisk kväll": every round there is.
  - "Snabb runda": four rounds, about 15 minutes.
  - "Musikkväll".
  - "Bara Sverige": every round, filtered to `region: sverige`.
- **Custom mode:** drag rows to reorder (Framer Motion `Reorder`, with ▲▼ buttons as an alternative), toggle rounds, pick a pack, set counts, and filter by region and difficulty. Any edit switches the setup to `preset: 'custom'`.
- **Time estimate:** `estimateMinutes` uses `ROUND_INFO.secondsPerItem` plus a fixed overhead per round, assuming 6 players before anyone has joined.
- **Saved setup:** the last setup is stored in `localStorage` (`quizgame.setup`) and read back through `parseSetup`, which repairs old or invalid data.
- **Lobby:** shows a summary and an "Ändra upplägg" button. The music source picker (Deezer or local folder) lives in the builder.

## Music rounds

Music plays only on the host. Phones never receive audio or track metadata before the reveal.

- **"Musik – snabbast vinner"** (`music-race`) is Kahoot-style. Each track asks "Vem är artisten?" or "Vad heter låten?", alternating, with up to four options. `musicChoiceQuestions` in `plan.ts` builds the options when the game is planned, drawing wrong ones from the whole music pool and never anything equal (normalized) to the right answer. Wrong options are ranked by `optionSimilarity`: same region first, then similar era (by `year`), and for titles the same language (`looksSwedish`) and a similar length. A little randomness keeps the options varying between games. Local files have no year or region, so their options are mostly random. There's one answer per player, scored by speed (1000 → 100 over the clip), and points are handed out on the reveal.
- **"Musik – buzzer"** (`music-buzzer`): the buzzer types artist **and** title. Each part right scores `BUZZ_PART_POINTS` (250) and is solved for good, and the host screen shows it with the solver's name. Unsolved parts stay open for the next buzz, and the phone only asks for those. Everyone buzzes once per song, and a buzz with nothing new right costs 250. The buzzing player has 20 s (`ANSWER_MS`). A wrong or half-right answer never reveals the missing part: the song plays on. It ends only when both parts are solved, the clip runs out or the host presses "Visa svar", even if everyone has already buzzed. The host judges spoken answers part by part (`music-judge { artist, title }`).

- **The round state is the clock.** `src/rounds/music/track.ts` tracks play time as a `Clip` (`playedMs` plus `segmentStartedAt`), and a buzz pauses it. Each track starts in `loading`. `MusicDeck` (on the host) loads and plays the clip, then dispatches `music-ready`, and only then does the clock start. A load failure dispatches `music-failed`, which skips the track. Both actions carry the track `index`, so stale callbacks are ignored.
- **Deezer.** `src/audio/music/deezer.ts` uses the public API (no login). `api.deezer.com` sends no CORS headers, so track lookups use **JSONP**. The preview MP3s on `*.dzcdn.net` *do* send `Access-Control-Allow-Origin: *`, so `library.ts` fetches them as blobs. That makes preloading complete and lets the Web Audio analyser read them for the equalizer. Preview URLs are signed and expire, so packs store a `deezerId` plus a `search` fallback, never preview URLs. `pickBestTrack` filters search hits by artist and skips live, acoustic and remix versions.
- **Preloading:** `MusicDeck` preloads the next track while the current one plays, and `GameScreen` preloads a music round's first track during its intro.
- **Lokal musik:** the host picks a folder in the lobby (`MusicSourcePicker`). Files must be named "Artist - Title.ext". They're held in memory as `File` objects and played via `blob:` URLs. They're never uploaded, sent to phones, persisted, or committed (audio extensions are in `.gitignore`). After a host reload the files are gone, and `MusicDeck` asks the host to pick the folder again.
- **Playback:** one `<audio>` element (`src/audio/music/player.ts`) is routed through the shared `AudioContext` with an analyser. If the browser blocks playback, the deck shows a "Starta musiken" button.

## Connections and reconnects

- **Identity:** each phone has a persistent `playerId` in `localStorage`, managed by `src/player/storage.ts`. Every storage access is wrapped in try/catch. The phone sends this ID with each `join`, and if the host already knows it, the player is *resumed* with their name, avatar and score intact. Don't use `crypto.randomUUID`, because it's unavailable over plain http on a LAN IP.
- **Heartbeat:** the phone sends `ping` every 3 seconds and the host answers with `pong`. The host's `sweepStale` marks players silent for more than 10 seconds as disconnected. Players are never removed automatically. A phone that hears nothing from the host for 10 seconds reconnects with backoff. It also reconnects immediately on `visibilitychange` and `online` events (screen unlock, Wi-Fi coming back).
- **Same ID twice:** if a second connection arrives with a known `playerId`, the host sends `replaced` to the old connection and closes it.
- **Host reload:** the room is saved in `sessionStorage` and the same room code is claimed again, so phones reconnect on their own.
- **Testing several players in one browser:** `#/play?player=2` gives that tab its own storage slot and identity.
- **Room codes:** 4 uppercase letters without I or O. The PeerJS ID is `quizgame-<CODE>`.

## Host controls

The host's control bar (`src/host/HostControls.tsx`, top center, faint until hovered) has fullscreen (F), pause (P), skip question (needs a second click to confirm), adjust score (±10/±100), volume and mute (M), and help.

- **Pause:** sets `game.pausedAt`. While paused, `tick` and phone intents are ignored, phones show `{ kind: 'paused' }` and music stops. On resume, `game.ts` calls the round's `shiftTime(state, pausedMs)`, so reveal timers, tile flips, clip time and buzzer countdowns lose nothing. Every round must implement `shiftTime` correctly.
- **Skip:** calls the round's `skip()`. It moves to the next question without awarding anything more; points already given stay, and the host can fix them with adjust score.
- **Adjust score:** `{ type: 'adjust-score', playerId, delta }` is game-level and works in any stage.

## Audio

All sound is synthesized in `src/audio/index.ts`; there are no audio files. Everything, music included, goes through one master `GainNode` (`getOutput()`). Volume and mute live in `localStorage` (`quizgame.volume`).

The jingles are:
- An intro sting when the game starts.
- A "ta-da" on later round intros.
- A drumroll before trivia reveals and before the winner.
- A fanfare for the winner.

Trivia reveals are scheduled (`revealAt`), so the drumroll plays both for the automatic reveal and for "Visa svar".

**Background music ("hissmusik")** lives in `src/audio/backgroundMusic.ts`: two original synthesized loops, `lobby` and `question`, played by a lookahead scheduler on their own gain bus (cross-fade on switch, fade-out on stop). `backgroundTrackFor` (`src/host/backgroundTrack.ts`, tested) picks the tune from the room: the lobby, and trivia/closest questions until the drumroll plus pass choosing/answering. Intros, standings, reveals, pauses and music rounds stay silent. The host can switch it off with 🎵 or B (`quizgame.backgroundMusic` in `localStorage`). Never copy a real show's theme tune.

## Hidden test mode

Five quick clicks (within 2 s) in the top right corner of any host screen toggle a test mode (`TestModeHotspot`, remembered in `sessionStorage` for the tab). A "🧪 Testläge" badge shows while it's on. `start()` then plans the game with `testRunSetup(setup)` and a player count of 1, so every enabled round gets exactly one question, Skicka vidare included. Test games don't mark questions as used. It works in production builds too, for testing the deployed site. Combine it with bots (`#/host?bots=3`) to run through every round in a couple of minutes.

## Dev bots

`#/host?bots=8` (dev builds only, up to 15) adds fake players. `src/net/loopback.ts` wraps the real `HostTransport`, and each bot (`src/dev/bots.ts`) is an in-page client speaking the normal protocol: JSON round-trips with 20–80 ms latency, `join`, `ping`, and intents sent after human-ish delays. Bots answer correctly some of the time by peeking at the host's state. The code is loaded with `import()` behind `import.meta.env.DEV`, so production builds don't include it.

## Accessibility and phone UX

- **Never rely on color alone.** Answer buttons have shapes, results have text, status badges have ✓, ✗ or 🔒.
- **Contrast:** keep at least 4.5:1, or 3:1 for big bold text. White text needs `*-600` or darker backgrounds; amber and yellow backgrounds get dark text (`text-amber-950` or `text-orange-950`).
- **Reduced motion:** `MotionConfig reducedMotion="user"` in `App` stops Framer Motion movement. `index.css` stops CSS animations under `prefers-reduced-motion`, and the equalizer drifts slowly instead of dancing.
- **Inputs:** never below 16px (iOS zooms on focus). There's a base-layer rule in `index.css`; keep it in `@layer base` so `text-*` utilities still win. Don't disable pinch zoom.
- **Wake lock:** `useWakeLock` keeps phones (while joined) and the host (while the room is open) awake, where supported.
- **Screen sizes:** check phone screens at iPhone SE size (375×667) and in landscape. Put errors at the top of forms so they're visible without scrolling.
- **Broker outage:** if the PeerJS broker can't be reached, the host shows a friendly error with "Försök igen". A phone shows "Kunde inte ansluta…" and keeps its form, so "Gå med" retries.

## Testing on a phone during development

Run `npm run dev -- --host`, then open the host page via the **Network** URL that Vite prints (e.g. `http://192.168.0.22:5173/#/host`), not via `localhost`. The QR code encodes the host page's own address, so a host opened on `localhost` gives phones a QR code that doesn't work. The phone and the computer must be on the same Wi-Fi.

## Architecture rules

### The host is the single source of truth

All game state lives in the host's browser. The host validates every intent, applies the rules from `src/game`, and broadcasts the resulting state to the phones. Phones render what the host sends them and keep no authoritative state of their own.

### Phones only send intents

A phone message says what the player *wants* to do, such as `{ type: 'answer', questionId, choice }`. It never says what *happened*, such as "I scored 800 points". The host checks the timing, the score and whether the answer counts.

### Message protocol

- Every message is a plain JSON-serializable object with a string `type` field.
- All message types are declared as discriminated unions in `src/net/protocol.ts`: `ClientMessage` (phone to host) and `HostMessage` (host to phone).
- Handle messages with an exhaustive `switch (msg.type)`.
- Treat incoming data as untrusted and validate it on the host before acting on it.

### Networking stays behind the transport

Game and UI code depend only on the interfaces in `src/net/transport.ts`. Do not import `peerjs` anywhere except `src/net/peerjs.ts`. Swapping to Socket.IO or Firebase later should mean writing a new `TransportFactory` and changing nothing else.

### `src/game` must be pure and unit-tested

- No React, DOM, network or global state. Inject randomness and time as parameters (for example `random: () => number` or `now: number`).
- Prefer reducer-style functions: `(state, event) => newState`.
- Every module in `src/game` has a `*.test.ts` next to it. Add or update tests with every change.
- React components and Zustand stores call into `src/game`. They never reimplement its rules.

### All text goes through i18n

- Add every new string to `src/i18n/sv.ts`, grouped by screen, and read it as `strings.<group>.<key>`.
- Never put a user-visible string literal in a component. That includes `aria-label`, `alt` and `title` attributes.
- `en.ts` can stay partial. Missing keys fall back to Swedish.
- Question text lives in the content packs, not in i18n.

### UI

- The player UI is mobile-first, with big touch targets, one action per screen and `min-h-dvh`.
- The host UI is designed for a 16:9 screen viewed from across a room: very large type, high contrast and no small controls during play.
- Use Framer Motion for gameshow-style transitions.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. In the repo, go to **Settings → Pages → Source** and select **GitHub Actions**.
