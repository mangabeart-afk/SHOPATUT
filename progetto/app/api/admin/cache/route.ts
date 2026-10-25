import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { getAllCustomerSheets, getLatestExcelWorkbook, getWorkbookArticles } from '../../../../lib/excel-source'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

/** Compatibility endpoint for the former admin cache; its business payload now comes only from Excel staging. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Sessione non valida.' }, 401)
  const { data: profile, error } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (error) return json({ error: 'Impossibile verificare i permessi.' }, 500)
  if (profile?.role !== 'AMMINISTRATORE') return json({ error: 'Accesso riservato all’amministratore.' }, 403)

  const url = new URL(request.url)
  if (url.searchParams.get('verify') === '1') return json({ authorized: true, userId: user.id })

  try {
    const workbook = await getLatestExcelWorkbook()
    const customers = getAllCustomerSheets(workbook).map((customer) => ({
      id: customer.code,
      customer_code: customer.code,
      first_name: customer.name,
      last_name: '',
      updated_at: workbook.completedAt,
    }))
    const articles = getWorkbookArticles(workbook).map((article) => ({
      id: article.id,
      article_code: article.codeLabel,
      series: article.series || null,
      detail: article.detail || null,
      notes: article.itemKey || null,
      origin: article.origin || null,
      status: article.status || null,
      quantity_purchased: article.quantity,
      deleted_at: null,
      updated_at: workbook.completedAt,
      import_sheet: article.sheet,
      import_row: article.excelRow,
      photo_url: article.photoUrl,
    }))
    return json({
      authorized: true,
      userId: user.id,
      mode: 'excel-staging-snapshot',
      generatedAt: new Date().toISOString(),
      workbookRunId: workbook.runId,
      workbookSha256: workbook.workbookSha256,
      workbookCompletedAt: workbook.completedAt,
      customers,
      articles,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lettura workbook non riuscita.'
    return json({ error: message }, 503)
  }
}
