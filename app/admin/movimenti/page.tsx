import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'

type SearchParams = Promise<{ search?: string; type?: string }>

export default async function AdminMovimentiPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle(); if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  const params = await searchParams; const search = params.search?.trim().toLowerCase() || ''; const type = params.type?.trim() || ''
  let query = supabase.from('movements').select('id,movement_code,movement_at,movement_type,reference_code,article_id,quantity,unit_price_eur,total_amount_eur,generic_customer_name,description,notes').order('movement_at', { ascending: false })
  if (type) query = query.eq('movement_type', type)
  const { data: movements, error } = await query
  if (error) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i movimenti.</div></section></section></main>
  const rows = (movements || []).filter((m: any) => !search || [m.movement_code,m.movement_type,m.reference_code,m.generic_customer_name,m.description,m.notes,m.article_id].filter(Boolean).join(' ').toLowerCase().includes(search))
  const types = ['ARTICOLO','VENDITA','PAGAMENTO','CREDITO','SPEDIZIONE','MODIFICA','ANNULLAMENTO','STORNO','ALTRO']
  return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header><section className="panel"><h2>Filtri</h2><form action="/admin/movimenti" method="get" className="form"><label>Ricerca<input type="search" name="search" defaultValue={search} placeholder="Codice, cliente, descrizione, articolo..." /></label><label>Tipo<select name="type" defaultValue={type}><option value="">Tutti</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</select></label><button type="submit">Filtra</button>{(search || type) && <a href="/admin/movimenti" className="back-button">Azzera filtri</a>}</form></section><section className="panel"><h2>Elenco movimenti</h2>{rows.length === 0 ? <div className="empty">Nessun movimento trovato.</div> : <div className="movement-list">{rows.map((m: any) => <div className="movement" key={m.id}><div><b>{m.movement_code}</b><span>{formatDate(m.movement_at)}</span><span>Tipo: {m.movement_type}</span>{m.generic_customer_name && <span>Cliente: {m.generic_customer_name}</span>}{m.reference_code && <span>Riferimento: {m.reference_code}</span>}{m.description && <span>{m.description}</span>}{m.quantity != null && <span>Quantità: {m.quantity}</span>}</div><strong>{m.total_amount_eur == null ? '—' : money(Number(m.total_amount_eur))}</strong></div>)}</div>}</section></section></main>
}
