import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import Navigation from '../../../../components/navigation'
import ArticleArchiveTable from '../../../../components/article-archive-table'

type Props = { searchParams: Promise<{ search?: string; message?: string; error?: string }> }

export default async function ArchivioArticoliPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const params = await searchParams
  const search = (params.search || '').trim()
  const message = params.message || ''
  const routeError = params.error || ''
  let query = supabase.from('articles').select('id,article_code,purchase_date,origin,series,detail,quantity_purchased,unit_price_foreign,currency,total_cost_eur,unit_cost_eur,photo_url,status,created_at').order('purchase_date', { ascending: false })
  if (search) {
    const safe = search.replace(/[%_]/g, '\\$&')
    query = query.or(`article_code.ilike.%${safe}%,series.ilike.%${safe}%,detail.ilike.%${safe}%,origin.ilike.%${safe}%`)
  }
  const { data: articles, error } = await query
  const { data: movements } = await supabase.from('movements').select('article_id,quantity,total_amount_eur,generic_customer_name').eq('movement_type', 'VENDITA')

  const salesByArticle = new Map<string, { quantity: number; revenue: number; customers: Set<string> }>()
  for (const movement of movements || []) {
    if (!movement.article_id) continue
    const current = salesByArticle.get(movement.article_id) || { quantity: 0, revenue: 0, customers: new Set<string>() }
    current.quantity += Number(movement.quantity || 0)
    current.revenue += Number(movement.total_amount_eur || 0)
    if (movement.generic_customer_name) current.customers.add(String(movement.generic_customer_name))
    salesByArticle.set(movement.article_id, current)
  }

  const rows = (articles || []).map((article: any) => {
    const sales = salesByArticle.get(article.id) || { quantity: 0, revenue: 0, customers: new Set<string>() }
    return { ...article, sold_quantity: sales.quantity, sales_revenue: sales.revenue, remaining_quantity: Math.max(0, Number(article.quantity_purchased || 0) - sales.quantity), customer_codes: Array.from(sales.customers) }
  })

  return <div className="app-shell">
    <Navigation role="AMMINISTRATORE" active="/admin/articoli/archivio" displayName={profile?.display_name} email={user.email} />
    <main className="main-content">
      <div className="page-heading"><div><p className="eyebrow">ARTICOLI</p><h1>Archivio articoli</h1><p className="page-subtitle">Ricerca e consultazione degli articoli registrati.</p></div><a className="back-button" href="/admin/articoli/nuovo">+ Nuovo articolo</a></div>
      {routeError ? <section className="panel"><p className="error">{routeError}</p></section> : null}{message ? <section className="panel"><p className="success">{message}</p></section> : null}{error ? <section className="panel"><p className="error">Impossibile caricare gli articoli: {error.message}</p></section> : <ArticleArchiveTable rows={rows} initialSearch={search} />}
    </main>
  </div>
}
