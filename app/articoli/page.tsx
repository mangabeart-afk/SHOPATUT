import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

export default async function ArticoliPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: articles, error } = await supabase
    .from('articles')
    .select(
      'id,quantity_purchased,unit_cost_eur,total_cost_eur'
    )
    .order('id', { ascending: false })

  if (error) {
    return (
      <main className="shell">
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Articoli</h1>
            </div>
          </header>

          <section className="panel">
            <h2>I miei articoli</h2>

            <div className="empty">
              Impossibile caricare gli articoli.
            </div>
          </section>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Articoli</h1>
          </div>
        </header>

        <section className="panel">
          <h2>I miei articoli</h2>

          {!articles || articles.length === 0 ? (
            <div className="empty">
              Nessun articolo disponibile.
            </div>
          ) : (
            <div className="movement-list">
              {articles.map((article) => (
                <div
                  className="movement"
                  key={article.id}
                >
                  <div>
                    <b>Articolo #{article.id}</b>

                    <span>
                      Quantità:{' '}
                      {Number(
                        article.quantity_purchased || 0
                      )}
                    </span>
                  </div>

                  <div>
                    <span>
                      {money(
                        Number(article.unit_cost_eur || 0)
                      )}{' '}
                      / unità
                    </span>

                    <strong>
                      {money(
                        Number(article.total_cost_eur || 0)
                      )}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
