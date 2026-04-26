'use client'

import { useState, useRef, useTransition } from 'react'
import { searchSubjects, type SubjectSearchResult } from '@/lib/subjects/search'

type Props = {
  name: string
  label: string
  hint?: string
  defaultValue?: SubjectSearchResult
  required?: boolean
}

export function SubjectPicker({ name, label, hint, defaultValue, required }: Props) {
  const [query, setQuery] = useState(defaultValue?.displayName ?? '')
  const [results, setResults] = useState<SubjectSearchResult[]>([])
  const [selected, setSelected] = useState<SubjectSearchResult | null>(defaultValue ?? null)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQuery(value)
    setSelected(null)
    setOpen(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.length >= 2) {
      debounceRef.current = setTimeout(() => {
        startTransition(async () => {
          const found = await searchSubjects(value)
          setResults(found)
        })
      }, 200)
    } else {
      setResults([])
    }
  }

  function handleSelect(result: SubjectSearchResult) {
    setSelected(result)
    setQuery(result.displayName)
    setResults([])
    setOpen(false)
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => {
            if (results.length > 0 && !selected) setOpen(true)
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Type name or IČO…"
          autoComplete="off"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 pr-8 disabled:bg-gray-50"
        />
        {selected && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear selection"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 leading-none"
          >
            ✕
          </button>
        )}
        {/* Hidden input carries the selected UUID for form submission */}
        <input
          type="hidden"
          name={name}
          value={selected?.id ?? ''}
        />

        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-sm max-h-52 overflow-y-auto">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(r)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex justify-between gap-3"
                >
                  <span className="truncate">{r.displayName}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {r.type === 'COMPANY' && r.registrationNumber
                      ? r.registrationNumber
                      : r.type}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isPending && <p className="mt-1 text-xs text-gray-400">Searching…</p>}

      {selected && (
        <p className="mt-1 text-xs text-gray-500">
          <span className="font-medium">{selected.displayName}</span>
          {selected.type === 'COMPANY' && selected.registrationNumber && (
            <> · IČO {selected.registrationNumber}</>
          )}
        </p>
      )}

      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
