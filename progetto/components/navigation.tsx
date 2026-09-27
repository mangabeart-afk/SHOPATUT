'use client'

import { useEffect, useState } from 'react'
import SignOutButton from '../app/dashboard/sign-out'

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
  ['Casella', '/caselle'],
  ['Articoli', '/articoli'],
  ['Pagamenti', '/pagamenti'],
  ['Crediti', '/crediti'],
  ['Spedizioni', '/spedizioni'],
  ['Movimenti', '/movimenti'],
]

export default function Navigation({ role, active, displayName, email }: NavigationProps) {
  const menu = role === 'AMMINISTRATORE' ? adminMenu : clientMenu
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [active])

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
    <a
      key={href}
      href={href}
      className={active === href ? 'active' : ''}
      onClick={() => setOpen(false)}
    >
      {label}
    </a>
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
          <img src="/logo.png" alt="MangaBEART [ShopaTüT]" />
        </div>
        <nav>{links}</nav>
        <div className="side-note">V1 • {role}<br />{displayName || email || 'Utente'}</div>
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
                <img src="/logo.png" alt="MangaBEART [ShopaTüT]" />
                <span>{role === 'AMMINISTRATORE' ? 'Area amministratore' : 'Area cliente'}</span>
              </div>
              <button type="button" className="mobile-menu-close" onClick={() => setOpen(false)} aria-label="Chiudi menu">×</button>
            </div>
            <nav className="mobile-menu-links">{links}</nav>
            <div className="mobile-menu-user">
              <span>{displayName || email || 'Utente'}</span>
              <small>{role}</small>
            </div>
            <SignOutButton />
          </aside>
        </div>
      )}
    </>
  )
}
