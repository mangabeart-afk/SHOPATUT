import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import AdminWorkbookLayout from '../../../../components/admin-workbook-layout'
import CustomerProfileEditModal from '../../../../components/customer-profile-edit-modal'
import ReadOnlyTable from '../../../../components/read-only-table'
import { createClient } from '../../../../lib/supabase-server'
import { createAdminClient } from '../../../../lib/supabase-admin'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money } from '../../../../lib/excel-source'
import { requirePageContext } from '../../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ message?: string; error?: string }>
}

function detailUrl(code: string, kind: 'message' | 'error', message: string) {
  return `/admin/clienti/${encodeURIComponent(code)}?${kind}=${encodeURIComponent(message)}`
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const perPage = 1000
  // Pagina l'elenco per non assumere che il progetto abbia meno di 1000 account.
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) return { user: null, error }
    const match = data.users.find((candidate) => String(candidate.email || '').trim().toLowerCase() === normalizedEmail)
    if (match) return { user: match, error: null }
    if (data.users.length < perPage) break
  }
  return { user: null, error: null }
}

async function updateCustomerProfile(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentProfile, error: authProfileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (authProfileError || currentProfile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const customerId = String(formData.get('customer_id') || '').trim()
  const returnCode = String(formData.get('return_code') || '').trim()
  const firstName = String(formData.get('first_name') || '').trim()
  const lastName = String(formData.get('last_name') || '').trim()
  const nextEmail = String(formData.get('email') || '').trim().toLowerCase()
  const phone = String(formData.get('phone') || '').trim() || null
  const shippingAddress = String(formData.get('shipping_address') || '').trim() || null
  const shippingCity = String(formData.get('shipping_city') || '').trim() || null
  const shippingPostalCode = String(formData.get('shipping_postal_code') || '').trim() || null
  const shippingCountry = String(formData.get('shipping_country') || '').trim() || null

  if (!customerId || !returnCode) redirect('/admin/clienti?error=Utente non valido.')
  const back = (kind: 'message' | 'error', text: string): never => redirect(detailUrl(returnCode, kind, text))
  if (!firstName || !lastName) back('error', 'Nome e cognome sono obbligatori.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) back('error', 'Inserisci un indirizzo email valido.')

  const admin = createAdminClient()
  const { data: customer, error: customerReadError } = await admin
    .from('customers')
    .select('id,customer_code,first_name,last_name,email,phone,shipping_address,shipping_city,shipping_postal_code,shipping_country')
    .eq('id', customerId)
    .maybeSingle()
  if (customerReadError) back('error', `Impossibile trovare il profilo utente: ${customerReadError.message}`)
  if (!customer) back('error', 'Impossibile trovare il profilo utente.')
  // Il controllo sopra termina tramite redirect; il non-null assertion rende esplicito
  // a TypeScript che da questo punto il record esiste.
  const customerRecord = customer!

  const oldEmail = String(customerRecord.email || '').trim().toLowerCase()
  const { data: emailCollision, error: emailCollisionError } = await admin
    .from('customers')
    .select('id,customer_code')
    .ilike('email', nextEmail)
    .neq('id', customerId)
    .limit(1)
    .maybeSingle()
  if (emailCollisionError) back('error', `Impossibile verificare l’email: ${emailCollisionError.message}`)
  if (emailCollision) back('error', `Questa email risulta già assegnata all’utente ${emailCollision.customer_code || 'un altro utente'}.`)

  let { data: mailbox, error: mailboxError } = await admin
    .from('mailboxes')
    .select('id')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (mailboxError) back('error', `Impossibile verificare la casella: ${mailboxError.message}`)

  let { data: linkedProfile, error: linkedProfileError } = await admin
    .from('profiles')
    .select('user_id,role,display_name,customer_id,mailbox_id')
    .eq('customer_id', customerId)
    .eq('role', 'CLIENTE')
    .maybeSingle()
  if (linkedProfileError) back('error', `Impossibile verificare l’account: ${linkedProfileError.message}`)

  if (!linkedProfile && mailbox?.id) {
    const fallback = await admin.from('profiles')
      .select('user_id,role,display_name,customer_id,mailbox_id')
      .eq('mailbox_id', mailbox.id)
      .eq('role', 'CLIENTE')
      .maybeSingle()
    if (fallback.error) back('error', `Impossibile verificare l’account collegato alla casella: ${fallback.error.message}`)
    linkedProfile = fallback.data
  }

  let authUserId: string | null = linkedProfile?.user_id || null

  // Supabase Auth richiede univocità globale dell'email, anche quando
  // l'indirizzo non è duplicato nella tabella pubblica customers.
  // Intercettiamo il conflitto prima di tentare l'aggiornamento/creazione.
  if (oldEmail !== nextEmail) {
    const { user: authEmailOwner, error: authEmailLookupError } = await findAuthUserByEmail(admin, nextEmail)
    if (authEmailLookupError) back('error', `Non è stato possibile verificare se l'email è già usata da un account di accesso: ${authEmailLookupError.message}`)
    if (authEmailOwner && authEmailOwner.id !== authUserId) {
      back('error', 'Questo indirizzo email è già collegato a un altro account di accesso. Non ho modificato l’email e non ho inviato il link di recupero. Verifica quale account deve usare questo indirizzo prima di riprovare.')
    }
  }

  let createdAuthUserId: string | null = null
  let previousAuthEmail: string | null = null
  let previousAuthMetadata: Record<string, unknown> | null = null
  let authEmailWasChanged = false
  let shouldSendRecovery = false
  const nextDisplayName = `${firstName} ${lastName}`.trim()
  const metadata = {
    first_name: firstName,
    last_name: lastName,
    phone: phone || '',
    shipping_address: shippingAddress || '',
    shipping_postal_code: shippingPostalCode || '',
    shipping_city: shippingCity || '',
    shipping_country: shippingCountry || '',
  }

  if (authUserId) {
    const { data: authData, error: authReadError } = await admin.auth.admin.getUserById(authUserId)
    if (authReadError || !authData.user) back('error', `L’account collegato non è disponibile: ${authReadError?.message || 'utente Auth non trovato'}.`)
    const authUser = authData.user!
    previousAuthEmail = String(authUser.email || '').trim().toLowerCase()
    previousAuthMetadata = (authUser.user_metadata || {}) as Record<string, unknown>
    shouldSendRecovery = oldEmail !== nextEmail || previousAuthEmail !== nextEmail
    if (previousAuthEmail !== nextEmail) {
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(authUserId, {
        email: nextEmail,
        email_confirm: true,
        user_metadata: { ...(authUser.user_metadata || {}), ...metadata },
      })
      if (authUpdateError) back('error', `Non è stato possibile aggiornare l’email dell’account: ${authUpdateError.message}`)
      authEmailWasChanged = true
    }
  } else if (oldEmail !== nextEmail) {
    // Se l'utente non ha ancora un profilo Auth collegato, il cambio email serve
    // anche a predisporre l'accesso e inviare il link per impostare la password.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: nextEmail,
      password: `${crypto.randomUUID()}Aa9!`,
      email_confirm: true,
      user_metadata: { admin_invite: 'true', ...metadata },
    })
    if (createError || !created.user) back('error', `Non è stato possibile creare l’account: ${createError?.message || 'utente non creato'}`)
    const createdUser = created.user!
    authUserId = createdUser.id
    createdAuthUserId = createdUser.id
    shouldSendRecovery = true
  }


  const { error: customerUpdateError } = await admin.from('customers').update({
    first_name: firstName,
    last_name: lastName,
    email: nextEmail,
    phone: phone,
    shipping_address: shippingAddress,
    shipping_city: shippingCity,
    shipping_postal_code: shippingPostalCode,
    shipping_country: shippingCountry,
  }).eq('id', customerId)

  if (customerUpdateError) {
    if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId)
    else if (authEmailWasChanged && authUserId && previousAuthEmail) {
      await admin.auth.admin.updateUserById(authUserId, { email: previousAuthEmail, email_confirm: true, ...(previousAuthMetadata ? { user_metadata: previousAuthMetadata } : {}) })
    }
    back('error', `Impossibile salvare i dati del profilo: ${customerUpdateError.message}`)
  }

  if (authUserId) {
    const profilePayload = {
      role: 'CLIENTE',
      customer_id: customerId,
      mailbox_id: mailbox?.id || linkedProfile?.mailbox_id || null,
      display_name: nextDisplayName,
      updated_at: new Date().toISOString(),
    }
    if (linkedProfile) {
      const { error: profileUpdateError } = await admin.from('profiles').update(profilePayload).eq('user_id', linkedProfile.user_id)
      if (profileUpdateError) {
        await admin.from('customers').update({
          first_name: customerRecord.first_name,
          last_name: customerRecord.last_name,
          email: customerRecord.email,
          phone: customerRecord.phone,
          shipping_address: customerRecord.shipping_address,
          shipping_city: customerRecord.shipping_city,
          shipping_postal_code: customerRecord.shipping_postal_code,
          shipping_country: customerRecord.shipping_country,
        }).eq('id', customerId)
        if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId)
        else if (authEmailWasChanged && authUserId && previousAuthEmail) await admin.auth.admin.updateUserById(authUserId, { email: previousAuthEmail, email_confirm: true, ...(previousAuthMetadata ? { user_metadata: previousAuthMetadata } : {}) })
        back('error', `Impossibile collegare i dati aggiornati al profilo: ${profileUpdateError.message}`)
      }
    } else {
      const { error: profileInsertError } = await admin.from('profiles').insert({ user_id: authUserId, ...profilePayload })
      if (profileInsertError) {
        await admin.from('customers').update({
          first_name: customerRecord.first_name,
          last_name: customerRecord.last_name,
          email: customerRecord.email,
          phone: customerRecord.phone,
          shipping_address: customerRecord.shipping_address,
          shipping_city: customerRecord.shipping_city,
          shipping_postal_code: customerRecord.shipping_postal_code,
          shipping_country: customerRecord.shipping_country,
        }).eq('id', customerId)
        if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId)
        else if (authEmailWasChanged && authUserId && previousAuthEmail) await admin.auth.admin.updateUserById(authUserId, { email: previousAuthEmail, email_confirm: true, ...(previousAuthMetadata ? { user_metadata: previousAuthMetadata } : {}) })
        back('error', `Account creato ma impossibile collegarlo al profilo utente: ${profileInsertError.message}`)
      }
    }
  }

  if (shouldSendRecovery) {
    const recoveryClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    )
    const requestHeaders = await headers()
    const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
    const protocol = requestHeaders.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https')
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${protocol}://${host}` : 'https://mangabeart.vercel.app')
    const { error: recoveryError } = await recoveryClient.auth.resetPasswordForEmail(nextEmail, {
      redirectTo: `${siteUrl}/recupera-password/reset`,
    })
    if (recoveryError) {
      await admin.from('customers').update({
        first_name: customerRecord.first_name,
        last_name: customerRecord.last_name,
        email: customerRecord.email,
        phone: customerRecord.phone,
        shipping_address: customerRecord.shipping_address,
        shipping_city: customerRecord.shipping_city,
        shipping_postal_code: customerRecord.shipping_postal_code,
        shipping_country: customerRecord.shipping_country,
      }).eq('id', customerId)
      if (linkedProfile && authUserId) {
        await admin.from('profiles').update({
          role: linkedProfile.role,
          customer_id: linkedProfile.customer_id,
          mailbox_id: linkedProfile.mailbox_id,
          display_name: linkedProfile.display_name,
        }).eq('user_id', linkedProfile.user_id)
      } else if (createdAuthUserId) {
        await admin.from('profiles').delete().eq('user_id', createdAuthUserId)
      }
      if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId)
      else if (authEmailWasChanged && authUserId && previousAuthEmail) {
        await admin.auth.admin.updateUserById(authUserId, {
          email: previousAuthEmail,
          email_confirm: true,
          ...(previousAuthMetadata ? { user_metadata: previousAuthMetadata } : {}),
        })
      }
      back('error', `Il link di recupero non è stato inviato (${recoveryError.message}). Ho ripristinato i dati precedenti; controlla la configurazione email di Supabase.`)
    }
  }

  const success = shouldSendRecovery
    ? `Dati aggiornati. È stato inviato a ${nextEmail} il link per impostare o reimpostare la password e accedere al profilo.`
    : 'Dati del profilo aggiornati correttamente. Nessun dato contabile o operativo è stato modificato.'
  back('message', success)
}

