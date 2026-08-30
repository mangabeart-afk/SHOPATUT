```tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

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

const formatDateTime = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default async function ClienteDetailPage({
  params,
}: PageProps) {
  const { id } = await params

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

  const { data: customer, error: customerError } =
    await supabase
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
          updated_at,
          mailboxes (
            id,
            mailbox_code,
            status,
            opened_at,
            notes
          )
        `
      )
      .eq('id', id)
      .maybeSingle()

  if (customerError || !customer) {
    notFound()
  }

  const mailboxes = Array.isArray(customer.mailboxes)
    ? customer.mailboxes
    : customer.mailboxes
      ? [customer.mailboxes]
      : []

  const mailboxIds = mailboxes.map(
    (mailbox) => mailbox.id
  )

  const [
    assignmentsResult,
    paymentsResult,
    creditsResult,
    shipmentsResult,
    movementsResult,
  ] = await Promise.all([
    mailboxIds.length > 0
      ? supabase
          .from('article_assignments')
          .select(
            `
              id,
              article_id,
              mailbox_id,
              quantity_assigned,
              assigned_at,
              status,
              notes,
              articles (
                id,
                article_code,
                purchase_date,
                origin,
                seller,
                series,
                detail,
                quantity_purchased,
                unit_cost_eur,
                total_cost_eur
              ),
              mailboxes (
                mailbox_code
              )
            `
          )
          .in('mailbox_id', mailboxIds)
          .order('assigned_at', {
            ascending: false,
          })
      : Promise.resolve({
          data: [],
          error: null,
        }),

    mailboxIds.length > 0
      ? supabase
          .from('payments')
          .select(
            `
              id,
              amount_eur,
              amount,
              created_at,
              notes
            `
          )
          .in('mailbox_id', mailboxIds)
          .order('created_at', {
            ascending: false,
          })
      : Promise.resolve({
          data: [],
          error: null,
        }),

    mailboxIds.length > 0
      ? supabase
          .from('credits')
          .select(
            `
              id,
              amount_eur,
              used_amount_eur,
              created_at
            `
          )
          .in('mailbox_id', mailboxIds)
          .order('created_at', {
            ascending: false,
          })
      : Promise.resolve({
          data: [],
          error: null,
        }),

    mailboxIds.length > 0
      ? supabase
          .from('shipments')
          .select(
            `
              id,
              shipment_code,
              status,
              created_at
            `
          )
          .in('mailbox_id', mailboxIds)
          .order('created_at', {
            ascending: false,
          })
      : Promise.resolve({
          data: [],
          error: null,
        }),

    mailboxIds.length > 0
      ? supabase
          .from('movements')
          .select(
            `
              id,
              movement_code,
              movement_at,
              movement_type,
              reference_code,
              article_id,
              quantity,
              unit_price_eur,
              total_amount_eur,
              description,
              notes
            `
          )
          .in('mailbox_id', mailboxIds)
          .order('movement_at', {
            ascending: false,
          })
          .limit(20)
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ])

  const assignments =
    assignmentsResult.data || []

  const payments =
    paymentsResult.data || []

  const credits =
    creditsResult.data || []

  const shipments =
    shipmentsResult.data || []

  const movements =
    movementsResult.data || []

  const totalPayments = payments.reduce(
    (sum, payment) =>
      sum +
      Number(
        payment.amount_eur ??
          payment.amount ??
          0
      ),
    0
  )

  const totalCredits = credits.reduce(
    (sum, credit) =>
      sum +
      Number(credit.amount_eur || 0),
    0
  )

  const usedCredits = credits.reduce(
    (sum, credit) =>
      sum +
      Number(
        credit.used_amount_eur || 0
      ),
    0
  )

  const remainingCredits = Math.max(
    0,
    totalCredits - usedCredits
  )

  const assignedUnits = assignments.reduce(
    (sum, assignment) =>
      assignment.status === 'ATTIVA'
        ? sum +
          Number(
            assignment.quantity_assigned || 0
          )
        : sum,
    0
  )

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          MangaBEART <span>[ShopaTüT]</span>
        </div>

        <nav>
          <a href="/admin">Dashboard</a>

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

            <h1>
              {customer.first_name}{' '}
              {customer.last_name}
            </h1>
          </div>

          <a
            href="/admin/clienti"
            className="back-button"
          >
            ← Clienti
          </a>
        </header>

        {/* ANAGRAFICA */}
        <section className="panel">
          <h2>Anagrafica cliente</h2>

          <div className="grid">
            <div className="card">
              <div className="muted">
                Nome
              </div>
              <strong>
                {customer.first_name}{' '}
                {customer.last_name}
              </strong>
            </div>

            <div className="card">
              <div className="muted">
                Email
              </div>
              <strong>
                {customer.email || '—'}
              </strong>
            </div>

            <div className="card">
              <div className="muted">
                Telefono
              </div>
              <strong>
                {customer.phone || '—'}
              </strong>
            </div>

            <div className="card">
              <div className="muted">
                Cliente dal
              </div>
              <strong>
                {formatDate(
                  customer.created_at
                )}
              </strong>
            </div>
          </div>

          {customer.notes && (
            <div className="empty">
              <b>Note:</b>{' '}
              {customer.notes}
            </div>
          )}
        </section>

        {/* RIEPILOGO */}
        <section className="panel">
          <h2>Riepilogo cliente</h2>

          <div className="grid">
            <div className="card">
              <div className="muted">
                Caselle
              </div>
              <strong>
                {mailboxes.length}
              </strong>
              <small>
                caselle associate
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Articoli assegnati
              </div>
              <strong>
                {assignedUnits}
              </strong>
              <small>
                unità attive
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Pagamenti
              </div>
              <strong>
                {money(totalPayments)}
              </strong>
              <small>
                totale pagato
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Credito residuo
              </div>
              <strong>
                {money(
                  remainingCredits
                )}
              </strong>
              <small>
                credito disponibile
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Spedizioni
              </div>
              <strong>
                {shipments.length}
              </strong>
              <small>
                spedizioni registrate
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
                movimenti recenti
              </small>
            </div>
          </div>
        </section>

        {/* CASELLE */}
        <section className="panel">
          <h2>Caselle</h2>

          {mailboxes.length === 0 ? (
            <div className="empty">
              Nessuna casella associata.
            </div>
          ) : (
            <div className="movement-list">
              {mailboxes.map((mailbox) => (
                <div
                  className="movement"
                  key={mailbox.id}
                >
                  <div>
                    <b>
                      {mailbox.mailbox_code}
                    </b>

                    <span>
                      Stato:{' '}
                      {mailbox.status}
                    </span>

                    <span>
                      Apertura:{' '}
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
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ARTICOLI */}
        <section className="panel">
          <h2>Articoli assegnati</h2>

          {assignments.length === 0 ? (
            <div className="empty">
              Nessun articolo assegnato.
            </div>
          ) : (
            <div className="movement-list">
              {assignments.map(
                (assignment) => {
                  const article =
                    Array.isArray(
                      assignment.articles
                    )
                      ? assignment.articles[0]
                      : assignment.articles

                  const mailbox =
                    Array.isArray(
                      assignment.mailboxes
                    )
                      ? assignment.mailboxes[0]
                      : assignment.mailboxes

                  return (
                    <div
                      className="movement"
                      key={assignment.id}
                    >
                      <div>
                        <b>
                          {article?.article_code ||
                            'Articolo'}
                        </b>

                        {article?.series && (
                          <span>
                            Serie:{' '}
                            {article.series}
                          </span>
                        )}

                        {article?.origin && (
                          <span>
                            Provenienza:{' '}
                            {article.origin}
                          </span>
                        )}

                        <span>
                          Casella:{' '}
                          {mailbox?.mailbox_code ||
                            '—'}
                        </span>

                        <span>
                          Assegnato:{' '}
                          {formatDateTime(
                            assignment.assigned_at
                          )}
                        </span>

                        <span>
                          Stato:{' '}
                          {assignment.status}
                        </span>
                      </div>

                      <div>
                        <span>
                          Quantità:{' '}
                          {
                            assignment.quantity_assigned
                          }
                        </span>

                        {article?.unit_cost_eur !=
                          null && (
                          <span>
                            Costo unitario:{' '}
                            {money(
                              Number(
                                article.unit_cost_eur
                              )
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                }
              )}
            </div>
          )}
        </section>

        {/* PAGAMENTI */}
        <section className="panel">
          <h2>Pagamenti</h2>

          {payments.length === 0 ? (
            <div className="empty">
              Nessun pagamento registrato.
            </div>
          ) : (
            <div className="movement-list">
              {payments.map((payment) => (
                <div
                  className="movement"
                  key={payment.id}
                >
                  <div>
                    <b>
                      Pagamento #{payment.id}
                    </b>

                    <span>
                      {formatDateTime(
                        payment.created_at
                      )}
                    </span>

                    {payment.notes && (
                      <span>
                        {payment.notes}
                      </span>
                    )}
                  </div>

                  <strong>
                    {money(
                      Number(
                        payment.amount_eur ??
                          payment.amount ??
                          0
                      )
                    )}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CREDITI */}
        <section className="panel">
          <h2>Crediti</h2>

          {credits.length === 0 ? (
            <div className="empty">
              Nessun credito registrato.
            </div>
          ) : (
            <div className="movement-list">
              {credits.map((credit) => {
                const amount = Number(
                  credit.amount_eur || 0
                )

                const used = Number(
                  credit.used_amount_eur ||
                    0
                )

                const residual = Math.max(
                  0,
                  amount - used
                )

                return (
                  <div
                    className="movement"
                    key={credit.id}
                  >
                    <div>
                      <b>
                        Credito #{credit.id}
                      </b>

                      <span>
                        Data:{' '}
                        {formatDate(
                          credit.created_at
                        )}
                      </span>

                      <span>
                        Utilizzato:{' '}
                        {money(used)}
                      </span>
                    </div>

                    <div>
                      <span>
                        Totale:{' '}
                        {money(amount)}
                      </span>

                      <strong>
                        Residuo:{' '}
                        {money(residual)}
                      </strong>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* SPEDIZIONI */}
        <section className="panel">
          <h2>Spedizioni</h2>

          {shipments.length === 0 ? (
            <div className="empty">
              Nessuna spedizione registrata.
            </div>
          ) : (
            <div className="movement-list">
              {shipments.map(
                (shipment) => (
                  <div
                    className="movement"
                    key={shipment.id}
                  >
                    <div>
                      <b>
                        {
                          shipment.shipment_code
                        }
                      </b>

                      <span>
                        Stato:{' '}
                        {shipment.status}
                      </span>

                      <span>
                        Data:{' '}
                        {formatDateTime(
                          shipment.created_at
                        )}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* MOVIMENTI */}
        <section className="panel">
          <div
            style={{
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <h2>
              Ultimi movimenti
            </h2>

            <a
              href="/admin/movimenti"
              className="back-button"
            >
              Vedi tutti →
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
                          movement.description ||
                          movement.movement_type
                        }
                      </span>

                      <span>
                        {formatDateTime(
                          movement.movement_at
                        )}
                      </span>

                      {movement.reference_code && (
                        <span>
                          Riferimento:{' '}
                          {
                            movement.reference_code
                          }
                        </span>
                      )}
                    </div>

                    <div>
                      {movement.quantity !=
                        null && (
                        <span>
                          Quantità:{' '}
                          {movement.quantity}
                        </span>
                      )}

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
```
