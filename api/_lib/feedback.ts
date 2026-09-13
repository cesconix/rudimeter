// What `POST /api/feedback` accepts: `{ sessionId, text }` for a session of `device`, the text within
// the cap the app's box enforces. The id must be the device's own (`<device>@<session:start at>`): a
// comment for `iphone@…` appended to `mac.ndjson` would never find its session.
import { cleanFeedback, MAX_FEEDBACK_CHARS } from '../../src/dev/feedback-text'

export function parseFeedbackBody(
  raw: unknown,
  device: string,
): { ok: true; sessionId: string; text: string } | { ok: false; error: string } {
  const body = (raw ?? {}) as { sessionId?: unknown; text?: unknown }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  // The tail must be an ISO instant, not just any string after "device@": without this, a crafted body
  // could append an arbitrary (multi-MB) line that never matches a session and just lands as a stray.
  const tailIsInstant =
    sessionId.startsWith(`${device}@`) && Number.isFinite(Date.parse(sessionId.slice(device.length + 1)))
  if (!tailIsInstant)
    return {
      ok: false,
      error: `sessionId must be "${device}@<session:start at>", got ${JSON.stringify(body.sessionId ?? null)}`,
    }
  const text = cleanFeedback(body.text)
  if (text === null) return { ok: false, error: `text must be 1 to ${MAX_FEEDBACK_CHARS} characters after trimming` }
  return { ok: true, sessionId, text }
}
