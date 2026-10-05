'use client'
import { useState } from 'react'
type Props={action:(formData:FormData)=>void;credit:any}
export default function CustomerCreditEditModal({action,credit}:Props){
 const [open,setOpen]=useState(false)
 return <>
  <button type="button" className="table-action" onClick={()=>setOpen(true)}>Modifica</button>
  {open&&<div className="modal-backdrop"><div className="modal-card"><div className="section-heading"><div><p className="eyebrow">MODIFICA CREDITO</p><h2>{credit.credit_code}</h2></div><button type="button" className="modal-close" onClick={()=>setOpen(false)}>×</button></div>
   <form action={action} className="form-grid"><input type="hidden" name="credit_id" value={credit.id}/><label>Data<input name="credit_date" type="date" defaultValue={credit.credit_date}/></label><label>Importo<input name="amount_eur" type="number" min="0.01" step="0.01" defaultValue={Number(credit.amount_eur||0).toFixed(2)}/></label><label className="form-grid-full">Note<textarea name="notes" rows={3} defaultValue={credit.notes||''}/></label><div className="modal-actions"><button type="button" className="back-button" onClick={()=>setOpen(false)}>Annulla</button><button className="primary-button" type="submit">Salva modifiche</button></div></form>
  </div></div>}
 </>
}
