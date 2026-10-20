'use server'

import { extractPhotoUrlsFromXlsx } from '../../../lib/xlsx-photo-parser'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import type { PhotoImportItem, PhotoPreviewStats, PhotoSyncState } from './types'

type SheetName = 'X' | 'Y' | 'Z'
type ArticleRow = {
  id: string
  article_code: string
  photo_url: string | null
  import_sheet: string | null
  import_row: number | null
}

const SHEETS: SheetName[] = ['X', 'Y', 'Z']
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_URL_ROWS = 3000

async function getAdminClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  return supabase
}

function validatePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

async function parseWorkbook(file: File): Promise<{ sheetRows: Map<SheetName, { row: number; rawUrl: string }[]>; error?: string }> {
  if (!(file instanceof File) || file.size <= 0) return { sheetRows: new Map(), error: 'Seleziona il file Excel aggiornato in formato .xlsx.' }
  if (!file.name.toLowerCase().endsWith('.xlsx')) return { sheetRows: new Map(), error: 'Formato non supportato: carica il file .xlsx, non CSV o .xls.' }
  if (file.size > MAX_FILE_BYTES) return { sheetRows: new Map(), error: 'Il file supera il limite di 10 MB.' }

  try {
    const rows = extractPhotoUrlsFromXlsx(Buffer.from(await file.arrayBuffer()))
    const count = [...rows.values()].reduce((sum, items) => sum + items.length, 0)
    if (count > MAX_URL_ROWS) return { sheetRows: new Map(), error: `Trovati oltre ${MAX_URL_ROWS} link. Suddividi l'importazione e riprova.` }
    return { sheetRows: rows }
  } catch (error) {
    return { sheetRows: new Map(), error: error instanceof Error ? error.message : 'Non riesco a leggere il file Excel. Verifica che sia un .xlsx valido e non protetto da password.' }
  }
}

