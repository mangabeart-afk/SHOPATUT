import { requirePageContext } from '../../lib/page-context'
import { getAllCustomerSheets, getLatestExcelWorkbook, getWorkbookDashboardStats, money } from '../../lib/excel-source'
import Navigation from '../../components/navigation'
import AdminCustomerSituation from '../../components/admin-customer-situation'
import ReadOnlyNotice from '../../components/read-only-notice'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminDashboard() {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const workbook = await getLatestExcelWorkbook()
  const stats = getWorkbookDashboardStats(workbook)
  const customers = getAllCustomerSheets(workbook).map((customer) => {
    const words = customer.name.split(/\s+/).filter(Boolean)
    return {
      customerId: customer.code,
      customerCode: customer.code,
      firstName: words.slice(0, -1).join(' '),
      lastName: words.length > 1 ? words[words.length - 1] : '',
      debtRemaining: Math.max(0, customer.balance),
      balanceRemaining: customer.balance,
      stockUnits: customer.stockUnits,
      boxUnits: customer.boxUnits,
      incomingUnits: customer.incomingUnits,
      customerName: customer.name,
    }
  })
  const zero = (value: number) => Math.abs(value) < 0.005
  const customersWithDebt = customers.filter((row) => row.balanceRemaining >= 0.005).sort((a, b) => b.balanceRemaining - a.balanceRemaining)
  const customersWithIncoming = customers.filter((row) => zero(row.balanceRemaining) && row.incomingUnits > 0).sort((a, b) => b.incomingUnits - a.incomingUnits || a.customerName.localeCompare(b.customerName, 'it'))
  const customersToShip = customers.filter((row) => zero(row.balanceRemaining) && row.incomingUnits === 0 && (row.stockUnits > 0 || row.boxUnits > 0)).sort((a, b) => b.boxUnits - a.boxUnits || a.customerName.localeCompare(b.customerName, 'it'))
  const positiveDebtTotal = customersWithDebt.reduce((sum, row) => sum + row.balanceRemaining, 0)
  const incomingDebtUnits = customersWithDebt.reduce((sum, row) => sum + row.incomingUnits, 0)
  const incomingFreeUnits = customersWithIncoming.reduce((sum, row) => sum + row.incomingUnits, 0)
  const stockToShip = customersToShip.reduce((sum, row) => sum + row.stockUnits, 0)
  const boxToShip = customersToShip.reduce((sum, row) => sum + row.boxUnits, 0)

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin" displayName={profile.display_name} email={user.email} />
      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Dashboard amministratore</h1></div>
        </header>
        <section className="panel admin-overview-panel">
          <div className="admin-panel-heading">
            <div><p className="eyebrow">PANORAMICA</p><h2>Riepilogo gestionale</h2></div>
            <p className="muted">Valori letti dal riepilogo del foglio Excel <b>W</b>.</p>
          </div>
          <div className="grid admin-summary-grid admin-admin-kpi-grid">
            <div className="card"><div className="admin-summary-label">QT ACQUISTATA</div><strong>{stats.purchased.toLocaleString('it-IT')}</strong></div>
            <div className="card"><div className="admin-summary-label">VALORE ACQUISTI</div><strong>{money(stats.purchaseValue)}</strong></div>
            <div className="card"><div className="admin-summary-label">ARTICOLI IN ARRIVO</div><strong>{stats.incomingUnits.toLocaleString('it-IT')}</strong></div>
            <div className="card"><div className="admin-summary-label">QT VENDUTA</div><strong>{stats.sold.toLocaleString('it-IT')}</strong></div>
            <div className="card"><div className="admin-summary-label">VALORE VENDITE</div><strong>{money(stats.revenue)}</strong></div>
            <div className="card"><div className="admin-summary-label">MARGINE LORDO</div><strong>{money(stats.margin)}</strong></div>
          </div>
          <p className="muted">Snapshot: {workbook.runId} · schema v2 · {workbook.completedAt ? new Date(workbook.completedAt).toLocaleString('it-IT') : 'data non disponibile'}</p>
          <ReadOnlyNotice />
        </section>
        <section className="panel admin-customer-situation-panel">
          <h2>Situazione utenti</h2>
          <AdminCustomerSituation groups={[
            { id: 'debt', title: 'Caselle da saldare', tone: 'debt', customers: customersWithDebt, count: customersWithDebt.length, mainLabel: 'TOTALE', mainValue: money(positiveDebtTotal), secondLabel: 'IN ARRIVO', secondValue: String(incomingDebtUnits) },
            { id: 'incoming', title: 'Caselle in arrivo', tone: 'incoming', customers: customersWithIncoming, count: customersWithIncoming.length, mainLabel: 'IN ARRIVO', mainValue: String(incomingFreeUnits) },
            { id: 'available', title: 'Caselle da spedire', tone: 'available', customers: customersToShip, count: customersToShip.length, mainLabel: 'IN STOCK', mainValue: String(stockToShip), secondLabel: 'IN BOX', secondValue: String(boxToShip) },
          ]} />
        </section>
      </section>
    </main>
  )
}
