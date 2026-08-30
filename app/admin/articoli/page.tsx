import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'

type ArticoliAdminPageProps = {
  searchParams: Promise<{
    search?: string
    status?: string
    origin?: string
    series?: string
    seller?: string
    message?: string
    error?: string
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

/*
 * REGISTRA ARRIVO
 *
 * La logica viene eseguita dal database
 * tramite register_article_arrival().
 */
async function registerArrival(
  formData: FormData
) {
  'use server'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } =
    await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') {
    redirect('/dashboard')
  }

  const articleIds = formData
    .getAll('article_id')
    .map(String)
    .filter(Boolean)

  if (articleIds.length === 0) {
    redirect(
      '/admin/articoli?error=Nessun articolo selezionato.'
    )
  }

  const { error } =
    await supabase.rpc(
      'register_article_arrival',
      {
        p_article_ids: articleIds,
      }
    )

  if (error) {
    redirect(
      `/admin/articoli?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  redirect(
    '/admin/articoli?message=Arrivo registrato correttamente.'
  )
}

/*
 * REGISTRA VENDITA
 *
 * La logica viene eseguita dal database
 * tramite register_article_sales().
 */
async function registerSale(
  formData: FormData
) {
  'use server'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } =
    await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') {
    redirect('/dashboard')
  }

  const customerCode = String(
    formData.get('customer_code') || ''
  )
    .trim()
    .toUpperCase()

  if (!customerCode) {
    redirect(
      '/admin/articoli?error=Il codice cliente è obbligatorio.'
    )
  }

  const articleIds = formData
    .getAll('sale_article_id')
    .map(String)
    .filter(Boolean)

  if (articleIds.length === 0) {
    redirect(
      '/admin/articoli?error=Nessun articolo selezionato per la vendita.'
    )
  }

  const lines = articleIds.map(
    (articleId) => ({
      article_id: articleId,
      quantity: Number(
        formData.get(
          `qty_${articleId}`
        ) || 0
      ),
      price: Number(
        formData.get(
          `price_${articleId}`
        ) || 0
      ),
    })
  )

  const { error } =
    await supabase.rpc(
      'register_article_sales',
      {
        p_customer_code:
          customerCode,
        p_lines: lines,
      }
    )

  if (error) {
    redirect(
      `/admin/articoli?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  redirect(
    `/admin/articoli?message=${encodeURIComponent(
      `Vendita registrata per il cliente ${customerCode}.`
    )}`
  )
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

  const { data: profile } =
    await supabase
      .from('profiles')
      .select(
        'role,display_name'
      )
      .eq('user_id', user.id)
      .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') {
    redirect('/dashboard')
  }

  const params = await searchParams

  const search =
    params.search?.trim() || ''

  const selectedStatus =
    params.status?.trim() || ''

  const selectedOrigin =
    params.origin?.trim() || ''

  const selectedSeries =
    params.series?.trim() || ''

  const selectedSeller =
    params.seller?.trim() || ''

  const message =
    params.message?.trim() || ''

  const errorMessage =
    params.error?.trim() || ''

  /*
   * QUERY ARTICOLI
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
    const safeSearch =
      search.replace(
        /[%_]/g,
        '\\$&'
      )

    articlesQuery =
      articlesQuery.or(
        `article_code.ilike.%${safeSearch}%,origin.ilike.%${safeSearch}%,seller.ilike.%${safeSearch}%,series.ilike.%${safeSearch}%,detail.ilike.%${safeSearch}%,status.ilike.%${safeSearch}%`
      )
  }

  if (selectedStatus) {
    articlesQuery =
      articlesQuery.eq(
        'status',
        selectedStatus
      )
  }

  if (selectedOrigin) {
    articlesQuery =
      articlesQuery.eq(
        'origin',
        selectedOrigin
      )
  }

  if (selectedSeries) {
    articlesQuery =
      articlesQuery.ilike(
        'series',
        `%${selectedSeries}%`
      )
  }

  if (selectedSeller) {
    articlesQuery =
      articlesQuery.ilike(
        'seller',
        `%${selectedSeller}%`
      )
  }

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
          total_amount_eur
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
              Impossibile caricare gli
              articoli.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const articles =
    (articlesResult.data ||
      []) as Article[]

  const sales =
    (salesResult.data ||
      []) as Sale[]

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

    soldByArticle.set(
      sale.article_id,
      (soldByArticle.get(
        sale.article_id
      ) || 0) +
        Number(
          sale.quantity || 0
        )
    )

    revenueByArticle.set(
      sale.article_id,
      (revenueByArticle.get(
        sale.article_id
      ) || 0) +
        Number(
          sale.total_amount_eur ||
            0
        )
    )
  }

  /*
   * STATISTICHE
   */

  const stats = articles.map(
    (article) => {
      const purchased =
        Number(
          article.quantity_purchased ||
            0
        )

      const sold =
        Number(
          soldByArticle.get(
            article.id
          ) || 0
        )

      const available =
        Math.max(
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
          article.unit_cost_eur ||
            0
        )

      const costOfSold =
        sold * unitCost

      const margin =
        revenue - costOfSold

      const marginPercent =
        revenue > 0
          ? (margin / revenue) *
            100
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
      acc.purchased +=
        row.purchased

      acc.sold +=
        row.sold

      acc.available +=
        row.available

      acc.revenue +=
        row.revenue

      acc.costOfSold +=
        row.costOfSold

      acc.margin +=
        row.margin

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
   * PROVENIENZE
   */

  const origins = [
    'GIAPPONE',
    'VIETNAM',
    'EUROPA',
    'ALTRO',
  ]

  const originStats =
    origins.map(
      (origin) => {
        const rows =
          stats.filter(
            (row) =>
              normalizeOrigin(
                row.article.origin
              ) === origin
          )

        const purchased =
          rows.reduce(
            (sum, row) =>
              sum +
              row.purchased,
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
              sum +
              row.available,
            0
          )

        const revenue =
          rows.reduce(
            (sum, row) =>
              sum +
              row.revenue,
            0
          )

        const costOfSold =
          rows.reduce(
            (sum, row) =>
              sum +
              row.costOfSold,
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

  /*
   * ARTICOLI VENDIBILI
   */

  const sellableStats =
    stats.filter(
      (row) =>
        row.available > 0 &&
        (
          row.article.status ===
            'IN_STOCK' ||
          row.article.status ===
            'IN_ARRIVO'
        )
    )

  /*
   * ARTICOLI IN ARRIVO
   */

  const incomingStats =
    stats.filter(
      (row) =>
        row.article.status ===
        'IN_ARRIVO'
    )

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

        {message && (
          <section className="panel">
            <div className="success">
              {decodeURIComponent(
                message
              )}
            </div>
          </section>
        )}

        {errorMessage && (
          <section className="panel">
            <div className="error">
              {decodeURIComponent(
                errorMessage
              )}
            </div>
          </section>
        )}

        {/* FILTRI */}

        <section className="panel">
          <h2>Filtri articoli</h2>

          <form
            action="/admin/articoli"
            method="get"
            className="form"
          >
            <label>
              Ricerca

              <input
                type="search"
                name="search"
                defaultValue={
                  search
                }
                placeholder="Codice, serie, descrizione..."
              />
            </label>

            <label>
              Stato

              <select
                name="status"
                defaultValue={
                  selectedStatus
                }
              >
                <option value="">
                  Tutti
                </option>

                <option value="IN_ARRIVO">
                  IN ARRIVO
                </option>

                <option value="IN_STOCK">
                  IN STOCK
                </option>

                <option value="VENDUTO">
                  VENDUTO
                </option>
              </select>
            </label>

            <label>
              Provenienza

              <select
                name="origin"
                defaultValue={
                  selectedOrigin
                }
              >
                <option value="">
                  Tutte
                </option>

                <option value="GIAPPONE">
                  Giappone
                </option>

                <option value="VIETNAM">
                  Vietnam
                </option>

                <option value="EUROPA">
                  Europa
                </option>

                <option value="ALTRO">
                  Altro
                </option>
              </select>
            </label>

            <label>
              Serie

              <input
                type="text"
                name="series"
                defaultValue={
                  selectedSeries
                }
                placeholder="Serie..."
              />
            </label>

            <label>
              Venditore

              <input
                type="text"
                name="seller"
                defaultValue={
                  selectedSeller
                }
                placeholder="Venditore..."
              />
            </label>

            <button type="submit">
              Applica filtri
            </button>

            {(search ||
              selectedStatus ||
              selectedOrigin ||
              selectedSeries ||
              selectedSeller) && (
              <a
                href="/admin/articoli"
                className="back-button"
              >
                Azzera filtri
              </a>
            )}
          </form>
        </section>

        {/* REGISTRA ARRIVO */}

        <section className="panel">
          <h2>Registra arrivo</h2>

          <p className="muted">
            Seleziona gli articoli
            attualmente IN ARRIVO che
            sono effettivamente arrivati.
          </p>

          {incomingStats.length ===
          0 ? (
            <div className="empty">
              Nessun articolo IN ARRIVO
              corrispondente ai filtri.
            </div>
          ) : (
            <form
              action={registerArrival}
            >
              <div className="article-selection-list">
                {incomingStats.map(
                  (row) => (
                    <label
                      className="article-select-row"
                      key={row.article.id}
                    >
                      <input
                        type="checkbox"
                        name="article_id"
                        value={
                          row.article.id
                        }
                      />

                      <span>
                        <strong>
                          {
                            row.article
                              .article_code
                          }
                        </strong>

                        <small>
                          Quantità:{' '}
                          {
                            row.purchased
                          }
                          {' · '}
                          {
                            row.article
                              .origin
                          }
                          {' · '}
                          {
                            row.article
                              .series ||
                            'Senza serie'
                          }
                        </small>
                      </span>
                    </label>
                  )
                )}
              </div>

              <button type="submit">
                Registra arrivo
              </button>
            </form>
          )}
        </section>

        {/* REGISTRA VENDITA */}

        <section className="panel">
          <h2>Registra vendita</h2>

          <p className="muted">
            Inserisci il codice cliente,
            seleziona gli articoli e
            indica quantità e prezzo di
            vendita per ogni articolo.
          </p>

          <form
            action={registerSale}
          >
            <label>
              Codice cliente

              <input
                type="text"
                name="customer_code"
                required
                placeholder="Es. 2608AAA"
                autoComplete="off"
              />
            </label>

            <div className="article-selection-list">
              {sellableStats.map(
                (row) => (
                  <div
                    className="sale-row"
                    key={row.article.id}
                  >
                    <label className="sale-check">
                      <input
                        type="checkbox"
                        name="sale_article_id"
                        value={
                          row.article.id
                        }
                      />

                      <span>
                        <strong>
                          {
                            row.article
                              .article_code
                          }
                        </strong>

                        <small>
                          Stato:{' '}
                          {statusLabel(
                            row.article
                              .status
                          )}
                          {' · '}
                          Disponibili:{' '}
                          {
                            row.available
                          }
                        </small>
                      </span>
                    </label>

                    <label>
                      Quantità

                      <input
                        type="number"
                        name={`qty_${row.article.id}`}
                        min="1"
                        max={
                          row.available
                        }
                        step="1"
                        defaultValue="1"
                      />
                    </label>

                    <label>
                      Prezzo vendita

                      <input
                        type="number"
                        name={`price_${row.article.id}`}
                        min="0.01"
                        step="0.01"
                        placeholder="0,00"
                      />
                    </label>
                  </div>
                )
              )}
            </div>

            {sellableStats.length ===
              0 && (
              <div className="empty">
                Nessun articolo disponibile
                per la vendita.
              </div>
            )}

            <button type="submit">
              Registra vendita
            </button>
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
                {number(
                  total.purchased
                )}
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
                {number(
                  total.available
                )}
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

        {/* ANALISI PER PROVENIENZA */}

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
                key={
                  originStat.origin
                }
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

        {/* ELENCO ARTICOLI */}

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
                      {number(row.sold)}
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
