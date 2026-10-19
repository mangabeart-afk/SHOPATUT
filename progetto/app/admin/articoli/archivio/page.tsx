import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import ArchiveArticleActions from './ArchiveArticleActions'
import { updateArticle, updateSelectedArticles, deleteSelectedArticles } from '../actions'
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
    purchase_month?: string
    purchase_year?: string
    arrival_date?: string
    sort?: string
    page?: string
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
  purchase_source: string | null
  article_type: string
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
  arrival_date: string | null
  commission_mode: string | null
  commission_cost: number | null
  commission_percent: number | null
  commission_currency: string | null
  commission_exchange_rate: number | null
  customs_mode: string | null
  customs_cost: number | null
  customs_percent: number | null
  customs_currency: string | null
  customs_exchange_rate: number | null
  shipping_mode: string | null
  shipping_cost: number | null
  shipping_percent: number | null
  shipping_currency: string | null
  shipping_exchange_rate: number | null
  status: ArticleStatus
}

type Sale = {
  id: string
  article_id: string | null
  quantity: number | null
  total_amount_eur: number | null
  unit_price_eur: number | null
  mailbox_id: string | null
  generic_customer_name: string | null
  customer_name: string | null
}

async function fetchAllRows<T>(queryForRange: (from: number, to: number) => any): Promise<{ data: T[]; error: any }> {
  const rows: T[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryForRange(from, from + pageSize - 1)
    if (error) return { data: [], error }
    const batch = (data || []) as T[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return { data: rows, error: null }
}

/**
 * Fetches related rows for large article sets without building an oversized
 * PostgREST URL. Keeping each `in.(...)` list below 100 UUIDs avoids HTTP 400
 * responses from the gateway when the archive contains ~1,000 articles.
 */
async function fetchRowsForArticleChunks<T>(
  articleIds: string[],
  queryForRange: (chunkIds: string[], from: number, to: number) => any,
): Promise<{ data: T[]; error: any }> {
  const rows: T[] = []
  const chunkSize = 80
  for (let offset = 0; offset < articleIds.length; offset += chunkSize) {
    const chunkIds = articleIds.slice(offset, offset + chunkSize)
    const batch = await fetchAllRows<T>((from, to) => queryForRange(chunkIds, from, to))
    if (batch.error) return { data: [], error: batch.error }
    rows.push(...batch.data)
  }
  return { data: rows, error: null }
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
      return 'SOLD'

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
      p_arrival_date: String(formData.get('arrival_date') || '') || null,
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

  const isGenericCustomer = formData.get('generic_customer') === 'on'
  const rawCustomerCode = String(formData.get('customer_code') || '').trim()
  // Conserva il nome digitato per gli utenti occasionali; per i registrati
  // continua a normalizzare il codice utente in maiuscolo.
  const customerCode = isGenericCustomer ? rawCustomerCode : rawCustomerCode.toUpperCase()

  const movementDate = String(formData.get('movement_date') || new Date().toISOString().slice(0, 10)).trim()
  const paymentEnabled = formData.get('payment_enabled') === 'on'
  const paymentMode = String(formData.get('payment_mode') || 'ACCONTO').trim().toUpperCase()
  const paymentAmountInput = Number(formData.get('payment_amount') || 0)
  const paymentDate = String(formData.get('payment_date') || movementDate).trim()
  const paymentMethod = String(formData.get('payment_method') || 'CONTANTI').trim()

  if (!customerCode) {
    redirect('/admin/articoli/archivio?error=Il codice utente è obbligatorio.')
  }

  let canonicalCustomerCode = customerCode
  let customer: { id: string; customer_code: string } | null = null
  let customerMailbox: { id: string } | null = null

  if (isGenericCustomer) {
    if (customerCode.length < 2) {
      redirect('/admin/articoli/archivio?error=Inserisci il nome dell’utente occasionale.')
    }
    if (paymentEnabled) {
      redirect('/admin/articoli/archivio?error=Per un utente occasionale registra la vendita senza pagamento contestuale; il nominativo non ha una scheda utente o una casella.')
    }
  } else {
    const { data: foundCustomer, error: customerLookupError } = await supabase
      .from('customers')
      .select('id,customer_code')
      .ilike('customer_code', customerCode)
      .maybeSingle()

    if (customerLookupError || !foundCustomer?.customer_code) {
      redirect(`/admin/articoli/archivio?error=${encodeURIComponent(customerLookupError?.message || `Codice utente non trovato: ${customerCode}. Se è una vendita occasionale, seleziona l'opzione Utente occasionale.`)}`)
    }

    customer = foundCustomer
    canonicalCustomerCode = foundCustomer.customer_code
    const { data: foundMailbox, error: customerMailboxError } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('customer_id', foundCustomer.id)
      .maybeSingle()

    if (customerMailboxError) {
      redirect(`/admin/articoli/archivio?error=${encodeURIComponent(customerMailboxError.message)}`)
    }
    customerMailbox = foundMailbox
    if (paymentEnabled && !customerMailbox?.id) {
      redirect('/admin/articoli/archivio?error=L’utente non ha una casella associata: il pagamento contestuale non può essere registrato.')
    }
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
      p_customer_code: canonicalCustomerCode,
      p_lines: lines,
      p_movement_date: movementDate,
      p_is_generic_customer: isGenericCustomer,
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
    const { error: paymentError } = await supabase.rpc('register_customer_payment', {
      p_mailbox_id: customerMailbox!.id,
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

  if (isGenericCustomer) {
    redirect(`/admin/articoli/archivio?message=${encodeURIComponent(`Vendita registrata per utente occasionale: ${canonicalCustomerCode}.`)}`)
  }

  redirect(`/admin/clienti/${customer!.id}?message=${encodeURIComponent(`Vendita registrata per ${canonicalCustomerCode}.`)}`)
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
  const selectedPurchaseMonth = params.purchase_month?.trim() || ''
  const selectedPurchaseYear = params.purchase_year?.trim() || ''
  const selectedArrivalDate = params.arrival_date?.trim() || ''
  const selectedSort = params.sort?.trim() || 'code_desc'
  const pageSize = 100
  const requestedPage = Math.max(1, Number.parseInt(params.page || '1', 10) || 1)
  const monthOnlyFilter = /^\d{1,2}$/.test(selectedPurchaseMonth) && !/^\d{4}$/.test(selectedPurchaseYear)
  const message = params.message?.trim() || ''
  const errorMessage = params.error?.trim() || ''

  /*
  |--------------------------------------------------------------------------
  | QUERY ARTICOLI
  |--------------------------------------------------------------------------
  */

  const buildArticlesQuery = () => {
      let articlesQuery = supabase
      .from('articles')
      .select(
        `
          id,
          article_code,
          photo_url,
          purchase_date,
          arrival_date,
          origin,
          purchase_source,
          article_type,
          seller,
          series,
          detail,
          quantity_purchased,
          currency,
          unit_price_foreign,
          exchange_rate,
          accessory_cost_eur,
          commission_mode,
          commission_cost,
          commission_percent,
          commission_currency,
          commission_exchange_rate,
          customs_mode,
          total_cost_eur,
          unit_cost_eur,
          customs_cost,
          customs_percent,
          customs_currency,
          customs_exchange_rate,
          shipping_mode,
          shipping_cost,
          shipping_percent,
          shipping_currency,
          shipping_exchange_rate,
          notes,
          status
        `,
        { count: 'exact' },
      )
      .is('deleted_at', null)
  
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
          `notes.ilike.%${safeSearch}%`,
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
  
  
    if (/^\d{1,2}$/.test(selectedPurchaseMonth) && /^\d{4}$/.test(selectedPurchaseYear)) {
      const month = Number(selectedPurchaseMonth)
      if (month >= 1 && month <= 12) {
        articlesQuery = articlesQuery.gte('purchase_date', `${selectedPurchaseYear}-${String(month).padStart(2, '0')}-01`)
        const nextYear = Number(selectedPurchaseYear) + (month === 12 ? 1 : 0)
        const nextMonth = month === 12 ? 1 : month + 1
        articlesQuery = articlesQuery.lt('purchase_date', `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
      }
    } else if (/^\d{4}$/.test(selectedPurchaseYear)) {
      articlesQuery = articlesQuery.gte('purchase_date', `${selectedPurchaseYear}-01-01`).lt('purchase_date', `${Number(selectedPurchaseYear) + 1}-01-01`)
    }
  
    if (/^\d{4}-\d{2}-\d{2}$/.test(selectedArrivalDate)) {
      articlesQuery = articlesQuery.eq('arrival_date', selectedArrivalDate)
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
    return articlesQuery
  }

  // Ordine di caricamento deterministico: la selezione/paginazione dei batch
  // non deve dipendere dall'ordinamento scelto nella tabella, applicato poi a tutti i risultati.
  const orderedArticlesQuery = () =>
    buildArticlesQuery()
      .order('article_code', { ascending: false })
      .order('id', { ascending: false })

  let articlesResult: { data: Article[] | null; error: any; count: number | null }
  if (monthOnlyFilter) {
    // Filtro mese senza anno: conserva la ricerca su tutti gli anni, poi pagina i risultati già filtrati.
    const allMonthCandidates = await fetchAllRows<Article>((from, to) => orderedArticlesQuery().range(from, to))
    const filtered = (allMonthCandidates.data || []).filter((article) => article.purchase_date?.slice(5, 7) === selectedPurchaseMonth.padStart(2, '0'))
    articlesResult = { data: filtered, error: allMonthCandidates.error, count: filtered.length }
  } else {
    // Carica l'intero insieme filtrato: il componente gestisce la paginazione visuale
    // e può selezionare con un solo comando tutti i risultati, non solo la pagina corrente.
    const allFiltered = await fetchAllRows<Article>((from, to) => orderedArticlesQuery().range(from, to))
    articlesResult = { data: allFiltered.data || [], error: allFiltered.error, count: (allFiltered.data || []).length }
  }

  const loadedArticleIds = (articlesResult.data || []).map((article) => article.id).filter(Boolean)
  const [salesResult, cancelledSalesResult, assignmentsResult, customerOptionsResult, customersResult] = await Promise.all([
    loadedArticleIds.length
      ? fetchRowsForArticleChunks<Sale & { mailbox_id: string | null; quantity: number | null; generic_customer_name?: string | null; customer_name?: string | null }>(loadedArticleIds, (chunkIds, from, to) => supabase.from('movements').select('id,article_id,mailbox_id,quantity,total_amount_eur,unit_price_eur,generic_customer_name,customer_name').eq('movement_type', 'VENDITA').in('article_id', chunkIds).range(from, to))
      : Promise.resolve({ data: [], error: null }),
    loadedArticleIds.length
      ? fetchRowsForArticleChunks<{ reference_id: string | null; article_id: string | null }>(loadedArticleIds, (chunkIds, from, to) => supabase.from('movements').select('reference_id,article_id').eq('movement_type', 'ANNULLAMENTO').not('reference_id', 'is', null).in('article_id', chunkIds).range(from, to))
      : Promise.resolve({ data: [], error: null }),
    loadedArticleIds.length
      ? fetchRowsForArticleChunks<{ article_id: string | null; mailbox_id: string | null; quantity_assigned: number | null; status: string }>(loadedArticleIds, (chunkIds, from, to) => supabase.from('article_assignments').select('article_id,mailbox_id,quantity_assigned,status').in('article_id', chunkIds).in('status', ['ATTIVA', 'IN_ARRIVO', 'IN_STOCK', 'IN_BOX', 'SPEDITO']).range(from, to))
      : Promise.resolve({ data: [], error: null }),
    fetchAllRows<any>((from, to) => supabase.from('mailboxes').select('id,customer_id,customers(first_name,last_name,email,customer_code)').order('customer_id', { ascending: true }).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('customers').select('id,customer_code,first_name,last_name,email').order('customer_code', { ascending: true }).range(from, to)),
  ])

  /*
  |--------------------------------------------------------------------------
  | ERRORE QUERY
  |--------------------------------------------------------------------------
  */

  if (articlesResult.error || salesResult.error || cancelledSalesResult.error || assignmentsResult.error || customerOptionsResult.error || customersResult.error) {
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
              Impossibile caricare gli articoli: {
                articlesResult.error?.message ||
                salesResult.error?.message ||
                cancelledSalesResult.error?.message ||
                assignmentsResult.error?.message ||
                customerOptionsResult.error?.message ||
                customersResult.error?.message ||
                'errore di caricamento dati.'
              }
            </div>
          </section>
        </section>
      </main>
    )
  }

  const articles =
    (articlesResult.data || []) as Article[]

  const customerOptions = (customerOptionsResult.data || []) as any[]
  const mailboxByCustomerId = new Set(
    customerOptions.map((mailbox: any) => mailbox.customer_id).filter(Boolean),
  )
  const saleCustomerOptions = [
    ...customerOptions.map((mailbox: any) => {
      const customer = Array.isArray(mailbox.customers)
        ? mailbox.customers[0]
        : mailbox.customers
      return {
        id: mailbox.customer_id || mailbox.id,
        customer_code: customer?.customer_code || '',
        first_name: customer?.first_name || '',
        last_name: customer?.last_name || '',
        email: customer?.email || null,
      }
    }),
    ...(customersResult.data || [])
      .filter((customer: any) => !mailboxByCustomerId.has(customer.id))
      .map((customer: any) => ({
        id: customer.id,
        customer_code: customer.customer_code || '',
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        email: customer.email || null,
      })),
  ]
  const mailboxById = new Map(
    customerOptions.map((mailbox: any) => {
      const customer = Array.isArray(mailbox.customers)
        ? mailbox.customers[0]
        : mailbox.customers
      return [mailbox.id, {
        customerId: mailbox.customer_id || null,
        customerCode: customer?.customer_code || '',
        customerName: customer
          ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
          : '',
      }]
    }),
  )

  const assignments = (assignmentsResult.data || []) as Array<{
    article_id: string | null
    mailbox_id: string | null
    quantity_assigned: number | null
    status: string
  }>

  const cancelledSaleIds = new Set(
    (cancelledSalesResult.data || []).map((row) => row.reference_id).filter(Boolean),
  )
  const sales = ((salesResult.data || []) as Array<Sale & {
    mailbox_id: string | null
    quantity: number | null
  }>).filter((sale) => !cancelledSaleIds.has(sale.id))

  type ArchiveBuyer = { code: string; customerId: string | null; name: string; quantity: number; total: number; isGeneric?: boolean }
  const usersByArticle = new Map<string, Map<string, ArchiveBuyer>>()
  for (const row of assignments) {
    if (!row.article_id || !row.mailbox_id) continue
    const mailbox = mailboxById.get(row.mailbox_id)
    if (!mailbox?.customerId) continue

    const byCustomer = usersByArticle.get(row.article_id) || new Map<string, ArchiveBuyer>()
    const existing = byCustomer.get(mailbox.customerId) || {
      code: mailbox.customerCode || '',
      customerId: mailbox.customerId,
      name: mailbox.customerName || '',
      quantity: 0,
      total: 0,
    }
    existing.quantity += Number(row.quantity_assigned || 0)
    byCustomer.set(mailbox.customerId, existing)
    usersByArticle.set(row.article_id, byCustomer)
  }

  // Le vendite occasionali non hanno mailbox né assegnazioni. Le inseriamo
  // comunque tra gli acquirenti dell'articolo, senza creare codici o profili.
  for (const sale of sales) {
    if (sale.mailbox_id || !sale.article_id) continue
    const displayName = String(sale.generic_customer_name || sale.customer_name || '').trim()
    if (!displayName) continue
    const key = `generic:${displayName.toLocaleLowerCase('it-IT')}`
    const byCustomer = usersByArticle.get(sale.article_id) || new Map<string, ArchiveBuyer>()
    const existing = byCustomer.get(key) || {
      code: displayName,
      customerId: null,
      name: displayName,
      quantity: 0,
      total: 0,
      isGeneric: true,
    }
    existing.quantity += Math.max(0, Number(sale.quantity || 0))
    byCustomer.set(key, existing)
    usersByArticle.set(sale.article_id, byCustomer)
  }

  // Pre-aggregazione delle vendite per articolo e acquirente: evita di
  // filtrare l'intero archivio vendite per ogni articolo/utente (costo
  // quadratico quando cresce lo storico).
  const buyerSalesTotals = new Map<string, number>()
  for (const sale of sales) {
    if (!sale.article_id) continue
    const amount = Number(sale.total_amount_eur || 0) !== 0
      ? Number(sale.total_amount_eur || 0)
      : Number(sale.quantity || 0) * Number(sale.unit_price_eur || 0)

    let buyerKey = ''
    if (sale.mailbox_id) {
      const mailbox = mailboxById.get(sale.mailbox_id)
      if (!mailbox?.customerId) continue
      buyerKey = `registered:${sale.article_id}:${mailbox.customerId}`
    } else {
      const saleName = String(sale.generic_customer_name || sale.customer_name || '').trim().toLocaleLowerCase('it-IT')
      if (!saleName) continue
      buyerKey = `generic:${sale.article_id}:${saleName}`
    }
    buyerSalesTotals.set(buyerKey, (buyerSalesTotals.get(buyerKey) || 0) + amount)
  }

  for (const [articleId, byCustomer] of usersByArticle) {
    for (const customer of byCustomer.values()) {
      const buyerKey = customer.isGeneric
        ? `generic:${articleId}:${customer.name.trim().toLocaleLowerCase('it-IT')}`
        : `registered:${articleId}:${customer.customerId}`
      customer.total = buyerSalesTotals.get(buyerKey) || 0
    }
  }


  /*
  |--------------------------------------------------------------------------
  | DATI VENDITE
  |--------------------------------------------------------------------------
  */

  const soldByArticle = new Map<string, number>()
  const revenueByArticle = new Map<string, number>()

  for (const assignment of assignments) {
    if (!assignment.article_id) continue
    soldByArticle.set(
      assignment.article_id,
      (soldByArticle.get(assignment.article_id) || 0) + Number(assignment.quantity_assigned || 0),
    )
  }

  // Solo le vendite senza casella richiedono un incremento aggiuntivo:
  // le vendite dei utenti registrati sono già rappresentate dalle assegnazioni.
  for (const sale of sales) {
    if (sale.mailbox_id || !sale.article_id) continue
    const genericName = String(sale.generic_customer_name || sale.customer_name || '').trim()
    if (!genericName) continue
    soldByArticle.set(
      sale.article_id,
      (soldByArticle.get(sale.article_id) || 0) + Math.max(0, Number(sale.quantity || 0)),
    )
  }

  const activeAssignmentKeys = new Set(
    assignments
      .filter((assignment) => assignment.article_id && assignment.mailbox_id)
      .map((assignment) => `${assignment.article_id}:${assignment.mailbox_id}`),
  )

  for (const sale of sales) {
    if (!sale.article_id) continue
    if (sale.mailbox_id) {
      if (!activeAssignmentKeys.has(`${sale.article_id}:${sale.mailbox_id}`)) continue
    } else if (!String(sale.generic_customer_name || sale.customer_name || '').trim()) {
      continue
    }
    const total = Number(sale.total_amount_eur || 0) || Number(sale.quantity || 0) * Number(sale.unit_price_eur || 0)
    revenueByArticle.set(
      sale.article_id,
      (revenueByArticle.get(sale.article_id) || 0) + total,
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

    // L'assegnazione/vendita non fa avanzare lo stato logistico.
    // Se lo stato salvato è già IN_ARRIVO, resta tale anche con residuo zero.
    // Un record marcato VENDUTO senza data di arrivo viene mostrato IN ARRIVO:
    // SOLD è ammesso solo dopo la registrazione dell'arrivo.
    const displayedStatus: ArticleStatus =
      article.status === 'IN_ARRIVO' || (article.status === 'VENDUTO' && !article.arrival_date)
        ? 'IN_ARRIVO'
        : available <= 0
          ? 'VENDUTO'
          : 'IN_STOCK'

    return {
      id: article.id,
      article_code: article.article_code,
      photo_url: article.photo_url,
      purchase_date: formatDate(article.purchase_date),
      purchase_date_iso: article.purchase_date?.slice(0, 10) || '',
      origin: article.origin,
      purchase_source: article.purchase_source || 'ALTRO',
      article_type: article.article_type || 'ALTRO',
      seller: article.seller,
      series: article.series,
      detail: article.detail,
      quantity_purchased: purchased,
      currency: article.currency,
      unit_price_foreign: Number(article.unit_price_foreign || 0),
      exchange_rate: Number(article.exchange_rate || 1),
      accessory_cost_eur: Number(article.accessory_cost_eur || 0),
      commission_mode: article.commission_mode || 'FIXED',
      commission_cost: Number(article.commission_cost || 0),
      commission_percent: Number(article.commission_percent || 0),
      commission_currency: article.commission_currency || 'EUR',
      commission_exchange_rate: Number(article.commission_exchange_rate || 1),
      customs_mode: article.customs_mode || 'FIXED',
      total_cost_eur: article.total_cost_eur,
      unit_cost_eur: article.unit_cost_eur,
      customs_cost: Number(article.customs_cost || 0),
      customs_percent: Number(article.customs_percent || 0),
      customs_currency: article.customs_currency,
      customs_exchange_rate: Number(article.customs_exchange_rate || 1),
      shipping_mode: article.shipping_mode || 'FIXED',
      shipping_cost: Number(article.shipping_cost || 0),
      shipping_percent: Number(article.shipping_percent || 0),
      shipping_currency: article.shipping_currency,
      shipping_exchange_rate: Number(article.shipping_exchange_rate || 1),
      status: displayedStatus,
      statusLabel: statusLabel(displayedStatus),
      statusClass: statusClass(displayedStatus),
      sold,
      available,
      soldRevenue: revenueByArticle.get(article.id) || 0,
      notes: article.notes,
      arrival_date: article.arrival_date || null,
      userCodes: Array.from(usersByArticle.get(article.id)?.values() || []),
    }
  })


  const normalizedText = (value: string | null | undefined) => (value || '').toLocaleLowerCase('it-IT').trim()
  const compareArticleCodes = (leftCode: string, rightCode: string) => {
    const parseCode = (code: string) => {
      const match = code.trim().match(/^([a-z]*)(\d+)\/(\d+)$/i)
      return match
        ? { prefix: match[1].toLocaleLowerCase('it-IT'), year: Number(match[2]), sequence: Number(match[3]) }
        : null
    }
    const left = parseCode(leftCode)
    const right = parseCode(rightCode)
    if (left && right) {
      return left.prefix.localeCompare(right.prefix, 'it-IT') || left.year - right.year || left.sequence - right.sequence
    }
    return leftCode.localeCompare(rightCode, 'it-IT', { numeric: true, sensitivity: 'base' })
  }
  const codeTieBreak = (a: (typeof articleRows)[number], b: (typeof articleRows)[number]) =>
    compareArticleCodes(b.article_code, a.article_code) || b.id.localeCompare(a.id)
  const compareNumber = (left: number | null | undefined, right: number | null | undefined) => Number(left || 0) - Number(right || 0)
  const sortText = (left: string | null | undefined, right: string | null | undefined) => normalizedText(left).localeCompare(normalizedText(right), 'it-IT', { numeric: true })

  articleRows.sort((a, b) => {
    switch (selectedSort) {
      case 'code_asc': return compareArticleCodes(a.article_code, b.article_code) || a.id.localeCompare(b.id)
      case 'date_asc': return a.purchase_date_iso.localeCompare(b.purchase_date_iso) || codeTieBreak(a, b)
      case 'date_desc': return b.purchase_date_iso.localeCompare(a.purchase_date_iso) || codeTieBreak(a, b)
      case 'series_asc': return sortText(a.series, b.series) || codeTieBreak(a, b)
      case 'series_desc': return sortText(b.series, a.series) || codeTieBreak(a, b)
      case 'detail_asc': return sortText(a.detail, b.detail) || codeTieBreak(a, b)
      case 'detail_desc': return sortText(b.detail, a.detail) || codeTieBreak(a, b)
      case 'quantity_asc': return compareNumber(a.quantity_purchased, b.quantity_purchased) || codeTieBreak(a, b)
      case 'quantity_desc': return compareNumber(b.quantity_purchased, a.quantity_purchased) || codeTieBreak(a, b)
      case 'available_asc': return compareNumber(a.available, b.available) || codeTieBreak(a, b)
      case 'available_desc': return compareNumber(b.available, a.available) || codeTieBreak(a, b)
      case 'total_cost_asc': return compareNumber(a.total_cost_eur, b.total_cost_eur) || codeTieBreak(a, b)
      case 'total_cost_desc': return compareNumber(b.total_cost_eur, a.total_cost_eur) || codeTieBreak(a, b)
      case 'unit_cost_asc': return compareNumber(a.unit_cost_eur, b.unit_cost_eur) || codeTieBreak(a, b)
      case 'unit_cost_desc': return compareNumber(b.unit_cost_eur, a.unit_cost_eur) || codeTieBreak(a, b)
      case 'status_asc': return sortText(a.statusLabel, b.statusLabel) || codeTieBreak(a, b)
      case 'status_desc': return sortText(b.statusLabel, a.statusLabel) || codeTieBreak(a, b)
      case 'users_asc': return compareNumber(a.userCodes.length, b.userCodes.length) || codeTieBreak(a, b)
      case 'users_desc': return compareNumber(b.userCodes.length, a.userCodes.length) || codeTieBreak(a, b)
      case 'type_asc': return sortText(a.article_type, b.article_type) || codeTieBreak(a, b)
      case 'type_desc': return sortText(b.article_type, a.article_type) || codeTieBreak(a, b)
      case 'origin_asc': return sortText(a.origin, b.origin) || codeTieBreak(a, b)
      case 'origin_desc': return sortText(b.origin, a.origin) || codeTieBreak(a, b)
      case 'seller_asc': return sortText(a.seller, b.seller) || codeTieBreak(a, b)
      case 'seller_desc': return sortText(b.seller, a.seller) || codeTieBreak(a, b)
      case 'code_desc':
      default: return compareArticleCodes(b.article_code, a.article_code) || b.id.localeCompare(a.id)
    }
  })

  const hasFilters = Boolean(
    search ||
      selectedStatus ||
      selectedOrigin ||
      selectedSeries ||
      selectedSeller ||
      selectedPurchaseMonth ||
      selectedPurchaseYear ||
      selectedArrivalDate ||
      selectedSort !== 'code_desc',
  )

  const totalArticleCount = Number(articlesResult.count ?? articleRows.length)
  const totalPages = Math.max(1, Math.ceil(totalArticleCount / pageSize))
  const currentPage = Math.min(requestedPage, totalPages)
  const visibleArticleRows = monthOnlyFilter
    ? articleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : articleRows
  const pageHref = (targetPage: number) => {
    const query = new URLSearchParams()
    const filters: Record<string, string> = {
      search, status: selectedStatus, origin: selectedOrigin, series: selectedSeries,
      seller: selectedSeller, purchase_month: selectedPurchaseMonth, purchase_year: selectedPurchaseYear,
      arrival_date: selectedArrivalDate, sort: selectedSort,
    }
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
    query.set('page', String(targetPage))
    return `/admin/articoli/archivio?${query.toString()}`
  }

  const buildSortHref = (targetSort: string) => {
    const query = new URLSearchParams()
    const filters: Record<string, string> = {
      search, status: selectedStatus, origin: selectedOrigin, series: selectedSeries,
      seller: selectedSeller, purchase_month: selectedPurchaseMonth, purchase_year: selectedPurchaseYear,
      arrival_date: selectedArrivalDate,
    }
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
    query.set('sort', targetSort)
    return `/admin/articoli/archivio?${query.toString()}`
  }
  const sortDefinitions = {
    code: { asc: 'code_asc', desc: 'code_desc', default: 'code_desc' },
    date: { asc: 'date_asc', desc: 'date_desc', default: 'date_desc' },
    series: { asc: 'series_asc', desc: 'series_desc', default: 'series_asc' },
    detail: { asc: 'detail_asc', desc: 'detail_desc', default: 'detail_asc' },
    quantity: { asc: 'quantity_asc', desc: 'quantity_desc', default: 'quantity_desc' },
    available: { asc: 'available_asc', desc: 'available_desc', default: 'available_desc' },
    total_cost: { asc: 'total_cost_asc', desc: 'total_cost_desc', default: 'total_cost_desc' },
    unit_cost: { asc: 'unit_cost_asc', desc: 'unit_cost_desc', default: 'unit_cost_desc' },
    status: { asc: 'status_asc', desc: 'status_desc', default: 'status_asc' },
    users: { asc: 'users_asc', desc: 'users_desc', default: 'users_desc' },
  } as const
  const sortLinks = Object.fromEntries(Object.entries(sortDefinitions).map(([field, definition]) => {
    const targetSort = selectedSort === definition.asc
      ? definition.desc
      : selectedSort === definition.desc
        ? definition.asc
        : definition.default
    return [field, buildSortHref(targetSort)]
  })) as Record<keyof typeof sortDefinitions, string>

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

        <details className="panel filters-panel filters-collapsible" open={hasFilters}>
          <summary className="filters-collapsible-summary">
            <span><span className="eyebrow">RICERCA</span><strong>Filtri articoli</strong>{hasFilters ? <small>Filtri attivi</small> : <small>Apri per cercare e filtrare l’archivio</small>}</span>
            <span className="filters-chevron" aria-hidden="true">⌄</span>
          </summary>
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


            <div className="filter-field">
              <label htmlFor="article-purchase-month">Mese acquisto</label>
              <select id="article-purchase-month" name="purchase_month" defaultValue={selectedPurchaseMonth}>
                <option value="">Tutti</option>
                {Array.from({ length: 12 }, (_, index) => {
                  const value = String(index + 1).padStart(2, '0')
                  return <option key={value} value={value}>{value}</option>
                })}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="article-purchase-year">Anno acquisto</label>
              <input id="article-purchase-year" type="number" name="purchase_year" min="2000" max="2100" defaultValue={selectedPurchaseYear} placeholder="AAAA" />
            </div>

            <div className="filter-field">
              <label htmlFor="article-arrival-date">Data arrivo</label>
              <input id="article-arrival-date" type="date" name="arrival_date" defaultValue={selectedArrivalDate} />
            </div>

            <div className="filter-field">
              <label htmlFor="article-sort">Ordina per</label>
              <select id="article-sort" name="sort" defaultValue={selectedSort}>
                <option value="code_desc">Codice — più recenti (predefinito)</option>
                <option value="code_asc">Codice — più vecchi</option>
                <option value="date_desc">Data acquisto — più recenti</option>
                <option value="date_asc">Data acquisto — più vecchi</option>
                <option value="series_asc">Serie — A → Z</option>
                <option value="series_desc">Serie — Z → A</option>
                <option value="detail_asc">Dettagli — A → Z</option>
                <option value="detail_desc">Dettagli — Z → A</option>
                <option value="quantity_desc">Q acquistata — maggiore</option>
                <option value="quantity_asc">Q acquistata — minore</option>
                <option value="available_desc">S disponibile — maggiore</option>
                <option value="available_asc">S disponibile — minore</option>
                <option value="total_cost_desc">Costo totale (€€€) — maggiore</option>
                <option value="total_cost_asc">Costo totale (€€€) — minore</option>
                <option value="unit_cost_desc">Costo unitario (€) — maggiore</option>
                <option value="unit_cost_asc">Costo unitario (€) — minore</option>
                <option value="status_asc">Stato — A → Z</option>
                <option value="status_desc">Stato — Z → A</option>
                <option value="users_desc">Utenti — più numerosi</option>
                <option value="users_asc">Utenti — meno numerosi</option>
                <option value="type_asc">Tipo — A → Z</option>
                <option value="type_desc">Tipo — Z → A</option>
                <option value="origin_asc">Provenienza — A → Z</option>
                <option value="origin_desc">Provenienza — Z → A</option>
                <option value="seller_asc">Venditore — A → Z</option>
                <option value="seller_desc">Venditore — Z → A</option>
              </select>
            </div>

            <button
              type="submit"
              className="filter-submit"
            >
              Applica
            </button>
          </form>
        </details>

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

          </div>

          {totalArticleCount === 0 ? (
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
              updateArticle={updateArticle}
              updateSelectedArticles={updateSelectedArticles}
              deleteSelectedArticles={deleteSelectedArticles}
              selectionScope={JSON.stringify({ search, status: selectedStatus, origin: selectedOrigin, series: selectedSeries, seller: selectedSeller, purchaseMonth: selectedPurchaseMonth, purchaseYear: selectedPurchaseYear, arrivalDate: selectedArrivalDate, sort: selectedSort })}
              selectedSort={selectedSort}
              sortLinks={sortLinks}
              resetSelection={Boolean(message)}
              customerOptions={saleCustomerOptions}
            />
          )}
        </section>
      </section>
    </main>
  )
}
