import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

type SearchParams = Promise<{ search?: string; message?: string; error?: string }>

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—'

async function createCredit(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const mailboxCode = String(formData.get('mailbox_code_lookup') || '').trim()
  const { data: mailbox } = await supabase.from('mailboxes').select('id').ilike('mailbox_code', mailboxCode).maybeSingle()
  const mailboxId = mailbox?.id || ''
  const amount = Number(formData.get('amount_eur') || 0)
  const creditDate = String(formData.get('credit_date') || new Date().toISOString().slice(0, 10))
  const reason = String(formData.get('reason') || '').trim()
  const notes = String(formData.get('notes') || '').trim()
  if (!mailboxId) redirect('/admin/crediti?error=Seleziona una casella.')
  if (!(amount > 0)) redirect('/admin/crediti?error=L\'importo del credito deve essere maggiore di zero.')

  const { data: createdCredit, error } = await supabase.from('credits').insert({ mailbox_id: mailboxId, credit_date: creditDate, amount_eur: amount, reason: reason || null, notes: notes || null }).select('id') .single()
  if (error) redirect(`/admin/crediti?error=${encodeURIComponent(error.message)}`)
  await supabase.from('movements').insert({ mailbox_id: mailboxId, movement_type: 'CREDITO', reference_id: createdCredit.id, total_amount_eur: -amount, movement_at: `${creditDate}T12:00:00`, description: reason || 'Credito cliente', operator_user_id: user.id, notes: notes || null })
  redirect('/admin/crediti?message=Credito creato correttamente.')
}

async function updateCredit(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const id = String(formData.get('credit_id') || '').trim()
  const amount = Number(formData.get('amount_eur') || 0)
  const date = String(formData.get('credit_date') || '').trim()
  const status = String(formData.get('status') || 'ATTIVO').trim()
  const reason = String(formData.get('reason') || '').trim()
  const notes = String(formData.get('notes') || '').trim()
  if (!id || !(amount > 0) || !date || !['ATTIVO','ESAURITO','ANNULLATO'].includes(status)) redirect('/admin/crediti?error=Dati credito non validi.')

  const { data: current, error: currentError } = await supabase.from('credits').select('used_amount_eur').eq('id', id).maybeSingle()
  if (currentError || !current) redirect('/admin/crediti?error=Credito non trovato.')
  if (amount < Number(current.used_amount_eur || 0)) redirect('/admin/crediti?error=L\'importo non può essere inferiore al credito già utilizzato.')

  const { data: updatedCredit, error } = await supabase.from('credits').update({ amount_eur: amount, credit_date: date, status, reason: reason || null, notes: notes || null }).eq('id', id).select('id,mailbox_id,amount_eur,used_amount_eur,status').maybeSingle()
  if (error) redirect(`/admin/crediti?error=${encodeURIComponent(error.message)}`)
  if (updatedCredit) {
    const activeAmount = updatedCredit.status === 'ANNULLATO' ? 0 : Math.max(0, Number(updatedCredit.amount_eur || 0) - Number(updatedCredit.used_amount_eur || 0))
    await supabase.from('movements').update({ mailbox_id: updatedCredit.mailbox_id, total_amount_eur: -activeAmount, movement_at: `${date}T12:00:00`, description: reason || 'Credito cliente', notes: notes || null }).eq('reference_id', id).eq('movement_type', 'CREDITO')
  }
  redirect('/admin/crediti?message=Credito modificato correttamente.')
}

