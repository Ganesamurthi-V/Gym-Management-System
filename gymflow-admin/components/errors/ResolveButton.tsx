'use client'

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { resolveErrorAction } from '@/app/errors/actions'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export default function ResolveButton({ issueId }: { issueId: string }) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const handleResolve = async () => {
    setLoading(true)
    const res = await resolveErrorAction(issueId)
    if (!res.success) {
      toast.error('Failed to resolve error: ' + res.error)
      setLoading(false)
      setOpen(false)
    }
    // If successful, the server action calls revalidatePath,
    // so Next.js will automatically refetch the page and remove the item.
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" disabled={loading} title="Resolve/Delete Error" aria-label="Resolve error">
          {loading ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resolve this error?</AlertDialogTitle>
          <AlertDialogDescription>It will be marked as resolved in Sentry and removed from this list.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault()
              handleResolve()
            }}
          >
            Resolve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
