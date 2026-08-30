import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import SignOutButton from './sign-out'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function Dashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'role,display_name,customer_id,mailbox_id'
    )
    .eq('user_id', user.id)
    .maybeSingle()

  const role = profile?.role || 'CLIENTE'
  const customerId = profile?.customer_id
  const mailboxId = profile?.mailbox_id

  /*
   * DATI CLIENTE
   */

  let customer = null

  if (customerId) {
    const { data } = await supabase
      .from('customers')
      .select(
        `
          id,
          customer_code,
          first_name,
          last_name,
          email,
          phone,
          shipping_address,
          shipping_city,
          shipping_postal_code,
          shipping_country,
          created_at
        `
      )
      .eq('id', customerId)
      .maybeSingle()

    customer = data
  }

  /*
   * ASSEGNAZIONI ARTICOLI
   */

  let assignments: {
    article_id: string
    quantity_assigned: number
    status: string
  }[] = []

  if (mailboxId) {
    const { data } = await supabase
      .from('article_assignments')
      .select(
        'article_id,quantity_assigned,status'
      )
      .eq('mailbox_id', mailboxId)
      .eq('status', 'ATTIVA')

    assignments = data || []
  }

  const articleIds = assignments.map(
    (item) => item.article_id
  )

  /*
   * DATI DASHBOARD
   */

  const [
    articlesResult,
    paymentsResult,
    creditsResult,
    movementsResult,
    mailboxResult,
  ] = await Promise.all([
    articleIds.length > 0
      ? supabase
          .from('articles')
          .select(
            `
              id,
              article_code,
              series,
              detail,
              quantity_purchased,
              unit_cost_eur,
              total_cost_eur
            `
          )
          .in('id', articleIds)
      : Promise.resolve({
          data: [],
          error: null,
        }),

    mailboxId
      ? supabase
          .from('payments')
          .select(
            'amount_eur,amount'
          )
          .eq('mailbox_id', mailboxId)
          .limit(1000)
      : Promise.resolve({
          data: [],
          error: null,
        }),

    mailboxId
      ? supabase
          .from('credits')
          .select(
            'amount_eur,used_amount_eur'
          )
          .eq('mailbox_id', mailboxId)
          .limit(1000)
      : Promise.resolve({
          data: [],
          error: null,
        }),

    mailboxId
      ? supabase
          .from('movements')
          .select(
            `
              movement_code,
              movement_type,
              total_amount_eur,
              movement_at,
              description
            `
          )
          .eq('mailbox_id', mailboxId)
          .order('movement_at', {
            ascending: false,
          })
          .limit(5)
      : Promise.resolve({
          data: [],
          error: null,
        }),

    mailboxId
      ? supabase
          .from('mailboxes')
          .select(
            'id,status,mailbox_code'
          )
          .eq('id', mailboxId)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),
  ])

  const rows = articlesResult.data || []

  const purchase = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.total_cost_eur || 0),
    0
  )

  const units = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.quantity_purchased || 0),
    0
  )

  const paid = (
    paymentsResult.data || []
  ).reduce(
    (sum, row) =>
      sum +
      Number(
        row.amount_eur ??
          row.amount ??
          0
      ),
    0
  )

  const credit = (
    creditsResult.data || []
  ).reduce(
    (sum, row) =>
      sum +
      Math.max(
        0,
        Number(
          row.amount_eur || 0
        ) -
          Number(
            row.used_amount_eur || 0
          )
      ),
    0
  )

  const movements =
    movementsResult.data || []

  const mailbox =
    mailboxResult.data

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          MangaBEART <span>[ShopaTüT]</span>
        </div>

        <nav>
          <a
            className="active"
            href="/dashboard"
          >
            Dashboard
          </a>

          <a href="/caselle">
            Caselle
          </a>

          <a href="/articoli">
            Articoli
          </a>

          <a href="/pagamenti">
            Pagamenti
          </a>

          <a href="/crediti">
            Crediti
          </a>

          <a href="/spedizioni">
            Spedizioni
          </a>

          <a href="/movimenti">
            Movimenti
          </a>
        </nav>

        <div className="side-note">
          V1 • {role}
          <br />
          {profile?.display_name ||
            user.email}
        </div>

        <SignOutButton />
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {role === 'AMMINISTRATORE'
                ? 'AMMINISTRAZIONE'
                : 'AREA CLIENTE'}
            </p>

            <h1>Dashboard</h1>
          </div>
        </header>

        {/* DATI CLIENTE */}

        <section className="panel">
          <h2>
            {customer
              ? `${customer.first_name} ${customer.last_name}`
              : 'Dati cliente'}
          </h2>

          {!customer ? (
            <div className="empty">
              Dati cliente non disponibili.
            </div>
          ) : (
            <div className="customer-details">
              <div className="customer-detail-row">
                <span className="muted">
                  Codice cliente
                </span>

                <strong className="customer-value">
                  {customer.customer_code ||
                    '—'}
                </strong>
              </div>

              <div className="customer-detail-row">
                <span className="muted">
                  Nome
                </span>

                <strong className="customer-value">
                  {customer.first_name}{' '}
                  {customer.last_name}
                </strong>
              </div>

              <div className="customer-detail-row">
                <span className="muted">
                  Email
                </span>

                <strong className="customer-value">
                  {customer.email ||
                    user.email ||
                    '—'}
                </strong>
              </div>

              <div className="customer-detail-row">
                <span className="muted">
                  Telefono
                </span>

                <strong className="customer-value">
                  {customer.phone || '—'}
                </strong>
              </div>

              <div className="customer-detail-row">
                <span className="muted">
                  Indirizzo di spedizione
                </span>

                <strong className="customer-value">
                  {customer.shipping_address ||
                    '—'}
                </strong>

                {(customer.shipping_postal_code ||
                  customer.shipping_city) && (
                  <span>
                    {customer.shipping_postal_code ||
                      ''}
                    {customer.shipping_postal_code &&
                    customer.shipping_city
                      ? ' '
                      : ''}
                    {customer.shipping_city ||
                      ''}
                  </span>
                )}

                {customer.shipping_country && (
                  <span>
                    {customer.shipping_country}
                  </span>
                )}
              </div>

              <div className="customer-detail-row">
                <span className="muted">
                  Cliente dal
                </span>

                <strong className="customer-value">
                  {formatDate(
                    customer.created_at
                  )}
                </strong>
              </div>
            </div>
          )}
        </section>

        {/* RICERCA ARTICOLI */}

        <section className="panel">
          <h2>Ricerca articoli</h2>

          <form
            action="/articoli"
            method="get"
            className="form"
          >
            <label>
              Cerca articolo

              <input
                type="search"
                name="search"
                placeholder="Codice, serie, descrizione..."
              />
            </label>

            <button type="submit">
              Cerca
            </button>
          </form>
        </section>

        {/* RIEPILOGO */}

        <div className="grid">
          <div className="card">
            <div className="muted">
              Acquisti
            </div>

            <strong>
              {money(purchase)}
            </strong>

            <small>
              costo totale articoli
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Pagamenti
            </div>

            <strong>
              {money(paid)}
            </strong>

            <small>
              pagamenti visibili
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Crediti
            </div>

            <strong>
              {money(credit)}
            </strong>

            <small>
              credito residuo
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Articoli
            </div>

            <strong>
              {units}
            </strong>

            <small>
              unità acquistate
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Casella
            </div>

            <strong>
              {mailbox
                ? mailbox.status
                : '—'}
            </strong>

            <small>
              stato casella
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Movimenti
            </div>

            <strong>
              {movements.length}
            </strong>

            <small>
              ultimi 5 movimenti
            </small>
          </div>
        </div>

        {/* ULTIMI 5 MOVIMENTI */}

        <section className="panel">
          <div className="section-heading">
            <h2>
              Ultimi movimenti
            </h2>

            <a
              href="/movimenti"
              className="back-button"
            >
              Visualizza tutti →
            </a>
          </div>

          {movements.length === 0 ? (
            <div className="empty">
              Nessun movimento registrato.
            </div>
          ) : (
            <div className="movement-list">
              {movements.map(
                (movement) => (
                  <div
                    className="movement"
                    key={
                      movement.movement_code
                    }
                  >
                    <div>
                      <b>
                        {
                          movement.movement_code
                        }
                      </b>

                      <span>
                        {formatDate(
                          movement.movement_at
                        )}
                      </span>

                      <span>
                        {movement.description ||
                          movement.movement_type}
                      </span>
                    </div>

                    <strong>
                      {movement.total_amount_eur ==
                      null
                        ? '—'
                        : money(
                            Number(
                              movement.total_amount_eur
                            )
                          )}
                    </strong>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
