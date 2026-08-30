import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function SpedizioniPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('mailbox_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.mailbox_id) {
    return (
      <main className="shell">
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Spedizioni</h1>
            </div>
          </header>

          <section className="panel">
            <h2>Le mie spedizioni</h2>

            <div className="empty">
              Nessuna casella associata al cliente.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const { data: shipments, error } = await supabase
    .from('shipments')
    .select(
      `
        id,
        shipment_code,
        shipped_at,
        shipment_items (
          id,
          quantity_shipped,
          article_id,
          articles (
            article_code,
            detail
          )
        )
      `
    )
    .eq('mailbox_id', profile.mailbox_id)
    .order('shipped_at', { ascending: false })

  if (error) {
    return (
      <main className="shell">
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Spedizioni</h1>
            </div>
          </header>

          <section className="panel">
            <h2>Le mie spedizioni</h2>

            <div className="empty">
              Impossibile caricare le spedizioni.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const rows = shipments || []

  return (
    <main className="shell">
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Spedizioni</h1>
          </div>
        </header>

        <section className="panel">
          <h2>Le mie spedizioni</h2>

          {rows.length === 0 ? (
            <div className="empty">
              Nessuna spedizione registrata.
            </div>
          ) : (
            <div className="movement-list">
              {rows.map((shipment: any) => (
                <div className="movement" key={shipment.id}>
                  <div>
                    <b>
                      Spedizione #{shipment.shipment_code || shipment.id}
                    </b>

                    <span>
                      Data spedizione: {formatDate(shipment.shipped_at)}
                    </span>

                    {shipment.shipment_items?.map((item: any) => (
                      <span key={item.id}>
                        {item.articles?.article_code || `Articolo #${item.article_id}`}
                        {' — '}
                        {item.articles?.detail || 'Articolo'}
                        {' — quantità: '}
                        {Number(item.quantity_shipped || 0)}
                      </span>
                    ))}
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
