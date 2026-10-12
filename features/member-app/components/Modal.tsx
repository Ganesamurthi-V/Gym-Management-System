'use client'

/**
 * features/member-app/components/Modal.tsx
 *
 * Dialog shell for the Member App editors. A bottom sheet on phones (thumb
 * reach, and the keyboard pushes the fields up instead of covering a centred
 * card) and a centred card from `sm` up.
 *
 * Accessibility handled here so each editor does not re-implement it:
 * labelled `role="dialog"`, focus moved in on open and restored on close, Tab
 * kept inside, Escape and scrim tap to close, page scroll locked behind it.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  busy = false,
}: {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
  /** Action row pinned under the scrolling body (Cancel / Save). */
  footer?: React.ReactNode
  /** While a save is in flight the dialog cannot be dismissed, so the result is not lost. */
  busy?: boolean
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Portal target only exists on the client. Same reason as SupportTicketModal:
  // a `position: fixed` overlay under a sticky/blurred ancestor resolves against
  // that ancestor, so it is portalled to <body> to cover the viewport.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Read through refs so the listeners below are attached once, not on every
  // parent re-render (the parent re-renders on each keystroke in a form).
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)
  onCloseRef.current = onClose
  busyRef.current = busy

  useEffect(() => {
    if (!mounted) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (busyRef.current) return
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => el.offsetParent !== null,
      )
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !dialog.contains(active) || active === dialog

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [mounted])

  // Focus the dialog itself, not its first input: focusing an input would open
  // the on-screen keyboard before the owner has read the sheet.
  //
  // Re-run when the title changes: an editor that swaps its content for a
  // second step (list -> "Add bonus rule") keeps this same dialog mounted, and
  // the button that was focused is gone, which would drop focus to <body> and
  // leave a screen reader with no announcement of the new step.
  useEffect(() => {
    if (mounted) dialogRef.current?.focus()
  }, [mounted, title])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm sm:p-4"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        className="bg-surface w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl border border-surface-border flex flex-col max-h-[92dvh] sm:max-h-[88vh] focus:outline-none"
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-surface-border">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-slate-900">
              {title}
            </h3>
            {description && (
              <p id={descriptionId} className="text-sm text-slate-500 mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="w-9 h-9 -mr-1.5 -mt-1 flex flex-shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Only the body scrolls, so the title and the Save row stay on screen
            when the keyboard shrinks the viewport. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-shrink-0 items-center justify-end gap-2 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-surface-border">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─── Form primitives shared by the editors ───────────────────────────────────

/**
 * 16px text on phones: iOS Safari zooms the page when a focused input's font is
 * smaller than that, which throws the sheet off-screen.
 */
export const inputClass =
  'w-full px-3 py-2.5 bg-surface border border-surface-border rounded-xl text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all aria-[invalid=true]:border-red-400'

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  /** The control. Give it `id`, and `aria-describedby={fieldDescribedBy(id, hint, error)}`. */
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-slate-500 mt-1">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-600 mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

/** The id of whichever helper line `Field` is currently rendering under the control. */
export function fieldDescribedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

export function PrimaryButton({
  children,
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={busy || props.disabled}
      className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors disabled:opacity-60"
    >
      {busy ? 'Saving...' : children}
    </button>
  )
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl border border-surface-border bg-surface text-sm font-semibold text-slate-700 hover:bg-surface-secondary transition-colors disabled:opacity-60"
    />
  )
}
