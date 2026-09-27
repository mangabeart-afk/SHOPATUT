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
    async function prepareSession() {
      const client = createClient()
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')

      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code)
        if (error) {
          if (active) setError('Il link per reimpostare la password non è valido o è scaduto. Richiedi un nuovo link.')
          return
        }
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
      }

      const { data: { session } } = await client.auth.getSession()
      if (!session) {
        if (active) setError('Sessione di recupero non disponibile. Richiedi un nuovo link per reimpostare la password.')
        return
      }
      if (active) setReady(true)
    }
    prepareSession()
    return () => { active = false }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (password.length < 8) { setError('La password deve contenere almeno 8 caratteri.'); return }
    if (password !== confirm) { setError('Le password non coincidono.'); return }
    if (!ready) { setError('Il link di recupero non è ancora pronto. Attendi qualche secondo e riprova.'); return }
    setLoading(true)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) setError(error.message)
    else setMessage('Password aggiornata correttamente. Ora puoi accedere.')
    setLoading(false)
  }
  return <main className="auth-shell"><section className="auth-card"><div className="auth-logo"><img src="/logo.png" alt="MangaBEART [ShopaTüT]" /></div><h1>Nuova password</h1>{!ready && !error && <p className="muted">Verifica del link in corso…</p>}<form onSubmit={submit} className="form"><label>Nuova password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} /></label><label>Conferma password<input type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} /></label>{error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}<button disabled={loading}>{loading?'Salvataggio…':'Salva nuova password'}</button></form><div className="auth-links"><a href="/login">Torna al login</a></div></section></main>
}
