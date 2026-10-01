import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

const date = (value: string | null) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(value))
}

type Props = { searchParams: Promise<{ search?: string }> }

type Article = {
  id: string
  article_code: string | null
  photo_url: string | null
  purchase_date: string | null
  origin: string | null
  series: string | null
  detail: string | null
  status: string | null
  notes: string | null
}

type Assignment = {
  article_id: string
  quantity_assigned: number | null
  status: string | null
  assigned_at: string | null
  notes: string | null
}

type Movement = {
  article_id: string | null
  unit_price_eur: number | null
  movement_at: string | null
}

type ShipmentItem = {
  article_id: string | null
  quantity_shipped: number | null
  shipment: {
    id: string
    shipment_code: string | null
    status: string | null
  } | null
}

export default async function ArticoliPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const search = params.search?.trim() || ''

  const { data: profile } = await supabase
    .from('profiles')
    .select('mailbox_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const renderHeader = () => (
    <header className="topbar">
      <div>
        <p className="eyebrow">AREA CLIENTE</p>
        <h1>Articoli</h1>
        <p className="muted">Articoli acquistati e assegnati al tuo account.</p>
      </div>
      <WhatsAppContact />
    </header>
  )

  if (!profile?.mailbox_id) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/articoli" email={user.email} />
        <section className="content">
          {renderHeader()}
          <section className="panel"><div className="empty">Nessuna casella associata al cliente.</div></section>
        </section>
      </main>
    )
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from('article_assignments')
    .select('article_id,quantity_assigned,status,assigned_at,notes')
    .eq('mailbox_id', profile.mailbox_id)
    .eq('status', 'ATTIVA')

  if (assignmentsError) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/articoli" email={user.email} />
        <section className="content">
          {renderHeader()}
          <section className="panel"><div className="empty">Impossibile caricare gli articoli.</div></section>
        </section>
      </main>
    )
  }

  const safeAssignments = (assignments || []) as Assignment[]
  const articleIds = safeAssignments.map((item) => item.article_id)

  let articles: Article[] = []
  let movements: Movement[] = []
  let shipmentItems: ShipmentItem[] = []

  if (articleIds.length) {
    let articleQuery = supabase
      .from('articles')
      .select('id,article_code,photo_url,purchase_date,origin,series,detail,status,notes')
      .in('id', articleIds)
      .order('purchase_date', { ascending: false })

    if (search) {
      const safe = search.replace(/[%_]/g, '\\$&')
      articleQuery = articleQuery.or([
        `article_code.ilike.%${safe}%`,
        `series.ilike.%${safe}%`,
        `detail.ilike.%${safe}%`,
        `origin.ilike.%${safe}%`,
      ].join(','))
    }

    const [articleResult, movementResult, shipmentResult] = await Promise.all([
      articleQuery,
      supabase
        .from('movements')
        .select('article_id,unit_price_eur,movement_at')
        .eq('mailbox_id', profile.mailbox_id)
        .eq('movement_type', 'VENDITA')
        .in('article_id', articleIds),
      supabase
        .from('shipment_items')
        .select('article_id,quantity_shipped,shipments(id,shipment_code,status)')
        .eq('mailbox_id', profile.mailbox_id)
        .in('article_id', articleIds),
    ])

    if (articleResult.error) {
      return (
        <main className="shell">
          <Navigation role="CLIENTE" active="/articoli" email={user.email} />
          <section className="content">
            {renderHeader()}
            <section className="panel"><div className="empty">Impossibile caricare gli articoli.</div></section>
          </section>
        </main>
      )
    }

    articles = (articleResult.data || []) as Article[]
    movements = (movementResult.data || []) as Movement[]
    shipmentItems = ((shipmentResult.data || []) as any[]).map((item) => ({
      article_id: item.article_id,
      quantity_shipped: item.quantity_shipped,
      shipment: Array.isArray(item.shipments) ? item.shipments[0] || null : item.shipments || null,
    }))
  }

  const assignmentByArticle = new Map(safeAssignments.map((item) => [item.article_id, item]))
  const latestValueByArticle = new Map<string, number>()
  for (const movement of movements) {
    if (!movement.article_id || movement.unit_price_eur == null) continue
    const current = latestValueByArticle.get(movement.article_id)
    if (!current || new Date(movement.movement_at || 0).getTime() >= 0) {
      const existingMovement = movements
        .filter((m) => m.article_id === movement.article_id && m.unit_price_eur != null)
        .sort((a, b) => new Date(b.movement_at || 0).getTime() - new Date(a.movement_at || 0).getTime())[0]
      if (existingMovement?.unit_price_eur != null) latestValueByArticle.set(movement.article_id, Number(existingMovement.unit_price_eur))
    }
  }

  const shippedByArticle = new Map<string, ShipmentItem[]>()
  for (const item of shipmentItems) {
    if (!item.article_id) continue
    const list = shippedByArticle.get(item.article_id) || []
    list.push(item)
    shippedByArticle.set(item.article_id, list)
  }

  const activeArticles = articles.filter((article) => (article.status === 'IN_ARRIVO' || article.status === 'IN_STOCK') && !(shippedByArticle.get(article.id) || []).length)
  const shippedArticles = articles.filter((article) => (shippedByArticle.get(article.id) || []).length > 0)

  const articleCard = (article: Article, shipped = false) => {
    const assignment = assignmentByArticle.get(article.id)
    const value = latestValueByArticle.get(article.id)
    const shipmentList = shippedByArticle.get(article.id) || []

    return (
      <article className="movement" key={`${shipped ? 'shipped-' : ''}${article.id}`}>
        <div className="article-main">
          <div className="article-title-row">
            <strong>{article.article_code || 'Codice non disponibile'}</strong>
            {article.photo_url && (
              <a href={article.photo_url} target="_blank" rel="noreferrer" className="article-photo-link" title="Visualizza foto">📷</a>
            )}
          </div>
          {article.series && <span><b>Serie:</b> {article.series}</span>}
          {article.detail && <span><b>Descrizione:</b> {article.detail}</span>}
          {article.origin && <span><b>Provenienza:</b> {article.origin}</span>}
          <span><b>Data acquisto:</b> {date(article.purchase_date)}</span>
          {article.notes && <span><b>Note:</b> {article.notes}</span>}
        </div>

        <div className="article-customer-meta">
          <span><b>Valore:</b> {value != null ? money(value) : '—'}</span>
          <span><b>Stato:</b> {shipped ? 'SPEDITO' : article.status === 'IN_ARRIVO' ? 'IN ARRIVO' : 'IN STOCK'}</span>
          <span><b>Quantità:</b> {Number(assignment?.quantity_assigned || 0)}</span>
          {shipped && shipmentList.map((item, index) => (
            <span key={`${item.shipment?.id || article.id}-${index}`}>
              <b>Spedizione:</b> {item.shipment?.shipment_code || '—'} · quantità {Number(item.quantity_shipped || 0)}
            </span>
          ))}
        </div>
      </article>
    )
  }

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/articoli" email={user.email} />
      <section className="content">
        {renderHeader()}

        <section className="panel">
          <h2>Ricerca articoli</h2>
          <form action="/articoli" method="get" className="form">
            <label>
              Cerca per codice, serie, descrizione o provenienza
              <input type="search" name="search" defaultValue={search} placeholder="Cerca articolo..." />
            </label>
            <button type="submit">Cerca</button>
            {search && <a href="/articoli" className="back-button">Azzera ricerca</a>}
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Articoli acquistati</h2>
              <p className="muted">{activeArticles.length} articoli in arrivo o in stock</p>
            </div>
          </div>
          {activeArticles.length === 0 ? (
            <div className="empty">Nessun articolo in arrivo o in stock.</div>
          ) : (
            <div className="movement-list">{activeArticles.map((article) => articleCard(article))}</div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Articoli spediti</h2>
              <p className="muted">Articoli già spediti, con codice della spedizione.</p>
            </div>
          </div>
          {shippedArticles.length === 0 ? (
            <div className="empty">Nessun articolo spedito.</div>
          ) : (
            <div className="movement-list">{shippedArticles.map((article) => articleCard(article, true))}</div>
          )}
        </section>
      </section>
    </main>
  )
}
