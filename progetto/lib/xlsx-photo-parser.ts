import { inflateRawSync } from 'node:zlib'
import { posix } from 'node:path'

export type PhotoSheetName = 'X' | 'Y' | 'Z'
export type ExtractedPhotoUrl = { row: number; rawUrl: string }

const ZIP_EOCD = 0x06054b50
const ZIP_CENTRAL = 0x02014b50
const ZIP_LOCAL = 0x04034b50
const MAX_XML_BYTES = 32 * 1024 * 1024

function attr(attrs: string, name: string): string | null {
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attrs.match(new RegExp(`(?:^|\\s)${safeName}="([^"]*)"`))
  return match ? xmlDecode(match[1]) : null
}

function xmlDecode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_all, num: string) => {
      const code = Number(num)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
    .replace(/&#x([\da-f]+);/gi, (_all, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
}

function textNodes(xml: string): string {
  const parts: string[] = []
  const regex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) parts.push(xmlDecode(match[1]))
  return parts.join('')
}

type ZipEntry = { method: number; compressedSize: number; uncompressedSize: number; localOffset: number }

function zipDirectory(buffer: Buffer): Map<string, ZipEntry> {
  const scanStart = Math.max(0, buffer.length - 65_557)
  let eocd = -1
  for (let i = buffer.length - 22; i >= scanStart; i -= 1) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Il file non sembra un archivio .xlsx valido (directory ZIP assente).')

  const disk = buffer.readUInt16LE(eocd + 4)
  const centralDisk = buffer.readUInt16LE(eocd + 6)
  const entries = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (disk !== 0 || centralDisk !== 0 || entries === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new Error('Formato ZIP non supportato per questo file Excel.')
  }
  if (entries > 20_000 || centralOffset + centralSize > buffer.length) throw new Error('Struttura ZIP non valida.')

  const result = new Map<string, ZipEntry>()
  let cursor = centralOffset
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== ZIP_CENTRAL) throw new Error('Directory ZIP non valida.')
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    if (nameStart + nameLength + extraLength + commentLength > buffer.length) throw new Error('Nome file ZIP non valido.')
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8').replace(/\\/g, '/')
    if (method !== 0 && method !== 8) throw new Error(`Compressione ZIP non supportata per ${name}.`)
    result.set(posix.normalize(name), { method, compressedSize, uncompressedSize, localOffset })
    cursor = nameStart + nameLength + extraLength + commentLength
  }
  return result
}

function readZipEntry(buffer: Buffer, directory: Map<string, ZipEntry>, path: string): Buffer {
  const entry = directory.get(path)
  if (!entry) throw new Error(`Nel file Excel manca ${path}.`)
  if (entry.uncompressedSize > MAX_XML_BYTES || entry.compressedSize > buffer.length) throw new Error(`La sezione ${path} supera i limiti consentiti.`)
  const offset = entry.localOffset
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_LOCAL) throw new Error(`Intestazione ZIP non valida per ${path}.`)
  const filenameLength = buffer.readUInt16LE(offset + 26)
  const extraLength = buffer.readUInt16LE(offset + 28)
  const dataStart = offset + 30 + filenameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataStart < 0 || dataEnd > buffer.length) throw new Error(`Contenuto ZIP non valido per ${path}.`)
  const compressed = buffer.subarray(dataStart, dataEnd)
  const output = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_XML_BYTES })
  if (output.length !== entry.uncompressedSize) throw new Error(`Dimensione XML non coerente per ${path}.`)
  return output
}

function relationshipPath(target: string): string {
  const normalized = target.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return posix.normalize(normalized.replace(/^\/+/, ''))
  return posix.normalize(posix.join('xl', normalized))
}

function sharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const output: string[] = []
  const regex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) output.push(textNodes(match[1]))
  return output
}

function cellValue(cellXml: string, cellAttrs: string, strings: string[]): string {
  const type = attr(cellAttrs, 't')
  if (type === 'inlineStr') {
    const inline = cellXml.match(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/)
    return inline ? textNodes(inline[1]).trim() : ''
  }
  const valueMatch = cellXml.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)
  if (!valueMatch) return ''
  const value = xmlDecode(valueMatch[1])
  if (type === 's') {
    const index = Number(value)
    return Number.isInteger(index) && index >= 0 && index < strings.length ? strings[index].trim() : ''
  }
  return value.trim()
}

