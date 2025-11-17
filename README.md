# 🎤 Vibe App - Analizzatore di Trascrizioni con Fonemi

Un'applicazione web Angular per analizzare e valutare trascrizioni audio con supporto per la visualizzazione e valutazione dei fonemi, upload automatico su S3 e trascrizione in tempo reale.

## 📋 Descrizione

Vibe App è uno strumento interattivo che permette di:
- **Caricare file audio** (MP3, WAV, OGG, M4A, AAC, FLAC) che vengono automaticamente caricati su S3
- **Trascrizione automatica** con visualizzazione in tempo reale del processo
- **Riprodurre audio** e navigare tra parole e fonemi
- **Visualizzare frasi** con le relative parole e fonemi in un layout a due colonne
- **Filtrare per fonema** per analizzare specifici suoni
- **Valutare la correttezza** di ogni singolo fonema
- **Esportare le valutazioni** per analisi successive

L'app utilizza un endpoint API presigned per l'upload sicuro su S3 e avvia automaticamente la trascrizione, visualizzando tutti gli step del processo in modo trasparente.

## ✨ Funzionalità

### 🎵 Upload e Riproduzione Audio
- **Upload file audio**: Carica MP3, WAV, OGG, M4A, AAC, FLAC
- **Upload automatico su S3**: Utilizza endpoint presigned per upload sicuro
- **Player audio interattivo**: Controlli play/pause/stop con seek bar
- **Navigazione temporale**: Salta a parole e fonemi specifici
- **Visualizzazione progresso**: Barra di progresso con indicatori temporali

### 🔄 Trascrizione Automatica
- **Upload presigned**: Richiesta automatica di URL presigned all'endpoint `/uploads/url`
- **Caricamento S3**: Upload diretto del file su S3 con indicatore di progresso
- **Trascrizione automatica**: Avvio automatico della trascrizione dopo l'upload
- **Monitoraggio in tempo reale**: Visualizzazione degli step del processo:
  - Richiesta URL presigned
  - Upload su S3
  - Avvio trascrizione
  - Elaborazione
  - Completamento
- **Dettagli tecnici**: Visualizzazione di bucket S3, key e job ID

### 🔍 Visualizzazione Interattiva (Layout a Due Colonne)
- **Colonna sinistra**: Upload audio, player e stato trascrizione
- **Colonna destra**: Visualizzazione frase con fonemi
- **Frase completa**: Visualizzazione della frase con parole cliccabili
- **Dettagli parola**: Cliccando su una parola si visualizzano:
  - Tempo di inizio e fine
  - Score di confidenza
  - Durata della parola
  - Lista completa dei fonemi associati

### 🔎 Filtro Fonemi
- **Filtro per fonema**: Seleziona un fonema specifico per visualizzare solo le occorrenze
- **Statistiche filtrate**: Conta automatica delle occorrenze del fonema selezionato
- **Visualizzazione evidenziata**: Parole contenenti il fonema filtrato sono evidenziate
- **Valutazione filtrata**: Valuta solo i fonemi selezionati nel filtro

### 🎯 Valutazione Fonemi
- **Marcatura corretti/scorretti**: Ogni fonema può essere marcato come:
  - ✅ Corretto
  - ❌ Scorretto
  - 🔄 Reset (per rimuovere la valutazione)
- **Riproduzione fonema**: Clicca per ascoltare il singolo fonema
- **Indicatori visivi**: Colori e badge per identificare rapidamente lo stato
- **Statistiche in tempo reale**: Contatori di fonemi corretti, scorretti e non valutati

### 📊 Esportazione Dati
- Esporta tutte le valutazioni in formato JSON
- Include statistiche complete
- Timestamp dell'esportazione
- Dettagli completi di ogni fonema valutato

## 🚀 Come Usare

### 1. Configurazione API Endpoint

