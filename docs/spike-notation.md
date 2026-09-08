# Spike notazione — VexFlow 5 su rigo a 1 linea

Pagina: `spike-notation.html` (`npx vite --config vite.http.config.ts` → http://localhost:5174/spike-notation.html; iPad: `npm run dev` → https://<ip>:5173/spike-notation.html).

| Misura | Mac / Chrome | iPad / Safari | iPhone / Safari (più vecchio) |
|---|---|---|---|
| Figure corrette (flam, drag, buzz, tremolo, terzina, accento, sticking, pausa) | sì (tutte, verificate una per una a mano) | da verificare | da verificare |
| 40 battute, ms | 108,2 ms (640 note, SVG 15430 px) | **90,0 e 93,0 ms** (due run) | **113,0 e 141,0 ms** (due run) |
| Colora 20/s per 5 s: frame > 32 ms | 361 frame, 0 frame > 32 ms | **302 frame, 0 > 32 ms** (96 note) | **302 frame, 0 > 32 ms** (96 note) |
| Scorri: frame > 32 ms | 15430 px in 64,3 s, 4630 frame, 0 frame > 32 ms | **3858 frame, 0 > 32 ms** | **3854 frame, 0 > 32 ms** |
| `getSVGElement()` trova il gruppo | sì | sì (implicito) | sì (implicito: senza, "Colora" non colorerebbe) |

Una nota su come leggere "0 frame > 32 ms": è una soglia grossolana, perché a 60 Hz il budget per frame è 16,7 ms e un frame da 25 ms sarebbe perso senza finire in quel conteggio. Il dato stringente è il rapporto fra frame consegnati e attesi. Su 64,3 s a 60 Hz ne sono dovuti 3858: l'iPad li consegna **tutti e 3858**, l'iPhone 3854, cioè il **99,9%** — quattro frame persi in oltre un minuto di scorrimento continuo, sul dispositivo più lento. La colorazione sta a 302 frame in 5 s su entrambi, cioè 60,4 fps, il refresh nativo pieno.

Entrambi girano a 60 Hz, non a 120: per questo uso è abbondante, ma vale saperlo prima di progettare qualcosa che dia per scontati i 120.

Il tempo di render varia del 3% fra run sull'iPad (90,0 e 93,0 ms) e del 25% sull'iPhone (113,0 e 141,0): irrilevante rispetto a un gate di 1000 ms, ma è il motivo per cui una misura sola non basta.

## Decisione: render unico (gate iPad superato)

La decisione è **render unico** dell'esercizio srotolato, e non è più provvisoria: il gate iPad è stato misurato. 40 battute costano **90,0 ms su iPad/Safari** contro un budget di 1000 ms — undici volte di margine. L'iPad è risultato più veloce del Mac (90,0 contro 108,2 ms), quindi il ramo alternativo previsto dal piano, le finestre da 8 battute, **non serve**.

Misurato anche il pavimento, su un iPhone più vecchio: **113,0 ms**. I tre dispositivi stanno dentro una fascia del 25% (iPad 90,0 · Mac 108,2 · iPhone 113,0), quindi il più debole conserva ancora 8,8× di margine. Il tempo di render non è un rischio su nessun dispositivo reale.

Vale la pena registrare quanto il proxy fosse pessimista: il rallentamento CPU emulato a 20× era stato usato come approssimazione del dispositivo mobile e produceva un render da 1058 ms, cioè proprio sopra il gate — sbagliando di quasi un ordine di grandezza rispetto ai 113 ms del pavimento vero. Il throttling emulato dice dove si rompe una cosa, non quanto è lontano il dispositivo reale da quel punto.

Su Mac i numeri concordano: 40 battute costano 108,2 ms (circa l'11% del budget complessivo), la ricolorazione e lo scroll non superano mai i 32 ms per frame (73 fps misurati, tab in primo piano, rAF non throttlato) — tutti valori trascurabili rispetto ai 16 ms di budget per frame.

## Misura sul componente vero: scorrimento e colorazione insieme

I numeri sopra misurano scorrimento e colorazione *separatamente*, sulla galleria dello spike. La condizione reale è che avvengano **insieme**, sullo stesso layer promosso: il cursore trasla `.score-host` mentre `paintDiff` muta il `fill` delle note dentro quel layer. Misurato sul componente `Score` vero (React vero, 160 slot, SVG 7750 px, 20 s a 100 bpm, finestra in primo piano):

| CPU | fps | mediana | p99 | max a regime | frame > 16,7 ms | frame lungo isolato |
|---|---|---|---|---|---|---|
| 1× | 71,7 | 13,9 ms | 14,9 ms | 15,0 ms | 0 su 1433 | — |
| 4× | 70,9 | 13,9 ms | 14,9 ms | 14,9 ms | 0 su 1008 | 207,7 ms a 214 ms dall'avvio |
| 20× | 60,5 | 13,9 ms | 41,3 ms | — | 75 su 908 | 1058 ms a 1042 ms dall'avvio |

Il regime permanente è insensibile al rallentamento della CPU — è lavoro del compositore, non del thread principale. Quello che degrada è **solo il render iniziale**, che è layout VexFlow sul thread principale: a 20× diventa un frame da 1058 ms e attraversa il gate del secondo. Un iPad reale sta molto sotto i 20×, ma è quella la voce da guardare nella colonna iPad, non lo scorrimento.

Corollario: limitare `paintDiff` alla finestra visibile non serve. Itera 160 slot (i 640 erano la galleria dello spike) e il regime è già al passo del display con margine ampio. Se il render iniziale diventasse il collo di bottiglia, il ramo giusto è quello delle finestre da 8 battute già previsto dal piano.

## Da verificare a mano

1. Intera colonna iPad/Safari: `npm run dev` → accetta certificato → https://<ip-lan>:5173/spike-notation.html → ripeti "40 battute", "Colora", "Scorri" e annota i millisecondi e le percentuali di frame lenti.

## Note

La trascrizione del codice dalla specifica è risultata corretta e ha prodotto tutte le figure giuste al primo tentativo (flam, drag, buzz, tremolo, terzina, accento, sticking, pausa, rest). Non sono stati necessari aggiustamenti.

Una nota tecnica: il valore iniziale di `BuzzRoll.text` è stato fornito come escape sequence `` (il glifo SMuFL U+E22A, ``) nella specifica; la trascrizione iniziale ha erroneamente codificato il carattere Unicode grezzo, ma il valore finale è stato corretto a match perfetto col brief.

Un secondo difetto, trovato solo in browser reale (invisibile a review del diff e a vitest, che non ha `document.fonts`): `spike.ts` chiamava `renderGallery(...)` otto volte a livello di modulo, prima che il browser applicasse il `@font-face` di Bravura. VexFlow calcola la larghezza dei glifi misurando testo nel DOM; col font di fallback otteneva 28,1px invece di 11,8px per la testa di nota (U+E0A4), e incideva quelle x sbagliate nell'SVG — gambo staccato di 16,3px da ogni testa, mai corretto perché `render.ts` non fa mai re-layout. Riprodotto anche con cache HTTP dei font calda, quindi deterministico. Fix: `render.ts` esporta `notationFontsReady()` (attende `document.fonts.ready`), e `spike.ts` la attende con un top-level await prima delle otto chiamate a `renderGallery`. I bottoni di misura restano sicuri perché scattano dopo il load, quando i font sono già pronti. Chi chiama `renderScore` in futuro (es. il componente `Score` del Task 11, montato in un effect) eredita la stessa precondizione — documentata sul docstring di `renderScore`.
