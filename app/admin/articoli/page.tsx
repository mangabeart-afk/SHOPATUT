import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'

type ArticoliAdminPageProps = {
  searchParams: Promise<{
    search?: string
  }>
}

type ArticleStatus =
  | 'IN_ARRIVO'
  | 'IN_STOCK'
  | 'VENDUTO'

type Article = {
  id: string
  article_code: string
  purchase_date: string
  origin: string
  seller: string | null
  series: string | null
  detail: string | null
  quantity_purchased: number
  currency: string
  unit_price_foreign: number
  exchange_rate: number
  accessory_cost_eur: number
  total_cost_eur: number | null
  unit_cost_eur: number | null
  notes: string | null
  status: ArticleStatus
}

type Sale = {
  article_id: string | null
  quantity: number | null
  total_amount_eur: number | null
  movement_type: string
}

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

const number = (n: number) =>
  new Intl.NumberFormat('it-IT').format(n || 0)

const percent = (n: number) =>
  `${n.toFixed(1)}%`

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

const normalizeOrigin = (value: string) =>
  value.trim().toUpperCase()

const statusLabel = (
  status: ArticleStatus
) => {
  switch (status) {
    case 'IN_ARRIVO':
      return 'IN ARRIVO'

    case 'IN_STOCK':
      return 'IN STOCK'

    case 'VENDUTO':
      return 'VENDUTO'

    default:
      return status
  }
}

const statusClass = (
  status: ArticleStatus
) => {
  switch (status) {
    case 'IN_ARRIVO':
      return 'article-status status-arrivo'

    case 'IN_STOCK':
      return 'article-status status-stock'

    case 'VENDUTO':
      return 'article-status status-venduto'

    default:
      return 'article-status'
  }
}

