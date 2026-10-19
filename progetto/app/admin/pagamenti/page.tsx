import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'
import CustomerAutocomplete from '../../../components/customer-autocomplete'
import AdminPaymentEditModal from '../../../components/admin-payment-edit-modal'

type SearchParams = Promise<{ search?: string; customer?: string; message?: string; error?: string; page?: string }>
const money=(v:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v||0)
const date=(v:string|null)=>v?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(v)):'—'
async function assertAdmin(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');const {data:profile}=await supabase.from('profiles').select('role').eq('user_id',user.id).maybeSingle();if(profile?.role!=='AMMINISTRATORE')redirect('/dashboard');return {supabase,user}}
async function createPayment(formData:FormData){
  'use server'
  const {supabase}=await assertAdmin()
  const customerCode=String(formData.get('customer_code_lookup')||'').trim().toUpperCase()
  const amount=Number(formData.get('amount')||0)
  const dateValue=String(formData.get('payment_date')||new Date().toISOString().slice(0,10))
  const currency=String(formData.get('currency')||'EUR').trim().toUpperCase()
  const exchangeRate=Number(formData.get('exchange_rate')||1)
  const method=String(formData.get('payment_method')||'').trim()
  const notes=String(formData.get('notes')||'').trim()
  if(!customerCode||amount<=0||exchangeRate<=0)redirect('/admin/pagamenti?error=Dati pagamento non validi.')
  const {data:customer,error:customerError}=await supabase.from('customers').select('id').ilike('customer_code',customerCode).maybeSingle()
  if(customerError)redirect(`/admin/pagamenti?error=${encodeURIComponent(customerError.message)}`)
  if(!customer)redirect('/admin/pagamenti?error=Codice utente non trovato o casella tecnica non disponibile.')
  const {data:mailbox,error:mailboxError}=await supabase.from('mailboxes').select('id').eq('customer_id',customer.id).maybeSingle()
  if(mailboxError)redirect(`/admin/pagamenti?error=${encodeURIComponent(mailboxError.message)}`)
  if(!mailbox?.id)redirect('/admin/pagamenti?error=Codice utente non trovato o casella tecnica non disponibile.')
  const {error}=await supabase.rpc('register_customer_payment',{p_mailbox_id:mailbox.id,p_amount:amount,p_currency:currency,p_exchange_rate:exchangeRate,p_payment_date:dateValue,p_payment_method:method||null,p_notes:notes||null})
  if(error)redirect(`/admin/pagamenti?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/pagamenti?message=Pagamento registrato correttamente.')
}
async function updatePayment(formData:FormData){'use server';const {supabase}=await assertAdmin();const id=String(formData.get('payment_id')||'');const amount=Number(formData.get('amount')||0);const dateValue=String(formData.get('payment_date')||'');const notes=String(formData.get('notes')||'').trim();const method=String(formData.get('payment_method')||'').trim();if(!id||amount<=0||!dateValue)redirect('/admin/pagamenti?error=Dati pagamento non validi.');const {error}=await supabase.rpc('admin_update_customer_payment_v2',{p_payment_id:id,p_payment_date:dateValue,p_amount_eur:amount,p_notes:notes,p_payment_method:method||null});if(error)redirect(`/admin/pagamenti?error=${encodeURIComponent(error.message)}`);redirect('/admin/pagamenti?message=Pagamento modificato correttamente.')}
async function deletePayment(formData:FormData){'use server';const {supabase}=await assertAdmin();const id=String(formData.get('payment_id')||'');if(!id)redirect('/admin/pagamenti?error=Pagamento non valido.');const {error}=await supabase.rpc('admin_delete_customer_payment',{p_payment_id:id});if(error)redirect(`/admin/pagamenti?error=${encodeURIComponent(error.message)}`);redirect('/admin/pagamenti?message=Pagamento cancellato correttamente.')}
async function fetchAllPayments(supabase: any) {
  const results: any[] = []
  const chunkSize = 1000
  for (let from = 0; ; from += chunkSize) {
    const { data, error } = await supabase
      .from('payments')
      .select('id,payment_code,mailbox_id,generic_customer_name,payment_date,amount,amount_eur,currency,payment_method,status,notes,reference')
      .order('payment_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + chunkSize - 1)
    if (error) return { data: [], error, count: null }
    const batch = data || []
    results.push(...batch)
    if (batch.length < chunkSize) break
  }
  return { data: results, error: null, count: null }
}

export default async function AdminPagamentiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, user } = await assertAdmin()
  const params = await searchParams
  const search = params.search?.trim().toLowerCase() || ''
  const initialCustomerCode = params.customer?.trim().toUpperCase() || ''
  const pageSize = 100
  const requestedPage = Math.max(1, Number.parseInt(params.page || '1', 10) || 1)
  const [paymentResult, mailboxResult, customerResult] = await Promise.all([
    search
      ? fetchAllPayments(supabase)
      : supabase
          .from('payments')
          .select('id,payment_code,mailbox_id,generic_customer_name,payment_date,amount,amount_eur,currency,payment_method,status,notes,reference', { count: 'exact' })
          .order('payment_date', { ascending: false })
          .order('id', { ascending: false })
          .range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1),
    supabase.from('mailboxes').select('id,customer_id,customers(first_name,last_name,email,phone,customer_code)'),
    supabase.from('customers').select('id,customer_code,first_name,last_name,email,phone').order('customer_code'),
  ])
  const payments = paymentResult.data || []
  const paymentError = paymentResult.error
  const mailboxError = mailboxResult.error
  const customersError = customerResult.error
  if (paymentError || mailboxError || customersError) {
    const message = (paymentError || mailboxError || customersError)?.message || 'Errore di caricamento'
    return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/pagamenti" email={user.email} /><section className="content"><section className="panel"><div className="error">Impossibile caricare i pagamenti: {message}</div></section></section></main>
  }

  const mailboxById = new Map((mailboxResult.data || []).map((mailbox: any) => [mailbox.id, mailbox]))
  const filteredRows = payments.filter((payment: any) => {
    if (!search) return true
    const mailbox: any = mailboxById.get(payment.mailbox_id)
    const customer: any = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers
    const searchable = [payment.payment_code, payment.generic_customer_name, customer?.customer_code, customer?.first_name, customer?.last_name, customer?.email, customer?.phone, payment.notes, payment.reference, payment.payment_method, payment.status]
      .filter(Boolean).join(' ').toLowerCase()
    return searchable.includes(search)
  })
  const totalRows = search ? filteredRows.length : Number(paymentResult.count || 0)
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  let currentPage = Math.min(requestedPage, totalPages)
  let rows = search ? filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize) : filteredRows
  if (!search && requestedPage > totalPages && totalRows > 0) {
    const { data: lastPageRows, error: lastPageError } = await supabase
      .from('payments')
      .select('id,payment_code,mailbox_id,generic_customer_name,payment_date,amount,amount_eur,currency,payment_method,status,notes,reference')
      .order('payment_date', { ascending: false })
      .order('id', { ascending: false })
      .range((totalPages - 1) * pageSize, totalPages * pageSize - 1)
    if (lastPageError) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/pagamenti" email={user.email} /><section className="content"><section className="panel"><div className="error">Impossibile caricare i pagamenti: {lastPageError.message}</div></section></section></main>
    rows = lastPageRows || []
    currentPage = totalPages
  }
  const pageHref = (page: number) => {
    const query = new URLSearchParams()
    if (params.search) query.set('search', params.search)
    if (params.customer) query.set('customer', params.customer)
    query.set('page', String(page))
    return `/admin/pagamenti?${query.toString()}`
  }
  const customers = customerResult.data || []

  return <main className="shell">
    <Navigation role="AMMINISTRATORE" active="/admin/pagamenti" email={user.email} />
    <section className="content">
      <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Pagamenti</h1></div></header>
      {params.message && <section className="panel"><div className="success">{params.message}</div></section>}
      {params.error && <section className="panel"><div className="error">{params.error}</div></section>}
      <section className="panel">
        <h2>Nuovo pagamento</h2>
        <form action={createPayment} className="article-create-form">
          <div className="form-grid">
            <label>Codice utente<CustomerAutocomplete name="customer_code_lookup" value={initialCustomerCode} required placeholder="Cerca per codice utente, nome o cognome..." options={customers.map((customer: any) => ({ id: customer.id, code: customer.customer_code || '', name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Utente', email: customer.email || null }))} /></label>
            <label>Importo<input type="number" name="amount" min="0.01" step="0.01" required /></label>
            <label>Data<input type="date" name="payment_date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
            <label>Valuta<input name="currency" defaultValue="EUR" /></label>
            <label>Cambio<input type="number" name="exchange_rate" min="0.0001" step="0.0001" defaultValue="1" required /></label>
            <label>Metodo<select name="payment_method" defaultValue=""><option value="">Seleziona</option><option>BONIFICO</option><option>PAYPAL</option><option>CONTANTI</option><option>ALTRO</option></select></label>
            <label className="form-grid-wide">Note<textarea name="notes" rows={2} /></label>
          </div>
          <button type="submit">Registra pagamento</button>
        </form>
      </section>
      <section className="panel">
        <h2>Ricerca pagamenti</h2>
        <form action="/admin/pagamenti" method="get" className="compact-search-form">
          <input type="search" name="search" defaultValue={params.search || ''} placeholder="Codice utente, nome, e-mail..." />
          <button type="submit">Cerca</button>
          {search && <a href="/admin/pagamenti" className="back-button">Azzera</a>}
        </form>
      </section>
      <section className="panel admin-payments-list">
        <h2>Elenco pagamenti</h2>
        {rows.length === 0 ? <div className="empty">Nessun pagamento trovato.</div> : <div className="movement-list">
          {rows.map((payment: any) => {
            const mailbox: any = mailboxById.get(payment.mailbox_id)
            const customer: any = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers
            return <div className="customer-compact-row" key={payment.id}>
              <div className="customer-compact-grid customer-compact-grid-main compact-payment-row">
                <span><b>CODICE UTENTE</b>{mailbox?.customer_id ? <a href={`/admin/clienti/${mailbox.customer_id}`}>{customer?.customer_code || '—'}</a> : (customer?.customer_code || '—')}</span>
                <span><b>NOME</b>{customer ? `${customer.first_name} ${customer.last_name}` : (payment.generic_customer_name || '—')}</span>
                <span><b>IMPORTO</b><strong>{money(Number(payment.amount_eur ?? payment.amount ?? 0))}</strong></span>
              </div>
              <div className="customer-compact-grid customer-compact-grid-meta compact-payment-row">
                <span><b>STATO</b>{payment.status}</span>
                <span className="customer-row-actions"><AdminPaymentEditModal action={updatePayment} deleteAction={deletePayment} payment={payment} /></span>
              </div>
            </div>
          })}
        </div>}
        {totalRows > pageSize && <nav aria-label="Paginazione pagamenti amministratore" className="server-archive-pagination"><a className="filter-submit" href={pageHref(Math.max(1, currentPage - 1))} aria-disabled={currentPage <= 1}>‹ Precedente</a><span>Pagina {currentPage} di {totalPages} · {totalRows} pagamenti</span><a className="filter-submit" href={pageHref(Math.min(totalPages, currentPage + 1))} aria-disabled={currentPage >= totalPages}>Successiva ›</a></nav>}
      </section>
    </section>
  </main>
}
