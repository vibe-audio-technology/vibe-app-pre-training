import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { v4 as uuidv4 } from 'uuid';

interface AsrSegment {
  start: number;
  end: number;
  text: string;
}

interface AlignedSegment {
  start: number;
  end: number;
  text: string;
  words: Word[];
}

interface Word {
  word: string;
  start: number;
  end: number;
  score: number;
}

interface Phoneme {
  phoneme: string;
  start: number;
  end: number;
  score: number;
}

interface ProcessedWord {
  word: string;
  start: number;
  end: number;
  score: number;
  phonemes: PhonemeWithStatus[];
}

interface PhonemeWithStatus extends Phoneme {
  id: string;
  isCorrect?: boolean | null; // null = non valutato, true = corretto, false = scorretto
}

@Component({
  selector: 'app-audio-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audio-upload.component.html',
  styleUrl: './audio-upload.component.css'
})

export class AudioUploadComponent implements OnDestroy {
  jsonContent: any = null;
  selectedWord: ProcessedWord | null = null;
  fullText: string = '';
  processedWords: ProcessedWord[] = [];
  phonemeEvaluations: Map<string, boolean> = new Map(); // Map<phonemeId, isCorrect>
  
  // Audio properties
  audioFile: File | null = null;
  audioUrl: string | null = null;
  audioFileName: string = '';
  audioError: string = '';
  isPlaying: boolean = false;
  currentTime: number = 0;
  duration: number = 0;
  audioElement: HTMLAudioElement | null = null;
  
  // Filter properties
  uniquePhonemes: string[] = [];
  selectedPhonemeFilter: string | null = null;

  // API transcription properties
  apiEndpoint: string = 'https://0aykjexie5.execute-api.eu-north-1.amazonaws.com';
  apiBucket: string = 'whisperxinfrastack-audiobucket96beecba-yfuy7gyxedio ';
  apiKey: string = 'uploads/';
  apiLanguage: string = 'it';
  transcriptionJobId: string | null = null;
  transcriptionStatus: 'idle' | 'requesting' | 'pending' | 'processing' | 'done' | 'error' = 'idle';
  transcriptionMessage: string = '';
  transcriptionError: string = '';
  pollingTimeout: any = null;
  isUploadingAudio: boolean = false;
  uploadMessage: string = '';
  uploadError: string = '';
  uploadStep: 'idle' | 'requesting-url' | 'uploading' | 'completed' | 'error' = 'idle';
  s3BucketDisplay: string = '';
  s3KeyDisplay: string = '';

