type Props = { articleId: string; photoUrl: string | null }

/** Indicatore non interattivo: segnala che l’articolo ha una foto, già visibile nel popup dettagli. */
export default function ArticlePhotoButton({ articleId, photoUrl }: Props) {
  const hasPhoto = typeof photoUrl === 'string' && photoUrl.trim().length > 0
  if (!hasPhoto) return null

  return (
    <span
      className="image-preview-icon"
      title={`Foto presente per ${articleId}`}
      role="img"
      aria-label={`Foto presente per ${articleId}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3.5" y="4" width="17" height="16" rx="3" fill="none" stroke="#fffaf1" strokeWidth="1.5" />
        <circle cx="8.5" cy="9" r="1.7" fill="#fffaf1" />
        <path d="m5 17 4.8-5.4 3.2 3 2.2-2.3 3.8 4.7Z" fill="#fffaf1" />
      </svg>
    </span>
  )
}
