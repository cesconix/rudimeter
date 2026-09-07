# stick-coach

Validatore di timing e dinamica per practice pad via microfono. Esercizi Stick Control, metronomo, feedback per colpo. Web app (PWA), target iPad Safari.

Design e decisioni: vault Obsidian, `personal/side-projects/stick-coach/`.

## Sviluppo

```bash
npm install
npm run dev        # https://<ip-lan>:5173  (cert self-signed: accettarlo sull'iPad)
npm test
npm run typecheck
```

HTTPS è obbligatorio: `getUserMedia` funziona solo in secure context e l'iPad raggiunge il Mac via IP LAN.

Pagina dev notazione: spike-notation.html (non entra nella build).

## Spike microfono (throwaway)

`public/spike/` — pagina standalone per verificare su iPad se la dinamica sopravvive al processing del microfono e per misurare la latenza. Aprire `https://<ip-lan>:5173/spike/index.html` e seguire i 5 passi in pagina. Il report JSON si copia dal passo 5.

## Checklist manuale (iPad Safari)

1. Inizia → consenti microfono → Calibrazione senza cuffie: latenza ~60-70 ms, pendenza riportata.
2. Cuffie → Esercizio #1 a 60 bpm sul pad: count-in di 2 click, griglia si colora entro un battito.
3. Stop a metà → riepilogo delle ripetizioni fatte finora. Lock/unlock → "Audio in pausa: tocca per riprendere".
4. Fine sessione → riepilogo → Copia markdown → incolla nel log del percorso.
5. Condividi → Aggiungi a Home: si apre a schermo intero in landscape.

## Deploy

Push su `main` → GitHub Actions builda con `--mode pages` e pubblica su Pages (`Settings → Pages → Source: GitHub Actions`, una volta sola). URL: `https://<utente>.github.io/stick-coach/`.
