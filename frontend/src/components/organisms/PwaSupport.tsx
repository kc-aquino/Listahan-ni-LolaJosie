import { useEffect, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useLanguage } from '../../app/LanguageProvider'
import { Icon } from '../atoms/Icon'

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaSupport() {
  const { translate } = useLanguage()
  const busy = useIsMutating() > 0
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('lista-pwa-dismissed') === 'true')
  const [installing, setInstalling] = useState(false)
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError(error) { console.warn('App offline support could not start.', error) },
  })

  useEffect(() => {
    const connect = () => setOnline(true)
    const disconnect = () => setOnline(false)
    const available = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt) }
    const complete = () => { setInstalled(true); setInstallPrompt(null) }
    const checkUpdate = () => {
      if (navigator.onLine && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {})
      }
    }
    window.addEventListener('online', connect)
    window.addEventListener('offline', disconnect)
    window.addEventListener('beforeinstallprompt', available)
    window.addEventListener('appinstalled', complete)
    const timer = window.setInterval(checkUpdate, 60 * 60 * 1000)
    return () => {
      window.removeEventListener('online', connect)
      window.removeEventListener('offline', disconnect)
      window.removeEventListener('beforeinstallprompt', available)
      window.removeEventListener('appinstalled', complete)
      window.clearInterval(timer)
    }
  }, [])

  async function install() {
    if (!installPrompt) return
    setInstalling(true)
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted') setInstalled(true)
    } catch {
      // The browser may cancel or withdraw an install prompt. Its own install menu remains available.
    } finally { setInstallPrompt(null); setInstalling(false) }
  }

  return <div className="grid gap-2 bg-base-100 px-4 py-0" data-theme="lola">
    {!online && <section role="status" className="mx-auto my-3 grid w-full max-w-6xl gap-1 rounded-box border border-warning bg-warning/10 p-4">
      <h2 className="font-bold">{translate('pwaOfflineTitle')}</h2>
      <p>{translate('pwaOfflineDescription')}</p>
    </section>}
    {needRefresh && <section role="status" className="mx-auto my-3 grid w-full max-w-6xl gap-3 rounded-box border border-primary/30 bg-primary/5 p-4 sm:grid-cols-[1fr_auto]">
      <div><h2 className="font-bold">{translate('pwaUpdateTitle')}</h2><p className="mt-1">{translate('pwaUpdateDescription')}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={!online || busy} onClick={() => void updateServiceWorker(true)}>{translate('pwaReload')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setNeedRefresh(false)}>{translate('pwaLater')}</button>
      </div>
    </section>}
    {!installed && !dismissed && (installPrompt || ios) && <section className="mx-auto my-3 grid w-full max-w-6xl gap-3 rounded-box border border-base-300 bg-base-200/50 p-4 sm:grid-cols-[1fr_auto]" aria-label={translate('pwaInstall')}>
      <div><h2 className="form-section-label"><Icon name="store" className="size-5" />{translate('pwaInstall')}</h2><p className="mt-1">{installPrompt ? translate('pwaInstallDescription') : translate('pwaIosInstall')}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {installPrompt && <button type="button" className="btn btn-primary" disabled={installing} onClick={() => void install()}>{translate('pwaInstall')}</button>}
        <button type="button" className="btn btn-ghost" onClick={() => { setDismissed(true); sessionStorage.setItem('lista-pwa-dismissed', 'true') }}>{translate('pwaLater')}</button>
      </div>
    </section>}
  </div>
}
