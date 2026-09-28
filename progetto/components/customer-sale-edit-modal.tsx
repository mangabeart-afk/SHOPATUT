'use client'
import { useState } from 'react'

type Props={action:(formData:FormData)=>void;sale:any}
export default function CustomerSaleEditModal({action,sale}:Props){
 const [open,setOpen]=useState(false)
 return <>
  <button type="button" className="table-action" onClick={()=>setOpen(true)}>Modifica</button>
  {open&&<div className="modal-backdrop"><div className="modal-card"><div className="section-heading"><div><p className="eyebrow">MODIFICA ACQUISTO</p><h2>{sale.article_code}</h2></div><button type="button" className="modal-close" onClick={()=>setOpen(false)}>×</button></div>
   <form action={action} className="form-grid">
    <input type="hidden" name="movement_id" value={sale.id}/>
    <label>Data<input name="movement_date" type="date" defaultValue={sale.date}/></label>
    <label>Quantità<input name="quantity" type="number" min="1" step="1" defaultValue={sale.quantity}/></label>
    <label>Prezzo unitario<input name="unit_price_eur" type="number" min="0.01" step="0.01" defaultValue={Number(sale.unit_price_eur||0).toFixed(2)}/></label>
    <label className="form-grid-full">Note<textarea name="notes" rows={3} defaultValue={sale.notes||''}/></label>
    <div className="modal-actions"><button type="button" className="back-button" onClick={()=>setOpen(false)}>Annulla</button><button className="primary-button" type="submit">Salva modifiche</button></div>
   </form>
  </div></div>}
 </>
}
