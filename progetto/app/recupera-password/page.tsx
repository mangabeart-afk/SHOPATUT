'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '../../lib/supabase-browser'

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError(''); setMessage('')
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/recupera-password/reset` })
    if (error) setError(error.message)
    else setMessage('Se l’email è associata a un account, riceverai il link per reimpostare la password.')
    setLoading(false)
  }
  return <main className="auth-shell"><section className="auth-card"><div className="auth-logo"><img src="/logo.png" alt="MangaBEART [ShopaTüT]" /></div><h1>Recupera password</h1><p className="muted">Inserisci la tua email per ricevere il link di recupero.</p><form onSubmit={submit} className="form"><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" /></label>{error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}<button disabled={loading}>{loading?'Invio…':'Invia link di recupero'}</button></form><div className="auth-links"><a href="/login">← Torna al login</a></div></section></main>
}
