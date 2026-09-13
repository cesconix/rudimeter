// Every comment in the logs with the session it belongs to, for `bun run remote feedback`. Pure: the CLI
// reads the files. Newest first, so the last practice sits at the top of the terminal and of the export.
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
