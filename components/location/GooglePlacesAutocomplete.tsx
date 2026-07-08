'use client'

/**
 * components/location/GooglePlacesAutocomplete.tsx
 * ──────────────────────────────────────────────────
 * Hybrid area input:
 *   1. User types → Google Places suggestions appear
 *   2. User selects → locality extracted from Google response
 *   3. Locality sent to existing gymflow normalizer pipeline
 *   4. Canonical area returned and stored
 *
 * RULES:
 * - Only used for interactive UI (add/edit member forms)
 * - CSV/Excel imports NEVER use this component
 * - Existing normalizer remains the canonical source of truth
 * - Falls back to manual text input if Google API is unavailable
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader2, X, AlertCircle } from 'lucide-react'
import { extractGoogleAddress } from '@/utils/location/extractGoogleAddress'
import { normalizeGooglePlace } from '@/services/location/normalizeGooglePlace'
import type { NormalizedPlaceResult } from '@/services/location/normalizeGooglePlace'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Suggestion {
  place_id: string
  description: string
  structured_formatting: {
    main_text: string
    secondary_text: string
  }
}

interface Props {
  value: string
  onChange: (value: string, normalized?: NormalizedPlaceResult) => void
  gymId?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Called when user clears the field */
  onClear?: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300
const MIN_CHARS   = 3
const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

// ── Component ─────────────────────────────────────────────────────────────────

