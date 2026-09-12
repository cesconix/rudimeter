import { describe, expect, it } from 'bun:test'
import { appFeedbackFields, cleanFeedback, MAX_FEEDBACK_CHARS } from './feedback-text'

describe('cleanFeedback', () => {
  it('trims and keeps a plain comment', () => {
    expect(cleanFeedback('  left hand late \n')).toBe('left hand late')
  })
  it('returns null for blank, non-string and over-long text', () => {
    expect(cleanFeedback('')).toBeNull()
    expect(cleanFeedback('   \n\t')).toBeNull()
    expect(cleanFeedback(42)).toBeNull()
    expect(cleanFeedback(undefined)).toBeNull()
    expect(cleanFeedback('x'.repeat(MAX_FEEDBACK_CHARS))).toHaveLength(MAX_FEEDBACK_CHARS)
    expect(cleanFeedback('x'.repeat(MAX_FEEDBACK_CHARS + 1))).toBeNull()
  })
})

describe('appFeedbackFields', () => {
  it('carries the session id when known, leaves it out otherwise', () => {
    expect(appFeedbackFields('late', 'iphone@2026-09-12T06:22:57.210Z')).toEqual({
      text: 'late',
      source: 'app',
      sessionId: 'iphone@2026-09-12T06:22:57.210Z',
    })
    expect(appFeedbackFields('late', null)).toEqual({ text: 'late', source: 'app' })
  })
})
