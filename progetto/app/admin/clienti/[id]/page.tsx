import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
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
  if (!customerId) redirect('/admin/clienti?error=Cliente non valido.')

  const requestedCustomerCode = String(formData.get('customer_code') || '').trim()
  const requestedEmail = String(formData.get('email') || '').trim() || null
  const customerPayloadBase = {
    first_name: String(formData.get('first_name') || '').trim(),
    last_name: String(formData.get('last_name') || '').trim(),
    phone: String(formData.get('phone') || '').trim() || null,
    shipping_address: String(formData.get('shipping_address') || '').trim() || null,
    shipping_city: String(formData.get('shipping_city') || '').trim() || null,
    shipping_postal_code: String(formData.get('shipping_postal_code') || '').trim() || null,
    shipping_country: String(formData.get('shipping_country') || '').trim() || null,
    preferred_payment_method: String(formData.get('preferred_payment_method') || '').trim() || null,
  }
  if (!customerPayloadBase.first_name || !customerPayloadBase.last_name) {
    redirect(`/admin/clienti/${customerId}?error=Nome e cognome sono obbligatori.`)
  }
  if (!requestedCustomerCode) {
    redirect(`/admin/clienti/${customerId}?error=Il codice utente è obbligatorio.`)
  }

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
    redirect(`/admin/clienti/${customerId}?error=L'indirizzo email non può essere lasciato vuoto quando il cliente dispone di un account di accesso.`)
  }

  const adminSupabase = createAdminClient()

  // Recupera il profilo cliente corrente. Può non esistere: in tal caso,
  // cambiando/inserendo l'email viene creato un nuovo account di accesso.
  let oldAuthUserId: string | null = null
  let oldProfileExists = false
  let oldDisplayName: string | null = null
  let currentMailboxId: string | null = null

  const { data: currentProfile, error: currentProfileError } = await adminSupabase
    .from('profiles')
    .select('user_id,role,mailbox_id,display_name')
    .eq('customer_id', customerId)
    .eq('role', 'CLIENTE')
    .maybeSingle()

  if (currentProfileError) {
    redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(`Impossibile verificare l'account di accesso: ${currentProfileError.message}`)}`)
  }
  if (currentProfile) {
    oldProfileExists = true
    oldAuthUserId = currentProfile.user_id
    oldDisplayName = currentProfile.display_name
    currentMailboxId = currentProfile.mailbox_id
  }

  if (!currentMailboxId) {
    const { data: mailbox } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .maybeSingle()
    currentMailboxId = mailbox?.id || null
  }

  // Aggiorniamo prima tutti i dati anagrafici non-auth. Se qualcosa fallisce,
  // non viene creato alcun nuovo account.
  const { error: customerError } = await supabase
    .from('customers')
    .update({ ...customerPayloadBase, email: emailChanged ? currentCustomer.email : requestedEmail })
    .eq('id', customerId)
  if (customerError) {
    redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(customerError.message)}`)
  }

  const { data: updatedCustomerCode, error: codeError } = await supabase.rpc('admin_update_customer_code', {
    p_customer_id: customerId,
    p_customer_code: requestedCustomerCode,
  })
  if (codeError) redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(codeError.message)}`)
  const customerCode = updatedCustomerCode || requestedCustomerCode

  if (currentMailboxId) {
    const { error: mailboxError } = await supabase.from('mailboxes').update({
      notes: String(formData.get('mailbox_notes') || '').trim() || null,
    }).eq('id', currentMailboxId).eq('customer_id', customerId)
    if (mailboxError) redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(mailboxError.message)}`)
  }

  let emailProvisioned = false
  let newAuthUserId: string | null = null

  if (emailChanged && nextEmail) {
    // Ogni modifica dell'email crea un NUOVO account Auth. L'account precedente
    // viene scollegato e bloccato; lo storico dei movimenti resta intatto.
    const temporaryPassword = `${crypto.randomUUID()}Aa9!`
    const { data: createdUserData, error: createUserError } = await adminSupabase.auth.admin.createUser({
      email: nextEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        admin_invite: 'true',
        first_name: customerPayloadBase.first_name,
        last_name: customerPayloadBase.last_name,
        phone: customerPayloadBase.phone || '',
        shipping_address: customerPayloadBase.shipping_address || '',
        shipping_postal_code: customerPayloadBase.shipping_postal_code || '',
        shipping_city: customerPayloadBase.shipping_city || '',
        shipping_country: customerPayloadBase.shipping_country || '',
      },
    })

    if (createUserError || !createdUserData.user) {
      redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(`Impossibile creare il nuovo account: ${createUserError?.message || 'utente non creato'}`)}`)
    }

    newAuthUserId = createdUserData.user.id

    const publicSupabase = createPublicSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    )

    const requestHeaders = await headers()
    const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
    const protocol = requestHeaders.get('x-forwarded-proto') || 'https'
    const siteUrl = host ? `${protocol}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL || 'https://mangabeart.vercel.app')

    const { error: recoveryError } = await publicSupabase.auth.resetPasswordForEmail(
      nextEmail,
      { redirectTo: `${siteUrl}/recupera-password/reset` }
    )

    if (recoveryError) {
      await adminSupabase.auth.admin.deleteUser(newAuthUserId)
      redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(`Account creato ma impossibile inviare la mail per impostare la password: ${recoveryError.message}`)}`)
    }

    const newDisplayName = `${customerPayloadBase.first_name} ${customerPayloadBase.last_name}`.trim() || oldDisplayName || 'Cliente'

    if (oldProfileExists && oldAuthUserId) {
      const { error: relinkError } = await adminSupabase
        .from('profiles')
        .update({ user_id: newAuthUserId, role: 'CLIENTE', customer_id: customerId, mailbox_id: currentMailboxId, display_name: newDisplayName, updated_at: new Date().toISOString() })
        .eq('user_id', oldAuthUserId)

      if (relinkError) {
        await supabase.from('customers').update({ email: currentCustomer.email }).eq('id', customerId)
        await adminSupabase.auth.admin.deleteUser(newAuthUserId)
        redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(`Impossibile collegare il nuovo account al cliente: ${relinkError.message}`)}`)
      }

      // L'account precedente resta nello storico Auth per non rompere le FK dei
      // movimenti/pagamenti; viene però bloccato e non è più collegato al cliente.
      try {
        await adminSupabase.auth.admin.updateUserById(oldAuthUserId, { ban_duration: '876000h' })
      } catch {}
    } else {
      const { error: insertProfileError } = await adminSupabase
        .from('profiles')
        .insert({ user_id: newAuthUserId, role: 'CLIENTE', customer_id: customerId, mailbox_id: currentMailboxId, display_name: newDisplayName })

      if (insertProfileError) {
        await supabase.from('customers').update({ email: currentCustomer.email }).eq('id', customerId)
        await adminSupabase.auth.admin.deleteUser(newAuthUserId)
        redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(`Account creato ma impossibile collegarlo al cliente: ${insertProfileError.message}`)}`)
      }
    }

    const { error: emailPersistError } = await supabase.from('customers').update({ email: requestedEmail }).eq('id', customerId)
    if (emailPersistError) {
      // Il collegamento al nuovo account rimane l'ultimo punto da ripristinare.
      if (oldProfileExists && oldAuthUserId) {
        await adminSupabase.from('profiles').update({ user_id: oldAuthUserId }).eq('user_id', newAuthUserId).eq('customer_id', customerId)
      } else {
        await adminSupabase.from('profiles').delete().eq('user_id', newAuthUserId).eq('customer_id', customerId)
      }
      await adminSupabase.auth.admin.deleteUser(newAuthUserId)
      await supabase.from('customers').update({ email: currentCustomer.email }).eq('id', customerId)
      redirect(`/admin/clienti/${customerId}?error=${encodeURIComponent(`Impossibile salvare la nuova email: ${emailPersistError.message}`)}`)
    }

    emailProvisioned = true
  }

  await supabase.from('movements').insert({
    mailbox_id: currentMailboxId || null,
    movement_type: 'MODIFICA',
    reference_id: customerId,
    reference_code: customerCode,
    description: emailProvisioned
      ? `Dati cliente modificati - creato nuovo account di accesso per ${nextEmail}. Inviata mail per impostare una nuova password.`
      : 'Dati cliente modificati',
    operator_user_id: user.id,
  })

  const successMessage = emailProvisioned
    ? 'Dati aggiornati. È stato creato un nuovo account di accesso e al nuovo indirizzo email è stata inviata la mail per impostare una nuova password.'
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
