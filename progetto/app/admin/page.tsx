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
  purchaseValue: 0,
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

  const [dashboardResult, customerSummaryResult] = await Promise.all([
    supabase.rpc('admin_dashboard_summary'),
    supabase.rpc('admin_customer_summary'),
  ])

  if (dashboardResult.error) throw new Error(dashboardResult.error.message)
  if (customerSummaryResult.error) throw new Error(customerSummaryResult.error.message)

  const dashboardRows = (dashboardResult.data || []) as any[]
  const summaryRow = dashboardRows.find((row) => row.section === 'SUMMARY')
  const totalRow = dashboardRows.find((row) => row.section === 'TOTAL')

  const markets = {
    TOTALE: emptyStats(),
    GIAPPONE: emptyStats(),
    VIETNAM: emptyStats(),
    EUROPA: emptyStats(),
  }

  const applyStats = (target: MarketStats, row: any) => {
    target.purchased = Number(row.purchased || 0)
    target.purchaseValue = Number(row.purchase_value || 0)
    target.sold = Number(row.sold || 0)
    target.available = Number(row.available || 0)
    target.revenue = Number(row.revenue || 0)
    target.costOfSold = Number(row.cost_of_sold || 0)
    target.margin = target.revenue - target.costOfSold
    target.marginPercent = target.revenue > 0 ? (target.margin / target.revenue) * 100 : 0
  }

  applyStats(markets.TOTALE, totalRow || {})
  for (const row of dashboardRows.filter((item) => item.section === 'ORIGIN')) {
    if (row.origin === 'GIAPPONE') applyStats(markets.GIAPPONE, row)
    if (row.origin === 'VIETNAM') applyStats(markets.VIETNAM, row)
    if (row.origin === 'EUROPA') applyStats(markets.EUROPA, row)
  }

  const paymentsTotal = Number(summaryRow?.payments_total || 0)
  const creditsRemaining = Number(summaryRow?.credits_remaining || 0)
  const stockUnits = Number(summaryRow?.stock_units || 0)
  const incomingUnits = Number(summaryRow?.incoming_units || 0)
  const customers = (customerSummaryResult.data || []) as any[]
  const customerRows: CustomerRow[] = customers.map((row) => ({
    customerId: row.customer_id,
    customerCode: row.customer_code || row.mailbox_code || '—',
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.email || null,
    phone: row.phone || null,
    notes: row.notes || null,
    mailboxId: row.mailbox_id || null,
    mailboxCode: row.mailbox_code || null,
    debtRemaining: Number(row.balance || 0),
    stockUnits: Number(row.stock || 0),
    incomingUnits: Number(row.incoming || 0),
  }))

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
              <div className="muted">Clienti</div>
              <strong>{Number(summaryRow?.customer_count || customers.length)}</strong>
            </div>
            <div className="card">
              <div className="muted">Articoli</div>
              <strong>{markets.TOTALE.purchased}</strong>
            </div>
            <div className="card">
              <div className="muted">IN ARRIVO</div>
              <strong>{incomingUnits}</strong>
            </div>
            <div className="card">
              <div className="muted">IN STOCK</div>
              <strong>{stockUnits}</strong>
            </div>
            <div className="card">
              <div className="muted">Pagamenti</div>
              <strong>{money(paymentsTotal)}</strong>
            </div>
            <div className="card">
              <div className="muted">Crediti residui</div>
              <strong>{money(creditsRemaining)}</strong>
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