export default async function CustomerDetailPage({ params, searchParams }: PageProps) {
  const { user, profile, supabase } = await requirePageContext('AMMINISTRATORE')
  const { id } = await params
  const query = await searchParams
  const workbook = await getLatestExcelWorkbook()
  let sheet = findSheet(workbook, decodeURIComponent(id))
  if (!sheet && /^[0-9a-f-]{36}$/i.test(id)) {
    const { data: customerById } = await supabase.from('customers').select('customer_code').eq('id', id).maybeSingle()
    if (customerById?.customer_code) sheet = findSheet(workbook, customerById.customer_code)
  }
  if (!sheet) notFound()
  const customer = parseCustomerSheet(sheet)
  const rows = customer.transactions.map((item) => ({
    id: item.id,
    date: dateLabel(item.date),
    movement: item.movement || '—',
    article: item.article || '—',
    quantity: item.quantity ? String(item.quantity) : '—',
    amount: item.amount != null ? money(item.amount) : '—',
    paid: item.amountPaid != null ? money(item.amountPaid) : '—',
    status: item.status || '—',
  }))
  const hrefBase = `/admin/clienti/${encodeURIComponent(customer.code)}`

  const { data: accountCustomer } = await supabase
    .from('customers')
    .select('id,customer_code,first_name,last_name,email,phone,shipping_address,shipping_city,shipping_postal_code,shipping_country')
    .ilike('customer_code', customer.code)
    .maybeSingle()

  return <AdminWorkbookLayout active="/admin/clienti" title={customer.name} description={`Scheda Excel: ${customer.code}`} displayName={profile.display_name} email={user.email}>
    {query.message && <section className="panel"><div className="success">{query.message}</div></section>}
    {query.error && <section className="panel"><div className="error">{query.error}</div></section>}
    <section className="panel"><div className="grid"><div className="card"><div className="muted">Codice utente</div><strong>{customer.code}</strong></div><div className="card"><div className="muted">Saldo da pagare</div><strong>{money(customer.balance)}</strong></div><div className="card"><div className="muted">In arrivo</div><strong>{customer.incomingUnits}</strong></div><div className="card"><div className="muted">In stock</div><strong>{customer.stockUnits}</strong></div><div className="card"><div className="muted">In box</div><strong>{customer.boxUnits}</strong></div><div className="card"><div className="muted">Spediti</div><strong>{customer.shippedUnits}</strong></div></div></section>
    <section className="panel">
      <div className="section-heading" style={{alignItems:'center',flexWrap:'wrap'}}>
        <div><h2>Dati profilo e accesso</h2><p className="muted">Modificabili solo i dati anagrafici e l’email di accesso. La contabilità resta in sola lettura.</p></div>
        {accountCustomer && <CustomerProfileEditModal action={updateCustomerProfile} customer={accountCustomer} returnCode={customer.code} />}
      </div>
      {accountCustomer ? (
        <div className="customer-summary-grid">
          <span><b>Nome</b><strong>{accountCustomer.first_name || '—'}</strong></span>
          <span><b>Cognome</b><strong>{accountCustomer.last_name || '—'}</strong></span>
          <span><b>Email per l’accesso</b><strong>{accountCustomer.email || '—'}</strong></span>
          <span><b>Cellulare</b><strong>{accountCustomer.phone || '—'}</strong></span>
          <span><b>Indirizzo</b><strong>{accountCustomer.shipping_address || '—'}</strong></span>
          <span><b>Città</b><strong>{[accountCustomer.shipping_postal_code, accountCustomer.shipping_city].filter(Boolean).join(' ') || '—'}</strong></span>
          <span><b>Paese</b><strong>{accountCustomer.shipping_country || '—'}</strong></span>
        </div>
      ) : (
        <div className="empty">Non è presente una scheda anagrafica associata a questo codice nel database degli account. Nessun dato Excel è stato modificato.</div>
      )}
    </section>
    {customer.contact && <section className="panel"><h2>Riferimenti nel workbook Excel</h2><p style={{ whiteSpace: 'pre-wrap' }}>{customer.contact}</p></section>}
    <section className="panel"><div className="section-heading"><h2>Sezioni scheda</h2></div><div className="grid"><Link className="card" href={`${hrefBase}/articoli`}>Articoli e stati →</Link><Link className="card" href={`${hrefBase}/movimenti`}>Movimenti →</Link><Link className="card" href={`${hrefBase}/pagamenti`}>Pagamenti →</Link><Link className="card" href={`${hrefBase}/crediti`}>Crediti e rettifiche →</Link></div></section>
    <section className="panel"><h2>Righe della scheda Excel</h2><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'movement',label:'Movimento'},{key:'article',label:'Articolo'},{key:'quantity',label:'Q.tà',align:'right'},{key:'amount',label:'Importo',align:'right'},{key:'paid',label:'Pagato',align:'right'},{key:'status',label:'Stato'}]} rows={rows} /></section>
  </AdminWorkbookLayout>
}
