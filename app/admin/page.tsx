import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

const percent = (n: number) => `${n.toFixed(1)}%`

const menu = [
  ['Dashboard', '/admin'],
  ['Clienti', '/admin/clienti'],
  ['Caselle', '/admin/caselle'],
  ['Articoli', '/admin/articoli'],
  ['Pagamenti', '/admin/pagamenti'],
  ['Crediti', '/admin/crediti'],
  ['Spedizioni', '/admin/spedizioni'],
  ['Movimenti', '/admin/movimenti'],
]

type MarketStats = {
  purchased: number
  sold: number
  available: number
  revenue: number
  costOfSold: number
  margin: number
  marginPercent: number
}

type CustomerDashboardRow = {
  customerId: string
  customerCode: string
  mailboxId: string | null
  mailboxCode: string | null
  debtRemaining: number
  hasPendingArticles: boolean
  allArticlesInStock: boolean
}

const emptyStats = (): MarketStats => ({
  purchased: 0,
  sold: 0,
  available: 0,
  revenue: 0,
  costOfSold: 0,
  margin: 0,
  marginPercent: 0,
})

export default async function AdminDashboard() {
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

  const [
    customersResult,
    customersDataResult,
    mailboxesResult,
    mailboxesDataResult,
    articlesResult,
    paymentsResult,
    creditsResult,
    shipmentsResult,
    movementsResult,
    assignmentsResult,
    salesResult,
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('customers')
      .select('id,customer_code,first_name,last_name'),

    supabase
      .from('mailboxes')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('mailboxes')
      .select('id,mailbox_code,customer_id,status'),

    supabase
      .from('articles')
      .select(
        'id,origin,status,quantity_purchased,unit_cost_eur,total_cost_eur'
      ),

    supabase
      .from('payments')
      .select('mailbox_id,amount_eur,amount'),

    supabase
      .from('credits')
      .select('mailbox_id,amount_eur,used_amount_eur'),

    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('movements')
      .select(
        `
          id,
          movement_code,
          movement_type,
          movement_at,
          total_amount_eur,
          description
        `
      )
      .order('movement_at', {
        ascending: false,
      })
      .limit(5),

    supabase
      .from('article_assignments')
      .select(
        'article_id,mailbox_id,quantity_assigned,status'
      ),

    supabase
      .from('movements')
      .select(
        'mailbox_id,article_id,quantity,total_amount_eur'
      )
      .eq('movement_type', 'VENDITA'),
  ])

  const articles = articlesResult.data || []
  const sales = salesResult.data || []
  const assignments = assignmentsResult.data || []

  const articleMap = new Map(
    articles.map((article) => [
      article.id,
      article,
    ])
  )

  const markets = {
    TOTALE: emptyStats(),
    GIAPPONE: emptyStats(),
    VIETNAM: emptyStats(),
    EUROPA: emptyStats(),
  }

  for (const article of articles) {
    const purchased = Number(
      article.quantity_purchased || 0
    )

    markets.TOTALE.purchased += purchased

    const origin = (article.origin || '')
      .trim()
      .toUpperCase()

    if (origin.includes('GIAPPONE')) {
      markets.GIAPPONE.purchased += purchased
    } else if (origin.includes('VIETNAM')) {
      markets.VIETNAM.purchased += purchased
    } else if (origin.includes('EUROPA')) {
      markets.EUROPA.purchased += purchased
    }
  }

  for (const sale of sales) {
    const quantity = Number(
      sale.quantity || 0
    )

    const revenue = Number(
      sale.total_amount_eur || 0
    )

    const article = sale.article_id
      ? articleMap.get(sale.article_id)
      : null

    const unitCost = Number(
      article?.unit_cost_eur || 0
    )

    const costOfSold = quantity * unitCost

    markets.TOTALE.sold += quantity
    markets.TOTALE.revenue += revenue
    markets.TOTALE.costOfSold += costOfSold

    if (!article) continue

    const origin = (article.origin || '')
      .trim()
      .toUpperCase()

    if (origin.includes('GIAPPONE')) {
      markets.GIAPPONE.sold += quantity
      markets.GIAPPONE.revenue += revenue
      markets.GIAPPONE.costOfSold += costOfSold
    } else if (origin.includes('VIETNAM')) {
      markets.VIETNAM.sold += quantity
      markets.VIETNAM.revenue += revenue
      markets.VIETNAM.costOfSold += costOfSold
    } else if (origin.includes('EUROPA')) {
      markets.EUROPA.sold += quantity
      markets.EUROPA.revenue += revenue
      markets.EUROPA.costOfSold += costOfSold
    }
  }

  for (const market of Object.values(markets)) {
    market.available = Math.max(
      0,
      market.purchased - market.sold
    )

    market.margin =
      market.revenue - market.costOfSold

    market.marginPercent =
      market.revenue > 0
        ? (market.margin / market.revenue) * 100
        : 0
  }

  let assignedUnits = 0

  for (const assignment of assignments) {
    if (assignment.status !== 'ATTIVA') continue

    assignedUnits += Number(
      assignment.quantity_assigned || 0
    )
  }

  const unassignedUnits = Math.max(
    0,
    markets.TOTALE.purchased - assignedUnits
  )

  const payments = paymentsResult.data || []

  const paymentsTotal = payments.reduce(
    (sum, payment) =>
      sum +
      Number(
        payment.amount_eur ??
          payment.amount ??
          0
      ),
    0
  )

  const credits = creditsResult.data || []

  const creditsTotal = credits.reduce(
    (sum, credit) =>
      sum + Number(credit.amount_eur || 0),
    0
  )

  const creditsUsed = credits.reduce(
    (sum, credit) =>
      sum +
      Number(
        credit.used_amount_eur || 0
      ),
    0
  )

  const creditsRemaining = Math.max(
    0,
    creditsTotal - creditsUsed
  )

  const movements = movementsResult.data || []

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))

  const customers = customersDataResult.data || []
  const customerById = new Map(customers.map((customer: any) => [customer.id, customer]))

  const mailboxRows = (mailboxesDataResult.data || []) as any[]
  const salesByMailbox = new Map<string, number>()
  for (const sale of sales as any[]) {
    const mailboxId = sale.mailbox_id as string | null
    if (!mailboxId) continue
    salesByMailbox.set(
      mailboxId,
      (salesByMailbox.get(mailboxId) || 0) + Number(sale.total_amount_eur || 0)
    )
  }

  const paymentsByMailbox = new Map<string, number>()
  for (const payment of payments as any[]) {
    if (!payment.mailbox_id) continue
    paymentsByMailbox.set(
      payment.mailbox_id,
      (paymentsByMailbox.get(payment.mailbox_id) || 0) + Number(payment.amount_eur ?? payment.amount ?? 0)
    )
  }

  const creditsByMailbox = new Map<string, number>()
  for (const credit of credits as any[]) {
    if (!credit.mailbox_id) continue
    const remaining = Math.max(
      0,
      Number(credit.amount_eur || 0) - Number(credit.used_amount_eur || 0)
    )
    creditsByMailbox.set(
      credit.mailbox_id,
      (creditsByMailbox.get(credit.mailbox_id) || 0) + remaining
    )
  }

  const assignmentsByMailbox = new Map<string, any[]>()
  for (const assignment of assignments as any[]) {
    if (assignment.status !== 'ATTIVA' || !assignment.mailbox_id) continue
    const list = assignmentsByMailbox.get(assignment.mailbox_id) || []
    list.push(assignment)
    assignmentsByMailbox.set(assignment.mailbox_id, list)
  }

  const customerDashboardRows: CustomerDashboardRow[] = []
  for (const mailbox of mailboxRows) {
    const customer = customerById.get(mailbox.customer_id) as any
    if (!customer) continue

    const mailboxAssignments = assignmentsByMailbox.get(mailbox.id) || []
    const articleRows = mailboxAssignments
      .map((assignment) => articleMap.get(assignment.article_id))
      .filter(Boolean) as any[]

    const hasPendingArticles = articleRows.some(
      (article) => article.status === 'IN_ARRIVO' || article.status === 'IN_STOCK'
    )

    const allArticlesInStock =
      articleRows.length > 0 &&
      articleRows.every((article) => article.status === 'IN_STOCK')

    const debtRemaining = Math.max(
      0,
      (salesByMailbox.get(mailbox.id) || 0) -
        (paymentsByMailbox.get(mailbox.id) || 0) -
        (creditsByMailbox.get(mailbox.id) || 0)
    )

    customerDashboardRows.push({
      customerId: customer.id,
      customerCode: customer.customer_code || '—',
      mailboxId: mailbox.id,
      mailboxCode: mailbox.mailbox_code || null,
      debtRemaining,
      hasPendingArticles,
      allArticlesInStock,
    })
  }

  const customersWithZeroBalanceAndPending = customerDashboardRows
    .filter((row) => row.debtRemaining === 0 && row.hasPendingArticles)
    .sort((a, b) => a.customerCode.localeCompare(b.customerCode))

  const customersReadyToShip = customerDashboardRows
    .filter((row) => row.allArticlesInStock)
    .sort((a, b) => a.customerCode.localeCompare(b.customerCode))

  const marketRows = [
    ['🇯🇵 Giappone', markets.GIAPPONE],
    ['🇻🇳 Vietnam', markets.VIETNAM],
    ['🇪🇺 Europa', markets.EUROPA],
  ] as const

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin" displayName={profile?.display_name} email={user.email} />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>
            <h1>Dashboard</h1>
          </div>
        </header>

        {/* RIEPILOGO AMMINISTRATIVO */}
        <section className="panel">
          <h2>Riepilogo amministrativo</h2>

          <div className="grid">
            <div className="card">
              <div className="muted">Clienti</div>
              <strong>
                {customersResult.count || 0}
              </strong>
              <small>
                clienti registrati
              </small>
            </div>

            <div className="card">
              <div className="muted">Caselle</div>
              <strong>
                {mailboxesResult.count || 0}
              </strong>
              <small>
                caselle registrate
              </small>
            </div>

            <div className="card">
              <div className="muted">Pagamenti</div>
              <strong>
                {money(paymentsTotal)}
              </strong>
              <small>
                pagamenti registrati
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Crediti residui
              </div>
              <strong>
                {money(creditsRemaining)}
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
                {shipmentsResult.count || 0}
              </strong>
              <small>
                spedizioni registrate
              </small>
            </div>
          </div>
        </section>

        {/* ULTIMI MOVIMENTI */}
        <section className="panel">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <h2>Ultimi movimenti</h2>

            <a
              href="/admin/movimenti"
              className="back-button"
            >
              Vedi tutti i movimenti →
            </a>
          </div>

          {movements.length === 0 ? (
            <div className="empty">
              Nessun movimento registrato.
            </div>
          ) : (
            <div className="movement-list">
              {movements.map((movement) => (
                <div
                  className="movement"
                  key={movement.id}
                >
                  <div>
                    <b>
                      {movement.movement_code}
                    </b>

                    <span>
                      {movement.description ||
                        movement.movement_type}
                    </span>

                    <span>
                      {formatDate(
                        movement.movement_at
                      )}
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
              ))}
            </div>
          )}
        </section>

        {/* MONITORAGGIO COMPLESSIVO */}
        <section className="panel">
          <h2>Monitoraggio complessivo</h2>

          <div className="grid">
            <div className="card">
              <div className="muted">
                Acquistati
              </div>
              <strong>
                {markets.TOTALE.purchased}
              </strong>
              <small>
                unità acquistate
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Venduti
              </div>
              <strong>
                {markets.TOTALE.sold}
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
                {markets.TOTALE.available}
              </strong>
              <small>
                unità disponibili
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Ricavi
              </div>
              <strong>
                {money(
                  markets.TOTALE.revenue
                )}
              </strong>
              <small>
                ricavi da vendite
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Costo del venduto
              </div>
              <strong>
                {money(
                  markets.TOTALE.costOfSold
                )}
              </strong>
              <small>
                costo articoli venduti
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Margine
              </div>
              <strong>
                {money(
                  markets.TOTALE.margin
                )}
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
                {percent(
                  markets.TOTALE
                    .marginPercent
                )}
              </strong>
              <small>
                sul ricavo
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Assegnati
              </div>
              <strong>
                {assignedUnits}
              </strong>
              <small>
                unità assegnate
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Non assegnati
              </div>
              <strong>
                {unassignedUnits}
              </strong>
              <small>
                unità non assegnate
              </small>
            </div>
          </div>
        </section>

        {/* ANALISI PER PROVENIENZA */}
        <section className="panel">
          <h2>Analisi per provenienza</h2>
          <div className="origin-analysis">
            {marketRows.map(([label, market]) => (
              <div className="origin-analysis-card" key={label}>
                <div className="origin-analysis-title">{label}</div>
                <div className="origin-analysis-grid">
                  <div><span>Acquistati</span><strong>{market.purchased}</strong></div>
                  <div><span>Venduti</span><strong>{market.sold}</strong></div>
                  <div><span>Disponibili</span><strong>{market.available}</strong></div>
                  <div><span>Ricavi</span><strong>{money(market.revenue)}</strong></div>
                  <div><span>Costo venduto</span><strong>{money(market.costOfSold)}</strong></div>
                  <div><span>Margine</span><strong>{money(market.margin)}</strong></div>
                  <div><span>Margine %</span><strong>{percent(market.marginPercent)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CLIENTI CON SALDO €0 E ARTICOLI PENDENTI */}
        <section className="panel">
          <h2>Clienti con saldo da pagare €0 e articoli in arrivo / stock</h2>
          {customersWithZeroBalanceAndPending.length === 0 ? (
            <div className="empty">Nessun cliente corrispondente.</div>
          ) : (
            <div className="admin-analysis-list">
              {customersWithZeroBalanceAndPending.map((row) => (
                <div className="admin-analysis-row" key={row.customerId}>
                  <div className="admin-analysis-title">{row.customerCode}</div>
                  <div className="admin-analysis-grid">
                    <div><span>Debito rimanente</span><strong>{money(row.debtRemaining)}</strong></div>
                    <div><span>Articoli</span><strong>IN ARRIVO / STOCK</strong></div>
                    <div><span>Casella</span><strong>{row.mailboxCode || '—'}</strong></div>
                    <div><span>Gestione</span><strong><a className="dashboard-action-link" href={row.mailboxId ? `/admin/caselle?search=${encodeURIComponent(row.mailboxCode || '')}` : '/admin/caselle'}>Vai alla casella →</a></strong></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CLIENTI PRONTI PER LA SPEDIZIONE */}
        <section className="panel">
          <h2>Clienti con tutti gli articoli in stock — pronti per essere spediti</h2>
          {customersReadyToShip.length === 0 ? (
            <div className="empty">Nessun cliente pronto per la spedizione.</div>
          ) : (
            <div className="admin-analysis-list">
              {customersReadyToShip.map((row) => (
                <div className="admin-analysis-row" key={row.customerId}>
                  <div className="admin-analysis-title">{row.customerCode}</div>
                  <div className="admin-analysis-grid">
                    <div><span>Stato articoli</span><strong>TUTTI IN STOCK</strong></div>
                    <div><span>Debito rimanente</span><strong>{money(row.debtRemaining)}</strong></div>
                    <div><span>Casella</span><strong>{row.mailboxCode || '—'}</strong></div>
                    <div><span>Gestione</span><strong><a className="dashboard-action-link" href={row.mailboxId ? `/admin/caselle?search=${encodeURIComponent(row.mailboxCode || '')}` : '/admin/caselle'}>Vai alla casella →</a></strong></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
