import { ROUND_KEYS } from '../content/setup'
import { strings } from '../i18n'

/** "Så spelar du": joining, playing and every round's rules. */
export function HelpContent({ large = false, forHost = false }: { large?: boolean; forHost?: boolean }) {
  const t = strings.help
  const text = large ? 'text-2xl' : 'text-base'
  const heading = large ? 'text-3xl' : 'text-xl'
  return (
    <div className={`flex flex-col gap-6 ${text}`}>
      <ol className="flex flex-col gap-3">
        {t.steps.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden
              className={`flex shrink-0 items-center justify-center rounded-full bg-yellow-300 font-black text-indigo-950 ${
                large ? 'h-12 w-12 text-2xl' : 'h-8 w-8'
              }`}
            >
              {i + 1}
            </span>
            <span className="self-center">{step}</span>
          </li>
        ))}
      </ol>
      <section>
        <h3 className={`mb-3 font-black ${heading}`}>{t.rounds}</h3>
        <dl className="flex flex-col gap-3">
          {ROUND_KEYS.map((key) => (
            <div key={key} className="rounded-2xl bg-white/5 p-3">
              <dt className="font-bold text-yellow-300">{strings.rounds[key].title}</dt>
              <dd className="text-indigo-100">{strings.rounds[key].rules}</dd>
            </div>
          ))}
        </dl>
      </section>
      {forHost && (
        <section>
          <h3 className={`mb-3 font-black ${heading}`}>{t.hostTips}</h3>
          <ul className="list-disc space-y-2 pl-6 text-indigo-100">
            {t.hostTipList.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
