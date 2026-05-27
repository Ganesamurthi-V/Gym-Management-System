'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Box, Tag, Image as ImageIcon, Package, Info, ImagePlus, ShieldAlert, BadgeIndianRupee, ScanBarcode } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import BarcodeScannerModal from '@/components/inventory/BarcodeScannerModal'

export default function NewInventoryPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isScannerOpen, setIsScannerOpen] = useState(false)

  // Form State
  const [form, setForm] = useState({
    productName: '',
    brand: '',
    category: '',
    sku: '',
    description: '',
    
    variantName: '',
    costPrice: '',
    sellingPrice: '',
    memberPrice: '',
    
    initialStock: '',
    lowStockThreshold: ''
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
      if (!gym) throw new Error('Gym not found')

      const { error: insertError } = await supabase
        .from('inventory')
        .insert({
          gym_id: gym.id,
          product_name: form.productName,
          brand: form.brand || null,
          category: form.category || null,
          sku: form.sku || null,
          description: form.description || null,
          variant_name: form.variantName,
          cost_price: parseFloat(form.costPrice),
          selling_price: parseFloat(form.sellingPrice),
          member_price: form.memberPrice ? parseFloat(form.memberPrice) : null,
          initial_stock: parseInt(form.initialStock, 10),
          low_stock_threshold: form.lowStockThreshold ? parseInt(form.lowStockThreshold, 10) : null
        })

      if (insertError) throw insertError

      router.push('/inventory')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to save product')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Add New Product</h1>
          <p className="text-sm text-slate-400 mt-0.5">Add a new item to your inventory</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {/* 1. Product Details */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <Package className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Product Details</h2>
          </div>
          
          <div className="p-5 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                value={form.productName} 
                onChange={e => update('productName', e.target.value)}
                className="input-field" 
                placeholder="e.g., Whey Protein, Creatine" 
                required 
                autoFocus 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Brand</label>
                <input 
                  type="text" 
                  value={form.brand} 
                  onChange={e => update('brand', e.target.value)}
                  className="input-field" 
                  placeholder="e.g., Optimum Nutrition, MuscleBlaze" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Category</label>
                <select 
                  value={form.category} 
                  onChange={e => update('category', e.target.value)}
                  className="input-field"
                >
                  <option value="">Select category...</option>
                  <option value="supplements">Supplements</option>
                  <option value="apparel">Apparel</option>
                  <option value="accessories">Accessories</option>
                  <option value="equipment">Equipment</option>
                  <option value="beverages">Beverages</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">SKU / Product Code</label>
                <button 
                  type="button" 
                  onClick={() => setIsScannerOpen(true)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded-lg transition-colors uppercase tracking-wider"
                >
                  <ScanBarcode className="w-3.5 h-3.5" />
                  Scan
                </button>
              </div>
              <input 
                type="text" 
                value={form.sku} 
                onChange={e => update('sku', e.target.value.toUpperCase())}
                className="input-field font-mono text-sm" 
                placeholder="e.g., WP-2KG-CHOC or scan barcode" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Description</label>
              <textarea 
                value={form.description} 
                onChange={e => update('description', e.target.value)}
                className="input-field resize-none h-24" 
                placeholder="Product description..." 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Product Images</label>
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 hover:border-brand-300 transition-colors cursor-pointer group">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                  <ImagePlus className="w-6 h-6 text-slate-400 group-hover:text-brand-500" />
                </div>
                <p className="text-sm font-bold text-brand-600">Click to upload product images</p>
                <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP up to 2MB • 0/1 images</p>
                
                <div className="mt-4 pt-4 border-t border-slate-100 w-full">
                  <p className="text-xs text-slate-500">No images uploaded yet. Add product images to help customers identify products.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Variant & Pricing */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
              <BadgeIndianRupee className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Variant & Pricing</h2>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Variant Name <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                value={form.variantName} 
                onChange={e => update('variantName', e.target.value)}
                className="input-field" 
                placeholder="e.g., 2kg Chocolate, 500g Vanilla" 
                required 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Cost Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                  <input 
                    type="number" 
                    value={form.costPrice} 
                    onChange={e => update('costPrice', e.target.value)}
                    className="input-field pl-8" 
                    placeholder="0.00" 
                    min="0"
                    step="0.01"
                    required 
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Purchase price</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Selling Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                  <input 
                    type="number" 
                    value={form.sellingPrice} 
                    onChange={e => update('sellingPrice', e.target.value)}
                    className="input-field pl-8" 
                    placeholder="0.00" 
                    min="0"
                    step="0.01"
                    required 
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Retail price</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Member Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                  <input 
                    type="number" 
                    value={form.memberPrice} 
                    onChange={e => update('memberPrice', e.target.value)}
                    className="input-field pl-8" 
                    placeholder="0.00" 
                    min="0"
                    step="0.01"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Discounted price for members</p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Stock Information */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
              <Box className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Stock Information</h2>
          </div>

          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Initial Stock Quantity <span className="text-red-500">*</span>
              </label>
              <input 
                type="number" 
                value={form.initialStock} 
                onChange={e => update('initialStock', e.target.value)}
                className="input-field" 
                placeholder="0" 
                min="0"
                required 
              />
              <p className="text-[10px] text-slate-400 mt-1">Number of units currently available</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Low Stock Alert Threshold
              </label>
              <div className="relative">
                <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  value={form.lowStockThreshold} 
                  onChange={e => update('lowStockThreshold', e.target.value)}
                  className="input-field pl-9" 
                  placeholder="5" 
                  min="0"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Notify when stock drops below this</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Link href="/dashboard" className="btn-secondary px-6">
            Cancel
          </Link>
          <button type="submit" disabled={loading} className="btn-primary px-8">
            {loading ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </form>

      {isScannerOpen && (
        <BarcodeScannerModal 
          onScan={(decodedText) => {
            update('sku', decodedText.toUpperCase())
            setIsScannerOpen(false)
          }}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
    </div>
  )
}
