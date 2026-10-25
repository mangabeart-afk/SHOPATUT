import AdminWorkbookLayout from '../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../components/read-only-table'
import { getLatestExcelWorkbook, getWorkbookArticles, getWorkbookDashboardStats, money } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function AdminAnalisiPage() {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const workbook = await getLatestExcelWorkbook()
  const stats = getWorkbookDashboardStats(workbook)
  const articles = getWorkbookArticles(workbook)
  const rows = ['X','Y','Z','VIET'].map((sheet) => {
    const items = articles.filter((item) => item.sheet === sheet)
    return {id:sheet,sheet,rows:items.length,quantity:items.reduce((sum,item)=>sum+item.quantity,0),incoming:items.filter((item)=>item.status==='IN ARRIVO').reduce((sum,item)=>sum+item.quantity,0),stock:items.filter((item)=>item.status==='IN STOCK').reduce((sum,item)=>sum+item.quantity,0),sold:items.filter((item)=>item.status==='VENDUTO').reduce((sum,item)=>sum+item.quantity,0),cost:items.reduce((sum,item)=>sum+(item.totalCost||0),0)}
  })
  return <AdminWorkbookLayout active="/admin/analisi" title="Analisi" description="Statistiche lette dallo snapshot Excel; valori di riepilogo esatti dal foglio W." displayName={profile.display_name} email={user.email}>
    <section className="panel"><h2>Riepilogo W</h2><div className="grid admin-summary-grid"><div className="card"><div className="muted">Quantità acquistata</div><strong>{stats.purchased.toLocaleString('it-IT')}</strong></div><div className="card"><div className="muted">Valore acquisti</div><strong>{money(stats.purchaseValue)}</strong></div><div className="card"><div className="muted">Quantità venduta</div><strong>{stats.sold.toLocaleString('it-IT')}</strong></div><div className="card"><div className="muted">Valore vendite</div><strong>{money(stats.revenue)}</strong></div><div className="card"><div className="muted">Margine</div><strong>{money(stats.margin)}</strong></div><div className="card"><div className="muted">Unità in arrivo (righe stato)</div><strong>{stats.incomingUnits}</strong></div></div></section>
    <section className="panel"><h2>Dettaglio per foglio articolo</h2><ReadOnlyTable columns={[{key:'sheet',label:'Foglio'},{key:'rows',label:'Righe articolo',align:'right'},{key:'quantity',label:'Quantità totale',align:'right'},{key:'incoming',label:'In arrivo',align:'right'},{key:'stock',label:'In stock',align:'right'},{key:'sold',label:'Venduto',align:'right'},{key:'cost',label:'Somma colonne costo',align:'right'}]} rows={rows.map((row)=>({...row,cost:money(row.cost)}))} /></section>
  </AdminWorkbookLayout>
}
