import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import IncomingArticlesGallery from '../../components/incoming-articles-gallery'
import WhatsAppContact from '../../components/whatsapp-contact'

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
    balanceMovementsResult,
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
            'amount_eur,used_amount_eur,status'
          )
          .eq('mailbox_id', mailboxId)
          .neq('status', 'ANNULLATO')
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

    mailboxId
      ? supabase
          .from('movements')
          .select('total_amount_eur')
          .eq('mailbox_id', mailboxId)
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ])

  const { data: incomingArticles } = await supabase
    .from('articles')
    .select('id,article_code,series,detail,photo_url,created_at,status')
    .eq('status', 'IN_ARRIVO')
    .is('deleted_at', null)
    .not('photo_url', 'is', null)
    .neq('photo_url', '')
    .order('created_at', { ascending: false })
    .limit(20)

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

  const balance = (balanceMovementsResult.data || []).reduce(
    (sum, movement: any) => sum + Number(movement.total_amount_eur || 0),
    0
  )

  const inStock = rows.reduce((sum, article: any) => {
    if (article.status !== 'IN_STOCK') return sum
    const assignment = assignments.find((item) => item.article_id === article.id)
    return sum + Number(assignment?.quantity_assigned || 0)
  }, 0)

  const inArrivo = rows.reduce((sum, article: any) => {
    if (article.status !== 'IN_ARRIVO') return sum
    const assignment = assignments.find((item) => item.article_id === article.id)
    return sum + Number(assignment?.quantity_assigned || 0)
  }, 0)

  const mailbox =
    mailboxResult.data

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/dashboard" displayName={profile?.display_name} email={user.email} />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Dashboard</h1>
          </div>
          <WhatsAppContact />
        </header>

        {/* DATI CLIENTE */}

        <section className="panel customer-dashboard-panel">
          <div className="section-heading">
            <h2>{customer ? `${customer.first_name} ${customer.last_name}` : 'Dati cliente'}</h2>
            {mailbox?.mailbox_code && <strong>{mailbox.mailbox_code}</strong>}
          </div>

          {!customer ? (
            <div className="empty">Dati cliente non disponibili.</div>
          ) : (
            <div className="customer-dashboard-grid">
              <div><span>Nome</span><strong>{customer.first_name} {customer.last_name}</strong></div>
              <div><span>Email</span><strong>{customer.email || user.email || '—'}</strong></div>
              <div><span>Telefono</span><strong>{customer.phone || '—'}</strong></div>
              <div><span>Spedizione</span><strong>{[customer.shipping_address, customer.shipping_postal_code, customer.shipping_city, customer.shipping_country].filter(Boolean).join(' ') || '—'}</strong></div>
              <div><span>Cliente dal</span><strong>{formatDate(customer.created_at)}</strong></div>
            </div>
          )}
        </section>

        {/* PANNELLO DI CONTROLLO */}

        <section className="panel dashboard-control-panel">
          <div className="section-heading">
            <h2>Pannello di controllo</h2>
          </div>
          <div className="dashboard-control-grid">
            <div className="dashboard-control-card">
              <span>Saldo</span>
              <strong>{money(balance)}</strong>
              <small>saldo casella</small>
            </div>
            <div className="dashboard-control-card">
              <span>In Stock</span>
              <strong>{inStock}</strong>
              <small>articoli acquistati</small>
            </div>
            <div className="dashboard-control-card">
              <span>In Arrivo</span>
              <strong>{inArrivo}</strong>
              <small>articoli acquistati</small>
            </div>
          </div>
        </section>

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
            <span className="muted">Ultimi 10 articoli caricati con foto</span>
          </div>

          {!incomingArticles || incomingArticles.length === 0 ? (
            <div className="empty">Nessun nuovo articolo con foto disponibile.</div>
          ) : (
            <IncomingArticlesGallery articles={incomingArticles} />
          )}
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
