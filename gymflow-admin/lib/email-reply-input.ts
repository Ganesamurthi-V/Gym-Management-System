import type { NextRequest } from 'next/server'
import { z } from 'zod'

/**
 * Reading the body of a reply request. Lives here, not in the route file, because a Next.js
 * route module may only export its HTTP handlers.
 */

export const MAX_REPLY_CHARS = 10_000

// Attachments arrive in the request body, and the host caps a request at about 4.5 MB, so
// the limits below keep a legitimate upload under it. Resend itself accepts far more.
const MAX_FILES = 5
const MAX_FILE_BYTES = 3 * 1024 * 1024
const MAX_TOTAL_BYTES = 4 * 1024 * 1024
// Executable and script types: mail providers reject them and they have no place in a reply.
const BLOCKED_FILE = /\.(exe|bat|cmd|com|scr|js|jse|vbs|vbe|msi|jar|ps1|sh|dll|apk|lnk)$/i

export interface UploadedFile { filename: string; contentType: string; buffer: Buffer }

/**
 * The body is either JSON { text, retryMessageId } (no attachments) or multipart form data
 * with the same fields plus files under "attachments". `text` is the editor's markup.
 */
export async function readInput(req: NextRequest): Promise<
  | { ok: true; text: string; retryMessageId?: string; to?: string; subject?: string; files: UploadedFile[] }
  | { ok: false; error: string }
> {
  let raw: { text?: unknown; retryMessageId?: unknown; to?: unknown; subject?: unknown } | null
  const files: UploadedFile[] = []

  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (!form) return { ok: false, error: 'Could not read the upload' }
    raw = {
      text: form.get('text'),
      retryMessageId: form.get('retryMessageId') || undefined,
      to: form.get('to') || undefined,
      subject: form.get('subject') || undefined,
    }
    for (const entry of form.getAll('attachments')) {
      if (typeof entry === 'string') continue
      files.push({
        filename: (entry.name || 'attachment').replace(/[\\/\r\n"]/g, '_').slice(0, 120),
        contentType: entry.type || 'application/octet-stream',
        buffer: Buffer.from(await entry.arrayBuffer()),
      })
    }
  } else {
    raw = await req.json().catch(() => null)
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  if (files.length > MAX_FILES) return { ok: false, error: `Attach at most ${MAX_FILES} files` }
  let total = 0
  for (const f of files) {
    if (BLOCKED_FILE.test(f.filename)) return { ok: false, error: `${f.filename}: this file type cannot be sent` }
    if (f.buffer.length === 0) return { ok: false, error: `${f.filename} is empty` }
    if (f.buffer.length > MAX_FILE_BYTES) return { ok: false, error: `${f.filename} is larger than 3 MB` }
    total += f.buffer.length
  }
  if (total > MAX_TOTAL_BYTES) return { ok: false, error: 'Attachments together must be under 4 MB' }

  return { ok: true, ...parsed.data, files }
}

const bodySchema = z.object({
  text: z.string().trim().min(1, 'Write a reply first').max(MAX_REPLY_CHARS),
  // Set when the app retries a reply that failed to send, so it reuses that row instead
  // of leaving a failed duplicate behind.
  retryMessageId: z.string().uuid().optional(),
  // Only used when writing a new message (lib: /api/email/compose); a reply ignores them.
  to: z.string().trim().toLowerCase().email('Choose who to write to').max(254).optional(),
  subject: z.string().trim().min(1, 'Add a subject').max(200).transform(s => s.replace(/[\r\n]+/g, ' ')).optional(),
})

