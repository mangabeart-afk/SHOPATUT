import 'server-only'
import { createAdminClient } from './supabase-admin'

export type CellValue = string | number | boolean | null | undefined
export type FillInfo = {
  patternType?: string | null
  fgColor?: { rgb?: string | null; indexed?: number | null; theme?: number | null; type?: string | null }
  bgColor?: { rgb?: string | null; indexed?: number | null; theme?: number | null; type?: string | null }
}
export type StagedSheetData = {
  sheetName?: string
  rows?: CellValue[][]
  formulas?: Record<string, string>
  cellFills?: Record<string, FillInfo>
  hiddenRows?: number[]
  hiddenColumns?: number[]
  mergedRanges?: string[]
  hyperlinks?: Record<string, string>
  sheetState?: string
  maxRow?: number
  maxColumn?: number
}
export type ExcelSheet = {
  sheet_name: string
  row_count: number
  column_count: number
  data: StagedSheetData
}
export type ExcelWorkbook = {
  runId: string
  workbookSha256: string
  completedAt: string | null
  sheets: Map<string, ExcelSheet>
}

export type CustomerItem = {
  id: string
  sheetName: string
  excelRow: number
  date: string | null
  movement: string
  article: string
  quantity: number
  amount: number | null
  amountPaid: number | null
  paymentDate: string | null
  status: string
  rawStatus: string
  isInBox: boolean
  notes: string
  kind: 'article' | 'payment' | 'other'
}
export type CustomerSheet = {
  code: string
  name: string
  contact: string
  balance: number
  balanceAvailable: boolean
  sheet: ExcelSheet
  items: CustomerItem[]
  transactions: CustomerItem[]
  incomingUnits: number
  stockUnits: number
  boxUnits: number
  shippedUnits: number
}

export type WorkbookPreorder = {
  id: string
  excelRow: number
  product: string
  customerName: string
  customerCode: string
  quantityOrReference: string
  status: string
  productMeta: string
}

export type WorkbookArticle = {
  id: string
  sheet: string
  excelRow: number
  itemKey: string
  codeLabel: string
  date: string | null
  origin: string
  series: string
  type: string
  detail: string
  status: string
  quantity: number
  available: number
  totalCost: number | null
  unitCost: number | null
  saleValue: number | null
  customerCodes: string[]
  photoUrl: string | null
}

