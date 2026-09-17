import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

type ArticoliPageProps = {
  searchParams: Promise<{
    search?: string
  }>
}

export default async function ArticoliPage({
  searchParams,
}: ArticoliPageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const params = await searchParams
  const search = params.search?.trim() || ''

  const { data: profile } = await supabase
    .from('profiles')
    .select('mailbox_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.mailbox_id) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/articoli" email={user.email} />
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
              Nessuna casella associata al cliente.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const { data: assignments, error: assignmentsError } =
    await supabase
      .from('article_assignments')
      .select('article_id,quantity_assigned,status')
      .eq('mailbox_id', profile.mailbox_id)

  if (assignmentsError) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/articoli" email={user.email} />
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

  const articleIds =
    assignments?.map(
      (assignment) => assignment.article_id
    ) || []

  let articles: any[] = []

  if (articleIds.length > 0) {
    let query = supabase
      .from('articles')
      .select(
        `
          id,
          article_code,
          photo_url,
          purchase_date,
          origin,
          seller,
          series,
          detail,
          quantity_purchased,
          currency,
          unit_price_foreign,
          exchange_rate,
          accessory_cost_eur,
          total_cost_eur,
          unit_cost_eur,
          notes
        `
      )
      .in('id', articleIds)

    if (search) {
      const safeSearch = search.replace(/[%_]/g, '\\$&')

      query = query.or(
        `article_code.ilike.%${safeSearch}%,series.ilike.%${safeSearch}%,detail.ilike.%${safeSearch}%,seller.ilike.%${safeSearch}%,origin.ilike.%${safeSearch}%`
      )
    }

    const { data, error } = await query.order(
      'purchase_date',
      { ascending: false }
    )

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

    articles = data || []
  }

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/articoli" email={user.email} />
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Articoli</h1>
          </div>
        </header>

        <section className="panel">
          <h2>Ricerca articoli</h2>

          <form
            action="/articoli"
            method="get"
            className="form"
          >
            <label>
              Cerca
              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Codice, serie, descrizione, venditore..."
              />
            </label>

            <button type="submit">
              Cerca
            </button>

            {search && (
              <a
                href="/articoli"
                className="back-button"
              >
                Azzera ricerca
              </a>
            )}
          </form>
        </section>

        <section className="panel">
          <h2>
            {search
              ? `Risultati per "${search}"`
              : 'I miei articoli'}
          </h2>

          {articles.length === 0 ? (
            <div className="empty">
              {search
                ? 'Nessun articolo trovato.'
                : 'Nessun articolo disponibile.'}
            </div>
          ) : (
            <div className="movement-list">
              {articles.map((article) => {
                const assignment =
                  assignments?.find(
                    (item) =>
                      item.article_id ===
                      article.id
                  )

                return (
                  <div
                    className="movement"
                    key={article.id}
                  >
                    <div>
                      <div className="article-title-row">
                        <b>{article.article_code}</b>
                        {article.photo_url && (
                          <a
                            href={article.photo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="article-photo-link"
                            title="Visualizza foto"
                          >
                            🔍
                          </a>
                        )}
                      </div>

                      {article.series && (
                        <span>
                          Serie: {article.series}
                        </span>
                      )}

                      {article.detail && (
                        <span>
                          {article.detail}
                        </span>
                      )}

                      {article.seller && (
                        <span>
                          Venditore: {article.seller}
                        </span>
                      )}

                      {article.origin && (
                        <span>
                          Provenienza: {article.origin}
                        </span>
                      )}

                      <span>
                        Quantità acquistata:{' '}
                        {Number(
                          article.quantity_purchased ||
                            0
                        )}
                      </span>

                      {assignment && (
                        <span>
                          Quantità assegnata:{' '}
                          {Number(
                            assignment.quantity_assigned ||
                              0
                          )}
                        </span>
                      )}
                    </div>

                    <div>
                      <span>
                        {money(
                          Number(
                            article.unit_cost_eur || 0
                          )
                        )}{' '}
                        / unità
                      </span>

                      <strong>
                        {money(
                          Number(
                            article.total_cost_eur || 0
                          )
                        )}
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
