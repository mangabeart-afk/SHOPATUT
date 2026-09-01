import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

export default async function PagamentiPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: payments, error } = await supabase
    .from('payments')
    .select('id,amount_eur,amount')
    .order('id', { ascending: false })

  if (error) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/pagamenti" email={user.email} />
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Pagamenti</h1>
            </div>
          </header>

          <section className="panel">
            <h2>I miei pagamenti</h2>

            <div className="empty">
              Impossibile caricare i pagamenti.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const rows = payments || []

  const total = rows.reduce(
    (sum, payment) =>
      sum + Number(payment.amount_eur ?? payment.amount ?? 0),
    0
  )

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/pagamenti" email={user.email} />
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Pagamenti</h1>
          </div>
        </header>

        <div className="grid">
          <div className="card">
            <div className="muted">Totale pagamenti</div>
            <strong>{money(total)}</strong>
            <small>importo totale visibile</small>
          </div>

          <div className="card">
            <div className="muted">Numero pagamenti</div>
            <strong>{rows.length}</strong>
            <small>pagamenti visibili</small>
          </div>
        </div>

        <section className="panel">
          <h2>Storico pagamenti</h2>

          {rows.length === 0 ? (
            <div className="empty">
              Nessun pagamento registrato.
            </div>
          ) : (
            <div className="movement-list">
              {rows.map((payment) => {
                const amount = Number(
                  payment.amount_eur ?? payment.amount ?? 0
                )

                return (
                  <div
                    className="movement"
                    key={payment.id}
                  >
                    <div>
                      <b>Pagamento #{payment.id}</b>
                      <span>Pagamento registrato</span>
                    </div>

                    <strong>{money(amount)}</strong>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