const num = (value: CellValue): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
const str = (value: CellValue): string => value == null ? '' : String(value).trim()
const normal = (value: CellValue): string => str(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const firstValue = (row: CellValue[] | undefined, indices: number[]): string => {
  if (!row) return ''
  for (const index of indices) {
    const value = str(row[index])
    if (value) return value
  }
  return ''
}
const moneyNumber = (value: number | null | undefined): number => {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Only reads a completed schema-v2 workbook snapshot. It does not write to business tables. */
export async function getLatestExcelWorkbook(): Promise<ExcelWorkbook> {
  const supabase = createAdminClient()
  const { data: run, error: runError } = await supabase
    .from('excel_sync_runs')
    .select('id,workbook_sha256,completed_at,status,capture_schema_version')
    .eq('status', 'READY')
    .eq('capture_schema_version', 2)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runError) throw new Error(`Lettura staging Excel non riuscita: ${runError.message}`)
  if (!run?.id) throw new Error('Nessun workbook Excel in staging con stato READY e schema v2.')

  const { data: rows, error: sheetsError } = await supabase
    .from('excel_sync_sheets')
    .select('sheet_name,row_count,column_count,data')
    .eq('run_id', run.id)
    .order('sheet_name', { ascending: true })

  if (sheetsError) throw new Error(`Lettura fogli Excel non riuscita: ${sheetsError.message}`)
  const sheetRows = (rows || []) as ExcelSheet[]
  if (sheetRows.length !== 69) {
    throw new Error(`Snapshot Excel incompleto: attesi 69 fogli, trovati ${sheetRows.length}.`)
  }

  return {
    runId: String(run.id),
    workbookSha256: String(run.workbook_sha256 || ''),
    completedAt: run.completed_at ? String(run.completed_at) : null,
    sheets: new Map(sheetRows.map((sheet) => [sheet.sheet_name, sheet])),
  }
}

export function findSheet(workbook: ExcelWorkbook, name: string): ExcelSheet | null {
  if (workbook.sheets.has(name)) return workbook.sheets.get(name) || null
  const normalized = normal(name)
  for (const [key, sheet] of workbook.sheets.entries()) {
    if (normal(key) === normalized) return sheet
  }
  return null
}

export function allCustomerSheetNames(workbook: ExcelWorkbook): string[] {
  return [...workbook.sheets.keys()]
    .filter((name) => /^\d{4}[A-Z]{3}$/i.test(name) || /^FRENCY$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' }))
}

function columnName(oneBased: number): string {
  let n = oneBased
  let out = ''
  while (n > 0) {
    const rest = (n - 1) % 26
    out = String.fromCharCode(65 + rest) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function fillIsYellow(fill: FillInfo | undefined): boolean {
  if (!fill) return false
  const fg = normal(fill.fgColor?.rgb || '')
  const bg = normal(fill.bgColor?.rgb || '')
  // Excel's common pure-yellow RGB value; also tolerate a yellow indexed foreground.
  return fg === 'FFFFFF00' || bg === 'FFFFFF00' ||
    (fill.fgColor?.indexed === 6 || fill.bgColor?.indexed === 6)
}

function findHeader(headers: CellValue[], patterns: RegExp[], fallback: number): number {
  // Pattern order matters for repeated headings such as DATA and DATA PAG.
  for (const pattern of patterns) {
    for (let index = 0; index < headers.length; index++) {
      if (pattern.test(normal(headers[index]))) return index
    }
  }
  return fallback
}

function parseCustomerItem(sheet: ExcelSheet, row: CellValue[], rowIndex: number, headers: CellValue[]): CustomerItem {
  const movementIndex = findHeader(headers, [/^MOVIMENTO$/], 1)
  const articleIndex = findHeader(headers, [/^ARTICOLO$/], 2)
  const quantityIndex = findHeader(headers, [/^Q\.?TA'?$/, /^QUANTITA/], 3)
  const amountIndex = findHeader(headers, [/^IMPORTO\s*ACQUISTO$/], 4)
  const paymentDateIndex = findHeader(headers, [/^DATA\s*PAG/, /^DATA$/], 5)
  const paidIndex = findHeader(headers, [/^IMPORTO\s*PAGATO$/], 6)
  const statusIndex = findHeader(headers, [/^STATO$/], 7)
  const dateIndex = findHeader(headers, [/^DATA$/], 0)
  const noteIndex = findHeader(headers, [/^NOTE?$/], Math.min(8, Math.max(0, row.length - 1)))
  const rawStatus = str(row[statusIndex])
  const actualExcelRow = rowIndex + 1 // `rows` starts with Excel row 1; rowIndex 2 is Excel row 3.
  const statusCellAddress = `${columnName(statusIndex + 1)}${actualExcelRow}`
  const yellowStatus = fillIsYellow(sheet.data.cellFills?.[statusCellAddress])
  const state = normal(rawStatus)
  const inBox = state === 'IN STOCK' && yellowStatus
  const effectiveStatus = inBox ? 'IN BOX' : state.replace(/^IN ARRIVO$/, 'IN ARRIVO')
  const rawMovement = str(row[movementIndex])
  const article = str(row[articleIndex])
  const quantity = num(row[quantityIndex]) || 0
  const amount = num(row[amountIndex])
  const amountPaid = num(row[paidIndex])
  const rawDate = row[dateIndex]
  const transactionDate = parseDate(rawDate)
  const paymentDate = parseDate(row[paymentDateIndex])
  // A few customer sheets use the first column for a movement label when no date exists
  // (for example 2410NVR has `ACCONTO` in column A). Do not display that label as a date.
  // Recover known transaction labels as the movement type so the payment remains meaningful.
  const dateCellLabel = str(rawDate)
  const dateCellMovement = /^(ACCONTO|SALDO|PAGAMENTO|PAGAMENTI|VINTED|CASHBACK|RIMBORSO|BONIFICO|PAYPAL|ARROTOND(?:\.|AMENTO)?|SPEDIZIONE|SPEDIZIONI|DOGANA|ORDINE|SCAMBIO|RESO|VENDITA|STORNO|CORREZIONE)$/i.test(dateCellLabel)
  const movement = rawMovement || (!transactionDate && dateCellMovement ? dateCellLabel : '')
  const movementType = normal(movement)
  const explicitPayment = /ACCONTO|SALDO|PAGAMENTO|VINTED|CASHBACK|RIMBORSO|BONIFICO|PAYPAL/.test(movementType)
  const kind: CustomerItem['kind'] = article && quantity > 0 ? 'article' : explicitPayment ? 'payment' : (amountPaid != null || amount != null) ? 'other' : 'other'
  return {
    id: `${sheet.sheet_name}:${actualExcelRow}`,
    sheetName: sheet.sheet_name,
    excelRow: actualExcelRow,
    date: transactionDate,
    movement,
    article,
    quantity,
    amount,
    amountPaid,
    paymentDate,
    status: effectiveStatus,
    rawStatus,
    isInBox: inBox,
    notes: str(row[noteIndex]),
    kind,
  }
}

export function parseCustomerSheet(sheet: ExcelSheet): CustomerSheet {
  const rows = sheet.data.rows || []
  const titleRow = rows[0] || []
  const balanceLabelIndex = titleRow.findIndex((value) => normal(value) === 'TOTALE AL SALDO')
  let balance: number | null = null
  if (balanceLabelIndex >= 0) {
    for (let i = balanceLabelIndex + 1; i < titleRow.length; i++) {
      const value = num(titleRow[i])
      if (value != null) { balance = moneyNumber(value); break }
    }
  }
  const headers = rows[1] || []
  const transactions = rows.slice(2).flatMap((row, offset) => {
    if (!row || row.every((cell) => cell == null || str(cell) === '')) return []
    const parsed = parseCustomerItem(sheet, row, offset + 2, headers)
    const meaningful = Boolean(parsed.date || parsed.movement || parsed.article || parsed.quantity || parsed.amount != null || parsed.amountPaid != null || parsed.status)
    return meaningful ? [parsed] : []
  })
  const items = transactions.filter((item) => item.kind === 'article' && item.article)
  return {
    code: sheet.sheet_name,
    name: str(titleRow[0]).replace(/\s+/g, ' ').trim() || sheet.sheet_name,
    contact: str(titleRow[2]),
    balance: balance ?? 0,
    balanceAvailable: balance != null,
    sheet,
    items,
    transactions,
    incomingUnits: sumUnits(items, ['IN ARRIVO']),
    stockUnits: sumUnits(items, ['IN STOCK']),
    boxUnits: sumUnits(items, ['IN BOX']),
    shippedUnits: sumUnits(items, ['SPEDITO']),
  }
}

function sumUnits(items: CustomerItem[], statuses: string[]): number {
  return items.reduce((sum, item) => sum + (statuses.includes(item.status) ? item.quantity : 0), 0)
}

export function getAllCustomerSheets(workbook: ExcelWorkbook): CustomerSheet[] {
  return allCustomerSheetNames(workbook).flatMap((name) => {
    const sheet = findSheet(workbook, name)
    return sheet ? [parseCustomerSheet(sheet)] : []
  })
}

export function getWorkbookDashboardStats(workbook: ExcelWorkbook) {
  const w = findSheet(workbook, 'W')
  const rows = w?.data.rows || []
  const totalRow = rows[8] || []
  const allArticles = getWorkbookArticles(workbook)
  return {
    purchased: num(totalRow[0]) || 0,
    purchaseValue: num(totalRow[1]) || 0,
    sold: num(totalRow[6]) || 0,
    revenue: num(totalRow[7]) || 0,
    margin: num(totalRow[8]) || 0,
    incomingUnits: allArticles.reduce((sum, item) => sum + (item.status === 'IN ARRIVO' ? item.quantity : 0), 0),
    availableUnits: allArticles.reduce((sum, item) => sum + (['STOCK', 'IN STOCK', 'IN_BOX', 'IN BOX'].includes(normal(item.status)) ? item.quantity : 0), 0),
    sourceRow: 9,
  }
}

function parseDate(value: CellValue): string | null {
  if (value == null || str(value) === '') return null
  if (typeof value === 'number') return Number.isFinite(value) && value > 1900 && value < 2100 ? `${Math.trunc(value)}-01-01` : null
  const s = str(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function statusFromSource(value: CellValue): string {
  const state = normal(value)
  if (state === 'SOLD' || state === 'VENDUTO' || state === 'VENDUTA') return 'VENDUTO'
  if (state === 'IN ARRIVO') return 'IN ARRIVO'
  if (state === 'IN BOX') return 'IN BOX'
  if (state === 'IN STOCK' || state === 'STOCK') return 'IN STOCK'
  if (state === 'SPEDITO') return 'SPEDITO'
  return state || '—'
}

export function getWorkbookArticles(workbook: ExcelWorkbook): WorkbookArticle[] {
  const result: WorkbookArticle[] = []
  const sheetSpecs = [
    { name: 'X', status: 0, date: 1, itemKey: -1, series: 4, type: 5, detail: 6, qty: 8, total: 9, unitCost: 10, sold: 11, soldQuantity: 12, customers: [14], photo: 16, origin: 3 },
    { name: 'Y', status: 0, date: 1, itemKey: -1, series: 2, type: 3, detail: 4, qty: 6, total: 13, unitCost: 14, sold: 15, soldQuantity: 17, customers: [18], photo: 20, origin: -1 },
    { name: 'Z', status: 0, date: 1, itemKey: 2, series: 3, type: 4, detail: 5, qty: 7, total: 14, unitCost: 15, sold: 16, soldQuantity: 18, customers: [19,20,21,22,23,24], photo: 25, origin: -1 },
    { name: 'VIET', status: 0, date: 1, itemKey: -1, series: 2, type: 3, detail: 4, qty: 5, total: 12, unitCost: 13, sold: 14, soldQuantity: 15, customers: [18,19,20,21], photo: -1, origin: -1 },
  ]
  for (const spec of sheetSpecs) {
    const sheet = findSheet(workbook, spec.name)
    if (!sheet) continue
    const rows = sheet.data.rows || []
    for (let index = 2; index < rows.length; index++) {
      const row = rows[index] || []
      const state = statusFromSource(row[spec.status])
      const series = str(row[spec.series])
      const detail = str(row[spec.detail])
      const quantity = num(row[spec.qty]) || 0
      const totalCost = num(row[spec.total])
      const unitCost = num(row[spec.unitCost])
      const rawSoldQuantity = num(row[spec.soldQuantity])
      // The workbook stores the number of units sold in N (X/Y/Z) or QT (VIET).
      // If a row is explicitly SOLD and the unit count is missing/zero, the full quantity is unavailable.
      const soldQuantity = (state === 'VENDUTO' || state === 'SPEDITO') && (rawSoldQuantity == null || rawSoldQuantity <= 0)
        ? quantity
        : Math.max(0, rawSoldQuantity || 0)
      const available = Math.max(0, quantity - soldQuantity)
      const itemKey = spec.itemKey >= 0 ? str(row[spec.itemKey]) : ''
      if (!series && !detail && !itemKey && quantity === 0) continue
      if (!series && !detail) continue
      const rawPhoto = spec.photo >= 0 ? str(row[spec.photo]) : ''
      const customerCodes = spec.customers.map((i) => str(row[i])).filter(Boolean)
      const origin = spec.origin >= 0 ? str(row[spec.origin]) : spec.name === 'VIET' ? 'VIETNAM' : spec.name
      const saleValue = num(row[spec.sold])
      const date = parseDate(row[spec.date])
      result.push({
        id: `${spec.name}:${index + 1}`,
        sheet: spec.name,
        excelRow: index + 1,
        itemKey,
        codeLabel: itemKey || `${spec.name} · riga ${index + 1}`,
        date,
        origin: origin || '—',
        series,
        type: str(row[spec.type]),
        detail,
        status: state,
        quantity,
        available,
        totalCost,
        unitCost,
        saleValue,
        customerCodes: [...new Set(customerCodes)],
        photoUrl: /^https?:\/\//i.test(rawPhoto) ? rawPhoto : null,
      })
    }
  }
  return result
}

export function getWorkbookPreorders(workbook: ExcelWorkbook): WorkbookPreorder[] {
  const sheet = findSheet(workbook, 'PREORDER')
  if (!sheet) return []
  const rows = sheet.data.rows || []
  const starts = [0, 5, 10, 15, 20, 25]
  const result: WorkbookPreorder[] = []
  for (const start of starts) {
    const header = rows[0] || []
    const product = str(header[start + 1])
    if (!product) continue
    const metaParts = [str(header[start + 3]), str(header[start + 2]), str(header[start + 4])].filter(Boolean)
    const productMeta = [...new Set(metaParts)].join(' · ')
    for (let rowIndex = 3; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || []
      const rawName = str(row[start + 1]).replace(/\s+/g, ' ').trim()
      const rawCode = str(row[start + 2]).replace(/\s+/g, ' ').trim()
      const rawStatus = str(row[start + 3]).replace(/\s+/g, ' ').trim()
      if (!rawName) continue
      const normalizedName = normal(rawName)
      const normalizedCode = normal(rawCode)
      const normalizedStatus = normal(rawStatus)
      // PREORDER has notes/mini-headings embedded among the six horizontal blocks.
      // Some of those rows put a numeric product price in the status column (e.g. 16, 18, 40, 50).
      // They are not customer assignments, so omit them instead of exposing a price as a state.
      if (typeof row[start + 3] === 'number' && Number.isFinite(row[start + 3])) continue
      // Top rows encode aggregate quantities, sources and block-level state, not customer assignments.
      if (rawName.includes('>') || normalizedName.startsWith('STATO') || normalizedCode.startsWith('STATO') || normalizedStatus === 'VENDUTO' && normalizedCode.startsWith('STATO')) continue
      if (normalizedName.includes('JAPANEUNERD') || /^\d+(?:[.,]\d+)?$/.test(rawName)) continue
      const quantityOrReference = str(row[start])
      const code = /^\d{4}[A-Z]{3}$/i.test(rawCode) || /^FRENCY$/i.test(rawCode) ? rawCode : ''
      result.push({
        id: `PREORDER:${rowIndex + 1}:${start + 1}`,
        excelRow: rowIndex + 1,
        product,
        customerName: rawName,
        customerCode: code,
        quantityOrReference,
        status: rawStatus,
        productMeta,
      })
    }
  }
  return result
}

export function getCustomerPreorders(workbook: ExcelWorkbook, customerCode: string): WorkbookPreorder[] {
  const code = normal(customerCode)
  return getWorkbookPreorders(workbook).filter((entry) => normal(entry.customerCode) === code)
}

export function getRecentIncomingPhotoArticles(workbook: ExcelWorkbook, limit = 12) {
  return getWorkbookArticles(workbook)
    .filter((article) => article.status === 'IN ARRIVO' && article.photoUrl)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.excelRow - a.excelRow)
    .slice(0, limit)
    .map((article) => ({
      id: article.id,
      series: article.series,
      detail: article.detail,
      photo_url: article.photoUrl,
      status: article.status,
      origin: article.origin,
    }))
}

export function money(value: number | null | undefined): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date)
}

export function normalizeStatusForDisplay(value: string): string {
  return statusFromSource(value)
}

export function searchText(values: Array<string | null | undefined>, search: string): boolean {
  const query = normal(search)
  if (!query) return true
  return values.some((value) => normal(value || '').includes(query))
}

export function rowLooksYellow(sheet: ExcelSheet, excelRow: number, columnIndex: number): boolean {
  return fillIsYellow(sheet.data.cellFills?.[`${columnName(columnIndex + 1)}${excelRow}`])
}

export function findCellByHeader(headers: CellValue[], pattern: RegExp, fallback: number): number {
  return findHeader(headers, [pattern], fallback)
}

export function asNumber(value: CellValue): number | null { return num(value) }
export function asText(value: CellValue): string { return str(value) }
export function roundMoney(value: number): number { return moneyNumber(value) }
