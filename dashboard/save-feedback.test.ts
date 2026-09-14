import { describe, expect, it } from 'bun:test'
import { saveFeedback } from './save-feedback'

const ok = () => Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({}) })
const unauthorized = () => Promise.resolve({ status: 401, ok: false, json: () => Promise.resolve({}) })
const serverError = () => Promise.resolve({ status: 500, ok: false, json: () => Promise.resolve({ error: 'boom' }) })

describe('saveFeedback', () => {
  it('reports success even when the refresh that follows a saved comment rejects', async () => {
    const refresh = () => Promise.reject(new Error('network dropped'))
    expect(await saveFeedback(ok, refresh)).toEqual({ ok: true })
  })

  it('reports failure when the save itself fails, and never runs the refresh', async () => {
    let refreshed = false
    const refresh = () => {
      refreshed = true
      return Promise.resolve()
    }
    expect(await saveFeedback(serverError, refresh)).toEqual({ ok: false, unauthorized: false, message: 'boom' })
    expect(refreshed).toBe(false)
  })

  it('flags unauthorized on a 401 from the save itself', async () => {
    expect(await saveFeedback(unauthorized, () => Promise.resolve())).toEqual({
      ok: false,
      unauthorized: true,
      message: 'token required',
    })
  })
})
