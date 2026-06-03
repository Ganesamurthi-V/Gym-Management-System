'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Box, Tag, Image as ImageIcon, Package, Info, ImagePlus, ShieldAlert, BadgeIndianRupee, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface VariantForm {
  variantName: string
  sku: string
  costPrice: string
  sellingPrice: string
  memberPrice: string
  initialStock: string
  lowStockThreshold: string
}

export default function NewInventoryPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Shared Product State
  const [productDetails, setProductDetails] = useState({
    productName: '',
    brand: '',
    category: '',
    description: '',
  })

  // Variants State
  const [variants, setVariants] = useState<VariantForm[]>([{
    variantName: '',
    sku: '',
    costPrice: '',
    sellingPrice: '',
    memberPrice: '',
    initialStock: '',
    lowStockThreshold: ''
  }])

  function updateProduct(field: string, value: string) {
    setProductDetails(prev => ({ ...prev, [field]: value }))
  }

  function updateVariant(index: number, field: keyof VariantForm, value: string) {
    setVariants(prev => {
      const newVariants = [...prev]
      newVariants[index] = { ...newVariants[index], [field]: value }
      return newVariants
    })
  }

  function addVariant() {
    setVariants(prev => [...prev, {
      variantName: '',
      sku: '',
      costPrice: '',
      sellingPrice: '',
      memberPrice: '',
      initialStock: '',
      lowStockThreshold: ''
    }])
  }

  function removeVariant(index: number) {
    if (variants.length > 1) {
      setVariants(prev => prev.filter((_, i) => i !== index))
    }
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

      const rowsToInsert = variants.map(v => ({
        gym_id: gym.id,
        product_name: productDetails.productName,
        brand: productDetails.brand || null,
        category: productDetails.category || null,
        description: productDetails.description || null,
        variant_name: v.variantName,
        sku: v.sku || null,
        cost_price: parseFloat(v.costPrice),
        selling_price: parseFloat(v.sellingPrice),
        member_price: v.memberPrice ? parseFloat(v.memberPrice) : null,
        initial_stock: parseInt(v.initialStock, 10),
        low_stock_threshold: v.lowStockThreshold ? parseInt(v.lowStockThreshold, 10) : null
      }))

      const { error: insertError } = await supabase
        .from('inventory')
        .insert(rowsToInsert)

      if (insertError) throw insertError

      router.push('/inventory')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to save product')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Add New Product</h1>
          <p className="text-sm text-slate-400 mt-0.5">Create a product and its variants</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {/* 1. Shared Product Details */}
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
                value={productDetails.productName} 
                onChange={e => updateProduct('productName', e.target.value)}
                className="input-field" 
                placeholder="e.g., Nakpro Whey, ON Creatine" 
                required 
                autoFocus 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Brand</label>
                <input 
                  type="text" 
                  value={productDetails.brand} 
                  onChange={e => updateProduct('brand', e.target.value)}
                  className="input-field" 
                  placeholder="e.g., Optimum Nutrition, MuscleBlaze" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Category</label>
                <select 
                  value={productDetails.category} 
                  onChange={e => updateProduct('category', e.target.value)}
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
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Description (Shared)</label>
              <textarea 
                value={productDetails.description} 
                onChange={e => updateProduct('description', e.target.value)}
                className="input-field resize-none h-24" 
                placeholder="Product description that applies to all variants..." 
              />
            </div>
          </div>
        </div>

        {/* 2. Variants List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Variants</h2>
            <button
              type="button"
              onClick={addVariant}
              className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Variant
            </button>
          </div>

          {variants.map((variant, index) => (
            <div key={index} className="card overflow-hidden border-brand-100">
              <div className="px-5 py-3 border-b border-brand-100 bg-brand-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-xs">
                    {index + 1}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Variant Details</h3>
                </div>
                {variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVariant(index)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      Variant Name <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={variant.variantName} 
                      onChange={e => updateVariant(index, 'variantName', e.target.value)}
                      className="input-field" 
                      placeholder="e.g., 2kg Chocolate, XL Black" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      SKU / Product Code
                    </label>
                    <input 
                      type="text" 
                      value={variant.sku} 
                      onChange={e => updateVariant(index, 'sku', e.target.value.toUpperCase())}
                      className="input-field font-mono text-sm" 
                      placeholder="e.g., WP-2KG-CHOC" 
                    />
                  </div>
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
                        value={variant.costPrice} 
                        onChange={e => updateVariant(index, 'costPrice', e.target.value)}
                        className="input-field pl-8" 
                        placeholder="0.00" 
                        min="0"
                        step="0.01"
                        required 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      Selling Price <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                      <input 
                        type="number" 
                        value={variant.sellingPrice} 
                        onChange={e => updateVariant(index, 'sellingPrice', e.target.value)}
                        className="input-field pl-8" 
                        placeholder="0.00" 
                        min="0"
                        step="0.01"
                        required 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      Member Price
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                      <input 
                        type="number" 
                        value={variant.memberPrice} 
                        onChange={e => updateVariant(index, 'memberPrice', e.target.value)}
                        className="input-field pl-8" 
                        placeholder="0.00" 
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      Initial Stock <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="number" 
                      value={variant.initialStock} 
                      onChange={e => updateVariant(index, 'initialStock', e.target.value)}
                      className="input-field" 
                      placeholder="0" 
                      min="0"
                      required 
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      Low Stock Threshold
                    </label>
                    <input 
                      type="number" 
                      value={variant.lowStockThreshold} 
                      onChange={e => updateVariant(index, 'lowStockThreshold', e.target.value)}
                      className="input-field" 
                      placeholder="5" 
                      min="0"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Link href="/inventory" className="btn-secondary px-6">
            Cancel
          </Link>
          <button type="submit" disabled={loading} className="btn-primary px-8">
            {loading ? 'Saving...' : 'Save Product & Variants'}
          </button>
        </div>
      </form>
    </div>
  )
}
