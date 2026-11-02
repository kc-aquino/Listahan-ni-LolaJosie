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
    <main className="app-background grid min-h-screen place-items-center px-4 py-8">
      <section
        aria-labelledby="login-title"
        className="card w-full max-w-lg border-2 border-base-300 bg-base-100 shadow-xl"
      >
        <div className="card-body gap-5 p-6 sm:p-9">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="brand-mark badge size-12 text-xl text-white">
              L
            </span>
            <p className="text-xl font-bold">
              Lista <span className="text-primary">ni Lola</span>
            </p>
            <div aria-label={translate('language')} className="language-switch join ml-auto" role="group">
              {([
                { code: 'en', label: 'English' },
                { code: 'tl', label: 'Tagalog' },
              ] as { code: Language; label: string }[]).map(({ code, label }) => (
                <button
                  aria-label={label}
                  aria-pressed={language === code}
                  className={`btn join-item ${language === code ? 'btn-primary' : ''}`}
                  key={code}
                  onClick={() => setLanguage(code)}
                  type="button"
                >
                  <span className="hidden sm:inline">{label}</span>
                  <span aria-hidden="true" className="sm:hidden">{code.toUpperCase()}</span>
                </button>
              ))}
            </div>
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
    </main>
  )
}
