# Deploy su GitHub Pages

## Prerequisiti

1. Avere un repository GitHub: `vibe-app-pre-training`
2. Avere Git configurato localmente
3. Avere fatto il commit iniziale del progetto

## Passaggi per il Deploy

### 1. Configurare il repository GitHub

✅ Il repository è già configurato per `vibe-app-pre-training`. Lo script `deploy` nel `package.json` è già configurato correttamente.

### 2. Eseguire il deploy

```bash
npm run deploy
```

Questo comando:
- Compila l'app in modalità produzione
- Configura il base-href corretto per GitHub Pages
- Carica i file sulla branch `gh-pages` del repository

### 3. Abilitare GitHub Pages

1. Vai su GitHub nel tuo repository
2. Vai su **Settings** → **Pages**
3. Sotto **Source**, seleziona la branch `gh-pages` e la cartella `/ (root)`
4. Clicca **Save**

### 4. Accedere all'app

Dopo qualche minuto, l'app sarà disponibile su:
```
https://macorifice.github.io/vibe-app-pre-training/
```

## Deploy per repository con nome personalizzato

Se il tuo repository ha un nome diverso, modifica il `base-href` nello script `deploy` nel `package.json`.

Esempio: se il repository si chiama `my-angular-app`:
```json
"deploy": "ng build --configuration production --base-href=/my-angular-app/ && npx angular-cli-ghpages --dir=dist/vibe-app/browser"
```

## Troubleshooting

### L'app non carica correttamente
- Verifica che il `base-href` corrisponda al nome del repository
- Controlla la console del browser per errori 404
- Assicurati che GitHub Pages sia abilitato e punti alla branch `gh-pages`

### Errori durante il deploy
- Assicurati di aver fatto il commit iniziale: `git commit -m "Initial commit"`
- Verifica di avere i permessi sul repository GitHub
- Controlla che il token GitHub sia configurato correttamente (se richiesto)

## Aggiornamenti futuri

Ogni volta che vuoi aggiornare l'app online, esegui semplicemente:
```bash
npm run deploy
```

