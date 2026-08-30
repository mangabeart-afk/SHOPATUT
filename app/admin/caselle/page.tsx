import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'

type CasellePageProps = {
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

export default async function CaselleAdminPage({
  searchParams,
}: CasellePageProps) {
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

  /*
   * CLIENTI
   */

  const { data: customers } = await supabase
    .from('customers')
    .select(
      `
        id,
        first_name,
        last_name,
        email
      `
    )

  const customerMap = new Map(
    (customers || []).map((customer) => [
      customer.id,
      customer,
    ])
  )

  /*
   * CASELLE
   */

  const { data: mailboxes, error } =
    await supabase
      .from('mailboxes')
      .select(
        `
          id,
          mailbox_code,
          customer_id,
          status,
          opened_at,
          notes,
          created_at
        `
      )
      .order('mailbox_code', {
        ascending: true,
      })

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

            <a href="/admin/clienti">
              Clienti
            </a>

            <a
              href="/admin/caselle"
              className="active"
            >
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

              <h1>Caselle</h1>
            </div>

            <a
              href="/admin"
              className="back-button"
            >
              ← Dashboard
            </a>
          </header>

          <section className="panel">
            <h2>Caselle</h2>

            <div className="empty">
              Impossibile caricare le caselle.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const rows = mailboxes || []

  /*
   * RICERCA
   */

  const filteredRows = search
    ? rows.filter((mailbox) => {
        const customer =
          customerMap.get(
            mailbox.customer_id
          )

        const text = [
          mailbox.mailbox_code,
          mailbox.status,
          customer?.first_name,
          customer?.last_name,
          customer?.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return text.includes(
          search.toLowerCase()
        )
      })
    : rows

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

          <a href="/admin/clienti">
            Clienti
          </a>

          <a
            href="/admin/caselle"
            className="active"
          >
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

            <h1>Caselle</h1>
          </div>

          <a
            href="/admin"
            className="back-button"
          >
            ← Dashboard
          </a>
        </header>

        {/* RICERCA */}

        <section className="panel">
          <h2>Ricerca caselle</h2>

          <form
            action="/admin/caselle"
            method="get"
            className="form"
          >
            <label>
              Cerca casella o cliente

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Codice, nome, cognome, email, stato..."
              />
            </label>

            <button type="submit">
              Cerca
            </button>

            {search && (
              <a
                href="/admin/caselle"
                className="back-button"
              >
                Azzera ricerca
              </a>
            )}
          </form>
        </section>

        {/* ELENCO */}

        <section className="panel">
          <h2>
            {search
              ? `Risultati per "${search}"`
              : 'Elenco caselle'}
          </h2>

          {filteredRows.length === 0 ? (
            <div className="empty">
              {search
                ? 'Nessuna casella trovata.'
                : 'Nessuna casella registrata.'}
            </div>
          ) : (
            <div className="movement-list">
              {filteredRows.map(
                (mailbox) => {
                  const customer =
                    customerMap.get(
                      mailbox.customer_id
                    )

                  return (
                    <div
                      className="movement"
                      key={mailbox.id}
                    >
                      <div>
                        <b>
                          {
                            mailbox.mailbox_code
                          }
                        </b>

                        <span>
                          Cliente:{' '}
                          {customer
                            ? `${customer.first_name} ${customer.last_name}`
                            : 'Non trovato'}
                        </span>

                        {customer?.email && (
                          <span>
                            Email:{' '}
                            {customer.email}
                          </span>
                        )}

                        <span>
                          Data apertura:{' '}
                          {formatDate(
                            mailbox.opened_at
                          )}
                        </span>

                        {mailbox.notes && (
                          <span>
                            Note:{' '}
                            {mailbox.notes}
                          </span>
                        )}
                      </div>

                      <div>
                        <span>
                          Stato:{' '}
                          <strong>
                            {mailbox.status}
                          </strong>
                        </span>

                        <span>
                          Creata:{' '}
                          {formatDate(
                            mailbox.created_at
                          )}
                        </span>
                      </div>
                    </div>
                  )
                }
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
