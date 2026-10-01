import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'
type SearchParams = Promise<{ search?: string; type?: string; from?: string; to?: string }>

export default async function AdminMovimentiPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const params = await searchParams
  const search = params.search?.trim().toLowerCase() || ''
  const type = params.type?.trim() || ''
  const from = params.from?.trim() || ''
  const to = params.to?.trim() || ''
  let query = supabase.from('movements').select('id,movement_code,movement_at,movement_type,reference_code,mailbox_id,article_id,generic_customer_name,description,notes,change_before,change_after').order('movement_at', { ascending: false })
  if (type) query = query.eq('movement_type', type)
  if (from) query = query.gte('movement_at', `${from}T00:00:00`)
  if (to) query = query.lt('movement_at', `${to}T23:59:59.999`)
  const [{ data: movements, error }, { data: mailboxes, error: mailboxError }] = await Promise.all([query, supabase.from('mailboxes').select('id,mailbox_code,customer_id,customers(first_name,last_name)').order('mailbox_code')])
  if (error || mailboxError) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i movimenti: {(error || mailboxError)?.message}</div></section></section></main>

  const mailboxById = new Map((mailboxes || []).map((m: any) => [m.id, m]))
  const rows = (movements || []).filter((m: any) => !search || [m.movement_code,m.movement_type,m.reference_code,m.generic_customer_name,m.description,m.notes,m.article_id,m.mailbox_id].filter(Boolean).join(' ').toLowerCase().includes(search))
  const movementLabel = (m: any) => {
    switch (m.movement_type) {
      case 'NUOVO_UTENTE': return 'Creazione'
      case 'ARTICOLO': return 'Creazione'
      case 'VENDITA': return 'Vendita'
      case 'PAGAMENTO': return 'Pagamento'
      case 'CREDITO': return 'Credito'
      case 'SPEDIZIONE': return 'Spedizione'
      case 'MODIFICA': return 'Modifica'
      case 'ANNULLAMENTO': return 'Cancellazione'
      case 'STORNO': return 'Storno'
      default: return m.description || 'Movimento'
    }
  }
  const formatChange = (value: any) => {
    if (!value) return '—'
    if (typeof value !== 'object') return String(value)
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([key, v]) => `${key}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ') || '—'
  }
  const movementDetails = (m: any) => {
    if (m.movement_type === 'MODIFICA') {
      return <>
        <span className="movement-detail-line"><b>Prima:</b> {formatChange(m.change_before)}</span>
        <span className="movement-detail-line"><b>Dopo:</b> {formatChange(m.change_after)}</span>
      </>
    }
    if (m.movement_type === 'ANNULLAMENTO') {
      return <span className="movement-detail-restore">Ripristino</span>
    }
    return <span>{m.description || m.notes || '—'}</span>
  }
  const types = ['NUOVO_UTENTE','ARTICOLO','VENDITA','PAGAMENTO','CREDITO','SPEDIZIONE','MODIFICA','ANNULLAMENTO','STORNO','ALTRO']

  return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header>
    <section className="panel"><h2>Filtri</h2><form action="/admin/movimenti" method="get" className="form"><label>Da<input type="date" name="from" defaultValue={from} /></label><label>A<input type="date" name="to" defaultValue={to} /></label><label>Ricerca<input type="search" name="search" defaultValue={search} placeholder="Codice, cliente, casella, descrizione, articolo..." /></label><label>Tipo<select name="type" defaultValue={type}><option value="">Tutti</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</select></label><button type="submit">Filtra</button>{(search || type || from || to) && <a href="/admin/movimenti" className="back-button">Azzera filtri</a>}</form></section>
    <section className="panel"><h2>Elenco movimenti</h2>{rows.length === 0 ? <div className="empty">Nessun movimento trovato.</div> : <div className="movement-list movement-list-linear">
      <div className="movement-linear-header"><span>DATA ORA</span><span>MOVIMENTO</span><span>ELEMENTO</span><span>CODICE</span><span>TIPO</span><span>DETTAGLI</span></div>
      {rows.map((m: any) => { const mailbox: any = mailboxById.get(m.mailbox_id); const customerCode = mailbox?.mailbox_code || m.generic_customer_name || '—'; return <div className="movement-linear-row" key={m.id}>
        <span className="movement-linear-date">{formatDate(m.movement_at)}</span>
        <span className="movement-linear-code">{m.movement_code || '—'}</span>
        <span className="movement-linear-code">{m.reference_code || '—'}</span>
        <span className="movement-linear-code">{customerCode}</span>
        <span className="movement-linear-type">{movementLabel(m)}</span>
        <span className="movement-linear-description">{movementDetails(m)}</span>
      </div> })}</div>}</section>
  </section></main>
}
