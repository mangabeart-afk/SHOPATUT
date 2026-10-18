'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import SignOutButton from '../app/dashboard/sign-out'
import { createClient } from '../lib/supabase-browser'
import AdminCacheSync from './admin-cache-sync'

type NavigationProps = {
  role: 'AMMINISTRATORE' | 'CLIENTE'
  active: string
  displayName?: string | null
  email?: string | null
}

const adminMenu = [
  ['Dashboard', '/admin'],
  ['Utenti', '/admin/clienti'],
  ['Inserisci articolo', '/admin/articoli/nuovo'],
  ['Archivio articoli', '/admin/articoli/archivio'],
  ['Pagamenti', '/admin/pagamenti'],
  ['Crediti', '/admin/crediti'],
  ['Spedizioni', '/admin/spedizioni'],
  ['Movimenti', '/admin/movimenti'],
  ['Analisi', '/admin/analisi'],
]

const clientMenu = [
  ['Dashboard', '/dashboard'],
  ['Articoli', '/articoli'],
  ['Pagamenti', '/pagamenti'],
  ['Crediti', '/crediti'],
  ['Spedizioni', '/spedizioni'],
  ['Movimenti', '/movimenti'],
  ['I MIEI DETTAGLI', '/dettagli'],
]

const clientMoreMenu = [
  ['Crediti', '/crediti'],
  ['Spedizioni', '/spedizioni'],
  ['Movimenti', '/movimenti'],
  ['I MIEI DETTAGLI', '/dettagli'],
]

const adminMobileGroups: { title: string; description: string; items: [string, string][] }[] = [
  {
    title: 'Archivio',
    description: 'Utenti, articoli e inserimento',
    items: [
      ['Utenti', '/admin/clienti'],
      ['Articoli', '/admin/articoli/archivio'],
      ['Inserisci articolo', '/admin/articoli/nuovo'],
    ],
  },
  {
    title: 'Movimenti',
    description: 'Pagamenti, crediti e spedizioni',
    items: [
      ['Pagamenti', '/admin/pagamenti'],
      ['Crediti', '/admin/crediti'],
      ['Spedizioni', '/admin/spedizioni'],
      ['Movimenti', '/admin/movimenti'],
    ],
  },
  {
    title: 'Analisi',
    description: 'Statistiche e sessione',
    items: [
      ['Analisi', '/admin/analisi'],
    ],
  },
]

