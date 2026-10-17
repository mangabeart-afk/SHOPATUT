'use client'
import { useState } from 'react'
type Props={action:(formData:FormData)=>void;deleteAction:(formData:FormData)=>void;payment:any;customerId:string}
export default function CustomerPaymentEditModal({action,deleteAction,payment,customerId}:Props){
 const [open,setOpen]=useState(false)
 return <>
  <button type="button" className="table-action" onClick={()=>setOpen(true)}>Modifica</button>
  {open&&<div className="modal-backdrop"><div className="modal-card customer-payment-edit-modal"><div className="section-heading"><div><p className="eyebrow">MODIFICA PAGAMENTO</p><h2>{payment.payment_code}</h2></div><button type="button" className="modal-close" onClick={()=>setOpen(false)}>×</button></div>
   <form action={action} className="form-grid"><input type="hidden" name="payment_id" value={payment.id}/><input type="hidden" name="customer_id" value={customerId}/><label>Data<input name="payment_date" type="date" defaultValue={payment.payment_date}/></label><label>Importo €<input name="amount_eur" type="number" min="0.01" step="0.01" defaultValue={Number(payment.amount_eur||0).toFixed(2)}/></label><label>Metodo<input name="payment_method" defaultValue={payment.payment_method||''}/></label><label className="form-grid-full">Note<textarea name="notes" rows={3} defaultValue={payment.notes||''}/></label><div className="modal-actions"><button type="button" className="back-button" onClick={()=>setOpen(false)}>Annulla</button><button className="primary-button" type="submit">Salva modifiche</button><button type="submit" formAction={deleteAction} className="danger-button" onClick={(e)=>{if(!window.confirm(`Cancellare il pagamento ${payment.payment_code||''}? L'eventuale assegnazione verrà annullata.`)) e.preventDefault()}}>Cancella pagamento</button></div></form>
  </div></div>}
 </>
}
