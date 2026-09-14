// The one decision that must survive a flaky refresh: whether a comment was saved. Only the POST's own
// response decides that; a refresh that runs afterward and fails must read as a stale view — the next
// tick fixes it — never as the comment being lost, since by then it is already on the server.
export type SaveOutcome = { ok: true } | { ok: false; unauthorized: boolean; message: string }

interface SaveResponse {
  status: number
  ok: boolean
  json(): Promise<unknown>
}

/** `post` sends the comment; `refresh` re-pulls the device so the new comment shows up in the list. */
export async function saveFeedback(
  post: () => Promise<SaveResponse>,
  refresh: () => Promise<unknown>,
): Promise<SaveOutcome> {
  const res = await post()
  if (res.status === 401) return { ok: false, unauthorized: true, message: 'token required' }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, unauthorized: false, message: body.error ?? `server said ${res.status}` }
  }
  // Saved: whatever happens to the refresh below must not turn this into a failure the drummer sees.
  await refresh().catch(() => {})
  return { ok: true }
}