export default function Navigation({ role, active, displayName, email }: NavigationProps) {
  const menu = role === 'AMMINISTRATORE' ? adminMenu : clientMenu
  const [open, setOpen] = useState(false)
  const [userLabel, setUserLabel] = useState(
    role === 'AMMINISTRATORE' ? 'MangaBEART' : 'Utente'
  )

  useEffect(() => {
    setOpen(false)
  }, [active])

  useEffect(() => {
    if (role === 'AMMINISTRATORE') {
      setUserLabel('MangaBEART')
      return
    }

    let cancelled = false
    const loadClientLabel = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return

      // Un'unica query relazionale sostituisce due richieste sequenziali
      // (profilo + utente) a ogni apertura dell'area utente.
      const { data: profile } = await supabase
        .from('profiles')
        .select('customer_id,mailbox_id,display_name,customers(first_name,last_name,customer_code)')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!profile) return

      const relatedCustomer = Array.isArray((profile as any).customers)
        ? (profile as any).customers[0]
        : (profile as any).customers
      const firstName = relatedCustomer?.first_name?.trim() || ''
      const lastName = relatedCustomer?.last_name?.trim() || ''
      const customerCode = relatedCustomer?.customer_code?.trim() || ''
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
      const label = fullName
        ? `${fullName}${customerCode ? ` [${customerCode}]` : ''}`
        : (customerCode || 'Utente')

      if (!cancelled) setUserLabel(label)
    }

    void loadClientLabel()
    return () => { cancelled = true }
  }, [role, displayName])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('mobile-menu-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('mobile-menu-open')
    }
  }, [open])

  const links = menu.map(([label, href]) => (
    <Link
      key={href}
      href={href}
      prefetch={false}
      className={active === href ? 'active' : ''}
      onClick={() => setOpen(false)}
    >
      {label}
    </Link>
  ))

  return (
    <>
      {role === 'AMMINISTRATORE' && <AdminCacheSync />}
      {role === 'AMMINISTRATORE' && (
        <nav className="admin-bottom-nav" aria-label="Navigazione amministratore">
          <Link href="/admin" prefetch={false} className={active === '/admin' ? 'active' : ''} aria-current={active === '/admin' ? 'page' : undefined}>
            <span className="admin-bottom-nav-icon" aria-hidden="true">⌂</span>
            <span>Dashboard</span>
          </Link>
          <button type="button" className={open ? 'active' : ''} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="admin-mobile-menu-panel">
            <span className="admin-bottom-nav-icon admin-menu-glyph" aria-hidden="true"><i /><i /><i /></span>
            <span>Menu</span>
          </button>
        </nav>
      )}

      {role === 'CLIENTE' && (
        <nav className="client-bottom-nav" aria-label="Navigazione principale utente">
          <Link href="/dashboard" prefetch={false} className={active === '/dashboard' ? 'active' : ''} aria-current={active === '/dashboard' ? 'page' : undefined}>
            <span className="client-bottom-nav-icon" aria-hidden="true">⌂</span><span>Home</span>
          </Link>
          <Link href="/articoli" prefetch={false} className={active === '/articoli' ? 'active' : ''} aria-current={active === '/articoli' ? 'page' : undefined}>
            <span className="client-bottom-nav-icon" aria-hidden="true">▦</span><span>Articoli</span>
          </Link>
          <Link href="/pagamenti" prefetch={false} className={active === '/pagamenti' ? 'active' : ''} aria-current={active === '/pagamenti' ? 'page' : undefined}>
            <span className="client-bottom-nav-icon" aria-hidden="true">€</span><span>Pagamenti</span>
          </Link>
          <button type="button" className={['/crediti', '/spedizioni', '/movimenti', '/dettagli'].includes(active) || open ? 'active' : ''} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="client-more-dropdown">
            <span className="client-bottom-nav-icon client-bottom-nav-more" aria-hidden="true">•••</span><span>Altro</span>
          </button>
        </nav>
      )}

      {role === 'CLIENTE' && open && (
        <div className="client-more-backdrop" onClick={() => setOpen(false)}>
          <nav id="client-more-dropdown" className="client-more-dropdown" aria-label="Altre aree utente" onClick={(event) => event.stopPropagation()}>
            <div className="client-more-title">Altre aree utente</div>
            {clientMoreMenu.map(([label, href]) => (
              <Link key={href} href={href} prefetch={false} className={active === href ? 'active' : ''} onClick={() => setOpen(false)}>
                {label}<span aria-hidden="true">›</span>
              </Link>
            ))}
            <div className="client-more-divider" />
            <div className="client-more-signout" onClick={(event) => event.stopPropagation()}>
              <SignOutButton />
            </div>
          </nav>
        </div>
      )}

      <aside className="sidebar">
        <div className="brand">
          <img src="/logo-optimized.webp" alt="MangaBEART" width="512" height="512" />
          <span className="brand-wordmark">MangaBEART</span>
        </div>
        <nav>{links}</nav>
        <div className="side-note">V1 • {role === 'CLIENTE' ? 'UTENTE' : role}<br />{userLabel}</div>
        <SignOutButton />
      </aside>

      {role === 'AMMINISTRATORE' && open && typeof document !== 'undefined' && createPortal(
        <div
          className="mobile-menu-overlay admin-menu-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <aside
            id="admin-mobile-menu-panel"
            className="mobile-menu-panel admin-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu amministratore"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-menu-header admin-mobile-menu-header">
              <div className="admin-menu-heading">
                <strong>Menu</strong>
                <span>Area amministratore · {userLabel}</span>
              </div>
              <button type="button" className="mobile-menu-close" onClick={() => setOpen(false)} aria-label="Chiudi menu">×</button>
            </div>
            <nav className="admin-mobile-menu-groups" aria-label="Tutte le aree amministrative">
              {adminMobileGroups.map((group) => (
                <section className="admin-mobile-menu-group" key={group.title}>
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                  <div className="admin-mobile-menu-items">
                    {group.items.map(([label, href]) => (
                      <Link key={href} href={href} prefetch={false} className={active === href ? 'active' : ''} onClick={() => setOpen(false)}>
                        <span>{label}</span><span aria-hidden="true">›</span>
                      </Link>
                    ))}
                    {group.title === 'Analisi' && (
                      <div className="admin-mobile-menu-signout" onClick={(event) => event.stopPropagation()}>
                        <SignOutButton label="Log-out" />
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </nav>
          </aside>
        </div>,
        document.body
      )}
    </>
  )
}
