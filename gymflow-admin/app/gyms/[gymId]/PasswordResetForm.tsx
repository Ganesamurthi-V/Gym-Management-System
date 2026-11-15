'use client'

import { useState } from 'react'
import { KeyRound, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function PasswordResetForm({ userId }: { userId: string }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!password || password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    setSuccess(false)
    try {
      const res = await fetch(`/api/gyms/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update password')
      }

      setSuccess(true)
      setPassword('')
      toast.success('Password updated successfully')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <form onSubmit={handleReset} className="contents">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            Reset Account Password
          </CardTitle>
          <CardDescription>
            This will immediately change the gym owner&apos;s password. They will be logged out of active sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="new-password">New Password</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new secure password"
              required
              minLength={8}
            />
            <Button type="submit" disabled={loading || !password} className="sm:min-w-36">
              {loading ? <Loader2 className="animate-spin" /> : success ? <Check /> : <KeyRound />}
              {loading ? 'Saving...' : success ? 'Updated' : 'Update Password'}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}
