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
    year: 'numeric',
  }).format(new Date(value))
}

type ArticoliPageProps = {
  searchParams: Promise<{
    search?: string
  }>
}

type Article = {
  id: string
  article_code: string | null
  photo_url: string | null
  purchase_date: string | null
  origin: string | null
  seller: string | null
  series: string | null
  detail: string | null
  quantity_purchased: number | null
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
  quantity: number | null
  movement_type: string | null
  unit_price_eur: number | null
  movement_at: string | null
}

type ShipmentItem = {
  article_id: string | null
  shipment_status: string | null
}

export default async function ArticoliPage({
  searchParams,
}: ArticoliPageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

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
        <p className="muted">
          Consulta gli articoli associati alla tua casella.
        </p>
      </div>
    <WhatsAppContact /></header>
  )

  if (!profile?.mailbox_id) {
    return (
      <main className="shell">
        <Navigation
          role="CLIENTE"
          active="/articoli"
          email={user.email}
        />

        <section className="content">
          {renderHeader()}

          <section className="panel">
            <h2>I miei articoli</h2>

            <div className="empty">
              Nessuna casella associata al cliente.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const { data: assignments, error: assignmentsError } =
    await supabase
      .from('article_assignments')
      .select(
        `
          article_id,
          quantity_assigned,
          status,
          assigned_at,
          notes
        `
      )
      .eq('mailbox_id', profile.mailbox_id)

  if (assignmentsError) {
    return (
      <main className="shell">
        <Navigation
          role="CLIENTE"
          active="/articoli"
          email={user.email}
        />

        <section className="content">
          {renderHeader()}

          <section className="panel">
            <h2>I miei articoli</h2>

            <div className="empty">
              Impossibile caricare gli articoli.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const safeAssignments = (assignments || []) as Assignment[]

  const articleIds = safeAssignments.map(
    (assignment) => assignment.article_id
  )

  let articles: Article[] = []
  let movements: Movement[] = []
  let shipmentItems: ShipmentItem[] = []

  if (articleIds.length > 0) {
    let articleQuery = supabase
      .from('articles')
      .select(
        `
          id,
          article_code,
          photo_url,
          purchase_date,
          origin,
          seller,
          series,
          detail,
          quantity_purchased,
          status,
          notes
        `
      )
      .in('id', articleIds)

    if (search) {
      const safeSearch = search.replace(/[%_]/g, '\\$&')

      articleQuery = articleQuery.or(
        [
          `article_code.ilike.%${safeSearch}%`,
          `series.ilike.%${safeSearch}%`,
          `detail.ilike.%${safeSearch}%`,
          `seller.ilike.%${safeSearch}%`,
          `origin.ilike.%${safeSearch}%`,
        ].join(',')
      )
    }

    const [
      { data: articleData, error: articlesError },
      { data: movementData },
      { data: shipmentItemData },
    ] = await Promise.all([
      articleQuery.order('purchase_date', {
        ascending: false,
      }),

      supabase
        .from('movements')
        .select('article_id, quantity, movement_type, unit_price_eur, movement_at')
        .eq('mailbox_id', profile.mailbox_id)
        .eq('movement_type', 'VENDITA')
        .in('article_id', articleIds),

      supabase
        .from('shipment_items')
        .select(`article_id, shipments(status)`)
        .eq('mailbox_id', profile.mailbox_id)
        .in('article_id', articleIds),
    ])

    if (articlesError) {
      return (
        <main className="shell">
          <Navigation
            role="CLIENTE"
            active="/articoli"
            email={user.email}
          />

          <section className="content">
            {renderHeader()}

            <section className="panel">
              <h2>I miei articoli</h2>

              <div className="empty">
                Impossibile caricare gli articoli.
              </div>
            </section>
          </section>
        </main>
      )
    }

    articles = (articleData || []) as Article[]
    movements = (movementData || []) as Movement[]
    shipmentItems = (shipmentItemData || []).map((item: any) => ({
      article_id: item.article_id,
      shipment_status: item.shipments?.status || null,
    })) as ShipmentItem[]
  }


  return (
    <main className="shell">
      <Navigation
        role="CLIENTE"
        active="/articoli"
        email={user.email}
      />

      <section className="content">
        {renderHeader()}

        <section className="panel">
          <h2>Ricerca articoli</h2>

          <form
            action="/articoli"
            method="get"
            className="form"
          >
            <label>
              Cerca per codice, serie, descrizione, venditore
              o provenienza
              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Cerca articolo..."
              />
            </label>

            <button type="submit">
              Cerca
            </button>

            {search && (
              <a
                href="/articoli"
                className="back-button"
              >
                Azzera ricerca
              </a>
            )}
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>
                {search
                  ? `Risultati per "${search}"`
                  : 'I miei articoli'}
              </h2>

              <p className="muted">
                {articles.length} articoli visualizzati
              </p>
            </div>
          </div>

          {articles.length === 0 ? (
            <div className="empty">
              {search
                ? 'Nessun articolo trovato.'
                : 'Nessun articolo disponibile.'}
            </div>
          ) : (
            <div className="movement-list">
              {articles.map((article) => {
                const purchased = Number(
                  article.quantity_purchased || 0
                )



                return (
                  <article
                    className="movement"
                    key={article.id}
                  >
                    <div className="article-main">
                      <div className="article-title-row">
                        <strong>
                          {article.article_code ||
                            'Codice non disponibile'}
                        </strong>

                        {article.photo_url && (
                          <a
                            href={article.photo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="article-photo-link"
                            title="Visualizza foto"
                          >
                            📷
                          </a>
                        )}
                      </div>

                      {article.series && (
                        <span>
                          <b>Serie:</b> {article.series}
                        </span>
                      )}

                      {article.detail && (
                        <span>
                          <b>Descrizione:</b>{' '}
                          {article.detail}
                        </span>
                      )}

                      {article.origin && (
                        <span>
                          <b>Provenienza:</b>{' '}
                          {article.origin}
                        </span>
                      )}

                      <span>
                        <b>Data acquisto:</b>{' '}
                        {date(article.purchase_date)}
                      </span>
                      {article.notes && (
                        <span>
                          <b>Note:</b>{' '}
                          {article.notes}
                        </span>
                      )}
                    </div>

                    <div className="article-customer-meta">
                      <span>
                        <b>Valore:</b>{' '}
                        {(() => {
                          const sale = movements
                            .filter((movement) => movement.article_id === article.id)
                            .sort((a, b) =>
                              new Date(b.movement_at || 0).getTime() -
                              new Date(a.movement_at || 0).getTime()
                            )[0]
                          return sale?.unit_price_eur != null
                            ? money(Number(sale.unit_price_eur))
                            : '—'
                        })()}
                      </span>

                      <span>
                        <b>Stato:</b>{' '}
                        {shipmentItems.some(
                          (item) =>
                            item.article_id === article.id &&
                            ['SPEDITA', 'IN_TRANSITO', 'CONSEGNATA'].includes(
                              item.shipment_status || ''
                            )
                        )
                          ? 'SPEDITO'
                          : article.status === 'IN_ARRIVO'
                            ? 'IN ARRIVO'
                            : 'IN STOCK'}
                      </span>

                      <span>
                        <b>Quantità:</b>{' '}
                        {purchased}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
