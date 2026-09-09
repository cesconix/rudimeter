interface Props {
  onStart(): void
  busy: boolean
  error: string | null
}

export function StartScreen({ onStart, busy, error }: Props) {
  return (
    <main>
      <h1>stick-coach</h1>
      <p>Pad sotto, iPad sul leggio, cuffie pronte. Tocca per attivare audio e microfono.</p>
      <button type="button" onClick={onStart} disabled={busy}>{busy ? 'Avvio…' : 'Inizia'}</button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
