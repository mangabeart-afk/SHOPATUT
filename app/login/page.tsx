'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../lib/supabase-browser'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const next = searchParams.get('next') || '/dashboard'

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.assign(next)
  }

  return <main className="auth-shell"><section className="auth-card">
    <p className="eyebrow">MANGABeART [ShopÄWAY]</p><h1>Accedi</h1><p className="muted">Accedi alla tua area personale.</p>
    <form onSubmit={submit} className="form">
      <label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" /></label>
      <label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" /></label>
      {error && <div className="error">{error}</div>}
      <button disabled={loading}>{loading ? 'Accesso…' : 'Accedi'}</button>
    </form>
  </section></main>
}
