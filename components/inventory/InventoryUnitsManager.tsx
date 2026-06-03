'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Plus, Box, CheckCircle2, ShieldAlert, ShoppingCart, Loader2, Hash } from 'lucide-react'

interface InventoryUnit {
  id: string
  barcode: string
  status: string
  created_at: string
}

interface Props {
  productId: string
  initialUnits: InventoryUnit[]
  gymId: string
}

export default function InventoryUnitsManager({ productId, initialUnits, gymId }: Props) {
  const [units, setUnits] = useState<InventoryUnit[]>(initialUnits)
  const [actionMode, setActionMode] = useState<'add' | 'sell' | null>(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const supabase = createClient()
  const router = useRouter()

  const handleSubmitBarcode = async () => {
    const barcode = barcodeInput.trim()
    if (!barcode) return
    const currentMode = actionMode
    setActionMode(null)
    setBarcodeInput('')
    
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (currentMode === 'add') {
        // Check if already exists
        if (units.some(u => u.barcode === barcode)) {
          throw new Error('This barcode is already added to this product.')
        }

        // Insert new unit
        const { data: newUnit, error: insertError } = await supabase
          .from('inventory_units')
          .insert({
            gym_id: gymId,
            inventory_id: productId,
            barcode: barcode,
            status: 'available'
          })
          .select()
          .single()

        if (insertError) {
          if (insertError.code === '23505') throw new Error('This barcode is already registered in the system.')
          throw insertError
        }

        // Update overall stock count
        const { error: rpcError } = await supabase.rpc('increment_inventory_stock', { p_inventory_id: productId, amount: 1 })
        if (rpcError) {
          // Fallback if RPC doesn't exist
          const { data } = await supabase.from('inventory').select('initial_stock').eq('id', productId).single()
          if (data) {
            await supabase.from('inventory').update({ initial_stock: data.initial_stock + 1 }).eq('id', productId)
          }
        }

        setUnits(prev => [newUnit, ...prev])
        setSuccess(`Added unit with barcode: ${barcode}`)
        router.refresh()
      } 
      
      else if (currentMode === 'sell') {
        // Find available unit
        const unit = units.find(u => u.barcode === barcode)
        if (!unit) {
          throw new Error('Barcode not found in this product.')
        }
        if (unit.status !== 'available') {
          throw new Error(`This unit has already been marked as ${unit.status}.`)
        }

        // Update unit status to sold
        const { error: updateError } = await supabase
          .from('inventory_units')
          .update({ status: 'sold' })
          .eq('id', unit.id)

        if (updateError) throw updateError

        // Decrement overall stock count
        const { error: rpcError } = await supabase.rpc('increment_inventory_stock', { p_inventory_id: productId, amount: -1 })
        if (rpcError) {
          const { data } = await supabase.from('inventory').select('initial_stock').eq('id', productId).single()
          if (data) {
            await supabase.from('inventory').update({ initial_stock: Math.max(0, data.initial_stock - 1) }).eq('id', productId)
          }
        }

        setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, status: 'sold' } : u))
        setSuccess(`Successfully sold unit: ${barcode}`)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const availableUnits = units.filter(u => u.status === 'available')
  const soldUnits = units.filter(u => u.status === 'sold')

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Hash className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Serialized Units</h2>
            <p className="text-xs text-slate-500 font-medium">Track individual physical items</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActionMode('sell')}
            className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-200"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Sell Item
          </button>
          <button 
            onClick={() => setActionMode('add')}
            className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Unit
          </button>
        </div>
      </div>

      <div className="p-5">
        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          </div>
        )}

        {!loading && units.length === 0 && (
          <div className="text-center py-10 px-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Hash className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No serialized units</h3>
            <p className="text-xs text-slate-500 max-w-[250px] mx-auto">
              Enter individual barcodes to track each physical item of this product separately.
            </p>
          </div>
        )}

        {!loading && units.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm font-semibold text-slate-500 mb-2">
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> {availableUnits.length} Available</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-300" /> {soldUnits.length} Sold</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1 pb-1">
              {units.map((unit) => (
                <div 
                  key={unit.id} 
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    unit.status === 'available' 
                      ? 'bg-white border-slate-200 shadow-sm' 
                      : 'bg-slate-50 border-slate-100 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      unit.status === 'available' ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-400'
                    }`}>
                      <Hash className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className={`text-sm font-mono font-bold truncate ${unit.status === 'sold' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                        {unit.barcode}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                        Added {format(new Date(unit.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 pl-2">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${
                      unit.status === 'available' 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {unit.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {actionMode && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-900">
              {actionMode === 'add' ? 'Add Unit Barcode' : 'Sell Unit by Barcode'}
            </h3>
            <input
              type="text"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmitBarcode()}
              className="input-field font-mono text-sm"
              placeholder="Enter barcode..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setActionMode(null); setBarcodeInput('') }}
                className="btn-secondary py-1.5 px-4 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitBarcode}
                className="btn-primary py-1.5 px-4 text-xs"
              >
                {actionMode === 'add' ? 'Add' : 'Sell'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
