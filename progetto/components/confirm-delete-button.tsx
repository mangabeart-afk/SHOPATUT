'use client'

import type { ReactNode } from 'react'

type ConfirmDeleteButtonProps = {
  action: (formData: FormData) => void | Promise<void>
  className?: string
  message: string
  children?: ReactNode
}

/** Client-side confirmation button that invokes the provided Server Action. */
export default function ConfirmDeleteButton({
  action,
  className,
  message,
  children = 'Cancella',
}: ConfirmDeleteButtonProps) {
  return (
    <button
      type="submit"
      formAction={action}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
