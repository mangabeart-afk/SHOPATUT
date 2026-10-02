import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabase as publicSupabase } from '../../../lib/supabase'
import { headers } from 'next/headers'
import CustomerDeleteButton from '../../../components/customer-delete-button'
import CustomerCreateModal from '../../../components/customer-create-modal'
import { getAdminCustomerSummary } from '../../../lib/admin-customer-summary'

type PageProps = { searchParams: Promise<{ search?: string; sort?: string; message?: string; error?: string }> }

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
const dateOnly = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value)) : '—'

async function createCustomerMailbox(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const payload = {
    first_name: String(formData.get('first_name') || '').trim(),
    last_name: String(formData.get('last_name') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    mailbox_notes: String(formData.get('mailbox_notes') || '').trim(),
    shipping_address: String(formData.get('shipping_address') || '').trim(),
    shipping_city: String(formData.get('shipping_city') || '').trim(),
    shipping_postal_code: String(formData.get('shipping_postal_code') || '').trim(),
    shipping_country: String(formData.get('shipping_country') || '').trim(),
  }

  if (!payload.first_name || !payload.last_name) redirect('/admin/clienti?error=Nome e cognome sono obbligatori.')
  if (!payload.email) redirect("/admin/clienti?error=L'indirizzo email è obbligatorio per creare l'accesso cliente.")

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') || 'https'
  const origin = host ? `${protocol}://${host}` : process.env.NEXT_PUBLIC_SITE_URL
  if (!origin) redirect('/admin/clienti?error=URL del sito non configurato.')

  // Usa esattamente lo stesso flusso Auth della registrazione autonoma:
  // signUp -> trigger handle_new_user -> customers + profiles.
  // La password è temporanea e sconosciuta al cliente; il link email porta
  // alla schermata di impostazione della password definitiva.
  const temporaryPassword = `${crypto.randomUUID()}Aa9!`
  const { data: signUpData, error: signUpError } = await publicSupabase.auth.signUp({
    email: payload.email,
    password: temporaryPassword,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/recupera-password/reset`,
      data: {
        first_name: payload.first_name,
        last_name: payload.last_name,
        phone: payload.phone,
        shipping_address: payload.shipping_address,
        shipping_postal_code: payload.shipping_postal_code,
        shipping_city: payload.shipping_city,
        shipping_country: payload.shipping_country,
      },
    },
  })

  if (signUpError || !signUpData.user) {
    redirect(`/admin/clienti?error=${encodeURIComponent(signUpError?.message || 'Impossibile registrare il cliente.')}`)
  }

  const authUserId = signUpData.user.id
  const admin = createAdminClient()

  const { data: createdMailbox, error: mailboxError } = await supabase.rpc('admin_create_mailbox_for_auth_user', {
    p_user_id: authUserId,
    p_status: 'ATTIVA',
    p_opened_at: new Date().toISOString().slice(0, 10),
    p_notes: payload.mailbox_notes || null,
  })

  if (mailboxError || !createdMailbox) {
    const { data: authProfile } = await admin
      .from('profiles')
      .select('customer_id')
      .eq('user_id', authUserId)
      .maybeSingle()
    if (authProfile?.customer_id) {
      await supabase.rpc('admin_delete_customer', { p_customer_id: authProfile.customer_id })
    }
    await admin.auth.admin.deleteUser(authUserId)
    redirect(`/admin/clienti?error=${encodeURIComponent(mailboxError?.message || 'Cliente registrato ma impossibile creare la casella.')}`)
  }

  redirect('/admin/clienti?message=Cliente registrato e casella creata correttamente. È stata inviata la mail di conferma per impostare la password.')
}

async function deleteCustomer(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const customerId = String(formData.get('customer_id') || '').trim()
  if (!customerId) redirect('/admin/clienti?error=Cliente non valido.')
  const { error } = await supabase.rpc('admin_delete_customer', { p_customer_id: customerId })
  if (error) redirect(`/admin/clienti?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/clienti?message=Cliente cancellato correttamente.')
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
  const { data: summaryRows, error: summaryError } = await getAdminCustomerSummary(supabase)

  const customerRows = (summaryRows || []).map((row: any) => ({
    customer: {
      id: row.customer_id,
      customer_code: row.customer_code,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
    },
    mailbox: row.mailbox_id ? { id: row.mailbox_id, mailbox_code: row.mailbox_code } : null,
    balance: Number(row.balance || 0),
    stock: Number(row.stock || 0),
    incoming: Number(row.incoming || 0),
    lastOrder: row.last_order,
    lastPayment: row.last_payment,
  }))

  let rows = customerRows.filter((row: any) => {
    if (!search) return true
    const text = [row.customer.first_name,row.customer.last_name,row.customer.email,row.customer.phone,row.customer.customer_code,row.mailbox?.mailbox_code].filter(Boolean).join(' ').toLowerCase()
    return text.includes(search)
  })

  const inactiveCutoff = new Date()
  inactiveCutoff.setHours(0, 0, 0, 0)
  inactiveCutoff.setMonth(inactiveCutoff.getMonth() - 3)

  const isInactive = (row: any) =>
    row.stock === 0 &&
    row.incoming === 0 &&
    Math.abs(Number(row.balance || 0)) < 0.005 &&
    !!row.lastOrder &&
    !!row.lastPayment &&
    new Date(row.lastOrder).getTime() <= inactiveCutoff.getTime() &&
    new Date(row.lastPayment).getTime() <= inactiveCutoff.getTime()

  const inactiveRows = rows.filter(isInactive)
  rows = rows.filter((row: any) => !isInactive(row))

  const sortRows = (list: any[]) => list.sort((a: any, b: any) => {
    if (sort === 'surname') return `${a.customer.last_name} ${a.customer.first_name}`.localeCompare(`${b.customer.last_name} ${b.customer.first_name}`,'it')
    if (sort === 'balance') return b.balance - a.balance
    if (sort === 'last_order') return String(b.lastOrder || '').localeCompare(String(a.lastOrder || ''))
    return `${a.customer.first_name} ${a.customer.last_name}`.localeCompare(`${b.customer.first_name} ${b.customer.last_name}`,'it')
  })
  sortRows(rows)
  sortRows(inactiveRows)

  const error = params.search && params.search === 'ERROR' ? '' : ''

  return <main className="shell">
    <Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email} />
    <section className="content">
      <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Clienti</h1></div></header>

      {params.message && <section className="panel"><div className="success">{params.message}</div></section>}
      {params.error && <section className="panel"><div className="error">{params.error}</div></section>}
      {summaryError && <section className="panel"><div className="error">Impossibile caricare l'elenco clienti: {summaryError.message}</div></section>}

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
        <div className="section-heading">
          <h2>Clienti</h2>
          <CustomerCreateModal action={createCustomerMailbox} />
        </div>
        {rows.length === 0 ? <div className="empty">Nessun cliente trovato.</div> : <div className="movement-list">
          {rows.map((row: any) => <div className="customer-compact-row" key={row.customer.id}>
            <div className="customer-compact-grid customer-compact-grid-main">
              <span><b>CODICE CLIENTE</b><a href={`/admin/clienti/${row.customer.id}`}>{row.customer.customer_code || row.mailbox?.mailbox_code || '—'}</a></span>
              <span><b>NOME COGNOME</b>{row.customer.first_name} {row.customer.last_name}</span>
              <span><b>TELEFONO</b>{row.customer.phone || '—'}</span>
              <span><b>MAIL</b>{row.customer.email || '—'}</span>
            </div>
            <div className="customer-compact-grid customer-compact-grid-meta">
              <span><b>SALDO RESIDUO</b><strong>{money(row.balance)}</strong></span>
              <span><b>ARTICOLI IN STOCK</b>{row.stock}</span>
              <span><b>ARTICOLI IN ARRIVO</b>{row.incoming}</span>
              <span><b>ULTIMO ORDINE</b>{dateOnly(row.lastOrder)}</span>
              <span className="customer-row-actions"><CustomerDeleteButton action={deleteCustomer} customerId={row.customer.id} customerName={`${row.customer.first_name} ${row.customer.last_name}`.trim()} compact /></span>
            </div>
          </div>)}
        </div>}
      </section>

      <section className="panel inactive-customers-panel">
        <div className="section-heading">
          <h2>Clienti inattivi</h2>
          <span className="muted">{inactiveRows.length} clienti</span>
        </div>
        <p className="muted">0 articoli in stock, 0 in arrivo, saldo 0 € e ultimo ordine e pagamento risalenti ad almeno 3 mesi.</p>
        {inactiveRows.length === 0 ? <div className="empty">Nessun cliente inattivo.</div> : <div className="movement-list">
          {inactiveRows.map((row: any) => <div className="customer-compact-row inactive-customer-row" key={`inactive-${row.customer.id}`}>
            <div className="customer-compact-grid customer-compact-grid-main">
              <span><b>CODICE CLIENTE</b><a href={`/admin/clienti/${row.customer.id}`}>{row.customer.customer_code || row.mailbox?.mailbox_code || '—'}</a></span>
              <span><b>NOME COGNOME</b>{row.customer.first_name} {row.customer.last_name}</span>
              <span><b>ULTIMO ORDINE</b>{dateOnly(row.lastOrder)}</span>
              <span><b>ULTIMO PAGAMENTO</b>{dateOnly(row.lastPayment)}</span>
              <span><b>STATO</b><strong>INATTIVO</strong></span>
            </div>
          </div>)}
        </div>}
      </section>
    </section>
  </main>
}
