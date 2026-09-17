import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'

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
  currency: string | null
  unit_price_foreign: number | null
  exchange_rate: number | null
  accessory_cost_eur: number | null
  total_cost_eur: number | null
  unit_cost_eur: number | null
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
    </header>
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
          currency,
          unit_price_foreign,
          exchange_rate,
          accessory_cost_eur,
          total_cost_eur,
          unit_cost_eur,
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
    ] = await Promise.all([
      articleQuery.order('purchase_date', {
        ascending: false,
      }),

      supabase
        .from('movements')
        .select('article_id, quantity, movement_type')
        .eq('mailbox_id', profile.mailbox_id)
        .eq('movement_type', 'VENDITA')
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
  }

  const getAssignment = (articleId: string) =>
    safeAssignments.find(
      (assignment) => assignment.article_id === articleId
    )

  const getSoldQuantity = (articleId: string) =>
    movements
      .filter((movement) => movement.article_id === articleId)
      .reduce(
        (total, movement) =>
          total + Math.abs(Number(movement.quantity || 0)),
        0
      )

  const totalArticles = articles.length

  const totalPurchased = articles.reduce(
    (total, article) =>
      total + Number(article.quantity_purchased || 0),
    0
  )

  const totalAssigned = articles.reduce((total, article) => {
    const assignment = getAssignment(article.id)

    return total + Number(assignment?.quantity_assigned || 0)
  }, 0)

  const totalSold = articles.reduce(
    (total, article) => total + getSoldQuantity(article.id),
    0
  )

  const totalValue = articles.reduce(
    (total, article) =>
      total + Number(article.total_cost_eur || 0),
    0
  )

  return (
    <main className="shell">
      <Navigation
        role="CLIENTE"
        active="/articoli"
        email={user.email}
      />

      <section className="content">
        {renderHeader()}

        <section className="summary-grid">
          <div className="summary-card">
            <span>Articoli</span>
            <strong>{totalArticles}</strong>
            <small>Articoli associati</small>
          </div>

          <div className="summary-card">
            <span>Pezzi acquistati</span>
            <strong>{totalPurchased}</strong>
            <small>Quantità complessiva</small>
          </div>

          <div className="summary-card">
            <span>Pezzi assegnati</span>
            <strong>{totalAssigned}</strong>
            <small>Quantità nella casella</small>
          </div>

          <div className="summary-card">
            <span>Valore articoli</span>
            <strong>{money(totalValue)}</strong>
            <small>Valore totale di acquisto</small>
          </div>
        </section>

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
                const assignment = getAssignment(article.id)

                const purchased = Number(
                  article.quantity_purchased || 0
                )

                const assigned = Number(
                  assignment?.quantity_assigned || 0
                )

                const sold = getSoldQuantity(article.id)

                const available = Math.max(
                  assigned - sold,
                  0
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

                      {article.seller && (
                        <span>
                          <b>Venditore:</b>{' '}
                          {article.seller}
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

                      <div className="article-quantities">
                        <span>
                          Acquistati: <b>{purchased}</b>
                        </span>

                        <span>
                          Assegnati: <b>{assigned}</b>
                        </span>

                        <span>
                          Venduti: <b>{sold}</b>
                        </span>

                        <span>
                          Disponibili: <b>{available}</b>
                        </span>
                      </div>

                      {assignment?.status && (
                        <span>
                          <b>Stato:</b>{' '}
                          {assignment.status}
                        </span>
                      )}

                      {assignment?.notes && (
                        <span>
                          <b>Note:</b>{' '}
                          {assignment.notes}
                        </span>
                      )}
                    </div>

                    <div className="article-costs">
                      <span>
                        Costo unitario
                      </span>

                      <strong>
                        {money(
                          Number(article.unit_cost_eur || 0)
                        )}
                      </strong>

                      <span>
                        Costo totale
                      </span>

                      <strong>
                        {money(
                          Number(article.total_cost_eur || 0)
                        )}
                      </strong>
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
