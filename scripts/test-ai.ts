/**
 * Quick test for qwen/qwen3-27b geo inference
 * Run with:  npx tsx scripts/test-ai.ts
 */

// Load .env.local before anything else
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { groqInferLocation, groqInferBatch } from '@/lib/geo/aiInference'

const apiKey = process.env.GROQ_API_KEY ?? ''

if (!apiKey) {
  console.error('❌  GROQ_API_KEY is not set in .env.local')
  process.exit(1)
}

const TEST_INPUTS = [
  'lawspet pdy',
  'anna nagar cbe',
  'pondy bus stand',
  'vellachery',
  'nellai',
  'tvm',
  'near railway station chennai',
  'saibaba clny',
]

async function runSingleTests() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Single inference — qwen/qwen3-27b')
  console.log('══════════════════════════════════════════\n')

  for (const input of TEST_INPUTS.slice(0, 3)) {
    console.log(`➜  Input: "${input}"`)
    const start = performance.now()

    const result = await groqInferLocation(input, apiKey)
    const ms = Math.round(performance.now() - start)

    if (!result) {
      console.log(`   ❌  No result (${ms}ms)\n`)
      continue
    }

    const confidence = (result.confidence * 100).toFixed(0)
    const icon = result.confidence >= 0.8 ? '✅' : result.confidence >= 0.5 ? '⚠️ ' : '❌'

    console.log(`   ${icon}  ${result.probable_location}, ${result.district}, ${result.state}`)
    console.log(`       Confidence: ${confidence}%  |  ${ms}ms`)
    console.log(`       Reason: ${result.reasoning}\n`)
  }
}

async function runBatchTest() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Batch inference — qwen/qwen3-27b')
  console.log('══════════════════════════════════════════\n')

  const start = performance.now()
  const results = await groqInferBatch(TEST_INPUTS, apiKey)
  const ms = Math.round(performance.now() - start)

  for (const input of TEST_INPUTS) {
    const result = results.get(input.toLowerCase().trim())
    if (!result) {
      console.log(`❌  "${input}" → No result`)
      continue
    }

    const icon = result.confidence >= 0.8 ? '✅' : result.confidence >= 0.5 ? '⚠️ ' : '❌'
    const confidence = (result.confidence * 100).toFixed(0)
    console.log(`${icon}  "${input}"`)
    console.log(`    → ${result.probable_location}, ${result.district}, ${result.state} (${confidence}%)`)
  }

  console.log(`\n⏱  Total batch time: ${ms}ms for ${TEST_INPUTS.length} inputs`)
  console.log(`   (vs ~${TEST_INPUTS.length * 1500}ms if done individually)\n`)
}

async function main() {
  console.log(`\nUsing model: qwen/qwen3.6-27b`)
  console.log(`API key: ${apiKey.slice(0, 8)}...***REDACTED***`)

  await runSingleTests()
  await runBatchTest()

  console.log('Done ✅')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
