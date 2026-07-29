'use client'

/**
 * features/member-app/hooks/useMemberAppFilters.ts
 *
 * Reusable client-side filtering for the module's tables. Kept generic so the
 * invitation, activity and portal tables share one implementation.
 */

import { useCallback, useMemo, useState } from 'react'

export interface TableFilterState<TStatus extends string> {
  search: string
  setSearch: (value: string) => void
  statuses: TStatus[]
  toggleStatus: (value: TStatus) => void
  from: string
  setFrom: (value: string) => void
  to: string
  setTo: (value: string) => void
  reset: () => void
  /** True when any filter is narrowing the result set. */
  isFiltered: boolean
}

export function useTableFilters<TStatus extends string>(): TableFilterState<TStatus> {
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<TStatus[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const toggleStatus = useCallback((value: TStatus) => {
    setStatuses(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value],
    )
  }, [])

  const reset = useCallback(() => {
    setSearch('')
    setStatuses([])
    setFrom('')
    setTo('')
  }, [])

  const isFiltered = search.trim() !== '' || statuses.length > 0 || from !== '' || to !== ''

  return { search, setSearch, statuses, toggleStatus, from, setFrom, to, setTo, reset, isFiltered }
}

/**
 * Applies search + status + date-range filtering to a row list.
 *
 * An empty `statuses` array means "all statuses", matching the chip-row UX
 * where nothing selected is the unfiltered default.
 */
export function useFilteredRows<TRow, TStatus extends string>(
  rows: TRow[],
  filters: Pick<TableFilterState<TStatus>, 'search' | 'statuses' | 'from' | 'to'>,
  accessors: {
    searchText: (row: TRow) => string
    status?: (row: TRow) => TStatus
    date?: (row: TRow) => string | null
  },
): TRow[] {
  const { search, statuses, from, to } = filters
  const { searchText, status, date } = accessors

  return useMemo(() => {
    const query = search.trim().toLowerCase()
    // Inclusive upper bound: a `to` of 2026-05-01 must match events during that day.
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null
    const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : null

    return rows.filter(row => {
      if (query && !searchText(row).toLowerCase().includes(query)) return false
      if (statuses.length > 0 && status && !statuses.includes(status(row))) return false

      if ((fromTime !== null || toTime !== null) && date) {
        const raw = date(row)
        if (!raw) return false
        const time = new Date(raw).getTime()
        if (Number.isNaN(time)) return false
        if (fromTime !== null && time < fromTime) return false
        if (toTime !== null && time > toTime) return false
      }

      return true
    })
  }, [rows, search, statuses, from, to, searchText, status, date])
}

/** Checkbox selection state for bulk actions. */
export function useRowSelection<TId extends string>(allIds: TId[]) {
  const [selected, setSelected] = useState<TId[]>([])

  const toggle = useCallback((id: TId) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }, [])

  const clear = useCallback(() => setSelected([]), [])

  // Only ids still present in the current view stay selected, so a filter change
  // cannot silently submit a bulk action against hidden rows.
  const visibleSelected = useMemo(
    () => selected.filter(id => allIds.includes(id)),
    [selected, allIds],
  )

  const allVisibleSelected = allIds.length > 0 && visibleSelected.length === allIds.length

  const toggleAll = useCallback(() => {
    setSelected(prev => (allIds.every(id => prev.includes(id)) ? [] : allIds))
  }, [allIds])

  return {
    selected: visibleSelected,
    isSelected: (id: TId) => visibleSelected.includes(id),
    toggle,
    toggleAll,
    allVisibleSelected,
    clear,
    count: visibleSelected.length,
  }
}
