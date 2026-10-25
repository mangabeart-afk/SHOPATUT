import type { ReactNode } from 'react'
import Navigation from './navigation'
import ReadOnlyNotice from './read-only-notice'

export default function AdminWorkbookLayout({
  active,
  title,
  description,
  displayName,
  email,
  children,
  showNotice = true,
}: {
  active: string
  title: string
  description?: string
  displayName?: string | null
  email?: string | null
  children: ReactNode
  showNotice?: boolean
}) {
  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active={active} displayName={displayName} email={email} />
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div></header>
        {children}
        {showNotice && <section className="panel"><ReadOnlyNotice /></section>}
      </section>
    </main>
  )
}
