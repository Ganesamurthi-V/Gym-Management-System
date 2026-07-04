/**
 * Raw Groq API test — no imports from aiInference.ts
 * Proves the model works and shows the exact raw response.
 *
 * Run: npx tsx --no-cache scripts/test-ai-raw.ts
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const MODEL = 'qwen/qwen3.6-27b'
const MAX_TOKENS = 2048 // Qwen3 thinking block ~400-500 tokens + JSON ~100 tokens

if (!GROQ_API_KEY) {
  console.error('❌  GROQ_API_KEY not set')
  process.exit(1)
}

async function callGroqRaw(userPrompt: string): Promise<void> {
  console.log(`\n─── Prompt: "${userPrompt}" ───`)

  const body = {
    model: MODEL,
    temperature: 0.1,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: 'You are a location expert for Tamil Nadu and Puducherry, India. Respond ONLY with valid JSON, no markdown, no explanation.',
      },
      {
        role: 'user',
        content: `Given this messy locality input: "${userPrompt}"\n\nReturn ONLY this JSON:\n{"probable_location": "...", "district": "...", "state": "...", "confidence": 0.0, "reasoning": "..."}`,
      },
      // Force skip thinking mode — Qwen3 sees </think> already written and
      // jumps straight to the answer without spending tokens on <think> blocks
      {
        role: 'assistant',
        content: '</think>',
      },
    ],
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    console.log(`HTTP status: ${res.status}`)

    if (!res.ok) {
      const err = await res.text()
      console.error('API error body:', err)
      return
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string }, finish_reason: string }>
      usage: { prompt_tokens: number, completion_tokens: number }
    }

    const raw = data.choices?.[0]?.message?.content ?? ''
    const finishReason = data.choices?.[0]?.finish_reason ?? ''
    const usage = data.usage

    console.log(`Finish reason : ${finishReason}`)
    console.log(`Tokens used   : prompt=${usage?.prompt_tokens} completion=${usage?.completion_tokens}`)
    console.log(`\nRAW response (${raw.length} chars):`)
    console.log(raw)

    // Strip think tags
    const stripped = raw
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*/g, '')
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    console.log(`\nStripped response:`)
    console.log(stripped)

    // Try parse
    try {
      const parsed = JSON.parse(stripped)
      console.log(`\n✅  Parsed OK:`, JSON.stringify(parsed, null, 2))
    } catch (e) {
      console.log(`\n❌  JSON parse failed:`, e instanceof Error ? e.message : e)
    }

  } catch (err) {
    console.error('Fetch error:', err)
  }
}

async function main() {
  console.log(`Model : ${MODEL}`)
  console.log(`Key   : ${GROQ_API_KEY.slice(0, 8)}...`)

  await callGroqRaw('lawspet pdy')
  await callGroqRaw('anna nagar cbe')
}

main()
