'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { invalidateInventoryCache, invalidateInventoryItemCache } from '@/app/inventory/actions'
import { format } from 'date-fns'
import {
  Package, Pencil, Trash2, ShoppingCart, X, Loader2,
  CheckCircle2, ShieldAlert, BadgeIndianRupee, Box, Tag, ArrowLeft, Clock
} from 'lucide-react'
import Link from 'next/link'

interface InventoryProduct {
  id: string
  gym_id: string
  product_name: string
  brand: string | null
  category: string | null
  sku: string | null
  description: string | null
  variant_name: string
  cost_price: number
  selling_price: number
  member_price: number | null
  initial_stock: number
  low_stock_threshold: number | null
  created_at: string
  updated_at: string
}

interface InventorySale {
  id: string
  product_name: string
  variant_name: string
  quantity: number
  unit_price: number
  total_price: number
  payment_mode: string
  sold_at: string
}

interface Props {
  product: InventoryProduct
  gymId: string
  sales: InventorySale[]
  siblings: Partial<InventoryProduct>[]
}

export default function InventoryDetailClient({ product: initialProduct, gymId, sales, siblings }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [product, setProduct] = useState(initialProduct)

  // Sync product when prop changes from router.refresh()
  useEffect(() => {
    setProduct(initialProduct)
  }, [initialProduct])

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAddVariantModal, setShowAddVariantModal] = useState(false)
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null)

  // Action states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Edit form
  const [editForm, setEditForm] = useState({
    product_name: product.product_name,
    brand: product.brand || '',
    category: product.category || '',
    sku: product.sku || '',
    description: product.description || '',
    variant_name: product.variant_name,
    cost_price: String(product.cost_price),
    selling_price: String(product.selling_price),
    member_price: product.member_price ? String(product.member_price) : '',
    initial_stock: String(product.initial_stock),
    low_stock_threshold: product.low_stock_threshold ? String(product.low_stock_threshold) : '',
  })

  // Add Variant form
  const [addVariantForm, setAddVariantForm] = useState({
    variant_name: '',
    sku: '',
    cost_price: '',
    selling_price: '',
    member_price: '',
    initial_stock: '',
    low_stock_threshold: ''
  })

  // Sell form
  const [sellQty, setSellQty] = useState('1')
  const [sellUnitPrice, setSellUnitPrice] = useState(String(product.selling_price))
  const [sellPaymentMode, setSellPaymentMode] = useState('cash')

  // --- Handlers ---

  const handleEdit = async () => {
    setLoading(true)
    setError('')
    try {
      const { error: updateError } = await supabase
        .from('inventory')
        .update({
          product_name: editForm.product_name,
          brand: editForm.brand || null,
          category: editForm.category || null,
          sku: editForm.sku || null,
          description: editForm.description || null,
          variant_name: editForm.variant_name,
          cost_price: parseFloat(editForm.cost_price),
          selling_price: parseFloat(editForm.selling_price),
          member_price: editForm.member_price ? parseFloat(editForm.member_price) : null,
          initial_stock: parseInt(editForm.initial_stock, 10),
          low_stock_threshold: editForm.low_stock_threshold ? parseInt(editForm.low_stock_threshold, 10) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id)

      if (updateError) throw updateError

      setProduct(prev => ({
        ...prev,
        product_name: editForm.product_name,
        brand: editForm.brand || null,
        category: editForm.category || null,
        sku: editForm.sku || null,
        description: editForm.description || null,
        variant_name: editForm.variant_name,
        cost_price: parseFloat(editForm.cost_price),
        selling_price: parseFloat(editForm.selling_price),
        member_price: editForm.member_price ? parseFloat(editForm.member_price) : null,
        initial_stock: parseInt(editForm.initial_stock, 10),
        low_stock_threshold: editForm.low_stock_threshold ? parseInt(editForm.low_stock_threshold, 10) : null,
      }))

      setShowEditModal(false)
      setSuccess('Product updated successfully')
      await invalidateInventoryItemCache(gymId, product.id)
      router.refresh()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update')
    } finally {
      setLoading(false)
    }
  }

  const handleSell = async () => {
    const qty = parseInt(sellQty, 10)
    const unitPrice = parseFloat(sellUnitPrice)
    if (!qty || qty < 1 || isNaN(unitPrice) || unitPrice < 0) return

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/inventory/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryId: product.id,
          quantity: qty,
          unitPrice: unitPrice,
          paymentMode: sellPaymentMode,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setProduct(prev => ({ ...prev, initial_stock: data.remaining_stock }))
      setShowSellModal(false)
      setSellQty('1')
      setSuccess(`Sold ${qty} unit${qty > 1 ? 's' : ''} — ₹${data.sale.total_price}`)
      await invalidateInventoryItemCache(gymId, product.id)
      router.refresh()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message || 'Failed to sell')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/inventory/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId: product.id }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      await invalidateInventoryCache(gymId)
      router.push('/inventory')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to delete')
      setLoading(false)
    }
  }

  const handleDeleteSale = async (saleId: string) => {
    if (!confirm('Are you sure you want to delete this sale? The stock will be restored.')) return
    
    setDeletingSaleId(saleId)
    setError('')
    try {
      const res = await fetch(`/api/inventory/sales/${saleId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setSuccess(`Sale deleted and ${data.restoredQuantity} units restored to stock.`)
      setTimeout(() => setSuccess(''), 4000)
      await invalidateInventoryItemCache(gymId, product.id)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to delete sale')
    } finally {
      setDeletingSaleId(null)
    }
  }

  const handleAddVariant = async () => {
    setLoading(true)
    setError('')
    try {
      const { error: insertError } = await supabase
        .from('inventory')
        .insert({
          gym_id: gymId,
          product_name: product.product_name,
          brand: product.brand,
          category: product.category,
          description: product.description,
          variant_name: addVariantForm.variant_name,
          sku: addVariantForm.sku || null,
          cost_price: parseFloat(addVariantForm.cost_price),
          selling_price: parseFloat(addVariantForm.selling_price),
          member_price: addVariantForm.member_price ? parseFloat(addVariantForm.member_price) : null,
          initial_stock: parseInt(addVariantForm.initial_stock, 10),
          low_stock_threshold: addVariantForm.low_stock_threshold ? parseInt(addVariantForm.low_stock_threshold, 10) : null
        })

      if (insertError) throw insertError

      setShowAddVariantModal(false)
      setAddVariantForm({
        variant_name: '', sku: '', cost_price: '', selling_price: '', member_price: '', initial_stock: '', low_stock_threshold: ''
      })
      setSuccess('Variant added successfully')
      await invalidateInventoryCache(gymId)
      router.refresh()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to add variant')
    } finally {
      setLoading(false)
    }
  }

  const totalSalesRevenue = sales.reduce((s, sale) => s + Number(sale.total_price), 0)
  const totalUnitsSold = sales.reduce((s, sale) => s + sale.quantity, 0)

  return (
    <div className="w-full flex flex-col gap-4 pb-4 xs:pb-2">
      {/* Header */}
      <div className="flex-none flex flex-col xs:flex-row xs:items-center justify-between gap-3">
        <div className="flex items-center gap-2 xs:gap-3">
          <Link href="/inventory" className="w-8 h-8 xs:w-9 xs:h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all flex-shrink-0">
            <ArrowLeft className="w-4 h-4 xs:w-5 xs:h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg xs:text-xl md:text-2xl font-bold text-slate-900 truncate">{product.product_name}</h1>
            <p className="text-xs xs:text-sm text-slate-500 mt-0.5 truncate">{product.variant_name} {product.sku ? `• ${product.sku}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowEditModal(true)}
            className="btn-secondary py-2 px-3 xs:px-4 text-xs flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={() => setShowSellModal(true)}
            disabled={product.initial_stock === 0}
            className="btn-primary py-2 px-3 xs:px-4 text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Sell Stock</span>
            <span className="xs:hidden">Sell</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-8 h-8 xs:w-9 xs:h-9 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 border border-slate-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4 xs:gap-6">
        {/* Left Col: Product Details */}
        <div className="md:col-span-1 flex flex-col gap-4 min-h-0">
          {/* Sales Summary Card */}
          <div className="card p-5 space-y-3 bg-gradient-to-br from-emerald-50/50 to-white border-emerald-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sales Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-emerald-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Revenue</p>
                <p className="text-lg font-bold text-emerald-600">₹{totalSalesRevenue.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-emerald-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Units Sold</p>
                <p className="text-lg font-bold text-slate-900">{totalUnitsSold}</p>
              </div>
            </div>
          </div>

          {/* Variants Card */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Variants</h3>
              <button 
                onClick={() => setShowAddVariantModal(true)}
                className="text-[10px] font-bold uppercase tracking-widest text-brand-600 bg-brand-50 hover:bg-brand-100 py-1.5 px-2.5 rounded-lg transition-colors flex items-center gap-1"
              >
                + Add Variant
              </button>
            </div>
            <div className="space-y-2">
              {siblings.map(sib => (
                <Link 
                  key={sib.id} 
                  href={`/inventory/${sib.id}`}
                  className={`block p-3 rounded-xl border transition-all ${sib.id === product.id ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-brand-200 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-bold ${sib.id === product.id ? 'text-brand-900' : 'text-slate-700'}`}>
                      {sib.variant_name}
                    </p>
                    <p className="text-xs font-bold text-slate-500">₹{sib.selling_price}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                     <span className={`text-[10px] font-bold uppercase ${sib.initial_stock === 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                       {sib.initial_stock} in stock
                     </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-2">
              <Package className="w-6 h-6" />
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Category</p>
              <p className="text-sm font-semibold text-slate-900 capitalize">{product.category || 'N/A'}</p>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Brand</p>
              <p className="text-sm font-semibold text-slate-900">{product.brand || 'N/A'}</p>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Selling Price</p>
              <p className="text-lg font-bold text-brand-600">₹{product.selling_price}</p>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cost Price</p>
              <p className="text-sm font-semibold text-slate-600">₹{product.cost_price}</p>
            </div>

            {product.member_price && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Member Price</p>
                <p className="text-sm font-semibold text-indigo-600">₹{product.member_price}</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Stock</p>
              <div className="flex items-center gap-2">
                <Box className={`w-4 h-4 ${product.initial_stock === 0 ? 'text-red-500' : product.initial_stock <= (product.low_stock_threshold || 5) ? 'text-amber-500' : 'text-emerald-500'}`} />
                <p className="text-lg font-bold text-slate-900">{product.initial_stock} units</p>
              </div>
              {product.initial_stock === 0 && (
                <p className="text-xs text-red-500 font-semibold mt-1">Out of stock</p>
              )}
            </div>

            {product.description && (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Description</p>
                <p className="text-sm text-slate-600">{product.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Sales History */}
        <div className="md:col-span-2 xl:col-span-3 flex flex-col min-h-0 h-full">
          <div className="card flex flex-col h-full overflow-hidden">
            <div className="flex-none px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Sales History</h2>
                <p className="text-xs text-slate-500 font-medium">{sales.length} transaction{sales.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {sales.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <ShoppingCart className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">No sales yet</h3>
                <p className="text-xs text-slate-500 max-w-[250px] mx-auto">
                  Sell stock to start tracking revenue for this product.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm shadow-sm z-10">
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Qty</th>
                      <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Unit Price</th>
                      <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Total</th>
                      <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mode</th>
                      <th className="px-5 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sales.map(sale => (
                      <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3 text-sm text-slate-600 font-medium">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {format(new Date(sale.sold_at), 'dd MMM yyyy, h:mm a')}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{sale.quantity}</td>
                        <td className="px-5 py-3 text-sm text-slate-600 text-right">₹{Number(sale.unit_price).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right">₹{Number(sale.total_price).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${
                            sale.payment_mode === 'cash' ? 'bg-green-50 text-green-600' :
                            sale.payment_mode === 'upi' ? 'bg-blue-50 text-blue-600' :
                            'bg-purple-50 text-purple-600'
                          }`}>
                            {sale.payment_mode}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => handleDeleteSale(sale.id)}
                            disabled={deletingSaleId === sale.id}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Delete Sale"
                          >
                            {deletingSaleId === sale.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ EDIT MODAL ============ */}
      {showEditModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-900">Edit Product</h3>
              <button onClick={() => setShowEditModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Product Name *</label>
                <input
                  type="text"
                  value={editForm.product_name}
                  onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Brand</label>
                  <input
                    type="text"
                    value={editForm.brand}
                    onChange={e => setEditForm(f => ({ ...f, brand: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Category</label>
                  <select
                    value={editForm.category}
                    onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">Select...</option>
                    <option value="supplements">Supplements</option>
                    <option value="apparel">Apparel</option>
                    <option value="accessories">Accessories</option>
                    <option value="equipment">Equipment</option>
                    <option value="beverages">Beverages</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">SKU</label>
                  <input
                    type="text"
                    value={editForm.sku}
                    onChange={e => setEditForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                    className="input-field font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Variant *</label>
                  <input
                    type="text"
                    value={editForm.variant_name}
                    onChange={e => setEditForm(f => ({ ...f, variant_name: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Cost Price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                    <input
                      type="number"
                      value={editForm.cost_price}
                      onChange={e => setEditForm(f => ({ ...f, cost_price: e.target.value }))}
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Selling Price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                    <input
                      type="number"
                      value={editForm.selling_price}
                      onChange={e => setEditForm(f => ({ ...f, selling_price: e.target.value }))}
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Member Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                    <input
                      type="number"
                      value={editForm.member_price}
                      onChange={e => setEditForm(f => ({ ...f, member_price: e.target.value }))}
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Current Stock *</label>
                  <input
                    type="number"
                    value={editForm.initial_stock}
                    onChange={e => setEditForm(f => ({ ...f, initial_stock: e.target.value }))}
                    className="input-field"
                    min="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Low Stock Alert</label>
                  <input
                    type="number"
                    value={editForm.low_stock_threshold}
                    onChange={e => setEditForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                    className="input-field"
                    min="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="input-field resize-none h-20"
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={() => setShowEditModal(false)} className="btn-secondary py-2 px-4 text-xs">Cancel</button>
              <button
                onClick={handleEdit}
                disabled={loading || !editForm.product_name || !editForm.variant_name}
                className="btn-primary py-2 px-6 text-xs flex items-center gap-1.5"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ SELL MODAL ============ */}
      {showSellModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Sell Stock</h3>
              <button onClick={() => setShowSellModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Product</p>
                <p className="text-sm font-bold text-slate-900">{product.product_name} — {product.variant_name}</p>
                <p className="text-xs text-slate-500 mt-1">Available: <span className="font-bold">{product.initial_stock} units</span> • ₹{product.selling_price}/unit</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Quantity</label>
                  <input
                    type="number"
                    value={sellQty}
                    onChange={e => setSellQty(e.target.value)}
                    className="input-field"
                    min="1"
                    max={String(product.initial_stock)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Unit Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                    <input
                      type="number"
                      value={sellUnitPrice}
                      onChange={e => setSellUnitPrice(e.target.value)}
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'upi', 'card'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSellPaymentMode(mode)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
                        sellPaymentMode === mode
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {parseInt(sellQty) > 0 && !isNaN(parseFloat(sellUnitPrice)) && (
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center justify-between">
                  <p className="text-xs font-bold text-emerald-700">Total Amount</p>
                  <p className="text-sm font-black text-emerald-700">
                    ₹{(parseInt(sellQty) * parseFloat(sellUnitPrice)).toLocaleString('en-IN')}
                  </p>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setShowSellModal(false)} className="btn-secondary py-2 px-4 text-xs">Cancel</button>
              <button
                onClick={handleSell}
                disabled={loading || parseInt(sellQty) < 1 || parseInt(sellQty) > product.initial_stock || isNaN(parseFloat(sellUnitPrice)) || parseFloat(sellUnitPrice) < 0}
                className="btn-primary py-2 px-6 text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                Confirm Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ DELETE CONFIRM ============ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete Product?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  This will permanently remove <span className="font-bold text-slate-700">{product.product_name}</span> and all its serialized units. Sales records will be preserved.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary py-2 px-5 text-sm">Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="py-2 px-5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ ADD VARIANT MODAL ============ */}
      {showAddVariantModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-900">Add Variant for {product.product_name}</h3>
              <button onClick={() => setShowAddVariantModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Variant Name *</label>
                  <input
                    type="text"
                    value={addVariantForm.variant_name}
                    onChange={e => setAddVariantForm(f => ({ ...f, variant_name: e.target.value }))}
                    className="input-field"
                    placeholder="e.g. 5kg Vanilla"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">SKU</label>
                  <input
                    type="text"
                    value={addVariantForm.sku}
                    onChange={e => setAddVariantForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                    className="input-field font-mono text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Cost Price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                    <input
                      type="number"
                      value={addVariantForm.cost_price}
                      onChange={e => setAddVariantForm(f => ({ ...f, cost_price: e.target.value }))}
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Selling Price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                    <input
                      type="number"
                      value={addVariantForm.selling_price}
                      onChange={e => setAddVariantForm(f => ({ ...f, selling_price: e.target.value }))}
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Member Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                    <input
                      type="number"
                      value={addVariantForm.member_price}
                      onChange={e => setAddVariantForm(f => ({ ...f, member_price: e.target.value }))}
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Current Stock *</label>
                  <input
                    type="number"
                    value={addVariantForm.initial_stock}
                    onChange={e => setAddVariantForm(f => ({ ...f, initial_stock: e.target.value }))}
                    className="input-field"
                    min="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Low Stock Alert</label>
                  <input
                    type="number"
                    value={addVariantForm.low_stock_threshold}
                    onChange={e => setAddVariantForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                    className="input-field"
                    min="0"
                  />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={() => setShowAddVariantModal(false)} className="btn-secondary py-2 px-4 text-xs">Cancel</button>
              <button
                onClick={handleAddVariant}
                disabled={loading || !addVariantForm.variant_name || !addVariantForm.cost_price || !addVariantForm.selling_price || !addVariantForm.initial_stock}
                className="btn-primary py-2 px-6 text-xs flex items-center gap-1.5"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Add Variant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
