'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useEffect, useRef } from 'react'
import { Search, Filter } from 'lucide-react'

export default function InventoryFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialQuery = searchParams.get('query') || ''
  const initialCategory = searchParams.get('category') || ''

  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState(initialCategory)

  // Use refs to avoid stale closures in the debounced effect
  const categoryRef = useRef(category)
  categoryRef.current = category

  const updateUrl = useCallback((q: string, c: string) => {
    const params = new URLSearchParams()
    if (q) params.set('query', q)
    if (c) params.set('category', c)
    const qs = params.toString()
    router.push(qs ? `/owner/inventory?${qs}` : '/owner/inventory')
  }, [router])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      updateUrl(query, categoryRef.current)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, updateUrl])

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCat = e.target.value
    setCategory(newCat)
    updateUrl(query, newCat)
  }

  return (
    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
      <div className="relative flex-1 w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, SKUs..."
          className="input-field pl-9 w-full bg-white shadow-sm"
        />
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div className="relative flex-1 sm:w-48">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={category}
            onChange={handleCategoryChange}
            className="input-field pl-9 bg-white shadow-sm appearance-none"
          >
            <option value="">All Categories</option>
            <option value="supplements">Supplements</option>
            <option value="apparel">Apparel</option>
            <option value="accessories">Accessories</option>
            <option value="equipment">Equipment</option>
            <option value="beverages">Beverages</option>
          </select>
        </div>
      </div>
    </div>
  )
}
