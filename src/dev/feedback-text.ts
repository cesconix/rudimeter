// The one rule every feedback path shares — the box at the end of a session, the dashboard's Save and
// the plugin's route — so a comment the page accepts is a comment the server keeps.

/** Enough for a paragraph or three; past it the comment is a document and belongs elsewhere. */
export const MAX_FEEDBACK_CHARS = 2000

/** The trimmed comment, or null when there is nothing to keep: blank, not a string, over the cap. */
export function cleanFeedback(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  return text.length > 0 && text.length <= MAX_FEEDBACK_CHARS ? text : null
}
