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

  const lookup = String(formData.get('mailbox_lookup') || '').trim()
  const amount = Number(formData.get('amount') || 0)
  const date = String(formData.get('payment_date') || new Date().toISOString().slice(0, 10))
  const currency = String(formData.get('currency') || 'EUR').trim().toUpperCase()
  const exchangeRate = Number(formData.get('exchange_rate') || 1)
  const method = String(formData.get('payment_method') || '').trim()
  const notes = String(formData.get('notes') || '').trim()
  if (!lookup || !(amount > 0) || !(exchangeRate > 0)) redirect('/admin/pagamenti?error=Casella, importo e cambio sono obbligatori e validi.')

  const { data: mailboxes } = await supabase.from('mailboxes').select('id,mailbox_code,customer_id,customers(first_name,last_name,email)').order('mailbox_code')
  const mailbox: any = (mailboxes || []).find((m: any) => {
    const c = Array.isArray(m.customers) ? m.customers[0] : m.customers
    return [m.mailbox_code,c?.first_name,c?.last_name,c?.email].filter(Boolean).some((v: any) => String(v).toLowerCase() === lookup.toLowerCase())
  })
  if (!mailbox) redirect('/admin/pagamenti?error=Casella o cliente non trovato.')

  const { data: paymentId, error } = await supabase.rpc('register_customer_payment', {
    p_mailbox_id: mailbox.id,
    p_amount: amount,
    p_currency: currency,
    p_exchange_rate: exchangeRate,
    p_payment_date: date,
    p_payment_method: method || null,
    p_notes: notes || null,
  })
  if (error || !paymentId) redirect(`/admin/pagamenti?error=${encodeURIComponent(error?.message || 'Impossibile registrare il pagamento.')}`)

    redirect('/admin/pagamenti?message=Pagamento registrato e distribuito automaticamente dagli articoli più vecchi.')
}

