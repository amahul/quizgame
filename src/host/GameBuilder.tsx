import { useState } from 'react'
import { motion, Reorder, useDragControls } from 'framer-motion'
import { catalog } from '../content/catalog'
import { availableCount, eligiblePacks, matchesFilters, wantedCount } from '../content/plan'
import {
  ESTIMATE_PLAYERS,
  estimateMinutes,
  PRESET_IDS,
  presetSetup,
  reorderRounds,
  ROUND_INFO,
  updateRound,
  type DifficultyFilter,
  type GameSetup,
  type RegionFilter,
  type RoundConfig,
} from '../content/setup'
import { loadUsed, resetUsed } from '../content/usage'
import { strings } from '../i18n'
import { useHostStore } from './hostStore'
import { MusicSourcePicker } from './MusicSourcePicker'

const REGION_FILTERS: RegionFilter[] = ['alla', 'sverige', 'internationellt']
const DIFFICULTY_FILTERS: DifficultyFilter[] = ['alla', 'easy', 'medium', 'hard']

/** The host's setup screen, shown before the lobby. */
export function GameBuilder() {
  const setup = useHostStore((s) => s.setup)
  const setSetup = useHostStore((s) => s.setSetup)
  const finish = useHostStore((s) => s.finishBuilding)
  const [usedCount, setUsedCount] = useState(() => loadUsed().size)
  const [resetDone, setResetDone] = useState(false)
  const t = strings.builder
  const hasRounds = setup.rounds.some((r) => r.enabled && availableCount(r, setup, catalog) > 0)

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-8 px-8 py-10">
      <header>
        <h1 className="text-6xl font-black">{t.title}</h1>
        <p className="mt-2 text-2xl text-indigo-200">{t.subtitle}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {PRESET_IDS.map((id) => {
          const preset = presetSetup(id)
          const selected = setup.preset === id
          return (
            <motion.button
              key={id}
              type="button"
              aria-pressed={selected}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSetup(preset)}
              className={`flex flex-col gap-2 rounded-3xl p-6 text-left shadow-xl transition-colors ${
                selected ? 'bg-gradient-to-br from-fuchsia-500 to-pink-600 ring-4 ring-white' : 'bg-white/10 hover:bg-white/15'
              }`}
            >
              <span className="text-2xl font-black">{t.presets[id].name}</span>
              <span className="text-lg opacity-90">{t.presets[id].description}</span>
              <span className="mt-auto text-xl font-bold text-yellow-300">{t.minutes(estimateMinutes(preset))}</span>
            </motion.button>
          )
        })}
      </section>

      <section className="flex flex-wrap gap-8">
        <Segmented
          label={t.region}
          options={REGION_FILTERS}
          labels={t.regions}
          value={setup.region}
          onChange={(region) => setSetup({ ...setup, preset: 'custom', region })}
        />
        <Segmented
          label={t.difficulty}
          options={DIFFICULTY_FILTERS}
          labels={t.difficulties}
          value={setup.difficulty}
          onChange={(difficulty) => setSetup({ ...setup, preset: 'custom', difficulty })}
        />
        {setup.preset === 'custom' && (
          <span className="self-end rounded-full bg-white/10 px-4 py-2 text-lg font-bold">{t.custom}</span>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-black">{t.rounds}</h2>
          <span className="text-lg text-indigo-200">{t.dragHint}</span>
        </div>
        <Reorder.Group
          axis="y"
          values={setup.rounds.map((r) => r.key)}
          onReorder={(order) => setSetup(reorderRounds(setup, order))}
          className="flex flex-col gap-3"
        >
          {setup.rounds.map((round, i) => (
            <RoundRow
              key={round.key}
              round={round}
              setup={setup}
              isFirst={i === 0}
              isLast={i === setup.rounds.length - 1}
              onChange={setSetup}
            />
          ))}
        </Reorder.Group>
      </section>

      <MusicSourcePicker />

      <footer className="sticky bottom-0 -mx-8 flex flex-wrap items-center gap-6 border-t border-white/10 bg-indigo-950/90 px-8 py-5 backdrop-blur">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-2xl font-black text-yellow-300">{t.estimate(estimateMinutes(setup), ESTIMATE_PLAYERS)}</span>
          <span className="text-lg text-indigo-200">
            {resetDone ? t.resetDone : usedCount > 0 && t.usedCount(usedCount)}
            {usedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  resetUsed()
                  setUsedCount(0)
                  setResetDone(true)
                }}
                className="ml-3 rounded-xl bg-white/10 px-3 py-1 font-bold text-white hover:bg-white/20"
              >
                {t.resetUsed}
              </button>
            )}
          </span>
        </div>
        {!hasRounds && <span className="text-xl text-rose-300">{t.noRounds}</span>}
        <motion.button
          type="button"
          disabled={!hasRounds}
          whileHover={hasRounds ? { scale: 1.04 } : undefined}
          whileTap={hasRounds ? { scale: 0.96 } : undefined}
          onClick={finish}
          className="rounded-3xl bg-gradient-to-br from-emerald-600 to-green-700 px-12 py-5 text-4xl font-black shadow-2xl disabled:opacity-30"
        >
          {t.toLobby} →
        </motion.button>
      </footer>
    </main>
  )
}

