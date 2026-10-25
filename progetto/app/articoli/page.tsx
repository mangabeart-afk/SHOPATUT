import { redirect } from 'next/navigation'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'
import ReadOnlyNotice from '../../components/read-only-notice'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money, searchText, getCustomerPreorders } from '../../lib/excel-source'
import { requirePageContext, resolveCustomerCode } from '../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = { searchParams: Promise<{ search?: string }> }

export default async function ArticoliPage({ searchParams }: Props) {
  const { supabase, user, profile } = await requirePageContext()
  if (profile.role === 'AMMINISTRATORE') redirect('/admin/articoli/archivio')
  const { search = '' } = await searchParams
  const query = search.trim()
  const code = await resolveCustomerCode(supabase, profile)
  const workbook = await getLatestExcelWorkbook()
  const sheet = code ? findSheet(workbook, code) : null
  const customer = sheet ? parseCustomerSheet(sheet) : null
  const preorders = code ? getCustomerPreorders(workbook, code).filter((item) => searchText([item.product,item.customerName,item.customerCode,item.status,item.quantityOrReference], query)) : []
  const items = (customer?.items || []).filter((item) => searchText([item.article, item.movement, item.status, item.date, item.notes], query))
  const groups = ['IN ARRIVO', 'IN STOCK', 'IN BOX', 'SPEDITO', 'ALTRO'].map((status) => ({
    status,
    rows: items.filter((item) => status === 'ALTRO' ? !['IN ARRIVO','IN STOCK','IN BOX','SPEDITO'].includes(item.status) : item.status === status),
  })).filter((group) => group.rows.length)

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/articoli" displayName={profile.display_name} email={user.email} />
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">AREA UTENTE</p><h1>Articoli</h1><p className="muted">Articoli, quantità, stato e importi dalla tua scheda Excel.</p></div><WhatsAppContact /></header>
        <section className="panel">
          <h2>Ricerca articoli</h2>
          <form action="/articoli" method="get" className="form">
            <label>Cerca per articolo, movimento, stato o data<input type="search" name="search" defaultValue={query} placeholder="Cerca articolo…" /></label>
            <button type="submit">Cerca</button>
            {query && <a href="/articoli" className="back-button">Azzera ricerca</a>}
          </form>
        </section>
        {!customer ? <section className="panel"><div className="empty">Scheda Excel non associata al profilo.</div></section> : groups.length === 0 && preorders.length === 0 ? <section className="panel"><div className="empty">Nessun articolo corrispondente alla ricerca.</div></section> : groups.map((group) => (
          <section className="panel" key={group.status}>
            <div className="section-heading"><h2>{group.status} ({group.rows.length})</h2></div>
            <div className="movement-list">
              {group.rows.map((item) => <article className="movement" key={item.id}>
                <div>
                  <b>{item.article || item.movement || 'Movimento'}</b>
                  <span>{item.movement || 'Ordine'} · {dateLabel(item.date)}</span>
                  {item.notes && <span>{item.notes}</span>}
                  <span>Stato: {item.status || '—'} · Quantità: {item.quantity}</span>
                </div>
                <strong>{item.amount != null ? money(item.amount) : '—'}</strong>
              </article>)}
            </div>
          </section>
        ))}
        {customer && preorders.length > 0 && <section className="panel"><div className="section-heading"><h2>PREORDER ({preorders.length})</h2></div><p className="muted">Riepilogo aggiuntivo dalla scheda PREORDER; la quantità/riferimento è mostrata com’è riportata nel foglio, senza reinterpretarla.</p><div className="movement-list">{preorders.map((item)=><article className="movement" key={item.id}><div><b>{item.product}</b><span>{item.customerName}{item.customerCode ? ` · ${item.customerCode}` : ''}</span><span>Stato: {item.status || '—'} · Q.tà/rif.: {item.quantityOrReference || '—'}</span>{item.productMeta && <span>{item.productMeta}</span>}</div><strong>{item.status || '—'}</strong></article>)}</div></section>}
        <section className="panel"><ReadOnlyNotice /></section>
      </section>
    </main>
  )
}
