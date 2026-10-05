import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import { getAdminCustomerSummary } from '../../../../lib/admin-customer-summary'
import { createAdminClient } from '../../../../lib/supabase-admin'
import { createClient as createPublicSupabaseClient } from '@supabase/supabase-js'
import Navigation from '../../../../components/navigation'
import CustomerEditModal from '../../../../components/customer-edit-modal'
import CustomerDeleteButton from '../../../../components/customer-delete-button'

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

  const requestedCustomerCode = String(formData.get('customer_code') || '').trim()
  const requestedEmail = String(formData.get('email') || '').trim() || null

  const { data: currentCustomer, error: currentCustomerError } = await supabase
    .from('customers')
    .select('id,email')
    .eq('id', customerId)
    .maybeSingle()

  if (currentCustomerError || !currentCustomer) {
    redirect(`/admin/clienti/${customerId}?error=Cliente non trovato.`)
  }

  const currentEmail = String(currentCustomer.email || '').trim().toLowerCase()
  const nextEmail = String(requestedEmail || '').trim().toLowerCase()
  const emailChanged = currentEmail !== nextEmail

  if (emailChanged && !nextEmail) {
    redirect(`/admin/clienti/${customerId}?error=Per un cliente con accesso al sito l'indirizzo email non può essere lasciato vuoto.`)
  }

  let authUserId: string | null = null
  if (emailChanged && nextEmail) {
    const { data: linkedProfile, error: linkedProfileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('customer_id', customerId)
      .eq('role', 'CLIENTE')
      .maybeSingle()

    if (linkedProfileError || !linkedProfile?.user_id) {
      redirect(`/admin/clienti/${customerId}?error=Il cliente non è collegato a un account di accesso.`)
    }

    authUserId = linkedProfile.user_id
  }

  const customerPayload = {
    first_name: String(formData.get('first_name') || '').trim(),
    last_name: String(formData.get('last_name') || '').trim(),
    email: requestedEmail,
    phone: String(formData.get('phone') || '').trim() || null,
    shipping_address: String(formData.get('shipping_address') || '').trim() || null,
    shipping_city: String(formData.get('shipping_city') || '').trim() || null,
    shipping_postal_code: String(formData.get('shipping_postal_code') || '').trim() || null,
    shipping_country: String(formData.get('shipping_country') || '').trim() || null,
    preferred_payment_method: String(formData.get('preferred_payment_method') || '').trim() || null,
  }
  if (!customerPayload.first_name || !customerPayload.last_name) redirect(`/admin/clienti/${customerId}?error=Nome e cognome sono obbligatori.`)


  const { error } = await supabase.from('customers').update(customerPayload).eq('id', customerId)
  if (error) {
    if (emailChanged && nextEmail && authUserId) {
      try {
        await createAdminClient().auth.admin.updateUserById(authUserId, { email: currentEmail })
      } catch {}
    }
    redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(error.message)}`)
  }

  if (!requestedCustomerCode) redirect(`/admin/clienti/${customerId}?error=Il codice utente è obbligatorio.`)

  const { data: updatedCustomerCode, error: codeError } = await supabase.rpc('admin_update_customer_code', {
    p_customer_id: customerId,
    p_customer_code: requestedCustomerCode,
  })
  if (codeError) redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(codeError.message)}`)
  const customerCode = updatedCustomerCode || requestedCustomerCode

  if (mailboxId) {
    const { error: mailboxError } = await supabase.from('mailboxes').update({
      notes: String(formData.get('mailbox_notes') || '').trim() || null,
    }).eq('id', mailboxId).eq('customer_id', customerId)
    if (mailboxError) redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(mailboxError.message)}`)
  }

  // Se l'email cambia, aggiorniamo l'account Auth dal server e poi
  // inviamo al nuovo indirizzo il normale messaggio Supabase di recupero
  // password. In questo modo il cliente deve scegliere una nuova password.
  if (emailChanged && nextEmail && authUserId) {
    const adminSupabase = createAdminClient()

    const { error: authEmailError } = await adminSupabase.auth.admin.updateUserById(
      authUserId,
      { email: nextEmail }
    )

    if (authEmailError) {
      await supabase.from('customers').update({ email: currentCustomer.email }).eq('id', customerId)
      redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(`Impossibile cambiare l'email: ${authEmailError.message}`)}`)
    }

    const publicSupabase = createPublicSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mangabeart.vercel.app'
    const { error: recoveryError } = await publicSupabase.auth.resetPasswordForEmail(
      nextEmail,
      { redirectTo: `${siteUrl}/recupera-password/reset` }
    )

    if (recoveryError) {
      await adminSupabase.auth.admin.updateUserById(authUserId, { email: currentEmail })
      await supabase.from('customers').update({ email: currentCustomer.email }).eq('id', customerId)
      redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(`Email modificata non completata: ${recoveryError.message}`)}`)
    }
  }

  await supabase.from('movements').insert({
    mailbox_id: mailboxId || null,
    movement_type: 'MODIFICA',
    reference_id: customerId,
    reference_code: customerCode,
    description: emailChanged
      ? `Dati cliente modificati - email cambiata a ${nextEmail}. Inviato link per impostare una nuova password.`
      : 'Dati cliente modificati',
    operator_user_id: user.id,
  })

  const successMessage = emailChanged
    ? 'Dati aggiornati. Al nuovo indirizzo email è stato inviato il messaggio per completare il cambio e impostare una nuova password.'
    : 'Dati cliente aggiornati correttamente.'

  redirect(`/admin/clienti/${customerId}?message=${encodeURIComponent(successMessage)}`)
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
  if (error) redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/clienti?message=Cliente cancellato correttamente.')
}

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
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
        customer_code,
        first_name,
        last_name,
        email,
        phone,
        shipping_address,
        shipping_city,
        shipping_postal_code,
        shipping_country,
        preferred_payment_method,
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
    .select('id,notes')
    .eq('customer_id', id)
    .order('created_at', { ascending: true })

  const mailbox = customerMailboxes?.[0] || null

  const fullName =
    `${customer.first_name || ''} ${customer.last_name || ''}`.trim()

  const { data: summaryRows } = await getAdminCustomerSummary(supabase)
  const customerSummary = summaryRows.find((row) => row.customer_id === id)
  const customerBalance = Number(customerSummary?.balance || 0)

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
            <CustomerDeleteButton action={deleteCustomer} customerId={customer.id} customerName={fullName || 'Cliente'} />
            <a href="/admin/clienti" className="back-button">← Clienti</a>
          </div>
        </header>

        <section className="panel customer-summary-panel">
          <div className="customer-summary-head">
            <div>
              <h2>Cliente e casella</h2>
              <div className="customer-summary-grid">
                <span><b>Codice utente</b><strong>{customer.customer_code || '—'}</strong></span>
                <span><b>Nome e cognome</b><strong>{fullName || '—'}</strong></span>
                <span><b>Email</b><strong>{customer.email || '—'}</strong></span>
                <span><b>Telefono</b><strong>{customer.phone || '—'}</strong></span>
                <span><b>Pagamento preferito</b><strong>{customer.preferred_payment_method || '—'}</strong></span>
                <span><b>Saldo</b><strong>{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(customerBalance)}</strong></span>
                {mailbox?.notes && <span className="form-grid-wide"><b>Note casella</b><strong>{mailbox.notes}</strong></span>}
              </div>
            </div>
          </div>
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
