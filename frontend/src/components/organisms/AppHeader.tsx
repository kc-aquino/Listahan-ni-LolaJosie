import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AuthProvider'
import { useLanguage, type Language } from '../../app/LanguageProvider'
import { Icon } from '../atoms/Icon'
import { BottomNavigation } from './BottomNavigation'

export function AppHeader() {
  const { language, setLanguage, translate } = useLanguage()
  const { logout } = useAuth()
  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'tl', label: 'Taglish' },
  ]

  return (
    <header className="lola-navbar navbar sticky top-0 z-10 min-h-16 px-3 backdrop-blur sm:px-5 lg:px-8">
      <div className="app-header-content mx-auto grid w-full max-w-6xl items-center gap-1 sm:gap-2">
        <Link aria-label={translate('homeAria')} className="app-brand btn btn-ghost h-12 min-h-12 shrink-0 gap-2 px-1 text-base font-bold sm:px-2 sm:text-xl" to="/">
          <img alt="" className="brand-logo size-12" src="/img/logoMinimalist.png" />
          <span className="whitespace-nowrap">Listahan <span className="text-primary">ni Lola</span></span>
        </Link>
        <nav aria-label={translate('mainNavigation')} className="app-desktop-nav hidden lg:block">
          <BottomNavigation />
        </nav>
        <div className="app-header-actions">
          <button
            aria-label={translate('signOut')}
            className="btn btn-ghost touch-target px-2"
            onClick={logout}
            title={translate('signOut')}
            type="button"
          >
            <Icon className="size-5" name="logout" />
            <span>{translate('signOut')}</span>
          </button>
          <div aria-label={translate('language')} className="language-switch join" role="group">
            {languages.map(({ code, label }) => (
              <button
                aria-label={label}
                aria-pressed={language === code}
                className={`btn join-item ${language === code ? 'btn-primary' : ''}`}
                key={code}
                onClick={() => setLanguage(code)}
                type="button"
              >
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
