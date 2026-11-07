import { ConnectionStatus } from '../molecules/ConnectionStatus'
import { useLanguage } from '../../app/LanguageProvider'

export function WelcomePanel() {
  const { translate } = useLanguage()

  return (
    <section className="welcome-card">
      <div className="welcome-copy grid">
        <h1 className="welcome-title">
          {translate('welcomeTitle').replace(/!$/, '')}<ConnectionStatus />
        </h1>
        <p className="welcome-description">
          {translate('welcomeDescription')}
        </p>
      </div>
    </section>
  )
}