Prima di iniziare, assicurati di avere configurato l'API Endpoint nell'interfaccia. L'app utilizza:
- **Endpoint presigned**: `POST {API_ENDPOINT}/uploads/url` - per ottenere URL di upload sicuro
- **Endpoint trascrizione**: `POST {API_ENDPOINT}/transcriptions` - per avviare la trascrizione
- **Endpoint status**: `GET {API_ENDPOINT}/transcriptions/{jobId}` - per monitorare lo stato

### 2. Carica un File Audio

1. Clicca sull'area di upload o trascina un file audio (MP3, WAV, OGG, M4A, AAC, FLAC)
2. Il file viene automaticamente:
   - Validato come file audio valido
   - Caricato su S3 tramite URL presigned
   - Avviata la trascrizione automatica

### 3. Monitora il Processo

Nella colonna sinistra puoi vedere:
- **Step 1**: Richiesta URL presigned → Upload su S3
- **Step 2**: Avvio trascrizione → Elaborazione → Completamento
- Barra di progresso generale
- Dettagli tecnici (S3 bucket, key, job ID)

### 4. Riproduci l'Audio

Usa il player audio per:
- **Play/Pause/Stop**: Controlli standard di riproduzione
- **Seek**: Usa la barra di scorrimento per navigare nell'audio
- **Riproduci parola**: Clicca il pulsante play accanto a una parola
- **Riproduci fonema**: Clicca il pulsante play su un fonema specifico

### 5. Visualizza e Analizza i Fonemi

Nella colonna destra:
- **Visualizza la frase**: La frase completa con tutte le parole cliccabili
- **Filtra per fonema**: Usa il dropdown per selezionare un fonema specifico
- **Clicca su una parola**: Per vedere i dettagli e i fonemi associati
- **Esamina i fonemi**: Ogni fonema mostra:
  - Timing preciso (inizio/fine)
  - Score di confidenza
  - Sequenza fonemica

### 6. Valuta i Fonemi

Per ogni fonema puoi:
- **Cliccare ✅**: Marcarlo come corretto
- **Cliccare ❌**: Marcarlo come scorretto
- **Cliccare 🔄**: Rimuovere la valutazione (appare solo se già valutato)
- **Selezionare filtro**: Per valutare solo un fonema specifico, usa prima il filtro

### 7. Esporta le Valutazioni

Una volta completate le valutazioni:
- Clicca su "Esporta Valutazioni" nell'header
- Scarica un file JSON con tutte le valutazioni e statistiche

## 🛠️ Installazione e Sviluppo

### Prerequisiti

- Node.js (versione 18 o superiore)
- npm (incluso con Node.js)
- Angular CLI (installato globalmente o tramite npx)

### Installazione

1. Clona il repository:
```bash
git clone https://github.com/macorifice/vibe-app-pre-training.git
cd vibe-app-pre-training
```

2. Installa le dipendenze:
```bash
npm install
```

### Avvio in Sviluppo

```bash
npm start
```

L'app sarà disponibile su `http://localhost:4200/`

### Build per Produzione

```bash
npm run build:prod
```

I file compilati saranno nella cartella `dist/vibe-app/browser/`

## 🌐 Deploy su GitHub Pages

L'app è configurata per essere deployata su GitHub Pages. Vedi [DEPLOY.md](./DEPLOY.md) per le istruzioni dettagliate.

### Deploy Rapido

```bash
npm run deploy
```

Poi abilita GitHub Pages nelle impostazioni del repository selezionando la branch `gh-pages`.

L'app sarà disponibile su: **https://macorifice.github.io/vibe-app-pre-training/**

## 🏗️ Tecnologie Utilizzate

- **Angular 18** - Framework principale
- **TypeScript** - Linguaggio di programmazione
- **UUID** - Generazione di ID univoci per i fonemi
- **Fetch API** - Per chiamate HTTP (upload e trascrizione)
- **HTML5 Audio API** - Per riproduzione audio interattiva
- **Angular CLI** - Tooling per sviluppo e build
- **GitHub Pages** - Hosting statico