export default async function ArticoliAdminPage({
  searchParams,
}: ArticoliAdminPageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') {
    redirect('/dashboard')
  }

  const params = await searchParams
  const search = params.search?.trim() || ''

  /*
   * ARTICOLI
   */

  let articlesQuery = supabase
    .from('articles')
    .select(
      `
        id,
        article_code,
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
        notes,
        status
      `
    )
    .order('purchase_date', {
      ascending: false,
    })

  if (search) {
    const safeSearch = search.replace(
      /[%_]/g,
      '\\$&'
    )

    articlesQuery = articlesQuery.or(
      `article_code.ilike.%${safeSearch}%,origin.ilike.%${safeSearch}%,seller.ilike.%${safeSearch}%,series.ilike.%${safeSearch}%,detail.ilike.%${safeSearch}%,status.ilike.%${safeSearch}%`
    )
  }

  /*
   * MOVIMENTI DI VENDITA
   *
   * L'assegnazione alla casella coincide
   * con la vendita.
   */

  const [
    articlesResult,
    salesResult,
  ] = await Promise.all([
    articlesQuery,

    supabase
      .from('movements')
      .select(
        `
          article_id,
          quantity,
          total_amount_eur,
          movement_type
        `
      )
      .eq(
        'movement_type',
        'VENDITA'
      ),
  ])

  if (articlesResult.error) {
    return (
      <main className="shell">
        <aside className="sidebar">
          <div className="brand">
            MangaBEART <span>[ShopaTüT]</span>
          </div>

          <nav>
            <a href="/admin">
              Dashboard
            </a>

            <a href="/admin/clienti">
              Clienti
            </a>

            <a href="/admin/caselle">
              Caselle
            </a>

            <a
              href="/admin/articoli"
              className="active"
            >
              Articoli
            </a>

            <a href="/admin/pagamenti">
              Pagamenti
            </a>

            <a href="/admin/crediti">
              Crediti
            </a>

            <a href="/admin/spedizioni">
              Spedizioni
            </a>

            <a href="/admin/movimenti">
              Movimenti
            </a>
          </nav>

          <div className="side-note">
            V1 • AMMINISTRATORE
            <br />
            {profile?.display_name ||
              user.email}
          </div>
        </aside>

        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">
                AMMINISTRAZIONE
              </p>

              <h1>Articoli</h1>
            </div>

            <a
              href="/admin"
              className="back-button"
            >
              ← Dashboard
            </a>
          </header>

          <section className="panel">
            <h2>Articoli</h2>

            <div className="empty">
              Impossibile caricare gli articoli.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const articles =
    (articlesResult.data || []) as Article[]

  const sales =
    (salesResult.data || []) as Sale[]

  /*
   * VENDITE PER ARTICOLO
   */

  const soldByArticle =
    new Map<string, number>()

  const revenueByArticle =
    new Map<string, number>()

  for (const sale of sales) {
    if (!sale.article_id) {
      continue
    }

    const quantity =
      Number(sale.quantity || 0)

    const revenue =
      Number(
        sale.total_amount_eur || 0
      )

    soldByArticle.set(
      sale.article_id,
      (soldByArticle.get(
        sale.article_id
      ) || 0) + quantity
    )

    revenueByArticle.set(
      sale.article_id,
      (revenueByArticle.get(
        sale.article_id
      ) || 0) + revenue
    )
  }

  /*
   * STATISTICHE
   */

  const stats = articles.map(
    (article) => {
      const purchased =
        Number(
          article.quantity_purchased || 0
        )

      const sold =
        Number(
          soldByArticle.get(
            article.id
          ) || 0
        )

      const available = Math.max(
        0,
        purchased - sold
      )

      const revenue =
        Number(
          revenueByArticle.get(
            article.id
          ) || 0
        )

      const unitCost =
        Number(
          article.unit_cost_eur || 0
        )

      const costOfSold =
        sold * unitCost

      const margin =
        revenue - costOfSold

      const marginPercent =
        revenue > 0
          ? (margin / revenue) * 100
          : 0

      return {
        article,
        purchased,
        sold,
        available,
        revenue,
        costOfSold,
        margin,
        marginPercent,
      }
    }
  )

  /*
   * TOTALI
   */

  const total = stats.reduce(
    (acc, row) => {
      acc.purchased += row.purchased
      acc.sold += row.sold
      acc.available += row.available
      acc.revenue += row.revenue
      acc.costOfSold += row.costOfSold
      acc.margin += row.margin

      return acc
    },
    {
      purchased: 0,
      sold: 0,
      available: 0,
      revenue: 0,
      costOfSold: 0,
      margin: 0,
    }
  )

  const totalMarginPercent =
    total.revenue > 0
      ? (total.margin /
          total.revenue) *
        100
      : 0

  /*
   * PROVENIENZA
   */

  const origins = [
    'GIAPPONE',
    'VIETNAM',
    'EUROPA',
    'ALTRO',
  ]

  const originStats = origins.map(
    (origin) => {
      const rows = stats.filter(
        (row) =>
          normalizeOrigin(
            row.article.origin
          ) === origin
      )

      const purchased =
        rows.reduce(
          (sum, row) =>
            sum + row.purchased,
          0
        )

      const sold =
        rows.reduce(
          (sum, row) =>
            sum + row.sold,
          0
        )

      const available =
        rows.reduce(
          (sum, row) =>
            sum + row.available,
          0
        )

      const revenue =
        rows.reduce(
          (sum, row) =>
            sum + row.revenue,
          0
        )

      const costOfSold =
        rows.reduce(
          (sum, row) =>
            sum + row.costOfSold,
          0
        )

      const margin =
        rows.reduce(
          (sum, row) =>
            sum + row.margin,
          0
        )

      return {
        origin,
        rows,
        purchased,
        sold,
        available,
        revenue,
        costOfSold,
        margin,
      }
    }
  )

  const originLabel = (
    origin: string
  ) => {
    switch (origin) {
      case 'GIAPPONE':
        return '🇯🇵 Giappone'

      case 'VIETNAM':
        return '🇻🇳 Vietnam'

      case 'EUROPA':
        return '🇪🇺 Europa'

      default:
        return 'Altro'
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          MangaBEART <span>[ShopaTüT]</span>
        </div>

        <nav>
          <a href="/admin">
            Dashboard
          </a>

          <a href="/admin/clienti">
            Clienti
          </a>

          <a href="/admin/caselle">
            Caselle
          </a>

          <a
            href="/admin/articoli"
            className="active"
          >
            Articoli
          </a>

          <a href="/admin/pagamenti">
            Pagamenti
          </a>

          <a href="/admin/crediti">
            Crediti
          </a>

          <a href="/admin/spedizioni">
            Spedizioni
          </a>

          <a href="/admin/movimenti">
            Movimenti
          </a>
        </nav>

        <div className="side-note">
          V1 • AMMINISTRATORE
          <br />
          {profile?.display_name ||
            user.email}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>Articoli</h1>
          </div>

          <a
            href="/admin"
            className="back-button"
          >
            ← Dashboard
          </a>
        </header>

        {/* RICERCA */}

        <section className="panel">
          <h2>Ricerca articoli</h2>

          <form
            action="/admin/articoli"
            method="get"
            className="form"
          >
            <label>
              Cerca articolo

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Codice, serie, descrizione, venditore, provenienza, stato..."
              />
            </label>

            <button type="submit">
              Cerca
            </button>

            {search && (
              <a
                href="/admin/articoli"
                className="back-button"
              >
                Azzera ricerca
              </a>
            )}
          </form>
        </section>

        {/* MONITORAGGIO COMPLESSIVO */}

        <section className="panel">
          <h2>
            Monitoraggio complessivo
          </h2>

          <div className="grid">
            <div className="card">
              <div className="muted">
                Acquistati
              </div>

              <strong>
                {number(total.purchased)}
              </strong>

              <small>
                unità acquistate
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Venduti
              </div>

              <strong>
                {number(total.sold)}
              </strong>

              <small>
                unità vendute
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Disponibili
              </div>

              <strong>
                {number(total.available)}
              </strong>

              <small>
                quantità residua
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Ricavi
              </div>

              <strong>
                {money(total.revenue)}
              </strong>

              <small>
                da vendite
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Costo venduto
              </div>

              <strong>
                {money(
                  total.costOfSold
                )}
              </strong>

              <small>
                costo delle unità vendute
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Margine
              </div>

              <strong>
                {money(total.margin)}
              </strong>

              <small>
                margine commerciale
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Margine %
              </div>

              <strong>
                {percent(
                  totalMarginPercent
                )}
              </strong>

              <small>
                sul ricavo
              </small>
            </div>
          </div>
        </section>

        {/* ANALISI PROVENIENZA */}

        {originStats.map(
          (originStat) => {
            const marginPercent =
              originStat.revenue > 0
                ? (originStat.margin /
                    originStat.revenue) *
                  100
                : 0

            return (
              <section
                className="panel"
                key={originStat.origin}
              >
                <h2>
                  {originLabel(
                    originStat.origin
                  )}
                </h2>

                <div className="grid">
                  <div className="card">
                    <div className="muted">
                      Acquistati
                    </div>

                    <strong>
                      {number(
                        originStat.purchased
                      )}
                    </strong>
                  </div>

                  <div className="card">
                    <div className="muted">
                      Venduti
                    </div>

                    <strong>
                      {number(
                        originStat.sold
                      )}
                    </strong>
                  </div>

                  <div className="card">
                    <div className="muted">
                      Disponibili
                    </div>

                    <strong>
                      {number(
                        originStat.available
                      )}
                    </strong>
                  </div>

                  <div className="card">
                    <div className="muted">
                      Ricavi
                    </div>

                    <strong>
                      {money(
                        originStat.revenue
                      )}
                    </strong>
                  </div>

                  <div className="card">
                    <div className="muted">
                      Costo venduto
                    </div>

                    <strong>
                      {money(
                        originStat.costOfSold
                      )}
                    </strong>
                  </div>

                  <div className="card">
                    <div className="muted">
                      Margine
                    </div>

                    <strong>
                      {money(
                        originStat.margin
                      )}
                    </strong>
                  </div>

                  <div className="card">
                    <div className="muted">
                      Margine %
                    </div>

                    <strong>
                      {percent(
                        marginPercent
                      )}
                    </strong>
                  </div>
                </div>
              </section>
            )
          }
        )}

        {/* ELENCO */}

        <section className="panel">
          <h2>
            {search
              ? `Risultati per "${search}"`
              : 'Elenco articoli'}
          </h2>

          {stats.length === 0 ? (
            <div className="empty">
              {search
                ? 'Nessun articolo trovato.'
                : 'Nessun articolo registrato.'}
            </div>
          ) : (
            <div className="movement-list">
              {stats.map((row) => (
                <div
                  className="movement"
                  key={row.article.id}
                >
                  <div>
                    <b>
                      {row.article.article_code}
                    </b>

                    <span
                      className={statusClass(
                        row.article.status
                      )}
                    >
                      Stato:{' '}
                      {statusLabel(
                        row.article.status
                      )}
                    </span>

                    {row.article.series && (
                      <span>
                        Serie:{' '}
                        {row.article.series}
                      </span>
                    )}

                    {row.article.detail && (
                      <span>
                        {row.article.detail}
                      </span>
                    )}

                    <span>
                      Provenienza:{' '}
                      {row.article.origin}
                    </span>

                    {row.article.seller && (
                      <span>
                        Venditore:{' '}
                        {row.article.seller}
                      </span>
                    )}

                    <span>
                      Acquistato il:{' '}
                      {formatDate(
                        row.article
                          .purchase_date
                      )}
                    </span>
                  </div>

                  <div>
                    <span>
                      Acquistati:{' '}
                      {number(
                        row.purchased
                      )}
                    </span>

                    <span>
                      Venduti:{' '}
                      {number(
                        row.sold
                      )}
                    </span>

                    <span>
                      Disponibili:{' '}
                      {number(
                        row.available
                      )}
                    </span>

                    <span>
                      Costo unitario:{' '}
                      {money(
                        Number(
                          row.article
                            .unit_cost_eur ||
                            0
                        )
                      )}
                    </span>

                    <span>
                      Ricavi:{' '}
                      {money(
                        row.revenue
                      )}
                    </span>

                    <strong>
                      Margine:{' '}
                      {money(
                        row.margin
                      )}
                    </strong>

                    <a
                      href={`/admin/articoli/${row.article.id}`}
                      className="back-button"
                    >
                      Dettaglio →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
