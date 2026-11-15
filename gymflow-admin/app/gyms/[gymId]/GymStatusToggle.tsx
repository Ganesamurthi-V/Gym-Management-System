'use client'

import { useState } from 'react'
import { Ban, CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from './_components/ConfirmDialog'

export default function GymStatusToggle({ gymId, isActive, gymName }: { gymId: string, isActive: boolean, gymName: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    const action = isActive ? 'deactivate' : 'activate'
    setLoading(true)
    try {
      const res = await fetch(`/api/gyms/toggle-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gymId, isActive: !isActive }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Failed to ${action} gym`)
      }

      toast.success(`Gym ${action}d successfully`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="text-destructive size-4" />
          Danger Zone
        </CardTitle>
        <CardDescription>
          {isActive
            ? "Deactivating the gym will block the owner from logging in and instantly terminate all active sessions."
            : "Activating the gym will restore the owner's access and allow them to log in again."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConfirmDialog
          trigger={
            <Button variant={isActive ? 'destructive' : 'outline'} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : isActive ? <Ban /> : <CheckCircle />}
              {loading ? 'Processing...' : isActive ? 'Deactivate Gym' : 'Activate Gym'}
            </Button>
          }
          title={isActive ? 'Deactivate Gym' : 'Activate Gym'}
          description={
            <>
              Are you sure you want to {isActive ? 'deactivate' : 'activate'} <strong className="text-foreground">{gymName}</strong>?
              {isActive && ' This will immediately log the owner out of all active sessions and block them from logging in.'}
            </>
          }
          confirmLabel={`Yes, ${isActive ? 'Deactivate' : 'Activate'}`}
          destructive={isActive}
          onConfirm={handleToggle}
        />
      </CardContent>
    </Card>
  )
}
