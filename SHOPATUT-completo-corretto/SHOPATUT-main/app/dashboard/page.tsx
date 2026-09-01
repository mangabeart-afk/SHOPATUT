import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'

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

  if (role === 'AMMINISTRATORE') {
    redirect('/admin')
  }

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
              photo_url,
              status,
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

  const { data: incomingArticles } = await supabase
    .from('articles')
    .select('id,article_code,series,detail,photo_url,created_at,status')
    .eq('status', 'IN_ARRIVO')
    .order('created_at', { ascending: false })
    .limit(10)

  const rows = articlesResult.data || []

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
      <Navigation role="CLIENTE" active="/dashboard" displayName={profile?.display_name} email={user.email} />

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

        {/* I MIEI ARTICOLI */}

        <section className="panel">
          <div className="section-heading">
            <h2>I miei articoli</h2>
            <a href="/articoli" className="back-button">Vedi tutti →</a>
          </div>

          {rows.length === 0 ? (
            <div className="empty">Nessun articolo ordinato nella tua casella.</div>
          ) : (
            <div className="movement-list">
              {rows.map((article: any) => {
                const assignment = assignments.find((item) => item.article_id === article.id)
                return (
                  <div className="movement" key={article.id}>
                    <div>
                      <div className="article-title-row">
                        <b>{article.article_code}</b>
                        {article.photo_url && <a href={article.photo_url} target="_blank" rel="noreferrer" className="article-photo-link" title="Visualizza foto">🔍</a>}
                      </div>
                      {article.series && <span>Serie: {article.series}</span>}
                      {article.detail && <span>{article.detail}</span>}
                      <span>Quantità ordinata: {Number(assignment?.quantity_assigned || 0)}</span>
                    </div>
                    <strong>{article.status || '—'}</strong>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* NUOVI ARTICOLI IN ARRIVO */}

        <section className="panel">
          <div className="section-heading">
            <h2>Nuovi articoli in arrivo</h2>
            <span className="muted">Ultimi 10 inseriti</span>
          </div>

          {!incomingArticles || incomingArticles.length === 0 ? (
            <div className="empty">Nessun nuovo articolo in arrivo.</div>
          ) : (
            <div className="incoming-gallery">
              {incomingArticles.map((article) => (
                <div className="incoming-card" key={article.id}>
                  <a href={article.photo_url || '#'} target="_blank" rel="noreferrer" className="incoming-photo">
                    {article.photo_url ? (
                      <img src={article.photo_url} alt={article.detail || article.article_code} />
                    ) : (
                      <span>Nessuna foto</span>
                    )}
                  </a>
                  <div className="incoming-info">
                    <strong>{article.detail || article.series || article.article_code}</strong>
                    <span>{article.article_code}</span>
                    <b>IN ARRIVO</b>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CONTATTO WHATSAPP */}

        <section className="panel whatsapp-panel">
          <a
            href="https://wa.me/393496026094?text=Buongiorno%2C%20ho%20bisogno%20di%20assistenza%20per%20il%20mio%20account%20ShopaT%C3%BCT."
            target="_blank"
            rel="noreferrer"
            className="whatsapp-button"
          >
            💬 Contattami su WhatsApp
          </a>
        </section>

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
