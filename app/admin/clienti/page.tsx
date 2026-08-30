import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'

type ClientiPageProps = {
  searchParams: Promise<{
    search?: string
  }>
}

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function ClientiAdminPage({
  searchParams,
}: ClientiPageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') {
    redirect('/dashboard')
  }

  const params = await searchParams
  const search = params.search?.trim() || ''

  let query = supabase
    .from('customers')
    .select(
      `
        id,
        first_name,
        last_name,
        email,
        phone,
        notes,
        created_at,
        mailboxes (
          id,
          mailbox_code,
          status
        )
      `
    )
    .order('last_name', {
      ascending: true,
    })

  if (search) {
    const safeSearch = search.replace(
      /[%_]/g,
      '\\$&'
    )

    query = query.or(
      `first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`
    )
  }

  const { data: customers, error } = await query

  if (error) {
    return (
      <main className="shell">
        <aside className="sidebar">
          <div className="brand">
            MangaBEART <span>[ShopaTüT]</span>
          </div>

          <nav>
            <a href="/admin">
              Dashboard
            </a>

            <a
              href="/admin/clienti"
              className="active"
            >
              Clienti
            </a>

            <a href="/admin/caselle">
              Caselle
            </a>

            <a href="/admin/articoli">
              Articoli
            </a>

            <a href="/admin/pagamenti">
              Pagamenti
            </a>

            <a href="/admin/crediti">
              Crediti
            </a>

            <a href="/admin/spedizioni">
              Spedizioni
            </a>

            <a href="/admin/movimenti">
              Movimenti
            </a>
          </nav>

          <div className="side-note">
            V1 • AMMINISTRATORE
            <br />
            {profile?.display_name ||
              user.email}
          </div>
        </aside>

        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">
                AMMINISTRAZIONE
              </p>

              <h1>Clienti</h1>
            </div>

            <a
              href="/admin"
              className="back-button"
            >
              ← Dashboard
            </a>
          </header>

          <section className="panel">
            <h2>Clienti</h2>

            <div className="empty">
              Impossibile caricare i clienti.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const rows = customers || []

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          MangaBEART <span>[ShopaTüT]</span>
        </div>

        <nav>
          <a href="/admin">
            Dashboard
          </a>

          <a
            href="/admin/clienti"
            className="active"
          >
            Clienti
          </a>

          <a href="/admin/caselle">
            Caselle
          </a>

          <a href="/admin/articoli">
            Articoli
          </a>

          <a href="/admin/pagamenti">
            Pagamenti
          </a>

          <a href="/admin/crediti">
            Crediti
          </a>

          <a href="/admin/spedizioni">
            Spedizioni
          </a>

          <a href="/admin/movimenti">
            Movimenti
          </a>
        </nav>

        <div className="side-note">
          V1 • AMMINISTRATORE
          <br />
          {profile?.display_name ||
            user.email}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>Clienti</h1>
          </div>

          <a
            href="/admin"
            className="back-button"
          >
            ← Dashboard
          </a>
        </header>

        <section className="panel">
          <h2>Ricerca clienti</h2>

          <form
            action="/admin/clienti"
            method="get"
            className="form"
          >
            <label>
              Cerca cliente

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Nome, cognome, email, telefono..."
              />
            </label>

            <button type="submit">
              Cerca
            </button>

            {search && (
              <a
                href="/admin/clienti"
                className="back-button"
              >
                Azzera ricerca
              </a>
            )}
          </form>
        </section>

        <section className="panel">
          <h2>
            {search
              ? `Risultati per "${search}"`
              : 'Elenco clienti'}
          </h2>

          {rows.length === 0 ? (
            <div className="empty">
              {search
                ? 'Nessun cliente trovato.'
                : 'Nessun cliente registrato.'}
            </div>
          ) : (
            <div className="movement-list">
              {rows.map((customer) => {
                const mailboxes =
                  Array.isArray(
                    customer.mailboxes
                  )
                    ? customer.mailboxes
                    : customer.mailboxes
                      ? [customer.mailboxes]
                      : []

                return (
                  <div
                    className="movement"
                    key={customer.id}
                  >
                    <div>
                      <b>
                        {customer.first_name}{' '}
                        {customer.last_name}
                      </b>

                      {customer.email && (
                        <span>
                          Email:{' '}
                          {customer.email}
                        </span>
                      )}

                      {customer.phone && (
                        <span>
                          Telefono:{' '}
                          {customer.phone}
                        </span>
                      )}

                      <span>
                        Cliente dal:{' '}
                        {formatDate(
                          customer.created_at
                        )}
                      </span>

                      {customer.notes && (
                        <span>
                          Note:{' '}
                          {customer.notes}
                        </span>
                      )}
                    </div>

                    <div>
                      <span>
                        Caselle:{' '}
                        {mailboxes.length}
                      </span>

                      {mailboxes.length > 0 &&
                        mailboxes.map(
                          (mailbox) => (
                            <span
                              key={mailbox.id}
                            >
                              {mailbox.mailbox_code}{' '}
                              —{' '}
                              {mailbox.status}
                            </span>
                          )
                        )}

                      <a
                        href={`/admin/clienti/${customer.id}`}
                        className="back-button"
                      >
                        Dettaglio →
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
