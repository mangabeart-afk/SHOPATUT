import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

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

const money = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0)
const percent = (n: number) => `${n.toFixed(1)}%`

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
const emptyStats = (): MarketStats => ({ purchased: 0, purchaseValue: 0, sold: 0, inventorySold: 0, available: 0, revenue: 0, costOfSold: 0, margin: 0, marginPercent: 0 })

type ArticleRow = {
  id: string
  origin: string | null
  quantity_purchased: number | null
  total_cost_eur: number | null
  unit_cost_eur: number | null
  legacy_quantity_sold: number | null
  legacy_sales_revenue_eur: number | null
}
type MovementRow = {
  id: string
  article_id: string | null
  quantity: number | null
  total_amount_eur: number | null
  unit_price_eur: number | null
  movement_type: string | null
}

export default async function AdminAnalisiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const [articlesResult, movementsResult, cancelledResult] = await Promise.all([
    fetchAllRows<ArticleRow>((from, to) => supabase.from('articles').select('id,origin,quantity_purchased,total_cost_eur,unit_cost_eur,legacy_quantity_sold,legacy_sales_revenue_eur').is('deleted_at', null).range(from, to)),
    fetchAllRows<MovementRow>((from, to) => supabase.from('movements').select('id,article_id,quantity,total_amount_eur,unit_price_eur,movement_type').or('movement_type.eq.VENDITA,movement_type.is.null').range(from, to)),
    fetchAllRows<{ reference_id: string | null }>((from, to) => supabase.from('movements').select('reference_id').eq('movement_type', 'ANNULLAMENTO').not('reference_id', 'is', null).range(from, to)),
  ])
  if (articlesResult.error || movementsResult.error || cancelledResult.error) {
    throw new Error(articlesResult.error?.message || movementsResult.error?.message || cancelledResult.error?.message || 'Impossibile caricare i dati di analisi.')
  }

  const articles = (articlesResult.data || []) as ArticleRow[]
  const cancelledIds = new Set((cancelledResult.data || []).map((row) => row.reference_id).filter(Boolean))
  const sales = ((movementsResult.data || []) as MovementRow[]).filter((row) => !cancelledIds.has(row.id))
  const articleMap = new Map(articles.map((article) => [article.id, article]))
  const markets = { TOTALE: emptyStats(), GIAPPONE: emptyStats(), VIETNAM: emptyStats(), EUROPA: emptyStats() }
  const getMarket = (origin: string | null | undefined) => {
    const value = (origin || '').trim().toUpperCase()
    if (value.includes('GIAPPONE') || value === 'JAP') return markets.GIAPPONE
    if (value.includes('VIETNAM') || value === 'VIET') return markets.VIETNAM
    if (value.includes('EUROPA') || value === 'EU') return markets.EUROPA
    return null
  }

  for (const article of articles) {
    const purchased = Number(article.quantity_purchased || 0)
    const legacySold = Number(article.legacy_quantity_sold || 0)
    const legacyRevenue = Number(article.legacy_sales_revenue_eur || 0)
    const legacyCost = legacySold * Number(article.unit_cost_eur || 0)
    markets.TOTALE.purchased += purchased
    markets.TOTALE.purchaseValue += Number(article.total_cost_eur || 0)
    markets.TOTALE.sold += legacySold
    markets.TOTALE.inventorySold += legacySold
    markets.TOTALE.revenue += legacyRevenue
    markets.TOTALE.costOfSold += legacyCost
    const market = getMarket(article.origin)
    if (market) {
      market.purchased += purchased
      market.purchaseValue += Number(article.total_cost_eur || 0)
      market.sold += legacySold
      market.inventorySold += legacySold
      market.revenue += legacyRevenue
      market.costOfSold += legacyCost
    }
  }

  for (const sale of sales) {
    const quantity = Number(sale.quantity || 0)
    const storedRevenue = Number(sale.total_amount_eur || 0)
    const revenue = storedRevenue !== 0 ? storedRevenue : quantity * Number(sale.unit_price_eur || 0)
    const article = sale.article_id ? articleMap.get(sale.article_id) : null
    const cost = quantity * Number(article?.unit_cost_eur || 0)
    markets.TOTALE.sold += quantity
    markets.TOTALE.revenue += revenue
    markets.TOTALE.costOfSold += cost
    if (article) markets.TOTALE.inventorySold += quantity
    const market = getMarket(article?.origin)
    if (market) {
      market.sold += quantity
      market.revenue += revenue
      market.costOfSold += cost
      if (article) market.inventorySold += quantity
    }
  }

  for (const market of Object.values(markets)) {
    market.available = Math.max(0, market.purchased - market.inventorySold)
    market.margin = market.revenue - market.costOfSold
    market.marginPercent = market.revenue > 0 ? (market.margin / market.revenue) * 100 : 0
  }

  const marketRows = [
    ['🇯🇵 Giappone', markets.GIAPPONE],
    ['🇻🇳 Vietnam', markets.VIETNAM],
    ['🇪🇺 Europa', markets.EUROPA],
  ] as const

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin/analisi" displayName={profile?.display_name} email={user.email} />
      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Analisi</h1><p className="muted">Riepilogo gestionale, margini e provenienza degli articoli.</p></div>
        </header>
        <section className="panel">
          <h2>Analisi complessiva</h2>
          <div className="admin-analysis-list">
            <div className="admin-analysis-row">
              <div className="admin-analysis-title">Totale complessivo</div>
              <div className="admin-analysis-grid admin-analysis-grid-8">
                <div><span>Acquistati</span><strong>{markets.TOTALE.purchased}</strong></div>
                <div><span>Valore acquistato</span><strong>{money(markets.TOTALE.purchaseValue)}</strong></div>
                <div><span>Venduti</span><strong>{markets.TOTALE.sold}</strong></div>
                <div><span>Disponibili</span><strong>{markets.TOTALE.available}</strong></div>
                <div><span>Ricavi</span><strong>{money(markets.TOTALE.revenue)}</strong></div>
                <div><span>Costo venduto</span><strong>{money(markets.TOTALE.costOfSold)}</strong></div>
                <div><span>Margine</span><strong>{money(markets.TOTALE.margin)}</strong></div>
                <div><span>Margine %</span><strong>{percent(markets.TOTALE.marginPercent)}</strong></div>
              </div>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>Analisi per provenienza</h2>
          <div className="admin-analysis-list">
            {marketRows.map(([label, market]) => (
              <div className="admin-analysis-row" key={label}>
                <div className="admin-analysis-title">{label}</div>
                <div className="admin-analysis-grid admin-analysis-grid-8">
                  <div><span>Acquistati</span><strong>{market.purchased}</strong></div>
                  <div><span>Valore acquistato</span><strong>{money(market.purchaseValue)}</strong></div>
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
