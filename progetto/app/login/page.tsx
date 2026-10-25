'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../lib/supabase-browser'

const AUTH_TIMEOUT_MS = 20000

function LoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nextParam = searchParams.get('next') || '/dashboard'
  const callbackError = searchParams.get('error')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      // Create the client inside try so a missing/invalid public env value is shown
      // to the user instead of leaving the submit button stuck in "Accesso…".
      const supabase = createClient()
      const timedOut = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(
            'La richiesta di accesso non ha ricevuto risposta entro 20 secondi. ' +
            'Verifica la connessione e le variabili NEXT_PUBLIC_SUPABASE_URL e ' +
            'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, poi ricompila il progetto.'
          ))
        }, AUTH_TIMEOUT_MS)
      })
      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        timedOut,
      ])
      if (result.error) {
        setError(result.error.message)
        return
      }

      const next = nextParam.startsWith('/') && !nextParam.startsWith('//')
        ? nextParam
        : '/dashboard'
      window.location.assign(next)
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : 'Accesso non riuscito per un errore imprevisto. Controlla la configurazione Supabase e riprova.')
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  const visibleError = error || callbackError

  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-logo"><img src="/logo-optimized.webp" alt="MangaBEART" /></div><div className="auth-wordmark">MangaBEART</div><h1>「いらっしゃいませ」</h1><p className="muted">Accedi alla tua area personale.</p>
    <form onSubmit={submit} className="form">
      <label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" /></label>
      <label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" /></label>
      {visibleError && <div className="error" role="alert">{visibleError}</div>}
      <button type="submit" disabled={loading}>{loading ? 'Accesso…' : 'Accedi'}</button>
    </form>
    <div className="auth-links"><a href="/register">Registrati</a><a href="/recupera-password">Recupera password</a></div>
  </section></main>
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-shell"><section className="auth-card"><p className="muted">Caricamento…</p></section></main>}>
      <LoginForm />
    </Suspense>
  )
}
