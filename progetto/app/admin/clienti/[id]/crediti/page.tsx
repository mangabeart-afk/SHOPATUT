import { notFound } from 'next/navigation'
import AdminWorkbookLayout from '../../../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../../../components/read-only-table'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money } from '../../../../../lib/excel-source'
import { requirePageContext } from '../../../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function CustomerCreditsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile, supabase } = await requirePageContext('AMMINISTRATORE')
  const { id } = await params
  const workbook = await getLatestExcelWorkbook()
  let sheet = findSheet(workbook, decodeURIComponent(id))
  if (!sheet && /^[0-9a-f-]{36}$/i.test(id)) { const { data } = await supabase.from('customers').select('customer_code').eq('id', id).maybeSingle(); if (data?.customer_code) sheet = findSheet(workbook, data.customer_code) }
  if (!sheet) notFound()
  const customer = parseCustomerSheet(sheet)
  const rows = customer.transactions.filter((item) => /CASHBACK|CREDITO|RIMBORSO/i.test(item.movement) || (item.amount != null && item.amount < 0)).map((item) => ({ id: item.id, date: dateLabel(item.date), movement: item.movement || 'Rettifica', article: item.article || '—', amount: item.amount != null ? money(item.amount) : '—', paid: item.amountPaid != null ? money(item.amountPaid) : '—', notes: item.notes || '—' }))
  return <AdminWorkbookLayout active="/admin/clienti" title={`Crediti e rettifiche · ${customer.name}`} description={`Saldo Excel: ${money(customer.balance)}`} displayName={profile.display_name} email={user.email}><section className="panel"><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'movement',label:'Tipo'},{key:'article',label:'Riferimento'},{key:'amount',label:'Importo',align:'right'},{key:'paid',label:'Pagato',align:'right'},{key:'notes',label:'Note'}]} rows={rows} emptyLabel="Nessuna rettifica esplicita nella scheda Excel." /></section></AdminWorkbookLayout>
}
