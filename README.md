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

## Spike microfono (throwaway)

`public/spike/` — pagina standalone per verificare su iPad se la dinamica sopravvive al processing del microfono e per misurare la latenza. Aprire `https://<ip-lan>:5173/spike/index.html` e seguire i 5 passi in pagina. Il report JSON si copia dal passo 5.
