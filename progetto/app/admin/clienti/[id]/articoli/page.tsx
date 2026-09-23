import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase-server'
import Navigation from '../../../../../components/navigation'

const money=(v:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v||0)
const date=(v:string|null)=>v?new Intl.DateTimeFormat('it-IT').format(new Date(v)):'—'

export default async function CustomerArticles({params}:{params:Promise<{id:string}>}){
 const {id}=await params; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect('/login')
 const {data:profile}=await supabase.from('profiles').select('role,display_name').eq('user_id',user.id).maybeSingle(); if(profile?.role!=='AMMINISTRATORE')redirect('/dashboard')
 const {data:customer}=await supabase.from('customers').select('id,first_name,last_name').eq('id',id).maybeSingle(); if(!customer)notFound()
 const {data:mailbox}=await supabase.from('mailboxes').select('id,mailbox_code').eq('customer_id',id).maybeSingle()
 if(!mailbox)return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email}/><section className="content"><section className="panel"><div className="empty">Nessuna casella.</div></section></section></main>
 const [{data:assignments},{data:articles},{data:movements},{data:payments},{data:allocations}]=await Promise.all([
  supabase.from('article_assignments').select('article_id,quantity_assigned,assigned_at,status').eq('mailbox_id',mailbox.id).eq('status','ATTIVA').order('assigned_at',{ascending:false}),
  supabase.from('articles').select('id,article_code,purchase_date,series,detail,origin,seller,notes,unit_cost_eur,total_cost_eur,status,photo_url'),
  supabase.from('movements').select('id,article_id,quantity,total_amount_eur,movement_type,movement_at').eq('mailbox_id',mailbox.id).eq('movement_type','VENDITA'),
  supabase.from('payments').select('id,payment_code,payment_date,amount_eur,status').eq('mailbox_id',mailbox.id).order('payment_date',{ascending:true}),
  supabase.from('payment_allocations').select('payment_id,movement_id,amount_eur')
 ])
 const ids=(assignments||[]).map((x:any)=>x.article_id); const map=new Map((articles||[]).filter((a:any)=>ids.includes(a.id)).map((a:any)=>[a.id,a]))
 const saleMovements=(movements||[]).filter((m:any)=>ids.includes(m.article_id))
 const allocationByMovement=new Map<string,any[]>()
 for(const a of allocations||[]){const list=allocationByMovement.get(a.movement_id)||[];list.push(a);allocationByMovement.set(a.movement_id,list)}
 const paymentById=new Map((payments||[]).map((p:any)=>[p.id,p]))
 const rows=ids.map((articleId:string)=>{
   const a:any=map.get(articleId); if(!a)return null
   const qty=Number((assignments||[]).find((x:any)=>x.article_id===articleId)?.quantity_assigned||0)
   const sales=saleMovements.filter((m:any)=>m.article_id===articleId)
   const purchaseAmount=qty*Number(a.unit_cost_eur||0)
   const paidEntries=sales.flatMap((m:any)=>(allocationByMovement.get(m.id)||[]).map((al:any)=>({amount:Number(al.amount_eur||0),payment:paymentById.get(al.payment_id)}))).filter((x:any)=>x.payment)
   const paid=paidEntries.reduce((sum:any,x:any)=>sum+x.amount,0)
   const residual=Math.max(0,purchaseAmount-paid)
   return {a,qty,purchaseAmount,paid,residual,paidEntries}
 }).filter(Boolean) as any[]
 const totalResidual=rows.reduce((s,r)=>s+r.residual,0)
 return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email}/><section className="content"><header className="topbar"><div><p className="eyebrow">CLIENTE · {mailbox.mailbox_code}</p><h1>Articoli di {customer.first_name} {customer.last_name}</h1><p className="muted"><strong>Totale importi residui: {money(totalResidual)}</strong></p></div><a className="back-button" href={`/admin/clienti/${id}`}>← Scheda cliente</a></header><section className="panel"><h2>Articoli acquistati</h2>{rows.length===0?<div className="empty">Nessun articolo acquistato.</div>:<div className="movement-list">{rows.map((r:any)=><div className="movement" key={r.a.id}><div><b>{r.a.article_code}</b><span>Data acquisto: {date(r.a.purchase_date)} · {r.a.series||'—'} · {r.a.detail||'—'}</span><span>Quantità acquistata: {r.qty}</span><span>Importo acquisto: {money(r.purchaseAmount)}</span><span>Importo pagato: {r.paidEntries.length?r.paidEntries.map((x:any)=>`${money(x.amount)} (${date(x.payment.payment_date)})`).join(' · '):'€ 0,00'}</span><span>Importo residuo: {money(r.residual)}</span></div><strong>{money(r.residual)}</strong></div>)}</div>}</section></section></main>
}
