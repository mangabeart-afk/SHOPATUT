import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

type Assignment = {
  id: string
  article_id: string
  mailbox_id: string
  quantity_assigned: number
  assigned_at: string
  status: string
  notes: string | null
}

type Movement = {
  id: string
  movement_code: string
  mailbox_id: string | null
  movement_at: string
  movement_type: string
  reference_id: string | null
  reference_code: string | null
  quantity: number | null
  unit_price_eur: number | null
  total_amount_eur: number | null
  description: string | null
  notes: string | null
}

type Mailbox = {
  id: string
  mailbox_code: string
  customer_id: string
  status: string
}

type Customer = {
  id: string
  customer_code: string | null
  first_name: string
  last_name: string
  email: string | null
}

const money = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value || 0)

const number = (value: number) =>
  new Intl.NumberFormat('it-IT').format(value || 0)

const percent = (value: number) =>
  `${value.toFixed(1)}%`

const formatDate = (
  value: string | null
) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

const formatDateTime = (
  value: string | null
) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default async function ArticoloDetailPage({
  params,
}: PageProps) {
  const { id } = await params

  const supabase = await createClient()

  /*
   * AUTENTICAZIONE
   */

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

  /*
   * ARTICOLO
   */

  const {
    data: article,
    error: articleError,
  } = await supabase
    .from('articles')
    .select(
      `
        id,
        article_code,
        purchase_date,
        origin,
        seller,
        series,
        detail,
        quantity_purchased,
        currency,
        unit_price_foreign,
        exchange_rate,
        accessory_cost_eur,
        total_cost_eur,
        unit_cost_eur,
        notes,
        created_at
      `
    )
    .eq('id', id)
    .maybeSingle()

  if (articleError || !article) {
    notFound()
  }

  /*
   * ASSEGNAZIONI
   */

  const {
    data: assignmentRows,
    error: assignmentsError,
  } = await supabase
    .from('article_assignments')
    .select(
      `
        id,
        article_id,
        mailbox_id,
        quantity_assigned,
        assigned_at,
        status,
        notes
      `
    )
    .eq('article_id', id)
    .order('assigned_at', {
      ascending: false,
    })

  if (assignmentsError) {
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

            <a href="/admin/caselle">
              Caselle
            </a>

            <a
              href="/admin/articoli"
              className="active"
            >
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

              <h1>
                {article.article_code}
              </h1>
            </div>

            <a
              href="/admin/articoli"
              className="back-button"
            >
              ← Articoli
            </a>
          </header>

          <section className="panel">
            <h2>Articolo</h2>

            <div className="empty">
              Impossibile caricare le
              assegnazioni dell'articolo.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const assignments =
    (assignmentRows ||
      []) as Assignment[]

  const mailboxIds = [
    ...new Set(
      assignments.map(
        (assignment) =>
          assignment.mailbox_id
      )
    ),
  ]

  /*
   * CASELLE
   */

  const {
    data: mailboxRows,
  } = mailboxIds.length
    ? await supabase
        .from('mailboxes')
        .select(
          `
            id,
            mailbox_code,
            customer_id,
            status
          `
        )
        .in('id', mailboxIds)
    : { data: [] }

  const mailboxes =
    (mailboxRows || []) as Mailbox[]

  /*
   * CLIENTI
   */

  const customerIds = [
    ...new Set(
      mailboxes.map(
        (mailbox) =>
          mailbox.customer_id
      )
    ),
  ]

  const {
    data: customerRows,
  } = customerIds.length
    ? await supabase
        .from('customers')
        .select(
          `
            id,
            customer_code,
            first_name,
            last_name,
            email
          `
        )
        .in('id', customerIds)
    : { data: [] }

  const customers =
    (customerRows || []) as Customer[]

  const mailboxMap = new Map(
    mailboxes.map((mailbox) => [
      mailbox.id,
      mailbox,
    ])
  )

  const customerMap = new Map(
    customers.map((customer) => [
      customer.id,
      customer,
    ])
  )

  /*
   * VENDITE / MOVIMENTI
   */

  const {
    data: movementRows,
  } = await supabase
    .from('movements')
    .select(
      `
        id,
        movement_code,
        mailbox_id,
        movement_at,
        movement_type,
        reference_id,
        reference_code,
        quantity,
        unit_price_eur,
        total_amount_eur,
        description,
        notes
      `
    )
    .eq('article_id', id)
    .order('movement_at', {
      ascending: false,
    })

  const movements =
    (movementRows ||
      []) as Movement[]

  const saleMovements =
    movements.filter(
      (movement) =>
        movement.movement_type ===
        'VENDITA'
    )

  /*
   * CALCOLO STATISTICHE
   */

  const purchased =
    Number(
      article.quantity_purchased || 0
    )

  const assigned = assignments.reduce(
    (sum, assignment) =>
      assignment.status === 'ATTIVA'
        ? sum +
          Number(
            assignment.quantity_assigned ||
              0
          )
        : sum,
    0
  )

  const sold = saleMovements.reduce(
    (sum, movement) =>
      sum +
      Number(
        movement.quantity || 0
      ),
    0
  )

  const revenue =
    saleMovements.reduce(
      (sum, movement) =>
        sum +
        Number(
          movement.total_amount_eur ||
            0
        ),
      0
    )

  const unitCost =
    Number(
      article.unit_cost_eur || 0
    )

  const costOfSold =
    sold * unitCost

  const available = Math.max(
    0,
    purchased -
      assigned -
      sold
  )

  const margin =
    revenue - costOfSold

  const marginPercent =
    revenue > 0
      ? (margin / revenue) * 100
      : 0

  /*
   * RENDER
   */

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

          <a href="/admin/caselle">
            Caselle
          </a>

          <a
            href="/admin/articoli"
            className="active"
          >
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

            <h1>
              {article.article_code}
            </h1>
          </div>

          <a
            href="/admin/articoli"
            className="back-button"
          >
            ← Articoli
          </a>
        </header>

        {/* DATI ARTICOLO */}

        <section className="panel">
          <h2>Dati articolo</h2>

          <div className="customer-details">
            <div className="customer-detail-row">
              <span className="muted">
                Codice articolo
              </span>

              <strong className="customer-value">
                {article.article_code}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Data acquisto
              </span>

              <strong className="customer-value">
                {formatDate(
                  article.purchase_date
                )}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Provenienza
              </span>

              <strong className="customer-value">
                {article.origin}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Venditore
              </span>

              <strong className="customer-value">
                {article.seller || '—'}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Serie
              </span>

              <strong className="customer-value">
                {article.series || '—'}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Dettaglio
              </span>

              <strong className="customer-value">
                {article.detail || '—'}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Quantità acquistata
              </span>

              <strong className="customer-value">
                {number(purchased)}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Costo totale
              </span>

              <strong className="customer-value">
                {money(
                  Number(
                    article.total_cost_eur ||
                      0
                  )
                )}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Costo unitario
              </span>

              <strong className="customer-value">
                {money(unitCost)}
              </strong>
            </div>
          </div>

          {article.notes && (
            <div className="customer-notes">
              <b>Note:</b>{' '}
              {article.notes}
            </div>
          )}
        </section>

        {/* MONITORAGGIO */}

        <section className="panel">
          <h2>Monitoraggio articolo</h2>

          <div className="grid">
            <div className="card">
              <div className="muted">
                Acquistati
              </div>

              <strong>
                {number(purchased)}
              </strong>

              <small>
                unità acquistate
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Assegnati
              </div>

              <strong>
                {number(assigned)}
              </strong>

              <small>
                unità assegnate
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Venduti
              </div>

              <strong>
                {number(sold)}
              </strong>

              <small>
                unità vendute
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Disponibili
              </div>

              <strong>
                {number(available)}
              </strong>

              <small>
                unità ancora libere
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Ricavi
              </div>

              <strong>
                {money(revenue)}
              </strong>

              <small>
                ricavi da vendite
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Costo venduto
              </div>

              <strong>
                {money(costOfSold)}
              </strong>

              <small>
                costo del venduto
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Margine
              </div>

              <strong>
                {money(margin)}
              </strong>

              <small>
                margine commerciale
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Margine %
              </div>

              <strong>
                {percent(marginPercent)}
              </strong>

              <small>
                sul ricavo
              </small>
            </div>
          </div>
        </section>

        {/* ASSEGNAZIONI */}

        <section className="panel">
          <h2>Assegnazioni</h2>

          {assignments.length === 0 ? (
            <div className="empty">
              Nessuna assegnazione
              registrata.
            </div>
          ) : (
            <div className="movement-list">
              {assignments.map(
                (assignment) => {
                  const mailbox =
                    mailboxMap.get(
                      assignment.mailbox_id
                    )

                  const customer =
                    mailbox
                      ? customerMap.get(
                          mailbox.customer_id
                        )
                      : null

                  return (
                    <div
                      className="movement"
                      key={assignment.id}
                    >
                      <div>
                        <b>
                          {customer
                            ? `${customer.first_name} ${customer.last_name}`
                            : 'Cliente non trovato'}
                        </b>

                        {customer?.customer_code && (
                          <span>
                            Codice cliente:{' '}
                            {
                              customer.customer_code
                            }
                          </span>
                        )}

                        <span>
                          Casella:{' '}
                          {mailbox?.mailbox_code ||
                            '—'}
                        </span>

                        <span>
                          Data:{' '}
                          {formatDateTime(
                            assignment.assigned_at
                          )}
                        </span>

                        <span>
                          Stato:{' '}
                          {assignment.status}
                        </span>

                        {assignment.notes && (
                          <span>
                            Note:{' '}
                            {assignment.notes}
                          </span>
                        )}
                      </div>

                      <strong>
                        {
                          assignment.quantity_assigned
                        }
                        {' '}
                        unità
                      </strong>
                    </div>
                  )
                }
              )}
            </div>
          )}
        </section>

        {/* VENDITE */}

        <section className="panel">
          <h2>Vendite</h2>

          {saleMovements.length ===
          0 ? (
            <div className="empty">
              Nessuna vendita registrata.
            </div>
          ) : (
            <div className="movement-list">
              {saleMovements.map(
                (sale) => {
                  const mailbox =
                    sale.mailbox_id
                      ? mailboxMap.get(
                          sale.mailbox_id
                        )
                      : null

                  const customer =
                    mailbox
                      ? customerMap.get(
                          mailbox.customer_id
                        )
                      : null

                  return (
                    <div
                      className="movement"
                      key={sale.id}
                    >
                      <div>
                        <b>
                          {sale.reference_code ||
                            sale.movement_code}
                        </b>

                        <span>
                          Data:{' '}
                          {formatDateTime(
                            sale.movement_at
                          )}
                        </span>

                        {customer && (
                          <span>
                            Cliente:{' '}
                            {
                              customer.first_name
                            }{' '}
                            {
                              customer.last_name
                            }
                          </span>
                        )}

                        {customer?.customer_code && (
                          <span>
                            Codice cliente:{' '}
                            {
                              customer.customer_code
                            }
                          </span>
                        )}

                        {mailbox && (
                          <span>
                            Casella:{' '}
                            {
                              mailbox.mailbox_code
                            }
                          </span>
                        )}

                        {sale.quantity !==
                          null && (
                          <span>
                            Quantità:{' '}
                            {number(
                              Number(
                                sale.quantity
                              )
                            )}
                          </span>
                        )}

                        {sale.unit_price_eur !==
                          null && (
                          <span>
                            Prezzo unitario:{' '}
                            {money(
                              Number(
                                sale.unit_price_eur
                              )
                            )}
                          </span>
                        )}
                      </div>

                      <strong>
                        {sale.total_amount_eur ===
                        null
                          ? '—'
                          : money(
                              Number(
                                sale.total_amount_eur
                              )
                            )}
                      </strong>
                    </div>
                  )
                }
              )}
            </div>
          )}
        </section>

        {/* MOVIMENTI */}

        <section className="panel">
          <div className="section-heading">
            <h2>
              Movimenti articolo
            </h2>

            <a
              href={`/admin/movimenti?article=${article.id}`}
              className="back-button"
            >
              Vedi tutti →
            </a>
          </div>

          {movements.length === 0 ? (
            <div className="empty">
              Nessun movimento registrato
              per questo articolo.
            </div>
          ) : (
            <div className="movement-list">
              {movements.map(
                (movement) => (
                  <div
                    className="movement"
                    key={movement.id}
                  >
                    <div>
                      <b>
                        {
                          movement.movement_code
                        }
                      </b>

                      <span>
                        {
                          movement.movement_type
                        }
                      </span>

                      <span>
                        {formatDateTime(
                          movement.movement_at
                        )}
                      </span>

                      {movement.description && (
                        <span>
                          {
                            movement.description
                          }
                        </span>
                      )}

                      {movement.reference_code && (
                        <span>
                          Riferimento:{' '}
                          {
                            movement.reference_code
                          }
                        </span>
                      )}

                      {movement.quantity !==
                        null && (
                        <span>
                          Quantità:{' '}
                          {number(
                            Number(
                              movement.quantity
                            )
                          )}
                        </span>
                      )}

                      {movement.notes && (
                        <span>
                          Note:{' '}
                          {movement.notes}
                        </span>
                      )}
                    </div>

                    <strong>
                      {movement.total_amount_eur ===
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
