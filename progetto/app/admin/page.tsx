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
  purchaseValue: number
  sold: number
  inventorySold: number
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
  debtRemaining: number
  stockUnits: number
  incomingUnits: number
}

const emptyStats = (): MarketStats => ({
  purchased: 0,
  purchaseValue: 0,
  sold: 0,
  inventorySold: 0,
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
    customersResult,
    mailboxesResult,
    articlesResult,
    salesResult,
    paymentsResult,
    creditsResult,
    assignmentsResult,
  ] = await Promise.all([
    supabase.from('customers').select('id,customer_code,first_name,last_name,email,phone,notes'),
    supabase.from('mailboxes').select('id,customer_id'),
    supabase
      .from('articles')
      .select(
        'id,import_sheet,origin,status,quantity_purchased,unit_cost_eur,total_cost_eur,legacy_quantity_sold,legacy_sales_revenue_eur'
      )
      .is('deleted_at', null),
    supabase.from('movements').select('mailbox_id,article_id,quantity,total_amount_eur,unit_price_eur,movement_type'),
    supabase.from('payments').select('mailbox_id,amount_eur,status'),
    supabase.from('credits').select('mailbox_id,amount_eur,used_amount_eur,status'),
    supabase.from('article_assignments').select('article_id,mailbox_id,quantity_assigned').in('status',['ATTIVA','IN_BOX']),
  ])

  const queryErrors = [
    customersResult.error,
    mailboxesResult.error,
    articlesResult.error,
    salesResult.error,
    paymentsResult.error,
    creditsResult.error,
    assignmentsResult.error,
  ].filter(Boolean)

  if (queryErrors.length > 0) {
    throw new Error(queryErrors.map((error) => error?.message).filter(Boolean).join(' | '))
  }

  const articles = (articlesResult.data || []) as any[]
  const sales = ((salesResult.data || []) as any[]).filter(
    (movement) => movement.movement_type === 'VENDITA' || movement.movement_type == null
  )
  const payments = ((paymentsResult.data || []) as any[]).filter(
    (payment) => payment.status !== 'ANNULLATO'
  )
  const credits = ((creditsResult.data || []) as any[]).filter(
    (credit) => credit.status !== 'ANNULLATO'
  )
  const customers = (customersResult.data || []) as any[]
  const mailboxes = (mailboxesResult.data || []) as any[]
  const assignments = (assignmentsResult.data || []) as any[]

  const articleMap = new Map(articles.map((article) => [article.id, article]))
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
    // I totali generali comprendono tutte le schede importate, incluso VIET.
    // Lo stato IN_ARRIVO continua a distinguere gli articoli non ancora arrivati.
    markets.TOTALE.purchased += purchased
    markets.TOTALE.purchaseValue += Number(article.total_cost_eur || 0)

    // Vendite storiche importate riga per riga da Excel. Sono separate dai
    // movimenti VENDITA creati nell'app dopo la migrazione, per non duplicarli.
    const legacySold = Number(article.legacy_quantity_sold || 0)
    const legacyRevenue = Number(article.legacy_sales_revenue_eur || 0)
    const legacyCostOfSold = legacySold * Number(article.unit_cost_eur || 0)
    markets.TOTALE.sold += legacySold
    markets.TOTALE.revenue += legacyRevenue
    markets.TOTALE.costOfSold += legacyCostOfSold
    markets.TOTALE.inventorySold += legacySold

    const market = getMarket(article.origin)
    if (market) {
      market.purchased += purchased
      market.purchaseValue += Number(article.total_cost_eur || 0)
      market.inventorySold += legacySold
      market.sold += legacySold
      market.revenue += legacyRevenue
      market.costOfSold += legacyCostOfSold
    }
  }

  for (const sale of sales) {
    const quantity = Number(sale.quantity || 0)
    const storedRevenue = Number(sale.total_amount_eur || 0)
    const unitPrice = Number(sale.unit_price_eur || 0)
    const revenue = storedRevenue !== 0 ? storedRevenue : quantity * unitPrice
    const article = sale.article_id ? articleMap.get(sale.article_id) : null
    const unitCost = Number(article?.unit_cost_eur || 0)
    const costOfSold = quantity * unitCost

    markets.TOTALE.sold += quantity
    markets.TOTALE.revenue += revenue
    markets.TOTALE.costOfSold += costOfSold
    if (article) markets.TOTALE.inventorySold += quantity

    const market = getMarket(article?.origin)
    if (market) {
      market.sold += quantity
      market.revenue += revenue
      market.costOfSold += costOfSold
      if (article) market.inventorySold += quantity
    }
  }

  for (const market of Object.values(markets)) {
    market.available = Math.max(0, market.purchased - market.inventorySold)
    market.margin = market.revenue - market.costOfSold
    market.marginPercent = market.revenue > 0 ? (market.margin / market.revenue) * 100 : 0
  }

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

  const valoreMedioAcquisto = markets.TOTALE.purchased > 0
    ? markets.TOTALE.purchaseValue / markets.TOTALE.purchased
    : 0

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
    if (!assignment.mailbox_id) continue
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
      customerCode: customer.customer_code || '—',
      firstName: customer.first_name || '',
      lastName: customer.last_name || '',
      email: customer.email || null,
      phone: customer.phone || null,
      notes: customer.notes || null,
      mailboxId: mailbox.id,
      debtRemaining,
      stockUnits: stock,
      incomingUnits: incoming,
    })
  }

  const saldoDovuto = customerRows.reduce((sum, row) => sum + Number(row.debtRemaining || 0), 0)

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
          <h2>Riepilogo</h2>
          <div className="grid admin-summary-grid">
            <div className="card">
              <div className="admin-summary-label">CLIENTI</div>
              <strong>{customers.length}</strong>
            </div>
            <div className="card">
              <div className="admin-summary-label">SALDO</div>
              <strong>{money(saldoDovuto)}</strong>
            </div>
            <div className="card">
              <div className="admin-summary-label">IN ARRIVO</div>
              <strong>{incomingUnits}</strong>
            </div>

            <div className="card">
              <div className="admin-summary-label">QT ACQ</div>
              <strong>{markets.TOTALE.purchased}</strong>
            </div>
            <div className="card">
              <div className="admin-summary-label">VALORE</div>
              <strong>{money(markets.TOTALE.purchaseValue)}</strong>
            </div>
            <div className="card">
              <div className="admin-summary-label">MEDIA</div>
              <strong>{money(valoreMedioAcquisto)}</strong>
            </div>

            <div className="card">
              <div className="admin-summary-label">QT VND</div>
              <strong>{markets.TOTALE.sold}</strong>
            </div>
            <div className="card">
              <div className="admin-summary-label">VALORE</div>
              <strong>{money(markets.TOTALE.revenue)}</strong>
            </div>
            <div className="card">
              <div className="admin-summary-label">MARGINE</div>
              <strong>{money(markets.TOTALE.margin)}</strong>
            </div>
          </div>
        </section>

        {/* 2. SITUAZIONE CLIENTI */}
        <section className="panel">
          <h2>Situazione clienti</h2>

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
                      {row.firstName} {row.lastName} · <a className="dashboard-action-link" href={`/admin/clienti/${row.customerId}`}>{row.customerCode}</a>
                    </div>
                    <div className="admin-analysis-grid admin-client-analysis-grid">
                      <div><span>Saldo</span><strong>{money(row.debtRemaining)}</strong></div>
                      <div><span>In Stock</span><strong>{row.stockUnits}</strong></div>
                      <div><span>In Arrivo</span><strong>{row.incomingUnits}</strong></div>
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
                      {row.firstName} {row.lastName} · <a className="dashboard-action-link" href={`/admin/clienti/${row.customerId}`}>{row.customerCode}</a>
                    </div>
                    <div className="admin-analysis-grid admin-client-analysis-grid">
                      <div><span>Saldo</span><strong>{money(0)}</strong></div>
                      <div><span>In Stock</span><strong>{row.stockUnits}</strong></div>
                      <div><span>In Arrivo</span><strong>{row.incomingUnits}</strong></div>
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
                      {row.firstName} {row.lastName} · <a className="dashboard-action-link" href={`/admin/clienti/${row.customerId}`}>{row.customerCode}</a>
                    </div>
                    <div className="admin-analysis-grid admin-client-analysis-grid">
                      <div><span>Saldo</span><strong>{money(row.debtRemaining)}</strong></div>
                      <div><span>In Stock</span><strong>{row.stockUnits}</strong></div>
                      <div><span>In Arrivo</span><strong>{row.incomingUnits}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 3. ANALISI COMPLESSIVA + PROVENIENZA */}
        <section className="panel">
          <h2>Analisi complessiva + per provenienza</h2>

          <div className="admin-analysis-list">
            <div className="admin-analysis-row">
              <div className="admin-analysis-title">Analisi complessiva</div>
              <div className="admin-analysis-grid admin-analysis-grid-8">
                <div><span>Acquistati</span><strong>{markets.TOTALE.purchased}</strong></div><div><span>Valore acquistato</span><strong>{money(markets.TOTALE.purchaseValue)}</strong></div>
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
                <div className="admin-analysis-grid admin-analysis-grid-8">
                  <div><span>Acquistati</span><strong>{market.purchased}</strong></div><div><span>Valore acquistato</span><strong>{money(market.purchaseValue)}</strong></div>
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
