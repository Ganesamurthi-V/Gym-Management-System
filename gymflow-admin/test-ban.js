import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function testBan() {
  const email = 'testban@example.com'
  const password = 'Password123'
  
  // Create user
  const { data: { user }, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
  
  if (createErr) console.log('Create err:', createErr)
  
  // Ban user
  const { error: banErr } = await adminClient.auth.admin.updateUserById(user.id, {
    ban_duration: "87600h"
  })
  
  if (banErr) console.log('Ban err:', banErr)
  
  // Try login
  const publicClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { error: loginErr } = await publicClient.auth.signInWithPassword({ email, password })
  
  console.log('Login error message:', loginErr?.message)
  
  // Cleanup
  await adminClient.auth.admin.deleteUser(user.id)
}

testBan()
