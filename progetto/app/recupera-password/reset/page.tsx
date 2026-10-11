'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '../../../lib/supabase-recovery'

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

    const handleRecovery = async () => {
      const { data, error: sessionError } = await client.auth.getSession()
      if (!active) return
      if (sessionError) {
        setError('Il link per reimpostare la password non è valido o è scaduto. Richiedi un nuovo link.')
        return
      }
      if (data.session) {
        setReady(true)
        setError('')
      }
    }

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true)
        setError('')
        window.history.replaceState({}, '', window.location.pathname)
      }
    })

    handleRecovery()

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
    if (!ready) { setError('Il link di recupero non è ancora pronto. Richiedi un nuovo link e riprova.'); return }

    setLoading(true)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) setError(error.message)
    else setMessage('Password aggiornata correttamente. Ora puoi accedere.')
    setLoading(false)
  }

  return <main className="auth-shell"><section className="auth-card"><div className="auth-logo"><img src="/logo.png" alt="MangaBEART [ShopaTüT]" /></div><h1>Nuova password</h1>{!ready && !error && <p className="muted">Verifica del link in corso…</p>}<form onSubmit={submit} className="form"><label>Nuova password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" /></label><label>Conferma password<input type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" /></label>{error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}<button disabled={loading || !ready}>{loading?'Salvataggio…':'Salva nuova password'}</button></form><div className="auth-links"><a href="/login">Torna al login</a></div></section></main>
}