type XmlCell = { address: string; value: string }
type XmlRow = { row: number; cells: XmlCell[] }

function worksheetRows(xml: string, strings: string[]): XmlRow[] {
  const rows: XmlRow[] = []
  const rowRegex = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowNumber = Number(attr(rowMatch[1], 'r'))
    if (!Number.isInteger(rowNumber) || rowNumber < 1) continue
    const body = rowMatch[2] || ''
    const cells: XmlCell[] = []
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(body)) !== null) {
      const address = attr(cellMatch[1], 'r')
      if (!address) continue
      cells.push({ address, value: cellValue(cellMatch[2] || '', cellMatch[1], strings) })
    }
    rows.push({ row: rowNumber, cells })
  }
  return rows
}

function columnNumber(address: string): number {
  const letters = address.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || ''
  let value = 0
  for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64
  return value
}

function normalizedHeader(value: string): string {
  return value.normalize('NFKC').trim().replace(/[\s_-]+/g, '').toUpperCase()
}

export function extractPhotoUrlsFromXlsx(buffer: Buffer): Map<PhotoSheetName, ExtractedPhotoUrl[]> {
  const directory = zipDirectory(buffer)
  const workbookXml = readZipEntry(buffer, directory, 'xl/workbook.xml').toString('utf8')
  const relsXml = readZipEntry(buffer, directory, 'xl/_rels/workbook.xml.rels').toString('utf8')

  const relationshipById = new Map<string, string>()
  const relationRegex = /<Relationship\b([^>]*?)\/>/g
  let relationMatch: RegExpExecArray | null
  while ((relationMatch = relationRegex.exec(relsXml)) !== null) {
    const id = attr(relationMatch[1], 'Id')
    const target = attr(relationMatch[1], 'Target')
    if (id && target) relationshipById.set(id, relationshipPath(target))
  }

  const sheetPathByName = new Map<string, string>()
  const sheetRegex = /<sheet\b([^>]*?)\/>/g
  let sheetMatch: RegExpExecArray | null
  while ((sheetMatch = sheetRegex.exec(workbookXml)) !== null) {
    const name = attr(sheetMatch[1], 'name')
    const relationshipId = attr(sheetMatch[1], 'r:id')
    if (name && relationshipId) {
      const target = relationshipById.get(relationshipId)
      if (target) sheetPathByName.set(name, target)
    }
  }

  const stringsXml = directory.has('xl/sharedStrings.xml')
    ? readZipEntry(buffer, directory, 'xl/sharedStrings.xml').toString('utf8')
    : null
  const strings = sharedStrings(stringsXml)
  const result = new Map<PhotoSheetName, ExtractedPhotoUrl[]>()
  const missing: string[] = []

  for (const name of ['X', 'Y', 'Z'] as const) {
    const sheetPath = sheetPathByName.get(name)
    if (!sheetPath) {
      missing.push(`scheda ${name} assente`)
      continue
    }
    const xml = readZipEntry(buffer, directory, sheetPath).toString('utf8')
    const rows = worksheetRows(xml, strings)
    let headerRow = 0
    let urlColumn = 0

    for (const row of rows) {
      if (row.row > 25) break
      for (const cell of row.cells) {
        if (normalizedHeader(cell.value) === 'IMMAGINEURL') {
          headerRow = row.row
          urlColumn = columnNumber(cell.address)
          break
        }
      }
      if (urlColumn > 0) break
    }

    if (!headerRow || !urlColumn) {
      missing.push(`intestazione IMMAGINE_URL mancante nella scheda ${name}`)
      continue
    }

    const photos: ExtractedPhotoUrl[] = []
    for (const row of rows) {
      if (row.row <= headerRow) continue
      const cell = row.cells.find((item) => columnNumber(item.address) === urlColumn)
      const rawUrl = cell?.value.trim() || ''
      if (rawUrl) photos.push({ row: row.row, rawUrl })
    }
    result.set(name, photos)
  }

  if (missing.length) throw new Error(`Il file non è pronto per la sincronizzazione: ${missing.join('; ')}. Le colonne devono avere intestazione IMMAGINE_URL.`)
  return result
}