export default async function AdminPagamentiPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  const params = await searchParams
  const search = params.search?.trim().toLowerCase() || ''

  const [{ data: payments, error }, { data: mailboxes, error: mailboxError }, { data: allocations }, { data: movements }, { data: articles }] = await Promise.all([
    supabase.from('payments').select('id,payment_code,mailbox_id,payment_date,amount,amount_eur,currency,payment_method,status,notes').order('payment_date', { ascending: false }),
    supabase.from('mailboxes').select('id,mailbox_code,customer_id,customers(first_name,last_name,email)').order('mailbox_code'),
    supabase.from('payment_allocations').select('payment_id,movement_id,amount_eur,allocated_at'),
    supabase.from('movements').select('id,mailbox_id,article_id,total_amount_eur,movement_at,quantity').eq('movement_type','VENDITA'),
    supabase.from('articles').select('id,article_code,detail'),
  ])
  if (error || mailboxError) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/pagamenti" displayName={profile?.display_name} email={user.email} /><section className="content"><section className="panel"><div className="error">Impossibile caricare i pagamenti: {(error || mailboxError)?.message}</div></section></section></main>

  const mailboxById = new Map((mailboxes || []).map((m: any) => [m.id, m]))
  const movementById = new Map((movements || []).map((m: any) => [m.id, m]))
  const articleById = new Map((articles || []).map((a: any) => [a.id, a]))
  const rows = (payments || []).filter((payment: any) => {
    if (!search) return true
    const mailbox: any = mailboxById.get(payment.mailbox_id)
    const c = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers
    return [payment.payment_code,payment.status,payment.payment_method,mailbox?.mailbox_code,c?.first_name,c?.last_name,c?.email].filter(Boolean).join(' ').toLowerCase().includes(search)
  })
  const total = rows.reduce((sum: number, p: any) => sum + Number(p.amount_eur ?? p.amount ?? 0), 0)

  return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/pagamenti" displayName={profile?.display_name} email={user.email} /><section className="content">
    <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Pagamenti</h1></div></header>
    {params.message && <section className="panel"><div className="success">{params.message}</div></section>}
    {params.error && <section className="panel"><div className="error">{params.error}</div></section>}

    <section className="panel"><h2>Nuovo pagamento</h2><p className="muted">Cerca rapidamente la casella/cliente. Dopo la registrazione il pagamento viene distribuito automaticamente dagli articoli più vecchi con saldo aperto.</p>
      <form action={createPayment} className="article-create-form">
        <div className="form-grid">
          <label>Casella cliente<input list="payment-mailboxes" name="mailbox_lookup" placeholder="Codice casella, codice cliente, nome, cognome o mail" required /><datalist id="payment-mailboxes">{(mailboxes || []).map((m: any) => { const c = Array.isArray(m.customers) ? m.customers[0] : m.customers; return <option key={m.id} value={m.mailbox_code}>{c ? `${c.first_name} ${c.last_name}` : 'Cliente'}</option> })}</datalist></label>
          <label>Importo<input type="number" name="amount" min="0.01" step="0.01" required /></label>
          <label>Data<input type="date" name="payment_date" defaultValue={new Date().toISOString().slice(0,10)} required /></label>
          <label>Valuta<input name="currency" defaultValue="EUR" /></label>
          <label>Cambio (1 EUR = valuta)<input type="number" name="exchange_rate" min="0.0001" step="0.0001" defaultValue="1" required /></label>
          <label>Metodo<select name="payment_method" defaultValue=""><option value="">Seleziona</option><option value="BONIFICO">BONIFICO</option><option value="PAYPAL">PAYPAL</option><option value="CONTANTI">CONTANTI</option><option value="ALTRO">ALTRO</option></select></label>
          <label className="form-grid-wide">Note<textarea name="notes" rows={3} /></label>
        </div>
        <button type="submit">Registra pagamento</button>
      </form>
    </section>

    <section className="panel"><h2>Riepilogo</h2><div className="grid"><div className="card"><div className="muted">Totale</div><strong>{money(total)}</strong><small>pagamenti filtrati</small></div><div className="card"><div className="muted">Numero</div><strong>{rows.length}</strong><small>operazioni</small></div></div></section>
    <section className="panel"><h2>Ricerca pagamenti</h2><form action="/admin/pagamenti" method="get" className="form"><label>Cerca<input type="search" name="search" defaultValue={params.search || ''} placeholder="Codice, cliente, casella, mail..." /></label><button type="submit">Cerca</button>{search && <a href="/admin/pagamenti" className="back-button">Azzera ricerca</a>}</form></section>
    <section className="panel"><h2>Elenco pagamenti</h2>{rows.length === 0 ? <div className="empty">Nessun pagamento trovato.</div> : <div className="movement-list">{rows.map((p: any) => { const mailbox: any = mailboxById.get(p.mailbox_id); const c = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers; const paymentAllocations = (allocations || []).filter((a: any) => a.payment_id === p.id).sort((a: any,b: any) => String(a.allocated_at).localeCompare(String(b.allocated_at))); return <div className="movement" key={p.id}><div><b>{p.payment_code}</b><span>Casella: {mailbox?.mailbox_code || '—'}</span><span>Cliente: {c ? `${c.first_name} ${c.last_name}` : '—'}</span><span>Data: {formatDate(p.payment_date)}</span>{p.payment_method && <span>Metodo: {p.payment_method}</span>}<span>Distribuzione automatica:</span>{paymentAllocations.length === 0 ? <small>Nessun articolo coperto.</small> : paymentAllocations.map((a: any) => { const m: any = movementById.get(a.movement_id); const article: any = m ? articleById.get(m.article_id) : null; const due = Number(m?.total_amount_eur || 0); return <small key={a.movement_id}>{article?.article_code || 'Articolo'} = {money(Number(a.amount_eur))}{Number(a.amount_eur) >= due ? ' · SALDATO' : ` · ACCONTO ${money(Math.max(0, due - Number(a.amount_eur)))}`}</small> })}</div><strong>{money(Number(p.amount_eur ?? p.amount ?? 0))}</strong></div> })}</div>}</section>
  </section></main>
}