  processJsonData(): void {
    // Nuova struttura: result.text, result.aligned_segments, result.phoneme_segments
    // jsonContent può essere direttamente il result (dalla API) oppure contenere un campo result
    if (!this.jsonContent) {
      return;
    }

    // Se jsonContent ha un campo result, usalo, altrimenti usa jsonContent direttamente
    const result = this.jsonContent.result || this.jsonContent;

    // Estrai il testo completo (usa result.text se disponibile, altrimenti da asr_segments)
    // NON usare aligned_segments per il testo completo perché spesso contiene solo l'ultimo segmento
    if (result.text) {
      this.fullText = result.text.trim();
    } else if (result.asr_segments && Array.isArray(result.asr_segments) && result.asr_segments.length > 0) {
      this.fullText = result.asr_segments
        .map((segment: AsrSegment) => (segment.text || '').trim())
        .filter((text: string) => text.length > 0)
        .join(' ');
    } else {
      this.fullText = '';
    }

    // Estrai lista fonemi unici da result.phoneme_segments
    this.extractUniquePhonemes();

    // Raccogli tutte le parole allineate da word_segments o aligned_segments
    const alignedWords: Word[] = [];
    
    if (result.word_segments && Array.isArray(result.word_segments) && result.word_segments.length > 0) {
      alignedWords.push(...result.word_segments);
    } else if (result.aligned_segments && Array.isArray(result.aligned_segments) && result.aligned_segments.length > 0) {
      result.aligned_segments.forEach((segment: AlignedSegment) => {
        if (segment.words && Array.isArray(segment.words) && segment.words.length > 0) {
          alignedWords.push(...segment.words);
        }
      });
    }
    
    // Ordina le parole allineate per timestamp
    alignedWords.sort((a: Word, b: Word) => a.start - b.start);

    // Raccogli tutti i fonemi da phoneme_segments
    const allPhonemes: Phoneme[] = result.phoneme_segments || [];

    // Crea una mappa delle parole allineate per matching rapido (normalizza la parola)
    const alignedWordsMap = new Map<string, Word[]>();
    alignedWords.forEach((word: Word) => {
      const normalizedWord = word.word.toLowerCase().replace(/[.,!?;:]/g, '');
      if (!alignedWordsMap.has(normalizedWord)) {
        alignedWordsMap.set(normalizedWord, []);
      }
      alignedWordsMap.get(normalizedWord)!.push(word);
    });

    // Tokenizza tutto il testo completo per creare tutte le parole
    const allTextWords = this.fullText
      .split(/(\s+|[.,!?;:])/)
      .filter(token => token.trim().length > 0);

    // Processa tutte le parole del testo completo
    this.processedWords = [];
    let alignedWordIndex = 0;

    allTextWords.forEach((token: string) => {
      // Salta spazi e punteggiatura standalone
      if (/^[\s.,!?;:]+$/.test(token)) {
        return;
      }

      // Normalizza la parola per il matching
      const normalizedToken = token.toLowerCase().replace(/[.,!?;:]/g, '');
      
      // Cerca se questa parola ha allineamento
      let matchedWord: Word | null = null;
      
      // Prova prima a matchare per posizione sequenziale
      if (alignedWordIndex < alignedWords.length) {
        const alignedWord = alignedWords[alignedWordIndex];
        const alignedNormalized = alignedWord.word.toLowerCase().replace(/[.,!?;:]/g, '');
        if (normalizedToken === alignedNormalized) {
          matchedWord = alignedWord;
          alignedWordIndex++;
        }
      }
      
      // Se non trovato per posizione, cerca nella mappa (per parole duplicate)
      if (!matchedWord && alignedWordsMap.has(normalizedToken)) {
        const candidates = alignedWordsMap.get(normalizedToken)!;
        // Usa il primo match disponibile (potrebbe essere migliorato)
        matchedWord = candidates[0];
      }

      if (matchedWord) {
        // Parola con allineamento - trova i fonemi associati
        const tolerance = 0.1;
        const wordPhonemes = allPhonemes.filter((phoneme: Phoneme) => 
          phoneme.start >= (matchedWord!.start - tolerance) && 
          phoneme.end <= (matchedWord!.end + tolerance) &&
          !(phoneme.end < matchedWord!.start || phoneme.start > matchedWord!.end)
        );

        const phonemesWithStatus: PhonemeWithStatus[] = wordPhonemes
          .sort((a: Phoneme, b: Phoneme) => a.start - b.start)
          .map((phoneme: Phoneme) => {
            const phonemeId = uuidv4();
            const isCorrect = this.phonemeEvaluations.get(phonemeId);
            return {
              ...phoneme,
              id: phonemeId,
              isCorrect: isCorrect !== undefined ? isCorrect : null
            };
          });

        this.processedWords.push({
          word: token,
          start: matchedWord.start,
          end: matchedWord.end,
          score: matchedWord.score,
          phonemes: phonemesWithStatus
        });
      } else {
        // Parola senza allineamento - crea una parola "virtuale" senza timestamp
        this.processedWords.push({
          word: token,
          start: -1, // Indica che non ha allineamento
          end: -1,
          score: 0,
          phonemes: []
        });
      }
    });
  }

  extractUniquePhonemes(): void {
    const phonemeSet = new Set<string>();
    
    // Nuova struttura: result.phoneme_segments è un array flat di fonemi
    // jsonContent può essere direttamente il result (dalla API) oppure contenere un campo result
    if (!this.jsonContent) {
      this.uniquePhonemes = [];
      return;
    }

    const result = this.jsonContent.result || this.jsonContent;
    
    if (result && result.phoneme_segments) {
      const phonemeSegments = result.phoneme_segments;
      
      if (Array.isArray(phonemeSegments) && phonemeSegments.length > 0) {
        phonemeSegments.forEach((phoneme: Phoneme) => {
          if (phoneme.phoneme) {
            phonemeSet.add(phoneme.phoneme);
          }
        });
      }
    }
    
    this.uniquePhonemes = Array.from(phonemeSet).sort();
  }

