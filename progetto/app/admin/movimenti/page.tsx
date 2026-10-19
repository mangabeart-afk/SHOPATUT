import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'
import CustomerAutocomplete from '../../../components/customer-autocomplete'

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'
type SearchParams = Promise<{ search?: string; customer_code?: string; type?: string; from?: string; to?: string; page?: string }>

export default async function AdminMovimentiPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const params = await searchParams
  const search = params.search?.trim().toLowerCase() || ''
  const customerCode = params.customer_code?.trim().toLowerCase() || ''
  const type = params.type?.trim() || ''
  const from = params.from?.trim() || ''
  const to = params.to?.trim() || ''
  const pageSize = 100
  const requestedPage = Math.max(1, Number.parseInt(params.page || '1', 10) || 1)
  const { data: mailboxes, error: mailboxError } = await supabase
    .from('mailboxes')
    .select('id,customer_id,customers(first_name,last_name,email,customer_code)')
    .order('customer_id')
  if (mailboxError) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i movimenti: {mailboxError.message}</div></section></section></main>

  const selectedMailboxId = customerCode ? (mailboxes || []).find((m: any) => String((Array.isArray(m.customers)?m.customers[0]?.customer_code:m.customers?.customer_code) || '').toLowerCase() === customerCode)?.id : null
  const buildMovementsQuery = () => {
    let query = supabase.from('movements').select('id,movement_code,movement_at,movement_type,reference_code,mailbox_id,article_id,generic_customer_name,customer_name,description,notes,change_before,change_after', { count: 'exact' }).order('movement_at', { ascending: false }).order('id', { ascending: false })
    if (type) query = query.eq('movement_type', type)
    if (from) query = query.gte('movement_at', `${from}T00:00:00`)
    if (to) query = query.lt('movement_at', `${to}T23:59:59.999`)
    if (customerCode) query = query.eq('mailbox_id', selectedMailboxId || '00000000-0000-0000-0000-000000000000')
    if (search) {
      const q = search.replace(/[%_]/g, '\\$&')
      query = query.or([
        `movement_code.ilike.%${q}%`,
        `movement_type.ilike.%${q}%`,
        `reference_code.ilike.%${q}%`,
        `generic_customer_name.ilike.%${q}%`,
        `customer_name.ilike.%${q}%`,
        `description.ilike.%${q}%`,
        `notes.ilike.%${q}%`,
        `article_id.ilike.%${q}%`,
        `mailbox_id.ilike.%${q}%`,
      ].join(','))
    }
    return query
  }
  let movementsResult = await buildMovementsQuery().range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1)
  if (movementsResult.error) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header><section className="panel"><div className="error">Impossibile caricare i movimenti: {movementsResult.error.message}</div></section></section></main>

  const movementCount = Number(movementsResult.count || 0)
  const totalPages = Math.max(1, Math.ceil(movementCount / pageSize))
  let currentPage = Math.min(requestedPage, totalPages)
  if (requestedPage > totalPages && movementCount > 0) {
    movementsResult = await buildMovementsQuery().range((totalPages - 1) * pageSize, totalPages * pageSize - 1)
    if (movementsResult.error) return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><section className="panel"><div className="error">Impossibile caricare i movimenti: {movementsResult.error.message}</div></section></section></main>
    currentPage = totalPages
  }
  const rows = movementsResult.data || []
  const mailboxById = new Map((mailboxes || []).map((m: any) => [m.id, m]))
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
  const pageHref = (page: number) => {
    const query = new URLSearchParams()
    if (params.search) query.set('search', params.search)
    if (params.customer_code) query.set('customer_code', params.customer_code)
    if (type) query.set('type', type)
    if (from) query.set('from', from)
    if (to) query.set('to', to)
    query.set('page', String(page))
    return `/admin/movimenti?${query.toString()}`
  }

  return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/movimenti" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Movimenti</h1></div></header>
    <section className="panel"><h2>Filtri</h2><form action="/admin/movimenti" method="get" className="form"><label>Da<input type="date" name="from" defaultValue={from} /></label><label>A<input type="date" name="to" defaultValue={to} /></label><label>Codice utente<CustomerAutocomplete name="customer_code" value={customerCode.toUpperCase()} placeholder="Cerca codice, nome o cognome..." options={(mailboxes || []).map((m:any)=>{const c=Array.isArray(m.customers)?m.customers[0]:m.customers;return {id:m.id,code:c?.customer_code||'',name:c?`${c.first_name||''} ${c.last_name||''}`.trim():'Utente',email:c?.email||null}})} /></label><label>Ricerca<input type="search" name="search" defaultValue={search} placeholder="Codice movimento, descrizione, articolo..." /></label><label>Tipo<select name="type" defaultValue={type}><option value="">Tutti</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</select></label><button type="submit">Filtra</button>{(search || customerCode || type || from || to) && <a href="/admin/movimenti" className="back-button">Azzera filtri</a>}</form></section>
    <section className="panel"><h2>Elenco movimenti</h2>{rows.length === 0 ? <div className="empty">Nessun movimento trovato.</div> : <div className="movement-list movement-list-linear">
      <div className="movement-linear-header"><span>DATA ORA</span><span>MOVIMENTO</span><span>ELEMENTO</span><span>CODICE</span><span>TIPO</span><span>DETTAGLI</span></div>
      {rows.map((m: any) => { const mailbox: any = mailboxById.get(m.mailbox_id); const linkedCustomer = Array.isArray(mailbox?.customers) ? mailbox.customers[0] : mailbox?.customers; const customerCode = linkedCustomer?.customer_code || m.customer_name || m.generic_customer_name || '—'; return <div className="movement-linear-row" key={m.id}>
        <span className="movement-linear-date">{formatDate(m.movement_at)}</span>
        <span className="movement-linear-code">{m.movement_code || '—'}</span>
        <span className="movement-linear-code">{m.reference_code || '—'}</span>
        <span className="movement-linear-code">{customerCode}</span>
        <span className="movement-linear-type">{movementLabel(m)}</span>
        <span className="movement-linear-description">{movementDetails(m)}</span>
      </div> })}</div>}
      {Number(movementCount || 0) > pageSize && <nav aria-label="Paginazione movimenti amministratore" className="server-archive-pagination"><a className="filter-submit" href={pageHref(Math.max(1, currentPage - 1))} aria-disabled={currentPage <= 1}>‹ Precedente</a><span>Pagina {currentPage} di {totalPages} · {movementCount} movimenti</span><a className="filter-submit" href={pageHref(Math.min(totalPages, currentPage + 1))} aria-disabled={currentPage >= totalPages}>Successiva ›</a></nav>}
    </section>
  </section></main>
}
