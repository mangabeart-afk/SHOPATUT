import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

export default async function CreditiPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: credits, error } = await supabase
    .from('credits')
    .select('id,amount_eur,used_amount_eur')
    .order('id', { ascending: false })

  if (error) {
    return (
      <main className="shell">
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Crediti</h1>
            </div>

            <a href="/dashboard" className="back-button">
              ← Dashboard
            </a>
          </header>

          <section className="panel">
            <h2>I miei crediti</h2>

            <div className="empty">
              Impossibile caricare i crediti.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const rows = credits || []

  const total = rows.reduce(
    (sum, credit) => sum + Number(credit.amount_eur || 0),
    0
  )

  const used = rows.reduce(
    (sum, credit) => sum + Number(credit.used_amount_eur || 0),
    0
  )

  const remaining = Math.max(0, total - used)

  return (
    <main className="shell">
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Crediti</h1>
          </div>

          <a href="/dashboard" className="back-button">
            ← Dashboard
          </a>
        </header>

        <div className="grid">
          <div className="card">
            <div className="muted">Credito totale</div>
            <strong>{money(total)}</strong>
            <small>credito assegnato</small>
          </div>

          <div className="card">
            <div className="muted">Utilizzato</div>
            <strong>{money(used)}</strong>
            <small>credito utilizzato</small>
          </div>

          <div className="card">
            <div className="muted">Credito residuo</div>
            <strong>{money(remaining)}</strong>
            <small>disponibile</small>
          </div>
        </div>

        <section className="panel">
          <h2>Dettaglio crediti</h2>

          {rows.length === 0 ? (
            <div className="empty">
              Nessun credito registrato.
            </div>
          ) : (
            <div className="movement-list">
              {rows.map((credit) => {
                const amount = Number(credit.amount_eur || 0)
                const usedAmount = Number(
                  credit.used_amount_eur || 0
                )
                const residual = Math.max(
                  0,
                  amount - usedAmount
                )

                return (
                  <div
                    className="movement"
                    key={credit.id}
                  >
                    <div>
                      <b>Credito #{credit.id}</b>

                      <span>
                        Utilizzato: {money(usedAmount)}
                      </span>
                    </div>

                    <div>
                      <span>
                        Totale: {money(amount)}
                      </span>

                      <strong>
                        Residuo: {money(residual)}
                      </strong>
                    </div>
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
