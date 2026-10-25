'use client'

import { useRef, useState, type ReactNode } from 'react'
import ViewportConfirmDialog from './viewport-confirm-dialog'

type ConfirmDeleteButtonProps = {
  action: (formData: FormData) => void | Promise<void>
  className?: string
  message: string
  children?: ReactNode
}

/** Submit button that uses a site-owned viewport confirmation instead of a browser dialog. */
export default function ConfirmDeleteButton({
  action,
  className,
  message,
  children = 'Cancella',
}: ConfirmDeleteButtonProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const submitConfirmedAction = () => {
    const submitter = buttonRef.current
    setOpen(false)
    if (submitter?.form) submitter.form.requestSubmit(submitter)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="submit"
        formAction={action}
        className={className}
        onClick={(event) => {
          event.preventDefault()
          setOpen(true)
        }}
      >
        {children}
      </button>
      {open && (
        <ViewportConfirmDialog
          title="Conferma eliminazione"
          message={message}
          confirmLabel={typeof children === 'string' ? children : 'Conferma'}
          destructive
          onCancel={() => setOpen(false)}
          onConfirm={submitConfirmedAction}
        />
      )}
    </>
  )
}
