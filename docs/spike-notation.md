# Spike notazione — VexFlow 5 su rigo a 1 linea

Pagina: `spike-notation.html` (`npx vite --config vite.http.config.ts` → http://localhost:5174/spike-notation.html; iPad: `npm run dev` → https://<ip>:5173/spike-notation.html).

| Misura | Mac / Chrome | iPad / Safari |
|---|---|---|
| Figure corrette (flam, drag, buzz, tremolo, terzina, accento, sticking, pausa) | sì (tutte) | da verificare |
| 40 battute, ms | 130 ms (640 note, SVG 15430 px) | da verificare |
| Colora 20/s per 5 s: frame > 32 ms | costo sincrono 1,5 µs/nota (840 note in 1,3 ms); % frame da verificare a mano — in automazione la tab è hidden e Chrome throttla rAF | da verificare |
| Scorri: frame > 32 ms | costo sincrono 3 µs/frame (100 translateX + layout in 0,3 ms); % frame da verificare a mano | da verificare |
| `getSVGElement()` trova il gruppo | sì | da verificare |

## Decisione

**Render unico** dell'esercizio srotolato. Su Mac il rendering di 40 battute costa 130 ms, il 13% del budget complessivo di 1000 ms che il gate impone per l'esercizio intero; la ricolorazione di una nota costa 1,5 microsecondi e uno step di scroll costa 3 microsecondi, cifre trascurabili rispetto al budget di 16 ms per frame. Il gate su iPad non è ancora stato eseguito: se il rendering là superasse il secondo, il Task 11 passerebbe alle finestre da 8 battute — il piano architetturale prevede già entrambi i rami e una modifica localizzata al componente `Score` è sufficiente per fare il switch.

## Da verificare a mano

1. Percentuale di frame > 32 ms (nel "Colora" e nello "Scorri") su Mac in una finestra del browser in primo piano — la misurazione automatica è invalida perché Chrome throttla rAF quando la tab è nascosta.
2. Intera colonna iPad/Safari: `npm run dev` → accetta certificato → https://<ip-lan>:5173/spike-notation.html → ripeti "40 battute", "Colora", "Scorri" e annota i millisecondi e le percentuali di frame lenti.

## Note

La transcription del codice dalla specifica è risultata corretta e ha prodotto tutte le figure giuste al primo tentativo (flam, drag, buzz, tremolo, terzina, accento, sticking, pausa, rest). Non sono stati necessari aggiustamenti.

Una nota tecnica: il valore iniziale di `BuzzRoll.text` è stato fornito come escape sequence `''` nella specifica; la trascrizione iniziale ha erroneamente codificato il carattere Unicode grezzo invece dell'escape sequence, ma il valore finale è stato corretto a match perfetto col brief.
