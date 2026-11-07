import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthProvider'
import { useLanguage, type Language } from '../app/LanguageProvider'
import { ApiError } from '../lib/api'

type LoginLocationState = {
  from?: {
    pathname?: string
  }
}

export function LoginPage() {
  const { login } = useAuth()
  const { language, setLanguage, translate } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const signIn = useMutation({
    mutationFn: () => login(username, password),
    onSuccess: () => {
      const state = location.state as LoginLocationState | null
      navigate(state?.from?.pathname ?? '/', { replace: true })
    },
  })

  const errorMessage =
    signIn.error instanceof ApiError
      ? signIn.error.message
      : signIn.error
        ? translate('loginError')
        : null

  return (
    <main className="app-background login-page grid min-h-screen place-items-center px-4 py-8" data-theme="lola">
      <div className="login-shell">
        <aside className="login-intro">
          <img alt="Listahan ni Lola" className="login-illustration" src="/img/logo.png" />
          <p className="section-kicker">LISTAHAN NI LOLA JOSIE</p>
          <h2>{translate('loginIntroTitle')}</h2>
          <p>{translate('welcomeDescription')}</p>
        </aside>
        <section
          aria-labelledby="login-title"
          className="login-card card bg-base-100"
        >
          <div className="card-body gap-5 p-6 sm:p-9">
            <div className="login-language">
              <div aria-label={translate('language')} className="language-switch join" role="group">
                {([
                  { code: 'en', label: 'English' },
                  { code: 'tl', label: 'Taglish' },
                ] as { code: Language; label: string }[]).map(({ code, label }) => (
                  <button
                    aria-label={label}
                    aria-pressed={language === code}
                    className={`btn join-item ${language === code ? 'btn-primary' : ''}`}
                    key={code}
                    onClick={() => setLanguage(code)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="login-brand">
              <img alt="" className="brand-logo size-14" src="/img/logoMinimalist.png" />
              <p className="text-xl font-bold">
                Listahan <span className="text-primary">ni Lola</span>
              </p>

            </div>
            <div>
              <h1 className="text-3xl font-bold" id="login-title">
                {translate('loginTitle')}
              </h1>
              <p className="mt-2 text-base-content/75">{translate('loginDescription')}</p>
            </div>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                signIn.mutate()
              }}
            >
              <label className="form-control gap-2">
                <span className="font-semibold">{translate('username')}</span>
                <input
                  autoComplete="username"
                  className="input input-bordered w-full text-lg"
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
              </label>
              <label className="form-control gap-2">
                <span className="font-semibold">{translate('password')}</span>
                <input
                  autoComplete="current-password"
                  className="input input-bordered w-full text-lg"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              {errorMessage && (
                <p className="alert alert-error text-base" role="alert">
                  {errorMessage}
                </p>
              )}
              <button
                aria-busy={signIn.isPending}
                className="btn btn-primary mt-2 min-h-14 text-lg"
                disabled={signIn.isPending}
                type="submit"
              >
                {signIn.isPending ? translate('signingIn') : translate('signIn')}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
