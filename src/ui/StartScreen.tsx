interface Props {
  onStart(): void
  busy: boolean
  error: string | null
}

export function StartScreen({ onStart, busy, error }: Props) {
  return (
    <main>
      <h1>Rudimeter</h1>
      <p>Pad in front of you, iPad on the music stand, headphones ready. Tap to turn on audio and microphone.</p>
      <button type="button" onClick={onStart} disabled={busy}>
        {busy ? 'Starting…' : 'Start'}
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
