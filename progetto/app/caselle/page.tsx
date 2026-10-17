import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value))
}

export default async function CasellePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,display_name,mailbox_id,customer_id').eq('user_id', user.id).maybeSingle()
  if (profile?.role === 'AMMINISTRATORE') redirect('/admin')

  const mailboxId = profile?.mailbox_id
  const { data: customer } = profile?.customer_id
    ? await supabase.from('customers').select('customer_code').eq('id', profile.customer_id).maybeSingle()
    : { data: null }
  if (!mailboxId) {
    return <main className="shell"><Navigation role="CLIENTE" active="/caselle" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AREA CLIENTE</p><h1>La mia casella</h1></div><WhatsAppContact /></header><section className="panel"><h2>Casella cliente</h2><div className="empty">Nessuna casella associata al tuo account.</div></section></section></main>
  }

  const { data: overview, error: overviewError } = await supabase.rpc('customer_mailbox_overview')

  const mailbox = overview?.mailbox || null
  const assignments = Array.isArray(overview?.assignments) ? overview.assignments : []
  const shipments = Array.isArray(overview?.shipments) ? overview.shipments : []
  const saleMovements = Array.isArray(overview?.sales) ? overview.sales : []
  const paymentRows = Array.isArray(overview?.payments) ? overview.payments : []
  const allocationRows = Array.isArray(overview?.allocations) ? overview.allocations : []
  const articles = Array.isArray(overview?.articles) ? overview.articles : []

  const mailboxError = overviewError

  if (mailboxError || !mailbox) {
    return <main className="shell"><Navigation role="CLIENTE" active="/caselle" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AREA CLIENTE</p><h1>La mia casella</h1></div><WhatsAppContact /></header><section className="panel"><div className="error">Impossibile caricare la casella.</div></section></section></main>
  }

  const articleById = new Map((articles || []).map((a: any) => [a.id, a]))

  const shipmentRows = shipments || []
  const paidByMovement = new Map<string, number>()
  for (const allocation of allocationRows || []) paidByMovement.set(allocation.movement_id, (paidByMovement.get(allocation.movement_id) || 0) + Number(allocation.amount_eur || 0))
  const paymentsById = new Map((paymentRows || []).map((p: any) => [p.id, p]))
  const allocationsByMovement = new Map<string, any[]>()
  for (const allocation of allocationRows || []) { const list = allocationsByMovement.get(allocation.movement_id) || []; list.push(allocation); allocationsByMovement.set(allocation.movement_id, list) }
  const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
  const shippedQtyByArticle = new Map<string, number>()
  for (const assignment of assignments as any[]) {
    if (assignment.status === 'SPEDITO') shippedQtyByArticle.set(assignment.article_id, Number(assignment.quantity_assigned || 0))
  }

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/caselle" displayName={profile?.display_name} email={user.email} />
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">AREA CLIENTE</p><h1>La mia casella</h1></div><WhatsAppContact /></header>

        <section className="panel">
          <div className="section-heading"><h2>{customer?.customer_code || 'Cliente'}</h2><strong>{mailbox.status}</strong></div>
          <div className="customer-details">
            <div className="customer-detail"><span className="muted">Data apertura</span><strong>{formatDate(mailbox.opened_at)}</strong></div>
            {mailbox.notes && <div className="customer-detail"><span className="muted">Note</span><strong>{mailbox.notes}</strong></div>}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading"><h2>Articoli ordinati</h2><span className="muted">Articoli assegnati alla tua casella</span></div>
          {(assignments || []).length === 0 ? <div className="empty">Nessun articolo ordinato nella casella.</div> : <div className="movement-list">{(assignments || []).map((assignment: any) => { const article: any = articleById.get(assignment.article_id); return <div className="movement" key={assignment.id}><div><div className="article-title-row"><b>{article?.article_code || 'Articolo'}</b>{article?.photo_url && <a href={article.photo_url} target="_blank" rel="noreferrer" className="article-photo-link" title="Visualizza foto">🔍</a>}</div>{article?.series && <span>Serie: {article.series}</span>}{article?.detail && <span>{article.detail}</span>}<span>Stato: {assignment.status === 'SPEDITO' ? 'SPEDITO' : assignment.status === 'IN_BOX' ? 'IN BOX' : article?.status === 'IN_ARRIVO' ? 'IN ARRIVO' : 'IN STOCK'}</span><span>Ordinato il: {formatDate(assignment.assigned_at)}</span></div><div><span>Quantità ordinata: {Number(assignment.quantity_assigned || 0)}</span><span>Quantità spedita: {shippedQtyByArticle.get(assignment.article_id) || 0}</span></div></div> })}</div>}
        </section>


        <section className="panel">
          <div className="section-heading"><h2>Pagamenti e saldi articoli</h2><span className="muted">I pagamenti sono distribuiti automaticamente dal più vecchio al più recente.</span></div>
          {(saleMovements || []).length === 0 ? <div className="empty">Nessun articolo venduto presente nella casella.</div> : <div className="movement-list">{(saleMovements || []).map((movement: any) => { const article: any = articleById.get(movement.article_id); const due = Number(movement.total_amount_eur || 0); const paid = Number(paidByMovement.get(movement.id) || 0); const remaining = Math.max(0, due - paid); return <div className="movement" key={movement.id}><div><b>{article?.article_code || 'Articolo'}</b><span>Importo articolo: {money(due)}</span><span>{remaining <= 0 ? 'SALDATO' : `ACCONTO ${money(paid)} · RESIDUO ${money(remaining)}`}</span>{(allocationsByMovement.get(movement.id) || []).map((allocation: any) => { const payment: any = paymentsById.get(allocation.payment_id); return <small key={`${allocation.payment_id}-${allocation.movement_id}`}>Pagamento {payment?.payment_code || '—'} · {money(Number(allocation.amount_eur || 0))} · {formatDate(payment?.payment_date || allocation.allocated_at)}</small> })}</div></div> })}</div>}
          {(paymentRows || []).length > 0 && <div className="customer-notes"><b>Pagamenti registrati:</b> {(paymentRows || []).map((payment: any) => `${payment.payment_code} ${money(Number(payment.amount_eur ?? payment.amount ?? 0))} ${formatDate(payment.payment_date)}`).join(' · ')}</div>}
        </section>
        <section className="panel">
          <div className="section-heading"><h2>Articoli spediti</h2><span className="muted">Stato registrato direttamente sugli articoli</span></div>
          {assignments.filter((assignment: any) => assignment.status === 'SPEDITO').length === 0 ? <div className="empty">Nessun articolo contrassegnato come SPEDITO.</div> : <div className="movement-list">{assignments.filter((assignment: any) => assignment.status === 'SPEDITO').map((assignment: any) => { const article: any = articleById.get(assignment.article_id); return <div className="movement" key={assignment.id}><div><b>{article?.article_code || 'Articolo'}</b>{article?.series && <span>{article.series}</span>}{article?.detail && <span>{article.detail}</span>}<span>Quantità spedita: {Number(assignment.quantity_assigned || 0)}</span></div></div>})}</div>}
        </section>
      </section>
    </main>
  )
}