## 🔌 API Integration

L'app si integra con un backend API che deve fornire:

### Endpoint Presigned Upload
```
POST /uploads/url
Content-Type: application/json

Body: {
  "extension": "mp3",
  "contentType": "audio/mpeg"
}

Response: {
  "uploadUrl": "https://s3...",
  "s3Bucket": "bucket-name",
  "s3Key": "uploads/file.mp3"
}
```

### Endpoint Trascrizione
```
POST /transcriptions
Content-Type: application/json

Body: {
  "s3Bucket": "bucket-name",
  "s3Key": "uploads/file.mp3",
  "language": "it"
}

Response: {
  "jobId": "job-uuid"
}
```

### Endpoint Status Trascrizione
```
GET /transcriptions/{jobId}

Response: {
  "status": "DONE|PENDING|PROCESSING|FAILED",
  "result": { ... }, // solo se status === "DONE"
  "error": "..." // solo se status === "FAILED"
}
```

## 📁 Struttura del Progetto

```
vibe-app/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   └── audio-upload/
│   │   │       ├── audio-upload.component.ts
│   │   │       ├── audio-upload.component.html
│   │   │       └── audio-upload.component.css
│   │   ├── app.component.ts
│   │   └── app.component.html
│   ├── main.ts
│   └── styles.css
├── public/
│   └── .nojekyll
├── angular.json
├── package.json
└── README.md
```

## 🎨 Caratteristiche UI/UX

- **Layout a due colonne**: Upload/audio a sinistra, analisi fonemi a destra
- **Design moderno**: Interfaccia pulita con gradienti e animazioni fluide
- **Visualizzazione processo**: Step indicator con progresso in tempo reale
- **Sticky sidebar**: Colonna destra rimane visibile durante lo scroll
- **Responsive**: Funziona perfettamente su desktop, tablet e mobile (layout si impila su mobile)
- **Feedback visivo**: Indicatori chiari per ogni azione e stato
- **Accessibilità**: Supporto per screen reader e navigazione da tastiera
- **Player audio integrato**: Controlli intuitivi con seek bar e tempo

## 📝 Formato Audio Supportato

### File Audio
L'app supporta i seguenti formati audio:
- **MP3** (.mp3) - audio/mpeg
- **WAV** (.wav) - audio/wav
- **OGG** (.ogg) - audio/ogg
- **M4A** (.m4a) - audio/m4a
- **AAC** (.aac) - audio/aac
- **FLAC** (.flac) - audio/flac

### Formato JSON Trascrizione

Il backend deve restituire un JSON con la seguente struttura:

```json
{
  "segments": [
    {
      "start": 0.065,
      "end": 5.637,
      "text": "Una persiana arrabbiata...",
      "words": [
        {
          "word": "Una",
          "start": 0.065,
          "end": 0.628,
          "score": 0.941
        }
      ],
      "phonemes": [
        {
          "phoneme": "U",
          "start": 0.065,
          "end": 0.548,
          "score": 0.854
        }
      ]
    }
  ],
  "language": "it"
}
```

Struttura supportata:
- `segments`: Array di segmenti audio
  - `start` / `end`: Timestamp in secondi
  - `text`: Testo trascritto
  - `words`: Array di parole con timing e score
  - `phonemes`: Array di fonemi con timing e score
- `language`: Codice lingua (es. "it", "en")

## 🤝 Contribuire

1. Fai un fork del progetto
2. Crea un branch per la tua feature (`git checkout -b feature/AmazingFeature`)
3. Commit delle modifiche (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Apri una Pull Request

## 📄 Licenza

Questo progetto è open source e disponibile sotto licenza MIT.

## 👤 Autore

**macorifice**

- GitHub: [@macorifice](https://github.com/macorifice)

## 🙏 Ringraziamenti

- Angular team per il framework eccellente
- Community Angular per il supporto e le risorse

---

⭐ Se questo progetto ti è utile, considera di lasciare una stella!
