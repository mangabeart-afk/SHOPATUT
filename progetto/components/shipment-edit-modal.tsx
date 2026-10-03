'use client'

import { useState } from 'react'

type Props = {
  action: (formData: FormData) => void | Promise<void>
  shipment: {
    id: string
    shipment_code?: string
    courier: string | null
    tracking: string | null
    shipping_cost_eur: number
    notes: string | null
  }
}

export default function ShipmentEditModal({ action, shipment }: Props) {
  const [open, setOpen] = useState(false)
  if (!open) return <button type="button" className="table-action" onClick={() => setOpen(true)}>Modifica</button>

  return (
    <>
      <button type="button" className="table-action" onClick={() => setOpen(true)}>Modifica</button>
      <div className="modal-backdrop">
        <div className="modal-card shipment-edit-modal">
          <div className="section-heading">
            <div><p className="eyebrow">MODIFICA SPEDIZIONE</p><h2>{shipment.shipment_code || shipment.id}</h2></div>
            <button type="button" className="modal-close" onClick={() => setOpen(false)}>×</button>
          </div>
          <form action={action} className="form-grid">
            <input type="hidden" name="shipment_id" value={shipment.id} />
            <label>Corriere
              <select name="courier" defaultValue={shipment.courier || ''} required>
                {['GLS','DHL','UPS','POSTE ITALIANE','BRT','SDA','INPOST'].map((courier) => <option key={courier} value={courier}>{courier}</option>)}
              </select>
            </label>
            <label>Tracking<input name="tracking" defaultValue={shipment.tracking || ''} /></label>
            <label>Costo (€)<input type="number" name="shipping_cost_eur" min="0" step="0.01" defaultValue={Number(shipment.shipping_cost_eur || 0)} /></label>
            <label className="form-grid-full">Note<textarea name="notes" rows={3} defaultValue={shipment.notes || ''} /></label>
            <div className="modal-actions">
              <button type="button" className="back-button" onClick={() => setOpen(false)}>Annulla</button>
              <button type="submit" className="primary-button">Salva modifiche</button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
