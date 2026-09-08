/**
 * Il clock UDIBILE: quale istante della timeline sta uscendo dagli altoparlanti adesso.
 *
 * `ctx.currentTime` è il clock di SCHEDULAZIONE — quando un campione entra nel grafo, non quando lo
 * si sente. Fra i due c'è la latenza di uscita del device: 16,6 ms misurati sul Mac di sviluppo
 * (stabili entro 0,05 ms), molto di più via Bluetooth.
 *
 * Chi DISEGNA deve usare questa funzione. Il batterista si sincronizza con l'orecchio, e la
 * correzione applicata ai colpi (`SessionRunner.addHit`, che sottrae l'intera latenza di andata e
 * ritorno misurata dalla calibrazione) assume esattamente quello. Un cursore disegnato sul clock di
 * schedulazione arriva sulla nota prima che il suo click si senta: chi lo segue con gli occhi suona
 * in anticipo di tutta la latenza di uscita e viene giudicato in anticipo. Con una finestra `good`
 * di 20 ms, i 16,6 ms misurati se ne mangiano l'83%.
 *
 * Chi SCHEDULA deve invece continuare a usare `ctx.currentTime`: è il clock in cui si prenotano i
 * click, e anticiparlo sposterebbe il metronomo invece del disegno.
 *
 * `contextTime` avanza fluido quanto `currentTime` (misurato: passo mediano 15,99 ms contro 16,00,
 * zero frame fermi su 199), quindi leggerlo a ogni frame non costa scorrevolezza, e a differenza di
 * una latenza misurata una volta sola si riadatta da solo se il device di uscita cambia a metà
 * sessione — cuffie Bluetooth collegate dopo l'avvio, per dire.
 */
export function audibleTime(ctx: AudioContext): number {
  const contextTime = ctx.getOutputTimestamp?.().contextTime
  // Prima che il device abbia reso il primo blocco — e sui browser senza getOutputTimestamp —
  // non esiste ancora una posizione di uscita. Zero lì non vuol dire "inizio della partitura" ma
  // "non lo so ancora": preso alla lettera farebbe saltare il cursore all'inizio del pezzo.
  if (typeof contextTime !== 'number' || contextTime <= 0) return ctx.currentTime
  return contextTime
}
