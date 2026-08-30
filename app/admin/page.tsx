import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

const menu = [
  ['Dashboard', '/admin'],
  ['Clienti', '/admin/clienti'],
  ['Caselle', '/admin/caselle'],
  ['Articoli', '/admin/articoli'],
  ['Pagamenti', '/admin/pagamenti'],
  ['Crediti', '/admin/crediti'],
  ['Spedizioni', '/admin/spedizioni'],
  ['Movimenti', '/admin/movimenti'],
]

export default async function AdminDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') {
    redirect('/dashboard')
  }

  const [
    customersResult,
    mailboxesResult,
    articlesResult,
    paymentsResult,
    creditsResult,
    shipmentsResult,
    movementsResult,
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('mailboxes')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('articles')
      .select(
        'id,quantity_purchased,total_cost_eur'
      ),

    supabase
      .from('payments')
      .select('amount_eur,amount'),

    supabase
      .from('credits')
      .select('amount_eur,used_amount_eur'),

    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('movements')
      .select(
        `
          id,
          movement_code,
          movement_type,
          movement_at,
          total_amount_eur,
          description
        `
      )
      .order('movement_at', {
        ascending: false,
      })
      .limit(8),
  ])

  const customersCount =
    customersResult.count || 0

  const mailboxesCount =
    mailboxesResult.count || 0

  const shipmentsCount =
    shipmentsResult.count || 0

  const articles = articlesResult.data || []

  const articleUnits = articles.reduce(
    (sum, article) =>
      sum +
      Number(article.quantity_purchased || 0),
    0
  )

  const articleValue = articles.reduce(
    (sum, article) =>
      sum +
      Number(article.total_cost_eur || 0),
    0
  )

  const payments = paymentsResult.data || []

  const paymentsTotal = payments.reduce(
    (sum, payment) =>
      sum +
      Number(
        payment.amount_eur ??
          payment.amount ??
          0
      ),
    0
  )

  const credits = creditsResult.data || []

  const creditsTotal = credits.reduce(
    (sum, credit) =>
      sum +
      Number(credit.amount_eur || 0),
    0
  )

  const creditsUsed = credits.reduce(
    (sum, credit) =>
      sum +
      Number(
        credit.used_amount_eur || 0
      ),
    0
  )

  const creditsRemaining = Math.max(
    0,
    creditsTotal - creditsUsed
  )

  const movements =
    movementsResult.data || []

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          MangaBEART <span>[ShopaTüT]</span>
        </div>

        <nav>
          {menu.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={
                href === '/admin'
                  ? 'active'
                  : ''
              }
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="side-note">
          V1 • AMMINISTRATORE
          <br />
          {profile?.display_name ||
            user.email}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>Dashboard</h1>
          </div>

          <a
            href="/dashboard"
            className="back-button"
          >
            ← Area cliente
          </a>
        </header>

        <div className="grid">
          <div className="card">
            <div className="muted">
              Clienti
            </div>

            <strong>
              {customersCount}
            </strong>

            <small>
              clienti registrati
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Caselle
            </div>

            <strong>
              {mailboxesCount}
            </strong>

            <small>
              caselle registrate
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Articoli
            </div>

            <strong>
              {articleUnits}
            </strong>

            <small>
              unità acquistate
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Valore articoli
            </div>

            <strong>
              {money(articleValue)}
            </strong>

            <small>
              costo totale articoli
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Pagamenti
            </div>

            <strong>
              {money(paymentsTotal)}
            </strong>

            <small>
              pagamenti registrati
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Crediti residui
            </div>

            <strong>
              {money(creditsRemaining)}
            </strong>

            <small>
              credito disponibile
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Spedizioni
            </div>

            <strong>
              {shipmentsCount}
            </strong>

            <small>
              spedizioni registrate
            </small>
          </div>

          <div className="card">
            <div className="muted">
              Movimenti recenti
            </div>

            <strong>
              {movements.length}
            </strong>

            <small>
              ultimi movimenti
            </small>
          </div>
        </div>

        <section className="panel">
          <h2>
            Ultimi movimenti
          </h2>

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
                    key={movement.id}
                  >
                    <div>
                      <b>
                        {
                          movement.movement_code
                        }
                      </b>

                      <span>
                        {movement.description ||
                          movement.movement_type}
                      </span>

                      <span>
                        {new Intl.DateTimeFormat(
                          'it-IT',
                          {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        ).format(
                          new Date(
                            movement.movement_at
                          )
                        )}
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
