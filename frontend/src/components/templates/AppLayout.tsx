import { Outlet } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageProvider'
import { AppHeader } from '../organisms/AppHeader'
import { BottomNavigation } from '../organisms/BottomNavigation'

export function AppLayout() {
  const { translate } = useLanguage()

  return (
    <div className="app-background min-h-screen" data-theme="lola">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-6xl gap-7 px-4 pt-5 pb-28 sm:px-6 sm:pt-7 md:gap-9 md:pt-9 md:pb-28 lg:px-8 lg:pb-9">
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
