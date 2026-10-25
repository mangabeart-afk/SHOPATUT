'use client'

import { useRef, useState } from 'react'
import ViewportConfirmDialog from './viewport-confirm-dialog'

type Props = {
  action: (formData: FormData) => void | Promise<void>
  customerId: string
  customerName: string
  compact?: boolean
}

export default function CustomerDeleteButton({ action, customerId, customerName, compact = false }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const submitDeletion = () => {
    const submitter = buttonRef.current
    setConfirmStep(0)
    setSubmitting(true)
    if (submitter?.form) submitter.form.requestSubmit(submitter)
    else setSubmitting(false)
  }

  return (
    <form action={action}>
      <input type="hidden" name="customer_id" value={customerId} />
      <button
        ref={buttonRef}
        type="submit"
        className="danger-button"
        disabled={submitting}
        onClick={(event) => {
          event.preventDefault()
          if (!submitting) setConfirmStep(1)
        }}
      >
        {submitting ? 'Cancellazione…' : compact ? 'Cancella' : 'Cancella utente'}
      </button>
      {confirmStep === 1 && (
        <ViewportConfirmDialog
          title="Conferma cancellazione utente"
          message={`Stai per cancellare definitivamente il profilo utente ${customerName}.\n\nQuesta operazione non può essere annullata. Vuoi continuare?`}
          confirmLabel="Continua"
          destructive
          onCancel={() => setConfirmStep(0)}
          onConfirm={() => setConfirmStep(2)}
        />
      )}
      {confirmStep === 2 && (
        <ViewportConfirmDialog
          title="Seconda conferma richiesta"
          message={`Verranno cancellati il profilo utente, la casella e, se collegato, l'account di accesso.\n\nConfermi definitivamente la cancellazione di ${customerName}?`}
          confirmLabel="Cancella definitivamente"
          destructive
          onCancel={() => setConfirmStep(0)}
          onConfirm={submitDeletion}
        />
      )}
    </form>
  )
}
