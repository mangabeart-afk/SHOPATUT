import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import SignOutButton from './sign-out'

const money = (n: number) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n || 0)

export default async function Dashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,display_name,customer_id,mailbox_id').eq('user_id', user.id).maybeSingle()
  const role = profile?.role || 'CLIENTE'

  const [articles, payments, credits, movements, mailboxes] = await Promise.all([
    supabase.from('articles').select('id,quantity_purchased,unit_cost_eur,total_cost_eur').limit(1000),
    supabase.from('payments').select('amount_eur,amount').limit(1000),
    supabase.from('credits').select('amount_eur,used_amount_eur').limit(1000),
    supabase.from('movements').select('movement_code,movement_type,total_amount_eur,movement_at,description').order('movement_at',{ascending:false}).limit(8),
    supabase.from('mailboxes').select('id,status').limit(1000),
  ])

  const rows = articles.data || []
  const purchase = rows.reduce((s,r)=>s+Number(r.total_cost_eur||0),0)
  const units = rows.reduce((s,r)=>s+Number(r.quantity_purchased||0),0)
  const paid = (payments.data||[]).reduce((s,r)=>s+Number(r.amount_eur ?? r.amount ?? 0),0)
  const credit = (credits.data||[]).reduce((s,r)=>s+Math.max(0,Number(r.amount_eur||0)-Number(r.used_amount_eur||0)),0)

  return <main className="shell"><aside className="sidebar"><div className="brand">MangaBEART <span>[ShopÄWAY]</span></div><nav>{['Dashboard','Caselle','Articoli','Pagamenti','Crediti','Spedizioni','Movimenti'].map((x,i)=><a className={i===0?'active':''} href={i===0?'/dashboard':`/${x.toLowerCase()}`} key={x}>{x}</a>)}</nav><div className="side-note">V1 • {role}<br/>{profile?.display_name || user.email}</div><SignOutButton/></aside>
  <section className="content"><header className="topbar"><div><p className="eyebrow">{role === 'AMMINISTRATORE' ? 'AMMINISTRAZIONE' : 'AREA CLIENTE'}</p><h1>Dashboard</h1></div></header>
  <div className="grid"><div className="card"><div className="muted">Acquisti</div><strong>{money(purchase)}</strong><small>costo totale articoli</small></div><div className="card"><div className="muted">Pagamenti</div><strong>{money(paid)}</strong><small>pagamenti visibili</small></div><div className="card"><div className="muted">Crediti</div><strong>{money(credit)}</strong><small>credito residuo</small></div><div className="card"><div className="muted">Articoli</div><strong>{units}</strong><small>unità acquistate</small></div><div className="card"><div className="muted">Caselle</div><strong>{(mailboxes.data||[]).length}</strong><small>caselle visibili</small></div><div className="card"><div className="muted">Movimenti</div><strong>{(movements.data||[]).length}</strong><small>ultimi movimenti</small></div></div>
  <section className="panel"><h2>Ultimi movimenti</h2>{(movements.data||[]).length===0?<div className="empty">Nessun movimento registrato.</div>:<div className="movement-list">{movements.data!.map(m=><div className="movement" key={m.movement_code}><div><b>{m.movement_code}</b><span>{m.description || m.movement_type}</span></div><strong>{m.total_amount_eur==null?'—':money(Number(m.total_amount_eur))}</strong></div>)}</div>}</section>
  </section></main>
}
