import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import ArchiveArticleActions from './ArchiveArticleActions'

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

/*
|--------------------------------------------------------------------------
| FUNZIONI UTILI
|--------------------------------------------------------------------------
*/

const money = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0))

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

/*
|--------------------------------------------------------------------------
| SIDEBAR
|--------------------------------------------------------------------------
*/

function AdminSidebar({
  displayName,
  email,
}: {
  displayName: string | null
  email: string | null
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img
          src="/logo.png"
          alt="MangaBEART"
          className="brand-logo"
        />
      </div>

      <nav className="admin-navigation">
        <a href="/admin">
          Dashboard
        </a>

        <a href="/admin/clienti">
          Clienti
        </a>

        <a href="/admin/articoli/nuovo">
          Nuovo articolo
        </a>

        <a
          href="/admin/articoli/archivio"
          className="active"
        >
          Archivio articoli
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
        {displayName || email || 'Amministratore'}
      </div>

      <form action="/auth/logout" method="post">
        <button
          type="submit"
          className="logout-button"
        >
          Esci
        </button>
      </form>
    </aside>
  )
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
      '/admin/articoli/archivio?error=Nessun articolo selezionato.',
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
      `/admin/articoli/archivio?error=${encodeURIComponent(
        error.message,
      )}`,
    )
  }

  redirect(
    '/admin/articoli/archivio?message=Arrivo registrato correttamente.',
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
      '/admin/articoli/archivio?error=Il codice cliente è obbligatorio.',
    )
  }

  const articleIds = formData
    .getAll('sale_article_id')
    .map((value) => String(value))
    .filter(Boolean)

  if (articleIds.length === 0) {
    redirect(
      '/admin/articoli/archivio?error=Nessun articolo selezionato per la vendita.',
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
      '/admin/articoli/archivio?error=Inserisci quantità e prezzo validi per ogni articolo selezionato.',
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
      `/admin/articoli/archivio?error=${encodeURIComponent(
        error.message,
      )}`,
    )
  }

  redirect(
    `/admin/articoli/archivio?message=${encodeURIComponent(
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

  const articlesResult = await articlesQuery

  /*
  |--------------------------------------------------------------------------
  | ERRORE QUERY
  |--------------------------------------------------------------------------
  */

  if (articlesResult.error) {
    return (
      <main className="shell">
        <AdminSidebar
          displayName={profile?.display_name || null}
          email={user.email || null}
        />

        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">
                AMMINISTRAZIONE
              </p>

              <h1>Archivio articoli</h1>
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
    <>
      <main className="shell">
        <AdminSidebar
          displayName={profile?.display_name || null}
          email={user.email || null}
        />

        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">
                AMMINISTRAZIONE
              </p>

              <h1>Archivio articoli</h1>
            </div>

            <a
              href="/admin"
              className="back-button"
            >
              ← Dashboard
            </a>
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

                <h2>Filtri articoli</h2>
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

          <ArchiveArticleActions
            articles={articles.map((article) => ({
              id: article.id,
              article_code: article.article_code,
              purchase_date: formatDate(
                article.purchase_date,
              ),
              series: article.series,
              detail: article.detail,
              origin: article.origin,
              seller: article.seller,
              quantity_purchased:
                article.quantity_purchased,
              total_cost_eur:
                article.total_cost_eur,
              unit_cost_eur:
                article.unit_cost_eur,
              status: article.status,
              statusLabel: statusLabel(
                article.status,
              ),
              statusClass: statusClass(
                article.status,
              ),
            }))}
            registerArrival={registerArrival}
            registerSale={registerSale}
          />
        </section>
      </main>

      <style jsx global>{`
        .shell {
          display: flex;
          min-height: 100vh;
          background: #f8f6f2;
        }

        .sidebar {
          position: sticky;
          top: 0;
          display: flex;
          flex-direction: column;
          width: 230px;
          min-width: 230px;
          min-height: 100vh;
          padding: 28px 0 8px;
          background: #70443f;
          color: #fff;
        }

        .brand {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 78px;
          padding: 0 16px 24px;
        }

        .brand-logo {
          width: 104px;
          height: 104px;
          object-fit: contain;
          border-radius: 50%;
        }

        .admin-navigation {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .admin-navigation a {
          display: block;
          padding: 12px 12px;
          color: #fff;
          text-decoration: none;
          font-size: 16px;
          border-radius: 0 10px 10px 0;
        }

        .admin-navigation a:hover,
        .admin-navigation a.active {
          background: #d8c09a;
          color: #70443f;
        }

        .side-note {
          margin-top: auto;
          padding: 16px 6px 12px;
          font-size: 12px;
          line-height: 1.35;
        }

        .logout-button {
          width: 100%;
          min-height: 38px;
          border: 0;
          border-radius: 8px 8px 0 0;
          background: #292b32;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }

        .content {
          flex: 1;
          min-width: 0;
          padding: 24px 34px 48px;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 24px;
        }

        .eyebrow {
          margin: 0 0 5px;
          color: #8c7770;
          font-size: 12px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 0;
          color: #70443f;
        }

        h1 {
          font-size: 34px;
          line-height: 1.1;
        }

        h2 {
          font-size: 20px;
        }

        .back-button {
          display: inline-flex;
          align-items: center;
          min-height: 40px;
          padding: 0 14px;
          border-radius: 9px;
          background: #70443f;
          color: #fff;
          text-decoration: none;
          font-weight: 700;
        }

        .panel {
          margin-bottom: 18px;
          padding: 22px;
          border: 1px solid #e3d8ce;
          border-radius: 15px;
          background: #fffdf9;
          box-shadow: 0 2px 5px rgba(70, 48, 38, 0.04);
        }

        .message-panel {
          padding: 14px 18px;
        }

        .success {
          color: #276749;
          font-weight: 700;
        }

        .error {
          color: #a52d2d;
          font-weight: 700;
        }

        .filters-heading,
        .section-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .filters-reset {
          color: #70443f;
          font-size: 13px;
          font-weight: 700;
        }

        .filters-form {
          display: grid;
          grid-template-columns: minmax(220px, 2fr) repeat(4, minmax(120px, 1fr)) auto;
          gap: 10px;
          align-items: end;
        }

        .filter-search,
        .filter-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }

        .filter-search label,
        .filter-field label {
          color: #70443f;
          font-size: 12px;
          font-weight: 700;
        }

        .filter-search input,
        .filter-field input,
        .filter-field select {
          width: 100%;
          min-width: 0;
          height: 38px;
          padding: 0 9px;
          border: 1px solid #cdbba3;
          border-radius: 7px;
          background: #fff;
          color: #493532;
        }

        .filter-submit {
          height: 38px;
          padding: 0 15px;
          border: 0;
          border-radius: 8px;
          background: #70443f;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }

        .empty {
          padding: 24px 0;
          color: #8c7770;
        }

        @media (max-width: 1200px) {
          .filters-form {
            grid-template-columns: repeat(3, minmax(150px, 1fr));
          }

          .filter-search {
            grid-column: span 3;
          }
        }

        @media (max-width: 800px) {
          .shell {
            display: block;
          }

          .sidebar {
            position: static;
            width: 100%;
            min-width: 0;
            min-height: auto;
          }

          .brand {
            padding-bottom: 12px;
          }

          .admin-navigation {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 4px;
            padding: 0 8px;
          }

          .admin-navigation a {
            border-radius: 7px;
          }

          .side-note {
            margin-top: 12px;
          }

          .content {
            padding: 20px 12px 32px;
          }

          .topbar {
            flex-direction: column;
          }

          .filters-form {
            grid-template-columns: 1fr;
          }

          .filter-search {
            grid-column: auto;
          }

          .filter-submit {
            width: 100%;
          }
        }
      `}</style>
    </>
  )
}
