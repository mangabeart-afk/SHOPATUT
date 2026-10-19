import { redirect } from 'next/navigation'

// La vista paginata dei 120 articoli è stata annullata; la galleria resta nella dashboard.
export default function RecentPhotoArticlesPage() {
  redirect('/dashboard')
}
