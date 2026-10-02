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

  const { data: dashboardRows, error: dashboardError } = await supabase.rpc('customer_dashboard_summary')

  if (dashboardError) {
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

  const dashboard = (dashboardRows || [])[0] as any
  const customer = dashboard
    ? {
        first_name: dashboard.customer_first_name,
        last_name: dashboard.customer_last_name,
        email: dashboard.customer_email,
        phone: dashboard.customer_phone,
        shipping_address: dashboard.shipping_address,
        shipping_city: dashboard.shipping_city,
        shipping_postal_code: dashboard.shipping_postal_code,
        shipping_country: dashboard.shipping_country,
        created_at: dashboard.customer_created_at,
      }
    : null

  const mailbox = dashboard
    ? { id: dashboard.mailbox_id, status: dashboard.mailbox_status, mailbox_code: dashboard.mailbox_code }
    : null

  const balance = Number(dashboard?.balance_eur || 0)
  const inStock = Number(dashboard?.in_stock || 0)
  const inArrivo = Number(dashboard?.in_arrivo || 0)
  const movements: Movement[] = Array.isArray(dashboard?.recent_movements) ? dashboard.recent_movements as Movement[] : []

  const { data: incomingArticles } = await supabase
    .from('articles')
    .select('id,article_code,series,detail,photo_url,created_at,status')
    .eq('status', 'IN_ARRIVO')
    .not('photo_url', 'is', null)
    .neq('photo_url', '')
    .order('created_at', { ascending: false })
    .limit(12)

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
            {mailbox?.mailbox_code && <strong>{mailbox.mailbox_code}</strong>}
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

        {/* NUOVI ARTICOLI IN ARRIVO */}

        <section className="panel">
          <div className="section-heading">
            <h2>NUOVI ARRIVI</h2>
          </div>

          {!incomingArticles || incomingArticles.length === 0 ? (
            <div className="empty">Nessun nuovo articolo con foto disponibile.</div>
          ) : (
            <IncomingArticlesGallery articles={incomingArticles} />
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
