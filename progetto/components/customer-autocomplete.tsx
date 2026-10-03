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

  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  const query = normalize(internal)
  const filtered = useMemo(() => {
    const source = query
      ? options.filter((option) => {
          const haystack = normalize(`${option.code || ''} ${option.name || ''} ${option.email || ''}`)
          return haystack.includes(query)
        })
      : options
    return [...source].sort((a, b) => {
      const codeA = normalize(a.code || '')
      const codeB = normalize(b.code || '')
      const nameA = normalize(a.name || '')
      const nameB = normalize(b.name || '')
      const scoreA = query && (codeA.startsWith(query) || nameA.startsWith(query)) ? 0 : 1
      const scoreB = query && (codeB.startsWith(query) || nameB.startsWith(query)) ? 0 : 1
      if (scoreA !== scoreB) return scoreA - scoreB
      return codeA.localeCompare(codeB, 'it', { numeric: true })
    })
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
      {open && (
        <div className="customer-autocomplete-menu" role="listbox">
          {filtered.length === 0 ? (
            <div className="customer-autocomplete-empty">Nessun risultato</div>
          ) : filtered.map((option) => (
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
