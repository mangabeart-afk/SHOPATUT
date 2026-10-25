import Link from 'next/link'
import AdminWorkbookLayout from '../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../components/read-only-table'
import { getLatestExcelWorkbook, getWorkbookArticles, money, dateLabel, searchText } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function AdminPhotoImportPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const { search = '' } = await searchParams
  const workbook = await getLatestExcelWorkbook()
  const rows = getWorkbookArticles(workbook).filter((item) => item.photoUrl && searchText([item.codeLabel,item.sheet,item.series,item.detail,item.status,...item.customerCodes], search)).map((item) => ({id:item.id,code:item.codeLabel,sheet:`${item.sheet} · ${item.excelRow}`,date:dateLabel(item.date),series:item.series,detail:item.detail,status:item.status,customer:item.customerCodes.join(', ')||'—',link:<a href={item.photoUrl || '#'} target="_blank" rel="noreferrer">Apri originale ↗</a>}))
  return <AdminWorkbookLayout active="/admin/immagini" title="Foto da Excel" description="Consultazione degli URL immagine letti da X, Y e Z. Caricamento e modifica delle foto dal sito sono disattivati." displayName={profile.display_name} email={user.email}>
    <section className="panel"><form action="/admin/immagini" method="get" className="form"><label>Cerca articolo o utente<input type="search" name="search" defaultValue={search} placeholder="Cerca immagine…" /></label><button type="submit">Cerca</button></form></section>
    <section className="panel"><h2>Immagini disponibili ({rows.length})</h2><ReadOnlyTable columns={[{key:'code',label:'Chiave'},{key:'sheet',label:'Fonte'},{key:'date',label:'Data'},{key:'series',label:'Serie'},{key:'detail',label:'Dettaglio'},{key:'status',label:'Stato'},{key:'customer',label:'Utenti'},{key:'link',label:'URL immagine'}]} rows={rows.slice(0,1000)} />{rows.length>1000 && <p className="muted">Mostrate le prime 1.000 immagini: applica la ricerca per filtrare.</p>}</section>
  </AdminWorkbookLayout>
}
