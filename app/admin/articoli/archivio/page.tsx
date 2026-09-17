import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import ArticlePhotoButton from './ArticlePhotoButton'

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
  photo_url: string | null
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

const money = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value || 0)

const number = (value: number) =>
  new Intl.NumberFormat('it-IT').format(value || 0)

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

const statusLabel = (status: ArticleStatus) => {
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

const statusClass = (status: ArticleStatus) => {
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

/* ============================
   REGISTRA ARRIVO
============================ */

async function registerArrival(formData: FormData) {
  'use server'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') {
    redirect('/dashboard')
  }

  const articleIds = formData
    .getAll('article_id')
    .map((value) => String(value))
    .filter(Boolean)

  if (articleIds.length === 0) {
    redirect(
      '/admin/articoli/archivio?error=Nessun articolo selezionato.'
    )
  }

  const { error } = await supabase.rpc(
    'register_article_arrival',
    {
      p_article_ids: articleIds,
    }
  )

  if (error) {
    redirect(
      `/admin/articoli/archivio?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  redirect(
    '/admin/articoli/archivio?message=Arrivo registrato correttamente.'
  )
}

/* ============================
   REGISTRA VENDITA
============================ */

async function registerSale(formData: FormData) {
  'use server'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
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
      '/admin/articoli/archivio?error=Il codice cliente è obbligatorio.'
    )
  }

  const articleIds = formData
    .getAll('sale_article_id')
    .map((value) => String(value))
    .filter(Boolean)

  if (articleIds.length === 0) {
    redirect(
      '/admin/articoli/archivio?error=Nessun articolo selezionato per la vendita.'
    )
  }

  const lines = articleIds.map((articleId) => ({
    article_id: articleId,
    quantity: Number(
      formData.get(`qty_${articleId}`) || 0
    ),
    price: Number(
      formData.get(`price_${articleId}`) || 0
    ),
  }))

  const invalidLine = lines.some(
    (line) =>
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      !Number.isFinite(line.price) ||
      line.price <= 0
  )

  if (invalidLine) {
    redirect(
      '/admin/articoli/archivio?error=Controlla quantità e prezzo degli articoli selezionati.'
    )
  }

  const { error } = await supabase.rpc(
    'register_article_sales',
    {
      p_customer_code: customerCode,
      p_lines: lines,
    }
  )

  if (error) {
    redirect(
      `/admin/articoli/archivio?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  redirect(
    `/admin/articoli/archivio?message=${encodeURIComponent(
      `Vendita registrata per il cliente ${customerCode}.`
    )}`
  )
}

/* ============================
   PAGINA
============================ */

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
  const selectedStatus = params.status?.trim() || ''
  const selectedOrigin = params.origin?.trim() || ''
  const selectedSeries = params.series?.trim() || ''
  const selectedSeller = params.seller?.trim() || ''
  const message = params.message?.trim() || ''
  const errorMessage = params.error?.trim() || ''

  let articlesQuery = supabase
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
      [
        `article_code.ilike.%${safeSearch}%`,
        `origin.ilike.%${safeSearch}%`,
        `seller.ilike.%${safeSearch}%`,
        `series.ilike.%${safeSearch}%`,
        `detail.ilike.%${safeSearch}%`,
        `status.ilike.%${safeSearch}%`,
      ].join(',')
    )
  }

  if (selectedStatus) {
    articlesQuery = articlesQuery.eq(
      'status',
      selectedStatus
    )
  }

  if (selectedOrigin) {
    articlesQuery = articlesQuery.eq(
      'origin',
      selectedOrigin
    )
  }

  if (selectedSeries) {
    articlesQuery = articlesQuery.ilike(
      'series',
      `%${selectedSeries}%`
    )
  }

  if (selectedSeller) {
    articlesQuery = articlesQuery.ilike(
      'seller',
      `%${selectedSeller}%`
    )
  }

  const [articlesResult, salesResult] =
    await Promise.all([
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
        .eq('movement_type', 'VENDITA'),
    ])

  if (articlesResult.error) {
    throw new Error(articlesResult.error.message)
  }

  const articles =
    (articlesResult.data || []) as Article[]

  const sales =
    (salesResult.data || []) as Sale[]

  const soldByArticle = new Map<string, number>()

  for (const sale of sales) {
    if (!sale.article_id) continue

    soldByArticle.set(
      sale.article_id,
      (soldByArticle.get(sale.article_id) || 0) +
        Number(sale.quantity || 0)
    )
  }

  const articleRows = articles.map((article) => {
    const purchased = Number(
      article.quantity_purchased || 0
    )

    const sold = Number(
      soldByArticle.get(article.id) || 0
    )

    const available = Math.max(
      0,
      purchased - sold
    )

    return {
      article,
      purchased,
      sold,
      available,
    }
  })

  const sellableRows = articleRows.filter(
    (row) =>
      row.available > 0 &&
      (
        row.article.status === 'IN_STOCK' ||
        row.article.status === 'IN_ARRIVO'
      )
  )

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          MangaBEART <span>[ShopaTüT]</span>
        </div>

        <nav>
          <a href="/admin">Dashboard</a>
          <a href="/admin/clienti">Clienti</a>
          <a href="/admin/caselle">Caselle</a>

          <a
            href="/admin/articoli"
            className="active"
          >
            Articoli
          </a>

          <a href="/admin/pagamenti">Pagamenti</a>
          <a href="/admin/crediti">Crediti</a>
          <a href="/admin/spedizioni">Spedizioni</a>
          <a href="/admin/movimenti">Movimenti</a>
        </nav>

        <div className="side-note">
          V1 • AMMINISTRATORE
          <br />
          {profile?.display_name || user.email}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>Archivio articoli</h1>
          </div>
        </header>

        {message && (
          <section className="panel">
            <div className="success">
              {decodeURIComponent(message)}
            </div>
          </section>
        )}

        {errorMessage && (
          <section className="panel">
            <div className="error">
              {decodeURIComponent(errorMessage)}
            </div>
          </section>
        )}

        <section className="panel">
          <h2>Filtri articoli</h2>

          <form
            action="/admin/articoli/archivio"
            method="get"
            className="form"
          >
            <label>
              Ricerca

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Codice, serie, descrizione..."
              />
            </label>

            <label>
              Stato

              <select
                name="status"
                defaultValue={selectedStatus}
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
                defaultValue={selectedOrigin}
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
                defaultValue={selectedSeries}
                placeholder="Serie..."
              />
            </label>

            <label>
              Venditore

              <input
                type="text"
                name="seller"
                defaultValue={selectedSeller}
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
                href="/admin/articoli/archivio"
                className="back-button"
              >
                Azzera filtri
              </a>
            )}
          </form>
        </section>

        <section className="panel">
          <h2>Registra arrivo</h2>

          <p className="muted">
            Seleziona gli articoli da registrare
            come arrivati.
          </p>

          <form
            action={registerArrival}
            className="bulk-action-form"
          >
            <div className="article-selection-list">
              {articleRows
                .filter(
                  (row) =>
                    row.article.status ===
                    'IN_ARRIVO'
                )
                .map((row) => (
                  <label
                    className="selection-item"
                    key={row.article.id}
                  >
                    <input
                      type="checkbox"
                      name="article_id"
                      value={row.article.id}
                    />

                    <span>
                      <strong>
                        {row.article.article_code}
                      </strong>

                      <small>
                        {row.article.series || '—'}
                      </small>
                    </span>
                  </label>
                ))}
            </div>

            {articleRows.some(
              (row) =>
                row.article.status === 'IN_ARRIVO'
            ) ? (
              <button type="submit">
                Registra arrivo
              </button>
            ) : (
              <div className="empty">
                Nessun articolo in arrivo.
              </div>
            )}
          </form>
        </section>

        <section className="panel">
          <h2>Registra vendita</h2>

          <form
            action={registerSale}
            className="bulk-action-form"
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
              {sellableRows.map((row) => (
                <div
                  className="sale-row"
                  key={row.article.id}
                >
                  <label className="sale-check">
                    <input
                      type="checkbox"
                      name="sale_article_id"
                      value={row.article.id}
                    />

                    <span>
                      <strong>
                        {row.article.article_code}
                      </strong>

                      <small>
                        Disponibili:{' '}
                        {number(row.available)}
                      </small>
                    </span>
                  </label>

                  <label>
                    Quantità

                    <input
                      type="number"
                      name={`qty_${row.article.id}`}
                      min="1"
                      max={row.available}
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
              ))}
            </div>

            {sellableRows.length > 0 ? (
              <button type="submit">
                Registra vendita
              </button>
            ) : (
              <div className="empty">
                Nessun articolo disponibile
                per la vendita.
              </div>
            )}
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Elenco articoli</h2>

              <p className="muted">
                {articleRows.length} articoli trovati.
              </p>
            </div>
          </div>

          {articleRows.length === 0 ? (
            <div className="empty">
              Nessun articolo trovato.
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="articles-table">
                <thead>
                  <tr>
                    <th>
                      CODICE ARTICOLO
                    </th>

                    <th>DATA</th>
                    <th>SERIE</th>
                    <th>DETTAGLIO</th>
                    <th>Q.TÀ</th>
                    <th>IN STOCK</th>
                    <th>€€</th>
                    <th>€</th>
                    <th>STATO</th>
                    <th>VENDITE</th>
                    <th>UTENTI</th>
                  </tr>
                </thead>

                <tbody>
                  {articleRows.map((row) => {
                    const article = row.article

                    return (
                      <tr
                        key={article.id}
                        className="article-row"
                      >
                        <td>
                          <div className="article-code-cell">
                            <strong>
                              {article.article_code}
                            </strong>

                            <div className="article-code-tools">
                              <input
                                type="checkbox"
                                name="article_id"
                                value={article.id}
                                aria-label={`Seleziona ${article.article_code}`}
                              />

                              <ArticlePhotoButton
                                articleCode={
                                  article.article_code
                                }
                                photo={article.photo_url}
                              />
                            </div>
                          </div>
                        </td>

                        <td>
                          {formatDate(
                            article.purchase_date
                          )}
                        </td>

                        <td>
                          {article.series || '—'}
                        </td>

                        <td>
                          {article.detail || '—'}
                        </td>

                        <td>
                          {number(row.purchased)}
                        </td>

                        <td>
                          {number(row.available)}
                        </td>

                        <td>
                          {money(
                            Number(
                              article.total_cost_eur || 0
                            )
                          )}
                        </td>

                        <td>
                          {money(
                            Number(
                              article.unit_cost_eur || 0
                            )
                          )}
                        </td>

                        <td>
                          <span
                            className={statusClass(
                              article.status
                            )}
                          >
                            {statusLabel(
                              article.status
                            )}
                          </span>
                        </td>

                        <td>
                          {number(row.sold)}
                        </td>

                        <td>
                          —
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
