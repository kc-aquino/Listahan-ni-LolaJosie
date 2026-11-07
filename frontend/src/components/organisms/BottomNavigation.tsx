import { NavLink } from 'react-router-dom'
import { useLanguage, type TranslationKey } from '../../app/LanguageProvider'
import { Icon, type IconName } from '../atoms/Icon'

const navigationItems: { label: TranslationKey; to: string; icon: IconName; end?: boolean }[] = [
  { label: 'home', to: '/', icon: 'home', end: true },
  { label: 'customers', to: '/customers', icon: 'customers' },
  { label: 'history', to: '/history', icon: 'history' },
  { label: 'reports', to: '/reports', icon: 'reports' },
]

type BottomNavigationProps = {
  mobile?: boolean
}

export function BottomNavigation({ mobile = false }: BottomNavigationProps) {
  const { translate } = useLanguage()

  return (
    mobile ? (
      <>
        {navigationItems.map((item) => (
          <NavLink
            aria-label={translate(item.label)}
            className={({ isActive }) =>
              `min-h-14 gap-1 text-xs ${isActive ? 'active text-primary' : ''}`
            }
            end={item.end}
            key={item.to}
            to={item.to}
          >
            <Icon className="size-5" name={item.icon} />
            <span>{translate(item.label)}</span>
          </NavLink>
        ))}
      </>
    ) : (
      <ul className="desktop-navigation">
        {navigationItems.map((item) => (
          <li key={item.to}>
            <NavLink
              aria-label={translate(item.label)}
              className={({ isActive }) =>
                `min-h-12 gap-2 px-3 font-semibold ${isActive ? 'active' : ''}`
              }
              end={item.end}
              to={item.to}
            >
              <Icon className="size-5" name={item.icon} />
              <span>{translate(item.label)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    )
  )
}
