'use client'

import { useState, type FormEvent } from 'react'

type Props = {
  action: (formData: FormData) => void | Promise<void>
  customerId: string
  customerName: string
  compact?: boolean
}

export default function CustomerDeleteButton({ action, customerId, customerName, compact = false }: Props) {
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submitting) {
      event.preventDefault()
      return
    }

    const first = window.confirm(
      `Stai per cancellare definitivamente il profilo cliente ${customerName}.\n\nQuesta operazione non può essere annullata. Vuoi continuare?`
    )
    if (!first) {
      event.preventDefault()
      return
    }

    const second = window.confirm(
      `SECONDA CONFERMA\n\nVerranno cancellati il profilo cliente, la casella e, se collegato, l'account di accesso.\n\nConfermi definitivamente la cancellazione di ${customerName}?`
    )
    if (!second) {
      event.preventDefault()
      return
    }

    setSubmitting(true)
  }

  return (
    <form action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="customer_id" value={customerId} />
      <button type="submit" className="danger-button" disabled={submitting}>
        {submitting ? 'Cancellazione…' : compact ? 'Cancella' : 'Cancella cliente'}
      </button>
    </form>
  )
}
