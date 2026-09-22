import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const statusLabel = (status: string) =>
  status.replaceAll('_', ' ')

const trackingUrl = (courier: string | null, tracking: string | null) => {
  if (!courier || !tracking) return null

  const code = encodeURIComponent(tracking.trim())

  switch (courier.toUpperCase()) {
    case 'GLS':
      return `https://www.gls-italy.com/it/servizi-per-destinatari/ricerca-spedizione?match=${code}`
    case 'DHL':
      return `https://www.dhl.com/it-it/home/tracking.html?tracking-id=${code}`
    case 'UPS':
      return `https://www.ups.com/track?loc=it_IT&tracknum=${code}`
    case 'POSTE ITALIANE':
      return `https://www.poste.it/cerca-spedizioni?codice=${code}`
    case 'BRT':
      return `https://vas.brt.it/vas/sped_det_show.hsm?N_SHIPMENT=${code}`
    case 'SDA':
      return `https://www.sda.it/wps/portal/sdait.home/servizi_online/ricerca_spedizione?locale=it&reference=${code}`
    case 'INPOST':
      return `https://inpost.it/ricerca-spedizione?tracking=${code}`
    default:
      return null
  }
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
        <Navigation role="CLIENTE" active="/spedizioni" email={user.email} />
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Spedizioni</h1>
            </div>
          </header>

          <section className="panel">
            <h2>Le mie spedizioni</h2>
            <div className="empty">Nessuna casella associata al cliente.</div>
          </section>
        </section>
      </main>
    )
  }

  const { data: shipments, error } = await supabase
    .from('shipments')
    .select(`
      id,
      shipment_code,
      shipped_at,
      courier,
      tracking,
      status,
      shipment_items (
        id,
        quantity_shipped,
        article_id,
        articles (
          article_code,
          detail
        )
      )
    `)
    .eq('mailbox_id', profile.mailbox_id)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/spedizioni" email={user.email} />
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Spedizioni</h1>
            </div>
          </header>

          <section className="panel">
            <h2>Le mie spedizioni</h2>
            <div className="empty">Impossibile caricare le spedizioni.</div>
          </section>
        </section>
      </main>
    )
  }

  const rows = shipments || []

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/spedizioni" email={user.email} />
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
            <div className="empty">Nessuna spedizione registrata.</div>
          ) : (
            <div className="movement-list">
              {rows.map((shipment: any) => {
                const url = trackingUrl(shipment.courier, shipment.tracking)

                return (
                  <div className="movement" key={shipment.id}>
                    <div>
                      <b>Spedizione {shipment.shipment_code || '—'}</b>

                      <span>
                        Stato: <strong>{statusLabel(shipment.status)}</strong>
                      </span>

                      {shipment.courier && (
                        <span>Corriere: {shipment.courier}</span>
                      )}

                      {shipment.tracking && (
                        <span>
                          Tracking: <strong>{shipment.tracking}</strong>
                          {url && (
                            <> · <a href={url} target="_blank" rel="noreferrer">Traccia spedizione ↗</a></>
                          )}
                        </span>
                      )}

                      <span>
                        Data spedizione: {formatDate(shipment.shipped_at)}
                      </span>

                      {shipment.shipment_items?.map((item: any) => (
                        <span key={item.id}>
                          {item.articles?.article_code || 'Articolo'}{' — '}
                          {item.articles?.detail || 'Articolo'}{' — quantità: '}
                          {Number(item.quantity_shipped || 0)}
                        </span>
                      ))}
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
