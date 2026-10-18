'use client'

import { useEffect, useState } from 'react'
import PageLoading from './page-loading'
import { createClient } from '../lib/supabase-browser'
import { AdminDashboardSnapshot, readAdminCache } from '../lib/admin-cache-client'

type SnapshotRow = { payload: AdminDashboardSnapshot; updatedAt: string }

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)

export default function AdminLoadingScreen() {
  const [snapshot, setSnapshot] = useState<SnapshotRow | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadSnapshot = async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id
        if (!userId) return
        // Il riepilogo locale viene mostrato solo dopo aver verificato il ruolo corrente.
        const { data: profile, error } = await supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle()
        if (error || profile?.role !== 'AMMINISTRATORE') return
        const cached = await readAdminCache<AdminDashboardSnapshot>(userId, 'dashboard')
        if (!cancelled && cached?.payload) setSnapshot({ payload: cached.payload, updatedAt: cached.updatedAt })
      } catch {
        // In assenza di cache o browser supportato viene mantenuto il caricamento standard.
      } finally {
        if (!cancelled) setChecked(true)
      }
    }
    void loadSnapshot()
    return () => { cancelled = true }
  }, [])

  if (!checked || !snapshot) return <PageLoading variant="dashboard" />

  const saved = new Date(snapshot.updatedAt)
  const savedLabel = Number.isFinite(saved.getTime())
    ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(saved)
    : ''

  return (
    <main className="shell loading-shell admin-cached-loading" aria-busy="true" aria-live="polite">
      <aside className="sidebar loading-sidebar" aria-hidden="true">
        <div className="loading-brand skeleton-block" />
        <div className="loading-nav-lines">{Array.from({ length: 6 }, (_, index) => <span className="skeleton-block" key={index} />)}</div>
        <span className="loading-user skeleton-block" />
      </aside>
      <section className="content loading-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AMMINISTRAZIONE</p>
            <h1>Dashboard amministratore</h1>
            <p className="admin-cache-preview-label">Riepilogo locale · aggiornamento dal database in corso{savedLabel ? ` · salvato ${savedLabel}` : ''}</p>
          </div>
          <span className="admin-cache-preview-pill"><span className="admin-cache-status-dot" />Dati locali</span>
        </header>
        <section className="panel admin-overview-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">PANORAMICA</p><h2>Ultimo riepilogo disponibile</h2></div></div>
          <div className="grid admin-summary-grid admin-admin-kpi-grid">
            <div className="card"><div className="admin-summary-label">QT ACQUISTATA</div><strong>{snapshot.payload.purchased}</strong></div>
            <div className="card"><div className="admin-summary-label">VALORE ACQUISTI</div><strong>{money(snapshot.payload.purchaseValue)}</strong></div>
            <div className="card"><div className="admin-summary-label">ARTICOLI IN ARRIVO</div><strong>{snapshot.payload.incomingUnits}</strong></div>
            <div className="card"><div className="admin-summary-label">QT VENDUTA</div><strong>{snapshot.payload.sold}</strong></div>
            <div className="card"><div className="admin-summary-label">VALORE VENDITE</div><strong>{money(snapshot.payload.revenue)}</strong></div>
            <div className="card"><div className="admin-summary-label">MARGINE LORDO</div><strong>{money(snapshot.payload.margin)}</strong></div>
          </div>
        </section>
        <section className="panel loading-panel"><span className="loading-heading skeleton-block" /><span className="loading-row skeleton-block" /><span className="loading-row skeleton-block" /><span className="loading-row skeleton-block" /><p className="loading-message">Sto verificando gli ultimi movimenti e saldi…</p></section>
      </section>
    </main>
  )
}
