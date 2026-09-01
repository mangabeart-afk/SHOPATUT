import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

type SearchParams = Promise<{ search?: string; message?: string; error?: string }>

const money = (value: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

async function createCredit(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const mailboxId = String(formData.get('mailbox_id') || '').trim()
  const amount = Number(formData.get('amount_eur') || 0)
  const creditDate = String(formData.get('credit_date') || new Date().toISOString().slice(0, 10))
  const reason = String(formData.get('reason') || '').trim()
  const notes = String(formData.get('notes') || '').trim()

  if (!mailboxId) redirect('/admin/crediti?error=Seleziona una casella.')
  if (!(amount > 0)) redirect('/admin/crediti?error=L\'importo del credito deve essere maggiore di zero.')

  const { error } = await supabase.from('credits').insert({
    mailbox_id: mailboxId,
    credit_date: creditDate,
    amount_eur: amount,
    reason: reason || null,
    notes: notes || null,
  })

  if (error) redirect(`/admin/crediti?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/crediti?message=Credito creato correttamente.')
}

export default async function AdminCreditiPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const params = await searchParams
  const search = params.search?.trim() || ''
  const message = params.message?.trim() || ''
  const errorMessage = params.error?.trim() || ''

  const [{ data: mailboxes }, { data: credits, error }] = await Promise.all([
    supabase.from('mailboxes').select('id,mailbox_code,customer_id,status,customers(first_name,last_name,customer_code)').order('mailbox_code'),
    supabase.from('credits').select('id,credit_code,mailbox_id,credit_date,amount_eur,used_amount_eur,status,reason,notes').order('credit_date', { ascending: false }),
  ])

  if (error) {
    return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/crediti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Crediti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i crediti.</div></section></section></main>
  }

  const mailboxById = new Map((mailboxes || []).map((m: any) => [m.id, m]))
  const filtered = (credits || []).filter((credit: any) => {
    if (!search) return true
    const mailbox: any = mailboxById.get(credit.mailbox_id)
    const customer = Array.isArray(mailbox?.customers) ? mailbox?.customers[0] : mailbox?.customers
    const text = [credit.credit_code, credit.status, credit.reason, credit.notes, mailbox?.mailbox_code, customer?.customer_code, customer?.first_name, customer?.last_name].filter(Boolean).join(' ').toLowerCase()
    return text.includes(search.toLowerCase())
  })

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin/crediti" displayName={profile?.display_name} email={user.email} />
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Crediti</h1></div></header>

        {message && <section className="panel"><div className="success">{decodeURIComponent(message)}</div></section>}
        {errorMessage && <section className="panel"><div className="error">{decodeURIComponent(errorMessage)}</div></section>}

        <section className="panel">
          <h2>Crea nuovo credito</h2>
          <p className="muted">Assegna manualmente un credito alla casella del cliente.</p>
          <form action={createCredit} className="article-create-form">
            <div className="form-grid">
              <label>Casella cliente<select name="mailbox_id" required defaultValue=""><option value="">Seleziona casella</option>{(mailboxes || []).map((mailbox: any) => { const customer = Array.isArray(mailbox.customers) ? mailbox.customers[0] : mailbox.customers; return <option key={mailbox.id} value={mailbox.id}>{mailbox.mailbox_code} — {customer ? `${customer.first_name} ${customer.last_name}` : 'Cliente'}</option> })}</select></label>
              <label>Importo (€)<input type="number" name="amount_eur" min="0.01" step="0.01" required /></label>
              <label>Data<input type="date" name="credit_date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
              <label>Motivo<input type="text" name="reason" placeholder="Motivo del credito" /></label>
              <label className="form-grid-wide">Note<textarea name="notes" rows={3} placeholder="Note opzionali" /></label>
            </div>
            <button type="submit">Crea credito</button>
          </form>
        </section>

        <section className="panel">
          <h2>{search ? `Risultati per "${search}"` : 'Elenco crediti'}</h2>
          <form action="/admin/crediti" method="get" className="form">
            <label>Ricerca<input type="search" name="search" defaultValue={search} placeholder="Codice credito, cliente, casella, motivo..." /></label>
            <button type="submit">Cerca</button>
            {search && <a href="/admin/crediti" className="back-button">Azzera ricerca</a>}
          </form>
          {filtered.length === 0 ? <div className="empty">Nessun credito registrato.</div> : <div className="movement-list">{filtered.map((credit: any) => { const mailbox: any = mailboxById.get(credit.mailbox_id); const customer = Array.isArray(mailbox?.customers) ? mailbox?.customers[0] : mailbox?.customers; const amount = Number(credit.amount_eur || 0); const used = Number(credit.used_amount_eur || 0); return <div className="movement" key={credit.id}><div><b>{credit.credit_code}</b><span>Casella: {mailbox?.mailbox_code || '—'}</span><span>Cliente: {customer ? `${customer.first_name} ${customer.last_name}` : '—'}</span><span>Data: {formatDate(credit.credit_date)}</span>{credit.reason && <span>Motivo: {credit.reason}</span>}</div><div><span>Totale: {money(amount)}</span><span>Utilizzato: {money(used)}</span><strong>Residuo: {money(Math.max(0, amount - used))}</strong></div></div> })}</div>}
        </section>
      </section>
    </main>
  )
}