export default function GooglePlacesAutocomplete({
  value,
  onChange,
  gymId,
  placeholder = 'Type to search area...',
  className = '',
  disabled = false,
  onClear,
}: Props) {
  const [inputValue, setInputValue]       = useState(value)
  const [suggestions, setSuggestions]     = useState<Suggestion[]>([])
  const [loading, setLoading]             = useState(false)
  const [normalizing, setNormalizing]     = useState(false)
  const [open, setOpen]                   = useState(false)
  const [activeIdx, setActiveIdx]         = useState(-1)
  const [confirmed, setConfirmed]         = useState(!!value)
  const [apiReady, setApiReady]           = useState(false)
  const [apiError, setApiError]           = useState(false)

  const debounceTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef   = useRef<HTMLDivElement>(null)
  const suggestionsRef = useRef<HTMLUListElement>(null)
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesService       = useRef<google.maps.places.PlacesService | null>(null)
  const sessionToken        = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  // ── Load Google Maps JS API ────────────────────────────────────────────────
  useEffect(() => {
    if (!MAPS_API_KEY) { setApiError(true); return }
    if (typeof window === 'undefined') return

    async function loadAPI() {
      try {
        // If already loaded by a previous mount, reuse it
        if (window.google?.maps?.places?.AutocompleteService) {
          autocompleteService.current = new google.maps.places.AutocompleteService()
          const div = document.createElement('div')
          placesService.current = new google.maps.places.PlacesService(div)
          sessionToken.current  = new google.maps.places.AutocompleteSessionToken()
          setApiReady(true)
          return
        }

        // Inject the Maps JS script tag directly — most reliable cross-version approach
        await new Promise<void>((resolve, reject) => {
          // Avoid duplicate script tags
          if (document.querySelector(`script[src*="maps.googleapis.com"]`)) {
            resolve()
            return
          }
          const s = document.createElement('script')
          s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places&loading=async`
          s.async = true
          s.defer = true
          s.onload = () => resolve()
          s.onerror = () => reject(new Error('Script load failed'))
          document.head.appendChild(s)
        })

        // Wait for google.maps to be available
        let attempts = 0
        while (!window.google?.maps?.places?.AutocompleteService && attempts < 20) {
          await new Promise(r => setTimeout(r, 100))
          attempts++
        }

        if (!window.google?.maps?.places?.AutocompleteService) {
          throw new Error('Places API not available after load')
        }

        autocompleteService.current = new google.maps.places.AutocompleteService()
        const div = document.createElement('div')
        placesService.current = new google.maps.places.PlacesService(div)
        sessionToken.current  = new google.maps.places.AutocompleteSessionToken()
        setApiReady(true)
      } catch (err) {
        console.warn('[GooglePlacesAutocomplete] API load failed:', err)
        setApiError(true)
      }
    }

    loadAPI()
  }, [])

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIdx(-1)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // ── Wheel isolation on suggestions list ──────────────────────────────────
  // Non-passive native wheel listener so preventDefault actually works.
  // When cursor is inside the list → scrolls the list.
  // When list hits top/bottom → lets the page scroll normally.
  useEffect(() => {
    const el = suggestionsRef.current
    if (!el || !open) return

    // Non-passive wheel listener — prevents page scroll when inside the list
    const target = el
    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = target
      const atTop    = scrollTop === 0 && e.deltaY < 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0
      if (!atTop && !atBottom) e.preventDefault()
    }
    target.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      target.removeEventListener('wheel', onWheel)
    }
  }, [open, suggestions.length])

  // ── Fetch suggestions (debounced) ─────────────────────────────────────────
  const fetchSuggestions = useCallback((query: string) => {
    if (!autocompleteService.current || query.length < MIN_CHARS) {
      setSuggestions([])
      setOpen(false)
      return
    }

    setLoading(true)
    autocompleteService.current.getPlacePredictions(
      {
        input: query,
        sessionToken: sessionToken.current ?? undefined,
        componentRestrictions: { country: 'in' }, // India only
        types: ['(regions)'],
      },
      (predictions, status) => {
        setLoading(false)
        if (
          status === google.maps.places.PlacesServiceStatus.OK &&
          predictions
        ) {
          setSuggestions(predictions as unknown as Suggestion[])
          setOpen(true)
          setActiveIdx(-1)
        } else {
          setSuggestions([])
          setOpen(false)
        }
      }
    )
  }, [])

  // ── Handle input change ────────────────────────────────────────────────────
  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setInputValue(val)
    setConfirmed(false)
    onChange(val) // pass raw value up immediately

    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    if (!apiReady || apiError) {
      // Fallback: use existing searchLocalities from gymflow
      return
    }

    if (val.length >= MIN_CHARS) {
      debounceTimer.current = setTimeout(() => fetchSuggestions(val), DEBOUNCE_MS)
    } else {
      setSuggestions([])
      setOpen(false)
    }
  }

  // ── Handle suggestion selection ────────────────────────────────────────────
  async function handleSelect(suggestion: Suggestion) {
    setOpen(false)
    setSuggestions([])
    setInputValue(suggestion.structured_formatting.main_text)
    setNormalizing(true)

    try {
      // Fetch full place details
      placesService.current!.getDetails(
        {
          placeId: suggestion.place_id,
          fields: ['address_components', 'formatted_address', 'geometry', 'place_id'],
          sessionToken: sessionToken.current ?? undefined,
        },
        async (place, status) => {
          // Refresh session token after each complete session
          sessionToken.current = new google.maps.places.AutocompleteSessionToken()

          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            // Fallback: use the description text directly
            setInputValue(suggestion.description)
            onChange(suggestion.description)
            setNormalizing(false)
            setConfirmed(true)
            return
          }

          // Extract structured address
          const googleAddr = extractGoogleAddress(place)

          // Run through existing gymflow normalizer pipeline
          const normalized = await normalizeGooglePlace(googleAddr, gymId)

          // Update input to show canonical area
          const displayValue = normalized.canonical_area || googleAddr.locality || suggestion.description
          setInputValue(displayValue)
          setConfirmed(true)
          setNormalizing(false)

          // Pass both the display value and full normalized result up
          onChange(displayValue, normalized)
        }
      )
    } catch {
      setInputValue(suggestion.description)
      onChange(suggestion.description)
      setNormalizing(false)
      setConfirmed(true)
    }
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  function handleClear() {
    setInputValue('')
    setConfirmed(false)
    setSuggestions([])
    setOpen(false)
    onChange('')
    onClear?.()
  }

  // ── Confidence color ───────────────────────────────────────────────────────
  const confidenceColor = (score: number, matchedBy: string) => {
    if (matchedBy === 'unresolved' || score === 0) return 'text-red-500'
    if (score >= 0.90) return 'text-emerald-600'
    if (score >= 0.70) return 'text-amber-500'
    return 'text-orange-500'
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          disabled={disabled || normalizing}
          placeholder={normalizing ? 'Normalizing area...' : placeholder}
          autoComplete="off"
          className={`input-field pl-9 pr-8 ${
            confirmed && inputValue ? 'border-emerald-400 focus:ring-emerald-400' :
            inputValue && !confirmed ? 'border-amber-400 focus:ring-amber-400' : ''
          } ${className}`}
        />

        {/* Right side: loading / clear */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {(loading || normalizing) ? (
            <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
          ) : inputValue ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* API error fallback notice */}
      {apiError && inputValue && (
        <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
          <AlertCircle className="w-3 h-3" />
          Google Places unavailable — using local search
        </p>
      )}

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          ref={suggestionsRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
          style={{ maxHeight: '224px', overflowY: 'hidden' }}
        >
          <div> {/* suggestions list wrapper */}
          {suggestions.map((s, i) => (
            <li
              key={s.place_id}
              onMouseDown={() => handleSelect(s)}
              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                i === activeIdx ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50'
              }`}
            >
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {s.structured_formatting.main_text}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {s.structured_formatting.secondary_text}
                </p>
              </div>
            </li>
          ))}
          <li className="px-4 py-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
              <span>Powered by</span>
              <span className="font-semibold text-slate-500">Google</span>
              <span>· normalized by gymflow</span>
            </p>
          </li>
          </div> {/* end suggestions list wrapper */}
        </ul>
      )}
    </div>
  )
}
