import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import IncomingArticlesGallery from '../../components/incoming-articles-gallery'
import WhatsAppContact from '../../components/whatsapp-contact'

type Movement = {
  id?: string | null
  movement_code?: string | null
  movement_at?: string | null
  description?: string | null
  movement_type?: string | null
  total_amount_eur?: number | null
}

type RecentPhotoArticle = {
  id: string
  article_code: string
  series: string | null
  detail: string | null
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
    { data: movementsRows, error: movementsError },
    { data: recentPhotoArticlesRows, error: recentPhotoArticlesError },
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
          .eq('status', 'ATTIVA')
      : Promise.resolve({ data: [], error: null }),
    resolvedMailboxId
      ? supabase
          .from('movements')
          .select('id,movement_code,movement_at,description,movement_type,total_amount_eur')
          .eq('mailbox_id', resolvedMailboxId)
          .order('movement_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    // La galleria è indipendente dal cliente e dagli altri dati della dashboard:
    // caricala in parallelo per non allungare la risposta.
    supabase.rpc('customer_dashboard_recent_photo_articles'),
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
  if (customerError || mailboxError || assignmentsError || movementsError || assignedArticlesError) {
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
    return sum + (article?.status === 'IN_STOCK' ? Number(assignment.quantity_assigned || 0) : 0)
  }, 0)
  const inArrivo = assignmentRows.reduce((sum, assignment) => {
    const article = articleMap.get(assignment.article_id)
    return sum + (article?.status === 'IN_ARRIVO' ? Number(assignment.quantity_assigned || 0) : 0)
  }, 0)

  // La sezione mostra i 12 articoli più recenti che hanno una foto.
  // Non filtra per stato né per assegnazione a un cliente.
  const recentPhotoArticles = ((recentPhotoArticlesRows || []) as RecentPhotoArticle[])
    .filter((article) => Boolean(article.photo_url?.trim()))
    .slice(0, 12)

  const balance = Number(((movementsRows || []) as Movement[]).reduce((sum, movement) => sum + Number(movement.total_amount_eur || 0), 0))
  const movements: Movement[] = (movementsRows || []) as Movement[]

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

        {/* DATI CLIENTE */}

        <section className="panel customer-dashboard-panel">
          <div className="section-heading">
            <h2>{customer ? `${customer.first_name} ${customer.last_name}` : 'Dati cliente'}</h2>
            {customer?.customer_code && <strong>{customer.customer_code}</strong>}
          </div>

          {!customer ? (
            <div className="empty">Dati cliente non disponibili.</div>
          ) : (
            <div className="customer-dashboard-grid">
              <div><span>Nome</span><strong>{customer.first_name} {customer.last_name}</strong></div>
              <div><span>Email</span><strong>{customer.email || user.email || '—'}</strong></div>
              <div><span>Telefono</span><strong>{customer.phone || '—'}</strong></div>
              <div><span>Spedizione</span><strong>{[customer.shipping_address, customer.shipping_postal_code, customer.shipping_city, customer.shipping_country].filter(Boolean).join(' ') || '—'}</strong></div>
              <div><span>Cliente dal</span><strong>{formatDate(customer.created_at)}</strong></div>
            </div>
          )}
        </section>

        {/* PANNELLO DI CONTROLLO */}

        <section className="panel dashboard-control-panel">
          <div className="section-heading">
            <h2>Pannello di controllo</h2>
          </div>
          <div className="dashboard-control-grid">
            <div className="dashboard-control-card">
              <span>Saldo</span>
              <strong>{money(balance)}</strong>
              <small>saldo casella</small>
            </div>
            <div className="dashboard-control-card">
              <span>In Stock</span>
              <strong>{inStock}</strong>
              <small>articoli acquistati</small>
            </div>
            <div className="dashboard-control-card">
              <span>In Arrivo</span>
              <strong>{inArrivo}</strong>
              <small>articoli acquistati</small>
            </div>
          </div>
        </section>

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

        {/* ULTIMI 5 MOVIMENTI */}

        <section className="panel">
          <div className="section-heading">
            <h2>
              Ultimi movimenti
            </h2>

            <a
              href="/movimenti"
              className="back-button"
            >
              Visualizza tutti →
            </a>
          </div>

          {movements.length === 0 ? (
            <div className="empty">
              Nessun movimento registrato.
            </div>
          ) : (
            <div className="movement-list">
              {movements.map(
                (movement) => (
                  <div
                    className="movement"
                    key={
                      movement.id ||
                      movement.movement_code
                    }
                  >
                    <div>
                      <b>
                        {
                          movement.movement_code
                        }
                      </b>

                      <span>
                        {formatDate(
                          movement.movement_at
                        )}
                      </span>

                      <span>
                        {movement.description ||
                          movement.movement_type}
                      </span>
                    </div>

                    <strong>
                      {movement.total_amount_eur ==
                      null
                        ? '—'
                        : money(
                            Number(
                              movement.total_amount_eur
                            )
                          )}
                    </strong>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
