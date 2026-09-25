"use client"

import { useMemo, useState } from 'react'

type Props = {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  title: string
}

const labels: Record<string,string> = {
  first_name:'Nome', last_name:'Cognome', email:'Email', phone:'Telefono',
  notes:'Note', shipping_address:'Indirizzo', shipping_city:'Città',
  shipping_postal_code:'CAP', shipping_country:'Paese', customer_code:'Codice cliente',
  seller:'Venditore', series:'Serie', detail:'Dettaglio', quantity_purchased:'Quantità',
  total_cost_eur:'Costo totale (€)', unit_cost_eur:'Costo unitario (€)', purchase_date:'Data acquisto',
  origin:'Provenienza', currency:'Valuta', unit_price_foreign:'Prezzo unitario', exchange_rate:'Cambio',
  accessory_cost_eur:'Costi accessori (€)', status:'Stato', photo_url:'Foto',
  commission_cost:'Commissione', commission_mode:'Modalità commissione', commission_percent:'Percentuale commissione',
  customs_cost:'Dogana', customs_mode:'Modalità dogana', customs_percent:'Percentuale dogana',
  shipping_cost:'Spedizione', shipping_mode:'Modalità spedizione', shipping_percent:'Percentuale spedizione',
  amount:'Importo', amount_eur:'Importo (€)', payment_date:'Data pagamento', payment_method:'Metodo pagamento',
  reference:'Riferimento', payment_code:'Codice pagamento', generic_customer_name:'Cliente generico',
  shipping_cost_eur:'Costo spedizione (€)', courier:'Corriere', tracking:'Tracking',
  recipient_name:'Destinatario', address:'Indirizzo', postal_code:'CAP', city:'Città', country:'Paese',
  shipment_code:'Codice spedizione', shipped_at:'Data spedizione', reason:'Motivo', credit_code:'Codice credito',
  credit_date:'Data credito', used_amount_eur:'Credito utilizzato (€)',
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sì' : 'No'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export default function MovementChangeModal({ before, after, title }: Props) {
  const [open, setOpen] = useState(false)
  const changes = useMemo(() => {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    const ignored = new Set(['id','created_at','updated_at','user_id','customer_id','mailbox_id','operator_user_id'])
    return Array.from(keys)
      .filter((key) => !ignored.has(key))
      .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
      .map((key) => ({ key, label: labels[key] || key, before: before?.[key], after: after?.[key] }))
  }, [before, after])

  return <>
    <button type="button" className="movement-change-button" onClick={() => setOpen(true)}>
      Dettaglio
    </button>
    {open && <div className="movement-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="movement-modal" onClick={(event) => event.stopPropagation()}>
        <div className="movement-modal-header">
          <div>
            <p className="eyebrow">MODIFICA</p>
            <h3>{title}</h3>
          </div>
          <button type="button" className="movement-modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">×</button>
        </div>
        {changes.length === 0 ? (
          <div className="empty">Non sono disponibili differenze dettagliate per questa modifica.</div>
        ) : (
          <div className="movement-change-grid">
            <div className="movement-change-heading">CAMPO</div>
            <div className="movement-change-heading">PRIMA</div>
            <div className="movement-change-heading">DOPO</div>
            {changes.map((change) => <div className="movement-change-row" key={change.key}>
              <strong>{change.label}</strong>
              <span>{formatValue(change.before)}</span>
              <span>{formatValue(change.after)}</span>
            </div>)}
          </div>
        )}
      </div>
    </div>}
  </>
}
