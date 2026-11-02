import { Outlet } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageProvider'
import { AppHeader } from '../organisms/AppHeader'
import { BottomNavigation } from '../organisms/BottomNavigation'

export function AppLayout() {
  const { translate } = useLanguage()

  return (
    <div className="app-background min-h-screen" data-theme="lola">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-6xl gap-7 px-4 py-5 pb-28 sm:px-6 sm:py-7 md:gap-9 md:py-9 lg:px-8">
        <Outlet />
      </main>
      <nav
        aria-label={translate('mobileNavigation')}
        className="mobile-navigation btm-nav lg:hidden"
      >
        <BottomNavigation mobile />
      </nav>
    </div>
  )
}
