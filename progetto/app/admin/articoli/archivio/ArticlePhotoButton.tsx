type Props = { articleId: string; photoUrl: string | null; onOpen?: () => void }

export default function ArticlePhotoButton({ articleId, photoUrl }: Props) {
  const hasPhoto = Boolean(photoUrl?.trim())
  if (!hasPhoto) return null

  return (
    <span
      className="image-preview-icon"
      title={`Foto disponibile per ${articleId}`}
      aria-label={`Foto disponibile per ${articleId}`}
      role="img"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="8.5" cy="9" r="1.5" fill="currentColor" />
        <path d="m4.5 17 5-5 3.2 3 2.5-2.5 4.3 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
