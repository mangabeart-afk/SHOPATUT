import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

const percent = (n: number) => `${n.toFixed(1)}%`

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

type MarketStats = {
  purchased: number
  sold: number
  available: number
  revenue: number
  costOfSold: number
  margin: number
  marginPercent: number
}

const emptyStats = (): MarketStats => ({
  purchased: 0,
  sold: 0,
  available: 0,
  revenue: 0,
  costOfSold: 0,
  margin: 0,
  marginPercent: 0,
})

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
    assignmentsResult,
    salesResult,
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
        'id,origin,quantity_purchased,unit_cost_eur,total_cost_eur'
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
      .limit(5),

    supabase
      .from('article_assignments')
      .select(
        'article_id,quantity_assigned,status'
      ),

    supabase
      .from('movements')
      .select(
        'article_id,quantity,total_amount_eur'
      )
      .eq('movement_type', 'VENDITA'),
  ])

  const articles = articlesResult.data || []
  const sales = salesResult.data || []
  const assignments = assignmentsResult.data || []

  const articleMap = new Map(
    articles.map((article) => [
      article.id,
      article,
    ])
  )

  const markets = {
    TOTALE: emptyStats(),
    GIAPPONE: emptyStats(),
    VIETNAM: emptyStats(),
    EUROPA: emptyStats(),
  }

  for (const article of articles) {
    const purchased = Number(
      article.quantity_purchased || 0
    )

    markets.TOTALE.purchased += purchased

    const origin = (article.origin || '')
      .trim()
      .toUpperCase()

    if (origin.includes('GIAPPONE')) {
      markets.GIAPPONE.purchased += purchased
    } else if (origin.includes('VIETNAM')) {
      markets.VIETNAM.purchased += purchased
    } else if (origin.includes('EUROPA')) {
      markets.EUROPA.purchased += purchased
    }
  }

  for (const sale of sales) {
    const quantity = Number(
      sale.quantity || 0
    )

    const revenue = Number(
      sale.total_amount_eur || 0
    )

    const article = sale.article_id
      ? articleMap.get(sale.article_id)
      : null

    const unitCost = Number(
      article?.unit_cost_eur || 0
    )

    const costOfSold = quantity * unitCost

    markets.TOTALE.sold += quantity
    markets.TOTALE.revenue += revenue
    markets.TOTALE.costOfSold += costOfSold

    if (!article) continue

    const origin = (article.origin || '')
      .trim()
      .toUpperCase()

    if (origin.includes('GIAPPONE')) {
      markets.GIAPPONE.sold += quantity
      markets.GIAPPONE.revenue += revenue
      markets.GIAPPONE.costOfSold += costOfSold
    } else if (origin.includes('VIETNAM')) {
      markets.VIETNAM.sold += quantity
      markets.VIETNAM.revenue += revenue
      markets.VIETNAM.costOfSold += costOfSold
    } else if (origin.includes('EUROPA')) {
      markets.EUROPA.sold += quantity
      markets.EUROPA.revenue += revenue
      markets.EUROPA.costOfSold += costOfSold
    }
  }

  for (const market of Object.values(markets)) {
    market.available = Math.max(
      0,
      market.purchased - market.sold
    )

    market.margin =
      market.revenue - market.costOfSold

    market.marginPercent =
      market.revenue > 0
        ? (market.margin / market.revenue) * 100
        : 0
  }

  let assignedUnits = 0

  for (const assignment of assignments) {
    if (assignment.status !== 'ATTIVA') continue

    assignedUnits += Number(
      assignment.quantity_assigned || 0
    )
  }

  const unassignedUnits = Math.max(
    0,
    markets.TOTALE.purchased - assignedUnits
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
      sum + Number(credit.amount_eur || 0),
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

  const movements = movementsResult.data || []

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))

  const marketRows = [
    ['🇯🇵 Giappone', markets.GIAPPONE],
    ['🇻🇳 Vietnam', markets.VIETNAM],
    ['🇪🇺 Europa', markets.EUROPA],
  ] as const

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

        {/* RIEPILOGO AMMINISTRATIVO */}
        <section className="panel">
          <h2>Riepilogo amministrativo</h2>

          <div className="grid">
            <div className="card">
              <div className="muted">Clienti</div>
              <strong>
                {customersResult.count || 0}
              </strong>
              <small>
                clienti registrati
              </small>
            </div>

            <div className="card">
              <div className="muted">Caselle</div>
              <strong>
                {mailboxesResult.count || 0}
              </strong>
              <small>
                caselle registrate
              </small>
            </div>

            <div className="card">
              <div className="muted">Pagamenti</div>
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
                {shipmentsResult.count || 0}
              </strong>
              <small>
                spedizioni registrate
              </small>
            </div>
          </div>
        </section>

        {/* ULTIMI MOVIMENTI */}
        <section className="panel">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <h2>Ultimi movimenti</h2>

            <a
              href="/admin/movimenti"
              className="back-button"
            >
              Vedi tutti i movimenti →
            </a>
          </div>

          {movements.length === 0 ? (
            <div className="empty">
              Nessun movimento registrato.
            </div>
          ) : (
            <div className="movement-list">
              {movements.map((movement) => (
                <div
                  className="movement"
                  key={movement.id}
                >
                  <div>
                    <b>
                      {movement.movement_code}
                    </b>

                    <span>
                      {movement.description ||
                        movement.movement_type}
                    </span>

                    <span>
                      {formatDate(
                        movement.movement_at
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
              ))}
            </div>
          )}
        </section>

        {/* MONITORAGGIO COMPLESSIVO */}
        <section className="panel">
          <h2>Monitoraggio complessivo</h2>

          <div className="grid">
            <div className="card">
              <div className="muted">
                Acquistati
              </div>
              <strong>
                {markets.TOTALE.purchased}
              </strong>
              <small>
                unità acquistate
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Venduti
              </div>
              <strong>
                {markets.TOTALE.sold}
              </strong>
              <small>
                unità vendute
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Disponibili
              </div>
              <strong>
                {markets.TOTALE.available}
              </strong>
              <small>
                unità disponibili
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Ricavi
              </div>
              <strong>
                {money(
                  markets.TOTALE.revenue
                )}
              </strong>
              <small>
                ricavi da vendite
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Costo del venduto
              </div>
              <strong>
                {money(
                  markets.TOTALE.costOfSold
                )}
              </strong>
              <small>
                costo articoli venduti
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Margine
              </div>
              <strong>
                {money(
                  markets.TOTALE.margin
                )}
              </strong>
              <small>
                margine commerciale
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Margine %
              </div>
              <strong>
                {percent(
                  markets.TOTALE
                    .marginPercent
                )}
              </strong>
              <small>
                sul ricavo
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Assegnati
              </div>
              <strong>
                {assignedUnits}
              </strong>
              <small>
                unità assegnate
              </small>
            </div>

            <div className="card">
              <div className="muted">
                Non assegnati
              </div>
              <strong>
                {unassignedUnits}
              </strong>
              <small>
                unità non assegnate
              </small>
            </div>
          </div>
        </section>

        {/* ANALISI PER PROVENIENZA */}
        <section className="panel">
          <h2>Analisi per provenienza</h2>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            {marketRows.map(
              ([label, market]) => (
                <div
                  key={label}
                  className="card"
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'minmax(130px, 1.2fr) repeat(7, minmax(90px, 1fr))',
                      gap: '1rem',
                      alignItems: 'center',
                    }}
                  >
                    <strong>
                      {label}
                    </strong>

                    <div>
                      <small>
                        Acquistati
                      </small>
                      <strong>
                        {market.purchased}
                      </strong>
                    </div>

                    <div>
                      <small>
                        Venduti
                      </small>
                      <strong>
                        {market.sold}
                      </strong>
                    </div>

                    <div>
                      <small>
                        Disponibili
                      </small>
                      <strong>
                        {market.available}
                      </strong>
                    </div>

                    <div>
                      <small>
                        Ricavi
                      </small>
                      <strong>
                        {money(
                          market.revenue
                        )}
                      </strong>
                    </div>

                    <div>
                      <small>
                        Costo venduto
                      </small>
                      <strong>
                        {money(
                          market.costOfSold
                        )}
                      </strong>
                    </div>

                    <div>
                      <small>
                        Margine
                      </small>
                      <strong>
                        {money(
                          market.margin
                        )}
                      </strong>
                    </div>

                    <div>
                      <small>
                        Margine %
                      </small>
                      <strong>
                        {percent(
                          market.marginPercent
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
