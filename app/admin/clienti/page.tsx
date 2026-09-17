import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

type PageProps = { searchParams: Promise<{ search?: string; sort?: string; message?: string; error?: string }> }

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
const dateOnly = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—'

async function createCustomerMailbox(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const payload = {
    p_first_name: String(formData.get('first_name') || '').trim(),
    p_last_name: String(formData.get('last_name') || '').trim(),
    p_phone: String(formData.get('phone') || '').trim() || null,
    p_email: String(formData.get('email') || '').trim() || null,
    p_status: String(formData.get('status') || 'ATTIVA'),
    p_opened_at: String(formData.get('opened_at') || new Date().toISOString().slice(0, 10)),
    p_notes: String(formData.get('mailbox_notes') || '').trim() || null,
    p_shipping_address: String(formData.get('shipping_address') || '').trim() || null,
    p_shipping_city: String(formData.get('shipping_city') || '').trim() || null,
    p_shipping_postal_code: String(formData.get('shipping_postal_code') || '').trim() || null,
    p_shipping_country: String(formData.get('shipping_country') || '').trim() || null,
  }
  if (!payload.p_first_name || !payload.p_last_name) redirect('/admin/clienti?error=Nome e cognome sono obbligatori.')
  const { error } = await supabase.rpc('admin_create_customer_mailbox', payload)
  if (error) redirect(`/admin/clienti?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/clienti?message=Cliente e nuova casella creati correttamente.')
}

export default async function ClientiAdminPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const params = await searchParams
  const search = params.search?.trim().toLowerCase() || ''
  const sort = params.sort || 'name'
  const [{ data: customers }, { data: mailboxes }, { data: sales }, { data: payments }, { data: assignments }, { data: shipmentItems }, { data: shipments }] = await Promise.all([
    supabase.from('customers').select('id,first_name,last_name,email,phone,notes,created_at'),
    supabase.from('mailboxes').select('id,mailbox_code,customer_id,status,notes'),
    supabase.from('movements').select('mailbox_id,movement_at,total_amount_eur,quantity,article_id').eq('movement_type','VENDITA'),
    supabase.from('payments').select('mailbox_id,amount_eur,amount,payment_date'),
    supabase.from('article_assignments').select('mailbox_id,article_id,quantity_assigned,status').eq('status','ATTIVA'),
    supabase.from('shipment_items').select('mailbox_id,article_id,quantity_shipped,shipment_id'),
    supabase.from('shipments').select('id,status'),
  ])

  const customerRows = customers || []
  const mailboxRows = mailboxes || []
  const salesRows = sales || []
  const paymentRows = payments || []
  const assignmentRows = assignments || []
  const shipmentRows = shipmentItems || []
  const shipmentStatus = new Map((shipments || []).map((s: any) => [s.id, s.status]))
  const mailboxByCustomer = new Map<string, any[]>()
  for (const mailbox of mailboxRows) {
    const list = mailboxByCustomer.get(mailbox.customer_id) || []
    list.push(mailbox)
    mailboxByCustomer.set(mailbox.customer_id, list)
  }

  const articleIds = Array.from(new Set(assignmentRows.map((r: any) => r.article_id)))
  const { data: articles } = articleIds.length ? await supabase.from('articles').select('id,status').in('id', articleIds) : { data: [] as any[] }
  const articleStatus = new Map((articles || []).map((a: any) => [a.id, a.status]))

  const rows = customerRows.map((customer: any) => {
    const customerMailboxes = mailboxByCustomer.get(customer.id) || []
    const mailbox = customerMailboxes[0] || null
    const mailboxIds = new Set(customerMailboxes.map((m: any) => m.id))
    const salesTotal = salesRows.filter((r: any) => mailboxIds.has(r.mailbox_id)).reduce((s: number, r: any) => s + Number(r.total_amount_eur || 0), 0)
    const paymentsTotal = paymentRows.filter((r: any) => mailboxIds.has(r.mailbox_id)).reduce((s: number, r: any) => s + Number(r.amount_eur ?? r.amount ?? 0), 0)
    const assigned = assignmentRows.filter((r: any) => mailboxIds.has(r.mailbox_id))
    const shipped = shipmentRows.filter((r: any) => mailboxIds.has(r.mailbox_id) && shipmentStatus.get(r.shipment_id) !== 'ANNULLATA').reduce((s: number, r: any) => s + Number(r.quantity_shipped || 0), 0)
    const stock = assigned.filter((r: any) => articleStatus.get(r.article_id) === 'IN_STOCK').reduce((s: number, r: any) => s + Number(r.quantity_assigned || 0), 0) - shipped
    const incoming = assigned.filter((r: any) => articleStatus.get(r.article_id) === 'IN_ARRIVO').reduce((s: number, r: any) => s + Number(r.quantity_assigned || 0), 0)
    const lastOrder = salesRows.filter((r: any) => mailboxIds.has(r.mailbox_id)).map((r: any) => r.movement_at).sort().at(-1) || null
    return { customer, mailbox, balance: salesTotal - paymentsTotal, stock: Math.max(0, stock), incoming: Math.max(0, incoming), lastOrder }
  }).filter((row: any) => {
    if (!search) return true
    const text = [row.customer.first_name,row.customer.last_name,row.customer.email,row.customer.phone,row.customer.row.mailbox?.mailbox_code].filter(Boolean).join(' ').toLowerCase()
    return text.includes(search)
  })

  rows.sort((a: any, b: any) => {
    if (sort === 'surname') return `${a.customer.last_name} ${a.customer.first_name}`.localeCompare(`${b.customer.last_name} ${b.customer.first_name}`,'it')
    if (sort === 'balance') return b.balance - a.balance
    if (sort === 'last_order') return String(b.lastOrder || '').localeCompare(String(a.lastOrder || ''))
    return `${a.customer.first_name} ${a.customer.last_name}`.localeCompare(`${b.customer.first_name} ${b.customer.last_name}`,'it')
  })

  const error = params.search && params.search === 'ERROR' ? '' : ''

  return <main className="shell">
    <Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email} />
    <section className="content">
      <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Clienti</h1></div></header>

      {params.message && <section className="panel"><div className="success">{params.message}</div></section>}
      {params.error && <section className="panel"><div className="error">{params.error}</div></section>}

      <section className="panel">
        <h2>Nuova casella cliente</h2>
        <p className="muted">La creazione della casella crea contestualmente il cliente. La sezione Caselle separata non è più necessaria.</p>
        <form action={createCustomerMailbox} className="article-create-form">
          <div className="form-grid">
            <label>Nome<input name="first_name" required /></label>
            <label>Cognome<input name="last_name" required /></label>
            <label>Mail<input type="email" name="email" /></label>
            <label>Telefono<input name="phone" /></label>
            <label>Data apertura<input type="date" name="opened_at" defaultValue={new Date().toISOString().slice(0,10)} required /></label>
            <label>Stato casella<select name="status" defaultValue="ATTIVA"><option value="ATTIVA">ATTIVA</option><option value="SOSPESA">SOSPESA</option><option value="CHIUSA">CHIUSA</option></select></label>
            <label>Indirizzo spedizione<input name="shipping_address" /></label>
            <label>Città<input name="shipping_city" /></label>
            <label>CAP<input name="shipping_postal_code" /></label>
            <label>Paese<input name="shipping_country" defaultValue="Italia" /></label>
            <label className="form-grid-wide">Note casella<textarea name="mailbox_notes" rows={3} /></label>
          </div>
          <button type="submit">Crea cliente + casella</button>
        </form>
      </section>

      <section className="panel">
        <h2>Ricerca e ordinamento clienti</h2>
        <form action="/admin/clienti" method="get" className="form">
          <label>Cerca cliente<input type="search" name="search" defaultValue={params.search || ''} placeholder="Nome, Cognome, Mail, Telefono, codice casella..." /></label>
          <label>Ordina clienti per<select name="sort" defaultValue={sort}><option value="name">Nome</option><option value="surname">Cognome</option><option value="balance">Saldo</option><option value="last_order">Data ultimo ordine</option></select></label>
          <button type="submit">Applica</button>
          {(search || sort !== 'name') && <a href="/admin/clienti" className="back-button">Azzera filtri</a>}
        </form>
      </section>

      <section className="panel">
        <h2>Elenco clienti</h2>
        {rows.length === 0 ? <div className="empty">Nessun cliente trovato.</div> : <div className="movement-list">
          {rows.map((row: any) => <div className="movement" key={row.customer.id}>
            <div>
              <b>{row.customer.first_name} {row.customer.last_name}</b>
              <span>Mail: {row.customer.email || '—'}</span>
              <span>Telefono: {row.customer.phone || '—'}</span>
              <span>Codice casella: {row.mailbox?.mailbox_code || '—'}</span>
              <span>Codice casella: <a href={`/admin/clienti/${row.customer.id}`}>{row.mailbox?.mailbox_code || '—'}</a></span>
              {row.customer.notes && <span>Note: {row.customer.notes}</span>}
            </div>
            <div>
              <span>Saldo residuo: <strong>{money(row.balance)}</strong></span>
              <span>Articoli in stock: <strong>{row.stock}</strong></span>
              <span>Articoli in arrivo: <strong>{row.incoming}</strong></span>
              <span>Ultimo ordine: {dateOnly(row.lastOrder)}</span>
              <a href={`/admin/clienti/${row.customer.id}`} className="back-button">Pagina cliente →</a>
            </div>
          </div>)}
        </div>}
      </section>
    </section>
  </main>
}
