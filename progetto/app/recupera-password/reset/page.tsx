'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '../../../lib/supabase-browser'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    const client = createClient()

    async function prepareSession() {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const tokenHash = url.searchParams.get('token_hash')
      const type = url.searchParams.get('type')
      let sessionReady = false

      // PKCE: Supabase sends ?code=... and the browser exchanges it for a session.
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code)
        if (!exchangeError) sessionReady = true
        else if (active) {
          setError('Il link per reimpostare la password non è valido o è scaduto. Richiedi un nuovo link.')
          return
        }
      }

      // Compatibility with recovery links that contain a token hash.
      if (!sessionReady && tokenHash) {
        const { error: verifyError } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: type === 'recovery' ? 'recovery' : 'email',
        })
        if (!verifyError) sessionReady = true
        else if (active) {
          setError('Il link per reimpostare la password non è valido o è scaduto. Richiedi un nuovo link.')
          return
        }
      }

      // Compatibility with implicit recovery links containing tokens in the URL hash.
      if (!sessionReady && window.location.hash) {
        const hash = new URLSearchParams(window.location.hash.slice(1))
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        const hashType = hash.get('type')

        if (accessToken && refreshToken) {
          const { error: sessionError } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (!sessionError) sessionReady = true
          else if (active) {
            setError('Il link per reimpostare la password non è valido o è scaduto. Richiedi un nuovo link.')
            return
          }
          if (hashType === 'recovery') sessionReady = true
        }
      }

      // Supabase may complete the recovery session asynchronously.
      if (!sessionReady) {
        const { data: { session } } = await client.auth.getSession()
        if (session) sessionReady = true
      }

      if (!sessionReady) {
        if (active) setError('Sessione di recupero non disponibile. Richiedi un nuovo link per reimpostare la password.')
        return
      }

      if (!active) return
      setReady(true)

      // Remove one-time credentials from the address bar after the session is established.
      window.history.replaceState({}, '', url.pathname)
    }

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true)
        setError('')
      }
    })

    prepareSession()

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (password.length < 8) { setError('La password deve contenere almeno 8 caratteri.'); return }
    if (password !== confirm) { setError('Le password non coincidono.'); return }
    if (!ready) { setError('Il link di recupero non è ancora pronto. Attendi qualche secondo e riprova.'); return }

    setLoading(true)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) setError(error.message)
    else setMessage('Password aggiornata correttamente. Ora puoi accedere.')
    setLoading(false)
  }

  return <main className="auth-shell"><section className="auth-card"><div className="auth-logo"><img src="/logo.png" alt="MangaBEART [ShopaTüT]" /></div><h1>Nuova password</h1>{!ready && !error && <p className="muted">Verifica del link in corso…</p>}<form onSubmit={submit} className="form"><label>Nuova password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" /></label><label>Conferma password<input type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" /></label>{error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}<button disabled={loading || !ready}>{loading?'Salvataggio…':'Salva nuova password'}</button></form><div className="auth-links"><a href="/login">Torna al login</a></div></section></main>
}