async function deleteCredit(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  const id = String(formData.get('credit_id') || '').trim()
  if (!id) redirect('/admin/crediti?error=Credito non valido.')
  const { error } = await supabase.rpc('admin_cancel_credit', { p_credit_id: id })
  if (error) redirect(`/admin/crediti?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/crediti?message=Credito annullato correttamente.')
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

  const [{ data: mailboxes, error: mailboxError }, { data: credits, error }] = await Promise.all([
    supabase.from('mailboxes').select('id,mailbox_code,customer_id,status,customers(first_name,last_name,email,phone)').order('mailbox_code'),
    supabase.from('credits').select('id,credit_code,mailbox_id,credit_date,amount_eur,used_amount_eur,status,reason,notes').order('credit_date', { ascending: false }),
  ])

  if (error || mailboxError) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/crediti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Crediti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i crediti: {(error || mailboxError)?.message}</div></section></section></main>

  const mailboxById = new Map((mailboxes || []).map((m: any) => [m.id, m]))
  const filtered = (credits || []).filter((credit: any) => {
    if (!search) return true
    const mailbox: any = mailboxById.get(credit.mailbox_id)
    const customer = Array.isArray(mailbox?.customers) ? mailbox?.customers[0] : mailbox?.customers
    return [credit.credit_code, credit.status, credit.reason, credit.notes, mailbox?.mailbox_code, customer?.first_name, customer?.last_name].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  })

  return <main className="shell">
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
            <label>Codice casella cliente<input list="credit-mailboxes" name="mailbox_code_lookup" required placeholder="Cerca codice..." /><datalist id="credit-mailboxes">{(mailboxes || []).map((mailbox: any) => { const customer = Array.isArray(mailbox.customers) ? mailbox.customers[0] : mailbox.customers; return <option key={mailbox.id} value={mailbox.mailbox_code}>{customer ? `${customer.first_name} ${customer.last_name}` : 'Cliente'}</option> })}</datalist></label>
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
        <form action="/admin/crediti" method="get" className="form"><label>Ricerca<input type="search" name="search" defaultValue={search} placeholder="Codice credito, cliente, casella, motivo..." /></label><button type="submit">Cerca</button>{search && <a href="/admin/crediti" className="back-button">Azzera ricerca</a>}</form>
        {filtered.length === 0 ? <div className="empty">Nessun credito registrato.</div> : <div className="movement-list">{filtered.map((credit: any) => {
          const mailbox: any = mailboxById.get(credit.mailbox_id)
          const customer = Array.isArray(mailbox?.customers) ? mailbox?.customers[0] : mailbox?.customers
          const amount = Number(credit.amount_eur || 0)
          const used = Number(credit.used_amount_eur || 0)
          return <div className="customer-compact-row" key={credit.id}>
            <div className="customer-compact-grid customer-compact-grid-main">
              <span><b>CODICE CASELLA</b><a href={`/admin/clienti/${mailbox?.customer_id}`}>{mailbox?.mailbox_code || '—'}</a></span>
              <span><b>NOME COGNOME</b>{customer ? `${customer.first_name} ${customer.last_name}` : '—'}</span>
              <span><b>TELEFONO</b>{customer?.phone || '—'}</span>
              <span><b>MAIL</b>{customer?.email || '—'}</span>
              <span><b>NOTE</b>{credit.notes || '—'}</span>
              <span><b>IMPORTO CREDITO</b><strong>{money(amount - used)}</strong></span>
            </div>
            <div className="row-actions"><details><summary>Modifica</summary><form action={updateCredit} className="compact-form"><input type="hidden" name="credit_id" value={credit.id}/><label>Importo<input type="number" name="amount_eur" min={Math.max(0.01,used)} step="0.01" defaultValue={amount.toFixed(2)} required/></label><label>Data<input type="date" name="credit_date" defaultValue={credit.credit_date} required/></label><label>Stato<select name="status" defaultValue={credit.status}><option>ATTIVO</option><option>ESAURITO</option><option>ANNULLATO</option></select></label><label>Motivo<input name="reason" defaultValue={credit.reason||''}/></label><label>Note<input name="notes" defaultValue={credit.notes||''}/></label><button type="submit">Salva</button></form></details>{used===0&&<form action={deleteCredit}><input type="hidden" name="credit_id" value={credit.id}/><button type="submit" className="danger-button">Annulla</button></form>}</div>
          </div>
        })}</div>}
      </section>
    </section>
  </main>
}
