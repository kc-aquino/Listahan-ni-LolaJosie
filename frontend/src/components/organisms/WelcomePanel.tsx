import { ConnectionStatus } from '../molecules/ConnectionStatus'
import { useLanguage } from '../../app/LanguageProvider'

export function WelcomePanel() {
  const { translate } = useLanguage()

  return (
    <section className="welcome-card card overflow-hidden md:card-side">
      <div className="welcome-copy card-body justify-center gap-3 p-6 md:p-10">
        <p className="welcome-eyebrow text-xs font-bold tracking-[0.16em]">LISTA NI LOLA JOSIE</p>
        <h1 className="welcome-title card-title text-3xl leading-tight md:text-4xl">
          {translate('welcomeTitle')}
        </h1>
        <p className="welcome-description max-w-2xl text-lg leading-relaxed">
          {translate('welcomeDescription')}
        </p>
        <ConnectionStatus />
      </div>
      <div aria-hidden="true" className="welcome-bubbles hidden md:grid">
        <span className="welcome-bubble welcome-bubble--large">L</span>
        <span className="welcome-bubble welcome-bubble--small welcome-bubble--pink" />
        <span className="welcome-bubble welcome-bubble--small welcome-bubble--aqua" />
      </div>
    </section>
  )
}
