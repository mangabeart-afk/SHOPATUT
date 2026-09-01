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
  ['Caselle', '/admin/caselle'],
  ['Articoli', '/admin/articoli'],
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

export default function Navigation({
  role,
  active,
  displayName,
  email,
}: NavigationProps) {
  const menu = role === 'AMMINISTRATORE' ? adminMenu : clientMenu

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo.png" alt="MangaBEART [ShopaTüT]" />
      </div>

      <nav>
        {menu.map(([label, href]) => (
          <a key={href} href={href} className={active === href ? 'active' : ''}>
            {label}
          </a>
        ))}
      </nav>

      <div className="side-note">
        V1 • {role}
        <br />
        {displayName || email || 'Utente'}
      </div>

      {role === 'CLIENTE' && <SignOutButton />}
    </aside>
  )
}
