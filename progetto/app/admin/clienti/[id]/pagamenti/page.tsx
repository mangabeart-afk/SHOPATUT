import { notFound } from 'next/navigation'
import AdminWorkbookLayout from '../../../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../../../components/read-only-table'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money } from '../../../../../lib/excel-source'
import { requirePageContext } from '../../../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function CustomerPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile, supabase } = await requirePageContext('AMMINISTRATORE')
  const { id } = await params
  const workbook = await getLatestExcelWorkbook()
  let sheet = findSheet(workbook, decodeURIComponent(id))
  if (!sheet && /^[0-9a-f-]{36}$/i.test(id)) { const { data } = await supabase.from('customers').select('customer_code').eq('id', id).maybeSingle(); if (data?.customer_code) sheet = findSheet(workbook, data.customer_code) }
  if (!sheet) notFound()
  const customer = parseCustomerSheet(sheet)
  const rows = customer.transactions.filter((item) => item.amountPaid != null && Math.abs(item.amountPaid) >= 0.005).map((item) => ({ id: item.id, date: dateLabel(item.paymentDate || item.date), movement: item.movement || 'Pagamento', article: item.article || '—', paid: money(item.amountPaid), note: item.notes || '—' }))
  return <AdminWorkbookLayout active="/admin/clienti" title={`Pagamenti · ${customer.name}`} description={`Saldo Excel: ${money(customer.balance)}`} displayName={profile.display_name} email={user.email}><section className="panel"><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'movement',label:'Tipo'},{key:'article',label:'Riferimento'},{key:'paid',label:'Importo',align:'right'},{key:'note',label:'Note'}]} rows={rows} /></section></AdminWorkbookLayout>
}
