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

type CustomerRow = {
  customerId: string
  customerCode: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  mailboxId: string | null
  mailboxCode: string | null
  debtRemaining: number
  stockUnits: number
  incomingUnits: number
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

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const [
    customersCountResult,
    customersResult,
    mailboxesResult,
    articlesResult,
    salesResult,
    paymentsResult,
    creditsResult,
    shipmentsCountResult,
    assignmentsResult,
  ] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase
      .from('customers')
      .select('id,first_name,last_name,email,phone,notes'),
    supabase
      .from('mailboxes')
      .select('id,mailbox_code,customer_id,status'),
    supabase
      .from('articles')
      .select('id,origin,status,quantity_purchased,unit_cost_eur,total_cost_eur'),
    supabase
      .from('movements')
      .select('mailbox_id,article_id,quantity,total_amount_eur,movement_type'),
    supabase.from('payments').select('mailbox_id,amount_eur,amount'),
    supabase.from('credits').select('mailbox_id,amount_eur,used_amount_eur'),
    supabase.from('shipments').select('id', { count: 'exact', head: true }),
    supabase
      .from('article_assignments')
      .select('article_id,mailbox_id,quantity_assigned,status'),
  ])

  const articles = (articlesResult.data || []) as any[]
  const sales = ((salesResult.data || []) as any[]).filter(
    (movement) => movement.movement_type === 'VENDITA' || movement.movement_type == null
  )
  const payments = (paymentsResult.data || []) as any[]
  const credits = (creditsResult.data || []) as any[]
  const customers = (customersResult.data || []) as any[]
  const mailboxes = (mailboxesResult.data || []) as any[]
  const assignments = (assignmentsResult.data || []) as any[]

  const articleMap = new Map(articles.map((article) => [article.id, article]))
  const mailboxMap = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]))
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]))

  const markets = {
    TOTALE: emptyStats(),
    GIAPPONE: emptyStats(),
    VIETNAM: emptyStats(),
    EUROPA: emptyStats(),
  }

  const getMarket = (origin: string | null | undefined) => {
    const value = (origin || '').trim().toUpperCase()
    if (value.includes('GIAPPONE') || value === 'JAP') return markets.GIAPPONE
    if (value.includes('VIETNAM') || value === 'VIET') return markets.VIETNAM
    if (value.includes('EUROPA') || value === 'EU') return markets.EUROPA
    return null
  }

  for (const article of articles) {
    const purchased = Number(article.quantity_purchased || 0)
    markets.TOTALE.purchased += purchased
    const market = getMarket(article.origin)
    if (market) market.purchased += purchased
  }

  for (const sale of sales) {
    const quantity = Number(sale.quantity || 0)
    const revenue = Number(sale.total_amount_eur || 0)
    const article = sale.article_id ? articleMap.get(sale.article_id) : null
    const unitCost = Number(article?.unit_cost_eur || 0)
    const costOfSold = quantity * unitCost

    markets.TOTALE.sold += quantity
    markets.TOTALE.revenue += revenue
    markets.TOTALE.costOfSold += costOfSold

    const market = getMarket(article?.origin)
    if (market) {
      market.sold += quantity
      market.revenue += revenue
      market.costOfSold += costOfSold
    }
  }

  for (const market of Object.values(markets)) {
    market.available = Math.max(0, market.purchased - market.sold)
    market.margin = market.revenue - market.costOfSold
    market.marginPercent = market.revenue > 0 ? (market.margin / market.revenue) * 100 : 0
  }

  const paymentsTotal = payments.reduce(
    (sum, payment) => sum + Number(payment.amount_eur ?? payment.amount ?? 0),
    0
  )

  const creditsTotal = credits.reduce(
    (sum, credit) => sum + Number(credit.amount_eur || 0),
    0
  )

  const creditsUsed = credits.reduce(
    (sum, credit) => sum + Number(credit.used_amount_eur || 0),
    0
  )

  const creditsRemaining = Math.max(0, creditsTotal - creditsUsed)

  const stockUnits = articles.reduce(
    (sum, article) =>
      sum + (article.status === 'IN_STOCK' ? Number(article.quantity_purchased || 0) : 0),
    0
  )

  const incomingUnits = articles.reduce(
    (sum, article) =>
      sum + (article.status === 'IN_ARRIVO' ? Number(article.quantity_purchased || 0) : 0),
    0
  )

  const paymentsByMailbox = new Map<string, number>()
  for (const payment of payments) {
    if (!payment.mailbox_id) continue
    paymentsByMailbox.set(
      payment.mailbox_id,
      (paymentsByMailbox.get(payment.mailbox_id) || 0) +
        Number(payment.amount_eur ?? payment.amount ?? 0)
    )
  }

  const creditsByMailbox = new Map<string, number>()
  for (const credit of credits) {
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

  const salesByMailbox = new Map<string, number>()
  for (const sale of sales) {
    if (!sale.mailbox_id) continue
    salesByMailbox.set(
      sale.mailbox_id,
      (salesByMailbox.get(sale.mailbox_id) || 0) + Number(sale.total_amount_eur || 0)
    )
  }

  const assignmentsByMailbox = new Map<string, any[]>()
  for (const assignment of assignments) {
    if (assignment.status !== 'ATTIVA' || !assignment.mailbox_id) continue
    const list = assignmentsByMailbox.get(assignment.mailbox_id) || []
    list.push(assignment)
    assignmentsByMailbox.set(assignment.mailbox_id, list)
  }

  const customerRows: CustomerRow[] = []

  for (const mailbox of mailboxes) {
    const customer = customerMap.get(mailbox.customer_id)
    if (!customer) continue

    const mailboxAssignments = assignmentsByMailbox.get(mailbox.id) || []
    let stock = 0
    let incoming = 0

    for (const assignment of mailboxAssignments) {
      const article = articleMap.get(assignment.article_id)
      if (!article) continue
      const quantity = Number(assignment.quantity_assigned || 0)
      if (article.status === 'IN_STOCK') stock += quantity
      if (article.status === 'IN_ARRIVO') incoming += quantity
    }

    const debtRemaining = Math.max(
      0,
      (salesByMailbox.get(mailbox.id) || 0) -
        (paymentsByMailbox.get(mailbox.id) || 0) -
        (creditsByMailbox.get(mailbox.id) || 0)
    )

    customerRows.push({
      customerId: customer.id,
      customerCode: mailbox?.mailbox_code || '—',
      firstName: customer.first_name || '',
      lastName: customer.last_name || '',
      email: customer.email || null,
      phone: customer.phone || null,
      notes: customer.notes || null,
      mailboxId: mailbox.id,
      mailboxCode: mailbox.mailbox_code || null,
      debtRemaining,
      stockUnits: stock,
      incomingUnits: incoming,
    })
  }

  const customersWithDebt = customerRows
    .filter((row) => row.debtRemaining > 0)
    .sort((a, b) => b.debtRemaining - a.debtRemaining)

  const customersZeroWithIncoming = customerRows
    .filter((row) => row.debtRemaining === 0 && row.incomingUnits > 0)
    .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))

  const customersReadyToShip = customerRows
    .filter((row) => row.stockUnits > 0)
    .sort((a, b) => b.stockUnits - a.stockUnits)

  const marketRows = [
    ['🇯🇵 Giappone', markets.GIAPPONE],
    ['🇻🇳 Vietnam', markets.VIETNAM],
    ['🇪🇺 Europa', markets.EUROPA],
  ] as const

  return (
    <main className="shell">
      <Navigation
        role="AMMINISTRATORE"
        active="/admin"
        displayName={profile?.display_name}
        email={user.email}
      />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AMMINISTRAZIONE</p>
            <h1>Dashboard amministratore</h1>
          </div>
        </header>

        {/* 1. RIEPILOGO */}
        <section className="panel">
          <h2>1. Riepilogo</h2>
          <div className="grid">
            <div className="card">
              <div className="muted">Clienti</div>
              <strong>{customersCountResult.count || 0}</strong>
              <small>clienti registrati</small>
            </div>
            <div className="card">
              <div className="muted">Articoli</div>
              <strong>{markets.TOTALE.purchased}</strong>
              <small>unità acquistate</small>
            </div>
            <div className="card">
              <div className="muted">IN ARRIVO</div>
              <strong>{incomingUnits}</strong>
              <small>unità in arrivo</small>
            </div>
            <div className="card">
              <div className="muted">IN STOCK</div>
              <strong>{stockUnits}</strong>
              <small>unità pronte</small>
            </div>
            <div className="card">
              <div className="muted">Pagamenti</div>
              <strong>{money(paymentsTotal)}</strong>
              <small>totale registrato</small>
            </div>
            <div className="card">
              <div className="muted">Crediti residui</div>
              <strong>{money(creditsRemaining)}</strong>
              <small>credito disponibile</small>
            </div>
            <div className="card">
              <div className="muted">Spedizioni</div>
              <strong>{shipmentsCountResult.count || 0}</strong>
              <small>spedizioni registrate</small>
            </div>
          </div>
        </section>

        {/* 2. SITUAZIONE CLIENTI */}
        <section className="panel">
          <h2>2. Situazione clienti</h2>

          <div className="admin-dashboard-subsection">
            <div className="admin-dashboard-subsection-head">
              <h3>Clienti con saldo da pagare superiore a 0 €</h3>
              <span>{customersWithDebt.length} clienti</span>
            </div>
            {customersWithDebt.length === 0 ? (
              <div className="empty">Nessun cliente con saldo da pagare.</div>
            ) : (
              <div className="admin-analysis-list">
                {customersWithDebt.map((row) => (
                  <div className="admin-analysis-row" key={`debt-${row.customerId}`}>
                    <div className="admin-analysis-title">
                      {row.firstName} {row.lastName} · {row.customerCode}
                    </div>
                    <div className="admin-analysis-grid">
                      <div><span>Saldo residuo</span><strong>{money(row.debtRemaining)}</strong></div>
                      <div><span>Casella</span><strong>{row.mailboxId ? <a className="dashboard-action-link" href={`/admin/clienti/${row.customerId}`}>{row.mailboxCode || 'Apri'} →</a> : '—'}</strong></div>
                      <div><span>Articoli in stock</span><strong>{row.stockUnits}</strong></div>
                      <div><span>Articoli in arrivo</span><strong>{row.incomingUnits}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-dashboard-subsection">
            <div className="admin-dashboard-subsection-head">
              <h3>Clienti con saldo 0 € e articoli in arrivo</h3>
              <span>{customersZeroWithIncoming.length} clienti</span>
            </div>
            {customersZeroWithIncoming.length === 0 ? (
              <div className="empty">Nessun cliente corrispondente.</div>
            ) : (
              <div className="admin-analysis-list">
                {customersZeroWithIncoming.map((row) => (
                  <div className="admin-analysis-row" key={`incoming-${row.customerId}`}>
                    <div className="admin-analysis-title">
                      {row.firstName} {row.lastName} · {row.customerCode}
                    </div>
                    <div className="admin-analysis-grid">
                      <div><span>Saldo residuo</span><strong>{money(0)}</strong></div>
                      <div><span>Casella</span><strong>{row.mailboxId ? <a className="dashboard-action-link" href={`/admin/clienti/${row.customerId}`}>{row.mailboxCode || 'Apri'} →</a> : '—'}</strong></div>
                      <div><span>Articoli in arrivo</span><strong>{row.incomingUnits}</strong></div>
                      <div><span>Articoli in stock</span><strong>{row.stockUnits}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-dashboard-subsection">
            <div className="admin-dashboard-subsection-head">
              <h3>Clienti con articoli pronti da spedire</h3>
              <span>{customersReadyToShip.length} clienti</span>
            </div>
            {customersReadyToShip.length === 0 ? (
              <div className="empty">Nessun cliente con articoli pronti da spedire.</div>
            ) : (
              <div className="admin-analysis-list">
                {customersReadyToShip.map((row) => (
                  <div className="admin-analysis-row" key={`stock-${row.customerId}`}>
                    <div className="admin-analysis-title">
                      {row.firstName} {row.lastName} · {row.customerCode}
                    </div>
                    <div className="admin-analysis-grid">
                      <div><span>Articoli pronti</span><strong>{row.stockUnits}</strong></div>
                      <div><span>Saldo residuo</span><strong>{money(row.debtRemaining)}</strong></div>
                      <div><span>Casella</span><strong>{row.mailboxId ? <a className="dashboard-action-link" href={`/admin/clienti/${row.customerId}`}>{row.mailboxCode || 'Apri'} →</a> : '—'}</strong></div>
                      <div><span>Articoli in arrivo</span><strong>{row.incomingUnits}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 3. ANALISI COMPLESSIVA + PROVENIENZA */}
        <section className="panel">
          <h2>3. Analisi complessiva + per provenienza</h2>

          <div className="admin-analysis-list">
            <div className="admin-analysis-row">
              <div className="admin-analysis-title">Analisi complessiva</div>
              <div className="admin-analysis-grid admin-analysis-grid-7">
                <div><span>Acquistati</span><strong>{markets.TOTALE.purchased}</strong></div>
                <div><span>Venduti</span><strong>{markets.TOTALE.sold}</strong></div>
                <div><span>Disponibili</span><strong>{markets.TOTALE.available}</strong></div>
                <div><span>Ricavi</span><strong>{money(markets.TOTALE.revenue)}</strong></div>
                <div><span>Costo venduto</span><strong>{money(markets.TOTALE.costOfSold)}</strong></div>
                <div><span>Margine</span><strong>{money(markets.TOTALE.margin)}</strong></div>
                <div><span>Margine %</span><strong>{percent(markets.TOTALE.marginPercent)}</strong></div>
              </div>
            </div>

            {marketRows.map(([label, market]) => (
              <div className="admin-analysis-row" key={label}>
                <div className="admin-analysis-title">{label}</div>
                <div className="admin-analysis-grid admin-analysis-grid-7">
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
      </section>
    </main>
  )
}
