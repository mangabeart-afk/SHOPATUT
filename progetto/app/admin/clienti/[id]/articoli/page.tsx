import { notFound } from 'next/navigation'
import AdminWorkbookLayout from '../../../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../../../components/read-only-table'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money } from '../../../../../lib/excel-source'
import { requirePageContext } from '../../../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function CustomerArticlesPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile, supabase } = await requirePageContext('AMMINISTRATORE')
  const { id } = await params
  const workbook = await getLatestExcelWorkbook()
  let sheet = findSheet(workbook, decodeURIComponent(id))
  if (!sheet && /^[0-9a-f-]{36}$/i.test(id)) { const { data } = await supabase.from('customers').select('customer_code').eq('id', id).maybeSingle(); if (data?.customer_code) sheet = findSheet(workbook, data.customer_code) }
  if (!sheet) notFound()
  const customer = parseCustomerSheet(sheet)
  const rows = customer.items.map((item) => ({ id: item.id, date: dateLabel(item.date), movement: item.movement || '—', article: item.article, quantity: String(item.quantity), amount: item.amount != null ? money(item.amount) : '—', status: item.status || '—' }))
  return <AdminWorkbookLayout active="/admin/clienti" title={`Articoli · ${customer.name}`} description={`Scheda Excel ${customer.code}`} displayName={profile.display_name} email={user.email}><section className="panel"><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'article',label:'Articolo'},{key:'movement',label:'Movimento'},{key:'quantity',label:'Q.tà',align:'right'},{key:'amount',label:'Importo',align:'right'},{key:'status',label:'Stato'}]} rows={rows} /></section></AdminWorkbookLayout>
}
