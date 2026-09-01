import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

type SearchParams = Promise<{ search?: string; message?: string; error?: string }>
const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—'

async function createPayment(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const mailboxId = String(formData.get('mailbox_id') || '').trim()
  const amount = Number(formData.get('amount') || 0)
  const date = String(formData.get('payment_date') || new Date().toISOString().slice(0, 10))
  const currency = String(formData.get('currency') || 'EUR').trim().toUpperCase()
  const exchangeRate = Number(formData.get('exchange_rate') || 1)
  const method = String(formData.get('payment_method') || '').trim()
  const reference = String(formData.get('reference') || '').trim()
  const notes = String(formData.get('notes') || '').trim()

  if (!mailboxId || !(amount > 0) || !(exchangeRate > 0)) redirect('/admin/pagamenti?error=Casella, importo e cambio sono obbligatori e validi.')

  const { data: payment, error } = await supabase.from('payments').insert({ mailbox_id: mailboxId, payment_date: date, amount, currency, exchange_rate: exchangeRate, payment_method: method || null, reference: reference || null, status: 'RICEVUTO', notes: notes || null, created_by: user.id }).select('id,payment_code,amount_eur').single()
  if (error || !payment) redirect(`/admin/pagamenti?error=${encodeURIComponent(error?.message || 'Impossibile creare il pagamento.')}`)

  const { data: mailbox } = await supabase.from('mailboxes').select('mailbox_code,customer_id,customers(first_name,last_name,customer_code)').eq('id', mailboxId).maybeSingle()
  const customer: any = Array.isArray(mailbox?.customers) ? mailbox?.customers[0] : mailbox?.customers
  const { error: movementError } = await supabase.from('movements').insert({ mailbox_id: mailboxId, movement_type: 'PAGAMENTO', reference_id: payment.id, reference_code: payment.payment_code, total_amount_eur: payment.amount_eur, generic_customer_name: customer ? customer.customer_code || `${customer.first_name} ${customer.last_name}` : null, description: 'Pagamento registrato', operator_user_id: user.id, notes: notes || null })
  if (movementError) {
    await supabase.from('payments').delete().eq('id', payment.id)
    redirect(`/admin/pagamenti?error=${encodeURIComponent(movementError.message)}`)
  }

  redirect('/admin/pagamenti?message=Pagamento registrato correttamente.')
}

export default async function AdminPagamentiPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  const params = await searchParams
  const search = params.search?.trim().toLowerCase() || ''
  const message = params.message?.trim() || ''
  const errorMessage = params.error?.trim() || ''

  const [{ data: payments, error }, { data: mailboxes, error: mailboxError }] = await Promise.all([
    supabase.from('payments').select('id,payment_code,mailbox_id,payment_date,amount,amount_eur,currency,payment_method,reference,status,notes').order('payment_date', { ascending: false }),
    supabase.from('mailboxes').select('id,mailbox_code,customer_id,customers(first_name,last_name,customer_code)').order('mailbox_code'),
  ])
  if (error || mailboxError) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/pagamenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Pagamenti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i pagamenti: {(error || mailboxError)?.message}</div></section></section></main>

  const mailboxById = new Map((mailboxes || []).map((m: any) => [m.id, m]))
  const rows = (payments || []).filter((payment: any) => {
    if (!search) return true
    const mailbox: any = mailboxById.get(payment.mailbox_id)
    const customer = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers
    return [payment.payment_code,payment.status,payment.payment_method,payment.reference,mailbox?.mailbox_code,customer?.customer_code,customer?.first_name,customer?.last_name].filter(Boolean).join(' ').toLowerCase().includes(search)
  })
  const total = rows.reduce((sum: number, p: any) => sum + Number(p.amount_eur ?? p.amount ?? 0), 0)

  return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/pagamenti" displayName={profile?.display_name} email={user.email} /><section className="content">
    <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Pagamenti</h1></div></header>
    {message && <section className="panel"><div className="success">{decodeURIComponent(message)}</div></section>}
    {errorMessage && <section className="panel"><div className="error">{decodeURIComponent(errorMessage)}</div></section>}

    <section className="panel"><h2>Inserisci nuovo pagamento</h2><p className="muted">Registra un pagamento ricevuto associandolo alla casella del cliente. Il movimento viene creato automaticamente.</p>
      <form action={createPayment} className="article-create-form"><div className="form-grid">
        <label>Casella cliente<select name="mailbox_id" required defaultValue=""><option value="">Seleziona casella</option>{(mailboxes || []).map((mailbox: any) => { const customer = Array.isArray(mailbox.customers) ? mailbox.customers[0] : mailbox.customers; return <option key={mailbox.id} value={mailbox.id}>{mailbox.mailbox_code} — {customer ? `${customer.first_name} ${customer.last_name}` : 'Cliente'}</option> })}</select></label>
        <label>Importo<input type="number" name="amount" min="0.01" step="0.01" required /></label>
        <label>Data<input type="date" name="payment_date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
        <label>Valuta<input type="text" name="currency" defaultValue="EUR" /></label>
        <label>Cambio<input type="number" name="exchange_rate" min="0.0001" step="0.0001" defaultValue="1" required /></label>
        <label>Metodo<select name="payment_method" defaultValue=""><option value="">Seleziona</option><option value="BONIFICO">BONIFICO</option><option value="PAYPAL">PAYPAL</option><option value="CONTANTI">CONTANTI</option><option value="ALTRO">ALTRO</option></select></label>
        <label>Riferimento<input type="text" name="reference" placeholder="CRO, transazione, note..." /></label>
        <label className="form-grid-wide">Note<textarea name="notes" rows={3} /></label>
      </div><button type="submit">Registra pagamento</button></form>
    </section>

    <section className="panel"><h2>Riepilogo</h2><div className="grid"><div className="card"><div className="muted">Totale</div><strong>{money(total)}</strong><small>pagamenti filtrati</small></div><div className="card"><div className="muted">Numero</div><strong>{rows.length}</strong><small>operazioni</small></div></div></section>
    <section className="panel"><h2>Ricerca pagamenti</h2><form action="/admin/pagamenti" method="get" className="form"><label>Cerca<input type="search" name="search" defaultValue={search} placeholder="Codice, cliente, casella, riferimento..." /></label><button type="submit">Cerca</button>{search && <a href="/admin/pagamenti" className="back-button">Azzera ricerca</a>}</form></section>
    <section className="panel"><h2>Elenco pagamenti</h2>{rows.length === 0 ? <div className="empty">Nessun pagamento trovato.</div> : <div className="movement-list">{rows.map((p: any) => { const mailbox: any = mailboxById.get(p.mailbox_id); const customer = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers; return <div className="movement" key={p.id}><div><b>{p.payment_code}</b><span>Cliente: {customer ? `${customer.first_name} ${customer.last_name}` : '—'}</span><span>Casella: {mailbox?.mailbox_code || '—'}</span><span>Data: {formatDate(p.payment_date)}</span><span>Stato: {p.status}</span>{p.payment_method && <span>Metodo: {p.payment_method}</span>}{p.reference && <span>Riferimento: {p.reference}</span>}</div><strong>{money(Number(p.amount_eur ?? p.amount ?? 0))}</strong></div> })}</div>}</section>
  </section></main>
}
