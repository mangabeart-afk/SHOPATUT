import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'
import MovementChangeModal from '../../../components/movement-change-modal'
import MovementRestoreButton from '../../../components/movement-restore-button'

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'
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
  let query = supabase.from('movements').select('id,movement_code,movement_at,movement_type,reference_code,mailbox_id,article_id,reference_id,description,notes,change_before,change_after').order('movement_at', { ascending: false })
  if (type) query = query.eq('movement_type', type)
  if (from) query = query.gte('movement_at', `${from}T00:00:00`)
  if (to) query = query.lt('movement_at', `${to}T23:59:59.999`)
  const [{ data: movements, error }, { data: mailboxes, error: mailboxError }] = await Promise.all([
    query,
    supabase.from('mailboxes').select('id,mailbox_code,customer_id,customers(first_name,last_name)').order('mailbox_code'),
  ])
  if (error || mailboxError) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i movimenti: {(error || mailboxError)?.message}</div></section></section></main>

  const mailboxById = new Map((mailboxes || []).map((m: any) => [m.id, m]))
  const rows = (movements || []).filter((m: any) => !search || [m.movement_code,m.movement_type,m.reference_code,m.description,m.notes,m.article_id,m.mailbox_id].filter(Boolean).join(' ').toLowerCase().includes(search))
  const movementLabel = (m: any) => {
    switch (m.movement_type) {
      case 'NUOVO_UTENTE': return 'Creazione'
      case 'ARTICOLO': return 'Creazione'
      case 'VENDITA': return 'Vendita'
      case 'PAGAMENTO': return 'Pagamento'
      case 'CREDITO': return 'Credito'
      case 'SPEDIZIONE': return 'Spedizione'
      case 'MODIFICA': return 'Modifica'
      case 'ANNULLAMENTO': return 'Eliminazione'
      case 'STORNO': return 'Storno'
      default: return m.description || 'Movimento'
    }
  }
  const types = ['NUOVO_UTENTE','ARTICOLO','VENDITA','PAGAMENTO','CREDITO','SPEDIZIONE','MODIFICA','ANNULLAMENTO','STORNO','ALTRO']

  return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header>
    <section className="panel"><h2>Filtri</h2><form action="/admin/movimenti" method="get" className="form"><label>Da<input type="date" name="from" defaultValue={from} /></label><label>A<input type="date" name="to" defaultValue={to} /></label><label>Ricerca<input type="search" name="search" defaultValue={search} placeholder="Codice, cliente, casella, descrizione, articolo..." /></label><label>Tipo<select name="type" defaultValue={type}><option value="">Tutti</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</select></label><button type="submit">Filtra</button>{(search || type || from || to) && <a href="/admin/movimenti" className="back-button">Azzera filtri</a>}</form></section>
    <section className="panel"><h2>Elenco movimenti</h2>{rows.length === 0 ? <div className="empty">Nessun movimento trovato.</div> : <div className="movement-list movement-list-linear">
      <div className="movement-linear-header"><span>DATA</span><span>CODICE · RIFERIMENTO</span><span>TIPO DI MOVIMENTO</span><span>DETTAGLIO</span></div>
      {rows.map((m: any) => { const mailbox: any = mailboxById.get(m.mailbox_id); return <div className="movement-linear-row" key={m.id}>
        <span className="movement-linear-date">{formatDate(m.movement_at)}</span>
        <span><b>{m.movement_code}</b>{m.reference_code && <> · {m.reference_code}</>}</span>
        <span className="movement-linear-type">{movementLabel(m)}</span>
        <span className="movement-linear-detail">{m.movement_type === 'MODIFICA' ? <MovementChangeModal before={m.change_before} after={m.change_after} title={`${m.movement_code}${m.reference_code ? ` · ${m.reference_code}` : ''}`} /> : m.movement_type === 'ANNULLAMENTO' && m.article_id && m.description === "Articolo eliminato dall'Archivio" ? <MovementRestoreButton movementId={m.article_id} movementCode={m.movement_code} kind="article" /> : m.movement_type === 'ANNULLAMENTO' && (m.description === 'Pagamento annullato' || m.description === 'Credito annullato') ? <MovementRestoreButton movementId={m.id} movementCode={m.movement_code} kind="generic" /> : m.movement_type === 'ANNULLAMENTO' && m.description === 'Spedizione annullata' ? <MovementRestoreButton movementId={m.reference_id || m.id} movementCode={m.movement_code} kind="shipment" /> : (m.description || '—')}</span>
      </div> })}
    </div>}</section>
  </section></main>
}
