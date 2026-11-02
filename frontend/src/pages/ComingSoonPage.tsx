import { Link } from 'react-router-dom'
import { useLanguage, type TranslationKey } from '../app/LanguageProvider'

type ComingSoonPageProps = {
  title: TranslationKey
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  const { translate } = useLanguage()

  return (
    <section className="card mx-auto my-8 max-w-2xl border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-4 p-6 md:p-10">
        <p className="text-xs font-bold tracking-[0.16em] text-primary">
          {translate('comingSoonEyebrow')}
        </p>
        <h1 className="card-title text-3xl">{translate(title)}</h1>
        <p className="text-lg leading-relaxed text-base-content/70">
          {translate('comingSoonMessage')}
        </p>
        <Link className="btn btn-primary mt-2 min-h-14 w-fit px-6 text-base" to="/">
          {translate('returnHome')}
      </Link>
      </div>
    </section>
  )
}
