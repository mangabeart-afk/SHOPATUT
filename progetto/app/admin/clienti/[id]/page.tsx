import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import Navigation from '../../../../components/navigation'
import CustomerEditModal from '../../../../components/customer-edit-modal'

type PageProps = {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    message?: string
    error?: string
  }>
}


async function updateCustomer(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const customerId = String(formData.get('customer_id') || '').trim()
  const mailboxId = String(formData.get('mailbox_id') || '').trim()
  if (!customerId) redirect('/admin/clienti?error=Cliente non valido.')

  const requestedMailboxCode = String(formData.get('mailbox_code') || '').trim()

  const customerPayload = {
    first_name: String(formData.get('first_name') || '').trim(),
    last_name: String(formData.get('last_name') || '').trim(),
    email: String(formData.get('email') || '').trim() || null,
    phone: String(formData.get('phone') || '').trim() || null,
    notes: String(formData.get('notes') || '').trim() || null,
    shipping_address: String(formData.get('shipping_address') || '').trim() || null,
    shipping_city: String(formData.get('shipping_city') || '').trim() || null,
    shipping_postal_code: String(formData.get('shipping_postal_code') || '').trim() || null,
    shipping_country: String(formData.get('shipping_country') || '').trim() || null,
  }
  if (!customerPayload.first_name || !customerPayload.last_name) redirect(`/admin/clienti/${customerId}?error=Nome e cognome sono obbligatori.`)

  const { error } = await supabase.from('customers').update(customerPayload).eq('id', customerId)
  if (error) redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(error.message)}`)

  let mailboxCode: string | null = null
  if (mailboxId) {
    if (!requestedMailboxCode) redirect(`/admin/clienti/${customerId}?error=Il codice cliente è obbligatorio.`)

    const { data: updatedMailboxCode, error: codeError } = await supabase.rpc('admin_update_mailbox_code', {
      p_mailbox_id: mailboxId,
      p_mailbox_code: requestedMailboxCode,
    })
    if (codeError) redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(codeError.message)}`)

    const { error: mailboxError } = await supabase.from('mailboxes').update({
      status: String(formData.get('mailbox_status') || 'ATTIVA'),
      opened_at: String(formData.get('opened_at') || new Date().toISOString().slice(0, 10)),
      notes: String(formData.get('mailbox_notes') || '').trim() || null,
    }).eq('id', mailboxId).eq('customer_id', customerId)
    if (mailboxError) redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(mailboxError.message)}`)
    const { data: mb } = await supabase.from('mailboxes').select('mailbox_code').eq('id', mailboxId).maybeSingle()
    mailboxCode = updatedMailboxCode || mb?.mailbox_code || null
  }

  await supabase.from('movements').insert({
    mailbox_id: mailboxId || null,
    movement_type: 'MODIFICA',
    reference_id: customerId,
    reference_code: mailboxCode,
    description: 'Dati cliente modificati',
    operator_user_id: user.id,
  })
  redirect(`/admin/clienti/${customerId}?message=Dati cliente aggiornati correttamente.`)
}

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function ClienteDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const query = await searchParams

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

  const { data: customer, error } = await supabase
    .from('customers')
    .select(
      `
        id,
        
        first_name,
        last_name,
        email,
        phone,
        notes,
        shipping_address,
        shipping_city,
        shipping_postal_code,
        shipping_country,
        created_at
      `
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !customer) {
    notFound()
  }

  const { data: customerMailboxes } = await supabase
    .from('mailboxes')
    .select('id,mailbox_code,status,opened_at,notes')
    .eq('customer_id', id)
    .order('created_at', { ascending: true })

  const mailbox = customerMailboxes?.[0] || null

  const fullName =
    `${customer.first_name || ''} ${customer.last_name || ''}`.trim()

  const shippingAddressExists =
    Boolean(customer.shipping_address) ||
    Boolean(customer.shipping_city) ||
    Boolean(customer.shipping_postal_code) ||
    Boolean(customer.shipping_country)

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email} />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>
              {fullName || 'Cliente'}
            </h1>
          </div>

          <div className="topbar-actions">
            <CustomerEditModal action={updateCustomer} customer={customer} mailbox={mailbox} />
            <a href="/admin/clienti" className="back-button">← Clienti</a>
          </div>
        </header>

        {/* ANAGRAFICA CLIENTE */}
        <section className="panel customer-summary-panel">
          <div className="customer-summary-head">
            <div>
              <h2>Anagrafica cliente</h2>
              <div className="customer-summary-grid">
                <span><b>Codice</b><strong>{mailbox?.mailbox_code || '—'}</strong></span>
                <span><b>Nome e cognome</b><strong>{fullName || '—'}</strong></span>
                <span><b>Email</b><strong>{customer.email || '—'}</strong></span>
                <span><b>Telefono</b><strong>{customer.phone || '—'}</strong></span>
                <span><b>Cliente dal</b><strong>{formatDate(customer.created_at)}</strong></span>
              </div>
            </div>
          </div>
          {customer.notes && <div className="customer-notes"><b>Note:</b> {customer.notes}</div>}
        </section>

        <section className="panel">
          <h2>Casella cliente</h2>
          {(customerMailboxes || []).length === 0 ? <div className="empty">Nessuna casella associata.</div> : <div className="movement-list">{(customerMailboxes || []).map((mailbox: any) => <div className="movement" key={mailbox.id}><div><b>{mailbox.mailbox_code}</b><span>Stato: {mailbox.status}</span><span>Aperta: {formatDate(mailbox.opened_at)}</span>{mailbox.notes && <span>Note: {mailbox.notes}</span>}</div></div>)}</div>}
        </section>
        {/* INDIRIZZO DI SPEDIZIONE */}

        <section className="panel">
          <h2>
            Indirizzo di spedizione
          </h2>

          {!shippingAddressExists ? (
            <div className="empty">
              Nessun indirizzo di
              spedizione registrato.
            </div>
          ) : (
            <div className="shipping-address">
              {customer.shipping_address && (
                <strong>
                  {customer.shipping_address}
                </strong>
              )}

              {(customer.shipping_postal_code ||
                customer.shipping_city) && (
                <span>
                  {customer.shipping_postal_code ||
                    ''}
                  {customer.shipping_postal_code &&
                  customer.shipping_city
                    ? ' '
                    : ''}
                  {customer.shipping_city ||
                    ''}
                </span>
              )}

              {customer.shipping_country && (
                <span>
                  {customer.shipping_country}
                </span>
              )}
            </div>
          )}
        </section>

        {query.message && <section className="panel"><div className="success">{query.message}</div></section>}
        {query.error && <section className="panel"><div className="error">{query.error}</div></section>}



        {/* GESTIONE CLIENTE */}

        <section className="panel">
          <h2>Gestione cliente</h2>

          <div className="customer-actions">
            <a
              href={`/admin/clienti/${customer.id}/articoli`}
              className="customer-action"
            >
              <span className="customer-action-title">
                Articoli
              </span>

              <span className="customer-action-text">
                Gestisci gli articoli →
              </span>
            </a>

            <a
              href={`/admin/clienti/${customer.id}/pagamenti`}
              className="customer-action"
            >
              <span className="customer-action-title">
                Pagamenti
              </span>

              <span className="customer-action-text">
                Gestisci i pagamenti →
              </span>
            </a>

            <a
              href={`/admin/clienti/${customer.id}/crediti`}
              className="customer-action"
            >
              <span className="customer-action-title">
                Crediti
              </span>

              <span className="customer-action-text">
                Gestisci i crediti →
              </span>
            </a>

            <a
              href={`/admin/clienti/${customer.id}/movimenti`}
              className="customer-action"
            >
              <span className="customer-action-title">
                Movimenti
              </span>

              <span className="customer-action-text">
                Visualizza i movimenti →
              </span>
            </a>
          </div>
        </section>
      </section>
    </main>
  )
}
