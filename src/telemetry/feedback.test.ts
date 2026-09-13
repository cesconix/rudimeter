import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeedbackBox, type FeedbackSink } from './feedback'

// No DOM under bun test: the box is rendered to static markup, which checks what it shows on mount.
// The Send/Close transitions are verified in the browser (plan 07, final check).
const remote: FeedbackSink = { log: () => null }

describe('FeedbackBox', () => {
  it('mounts open: heading, capped textarea with the placeholder, Send disabled until there is text, Close', () => {
    const html = renderToStaticMarkup(createElement(FeedbackBox, { remote, sessionId: null }))
    expect(html).toContain('How did it go?')
    // react-dom@19's static renderer writes prop names it does not special-case (maxLength is not in its
    // fixed attribute table, unlike e.g. className/tabIndex) verbatim, so the attribute lands camelCased.
    expect(html).toContain('maxLength="2000"')
    expect(html).toContain('placeholder="What felt right or wrong: missed strokes, wrong grades, latency, anything."')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Send<\/button>/)
    expect(html).toContain('>Close</button>')
  })
})
