// Every comment in the logs with the session it belongs to, for `bun run remote feedback`. Pure: the CLI
// reads the files. Newest first, so the last practice sits at the top of the terminal and of the export.
import { cleanFeedback, MAX_FEEDBACK_CHARS } from '../../src/dev/feedback-text'
import {
  type AnalyzeDeps,
  analyzeSession,
  type Feedback,
  feedbackOf,
  parseLines,
  type SessionAnalysis,
  splitSessions,
  strayFeedback,
} from './analysis'

export interface FeedbackEntry extends Feedback {
  device: string
  /** null: the log holds the comment but no session it belongs to (unknown id, or nothing closed before it) */
  session: SessionAnalysis | null
}

export function collectFeedback(files: { device: string; text: string }[], deps: AnalyzeDeps): FeedbackEntry[] {
  const out: FeedbackEntry[] = []
  for (const { device, text } of files) {
    const lines = parseLines(text)
    const records = splitSessions(lines, device)
    for (const rec of records) {
      if (!rec.feedback.length) continue
      const session = analyzeSession(rec, deps)
      for (const f of session.feedback) out.push({ ...f, device, session })
    }
    for (const l of strayFeedback(lines, records)) out.push({ ...feedbackOf(l), device, session: null })
  }
  // ISO timestamps sort as strings; ties keep file order.
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/**
 * What `POST /__remote/feedback` accepts: `{ sessionId, text }` for a session of `device`, the text within
 * the cap the app's box enforces. The id must be the device's own (`<device>@<session:start at>`): a
 * comment for `iphone@…` appended to `mac.ndjson` would never find its session.
 */
export function parseFeedbackBody(
  raw: unknown,
  device: string,
): { ok: true; sessionId: string; text: string } | { ok: false; error: string } {
  const body = (raw ?? {}) as { sessionId?: unknown; text?: unknown }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (!sessionId.startsWith(`${device}@`))
    return {
      ok: false,
      error: `sessionId must be "${device}@<session:start at>", got ${JSON.stringify(body.sessionId ?? null)}`,
    }
  const text = cleanFeedback(body.text)
  if (text === null) return { ok: false, error: `text must be 1 to ${MAX_FEEDBACK_CHARS} characters after trimming` }
  return { ok: true, sessionId, text }
}
