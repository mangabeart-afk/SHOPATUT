import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import ArchiveArticleActions from './ArchiveArticleActions'
import { updateSelectedArticles, deleteSelectedArticles } from '../actions'
import Navigation from '../../../../components/navigation'
import { notifyArticleArrivals } from '../../../../lib/push'

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
  commission_type: string
  commission_cost: number
  commission_currency: string
  commission_exchange_rate: number
  commission_percent: number
  customs_type: string
  customs_cost: number
  customs_currency: string
  customs_exchange_rate: number
  customs_percent: number
  shipping_type: string
  shipping_cost: number
  shipping_currency: string
  shipping_exchange_rate: number
  shipping_percent: number
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
    year: '2-digit',
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

  const { data: beforeRows } = await supabase
    .from('articles')
    .select('id,status')
    .in('id', articleIds)

  const changedArticleIds = (beforeRows || [])
    .filter((row) => row.status === 'IN_ARRIVO')
    .map((row) => row.id)

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

  if (changedArticleIds.length > 0) {
    await notifyArticleArrivals(changedArticleIds)
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

  const movementDate = String(formData.get('movement_date') || new Date().toISOString().slice(0, 10)).trim()
  const paymentEnabled = formData.get('payment_enabled') === 'on'
  const paymentMode = String(formData.get('payment_mode') || 'ACCONTO').trim().toUpperCase()
  const paymentAmountInput = Number(formData.get('payment_amount') || 0)
  const paymentDate = String(formData.get('payment_date') || movementDate).trim()
  const paymentMethod = String(formData.get('payment_method') || 'CONTANTI').trim()

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

  const saleAmount = lines.reduce((sum, line) => sum + line.quantity * line.price, 0)
  const paymentAmount = paymentMode === 'SALDO' ? saleAmount : paymentAmountInput
  if (paymentEnabled && (paymentAmount <= 0 || paymentAmount > saleAmount)) {
    redirect('/admin/articoli/archivio?error=Il pagamento contestuale deve essere maggiore di zero e non superiore al totale della vendita.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate) || (paymentEnabled && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate))) {
    redirect('/admin/articoli/archivio?error=Data movimento o pagamento non valida.')
  }

  const saleResult: any = await supabase.rpc(
    'register_article_sales',
    {
      p_customer_code: customerCode,
      p_lines: lines,
      p_movement_date: movementDate,
    },
  )

  if (saleResult?.error) {
    redirect(
      `/admin/articoli/archivio?error=${encodeURIComponent(
        saleResult.error.message || 'Errore durante la registrazione della vendita.',
      )}`,
    )
  }

  if (paymentEnabled) {
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('id')
      .ilike('mailbox_code', customerCode)
      .maybeSingle()

    if (mailboxError || !mailbox) {
      redirect(`/admin/articoli/archivio?error=${encodeURIComponent(mailboxError?.message || 'Casella cliente non trovata.')}`)
    }

    const { error: paymentError } = await supabase.rpc('register_customer_payment', {
      p_mailbox_id: mailbox.id,
      p_amount: paymentAmount,
      p_currency: 'EUR',
      p_exchange_rate: 1,
      p_payment_date: paymentDate,
      p_payment_method: paymentMethod,
      p_notes: `Pagamento contestuale vendita ${movementDate}`,
    })

    if (paymentError) {
      redirect(`/admin/articoli/archivio?error=${encodeURIComponent(paymentError.message)}`)
    }
  }

  const { data: mailbox } = await supabase
    .from('mailboxes')
    .select('customer_id')
    .ilike('mailbox_code', customerCode)
    .maybeSingle()

  if (mailbox?.customer_id) {
    redirect(`/admin/clienti/${mailbox.customer_id}?message=${encodeURIComponent(`Vendita registrata per ${customerCode}.`)}`)
  }

  redirect(`/admin/articoli/archivio?message=${encodeURIComponent(`Vendita registrata per il cliente ${customerCode}.`)}`)
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
        commission_type,
        commission_cost,
        commission_currency,
        commission_exchange_rate,
        commission_percent,
        customs_type,
        customs_cost,
        customs_currency,
        customs_exchange_rate,
        customs_percent,
        shipping_type,
        shipping_cost,
        shipping_currency,
        shipping_exchange_rate,
        shipping_percent,
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
    customerOptionsResult,
  ] = await Promise.all([
    articlesQuery,
    supabase.rpc('admin_article_sales_summary'),
    supabase
      .from('mailboxes')
      .select('id,mailbox_code,customer_id,customers(first_name,last_name,email)')
      .order('mailbox_code', { ascending: true }),
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

  const sales = (salesResult.data || []) as Array<Sale & {
    mailbox_id: string | null
    customer_id: string | null
    customer_code: string | null
    customer_name: string | null
    quantity: number | null
    revenue_eur: number | null
  }>

  const usersByArticle = new Map<string, Map<string, { code: string; customerId: string; name: string; total: number }>>()
  for (const row of sales) {
    if (!row.article_id || !row.customer_id) continue
    const byCustomer = usersByArticle.get(row.article_id) || new Map()
    const existing = byCustomer.get(row.customer_id) || {
      code: row.customer_code || '',
      customerId: row.customer_id,
      name: row.customer_name || '',
      total: 0,
    }
    existing.total += Number(row.revenue_eur || 0)
    byCustomer.set(row.customer_id, existing)
    usersByArticle.set(row.article_id, byCustomer)
  }

  /*
  |--------------------------------------------------------------------------
  | DATI VENDITE
  |--------------------------------------------------------------------------
  */

  const soldByArticle = new Map<string, number>()
  const revenueByArticle = new Map<string, number>()

  for (const sale of sales) {
    if (!sale.article_id) continue
    soldByArticle.set(
      sale.article_id,
      (soldByArticle.get(sale.article_id) || 0) + Number(sale.quantity || 0),
    )
    revenueByArticle.set(
      sale.article_id,
      (revenueByArticle.get(sale.article_id) || 0) + Number(sale.revenue_eur || 0),
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
      currency: article.currency,
      unit_price_foreign: Number(article.unit_price_foreign || 0),
      exchange_rate: Number(article.exchange_rate || 1),
      accessory_cost_eur: Number(article.accessory_cost_eur || 0),
      commission_type: article.commission_type,
      commission_cost: Number(article.commission_cost || 0),
      commission_currency: article.commission_currency,
      commission_exchange_rate: Number(article.commission_exchange_rate || 1),
      commission_percent: Number(article.commission_percent || 0),
      customs_type: article.customs_type,
      customs_cost: Number(article.customs_cost || 0),
      customs_currency: article.customs_currency,
      customs_exchange_rate: Number(article.customs_exchange_rate || 1),
      customs_percent: Number(article.customs_percent || 0),
      shipping_type: article.shipping_type,
      shipping_cost: Number(article.shipping_cost || 0),
      shipping_currency: article.shipping_currency,
      shipping_exchange_rate: Number(article.shipping_exchange_rate || 1),
      shipping_percent: Number(article.shipping_percent || 0),
      total_cost_eur: article.total_cost_eur,
      unit_cost_eur: article.unit_cost_eur,
      status: article.status,
      statusLabel: statusLabel(article.status),
      statusClass: statusClass(article.status),
      sold,
      available,
      soldRevenue: revenueByArticle.get(article.id) || 0,
      notes: article.notes,
      userCodes: Array.from(usersByArticle.get(article.id)?.values() || []),
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
              updateSelectedArticles={updateSelectedArticles}
              deleteSelectedArticles={deleteSelectedArticles}
            
        customerOptions={(customerOptionsResult.data || []).map((m: any) => { const customer = Array.isArray(m.customers) ? m.customers[0] : m.customers; return { id: m.customer_id, mailbox_code: m.mailbox_code, first_name: customer?.first_name || '', last_name: customer?.last_name || '', email: customer?.email || null } })}/>
          )}
        </section>
      </section>
    </main>
  )
}
