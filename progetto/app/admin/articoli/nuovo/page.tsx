import { redirect } from 'next/navigation'
import { requirePageContext } from '../../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function NewArticleDisabledPage() {
  await requirePageContext('AMMINISTRATORE')
  redirect('/admin/articoli/archivio')
}
