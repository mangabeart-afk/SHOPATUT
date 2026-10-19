import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import AdminCustomerSituation from '../../components/admin-customer-situation'
import AdminDashboardCacheWriter from '../../components/admin-dashboard-cache-writer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function fetchAllRows<T>(queryForRange: (from: number, to: number) => any): Promise<{ data: T[]; error: any }> {
  const rows: T[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryForRange(from, from + pageSize - 1)
    if (error) return { data: [], error }
    const batch = (data || []) as T[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return { data: rows, error: null }
}

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

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
  balanceRemaining: number
  stockUnits: number
  boxUnits: number
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
    balanceMovementsResult,
    cancelledSalesResult,
    paymentsResult,
    creditsResult,
    assignmentsResult,
  ] = await Promise.all([
    fetchAllRows<any>((from, to) => supabase.from('customers').select('id,customer_code,first_name,last_name,email,phone,notes').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('mailboxes').select('id,customer_id').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('articles').select('id,import_sheet,origin,status,quantity_purchased,unit_cost_eur,total_cost_eur,legacy_quantity_sold,legacy_sales_revenue_eur').is('deleted_at', null).range(from, to)),
    // Carica tutti i movimenti che concorrono al saldo, non solo le vendite.
    // La dashboard deve conteggiare anche altri addebiti e rettifiche contabili.
    fetchAllRows<any>((from, to) => supabase.from('movements')
      .select('id,mailbox_id,article_id,quantity,total_amount_eur,unit_price_eur,movement_type')
      .in('movement_type', ['VENDITA', 'ALTRO', 'ARTICOLO', 'SPEDIZIONE', 'MODIFICA', 'STORNO'])
      .range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('movements').select('reference_id').eq('movement_type','ANNULLAMENTO').not('reference_id','is',null).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('payments').select('mailbox_id,amount_eur,status').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('credits').select('mailbox_id,amount_eur,used_amount_eur,status').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('article_assignments').select('article_id,mailbox_id,quantity_assigned,status').in('status',['IN_BOX','IN_ARRIVO','IN_STOCK']).range(from, to)),
  ])

  const queryErrors = [
    customersResult.error,
    mailboxesResult.error,
    articlesResult.error,
    balanceMovementsResult.error,
    cancelledSalesResult.error,
    paymentsResult.error,
    creditsResult.error,
    assignmentsResult.error,
  ].filter(Boolean)

  if (queryErrors.length > 0) {
    throw new Error(queryErrors.map((error) => error?.message).filter(Boolean).join(' | '))
  }

  const articles = (articlesResult.data || []) as any[]
  const cancelledSaleIds = new Set(((cancelledSalesResult.data || []) as any[]).map((row) => row.reference_id).filter(Boolean))
  // Tutti gli addebiti/rettifiche non annullati per il calcolo dei saldi.
  // Il movimento di pagamento e il credito sono già gestiti dalle rispettive tabelle.
  const balanceMovements = ((balanceMovementsResult.data || []) as any[]).filter(
    (movement) => !cancelledSaleIds.has(movement.id)
  )
  // Le statistiche di quantità, ricavo e margine restano limitate alle vendite.
  const sales = balanceMovements.filter(
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

  // Calcola il residuo per singolo articolo, quindi somma i residui positivi.
  // Le vendite storiche sono in legacy_quantity_sold; le vendite successive
  // sono aggregate dai movimenti VENDITA collegati a un article_id.
  const soldQuantityByArticle = new Map<string, number>()
  for (const sale of sales) {
    if (!sale.article_id) continue
    const quantity = Number(sale.quantity || 0)
    soldQuantityByArticle.set(
      sale.article_id,
      (soldQuantityByArticle.get(sale.article_id) || 0) + quantity
    )
  }
  const residuoQuantita = articles.reduce((sum, article) => {
    const purchased = Number(article.quantity_purchased || 0)
    const legacySold = Number(article.legacy_quantity_sold || 0)
    const movementSold = soldQuantityByArticle.get(article.id) || 0
    return sum + Math.max(0, purchased - legacySold - movementSold)
  }, 0)

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

  const debitsByMailbox = new Map<string, number>()
  for (const movement of balanceMovements) {
    if (!movement.mailbox_id) continue
    debitsByMailbox.set(
      movement.mailbox_id,
      (debitsByMailbox.get(movement.mailbox_id) || 0) + Number(movement.total_amount_eur || 0)
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
    let box = 0
    let incoming = 0

    for (const assignment of mailboxAssignments) {
      const article = articleMap.get(assignment.article_id)
      if (!article) continue
      const quantity = Number(assignment.quantity_assigned || 0)
      // Gli indicatori logistici dipendono dallo stato dell'assegnazione alla casella,
      // non dallo stato globale dell'articolo in archivio.
      if (assignment.status === 'IN_STOCK') stock += quantity
      if (assignment.status === 'IN_BOX') box += quantity
      if (assignment.status === 'IN_ARRIVO') incoming += quantity
    }

    const rawDebtRemaining =
      (debitsByMailbox.get(mailbox.id) || 0) -
      (paymentsByMailbox.get(mailbox.id) || 0) -
      (creditsByMailbox.get(mailbox.id) || 0)
    // Arrotonda prima del raggruppamento: differenze sub-centesimali non devono
    // creare falsi positivi o spostare caselle tra le sezioni della dashboard.
    const roundedDebtRemaining = Math.round((rawDebtRemaining + Number.EPSILON) * 100) / 100
    const debtRemaining = Math.max(0, roundedDebtRemaining)

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
      balanceRemaining: roundedDebtRemaining,
      stockUnits: stock,
      boxUnits: box,
      incomingUnits: incoming,
    })
  }


  // Le schede rappresentano azioni operative e possono sovrapporsi:
  // saldo da incassare, articoli in arrivo, articoli già in box da spedire.
  const isZeroBalance = (value: number) => Math.abs(value) < 0.005
  const customersWithDebt = customerRows
    .filter((row) => row.debtRemaining >= 0.005)
    .sort((a, b) => b.debtRemaining - a.debtRemaining)

  const customersWithIncoming = customerRows
    .filter((row) => isZeroBalance(row.balanceRemaining) && row.incomingUnits > 0)
    .sort((a, b) => b.incomingUnits - a.incomingUnits || `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))

  // Caselle pronte per la spedizione: saldo esattamente a zero, nessun articolo
  // ancora in arrivo e almeno un articolo già in stock oppure in box.
  const customersToShip = customerRows
    .filter((row) => isZeroBalance(row.balanceRemaining) && row.incomingUnits === 0 && (row.stockUnits > 0 || row.boxUnits > 0))
    .sort((a, b) => b.boxUnits - a.boxUnits || `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))

  const totalDebtForAttention = customersWithDebt.reduce((sum, row) => sum + row.debtRemaining, 0)
  const incomingForDebt = customersWithDebt.reduce((sum, row) => sum + row.incomingUnits, 0)
  const totalIncomingForAll = customersWithIncoming.reduce((sum, row) => sum + row.incomingUnits, 0)
  const totalStockForShipping = customersToShip.reduce((sum, row) => sum + row.stockUnits, 0)
  const totalBoxForShipping = customersToShip.reduce((sum, row) => sum + row.boxUnits, 0)


  return (
    <main className="shell">
      <Navigation
        role="AMMINISTRATORE"
        active="/admin"
        displayName={profile?.display_name}
        email={user.email}
      />

      <section className="content">
        <AdminDashboardCacheWriter
          userId={user.id}
          snapshot={{
            purchased: markets.TOTALE.purchased,
            purchaseValue: markets.TOTALE.purchaseValue,
            incomingUnits,
            sold: markets.TOTALE.sold,
            revenue: markets.TOTALE.revenue,
            margin: markets.TOTALE.margin,
          }}
        />
        <header className="topbar">
          <div>
            <p className="eyebrow">AMMINISTRAZIONE</p>
            <h1>Dashboard amministratore</h1>
          </div>
        </header>

        {/* Riepilogo gestionale: esclusi CLIENTI, SALDO e MEDIA come richiesto. */}
        <section className="panel admin-overview-panel">
          <div className="admin-panel-heading">
            <div><p className="eyebrow">PANORAMICA</p><h2>Riepilogo gestionale</h2></div>
            <p className="muted">Valori aggiornati dai dati di archivio e dai movimenti registrati.</p>
          </div>

          <div className="grid admin-summary-grid admin-admin-kpi-grid">
            {/* Riga 1: acquisti e disponibilità in arrivo. */}
            <div className="card"><div className="admin-summary-label">QT ACQUISTATA</div><strong>{markets.TOTALE.purchased}</strong></div>
            <div className="card"><div className="admin-summary-label">VALORE ACQUISTI</div><strong>{money(markets.TOTALE.purchaseValue)}</strong></div>
            <div className="card"><div className="admin-summary-label">ARTICOLI IN ARRIVO</div><strong>{incomingUnits}</strong></div>
            {/* Riga 2: vendite e margine. */}
            <div className="card"><div className="admin-summary-label">QT VENDUTA</div><strong>{markets.TOTALE.sold}</strong></div>
            <div className="card"><div className="admin-summary-label">VALORE VENDITE</div><strong>{money(markets.TOTALE.revenue)}</strong></div>
            <div className="card"><div className="admin-summary-label">MARGINE LORDO</div><strong>{money(markets.TOTALE.margin)}</strong></div>
          </div>
        </section>

        {/* 2. SITUAZIONE CLIENTI: i gruppi partono chiusi e si espandono al tocco. */}
        <section className="panel admin-customer-situation-panel">
          <h2>Situazione utenti</h2>
          <AdminCustomerSituation groups={[
            {
              id: 'debt',
              title: 'Caselle da saldare',
              tone: 'debt',
              customers: customersWithDebt,
              count: customersWithDebt.length,
              mainLabel: 'TOTALE',
              mainValue: money(totalDebtForAttention),
              secondLabel: 'IN ARRIVO',
              secondValue: String(incomingForDebt),
            },
            {
              id: 'incoming',
              title: 'Caselle in arrivo',
              tone: 'incoming',
              customers: customersWithIncoming,
              count: customersWithIncoming.length,
              mainLabel: 'IN ARRIVO',
              mainValue: String(totalIncomingForAll),
            },
            {
              id: 'available',
              title: 'Caselle da spedire',
              tone: 'available',
              customers: customersToShip,
              count: customersToShip.length,
              mainLabel: 'IN STOCK',
              mainValue: String(totalStockForShipping),
              secondLabel: 'IN BOX',
              secondValue: String(totalBoxForShipping),
            },
          ]} />
        </section>
      </section>
    </main>
  )
}
