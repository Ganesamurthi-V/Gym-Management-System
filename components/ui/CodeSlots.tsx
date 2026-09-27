'use client'

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'

/**
 * CodeSlots — a segmented numeric OTP input (React Bits "code-slots" style).
 *
 * Renders `length` individual digit boxes with auto-advance, backspace-to-previous,
 * full-code paste, and numeric-only entry. Controlled: the parent owns `value`
 * (a string of up to `length` digits) and receives updates via `onChange`.
 * `onComplete` fires once all slots are filled.
 */
type Props = {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  length?: number
  disabled?: boolean
  autoFocus?: boolean
}

export function CodeSlots({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = true,
}: Props) {
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  function focusSlot(index: number) {
    const el = inputs.current[Math.max(0, Math.min(length - 1, index))]
    el?.focus()
    el?.select()
  }

  function commit(next: string) {
    const cleaned = next.replace(/\D/g, '').slice(0, length)
    onChange(cleaned)
    if (cleaned.length === length) onComplete?.(cleaned)
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '')
    if (!digit) return

    // Support typing/pasting multiple digits starting at this slot.
    const chars = digit.split('')
    const arr = value.split('')
    let cursor = index
    for (const ch of chars) {
      if (cursor >= length) break
      arr[cursor] = ch
      cursor++
    }
    commit(arr.join(''))
    focusSlot(cursor)
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const arr = value.split('')
      if (arr[index]) {
        // Clear the current slot in place.
        arr[index] = ''
        commit(arr.join(''))
      } else if (index > 0) {
        // Already empty — clear and step back to the previous slot.
        arr[index - 1] = ''
        commit(arr.join(''))
        focusSlot(index - 1)
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusSlot(index - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusSlot(index + 1)
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    commit(pasted)
    focusSlot(pasted.length)
  }

  return (
    <div className="flex items-center justify-center gap-2" role="group" aria-label="Verification code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => { inputs.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className={`w-11 h-14 text-center text-xl font-bold rounded-xl border bg-surface text-slate-900
            transition-all outline-none
            ${digit ? 'border-brand-500' : 'border-slate-200'}
            focus:border-brand-600 focus:ring-2 focus:ring-brand-500/30
            disabled:opacity-50 disabled:cursor-not-allowed`}
        />
      ))}
    </div>
  )
}
