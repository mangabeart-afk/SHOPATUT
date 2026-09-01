import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—'

type SearchParams = Promise<{ search?: string }>

export default async function AdminPagamentiPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  const params = await searchParams
  const search = params.search?.trim().toLowerCase() || ''
  const [{ data: payments, error }, { data: mailboxes }] = await Promise.all([
    supabase.from('payments').select('id,payment_code,mailbox_id,payment_date,amount,amount_eur,currency,payment_method,reference,status,notes').order('payment_date', { ascending: false }),
    supabase.from('mailboxes').select('id,mailbox_code,customer_id,customers(first_name,last_name,customer_code)'),
  ])
  if (error) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/pagamenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Pagamenti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i pagamenti.</div></section></section></main>
  const mailboxById = new Map((mailboxes || []).map((m: any) => [m.id, m]))
  const rows = (payments || []).filter((payment: any) => { if (!search) return true; const mailbox: any = mailboxById.get(payment.mailbox_id); const customer = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers; return [payment.payment_code,payment.status,payment.payment_method,payment.reference,mailbox?.mailbox_code,customer?.customer_code,customer?.first_name,customer?.last_name].filter(Boolean).join(' ').toLowerCase().includes(search) })
  const total = rows.reduce((sum: number, p: any) => sum + Number(p.amount_eur ?? p.amount ?? 0), 0)
  return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/pagamenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Pagamenti</h1></div></header><section className="panel"><h2>Riepilogo</h2><div className="grid"><div className="card"><div className="muted">Totale</div><strong>{money(total)}</strong><small>pagamenti filtrati</small></div><div className="card"><div className="muted">Numero</div><strong>{rows.length}</strong><small>operazioni</small></div></div></section><section className="panel"><h2>Ricerca pagamenti</h2><form action="/admin/pagamenti" method="get" className="form"><label>Cerca<input type="search" name="search" defaultValue={search} placeholder="Codice, cliente, casella, riferimento..." /></label><button type="submit">Cerca</button>{search && <a href="/admin/pagamenti" className="back-button">Azzera ricerca</a>}</form></section><section className="panel"><h2>Elenco pagamenti</h2>{rows.length === 0 ? <div className="empty">Nessun pagamento trovato.</div> : <div className="movement-list">{rows.map((p: any) => { const mailbox: any = mailboxById.get(p.mailbox_id); const customer = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers; return <div className="movement" key={p.id}><div><b>{p.payment_code}</b><span>Cliente: {customer ? `${customer.first_name} ${customer.last_name}` : '—'}</span><span>Casella: {mailbox?.mailbox_code || '—'}</span><span>Data: {formatDate(p.payment_date)}</span><span>Stato: {p.status}</span>{p.payment_method && <span>Metodo: {p.payment_method}</span>}{p.reference && <span>Riferimento: {p.reference}</span>}</div><strong>{money(Number(p.amount_eur ?? p.amount ?? 0))}</strong></div> })}</div>}</section></section></main>
}
