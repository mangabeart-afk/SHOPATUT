import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

type SearchParams = Promise<{
  search?: string
  status?: string
  courier?: string
  message?: string
  error?: string
}>

type Shipment = {
  id: string
  shipment_code: string
  mailbox_id: string | null
  created_at: string
  shipped_at: string | null
  recipient_name: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  province: string | null
  country: string | null
  courier: string | null
  tracking: string | null
  shipping_cost_eur: number
  status: string
  notes: string | null
}

type Mailbox = {
  id: string
  mailbox_code: string
  customer_id: string
  customer?: {
    first_name: string
    last_name: string
    shipping_address: string | null
    shipping_city: string | null
    shipping_postal_code: string | null
    shipping_country: string | null
  } | null
}

type Article = {
  id: string
  article_code: string
  detail: string | null
  status: string
}

const COURIERS = [
  'GLS',
  'DHL',
  'UPS',
  'POSTE ITALIANE',
  'BRT',
  'SDA',
  'INPOST',
] as const

const STATUSES = [
  'DA_PREPARARE',
  'IN_PREPARAZIONE',
  'SPEDITA',
  'IN_TRANSITO',
  'CONSEGNATA',
  'ANNULLATA',
] as const

const statusLabel = (status: string) =>
  status.replaceAll('_', ' ')

const trackingUrl = (courier: string | null, tracking: string | null) => {
  if (!courier || !tracking) return null

  const code = encodeURIComponent(tracking.trim())

  switch (courier.toUpperCase()) {
    case 'GLS':
      return `https://www.gls-italy.com/it/servizi-per-destinatari/ricerca-spedizione?match=${code}`
    case 'DHL':
      return `https://www.dhl.com/it-it/home/tracking.html?tracking-id=${code}`
    case 'UPS':
      return `https://www.ups.com/track?loc=it_IT&tracknum=${code}`
    case 'POSTE ITALIANE':
      return `https://www.poste.it/cerca-spedizioni?codice=${code}`
    case 'BRT':
      return `https://vas.brt.it/vas/sped_det_show.hsm?N_SHIPMENT=${code}`
    case 'SDA':
      return `https://www.sda.it/wps/portal/sdait.home/servizi_online/ricerca_spedizione?locale=it&reference=${code}`
    case 'INPOST':
      return `https://inpost.it/ricerca-spedizione?tracking=${code}`
    default:
      return null
  }
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const money = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value || 0)

