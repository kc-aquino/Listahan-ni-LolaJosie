import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { login as loginRequest } from '../lib/api'
import type { AuthUser } from '../lib/api'

type AuthContextValue = {
  user: AuthUser | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredUser(): AuthUser | null {
  const token = window.localStorage.getItem('lista-ni-lola-token') ?? window.sessionStorage.getItem('lista-ni-lola-token')
  const storedUser = window.localStorage.getItem('lista-ni-lola-user') ?? window.sessionStorage.getItem('lista-ni-lola-user')
  if (!token || !storedUser) return null

  try {
    const user: unknown = JSON.parse(storedUser)
    if (
      user !== null &&
      typeof user === 'object' &&
      'id' in user &&
      'name' in user &&
      'username' in user &&
      'role' in user &&
      typeof user.id === 'string' &&
      typeof user.name === 'string' &&
      typeof user.username === 'string' &&
      (user.role === 'OWNER' || user.role === 'EMPLOYEE')
    ) {
      return user as AuthUser
    }
  } catch {
    window.localStorage.removeItem('lista-ni-lola-token')
    window.localStorage.removeItem('lista-ni-lola-user')
    window.sessionStorage.removeItem('lista-ni-lola-token')
    window.sessionStorage.removeItem('lista-ni-lola-user')
  }

  return null
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(readStoredUser)

  useEffect(() => {
    if (user && !localStorage.getItem('lista-ni-lola-token')) {
      const token = sessionStorage.getItem('lista-ni-lola-token')
      if (token) { localStorage.setItem('lista-ni-lola-token', token); localStorage.setItem('lista-ni-lola-user', JSON.stringify(user)) }
    }
  }, [user])

  useEffect(() => {
    const handleUnauthorized = () => {
      window.localStorage.removeItem('lista-ni-lola-token')
      window.localStorage.removeItem('lista-ni-lola-user')
      window.sessionStorage.removeItem('lista-ni-lola-token')
      window.sessionStorage.removeItem('lista-ni-lola-user')
      queryClient.clear()
      setUser(null)
    }

    const changed = (event: StorageEvent) => {
      if (event.key === 'lista-ni-lola-user' || event.key === 'lista-ni-lola-token') {
        sessionStorage.removeItem('lista-ni-lola-token'); sessionStorage.removeItem('lista-ni-lola-user')
        queryClient.clear(); setUser(readStoredUser())
      }
    }
    window.addEventListener('storage', changed)
    window.addEventListener('lista-ni-lola:unauthorized', handleUnauthorized)
    return () => { window.removeEventListener('storage', changed); window.removeEventListener('lista-ni-lola:unauthorized', handleUnauthorized) }
  }, [queryClient])

  async function authenticate(username: string, password: string) {
    const session = await loginRequest(username, password)
    queryClient.clear()
    window.localStorage.setItem('lista-ni-lola-token', session.accessToken)
    window.localStorage.setItem('lista-ni-lola-user', JSON.stringify(session.user))
    window.sessionStorage.setItem('lista-ni-lola-token', session.accessToken)
    window.sessionStorage.setItem('lista-ni-lola-user', JSON.stringify(session.user))
    setUser(session.user)
  }

  function logout() {
    window.localStorage.removeItem('lista-ni-lola-token')
    window.localStorage.removeItem('lista-ni-lola-user')
    queryClient.clear()
    window.sessionStorage.removeItem('lista-ni-lola-token')
    window.sessionStorage.removeItem('lista-ni-lola-user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login: authenticate, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
