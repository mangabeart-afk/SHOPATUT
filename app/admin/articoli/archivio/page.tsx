import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import ArchiveArticleActions from './ArchiveArticleActions'
import Navigation from '../../../../components/navigation'

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

function formatDate(value: string | null) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function statusLabel(status: ArticleStatus) {
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

function statusClass(status: ArticleStatus) {
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
|--------------------------------------------------------------------------
| REGISTRA ARRIVO
|--------------------------------------------------------------------------
*/

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
      '/admin/articoli?error=Nessun articolo selezionato.',
    )
  }

  const { error } = await supabase.rpc(
    'register_article_arrival',
    {
      p_article_ids: articleIds,
    },
  )

  if (error) {
    redirect(
      `/admin/articoli?error=${encodeURIComponent(
        error.message,
      )}`,
    )
  }

  redirect(
    '/admin/articoli?message=Arrivo registrato correttamente.',
  )
}

/*
|--------------------------------------------------------------------------
| REGISTRA VENDITA
|--------------------------------------------------------------------------
*/

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
    formData.get('customer_code') || '',
  )
    .trim()
    .toUpperCase()

  if (!customerCode) {
    redirect(
      '/admin/articoli?error=Il codice cliente è obbligatorio.',
    )
  }

  const articleIds = formData
    .getAll('sale_article_id')
    .map((value) => String(value))
    .filter(Boolean)

  if (articleIds.length === 0) {
    redirect(
      '/admin/articoli?error=Nessun articolo selezionato per la vendita.',
    )
  }

  const lines = articleIds.map((articleId) => ({
    article_id: articleId,
    quantity: Number(
      formData.get(`qty_${articleId}`) || 0,
    ),
    price: Number(
      formData.get(`price_${articleId}`) || 0,
    ),
  }))

  const invalidLine = lines.some(
    (line) =>
      line.quantity <= 0 ||
      line.price <= 0,
  )

  if (invalidLine) {
    redirect(
      '/admin/articoli?error=Inserisci quantità e prezzo validi per ogni articolo selezionato.',
    )
  }

  const { error } = await supabase.rpc(
    'register_article_sales',
    {
      p_customer_code: customerCode,
      p_lines: lines,
    },
  )

  if (error) {
    redirect(
      `/admin/articoli?error=${encodeURIComponent(
        error.message,
      )}`,
    )
  }

  redirect(
    `/admin/articoli?message=${encodeURIComponent(
      `Vendita registrata per il cliente ${customerCode}.`,
    )}`,
  )
}

