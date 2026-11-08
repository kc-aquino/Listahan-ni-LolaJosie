import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthProvider'
import { useLanguage, type Language } from '../app/LanguageProvider'
import { Icon } from '../components/atoms/Icon'
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
  const [showPassword, setShowPassword] = useState(false)
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
    <main
      className="app-background login-page grid min-h-screen place-items-center px-4 py-8"
      data-theme="lola"
    >
      <div className="login-shell">
        <div className="login-language">
          <div
            aria-label={translate('language')}
            className="language-switch join"
            role="group"
          >
            {(
              [
                { code: 'en', label: 'English' },
                { code: 'tl', label: 'Taglish' },
              ] as { code: Language; label: string }[]
            ).map(({ code, label }) => (
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
        <section
          aria-labelledby="login-title"
          className="login-card card bg-base-100"
        >
          <div className="login-card-body card-body">
            <header className="login-heading">
              <img alt="" className="login-logo" src="/img/logo.png" />
              <h1 id="login-title" className="sr-only">
                {translate('signIn')}
              </h1>
              <p>{translate('loginDescription')}</p>
            </header>
            <form
              className="login-form grid gap-4"
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
                <div className="relative">
                  <input
                    autoComplete="current-password"
                    className="input input-bordered w-full pr-14 text-lg"
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                  />
                  <button
                    type="button"
                    className="password-visibility"
                    aria-label={translate(
                      showPassword ? 'hidePassword' : 'showPassword',
                    )}
                    title={translate(
                      showPassword ? 'hidePassword' : 'showPassword',
                    )}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    <Icon
                      name={showPassword ? 'eyeOff' : 'eye'}
                      className="size-5"
                    />
                  </button>
                </div>
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
                {signIn.isPending && (
                  <span className="login-submit-spinner" aria-hidden="true" />
                )}
                {signIn.isPending
                  ? translate('signingIn')
                  : translate('signIn')}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
