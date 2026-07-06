/**
 * WhatsApp Setup Verification Script
 * 
 * Verifies that all WhatsApp webhook components are properly configured.
 * Run before deploying to production.
 * 
 * Usage:
 *   npx tsx scripts/verify-whatsapp-setup.ts
 */

import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════════
// Environment Checks
// ═══════════════════════════════════════════════════════════════════════════

interface CheckResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
}

const results: CheckResult[] = []

function addResult(name: string, status: 'pass' | 'fail' | 'warning', message: string) {
  results.push({ name, status, message })
}

// ═══════════════════════════════════════════════════════════════════════════
// Check Functions
// ═══════════════════════════════════════════════════════════════════════════

function checkVerifyToken(): void {
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  
  if (!token) {
    addResult('Verify Token', 'fail', 'WHATSAPP_VERIFY_TOKEN not set')
    return
  }
  
  if (token.length < 32) {
    addResult('Verify Token', 'warning', `Token is ${token.length} chars (recommended: 32+)`)
    return
  }
  
  if (token === 'your_whatsapp_webhook_verify_token_min_32_chars') {
    addResult('Verify Token', 'fail', 'Using example token - generate a real token')
    return
  }
  
  addResult('Verify Token', 'pass', `Set (${token.length} characters)`)
}

function checkAppSecret(): void {
  const secret = process.env.WHATSAPP_APP_SECRET
  
  if (!secret) {
    addResult('App Secret', 'fail', 'WHATSAPP_APP_SECRET not set')
    return
  }
  
  if (secret.length < 32) {
    addResult('App Secret', 'warning', `Secret is ${secret.length} chars (recommended: 32+)`)
    return
  }
  
  if (secret === 'your_whatsapp_app_secret_from_meta_dashboard') {
    addResult('App Secret', 'fail', 'Using example secret - get real secret from Meta')
    return
  }
  
  addResult('App Secret', 'pass', `Set (${secret.length} characters)`)
}

function checkPhoneNumberId(): void {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  
  if (!phoneNumberId) {
    addResult('Phone Number ID', 'fail', 'WHATSAPP_PHONE_NUMBER_ID not set')
    return
  }
  
  if (phoneNumberId === 'your_whatsapp_business_phone_number_id') {
    addResult('Phone Number ID', 'fail', 'Using example ID - get real ID from Meta')
    return
  }
  
  if (!/^\d+$/.test(phoneNumberId)) {
    addResult('Phone Number ID', 'warning', 'Should be numeric only')
    return
  }
  
  addResult('Phone Number ID', 'pass', phoneNumberId)
}

function checkAccessToken(): void {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  
  if (!token) {
    addResult('Access Token', 'fail', 'WHATSAPP_ACCESS_TOKEN not set')
    return
  }
  
  if (token === 'your_whatsapp_access_token') {
    addResult('Access Token', 'fail', 'Using example token - get real token from Meta')
    return
  }
  
  if (!token.startsWith('EAA') && !token.startsWith('EAAG')) {
    addResult('Access Token', 'warning', 'Token format looks unusual (should start with EAA)')
    return
  }
  
  addResult('Access Token', 'pass', `Set (${token.slice(0, 10)}...***REDACTED***)`)
}

function checkSupabase(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url) {
    addResult('Supabase URL', 'fail', 'NEXT_PUBLIC_SUPABASE_URL not set')
  } else if (!url.includes('supabase')) {
    addResult('Supabase URL', 'warning', 'URL format looks unusual')
  } else {
    addResult('Supabase URL', 'pass', url)
  }
  
  if (!serviceKey) {
    addResult('Supabase Service Key', 'fail', 'SUPABASE_SERVICE_ROLE_KEY not set')
  } else if (serviceKey.length < 100) {
    addResult('Supabase Service Key', 'warning', 'Service key looks too short')
  } else {
    addResult('Supabase Service Key', 'pass', `Set (${serviceKey.slice(0, 10)}...***REDACTED***)`)
  }
}

function checkRedis(): void {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url) {
    addResult('Redis URL', 'fail', 'UPSTASH_REDIS_REST_URL not set')
  } else if (!url.startsWith('https://')) {
    addResult('Redis URL', 'warning', 'Should be HTTPS URL')
  } else {
    addResult('Redis URL', 'pass', url)
  }
  
  if (!token) {
    addResult('Redis Token', 'fail', 'UPSTASH_REDIS_REST_TOKEN not set')
  } else {
    addResult('Redis Token', 'pass', `Set (${token.slice(0, 10)}...***REDACTED***)`)
  }
}

