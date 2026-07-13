import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()
    const validPassword = process.env.ADMIN_PASSWORD 
    
    if (password !== validPassword) {
      return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 })
    }
    
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
