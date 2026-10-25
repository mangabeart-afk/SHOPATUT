import AdminWorkbookLayout from '../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../components/read-only-table'
import { getLatestExcelWorkbook, getWorkbookPreorders, searchText } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function AdminPreorderPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string }> }) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const params = await searchParams
  const search = (params.search || '').trim()
  const status = (params.status || '').trim().toUpperCase()
  const workbook = await getLatestExcelWorkbook()
  const all = getWorkbookPreorders(workbook)
  const filtered = all.filter((item) => (!status || item.status.toUpperCase() === status) && searchText([item.product,item.customerName,item.customerCode,item.status,item.quantityOrReference,item.productMeta], search))
  const rows = filtered.map((item) => ({ id:item.id,product:item.product,source:item.productMeta||'—',user:item.customerName,code:item.customerCode||'—',reference:item.quantityOrReference||'—',status:item.status||'—',excelRow:String(item.excelRow) }))
  const states = [...new Set(all.map((item) => item.status).filter(Boolean))].sort()
  return <AdminWorkbookLayout active="/admin/preorder" title="PREORDER" description="Vista specifica del foglio PREORDER: le colonne sono disposte in blocchi orizzontali per prodotto, quindi non vengono trattate come righe X/Y/Z." displayName={profile.display_name} email={user.email}>
    <section className="panel"><form action="/admin/preorder" method="get" className="form"><label>Cerca prodotto, utente o codice<input type="search" name="search" defaultValue={search} placeholder="Cerca preorder…" /></label><label>Stato<select name="status" defaultValue={status}><option value="">Tutti gli stati</option>{states.map((value)=> <option key={value} value={value.toUpperCase()}>{value}</option>)}</select></label><button type="submit">Filtra</button></form></section>
    <section className="panel"><div className="section-heading"><h2>Righe preorder ({filtered.length})</h2></div><ReadOnlyTable columns={[{key:'product',label:'Prodotto / riferimento'},{key:'source',label:'Metadati blocco'},{key:'user',label:'Utente'},{key:'code',label:'Codice'},{key:'reference',label:'Q.tà / riferimento',align:'right'},{key:'status',label:'Stato'},{key:'excelRow',label:'Riga Excel',align:'right'}]} rows={rows} emptyLabel="Nessuna riga PREORDER corrispondente." /></section>
  </AdminWorkbookLayout>
}