  onPhonemeFilterChange(phoneme: string | null): void {
    this.selectedPhonemeFilter = phoneme;
    // Se c'è un filtro attivo e una parola selezionata, deseleziona la parola per mostrare la vista globale
    if (phoneme && this.selectedWord) {
      this.selectedWord = null;
    }
  }

  getFilteredPhonemes(phonemes: PhonemeWithStatus[]): PhonemeWithStatus[] {
    if (!this.selectedPhonemeFilter) {
      return phonemes;
    }
    return phonemes.filter(p => p.phoneme === this.selectedPhonemeFilter);
  }

  hasFilteredPhonemes(phonemes: PhonemeWithStatus[]): boolean {
    return this.getFilteredPhonemes(phonemes).length > 0;
  }

  wordContainsFilteredPhoneme(word: ProcessedWord): boolean {
    if (!this.selectedPhonemeFilter) {
      return true;
    }
    return word.phonemes.some(p => p.phoneme === this.selectedPhonemeFilter);
  }

  getFilteredWords(): ProcessedWord[] {
    if (!this.selectedPhonemeFilter) {
      return this.processedWords;
    }
    return this.processedWords.filter(word => this.wordContainsFilteredPhoneme(word));
  }

  getTotalFilteredPhonemesCount(): number {
    if (!this.selectedPhonemeFilter) {
      return 0;
    }
    let count = 0;
    this.processedWords.forEach(word => {
      count += word.phonemes.filter(p => p.phoneme === this.selectedPhonemeFilter).length;
    });
    return count;
  }

  canMarkPhoneme(phoneme: PhonemeWithStatus): boolean {
    // Se c'è un filtro attivo, permettere di votare solo per il fonema selezionato
    if (this.selectedPhonemeFilter) {
      return phoneme.phoneme === this.selectedPhonemeFilter;
    }
    // Se non c'è filtro, permettere di votare per tutti
    return true;
  }

  selectWord(word: ProcessedWord): void {
    this.selectedWord = this.selectedWord === word ? null : word;
  }

  getPhonemesString(phonemes: PhonemeWithStatus[]): string {
    return phonemes.map(p => p.phoneme).join(' ');
  }

  formatTime(seconds: number): string {
    return seconds.toFixed(3) + 's';
  }

  markPhoneme(phoneme: PhonemeWithStatus, isCorrect: boolean): void {
    this.phonemeEvaluations.set(phoneme.id, isCorrect);
    phoneme.isCorrect = isCorrect;
  }

