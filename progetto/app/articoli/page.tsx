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

  const { data: articleRows, error: articlesError } = await supabase.rpc('customer_article_list', { p_search: search })

  if (articlesError) {
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

  const rows = (articleRows || []) as any[]
  const activeArticles = rows.filter((row) =>
    (row.article_status === 'IN_ARRIVO' || row.article_status === 'IN_STOCK') && Number(row.shipped_quantity || 0) <= 0
  )
  const shippedArticles = rows.filter((row) => Number(row.shipped_quantity || 0) > 0)

  const articleCard = (row: any, shipped = false) => {

    return (
      <article className="movement" key={`${shipped ? 'shipped-' : ''}${row.article_id}`}>
        <div className="article-main">
          <div className="article-title-row">
            <strong>{row.article_code || 'Codice non disponibile'}</strong>
            {row.photo_url && (
              <a href={row.photo_url} target="_blank" rel="noreferrer" className="article-photo-link" title="Visualizza foto">📷</a>
            )}
          </div>
          {row.series && <span><b>Serie:</b> {row.series}</span>}
          {row.detail && <span><b>Descrizione:</b> {row.detail}</span>}
          {row.origin && <span><b>Provenienza:</b> {row.origin}</span>}
          <span><b>Data acquisto:</b> {date(row.purchase_date)}</span>
          {row.article_notes && <span><b>Note:</b> {row.article_notes}</span>}
        </div>

        <div className="article-customer-meta">
          <span><b>Valore:</b> {row.latest_unit_price_eur != null ? money(Number(row.latest_unit_price_eur)) : '—'}</span>
          <span><b>Stato:</b> {shipped ? 'SPEDITO' : row.article_status === 'IN_ARRIVO' ? 'IN ARRIVO' : 'IN STOCK'}</span>
          <span><b>Quantità:</b> {Number(row.quantity_assigned || 0)}</span>
          {shipped && (
            <span><b>Spedizione:</b> {row.shipment_code || '—'} · quantità {Number(row.shipped_quantity || 0)}</span>
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
