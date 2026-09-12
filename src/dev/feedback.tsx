// The box at the end of a session: a free-text comment that lands in the session's log next to the
// numbers, or nothing. Dev-only, like the channel it writes to: App.tsx loads it with the same `import()`
// under `import.meta.env.DEV` as ./remote, so none of it — copy included — reaches the production bundle.
import { useState } from 'react'
import { appFeedbackFields, cleanFeedback, MAX_FEEDBACK_CHARS } from './feedback-text'
import type { Remote } from './remote'

export interface FeedbackProps {
  remote: Remote
  /**
   * `<device>@<at of session:start>`, null when the page never logged the start (older channel, or
   * the session began before the channel came up)
   */
  sessionId: string | null
}

/**
 * One box per mount: App mounts it with each summary, so a new session gets a fresh box and a summary
 * the drummer has already answered (or closed) shows nothing more. No line is logged on mount or on
 * Close — a session without feedback is just a session.
 */
export function FeedbackBox({ remote, sessionId }: FeedbackProps) {
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<'open' | 'sent' | 'closed'>('open')
  if (state === 'closed') return null
  if (state === 'sent') return <p>Thanks — saved with this session.</p>
  const text = cleanFeedback(draft)
  return (
    <section>
      <h2>How did it go?</h2>
      <textarea
        value={draft}
        rows={4}
        maxLength={MAX_FEEDBACK_CHARS}
        placeholder="What felt right or wrong: missed strokes, wrong grades, latency, anything."
        onChange={(e) => setDraft(e.target.value)}
        // Inline, not in styles.css: the production stylesheet must not grow for a dev-only box. The body
        // sets user-select: none for the pad; the field opts back in so iOS lets the text be edited.
        style={{
          width: '100%',
          font: 'inherit',
          fontSize: '1rem',
          padding: 8,
          WebkitUserSelect: 'text',
          userSelect: 'text',
        }}
      />
      <div className="row">
        <button
          type="button"
          disabled={text === null}
          onClick={() => {
            if (text === null) return
            remote.log('session:feedback', appFeedbackFields(text, sessionId))
            setState('sent')
          }}
        >
          Send
        </button>
        <button type="button" className="secondary" onClick={() => setState('closed')}>
          Close
        </button>
      </div>
    </section>
  )
}
