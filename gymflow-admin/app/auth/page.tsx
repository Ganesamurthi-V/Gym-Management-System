'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AuthPage() {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Fallback to reading from the DOM directly in case autofill didn't trigger onChange
    const form = e.currentTarget
    const inputElement = form.elements.namedItem('admin_password_field') as HTMLInputElement
    const finalPassword = password || (inputElement ? inputElement.value : '')

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: finalPassword }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Invalid credentials')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon-192.png" alt="GymFlow" width={48} height={48} className="mb-2 size-12 rounded-full" />
          <CardTitle className="text-xl">GymFlow Super Admin</CardTitle>
          <CardDescription>Restricted access. Enter the admin password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin_password_field">Admin Password</Label>
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'}
                  id="admin_password_field"
                  name="admin_password_field"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter admin secret"
                  className="pr-10"
                  required
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShow(s => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2"
                >
                  {show ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="animate-spin" /> : <Shield />}
              {loading ? 'Authenticating...' : 'Access Admin Panel'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
