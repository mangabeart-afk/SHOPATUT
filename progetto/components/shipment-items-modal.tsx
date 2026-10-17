'use client'

import { useState } from 'react'

type ShipmentItem = {
  id: string
  quantity_shipped: number | null
  article_code: string | null
  series: string | null
  detail: string | null
}

type Props = {
  shipmentCode: string
  items: ShipmentItem[]
}

export default function ShipmentItemsModal({ shipmentCode, items }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="shipment-items-link" onClick={() => setOpen(true)}>
        ARTICOLI ({items.length})
      </button>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div className="modal-card shipment-items-modal" role="dialog" aria-modal="true" aria-label={`Articoli spediti ${shipmentCode}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">SPEDIZIONE</p>
                <h3>{shipmentCode}</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">×</button>
            </div>

            {items.length === 0 ? (
              <div className="empty">Nessun articolo associato.</div>
            ) : (
              <div className="movement-list">
                {items.map((item) => (
                  <div className="movement" key={item.id}>
                    <div>
                      <b>{item.article_code || 'Articolo'}</b>
                      <span>{item.series || 'Serie non disponibile'}</span>
                      <span>{item.detail || 'Dettaglio non disponibile'}</span>
                    </div>
                    <strong>× {Number(item.quantity_shipped || 0)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
