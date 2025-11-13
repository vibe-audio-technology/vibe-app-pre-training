# 🎤 Vibe App - Analizzatore di Trascrizioni con Fonemi

Un'applicazione web Angular per analizzare e valutare trascrizioni audio con supporto per la visualizzazione e valutazione dei fonemi.

## 📋 Descrizione

Vibe App è uno strumento interattivo che permette di:
- **Caricare file JSON** contenenti trascrizioni audio con annotazioni dettagliate
- **Visualizzare frasi** con le relative parole e fonemi
- **Valutare la correttezza** di ogni singolo fonema
- **Esportare le valutazioni** per analisi successive

L'app è progettata per analizzare file JSON nel formato specifico che include:
- Segmenti di testo con timestamp
- Parole con score di confidenza
- Fonemi con timing e score dettagliati
- Informazioni sulla lingua

## ✨ Funzionalità

### 📤 Upload File JSON
- Interfaccia drag-and-drop intuitiva
- Validazione automatica del formato JSON
- Supporto per file `.json` e `application/json`
- Feedback visivo per errori e successi

### 🔍 Visualizzazione Interattiva
- **Frase completa**: Visualizzazione della frase con parole cliccabili
- **Dettagli parola**: Cliccando su una parola si visualizzano:
  - Tempo di inizio e fine
  - Score di confidenza
  - Durata della parola
  - Lista completa dei fonemi associati

### 🎯 Valutazione Fonemi
- **Marcatura corretti/scorretti**: Ogni fonema può essere marcato come:
  - ✅ Corretto
  - ❌ Scorretto
  - 🔄 Reset (per rimuovere la valutazione)
- **Indicatori visivi**: Colori e badge per identificare rapidamente lo stato
- **Statistiche in tempo reale**: Contatori di fonemi corretti, scorretti e non valutati

### 📊 Esportazione Dati
- Esporta tutte le valutazioni in formato JSON
- Include statistiche complete
- Timestamp dell'esportazione
- Dettagli completi di ogni fonema valutato

## 🚀 Come Usare

### 1. Carica un File JSON

Clicca sull'area di upload o trascina un file JSON. Il file deve avere il seguente formato:

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

### 2. Visualizza la Frase

Dopo il caricamento, vedrai la frase completa con tutte le parole. Ogni parola è cliccabile.

### 3. Analizza i Fonemi

Clicca su una parola per vedere:
- I suoi fonemi con timing preciso
- Score di confidenza per ogni fonema
- Sequenza completa dei fonemi

### 4. Valuta i Fonemi

Per ogni fonema puoi:
- Cliccare il pulsante ✅ per marcarlo come corretto
- Cliccare il pulsante ❌ per marcarlo come scorretto
- Cliccare il pulsante 🔄 per rimuovere la valutazione

### 5. Esporta le Valutazioni

Una volta completate le valutazioni, clicca su "Esporta Valutazioni" per scaricare un file JSON con tutti i risultati.

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
- **Angular CLI** - Tooling per sviluppo e build
- **GitHub Pages** - Hosting statico

## 📁 Struttura del Progetto

```
vibe-app/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   └── json-upload/
│   │   │       ├── json-upload.component.ts
│   │   │       ├── json-upload.component.html
│   │   │       └── json-upload.component.css
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

- **Design moderno**: Interfaccia pulita con gradienti e animazioni fluide
- **Responsive**: Funziona perfettamente su desktop, tablet e mobile
- **Feedback visivo**: Indicatori chiari per ogni azione
- **Accessibilità**: Supporto per screen reader e navigazione da tastiera

## 📝 Formato JSON Supportato

L'app supporta file JSON con la seguente struttura:

- `segments`: Array di segmenti audio
  - `start` / `end`: Timestamp in secondi
  - `text`: Testo trascritto
  - `words`: Array di parole con timing e score
  - `phonemes`: Array di fonemi con timing e score
- `word_segments`: Array alternativo di parole
- `phoneme_segments`: Array alternativo di fonemi
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
