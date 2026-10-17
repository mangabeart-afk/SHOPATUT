'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Option = {
  id: string
  code: string
  name?: string
  // Email and notes may be supplied by legacy callers, but are not part of search identity or result display.
  email?: string | null
  disabled?: boolean
  note?: string
}

type MenuPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
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
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setInternal(value), [value])

  const updateMenuPosition = useCallback(() => {
    const input = inputRef.current
    if (!input || typeof window === 'undefined') return

    const rect = input.getBoundingClientRect()
    const margin = 8
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - margin)
    const spaceAbove = Math.max(0, rect.top - margin)
    const openAbove = spaceBelow < 170 && spaceAbove > spaceBelow
    const availableSpace = openAbove ? spaceAbove : spaceBelow
    const maxHeight = Math.max(60, Math.min(260, availableSpace - 8))
    const width = Math.max(120, Math.min(rect.width, window.innerWidth - margin * 2))
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
    const top = openAbove
      ? Math.max(margin, rect.top - Math.min(260, availableSpace - 8) - 4)
      : rect.bottom + 4

    setMenuPosition({ top, left, width, maxHeight })
  }, [])

  useEffect(() => {
    if (!open) return

    updateMenuPosition()
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const reposition = () => updateMenuPosition()

    document.addEventListener('pointerdown', closeIfOutside)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, updateMenuPosition])

  const normalize = (text: string) => text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  const query = normalize(internal)
  const filtered = useMemo(() => {
    const source = query
      ? options.filter((option) => {
          const haystack = normalize([option.code, option.name].filter(Boolean).join(' '))
          return haystack.includes(query)
        })
      : options

    return [...source].sort((a, b) => {
      const codeA = normalize(a.code || '')
      const codeB = normalize(b.code || '')
      const nameA = normalize(a.name || '')
      const nameB = normalize(b.name || '')
      const fieldsA = [a.code, a.name].map((v) => normalize(v || ''))
      const fieldsB = [b.code, b.name].map((v) => normalize(v || ''))
      const scoreA = query && fieldsA.some((field) => field.startsWith(query)) ? 0 : 1
      const scoreB = query && fieldsB.some((field) => field.startsWith(query)) ? 0 : 1
      if (scoreA !== scoreB) return scoreA - scoreB
      return codeA.localeCompare(codeB, 'it', { numeric: true })
    })
  }, [options, query])

  const setValue = (next: string) => {
    setInternal(next)
    onChange?.(next)
  }

  const openMenu = () => {
    setOpen(true)
    updateMenuPosition()
  }

  const menu = open && menuPosition && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={menuRef}
          className="customer-autocomplete-menu"
          role="listbox"
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            right: 'auto',
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            zIndex: 10000,
            overflowY: 'auto',
          }}
        >
          {filtered.length === 0 ? (
            <div className="customer-autocomplete-empty">Nessun risultato</div>
          ) : filtered.map((option) => (
            <button
              type="button"
              className="customer-autocomplete-option"
              key={option.id || `${option.code}-${option.name || ''}`}
              disabled={option.disabled}
              style={option.disabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (option.disabled) return
                setValue(option.code)
                onSelect?.(option)
                setOpen(false)
              }}
            >
              <strong>{option.code?.trim() || '—'}</strong>
              <span>{option.name || 'Cliente'}</span>
            </button>
          ))}
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={ref} className={`customer-autocomplete ${className || ''}`}>
      <input
        ref={inputRef}
        name={name}
        value={internal}
        onChange={(event) => {
          setValue(event.target.value)
          openMenu()
        }}
        onFocus={openMenu}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          if (event.key === 'Enter') onEnter?.()
        }}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {menu}
    </div>
  )
}
