import { DebtCategories } from '../components/organisms/DebtCategories'
import { QuickActions } from '../components/organisms/QuickActions'
import { WelcomePanel } from '../components/organisms/WelcomePanel'

export function HomePage() {
  return (
    <div className="home-page">
      <WelcomePanel />
      <QuickActions />
      <DebtCategories />
    </div>
  )
}
