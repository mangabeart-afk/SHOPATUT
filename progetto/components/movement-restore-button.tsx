'use client'

import { useState } from 'react'
import { restoreCancelledMovement, restoreDeletedArticle, restoreShipment } from '../app/admin/movimenti/actions'

type Props = { movementId: string; movementCode: string; kind: 'article' | 'generic' | 'shipment' }

export default function MovementRestoreButton({ movementId, movementCode, kind }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const ready = confirmText.trim().toUpperCase() === 'RIPRISTINA'
  const action = kind === 'article' ? restoreDeletedArticle : kind === 'shipment' ? restoreShipment : restoreCancelledMovement

  return <>
    <button type="button" className="movement-change-button" onClick={() => { setConfirmText(''); setOpen(true) }}>Ripristina</button>
    {open && <div className="movement-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="movement-modal movement-restore-modal" onClick={(event) => event.stopPropagation()}>
        <div className="movement-modal-header"><div><p className="eyebrow">RIPRISTINO</p><h3>Ripristinare l'elemento annullato?</h3></div><button type="button" className="movement-modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">×</button></div>
        <p className="muted">Movimento {movementCode}. Il ripristino riattiva l'elemento mantenendo lo storico dell'annullamento.</p>
        <p className="warning">Questa operazione modifica nuovamente i dati storici. Per confermare definitivamente, digita <strong>RIPRISTINA</strong>.</p>
        <form action={action} className="movement-restore-form"><input type="hidden" name={kind === 'article' ? 'article_id' : kind === 'shipment' ? 'shipment_id' : 'movement_id'} value={movementId}/><label>Conferma<input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RIPRISTINA" autoComplete="off"/></label><div className="archive-modal-actions"><button type="button" onClick={() => setOpen(false)}>Annulla</button><button type="submit" disabled={!ready}>Ripristina definitivamente</button></div></form>
      </div>
    </div>}
  </>
}
