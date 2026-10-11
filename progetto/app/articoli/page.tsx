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


export default async function ArticoliPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const search = params.search?.trim() || ''

  const { data: profile } = await supabase
    .from('profiles')
    .select('mailbox_id,customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let resolvedMailboxId = profile?.mailbox_id || null
  if (!resolvedMailboxId && profile?.customer_id) {
    const { data: fallbackMailbox } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('customer_id', profile.customer_id)
      .maybeSingle()
    resolvedMailboxId = fallbackMailbox?.id || null
  }

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

  if (!resolvedMailboxId) {
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

  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from('article_assignments')
    .select('id,article_id,quantity_assigned,status,assigned_at,notes')
    .eq('mailbox_id', resolvedMailboxId)
    .in('status', ['ATTIVA', 'IN_BOX', 'SPEDITO'])

  const articleIds = [...new Set((assignmentRows || []).map((row) => row.article_id).filter(Boolean))]

  const { data: articleRows, error: articlesError } = articleIds.length
    ? await supabase
        .from('articles')
        .select('id,article_code,photo_url,purchase_date,origin,series,detail,status,notes')
        .in('id', articleIds)
    : { data: [], error: null }

  const { data: movementRows, error: movementsError } = await supabase
      .from('movements')
      .select('article_id,unit_price_eur,movement_at')
      .eq('mailbox_id', resolvedMailboxId)
      .eq('movement_type', 'VENDITA')
      .order('movement_at', { ascending: false })
      .order('id', { ascending: false })

  if (assignmentsError || articlesError || movementsError) {
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

  const articleMap = new Map((articleRows || []).map((article) => [article.id, article]))
  const latestPriceMap = new Map<string, number>()
  for (const movement of movementRows || []) {
    if (!movement.article_id || latestPriceMap.has(movement.article_id)) continue
    latestPriceMap.set(movement.article_id, Number(movement.unit_price_eur || 0))
  }


  const rows = (assignmentRows || []).map((assignment) => {
    const article = articleMap.get(assignment.article_id)
    const shipped = assignment.status === 'SPEDITO'
    return {
      article_id: assignment.article_id,
      assignment_id: assignment.id,
      quantity_assigned: assignment.quantity_assigned,
      assigned_at: assignment.assigned_at,
      assignment_notes: assignment.notes,
      assignment_status: assignment.status || 'ATTIVA',
      article_code: article?.article_code || null,
      photo_url: article?.photo_url || null,
      purchase_date: article?.purchase_date || null,
      origin: article?.origin || null,
      series: article?.series || null,
      detail: article?.detail || null,
      article_status: article?.status || null,
      article_notes: article?.notes || null,
      latest_unit_price_eur: latestPriceMap.get(assignment.article_id) ?? null,
      shipped_quantity: shipped ? Number(assignment.quantity_assigned || 0) : 0,
      shipment_code: null,
      shipment_id: null,
      shipment_status: null,
    }
  }).filter((row) => {
    if (!search) return true
    const value = `${row.article_code || ''} ${row.series || ''} ${row.detail || ''} ${row.origin || ''}`.toLowerCase()
    return value.includes(search.toLowerCase())
  })

  const activeArticles = rows.filter((row) => Number(row.shipped_quantity || 0) <= 0)
  const shippedArticles = rows.filter((row) => Number(row.shipped_quantity || 0) > 0)

  const articleCard = (row: any, shipped = false) => {

    return (
      <article className="movement client-article-row" key={`${shipped ? 'shipped-' : ''}${row.article_id}`}>
        <div className="client-article-photo-column">
          {row.photo_url ? (
            <a href={row.photo_url} target="_blank" rel="noreferrer" className="client-article-photo-preview" aria-label={`Apri foto articolo ${row.article_code || ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.photo_url} alt={`Anteprima ${row.article_code || 'articolo'}`} loading="lazy" decoding="async" />
            </a>
          ) : (
            <div className="client-article-photo-preview client-article-photo-empty" aria-hidden="true" />
          )}
        </div>

        <div className="article-main">
          <div className="article-title-row">
            <strong>{row.article_code || 'Codice non disponibile'}</strong>
          </div>
          {row.series && <span><b>Serie:</b> {row.series}</span>}
          {row.detail && <span><b>Descrizione:</b> {row.detail}</span>}
          {row.origin && <span><b>Provenienza:</b> {row.origin}</span>}
          <span><b>Data acquisto:</b> {date(row.purchase_date)}</span>
          {row.article_notes && <span><b>Note:</b> {row.article_notes}</span>}
        </div>

        <div className="article-customer-meta">
          <span><b>Valore:</b> {row.latest_unit_price_eur != null ? money(Number(row.latest_unit_price_eur)) : '—'}</span>
          <span><b>Stato articolo:</b> {shipped ? 'SPEDITO' : row.article_status === 'IN_ARRIVO' ? 'IN ARRIVO' : 'IN STOCK'}</span>
          {!shipped && row.assignment_status === 'IN_BOX' && <span><b>Gestione:</b> IN BOX</span>}
          <span><b>Quantità:</b> {Number(row.quantity_assigned || 0)}</span>
          {shipped && (
            <span><b>Quantità spedita:</b> {Number(row.shipped_quantity || 0)}</span>
          )}
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
              <p className="muted">Articoli contrassegnati come SPEDITO nel registro articoli.</p>
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