/*
|--------------------------------------------------------------------------
| PAGINA
|--------------------------------------------------------------------------
*/

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

  /*
  |--------------------------------------------------------------------------
  | QUERY ARTICOLI
  |--------------------------------------------------------------------------
  */

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
      `,
    )
    .order('purchase_date', {
      ascending: false,
    })

  if (search) {
    const safeSearch = search.replace(
      /[%_]/g,
      '\\$&',
    )

    articlesQuery = articlesQuery.or(
      [
        `article_code.ilike.%${safeSearch}%`,
        `origin.ilike.%${safeSearch}%`,
        `seller.ilike.%${safeSearch}%`,
        `series.ilike.%${safeSearch}%`,
        `detail.ilike.%${safeSearch}%`,
        `status.ilike.%${safeSearch}%`,
      ].join(','),
    )
  }

  if (selectedStatus) {
    articlesQuery = articlesQuery.eq(
      'status',
      selectedStatus,
    )
  }

  if (selectedOrigin) {
    articlesQuery = articlesQuery.eq(
      'origin',
      selectedOrigin,
    )
  }

  if (selectedSeries) {
    const safeSeries = selectedSeries.replace(
      /[%_]/g,
      '\\$&',
    )

    articlesQuery = articlesQuery.ilike(
      'series',
      `%${safeSeries}%`,
    )
  }

  if (selectedSeller) {
    const safeSeller = selectedSeller.replace(
      /[%_]/g,
      '\\$&',
    )

    articlesQuery = articlesQuery.ilike(
      'seller',
      `%${safeSeller}%`,
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
        `,
      )
      .eq(
        'movement_type',
        'VENDITA',
      ),
  ])

  /*
  |--------------------------------------------------------------------------
  | ERRORE QUERY
  |--------------------------------------------------------------------------
  */

  if (articlesResult.error) {
    return (
      <main className="shell">
        <Navigation
          role="AMMINISTRATORE"
          active="/admin/articoli/archivio"
          displayName={profile?.display_name || null}
          email={user.email || null}
        />

        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">
                AMMINISTRAZIONE
              </p>

              <h1>Articoli</h1>
            </div>
          </header>

          <section className="panel">
            <h2>Articoli</h2>

            <div className="error">
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
  |--------------------------------------------------------------------------
  | DATI VENDITE
  |--------------------------------------------------------------------------
  */

  const soldByArticle = new Map<
    string,
    number
  >()

  for (const sale of sales) {
    if (!sale.article_id) continue

    soldByArticle.set(
      sale.article_id,
      (soldByArticle.get(sale.article_id) || 0) +
        Number(sale.quantity || 0),
    )
  }

  /*
  |--------------------------------------------------------------------------
  | DATI PER LA TABELLA
  |--------------------------------------------------------------------------
  */

  const articleRows = articles.map((article) => {
    const purchased = Number(
      article.quantity_purchased || 0,
    )

    const sold = Number(
      soldByArticle.get(article.id) || 0,
    )

    const available = Math.max(
      0,
      purchased - sold,
    )

    return {
      id: article.id,
      article_code: article.article_code,
      photo_url: article.photo_url,
      purchase_date: formatDate(article.purchase_date),
      origin: article.origin,
      seller: article.seller,
      series: article.series,
      detail: article.detail,
      quantity_purchased: purchased,
      total_cost_eur: article.total_cost_eur,
      unit_cost_eur: article.unit_cost_eur,
      status: article.status,
      statusLabel: statusLabel(article.status),
      statusClass: statusClass(article.status),
      sold,
      available,
    }
  })

  const hasFilters = Boolean(
    search ||
      selectedStatus ||
      selectedOrigin ||
      selectedSeries ||
      selectedSeller,
  )

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <main className="shell">
      <Navigation
        role="AMMINISTRATORE"
        active="/admin/articoli/archivio"
        displayName={profile?.display_name || null}
        email={user.email || null}
      />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>Articoli</h1>
          </div>
        </header>

        {message && (
          <section className="panel message-panel">
            <div className="success">
              {decodeURIComponent(message)}
            </div>
          </section>
        )}

        {errorMessage && (
          <section className="panel message-panel">
            <div className="error">
              {decodeURIComponent(errorMessage)}
            </div>
          </section>
        )}

        <section className="panel filters-panel">
          <div className="filters-heading">
            <div>
              <p className="eyebrow">
                RICERCA
              </p>

              <h2>
                Filtri articoli
              </h2>
            </div>

            {hasFilters && (
              <a
                href="/admin/articoli/archivio"
                className="filters-reset"
              >
                Azzera
              </a>
            )}
          </div>

          <form
            action="/admin/articoli/archivio"
            method="get"
            className="filters-form"
          >
            <div className="filter-search">
              <label htmlFor="article-search">
                Ricerca
              </label>

              <input
                id="article-search"
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Codice, serie, descrizione..."
              />
            </div>

            <div className="filter-field">
              <label htmlFor="article-status">
                Stato
              </label>

              <select
                id="article-status"
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
            </div>

            <div className="filter-field">
              <label htmlFor="article-origin">
                Provenienza
              </label>

              <select
                id="article-origin"
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
            </div>

            <div className="filter-field">
              <label htmlFor="article-series">
                Serie
              </label>

              <input
                id="article-series"
                type="text"
                name="series"
                defaultValue={selectedSeries}
                placeholder="Serie"
              />
            </div>

            <div className="filter-field">
              <label htmlFor="article-seller">
                Venditore
              </label>

              <input
                id="article-seller"
                type="text"
                name="seller"
                defaultValue={selectedSeller}
                placeholder="Venditore"
              />
            </div>

            <button
              type="submit"
              className="filter-submit"
            >
              Applica
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                ARCHIVIO
              </p>

              <h2>
                {search
                  ? `Risultati per "${search}"`
                  : 'Elenco articoli'}
              </h2>
            </div>

            <span className="results-count">
              {articleRows.length} articoli
            </span>
          </div>

          {articleRows.length === 0 ? (
            <div className="empty">
              {search
                ? 'Nessun articolo trovato.'
                : 'Nessun articolo registrato.'}
            </div>
          ) : (
            <ArchiveArticleActions
              articles={articleRows}
              registerArrival={registerArrival}
              registerSale={registerSale}
            />
          )}
        </section>
      </section>
    </main>
  )
}
