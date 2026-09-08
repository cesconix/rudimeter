# Spike notazione — VexFlow 5 su rigo a 1 linea

Pagina: `spike-notation.html` (`npx vite --config vite.http.config.ts` → http://localhost:5174/spike-notation.html; iPad: `npm run dev` → https://<ip>:5173/spike-notation.html).

| Misura | Mac / Chrome | iPad / Safari |
|---|---|---|
| Figure corrette (flam, drag, buzz, tremolo, terzina, accento, sticking, pausa) | sì (tutte, verificate una per una a mano) | da verificare |
| 40 battute, ms | 108,2 ms (640 note, SVG 15430 px) | da verificare |
| Colora 20/s per 5 s: frame > 32 ms | 361 frame, 0 frame > 32 ms | da verificare |
| Scorri: frame > 32 ms | 15430 px in 64,3 s, 4630 frame, 0 frame > 32 ms | da verificare |
| `getSVGElement()` trova il gruppo | sì | da verificare |

## Decisione (provvisoria — manca il gate iPad)

La decisione è **render unico** dell'esercizio srotolato, ma rimane provvisoria finché il gate iPad non confermasse che il rendering rimane sotto il secondo. Se su iPad il tempo superasse 1000 ms, il Task 11 passerebbe alle finestre da 8 battute — il piano prevede già entrambi i rami e una modifica localizzata a `Score` è sufficiente per cambiare strategia.

Su Mac i numeri supportano il render unico: 40 battute costano 108,2 ms (circa l'11% del budget complessivo), la ricolorazione e lo scroll non superano mai i 32 ms per frame (73 fps misurati, tab in primo piano, rAF non throttlato) — tutti valori trascurabili rispetto ai 16 ms di budget per frame.

## Da verificare a mano

1. Intera colonna iPad/Safari: `npm run dev` → accetta certificato → https://<ip-lan>:5173/spike-notation.html → ripeti "40 battute", "Colora", "Scorri" e annota i millisecondi e le percentuali di frame lenti.

## Note

La trascrizione del codice dalla specifica è risultata corretta e ha prodotto tutte le figure giuste al primo tentativo (flam, drag, buzz, tremolo, terzina, accento, sticking, pausa, rest). Non sono stati necessari aggiustamenti.

Una nota tecnica: il valore iniziale di `BuzzRoll.text` è stato fornito come escape sequence `` (il glifo SMuFL U+E22A, ``) nella specifica; la trascrizione iniziale ha erroneamente codificato il carattere Unicode grezzo, ma il valore finale è stato corretto a match perfetto col brief.

Un secondo difetto, trovato solo in browser reale (invisibile a review del diff e a vitest, che non ha `document.fonts`): `spike.ts` chiamava `renderGallery(...)` otto volte a livello di modulo, prima che il browser applicasse il `@font-face` di Bravura. VexFlow calcola la larghezza dei glifi misurando testo nel DOM; col font di fallback otteneva 28,1px invece di 11,8px per la testa di nota (U+E0A4), e incideva quelle x sbagliate nell'SVG — gambo staccato di 16,3px da ogni testa, mai corretto perché `render.ts` non fa mai re-layout. Riprodotto anche con cache HTTP dei font calda, quindi deterministico. Fix: `render.ts` esporta `notationFontsReady()` (attende `document.fonts.ready`), e `spike.ts` la attende con un top-level await prima delle otto chiamate a `renderGallery`. I bottoni di misura restano sicuri perché scattano dopo il load, quando i font sono già pronti. Chi chiama `renderScore` in futuro (es. il componente `Score` del Task 11, montato in un effect) eredita la stessa precondizione — documentata sul docstring di `renderScore`.
