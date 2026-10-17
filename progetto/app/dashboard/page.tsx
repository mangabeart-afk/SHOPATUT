import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import IncomingArticlesGallery from '../../components/incoming-articles-gallery'
import WhatsAppContact from '../../components/whatsapp-contact'

type RecentPhotoArticle = {
  id: string
  article_code: string
  series: string | null
  detail: string | null
  origin: string | null
  photo_url: string | null
  created_at: string
  status: string | null
}

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(value))
}

export default async function Dashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'role,display_name,customer_id,mailbox_id'
    )
    .eq('user_id', user.id)
    .maybeSingle()

  const role = profile?.role || 'CLIENTE'

  if (role === 'AMMINISTRATORE') {
    redirect('/admin')
  }

  let resolvedMailboxId = profile?.mailbox_id || null
  if (!resolvedMailboxId && profile?.customer_id) {
    const { data: fallbackMailbox } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('customer_id', profile.customer_id)
      .maybeSingle()
    resolvedMailboxId = fallbackMailbox?.id || null
  }

  const [
    { data: customer, error: customerError },
    { data: mailbox, error: mailboxError },
    { data: assignments, error: assignmentsError },
    { data: recentPhotoArticlesRows, error: recentPhotoArticlesError },
    { data: customerSummaryRows, error: customerSummaryError },
  ] = await Promise.all([
    profile?.customer_id
      ? supabase
          .from('customers')
          .select('customer_code,first_name,last_name,email,phone,shipping_address,shipping_city,shipping_postal_code,shipping_country,created_at')
          .eq('id', profile.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    resolvedMailboxId
      ? supabase
          .from('mailboxes')
          .select('id,status')
          .eq('id', resolvedMailboxId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    resolvedMailboxId
      ? supabase
          .from('article_assignments')
          .select('article_id,quantity_assigned,status')
          .eq('mailbox_id', resolvedMailboxId)
          .in('status', ['ATTIVA', 'IN_ARRIVO', 'IN_STOCK', 'IN_BOX'])
      : Promise.resolve({ data: [], error: null }),
    // La galleria è indipendente dal cliente e dagli altri dati della dashboard:
    // caricala in parallelo per non allungare la risposta.
    supabase.rpc('customer_dashboard_recent_photo_articles_v2'),
    supabase.rpc('customer_dashboard_summary'),
  ])

  const assignmentRows = (assignments || []) as Array<{ article_id: string; quantity_assigned: number | null; status: string | null }>
  const articleIds = [...new Set(assignmentRows.map((row) => row.article_id).filter(Boolean))]

  const { data: assignedArticles, error: assignedArticlesError } = articleIds.length
    ? await supabase
        .from('articles')
        .select('id,article_code,series,detail,photo_url,created_at,status')
        .in('id', articleIds)
    : { data: [], error: null }


  // La galleria è indipendente dagli indicatori cliente: un eventuale errore
  // della galleria non deve bloccare l'intera dashboard.
  if (customerError || mailboxError || assignmentsError || assignedArticlesError || customerSummaryError) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/dashboard" displayName={profile?.display_name} email={user.email} />
        <section className="content">
          <header className="topbar"><div><p className="eyebrow">AREA CLIENTE</p><h1>Dashboard</h1></div><WhatsAppContact /></header>
          <section className="panel"><div className="error">Impossibile caricare i dati della dashboard.</div></section>
        </section>
      </main>
    )
  }

  const articleMap = new Map((assignedArticles || []).map((article) => [article.id, article]))
  const inStock = assignmentRows.reduce((sum, assignment) => {
    const article = articleMap.get(assignment.article_id)
    return sum + (assignment.status === 'IN_STOCK' ? Number(assignment.quantity_assigned || 0) : 0)
  }, 0)
  const inArrivo = assignmentRows.reduce((sum, assignment) => {
    const article = articleMap.get(assignment.article_id)
    return sum + (assignment.status === 'IN_ARRIVO' ? Number(assignment.quantity_assigned || 0) : 0)
  }, 0)
  const inBox = assignmentRows.reduce((sum, assignment) => {
    return sum + (assignment.status === 'IN_BOX' ? Number(assignment.quantity_assigned || 0) : 0)
  }, 0)

  // La sezione mostra i 12 articoli più recenti che hanno una foto.
  // Non filtra per stato né per assegnazione a un cliente.
  const recentPhotoArticles = ((recentPhotoArticlesRows || []) as RecentPhotoArticle[])
    .filter((article) => Boolean(article.photo_url?.trim()))
    .slice(0, 12)

  // Il saldo contabile arriva dal riepilogo server-side completo, non dagli ultimi 5 movimenti mostrati nella dashboard.
  const summaryRow = Array.isArray(customerSummaryRows) ? (customerSummaryRows as any[])[0] : customerSummaryRows
  const balance = Number(summaryRow?.balance_eur || 0)

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/dashboard" displayName={profile?.display_name} email={user.email} />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Dashboard</h1>
          </div>
          <WhatsAppContact />
        </header>

        {/* RIEPILOGO UTENTE: codice e saldo immediatamente visibili */}
        <section className="panel customer-code-balance-strip" aria-label="Codice cliente e saldo">
          <div><span>Codice cliente</span><strong>{customer?.customer_code || '—'}</strong></div>
          <div><span>Saldo da pagare</span><strong>{money(balance)}</strong></div>
        </section>

        {/* I tre contatori logistici sono l'unico riepilogo quantità nell'area utente. */}
        <section className="panel dashboard-control-panel">
          <div className="section-heading">
            <h2>La mia casella</h2>
          </div>
          <div className="dashboard-control-grid">
            <div className="dashboard-control-card dashboard-control-incoming">
              <span>IN ARRIVO</span>
              <strong>{inArrivo}</strong>
            </div>
            <div className="dashboard-control-card dashboard-control-stock">
              <span>IN STOCK</span>
              <strong>{inStock}</strong>
            </div>
            <div className="dashboard-control-card dashboard-control-box">
              <span>IN BOX</span>
              <strong>{inBox}</strong>
            </div>
          </div>
        </section>

        <details className="panel customer-details-panel">
          <summary>
            <span><strong>Profilo utente</strong><small>{customer ? `${customer.first_name} ${customer.last_name}` : 'Dati cliente'}</small></span>
            <span className="customer-details-toggle">Mostra dettagli</span>
          </summary>
          {!customer ? (
            <div className="empty">Dati cliente non disponibili.</div>
          ) : (
            <div className="customer-dashboard-grid">
              <div><span>Nome e cognome</span><strong>{customer.first_name} {customer.last_name}</strong></div>
              <div><span>Email</span><strong>{customer.email || user.email || '—'}</strong></div>
              <div><span>Telefono</span><strong>{customer.phone || '—'}</strong></div>
              <div><span>Indirizzo di spedizione</span><strong>{[customer.shipping_address, customer.shipping_postal_code, customer.shipping_city, customer.shipping_country].filter(Boolean).join(' ') || '—'}</strong></div>
              <div><span>Utente dal</span><strong>{formatDate(customer.created_at)}</strong></div>
            </div>
          )}
        </details>

        {/* ULTIMI 12 ARTICOLI INSERITI CON FOTO */}

        <section className="panel">
          <div className="section-heading">
            <h2>ULTIMI ARTICOLI INSERITI</h2>
          </div>

          {recentPhotoArticlesError ? (
            <div className="empty">Galleria temporaneamente non disponibile.</div>
          ) : !recentPhotoArticles || recentPhotoArticles.length === 0 ? (
            <div className="empty">Nessun articolo con foto disponibile.</div>
          ) : (
            <IncomingArticlesGallery articles={recentPhotoArticles} />
          )}
        </section>

      </section>
    </main>
  )
}
