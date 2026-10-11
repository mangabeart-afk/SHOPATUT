'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SignOutButton from '../app/dashboard/sign-out'
import { createClient } from '../lib/supabase-browser'

type NavigationProps = {
  role: 'AMMINISTRATORE' | 'CLIENTE'
  active: string
  displayName?: string | null
  email?: string | null
}

const adminMenu = [
  ['Dashboard', '/admin'],
  ['Clienti', '/admin/clienti'],
  ['Nuovo articolo', '/admin/articoli/nuovo'],
  ['Archivio articoli', '/admin/articoli/archivio'],
  ['Pagamenti', '/admin/pagamenti'],
  ['Crediti', '/admin/crediti'],
  ['Spedizioni', '/admin/spedizioni'],
  ['Movimenti', '/admin/movimenti'],
]

const clientMenu = [
  ['Dashboard', '/dashboard'],
  ['Articoli', '/articoli'],
  ['Pagamenti', '/pagamenti'],
  ['Crediti', '/crediti'],
  ['Spedizioni', '/spedizioni'],
  ['Movimenti', '/movimenti'],
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Un'unica query relazionale sostituisce due richieste sequenziali
      // (profilo + cliente) a ogni apertura dell'area cliente.
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
      <button
        type="button"
        className="mobile-menu-button"
        aria-label="Apri menu"
        aria-expanded={open}
        aria-controls="mobile-navigation-panel"
        onClick={() => setOpen(true)}
      >
        <span className="mobile-menu-icon" aria-hidden="true"><i /><i /><i /></span>
        <span>Menu</span>
      </button>

      <aside className="sidebar">
        <div className="brand">
          <img src="/logo-optimized.webp" alt="MangaBEART [ShopaTüT]" width="512" height="512" />
        </div>
        <nav>{links}</nav>
        <div className="side-note">V1 • {role}<br />{userLabel}</div>
        <SignOutButton />
      </aside>

      {open && (
        <div className="mobile-menu-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <aside
            id="mobile-navigation-panel"
            className="mobile-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu di navigazione"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mobile-menu-header">
              <div className="mobile-menu-brand">
                <img src="/logo-optimized.webp" alt="MangaBEART [ShopaTüT]" width="512" height="512" />
                <span>{role === 'AMMINISTRATORE' ? 'Area amministratore' : 'Area cliente'}</span>
              </div>
              <button type="button" className="mobile-menu-close" onClick={() => setOpen(false)} aria-label="Chiudi menu">×</button>
            </div>
            <nav className="mobile-menu-links">{links}</nav>
            <div className="mobile-menu-user">
              <span>{userLabel}</span>
              <small>{role}</small>
            </div>
            <SignOutButton />
          </aside>
        </div>
      )}
    </>
  )
}
