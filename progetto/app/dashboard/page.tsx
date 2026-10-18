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
          .select('customer_code')
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
    // La galleria è indipendente dall’utente e dagli altri dati della dashboard:
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


  // La galleria è indipendente dagli indicatori utente: un eventuale errore
  // della galleria non deve bloccare l'intera dashboard.
  if (customerError || mailboxError || assignmentsError || assignedArticlesError || customerSummaryError) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/dashboard" displayName={profile?.display_name} email={user.email} />
        <section className="content">
          <header className="topbar"><div><p className="eyebrow">AREA UTENTE</p><h1>Dashboard</h1></div><WhatsAppContact /></header>
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

  // La RPC restituisce gli articoli con foto ordinati per created_at (inserimento reale),
  // usando la sequenza del codice articolo come spareggio per righe importate con timestamp identico.
  // Non si usa purchase_date e non si filtra per stato o assegnazione.
  const recentPhotoArticles = ((recentPhotoArticlesRows || []) as RecentPhotoArticle[])
    .filter((article) => Boolean(article.photo_url?.trim()))
    .sort((a, b) => {
      const dateDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (dateDiff !== 0) return dateDiff
      const aSequence = Number(a.article_code.match(/(\d+)$/)?.[1] || 0)
      const bSequence = Number(b.article_code.match(/(\d+)$/)?.[1] || 0)
      return bSequence - aSequence || b.article_code.localeCompare(a.article_code)
    })
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
            <p className="eyebrow">AREA UTENTE</p>
            <h1>Dashboard</h1>
          </div>
          <WhatsAppContact />
        </header>

        {/* RIEPILOGO UTENTE: codice e saldo immediatamente visibili */}
        <section className="panel customer-code-balance-strip" aria-label="Codice utente e saldo">
          <div><span>Codice utente</span><strong>{customer?.customer_code || '—'}</strong></div>
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


        {/* ULTIMI 12 ARTICOLI INSERITI CON FOTO */}

        <section className="panel">
          <div className="section-heading">
            <h2>ULTIMI ARTICOLI CARICATI</h2>
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