  async onAudioSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // Check if file is audio
      if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) {
        this.audioError = 'Please upload a valid audio file.';
        this.audioFile = null;
        this.audioFileName = '';
        if (this.audioUrl) {
          URL.revokeObjectURL(this.audioUrl);
          this.audioUrl = null;
        }
        return;
      }

      this.audioFile = file;
      this.audioFileName = file.name;
      this.audioError = '';
      this.resetTranscriptionState();
      this.apiKey = `uploads/${file.name}`;

      // Create object URL for audio playback
      if (this.audioUrl) {
        URL.revokeObjectURL(this.audioUrl);
      }
      this.audioUrl = URL.createObjectURL(file);

      // Initialize audio element
      this.initializeAudio();

      await this.handlePresignedUploadAndTranscription(file);
    }
  }

  initializeAudio(): void {
    if (this.audioUrl) {
      // Wait for next tick to ensure audio element exists in DOM
      setTimeout(() => {
        const audioEl = document.getElementById('audioPlayer') as HTMLAudioElement;
        if (audioEl) {
          this.audioElement = audioEl;
          audioEl.src = this.audioUrl || '';
          audioEl.load();
          
          audioEl.addEventListener('loadedmetadata', () => {
            this.duration = audioEl.duration;
          });

          audioEl.addEventListener('timeupdate', () => {
            this.currentTime = audioEl.currentTime;
          });

          audioEl.addEventListener('play', () => {
            this.isPlaying = true;
          });

          audioEl.addEventListener('pause', () => {
            this.isPlaying = false;
          });

          audioEl.addEventListener('ended', () => {
            this.isPlaying = false;
          });
        }
      }, 100);
    }
  }

  playAudio(): void {
    if (this.audioElement) {
      this.audioElement.play();
    }
  }

  pauseAudio(): void {
    if (this.audioElement) {
      this.audioElement.pause();
    }
  }

  stopAudio(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
  }

  playFromTimestamp(timestamp: number, endTime?: number, margin: number = 0.05): void {
    if (this.audioElement && this.audioUrl) {
      // Applica margine: inizia un po' prima e finisci un po' dopo
      const startTime = Math.max(0, timestamp - margin);
      this.audioElement.currentTime = startTime;
      
      // Se c'è un endTime, imposta un listener per fermare la riproduzione
      if (endTime !== undefined) {
        const endTimeWithMargin = Math.min(this.duration || Infinity, endTime + margin);
        const stopAtEnd = () => {
          if (this.audioElement && this.audioElement.currentTime >= endTimeWithMargin) {
            this.audioElement.pause();
            this.audioElement.removeEventListener('timeupdate', stopAtEnd);
          }
        };
        
        // Rimuovi eventuali listener precedenti
        this.audioElement.removeEventListener('timeupdate', stopAtEnd);
        // Aggiungi il nuovo listener
        this.audioElement.addEventListener('timeupdate', stopAtEnd);
      }
      
      this.audioElement.play();
    }
  }

  playPhoneme(phoneme: PhonemeWithStatus): void {
    // Usa un margine più grande per i fonemi (100ms) per sentire meglio il contesto
    this.playFromTimestamp(phoneme.start, phoneme.end, 0.1);
  }

  playWord(word: ProcessedWord): void {
    // Usa un margine più piccolo per le parole (50ms)
    this.playFromTimestamp(word.start, word.end, 0.05);
  }

  formatTimeDisplay(seconds: number): string {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  onTimeUpdate(event: Event): void {
    const audio = event.target as HTMLAudioElement;
    this.currentTime = audio.currentTime;
  }

  onSeek(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (this.audioElement) {
      const seekTime = (parseFloat(input.value) / 100) * this.duration;
      this.audioElement.currentTime = seekTime;
    }
  }

  clearAudio(): void {
    this.stopAudio();
    this.audioFile = null;
    this.audioFileName = '';
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
    }
    this.audioError = '';
    if (this.audioElement) {
      this.audioElement.src = '';
    }
    // Reset file input
    const audioInput = document.getElementById('audioInput') as HTMLInputElement;
    if (audioInput) {
      audioInput.value = '';
    }
    this.resetTranscriptionState();
    this.resetUploadState();
    this.s3BucketDisplay = '';
    this.s3KeyDisplay = '';
  }

  clearPhonemeEvaluation(phoneme: PhonemeWithStatus): void {
    this.phonemeEvaluations.delete(phoneme.id);
    phoneme.isCorrect = null;
  }

  getEvaluationStats(): { total: number; correct: number; incorrect: number; notEvaluated: number } {
    let correct = 0;
    let incorrect = 0;
    let notEvaluated = 0;

    this.processedWords.forEach(word => {
      word.phonemes.forEach(phoneme => {
        if (phoneme.isCorrect === true) {
          correct++;
        } else if (phoneme.isCorrect === false) {
          incorrect++;
        } else {
          notEvaluated++;
        }
      });
    });

    return {
      total: correct + incorrect + notEvaluated,
      correct,
      incorrect,
      notEvaluated
    };
  }

  canStartTranscription(): boolean {
    const endpoint = this.apiEndpoint.trim();
    const bucket = this.apiBucket.trim();
    const key = this.apiKey.trim();
    return (
      !!this.audioFile &&
      !!endpoint &&
      !!bucket &&
      !!key &&
      !this.isTranscriptionInProgress()
    );
  }

  isTranscriptionInProgress(): boolean {
    return (
      this.transcriptionStatus === 'requesting' ||
      this.transcriptionStatus === 'pending' ||
      this.transcriptionStatus === 'processing'
    );
  }

  async startTranscription(): Promise<void> {
    if (!this.canStartTranscription()) {
      this.transcriptionError = 'Fornisci endpoint, bucket e chiave S3 prima di procedere.';
      return;
    }

    const endpointTrimmed = this.normalizeEndpoint(this.apiEndpoint.trim());
    const bucketTrimmed = this.apiBucket.trim();
    const keyTrimmed = this.apiKey.trim();
    const languageTrimmed = this.apiLanguage?.trim() || 'it';

    this.transcriptionError = '';
    this.transcriptionMessage = 'Invio richiesta di trascrizione...';
    this.transcriptionStatus = 'requesting';
    this.transcriptionJobId = null;
    this.clearExistingPolling();

    try {
      const response = await fetch(`${endpointTrimmed}/transcriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          s3Bucket: bucketTrimmed,
          s3Key: keyTrimmed,
          language: languageTrimmed
        })
      });

      if (!response.ok) {
        throw new Error(`Errore API (${response.status}): ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.jobId) {
        throw new Error('Risposta inattesa: jobId mancante.');
      }

      this.transcriptionJobId = data.jobId;
      this.transcriptionStatus = 'pending';
      this.transcriptionMessage = 'Trascrizione avviata. Attendere il completamento...';
      this.pollTranscriptionStatus(data.jobId, endpointTrimmed);
    } catch (error: any) {
      this.transcriptionStatus = 'error';
      this.transcriptionError = error?.message || 'Errore durante l\'avvio della trascrizione.';
    }
  }

  private normalizeEndpoint(endpoint: string): string {
    return endpoint ? endpoint.replace(/\/+$/, '') : '';
  }

  private clearExistingPolling(): void {
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = null;
    }
  }

  private resetTranscriptionState(): void {
    this.clearExistingPolling();
    this.transcriptionJobId = null;
    this.transcriptionStatus = 'idle';
    this.transcriptionMessage = '';
    this.transcriptionError = '';
  }

  private resetUploadState(): void {
    this.isUploadingAudio = false;
    this.uploadMessage = '';
    this.uploadError = '';
    this.uploadStep = 'idle';
    this.s3BucketDisplay = '';
    this.s3KeyDisplay = '';
  }

  private async handlePresignedUploadAndTranscription(file: File): Promise<void> {
    const endpoint = this.normalizeEndpoint(this.apiEndpoint.trim());
    if (!endpoint) {
      this.uploadError = 'Fornisci un API Endpoint valido per ottenere l’URL di upload.';
      this.transcriptionMessage = 'Audio caricato. Compila endpoint per avviare la trascrizione.';
      return;
    }

    try {
      this.resetUploadState();
      this.isUploadingAudio = true;
      this.uploadStep = 'requesting-url';
      this.uploadMessage = 'Richiesta URL presigned per upload...';

      const { uploadUrl, s3Bucket, s3Key } = await this.requestPresignedUpload(endpoint, file);
      this.apiBucket = s3Bucket;
      this.apiKey = s3Key;
      this.s3BucketDisplay = s3Bucket;
      this.s3KeyDisplay = s3Key;

      this.uploadStep = 'uploading';
      this.uploadMessage = `Upload file su S3 in corso... (bucket: ${s3Bucket}, key: ${s3Key})`;
      await this.uploadFileToPresignedUrl(uploadUrl, file);

      this.uploadStep = 'completed';
      this.uploadMessage = 'File caricato correttamente su S3.';
      this.isUploadingAudio = false;

      if (this.canStartTranscription()) {
        await this.startTranscription();
      } else {
        this.transcriptionStatus = 'idle';
        this.transcriptionMessage = 'Audio caricato. Compila bucket/key per avviare la trascrizione.';
      }
    } catch (error: any) {
      this.isUploadingAudio = false;
      this.uploadStep = 'error';
      this.uploadError = error?.message || 'Errore durante il caricamento dell\'audio.';
    }
  }

  private async requestPresignedUpload(endpoint: string, file: File): Promise<{ uploadUrl: string; s3Bucket: string; s3Key: string; }> {
    const extension = this.getFileExtension(file.name) || 'mp3';
    const contentType = file.type || 'audio/mpeg';

    const response = await fetch(`${endpoint}/uploads/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extension,
        contentType
      })
    });

    if (!response.ok) {
      throw new Error(`Errore durante la richiesta URL firmato (${response.status}).`);
    }

    const data = await response.json();
    if (!data.uploadUrl || !data.s3Bucket || !data.s3Key) {
      throw new Error('Risposta inattesa: dati URL firmato mancanti.');
    }

    return data;
  }

  private async uploadFileToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'audio/mpeg'
      },
      body: file
    });

    if (!response.ok) {
      throw new Error(`Errore durante l’upload su S3 (${response.status}).`);
    }
  }

  private getFileExtension(fileName: string): string | null {
    const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
    return match ? match[1].toLowerCase() : null;
  }

  private async pollTranscriptionStatus(jobId: string, endpoint: string): Promise<void> {
    this.clearExistingPolling();
    try {
      const response = await fetch(`${endpoint}/transcriptions/${jobId}`);
      if (!response.ok) {
        throw new Error(`Errore API (${response.status}): ${response.statusText}`);
      }

      const data = await response.json();
      const status = (data.status || '').toUpperCase();

      if (status === 'DONE') {
        if (data.result) {
          this.jsonContent = data.result;
          this.processJsonData();
          this.transcriptionStatus = 'done';
          this.transcriptionMessage = 'Trascrizione completata con successo.';
          this.selectedWord = null;
        } else {
          this.transcriptionStatus = 'error';
          this.transcriptionError = 'Trascrizione completata ma risultato non disponibile.';
        }
        return;
      }

      if (status === 'FAILED' || status === 'ERROR') {
        this.transcriptionStatus = 'error';
        this.transcriptionError = data.error || 'La trascrizione è fallita.';
        return;
      }

      if (status === 'PROCESSING') {
        this.transcriptionStatus = 'processing';
        this.transcriptionMessage = 'La trascrizione è in corso...';
      } else {
        this.transcriptionStatus = 'pending';
        this.transcriptionMessage = 'In attesa che la trascrizione inizi...';
      }

      this.pollingTimeout = setTimeout(() => {
        this.pollTranscriptionStatus(jobId, endpoint);
      }, 3000);
    } catch (error: any) {
      this.transcriptionStatus = 'error';
      this.transcriptionError = error?.message || 'Errore durante il recupero dello stato della trascrizione.';
    }
  }

  exportEvaluations(): void {
    const evaluations: any[] = [];
    
    this.processedWords.forEach(word => {
      word.phonemes.forEach(phoneme => {
        if (phoneme.isCorrect !== null) {
          evaluations.push({
            word: word.word,
            phoneme: phoneme.phoneme,
            start: phoneme.start,
            end: phoneme.end,
            score: phoneme.score,
            isCorrect: phoneme.isCorrect,
            phonemeId: phoneme.id
          });
        }
      });
    });

    const jsonString = JSON.stringify({
      audioFileName: this.audioFileName,
      evaluatedAt: new Date().toISOString(),
      evaluations: evaluations,
      statistics: this.getEvaluationStats()
    }, null, 2);

    // Crea e scarica il file
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phoneme-evaluations-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
    }
    this.clearExistingPolling();
  }

  copyToClipboard(): void {
    if (this.jsonContent) {
      const jsonString = JSON.stringify(this.jsonContent, null, 2);
      navigator.clipboard.writeText(jsonString).then(() => {
        // You could add a toast notification here
        console.log('JSON copied to clipboard');
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }
  }

  getUploadStepLabel(): string {
    switch (this.uploadStep) {
      case 'requesting-url':
        return 'Richiesta URL presigned';
      case 'uploading':
        return 'Upload su S3';
      case 'completed':
        return 'Upload completato';
      case 'error':
        return 'Errore upload';
      default:
        return 'In attesa';
    }
  }

  getTranscriptionStepLabel(): string {
    switch (this.transcriptionStatus) {
      case 'requesting':
        return 'Avvio trascrizione';
      case 'pending':
        return 'In coda';
      case 'processing':
        return 'Elaborazione';
      case 'done':
        return 'Completato';
      case 'error':
        return 'Errore';
      default:
        return 'Non avviato';
    }
  }

  isProcessInProgress(): boolean {
    return this.isUploadingAudio || this.isTranscriptionInProgress();
  }

  getOverallProgress(): { current: number; total: number; percentage: number } {
    // Upload step: 0-2, Transcription step: 3-5
    let current = 0;
    const total = 5;

    if (this.uploadStep === 'requesting-url') {
      current = 1;
    } else if (this.uploadStep === 'uploading') {
      current = 2;
    } else if (this.uploadStep === 'completed') {
      current = 3;
      if (this.transcriptionStatus === 'requesting') {
        current = 3;
      } else if (this.transcriptionStatus === 'pending' || this.transcriptionStatus === 'processing') {
        current = 4;
      } else if (this.transcriptionStatus === 'done') {
        current = 5;
      }
    } else if (this.uploadStep === 'error' || this.transcriptionStatus === 'error') {
      current = 0; // Reset on error
    }

    return {
      current,
      total,
      percentage: Math.round((current / total) * 100)
    };
  }
}