function checkCronSecret(): void {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    addResult('Cron Secret', 'fail', 'CRON_SECRET not set — daily automation cron will reject all calls')
    return
  }

  if (secret === 'your_cron_secret_min_32_chars') {
    addResult('Cron Secret', 'fail', 'Using example secret — generate a real one')
    return
  }

  if (secret.length < 32) {
    addResult('Cron Secret', 'warning', `Secret is ${secret.length} chars (recommended: 32+)`)
    return
  }

  addResult('Cron Secret', 'pass', `Set (${secret.length} characters)`)
}

function checkApiRouting(): void {
  const baseUrl = process.env.WHATSAPP_BASE_URL
  const version = process.env.WHATSAPP_API_VERSION
  const upstream = process.env.GRAPH_API_BASE_URL

  if (!baseUrl) {
    addResult('WhatsApp Base URL', 'warning', 'WHATSAPP_BASE_URL not set (defaults to proxy)')
  } else if (!baseUrl.startsWith('https://')) {
    addResult('WhatsApp Base URL', 'warning', 'Should be an HTTPS URL')
  } else {
    addResult('WhatsApp Base URL', 'pass', baseUrl)
  }

  if (!version) {
    addResult('WhatsApp API Version', 'warning', 'WHATSAPP_API_VERSION not set (defaults to v21.0)')
  } else if (!/^v\d+\.\d+$/.test(version)) {
    addResult('WhatsApp API Version', 'warning', `Unexpected format: ${version} (expected vNN.N)`)
  } else {
    addResult('WhatsApp API Version', 'pass', version)
  }

  if (!upstream) {
    addResult('Graph Upstream URL', 'warning', 'GRAPH_API_BASE_URL not set (proxy defaults to graph.facebook.com)')
  } else {
    addResult('Graph Upstream URL', 'pass', upstream)
  }
}

function checkSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  
  if (!dsn) {
    addResult('Sentry DSN', 'warning', 'NEXT_PUBLIC_SENTRY_DSN not set (recommended for error tracking)')
    return
  }
  
  if (!dsn.startsWith('https://')) {
    addResult('Sentry DSN', 'warning', 'DSN format looks unusual')
    return
  }
  
  addResult('Sentry DSN', 'pass', 'Set')
}

// ═══════════════════════════════════════════════════════════════════════════
// Print Results
// ═══════════════════════════════════════════════════════════════════════════

function printResults(): void {
  console.log('\n' + '═'.repeat(70))
  console.log('  WhatsApp Webhook Configuration Verification')
  console.log('═'.repeat(70) + '\n')
  
  const passCount = results.filter(r => r.status === 'pass').length
  const failCount = results.filter(r => r.status === 'fail').length
  const warnCount = results.filter(r => r.status === 'warning').length
  
  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️'
    const padding = ' '.repeat(Math.max(0, 25 - result.name.length))
    console.log(`${icon}  ${result.name}${padding}${result.message}`)
  }
  
  console.log('\n' + '─'.repeat(70))
  console.log(`  Total: ${results.length} checks`)
  console.log(`  ✅ Passed: ${passCount}`)
  console.log(`  ⚠️  Warnings: ${warnCount}`)
  console.log(`  ❌ Failed: ${failCount}`)
  console.log('─'.repeat(70) + '\n')
  
  if (failCount === 0 && warnCount === 0) {
    console.log('✨ All checks passed! Ready to deploy.')
  } else if (failCount === 0) {
    console.log('⚠️  All required checks passed, but there are warnings.')
    console.log('   Review the warnings before deploying.')
  } else {
    console.log('❌ Configuration incomplete. Fix the failed checks before deploying.')
    console.log('   See docs/WHATSAPP_WEBHOOK.md for setup instructions.')
    process.exit(1)
  }
  
  console.log('\n' + '═'.repeat(70))
  console.log('  Next Steps:')
  console.log('═'.repeat(70))
  console.log('  1. Apply database migration:')
  console.log('     supabase db push')
  console.log('  2. Deploy to Vercel')
  console.log('  3. Configure webhook URL in Meta Developer Dashboard:')
  console.log('     https://your-domain.vercel.app/api/whatsapp/webhook')
  console.log('  4. Subscribe to webhook fields: messages, message_status_updates')
  console.log('  5. Send test message to verify')
  console.log('═'.repeat(70) + '\n')
}

// ═══════════════════════════════════════════════════════════════════════════
// Run Checks
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    // Load environment (try both .env.local and .env)
    try {
      const dotenv = await import('dotenv')
      dotenv.config({ path: '.env.local' })
      dotenv.config({ path: '.env' })
    } catch {
      // dotenv not installed, assume env vars are already loaded
    }
    
    // Run all checks
    checkVerifyToken()
    checkAppSecret()
    checkPhoneNumberId()
    checkAccessToken()
    checkApiRouting()
    checkSupabase()
    checkRedis()
    checkCronSecret()
    checkSentry()
    
    // Print results
    printResults()
  } catch (error) {
    console.error('Error running verification:', error)
    process.exit(1)
  }
}

main()