async function createShipment(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const mailboxId = String(formData.get('mailbox_id') || '').trim()
  const courier = String(formData.get('courier') || '').trim()
  const tracking = String(formData.get('tracking') || '').trim()
  const shippingCost = Number(formData.get('shipping_cost_eur') || 0)
  const notes = String(formData.get('notes') || '').trim()

  if (!mailboxId) {
    redirect('/admin/spedizioni?error=Seleziona una casella.')
  }

  if (!COURIERS.includes(courier as (typeof COURIERS)[number])) {
    redirect('/admin/spedizioni?error=Seleziona un corriere valido.')
  }

  if (shippingCost < 0) {
    redirect('/admin/spedizioni?error=Il costo di spedizione non può essere negativo.')
  }

  const selectedArticleIds = formData
    .getAll('article_id')
    .map(String)
    .filter(Boolean)

  if (selectedArticleIds.length === 0) {
    redirect('/admin/spedizioni?error=Seleziona almeno un articolo.')
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('article_assignments')
    .select('article_id,quantity_assigned,status')
    .eq('mailbox_id', mailboxId)
    .eq('status', 'ATTIVA')
    .in('article_id', selectedArticleIds)

  if (assignmentError) {
    redirect(`/admin/spedizioni?error=${encodeURIComponent(assignmentError.message)}`)
  }

  const assignedByArticle = new Map<string, number>()
  for (const row of assignmentRows || []) {
    assignedByArticle.set(
      row.article_id,
      (assignedByArticle.get(row.article_id) || 0) + Number(row.quantity_assigned || 0)
    )
  }

  const items = selectedArticleIds.map((articleId) => ({
    articleId,
    quantity: Number(formData.get(`qty_${articleId}`) || 0),
  }))

  for (const item of items) {
    const assigned = assignedByArticle.get(item.articleId) || 0
    if (item.quantity <= 0 || item.quantity > assigned) {
      redirect(
        `/admin/spedizioni?error=${encodeURIComponent(
          `Quantità non valida per l'articolo ${item.articleId}.`
        )}`
      )
    }
  }

  const { data: mailbox } = await supabase
    .from('mailboxes')
    .select(`
      id,
      customer_id,
      customers (
        first_name,
        last_name,
        shipping_address,
        shipping_city,
        shipping_postal_code,
        shipping_country
      )
    `)
    .eq('id', mailboxId)
    .maybeSingle()

  const customer = Array.isArray(mailbox?.customers)
    ? mailbox?.customers[0]
    : mailbox?.customers

  const recipientName = customer
    ? `${customer.first_name} ${customer.last_name}`.trim()
    : null

  const { data: shipment, error: shipmentError } = await supabase
    .from('shipments')
    .insert({
      mailbox_id: mailboxId,
      recipient_name: recipientName,
      address: customer?.shipping_address || null,
      postal_code: customer?.shipping_postal_code || null,
      city: customer?.shipping_city || null,
      country: customer?.shipping_country || null,
      courier,
      tracking: tracking || null,
      shipping_cost_eur: shippingCost,
      status: tracking ? 'SPEDITA' : 'DA_PREPARARE',
      shipped_at: tracking ? new Date().toISOString() : null,
      notes: notes || null,
    })
    .select('id')
    .single()

  if (shipmentError || !shipment) {
    redirect(
      `/admin/spedizioni?error=${encodeURIComponent(
        shipmentError?.message || 'Impossibile creare la spedizione.'
      )}`
    )
  }

  const shipmentItems = items.map((item) => ({
    shipment_id: shipment.id,
    article_id: item.articleId,
    mailbox_id: mailboxId,
    quantity_shipped: item.quantity,
  }))

  const { error: itemsError } = await supabase
    .from('shipment_items')
    .insert(shipmentItems)

  if (itemsError) {
    await supabase.from('shipments').delete().eq('id', shipment.id)
    redirect(`/admin/spedizioni?error=${encodeURIComponent(itemsError.message)}`)
  }

  redirect('/admin/spedizioni?message=Spedizione registrata correttamente.')
}

async function updateShipment(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const id = String(formData.get('shipment_id') || '').trim()
  const courier = String(formData.get('courier') || '').trim()
  const tracking = String(formData.get('tracking') || '').trim()
  const status = String(formData.get('status') || '').trim()
  const shippingCost = Number(formData.get('shipping_cost_eur') || 0)
  const notes = String(formData.get('notes') || '').trim()

  if (!id) redirect('/admin/spedizioni?error=Spedizione non valida.')
  if (!COURIERS.includes(courier as (typeof COURIERS)[number])) {
    redirect('/admin/spedizioni?error=Corriere non valido.')
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    redirect('/admin/spedizioni?error=Stato non valido.')
  }

  const payload = {
    courier,
    tracking: tracking || null,
    status,
    shipping_cost_eur: shippingCost,
    shipped_at: status === 'SPEDITA' || status === 'IN_TRANSITO' || status === 'CONSEGNATA'
      ? new Date().toISOString()
      : null,
    notes: notes || null,
  }

  const { error } = await supabase
    .from('shipments')
    .update(payload)
    .eq('id', id)

  if (error) {
    redirect(`/admin/spedizioni?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/admin/spedizioni?message=Spedizione aggiornata correttamente.')
}

export default async function AdminSpedizioniPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const params = await searchParams
  const search = params.search?.trim() || ''
  const selectedStatus = params.status?.trim() || ''
  const selectedCourier = params.courier?.trim() || ''
  const message = params.message?.trim() || ''
  const errorMessage = params.error?.trim() || ''

  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select(`
      id,
      mailbox_code,
      customer_id,
      customers (
        first_name,
        last_name,
        shipping_address,
        shipping_city,
        shipping_postal_code,
        shipping_country
      )
    `)
    .order('mailbox_code', { ascending: true })

  const normalizedMailboxes: Mailbox[] = (mailboxes || []).map((m: any) => ({
    id: m.id,
    mailbox_code: m.mailbox_code,
    customer_id: m.customer_id,
    customer: Array.isArray(m.customers) ? m.customers[0] || null : m.customers || null,
  }))

  const { data: assignments } = await supabase
    .from('article_assignments')
    .select('article_id,mailbox_id,quantity_assigned,status')
    .eq('status', 'ATTIVA')

  const assignedByMailbox = new Map<string, Map<string, number>>()
  for (const row of assignments || []) {
    if (!assignedByMailbox.has(row.mailbox_id)) {
      assignedByMailbox.set(row.mailbox_id, new Map())
    }
    const map = assignedByMailbox.get(row.mailbox_id)!
    map.set(row.article_id, (map.get(row.article_id) || 0) + Number(row.quantity_assigned || 0))
  }

  const articleIds = Array.from(
    new Set((assignments || []).map((row) => row.article_id))
  )

  let articles: Article[] = []
  if (articleIds.length) {
    const { data } = await supabase
      .from('articles')
      .select('id,article_code,detail,status')
      .in('id', articleIds)
      .order('article_code', { ascending: true })
    articles = (data || []) as Article[]
  }

  let shipmentsQuery = supabase
    .from('shipments')
    .select(`
      id,
      shipment_code,
      mailbox_id,
      created_at,
      shipped_at,
      recipient_name,
      address,
      postal_code,
      city,
      province,
      country,
      courier,
      tracking,
      shipping_cost_eur,
      status,
      notes
    `)
    .order('created_at', { ascending: false })

  if (selectedStatus) shipmentsQuery = shipmentsQuery.eq('status', selectedStatus)
  if (selectedCourier) shipmentsQuery = shipmentsQuery.eq('courier', selectedCourier)

  const { data: shipmentRows } = await shipmentsQuery
  const shipments = (shipmentRows || []) as Shipment[]

  const mailboxById = new Map(normalizedMailboxes.map((m) => [m.id, m]))

  const filteredShipments = search
    ? shipments.filter((s) => {
        const mailbox = s.mailbox_id ? mailboxById.get(s.mailbox_id) : null
        const text = [
          s.shipment_code,
          s.courier,
          s.tracking,
          s.status,
          s.recipient_name,
          mailbox?.mailbox_code,
        ].filter(Boolean).join(' ').toLowerCase()
        return text.includes(search.toLowerCase())
      })
    : shipments

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin/spedizioni" displayName={profile?.display_name} email={user.email} />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AMMINISTRAZIONE</p>
            <h1>Spedizioni</h1>
          </div>
        </header>

        {message && (
          <section className="panel">
            <div className="success">{message}</div>
          </section>
        )}

        {errorMessage && (
          <section className="panel">
            <div className="error">{errorMessage}</div>
          </section>
        )}

        <section className="panel">
          <h2>Registra nuova spedizione</h2>
          <p className="muted">
            Seleziona la casella e gli articoli assegnati, quindi inserisci corriere e tracking.
          </p>

          <form action={createShipment} className="bulk-action-form">
            <label>
              Casella cliente
              <select name="mailbox_id" required>
                <option value="">Seleziona casella</option>
                {normalizedMailboxes.map((mailbox) => (
                  <option key={mailbox.id} value={mailbox.id}>
                    {mailbox.mailbox_code} — {mailbox.customer
                      ? `${mailbox.customer.first_name} ${mailbox.customer.last_name}`
                      : 'Cliente non trovato'}
                  </option>
                ))}
              </select>
            </label>

            <div className="article-selection-list">
              {articles.length === 0 ? (
                <div className="empty">
                  Nessun articolo assegnato disponibile per una spedizione.
                </div>
              ) : (
                articles.map((article) => (
                  <label className="article-select-row" key={article.id}>
                    <input type="checkbox" name="article_id" value={article.id} />
                    <span>
                      <strong>{article.article_code}</strong>
                      <small>{article.detail || 'Articolo'} · {statusLabel(article.status)}</small>
                    </span>
                    <input
                      type="number"
                      name={`qty_${article.id}`}
                      min="1"
                      step="1"
                      defaultValue="1"
                      style={{ maxWidth: 100 }}
                    />
                  </label>
                ))
              )}
            </div>

            <div className="columns">
              <label>
                Corriere
                <select name="courier" required defaultValue="">
                  <option value="">Seleziona corriere</option>
                  {COURIERS.map((courier) => (
                    <option key={courier} value={courier}>{courier}</option>
                  ))}
                </select>
              </label>

              <label>
                Tracking number
                <input
                  type="text"
                  name="tracking"
                  placeholder="Inserisci il tracking"
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="columns">
              <label>
                Costo spedizione (€)
                <input type="number" name="shipping_cost_eur" min="0" step="0.01" defaultValue="0" />
              </label>

              <label>
                Note
                <input type="text" name="notes" placeholder="Note opzionali" />
              </label>
            </div>

            <button type="submit">Registra spedizione</button>
          </form>
        </section>

        <section className="panel">
          <h2>Ricerca e filtri</h2>
          <form action="/admin/spedizioni" method="get" className="form">
            <label>
              Cerca
              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Codice spedizione, cliente, casella, tracking..."
              />
            </label>

            <div className="columns">
              <label>
                Stato
                <select name="status" defaultValue={selectedStatus}>
                  <option value="">Tutti</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{statusLabel(status)}</option>
                  ))}
                </select>
              </label>

              <label>
                Corriere
                <select name="courier" defaultValue={selectedCourier}>
                  <option value="">Tutti</option>
                  {COURIERS.map((courier) => (
                    <option key={courier} value={courier}>{courier}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="actions">
              <button type="submit">Filtra</button>
              <a href="/admin/spedizioni" className="back-button">Azzera filtri</a>
            </div>
          </form>
        </section>

        <section className="panel">
          <h2>{search || selectedStatus || selectedCourier ? 'Risultati' : 'Elenco spedizioni'}</h2>

          {filteredShipments.length === 0 ? (
            <div className="empty">Nessuna spedizione trovata.</div>
          ) : (
            <div className="movement-list">
              {filteredShipments.map((shipment) => {
                const mailbox = shipment.mailbox_id ? mailboxById.get(shipment.mailbox_id) : null
                const url = trackingUrl(shipment.courier, shipment.tracking)

                return (
                  <div className="movement" key={shipment.id}>
                    <div>
                      <b>{shipment.shipment_code}</b>
                      <span>Casella: {mailbox?.mailbox_code || '—'}</span>
                      <span>Destinatario: {shipment.recipient_name || '—'}</span>
                      <span>Stato: <strong>{statusLabel(shipment.status)}</strong></span>
                      <span>Data spedizione: {formatDate(shipment.shipped_at)}</span>
                      {shipment.tracking && (
                        <span>
                          Tracking: <strong>{shipment.tracking}</strong>
                          {url && (
                            <> · <a href={url} target="_blank" rel="noreferrer">Traccia spedizione ↗</a></>
                          )}
                        </span>
                      )}
                      {shipment.courier && <span>Corriere: {shipment.courier}</span>}
                      {shipment.shipping_cost_eur > 0 && (
                        <span>Costo: {money(Number(shipment.shipping_cost_eur))}</span>
                      )}
                    </div>

                    <form action={updateShipment} className="form" style={{ minWidth: 280 }}>
                      <input type="hidden" name="shipment_id" value={shipment.id} />

                      <label>
                        Corriere
                        <select name="courier" defaultValue={shipment.courier || ''}>
                          {COURIERS.map((courier) => (
                            <option key={courier} value={courier}>{courier}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Tracking
                        <input type="text" name="tracking" defaultValue={shipment.tracking || ''} />
                      </label>

                      <label>
                        Stato
                        <select name="status" defaultValue={shipment.status}>
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>{statusLabel(status)}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Costo (€)
                        <input type="number" name="shipping_cost_eur" min="0" step="0.01" defaultValue={Number(shipment.shipping_cost_eur || 0)} />
                      </label>

                      <label>
                        Note
                        <input type="text" name="notes" defaultValue={shipment.notes || ''} />
                      </label>

                      <button type="submit">Salva modifiche</button>
                    </form>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
