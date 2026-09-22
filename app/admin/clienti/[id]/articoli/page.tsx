import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase-server'
import Navigation from '../../../../../components/navigation'

const money=(v:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v||0)
const date=(v:string|null)=>v?new Intl.DateTimeFormat('it-IT').format(new Date(v)):'—'
export default async function CustomerArticles({params}:{params:Promise<{id:string}>}){
 const {id}=await params; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect('/login')
 const {data:profile}=await supabase.from('profiles').select('role,display_name').eq('user_id',user.id).maybeSingle(); if(profile?.role!=='AMMINISTRATORE')redirect('/dashboard')
 const {data:customer}=await supabase.from('customers').select('id,first_name,last_name').eq('id',id).maybeSingle(); if(!customer)notFound()
 const {data:mailbox}=await supabase.from('mailboxes').select('id,mailbox_code').eq('customer_id',id).maybeSingle();
 if(!mailbox)return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email}/><section className="content"><section className="panel"><div className="empty">Nessuna casella.</div></section></section></main>
 const [{data:assignments},{data:articles},{data:movements}]=await Promise.all([
  supabase.from('article_assignments').select('article_id,quantity_assigned,assigned_at,status').eq('mailbox_id',mailbox.id).eq('status','ATTIVA').order('assigned_at',{ascending:false}),
  supabase.from('articles').select('id,article_code,purchase_date,series,detail,origin,unit_cost_eur,total_cost_eur,status,photo_url'),
  supabase.from('movements').select('article_id,quantity,total_amount_eur,movement_type').eq('mailbox_id',mailbox.id).eq('movement_type','VENDITA')
 ])
 const ids=(assignments||[]).map((x:any)=>x.article_id); const map=new Map((articles||[]).filter((a:any)=>ids.includes(a.id)).map((a:any)=>[a.id,a])); const sold=new Map<string,number>(); for(const m of movements||[])sold.set(m.article_id,(sold.get(m.article_id)||0)+Number(m.quantity||0))
 return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email}/><section className="content"><header className="topbar"><div><p className="eyebrow">CLIENTE · {mailbox.mailbox_code}</p><h1>Articoli di {customer.first_name} {customer.last_name}</h1></div><a className="back-button" href={`/admin/clienti/${id}`}>← Scheda cliente</a></header><section className="panel"><h2>Articoli acquistati</h2>{ids.length===0?<div className="empty">Nessun articolo acquistato.</div>:<div className="movement-list">{ids.map((articleId:string)=>{const a:any=map.get(articleId);if(!a)return null;const qty=Number((assignments||[]).find((x:any)=>x.article_id===articleId)?.quantity_assigned||0);const s=sold.get(articleId)||0;return <div className="movement" key={articleId}><div><b>{a.article_code}</b><span>{date(a.purchase_date)} · {a.series||'—'} · {a.detail||'—'}</span><span>Provenienza: {a.origin||'—'}</span><span>Quantità: {qty} · Residua: {Math.max(0,qty-s)}</span></div><strong>{money(Number(a.total_cost_eur||0))}</strong></div>})}</div>}</section></section></main>
}
