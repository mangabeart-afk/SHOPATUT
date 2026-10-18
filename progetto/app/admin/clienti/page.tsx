import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabase as publicSupabase } from '../../../lib/supabase'
import { headers } from 'next/headers'
import CustomerCreateModal from '../../../components/customer-create-modal'
import CustomerAutocomplete from '../../../components/customer-autocomplete'
import { getAdminCustomerSummary } from '../../../lib/admin-customer-summary'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = { searchParams: Promise<{ search?: string; sort?: string; message?: string; error?: string }> }

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)

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
  if (!payload.email) redirect("/admin/clienti?error=L'indirizzo email è obbligatorio per creare l'accesso utente.")

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') || 'https'
  const origin = host ? `${protocol}://${host}` : process.env.NEXT_PUBLIC_SITE_URL
  if (!origin) redirect('/admin/clienti?error=URL del sito non configurato.')

  // Usa esattamente lo stesso flusso Auth della registrazione autonoma:
  // signUp -> trigger handle_new_user -> customers + profiles.
  // La password è temporanea e sconosciuta all’utente; il link email porta
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
    redirect(`/admin/clienti?error=${encodeURIComponent(signUpError?.message || 'Impossibile registrare l’utente.')}`)
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
    redirect(`/admin/clienti?error=${encodeURIComponent(mailboxError?.message || 'Utente registrato ma impossibile creare la casella.')}`)
  }

  redirect('/admin/clienti?message=Utente registrato e casella creata correttamente. È stata inviata la mail di conferma per impostare la password.')
}


export default async function UtentiAdminPage({ searchParams }: PageProps) {
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
    mailboxId: row.mailbox_id || null,
    balance: Number(row.balance || 0),
    stock: Number(row.stock || 0),
    box: Number(row.box || row.in_box || 0),
    incoming: Number(row.incoming || 0),
    lastOrder: row.last_order,
    lastPayment: row.last_payment,
  }))

  let rows = customerRows.filter((row: any) => {
    if (!search) return true
    const text = [row.customer.first_name,row.customer.last_name,row.customer.email,row.customer.phone,row.customer.customer_code].filter(Boolean).join(' ').toLowerCase()
    return text.includes(search)
  })

  const sortRows = (list: any[]) => list.sort((a: any, b: any) => {
    if (sort === 'surname') return `${a.customer.last_name} ${a.customer.first_name}`.localeCompare(`${b.customer.last_name} ${b.customer.first_name}`,'it')
    if (sort === 'balance') return b.balance - a.balance
    if (sort === 'last_order') return String(b.lastOrder || '').localeCompare(String(a.lastOrder || ''))
    return `${a.customer.first_name} ${a.customer.last_name}`.localeCompare(`${b.customer.first_name} ${b.customer.last_name}`,'it')
  })
  sortRows(rows)

  const error = params.search && params.search === 'ERROR' ? '' : ''

  const positiveBalanceRows = rows.filter((row: any) => row.balance > 0.005)
  const incomingZeroBalanceRows = rows.filter((row: any) => Math.abs(row.balance) <= 0.005 && row.incoming > 0)
  const availableZeroBalanceRows = rows.filter((row: any) => Math.abs(row.balance) <= 0.005 && row.incoming === 0 && (row.stock > 0 || row.box > 0))
  const otherRows = rows.filter((row: any) => !positiveBalanceRows.includes(row) && !incomingZeroBalanceRows.includes(row) && !availableZeroBalanceRows.includes(row))
  const customerSituationCard = (title: string, groupRows: any[], tone: string, metric: string) => (
    <details className={`customer-situation-accordion ${tone}`}>
      <summary>
        <span className="customer-situation-title">{title}</span>
        <span className="customer-situation-summary">
          <strong>{groupRows.length}</strong> {groupRows.length === 1 ? 'utente' : 'utenti'}
          {metric === 'balance' ? <><strong>{money(groupRows.reduce((sum: number, row: any) => sum + row.balance, 0))}</strong> saldo totale</> : null}
          {metric === 'incoming' ? <><strong>{groupRows.reduce((sum: number, row: any) => sum + row.incoming, 0)}</strong> articoli in arrivo</> : null}
          {metric === 'available' ? <><strong>{groupRows.reduce((sum: number, row: any) => sum + row.stock, 0)}</strong> in stock <strong>{groupRows.reduce((sum: number, row: any) => sum + row.box, 0)}</strong> in box</> : null}
        </span>
        <span className="customer-situation-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="customer-situation-rows">
        {groupRows.map((row: any) => (
          <a className="customer-situation-row" href={`/admin/clienti/${row.customer.id}`} key={row.customer.id}>
            <div className="customer-situation-row-heading">
              <strong>{`${row.customer.first_name || ''} ${row.customer.last_name || ''}`.trim() || 'Utente'}</strong>
              <b>{row.customer.customer_code || '—'}</b>
            </div>
            <div className="customer-situation-row-metrics">
              <span className="situation-metric balance"><small>Saldo</small><strong>{money(row.balance)}</strong></span>
              <span className="situation-metric incoming"><small>IN ARRIVO</small><strong>{row.incoming}</strong></span>
              <span className="situation-metric stock"><small>IN STOCK</small><strong>{row.stock}</strong></span>
              <span className="situation-metric box"><small>IN BOX</small><strong>{row.box}</strong></span>
            </div>
          </a>
        ))}
      </div>
    </details>
  )

  return <main className="shell">
    <Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email} />
    <section className="content">
      <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Utenti</h1></div></header>

      {params.message && <section className="panel"><div className="success">{params.message}</div></section>}
      {params.error && <section className="panel"><div className="error">{params.error}</div></section>}
      {summaryError && <section className="panel"><div className="error">Impossibile caricare l'elenco utenti: {summaryError.message}</div></section>}

      <section className="panel">
        <h2>Ricerca e ordinamento utenti</h2>
        <form action="/admin/clienti" method="get" className="form">
          <label>Cerca utente<CustomerAutocomplete name="search" value={params.search || ''} placeholder="Codice utente, nome o cognome..." options={customerRows.map((row: any) => ({ id: row.customer.id, code: row.customer.customer_code || '', name: `${row.customer.first_name || ''} ${row.customer.last_name || ''}`.trim(), email: row.customer.email || null }))} /></label>
          <label>Ordina utenti per<select name="sort" defaultValue={sort}><option value="name">Nome</option><option value="surname">Cognome</option><option value="balance">Saldo</option><option value="last_order">Data ultimo ordine</option></select></label>
          <button type="submit">Applica</button>
          {(search || sort !== 'name') && <a href="/admin/clienti" className="back-button">Azzera filtri</a>}
        </form>
      </section>

      <section className="panel customer-situation-panel">
        <div className="section-heading">
          <h2>Utenti per situazione</h2>
          <CustomerCreateModal action={createCustomerMailbox} />
        </div>
        {rows.length === 0 ? <div className="empty">Nessun utente trovato.</div> : <div className="customer-situation-groups">
          {customerSituationCard('Caselle con saldo > 0 €', positiveBalanceRows, 'tone-balance', 'balance')}
          {customerSituationCard('Caselle con saldo 0 € + articoli in arrivo', incomingZeroBalanceRows, 'tone-incoming', 'incoming')}
          {customerSituationCard('Caselle con saldo 0 € + nessun arrivo e articoli disponibili', availableZeroBalanceRows, 'tone-available', 'available')}
          {otherRows.length > 0 ? customerSituationCard('Caselle inattive', otherRows, 'tone-other', 'other') : null}
        </div>}
      </section>


    </section>
  </main>
}
