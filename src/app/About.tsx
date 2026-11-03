import { strings } from '../i18n'
import { routeHref } from './router'

export function About() {
  const t = strings.about
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-5 py-10 text-lg leading-relaxed">
      <a href={routeHref.landing} className="self-start rounded-xl bg-white/15 px-4 py-2 font-bold hover:bg-white/25">
        ← {t.back}
      </a>
      <header>
        <h1 className="text-5xl font-black">{t.title}</h1>
        <p className="mt-4 text-xl text-indigo-100">{t.intro}</p>
      </header>
      <Section title={t.howTitle} items={t.how} />
      <Section title={t.privacyTitle} items={t.privacy} />
      <section>
        <h2 className="mb-2 text-2xl font-black">{t.creditsTitle}</h2>
        <p className="text-indigo-100">{t.credits}</p>
      </section>
    </main>
  )
}

function Section({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <section>
      <h2 className="mb-2 text-2xl font-black">{title}</h2>
      <ul className="list-disc space-y-2 pl-6 text-indigo-100">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