function RoundRow({
  round,
  setup,
  isFirst,
  isLast,
  onChange,
}: {
  round: RoundConfig
  setup: GameSetup
  isFirst: boolean
  isLast: boolean
  onChange: (setup: GameSetup) => void
}) {
  const controls = useDragControls()
  const t = strings.builder
  const info = ROUND_INFO[round.key]
  const title = strings.rounds[round.key].title
  const packs = eligiblePacks({ ...round, packId: null }, catalog)
  const available = availableCount(round, setup, catalog)
  const wanted = wantedCount(round, ESTIMATE_PLAYERS)
  const unit = info.perPlayer ? t.perPlayer : info.packType === 'music' ? t.songs : t.questions
  const keys = setup.rounds.map((r) => r.key)
  const index = keys.indexOf(round.key)
  const move = (delta: number) => {
    const order = [...keys]
    ;[order[index], order[index + delta]] = [order[index + delta], order[index]]
    onChange(reorderRounds(setup, order))
  }

  return (
    <Reorder.Item
      value={round.key}
      dragListener={false}
      dragControls={controls}
      className={`flex flex-wrap items-center gap-4 rounded-2xl p-4 ${round.enabled ? 'bg-white/10' : 'bg-white/5 opacity-60'}`}
    >
      <button
        type="button"
        aria-label={t.dragHandle(title)}
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none px-1 text-3xl text-indigo-200 active:cursor-grabbing"
      >
        ⠿
      </button>
      <div className="flex flex-col">
        <button type="button" aria-label={`${t.moveUp}: ${title}`} disabled={isFirst} onClick={() => move(-1)} className="leading-none disabled:opacity-20">
          ▲
        </button>
        <button type="button" aria-label={`${t.moveDown}: ${title}`} disabled={isLast} onClick={() => move(1)} className="leading-none disabled:opacity-20">
          ▼
        </button>
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={round.enabled}
          aria-label={t.toggle(title)}
          onChange={(e) => onChange(updateRound(setup, round.key, { enabled: e.target.checked }))}
          className="peer sr-only"
        />
        <span className="relative h-8 w-14 rounded-full bg-white/20 transition peer-checked:bg-emerald-600 after:absolute after:top-1 after:left-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-6" />
        <span className="min-w-64 text-2xl font-bold">{title}</span>
      </label>

      <select
        value={round.packId ?? ''}
        onChange={(e) => onChange(updateRound(setup, round.key, { packId: e.target.value || null }))}
        className="rounded-xl bg-white px-3 py-2 text-lg font-bold text-indigo-950"
      >
        <option value="">{t.allPacks(packs.reduce((n, p) => n + p.items.filter((i) => matchesFilters(i, p, setup)).length, 0))}</option>
        {packs.map((p) => (
          <option key={p.id} value={p.id}>
            {t.packOption(p.name, p.items.filter((i) => matchesFilters(i, p, setup)).length)}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <Stepper label={t.decrease} onClick={() => onChange(updateRound(setup, round.key, { count: round.count - 1 }))}>
          −
        </Stepper>
        <span className="w-10 text-center text-2xl font-black tabular-nums">{round.count}</span>
        <Stepper label={t.increase} onClick={() => onChange(updateRound(setup, round.key, { count: round.count + 1 }))}>
          +
        </Stepper>
        <span className="text-lg text-indigo-200">{unit}</span>
      </div>

      <span className="ml-auto text-lg">
        {available === 0 ? (
          <span className="text-rose-300">{t.noneAvailable}</span>
        ) : available < wanted ? (
          <span className="text-amber-300">{t.fewer(available)}</span>
        ) : (
          <span className="text-indigo-200">
            {t.minutes(Math.round((60 + wanted * info.secondsPerItem) / 60))}
          </span>
        )}
      </span>
    </Reorder.Item>
  )
}

function Stepper({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-10 w-10 rounded-xl bg-white/15 text-2xl font-black hover:bg-white/25 active:scale-90"
    >
      {children}
    </button>
  )
}

function Segmented<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string
  options: T[]
  labels: Record<T, string>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span className="text-lg text-indigo-200">{label}</span>
      <div className="flex gap-1 rounded-2xl bg-white/10 p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`rounded-xl px-4 py-2 text-lg font-bold ${value === option ? 'bg-white text-indigo-950' : 'hover:bg-white/10'}`}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  )
}
