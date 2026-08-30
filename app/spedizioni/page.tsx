import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'

export default async function SpedizioniPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: shipments, error } = await supabase
    .from('shipments')
    .select('*')
    .order('id', { ascending: false })

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

        <div className="grid">
          <div className="card">
            <div className="muted">Spedizioni</div>
            <strong>{rows.length}</strong>
            <small>spedizioni visibili</small>
          </div>
        </div>

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
                      Spedizione #{shipment.id}
                    </b>

                    <span>
                      Stato: {shipment.status || '—'}
                    </span>
                  </div>

                  <div>
                    {shipment.tracking_number && (
                      <span>
                        Tracking: {shipment.tracking_number}
                      </span>
                    )}

                    <strong>
                      {shipment.carrier || '—'}
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
