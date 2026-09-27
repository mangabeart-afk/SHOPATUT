import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase-server'
import Navigation from '../../../../../components/navigation'
import CustomerSaleEditModal from '../../../../../components/customer-sale-edit-modal'

const money=(v:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(v||0))
const date=(v:string|null)=>v?new Intl.DateTimeFormat('it-IT').format(new Date(v)):'—'

async function updateSale(formData:FormData){
 'use server'
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect('/login')
 const {data:profile}=await supabase.from('profiles').select('role').eq('user_id',user.id).maybeSingle(); if(profile?.role!=='AMMINISTRATORE')redirect('/dashboard')
 const movementId=String(formData.get('movement_id')||''); const movementDate=String(formData.get('movement_date')||''); const quantity=Number(formData.get('quantity')||0); const unitPrice=Number(formData.get('unit_price_eur')||0); const notes=String(formData.get('notes')||'')
 const {error}=await supabase.rpc('admin_update_customer_sale',{p_movement_id:movementId,p_movement_date:movementDate,p_quantity:quantity,p_unit_price_eur:unitPrice,p_notes:notes})
 if(error)redirect(`?error=${encodeURIComponent(error.message)}`)
 redirect('?message=Acquisto modificato correttamente.')
}

export default async function CustomerArticles({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{message?:string;error?:string}>}){
 const {id}=await params; const query=searchParams?await searchParams:{}; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect('/login')
 const {data:profile}=await supabase.from('profiles').select('role,display_name').eq('user_id',user.id).maybeSingle(); if(profile?.role!=='AMMINISTRATORE')redirect('/dashboard')
 const {data:customer}=await supabase.from('customers').select('id,first_name,last_name').eq('id',id).maybeSingle(); if(!customer)notFound()
 const {data:mailbox}=await supabase.from('mailboxes').select('id,mailbox_code').eq('customer_id',id).maybeSingle(); if(!mailbox)notFound()
 const {data:sales}=await supabase.from('movements').select('id,article_id,quantity,unit_price_eur,total_amount_eur,movement_at,notes,reference_code,articles(article_code,series,detail,origin)').eq('mailbox_id',mailbox.id).eq('movement_type','VENDITA').order('movement_at',{ascending:false})
 const {data:allocations}=await supabase.from('payment_allocations').select('movement_id,amount_eur').in('movement_id',(sales||[]).map(s=>s.id))
 const paidBySale=new Map<string,number>(); for(const a of allocations||[])paidBySale.set(a.movement_id,(paidBySale.get(a.movement_id)||0)+Number(a.amount_eur||0))
 const rows=(sales||[]).map((s:any)=>({id:s.id,article_code:s.articles?.article_code||s.reference_code||'Articolo',series:s.articles?.series,detail:s.articles?.detail,origin:s.articles?.origin,date:s.movement_at?.slice(0,10),quantity:Number(s.quantity||0),unit_price_eur:Number(s.unit_price_eur||0),total:Number(s.total_amount_eur||0),paid:paidBySale.get(s.id)||0,residual:Math.max(0,Number(s.total_amount_eur||0)-(paidBySale.get(s.id)||0)),notes:s.notes}))
 const totalResidual=rows.reduce((s,r)=>s+r.residual,0)
 return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email}/><section className="content"><header className="topbar"><div><p className="eyebrow">CLIENTE · {mailbox.mailbox_code}</p><h1>Articoli acquistati da {customer.first_name} {customer.last_name}</h1><p className="muted"><strong>Totale importi residui: {money(totalResidual)}</strong></p></div><a className="back-button" href={`/admin/clienti/${id}`}>← Scheda cliente</a></header>{query.message&&<section className="panel"><div className="success">{query.message}</div></section>}{query.error&&<section className="panel"><div className="error">{query.error}</div></section>}<section className="panel"><h2>Articoli acquistati</h2>{rows.length===0?<div className="empty">Nessun articolo acquistato.</div>:<div className="movement-list">{rows.map((r:any)=><div className="movement" key={r.id}><div><b>{r.article_code}</b><span>{date(r.date)} · Serie: {r.series||'—'} · Dettagli: {r.detail||'—'} · Provenienza: {r.origin||'—'}</span><span>Quantità: {r.quantity} · Prezzo unitario: {money(r.unit_price_eur)}</span><span>Importo vendita: {money(r.total)}</span><span>Importo pagato: {money(r.paid)} · Residuo: {money(r.residual)}</span>{r.notes&&<span>Note: {r.notes}</span>}<CustomerSaleEditModal action={updateSale} sale={r}/></div><strong>{money(r.residual)}</strong></div>)}</div>}</section></section></main>
}
