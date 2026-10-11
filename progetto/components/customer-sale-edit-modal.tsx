'use client'
import { useState } from 'react'

type Props={action:(formData:FormData)=>void;deleteAction:(formData:FormData)=>void;sale:any}
export default function CustomerSaleEditModal({action,deleteAction,sale}:Props){
 const [open,setOpen]=useState(false)
 const [confirmDelete,setConfirmDelete]=useState(false)
 return <>
  <button type="button" className="table-action" onClick={()=>setOpen(true)}>Modifica</button>
  {open&&<div className="modal-backdrop"><div className="modal-card"><div className="section-heading"><div><p className="eyebrow">MODIFICA ACQUISTO</p><h2>{sale.article_code}</h2></div><button type="button" className="modal-close" onClick={()=>setOpen(false)}>×</button></div>
   <form action={action} className="form-grid">
    <input type="hidden" name="movement_id" value={sale.id}/>
    <label>Data<input name="movement_date" type="date" defaultValue={sale.date}/></label>
    <label>Quantità<input name="quantity" type="number" min="1" step="1" defaultValue={sale.quantity}/></label>
    <label>Prezzo unitario<input name="unit_price_eur" type="number" min="0.01" step="0.01" defaultValue={Number(sale.unit_price_eur||0).toFixed(2)}/></label>
    <label className="form-grid-full">Note<textarea name="notes" rows={3} defaultValue={sale.notes||''}/></label>
    <div className="modal-actions"><button type="button" className="danger-button" onClick={()=>setConfirmDelete(true)}>Elimina articolo</button><button type="button" className="back-button" onClick={()=>setOpen(false)}>Annulla</button><button className="primary-button" type="submit">Salva modifiche</button></div>
   </form>
   {confirmDelete&&<div className="delete-confirm-box"><strong>Annullare la vendita di questo articolo?</strong><p className="muted">La vendita verrà stornata, il saldo del cliente verrà aggiornato e la giacenza tornerà disponibile.</p><div className="modal-actions"><button type="button" className="back-button" onClick={()=>setConfirmDelete(false)}>Annulla</button><form action={deleteAction}><input type="hidden" name="movement_id" value={sale.id}/><button className="danger-button" type="submit">Conferma eliminazione</button></form></div></div>}
  </div></div>}
 </>
}
