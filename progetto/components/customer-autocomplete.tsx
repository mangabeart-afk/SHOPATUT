'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Option = {
  id: string
  code: string
  name?: string
  email?: string | null
}

type Props = {
  options: Option[]
  value?: string
  onChange?: (value: string) => void
  onSelect?: (option: Option) => void
  name?: string
  placeholder?: string
  required?: boolean
  className?: string
  onEnter?: () => void
}

export default function CustomerAutocomplete({
  options,
  value = '',
  onChange,
  onSelect,
  name,
  placeholder = 'Digita codice, nome o cognome...',
  required,
  className,
  onEnter,
}: Props) {
  const [internal, setInternal] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setInternal(value), [value])
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const query = internal.trim().toLowerCase()
  const filtered = useMemo(() => {
    const source = query
      ? options.filter((option) => `${option.code} ${option.name || ''} ${option.email || ''}`.toLowerCase().includes(query))
      : options
    return [...source].sort((a, b) => a.code.localeCompare(b.code, 'it', { numeric: true }))
  }, [options, query])

  const setValue = (next: string) => {
    setInternal(next)
    onChange?.(next)
  }

  return (
    <div ref={ref} className={`customer-autocomplete ${className || ''}`}>
      <input
        name={name}
        value={internal}
        onChange={(event) => { setValue(event.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); if (event.key === 'Enter') onEnter?.() }}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      {open && filtered.length > 0 && (
        <div className="customer-autocomplete-menu" role="listbox">
          {filtered.map((option) => (
            <button
              type="button"
              className="customer-autocomplete-option"
              key={option.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(option.code)
                onSelect?.(option)
                setOpen(false)
              }}
            >
              <strong>{option.code?.trim() || '—'}</strong>
              <span>{option.name || 'Cliente'}{option.email ? ` · ${option.email}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