async function fetchImportedArticles(supabase: Awaited<ReturnType<typeof createClient>>, sheetName: SheetName): Promise<{ rows: ArticleRow[]; error?: string }> {
  const rows: ArticleRow[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('articles')
      .select('id,article_code,photo_url,import_sheet,import_row')
      .eq('import_sheet', sheetName)
      .not('import_row', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) return { rows: [], error: `Lettura articoli della scheda ${sheetName} non riuscita: ${error.message}` }
    const batch = (data || []) as ArticleRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return { rows }
}

function rowKey(sheet: string, row: number): string {
  return `${sheet}:${row}`
}

async function buildPreview(file: File, supabase: Awaited<ReturnType<typeof createClient>>): Promise<PhotoSyncState> {
  const parsed = await parseWorkbook(file)
  if (parsed.error) return { stage: 'error', error: parsed.error }
  const articleMap = new Map<string, ArticleRow>()

  for (const sheetName of SHEETS) {
    const loaded = await fetchImportedArticles(supabase, sheetName)
    if (loaded.error) return { stage: 'error', error: loaded.error }
    for (const article of loaded.rows) {
      if (article.import_row != null) articleMap.set(rowKey(sheetName, Number(article.import_row)), article)
    }
  }

  const plan: PhotoImportItem[] = []
  const issueExamples: string[] = []
  let urlsFound = 0
  let validUrls = 0
  let invalidUrls = 0
  let dbMatches = 0
  let missingDatabaseRows = 0
  let existingPhotos = 0

  for (const sheetName of SHEETS) {
    for (const source of parsed.sheetRows.get(sheetName) || []) {
      urlsFound += 1
      const url = validatePhotoUrl(source.rawUrl)
      if (!url) {
        invalidUrls += 1
        if (issueExamples.length < 10) issueExamples.push(`${sheetName} riga ${source.row}: link non valido (usa un URL http:// o https://).`)
        continue
      }
      validUrls += 1
      const article = articleMap.get(rowKey(sheetName, source.row))
      if (!article) {
        missingDatabaseRows += 1
        if (issueExamples.length < 10) issueExamples.push(`${sheetName} riga ${source.row}: nessun articolo collegato a questa riga nel database.`)
        continue
      }
      dbMatches += 1
      const hadPhoto = Boolean(article.photo_url?.trim())
      if (hadPhoto) existingPhotos += 1
      plan.push({ sheet: sheetName, excelRow: source.row, articleId: article.id, articleCode: article.article_code, url, hadPhoto })
    }
  }

  const stats: PhotoPreviewStats = {
    urlsFound,
    validUrls,
    invalidUrls,
    dbMatches,
    missingDatabaseRows,
    existingPhotos,
    eligibleWithoutOverwrite: Math.max(0, dbMatches - existingPhotos),
    issueExamples,
  }
  return {
    stage: 'preview',
    message: urlsFound === 0 ? 'Nessun link trovato. Compila IMMAGINE_URL in almeno una riga e riprova.' : 'Anteprima pronta: non è stata ancora eseguita alcuna modifica al database.',
    plan,
    stats,
  }
}

export async function previewPhotoUrls(_previousState: PhotoSyncState, formData: FormData): Promise<PhotoSyncState> {
  const supabase = await getAdminClient()
  const file = formData.get('workbook')
  if (!(file instanceof File)) return { stage: 'error', error: 'Seleziona il file Excel .xlsx.' }
  return buildPreview(file, supabase)
}

export async function applyPhotoUrls(_previousState: PhotoSyncState, formData: FormData): Promise<PhotoSyncState> {
  const supabase = await getAdminClient()
  let plan: PhotoImportItem[]
  try {
    const rawPlan = String(formData.get('plan') || '')
    if (!rawPlan || rawPlan.length > 7_000_000) return { stage: 'error', error: 'Anteprima non valida o troppo grande. Ripeti l’anteprima.' }
    const decoded = JSON.parse(rawPlan)
    if (!Array.isArray(decoded) || decoded.length > MAX_URL_ROWS) return { stage: 'error', error: 'Elenco dei link non valido. Ripeti l’anteprima.' }
    plan = decoded.map((item: any) => {
      if (!item || !SHEETS.includes(item.sheet) || !Number.isInteger(item.excelRow) || item.excelRow < 1 || typeof item.articleId !== 'string' || typeof item.articleCode !== 'string') throw new Error('Elenco dei link non valido.')
      const url = validatePhotoUrl(item.url)
      if (!url) throw new Error(`URL non valido per ${item.articleCode || `${item.sheet} riga ${item.excelRow}`}.`)
      return { sheet: item.sheet, excelRow: item.excelRow, articleId: item.articleId, articleCode: item.articleCode, url, hadPhoto: Boolean(item.hadPhoto) } as PhotoImportItem
    })
  } catch (error) {
    return { stage: 'error', error: error instanceof Error ? error.message : 'Anteprima non valida. Ripeti l’anteprima.' }
  }

  if (plan.length === 0) return { stage: 'error', error: 'Non ci sono link validi e associabili da importare.' }
  const overwriteExisting = formData.get('overwrite_existing') === 'on'

  const articleMap = new Map<string, ArticleRow>()
  for (const sheetName of SHEETS) {
    const loaded = await fetchImportedArticles(supabase, sheetName)
    if (loaded.error) return { stage: 'error', error: loaded.error }
    for (const article of loaded.rows) {
      if (article.import_row != null) articleMap.set(rowKey(sheetName, Number(article.import_row)), article)
    }
  }

  const updates: { article: ArticleRow; url: string }[] = []
  let skippedExisting = 0
  let missingOrChanged = 0
  const seen = new Set<string>()
  for (const item of plan) {
    const key = rowKey(item.sheet, item.excelRow)
    if (seen.has(key)) { missingOrChanged += 1; continue }
    seen.add(key)
    const article = articleMap.get(key)
    if (!article || article.id !== item.articleId || article.article_code !== item.articleCode) {
      missingOrChanged += 1
      continue
    }
    if (article.photo_url?.trim() && !overwriteExisting) {
      skippedExisting += 1
      continue
    }
    updates.push({ article, url: item.url })
  }

  let updated = 0
  let failed = 0
  const failureExamples: string[] = []
  for (let index = 0; index < updates.length; index += 10) {
    const batch = updates.slice(index, index + 10)
    const results = await Promise.all(batch.map(async ({ article, url }) => {
      const { data, error } = await supabase
        .from('articles')
        .update({ photo_url: url })
        .eq('id', article.id)
        .eq('article_code', article.article_code)
        .select('id')
        .maybeSingle()
      return { article, data, error }
    }))
    for (const result of results) {
      if (result.error || !result.data) {
        failed += 1
        if (failureExamples.length < 10) failureExamples.push(`${result.article.article_code}: ${result.error?.message || 'nessuna riga aggiornata'}`)
      } else updated += 1
    }
  }

  revalidatePath('/admin/articoli/archivio')
  revalidatePath('/admin/immagini')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/ultimi-articoli')
  revalidatePath('/articoli')
  revalidatePath('/caselle')

  return {
    stage: 'applied',
    message: 'Sincronizzazione terminata. Puoi verificare le foto nell’Archivio articoli e nell’area utente.',
    result: { updated, skippedExisting, missingOrChanged, failed, failureExamples },
  }
}
