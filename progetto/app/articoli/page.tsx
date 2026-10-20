import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'
import OriginLabel from '../../components/origin-label'

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
  total_amount_eur: number | null
  quantity: number | null
  movement_at: string | null
  movement_type: string | null
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
        <p className="eyebrow">AREA UTENTE</p>
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
          <section className="panel"><div className="empty">Nessuna casella associata all’utente.</div></section>
        </section>
      </main>
    )
  }

  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from('article_assignments')
    .select('id,article_id,quantity_assigned,status,assigned_at,notes')
    .eq('mailbox_id', resolvedMailboxId)
    .in('status', ['ATTIVA', 'IN_ARRIVO', 'IN_STOCK', 'IN_BOX', 'SPEDITO'])

  const articleIds = [...new Set((assignmentRows || []).map((row) => row.article_id).filter(Boolean))]

  const { data: articleRows, error: articlesError } = articleIds.length
    ? await supabase
        .from('articles')
        .select('id,article_code,photo_url,purchase_date,origin,series,detail,status,notes')
        .in('id', articleIds)
    : { data: [], error: null }

  // Carica i prezzi di vendita solo per gli articoli assegnati a questa casella.
  // Evita di trasferire lo storico completo delle vendite dell'utente.
  const { data: movementRows, error: movementsError } = articleIds.length
    ? await supabase
        .from('movements')
        .select('article_id,unit_price_eur,total_amount_eur,quantity,movement_at,movement_type')
        .eq('mailbox_id', resolvedMailboxId)
        .in('movement_type', ['VENDITA', 'ARTICOLO'])
        .in('article_id', articleIds)
        .order('movement_at', { ascending: false })
        .order('id', { ascending: false })
    : { data: [], error: null }

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
  const fallbackArticlePriceMap = new Map<string, number>()
  for (const movement of movementRows || []) {
    if (!movement.article_id) continue
    const unitPrice = movement.unit_price_eur != null
      ? Number(movement.unit_price_eur)
      : (Number(movement.quantity || 0) > 0 ? Number(movement.total_amount_eur || 0) / Number(movement.quantity) : null)
    if (unitPrice == null) continue
    // I movimenti VENDITA sono la fonte primaria del prezzo di vendita.
    // Alcune vendite storiche riconciliate da Excel sono registrate come ARTICOLO:
    // usarle solo come ripiego evita di mostrare "—" per quelle assegnazioni.
    if (movement.movement_type === 'VENDITA' && !latestPriceMap.has(movement.article_id)) {
      latestPriceMap.set(movement.article_id, unitPrice)
    } else if (movement.movement_type === 'ARTICOLO' && !fallbackArticlePriceMap.has(movement.article_id)) {
      fallbackArticlePriceMap.set(movement.article_id, unitPrice)
    }
  }
  for (const [articleId, price] of fallbackArticlePriceMap) {
    if (!latestPriceMap.has(articleId)) latestPriceMap.set(articleId, price)
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
      sale_unit_price_eur: latestPriceMap.get(assignment.article_id) ?? null,
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

  const statusGroups = [
    { key: 'IN_ARRIVO', title: 'IN ARRIVO', rows: rows.filter((row) => row.assignment_status === 'IN_ARRIVO') },
    { key: 'IN_STOCK', title: 'IN STOCK', rows: rows.filter((row) => row.assignment_status === 'IN_STOCK') },
    { key: 'IN_BOX', title: 'IN BOX', rows: rows.filter((row) => row.assignment_status === 'IN_BOX') },
    { key: 'SPEDITO', title: 'SPEDITO', rows: rows.filter((row) => row.assignment_status === 'SPEDITO') },
    { key: 'ATTIVA', title: 'DA VERIFICARE', rows: rows.filter((row) => !['IN_ARRIVO', 'IN_STOCK', 'IN_BOX', 'SPEDITO'].includes(row.assignment_status)) },
  ].filter((group) => group.rows.length > 0)

  const articleCard = (row: any, shipped = false) => {

    return (
      <article className="movement client-article-row" key={row.assignment_id}>
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
          {row.series?.trim().toUpperCase() === 'BUSTE WR'
            ? <span><b>Nota:</b> {row.detail || '21 unità'}</span>
            : row.detail && <span><b>Descrizione:</b> {row.detail}</span>}
          {row.origin && <span><b>Provenienza:</b> <OriginLabel value={row.origin} /></span>}
          <span><b>Data acquisto:</b> {date(row.purchase_date)}</span>
        </div>

        <div className="article-customer-meta">
          <span><b>Prezzo di vendita:</b> {row.sale_unit_price_eur != null ? money(Number(row.sale_unit_price_eur)) : '—'}</span>
          <span><b>Stato:</b> {row.assignment_status === 'SPEDITO' ? 'SPEDITO' : row.assignment_status === 'IN_ARRIVO' ? 'IN ARRIVO' : row.assignment_status === 'IN_STOCK' ? 'IN STOCK' : row.assignment_status === 'IN_BOX' ? 'IN BOX' : 'DA VERIFICARE'}</span>
          <span><b>{row.series?.trim().toUpperCase() === 'BUSTE WR' ? 'Q.tà' : 'Quantità'}:</b> {Number(row.quantity_assigned || 0)}</span>
          {shipped && row.series?.trim().toUpperCase() !== 'BUSTE WR' && (
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

        {statusGroups.length === 0 ? (
          <section className="panel"><div className="empty">Nessun articolo assegnato alla tua casella.</div></section>
        ) : statusGroups.map((group) => (
          <section className={`panel client-article-status-section status-${group.key.toLowerCase()}`} key={group.key}>
            <div className="section-heading client-article-status-heading">
              <h2>{group.title}</h2>
              <strong>{group.rows.reduce((sum, row) => sum + Number(row.quantity_assigned || 0), 0)}</strong>
            </div>
            <div className="movement-list">{group.rows.map((article) => articleCard(article, group.key === 'SPEDITO'))}</div>
          </section>
        ))}
      </section>
    </main>
  )
}
