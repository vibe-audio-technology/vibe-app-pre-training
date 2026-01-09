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

interface IpaPhoneme {
  ipa_symbol: string;
  orthographic: string;
  start: number;
  end: number;
  linguistic_weight: number;
  confidence: number;
  description: string;
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
  // Campi aggiuntivi dai nuovi dati IPA
  ipa_symbol?: string;
  orthographic?: string;
  linguistic_weight?: number;
  confidence?: number;
  description?: string;
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

  // Sample sentence properties
  sampleSentence: { text: string; ipa: string } | null = null;
  isLoadingSample: boolean = false;

  async loadRandomSample(): Promise<void> {
    this.isLoadingSample = true;
    try {
      // Il file è in public/mock/campione.txt, quindi accessibile da /mock/campione.txt
      const response = await fetch('/mock/campione.txt');
      if (!response.ok) {
        throw new Error(`Impossibile caricare il file campione.txt (status: ${response.status}). Assicurati che il server di sviluppo sia riavviato.`);
      }
      
      const content = await response.text();
      if (!content || content.trim().length === 0) {
        throw new Error('Il file campione.txt è vuoto');
      }
      
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      // Le frasi sono in coppie: testo italiano (riga dispari) e IPA (riga pari)
      const sentences: { text: string; ipa: string }[] = [];
      
      for (let i = 0; i < lines.length; i += 2) {
        if (i + 1 < lines.length) {
          const text = lines[i].trim();
          const ipa = lines[i + 1].trim();
          if (text && ipa) {
            sentences.push({ text, ipa });
          }
        }
      }
      
      if (sentences.length === 0) {
        throw new Error('Nessuna frase trovata nel file campione.txt');
      }
      
      // Seleziona una frase random
      const randomIndex = Math.floor(Math.random() * sentences.length);
      this.sampleSentence = sentences[randomIndex];
    } catch (error: any) {
      console.error('Errore nel caricamento del campione:', error);
      alert(`Errore nel caricamento del campione: ${error.message}\n\nAssicurati che:\n1. Il file esista in public/mock/campione.txt\n2. Il server di sviluppo sia riavviato`);
      this.sampleSentence = null;
    } finally {
      this.isLoadingSample = false;
    }
  }

  processJsonData(): void {
    // Nuova struttura: supporta sia il formato con result che quello diretto
    // Formato nuovo: text, word_segments, phoneme_segments, ipa_segments a livello root
    // Formato vecchio: result.text, result.aligned_segments, result.phoneme_segments
    if (!this.jsonContent) {
      return;
    }

    // Se jsonContent ha un campo result, usalo, altrimenti usa jsonContent direttamente
    const result = this.jsonContent.result || this.jsonContent;

    // Estrai il testo completo
    // Priorità: result.text > text (root) > segments[].text > asr_segments[].text
    if (result.text) {
      this.fullText = result.text.trim();
    } else if (this.jsonContent.text) {
      this.fullText = this.jsonContent.text.trim();
    } else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
      // Estrai testo dai segments
      this.fullText = result.segments
        .map((segment: any) => (segment.text || '').trim())
        .filter((text: string) => text.length > 0)
        .join(' ');
    } else if (result.asr_segments && Array.isArray(result.asr_segments) && result.asr_segments.length > 0) {
      this.fullText = result.asr_segments
        .map((segment: AsrSegment) => (segment.text || '').trim())
        .filter((text: string) => text.length > 0)
        .join(' ');
    } else {
      this.fullText = '';
    }

    // Estrai lista fonemi unici
    this.extractUniquePhonemes();

    // Raccogli tutte le parole allineate
    // Priorità: word_segments (root) > result.word_segments > segments[].words > aligned_segments[].words
    const alignedWords: Word[] = [];
    
    // Prima cerca a livello root
    if (this.jsonContent.word_segments && Array.isArray(this.jsonContent.word_segments) && this.jsonContent.word_segments.length > 0) {
      alignedWords.push(...this.jsonContent.word_segments);
    } else if (result.word_segments && Array.isArray(result.word_segments) && result.word_segments.length > 0) {
      alignedWords.push(...result.word_segments);
    } else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
      // Estrai parole dai segments
      result.segments.forEach((segment: any) => {
        if (segment.words && Array.isArray(segment.words) && segment.words.length > 0) {
          alignedWords.push(...segment.words);
        }
      });
    } else if (result.aligned_segments && Array.isArray(result.aligned_segments) && result.aligned_segments.length > 0) {
      result.aligned_segments.forEach((segment: AlignedSegment) => {
        if (segment.words && Array.isArray(segment.words) && segment.words.length > 0) {
          alignedWords.push(...segment.words);
        }
      });
    }
    
    // Ordina le parole allineate per timestamp
    alignedWords.sort((a: Word, b: Word) => a.start - b.start);

    // Raccogli tutti i fonemi
    // Priorità: ipa_segments (root) > result.ipa_segments > segments[].ipa_segments > segments[].phonemes > phoneme_segments
    const allPhonemes: Phoneme[] = [];
    let ipaPhonemes: IpaPhoneme[] = [];
    
    // Cerca IPA segments a livello root
    if (this.jsonContent.ipa_segments && Array.isArray(this.jsonContent.ipa_segments) && this.jsonContent.ipa_segments.length > 0) {
      ipaPhonemes = this.jsonContent.ipa_segments;
    } else if (result.ipa_segments && Array.isArray(result.ipa_segments) && result.ipa_segments.length > 0) {
      ipaPhonemes = result.ipa_segments;
    } else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
      // Estrai IPA segments dai segments
      result.segments.forEach((segment: any) => {
        if (segment.ipa_segments && Array.isArray(segment.ipa_segments) && segment.ipa_segments.length > 0) {
          ipaPhonemes.push(...segment.ipa_segments);
        }
      });
    }
    
    // Se ci sono dati IPA dettagliati, usali come fonte primaria
    if (ipaPhonemes.length > 0) {
      // Converti i dati IPA nel formato Phoneme standard
      ipaPhonemes.forEach((ipa: IpaPhoneme) => {
        allPhonemes.push({
          phoneme: ipa.ipa_symbol,
          start: ipa.start,
          end: ipa.end,
          score: ipa.linguistic_weight || ipa.confidence || 0.8
        });
      });
    } else {
      // Fallback ai phoneme_segments
      let phonemeSegments: Phoneme[] = [];
      
      // Cerca phoneme_segments a livello root
      if (this.jsonContent.phoneme_segments && Array.isArray(this.jsonContent.phoneme_segments) && this.jsonContent.phoneme_segments.length > 0) {
        phonemeSegments = this.jsonContent.phoneme_segments;
      } else if (result.phoneme_segments && Array.isArray(result.phoneme_segments) && result.phoneme_segments.length > 0) {
        phonemeSegments = result.phoneme_segments;
      } else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
        // Estrai phonemes dai segments
        result.segments.forEach((segment: any) => {
          if (segment.phonemes && Array.isArray(segment.phonemes) && segment.phonemes.length > 0) {
            phonemeSegments.push(...segment.phonemes);
          }
        });
      }
      
      allPhonemes.push(...phonemeSegments);
    }
    
    // Mantieni riferimento ai dati IPA completi per uso futuro
    // Crea un array ordinato per facilitare il matching
    const sortedIpaPhonemes = [...ipaPhonemes].sort((a, b) => a.start - b.start);

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
            
            // Cerca dati IPA dettagliati corrispondenti (match per timestamp e simbolo)
            let ipaData: IpaPhoneme | undefined;
            const tolerance = 0.01; // 10ms di tolleranza per il matching
            // Cerca il fonema IPA più vicino che corrisponde per timestamp e simbolo
            for (const ipa of sortedIpaPhonemes) {
              if (Math.abs(ipa.start - phoneme.start) < tolerance && 
                  Math.abs(ipa.end - phoneme.end) < tolerance &&
                  ipa.ipa_symbol === phoneme.phoneme) {
                ipaData = ipa;
                break;
              }
            }
            // Se non trovato con match esatto, prova solo con timestamp (per compatibilità)
            if (!ipaData) {
              for (const ipa of sortedIpaPhonemes) {
                if (Math.abs(ipa.start - phoneme.start) < tolerance && 
                    Math.abs(ipa.end - phoneme.end) < tolerance) {
                  ipaData = ipa;
                  break;
                }
              }
            }
            
            return {
              ...phoneme,
              id: phonemeId,
              isCorrect: isCorrect !== undefined ? isCorrect : null,
              // Aggiungi dati IPA dettagliati se disponibili
              ipa_symbol: ipaData?.ipa_symbol || phoneme.phoneme,
              orthographic: ipaData?.orthographic,
              linguistic_weight: ipaData?.linguistic_weight,
              confidence: ipaData?.confidence,
              description: ipaData?.description
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
    
    // Supporta il nuovo formato con dati a livello root o annidati
    if (!this.jsonContent) {
      this.uniquePhonemes = [];
      return;
    }

    const result = this.jsonContent.result || this.jsonContent;
    
    // Prima controlla i nuovi dati IPA dettagliati
    // Priorità: ipa_segments (root) > result.ipa_segments > segments[].ipa_segments
    let ipaPhonemes: IpaPhoneme[] = [];
    
    if (this.jsonContent.ipa_segments && Array.isArray(this.jsonContent.ipa_segments) && this.jsonContent.ipa_segments.length > 0) {
      ipaPhonemes = this.jsonContent.ipa_segments;
    } else if (result.ipa_segments && Array.isArray(result.ipa_segments) && result.ipa_segments.length > 0) {
      ipaPhonemes = result.ipa_segments;
    } else if (result.ipa_phoneme_segments && Array.isArray(result.ipa_phoneme_segments) && result.ipa_phoneme_segments.length > 0) {
      ipaPhonemes = result.ipa_phoneme_segments;
    } else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
      // Estrai IPA segments dai segments
      result.segments.forEach((segment: any) => {
        if (segment.ipa_segments && Array.isArray(segment.ipa_segments) && segment.ipa_segments.length > 0) {
          ipaPhonemes.push(...segment.ipa_segments);
        }
      });
    }
    
    if (ipaPhonemes.length > 0) {
      ipaPhonemes.forEach((ipa: IpaPhoneme) => {
        if (ipa.ipa_symbol) {
          // Normalizza in minuscolo per evitare duplicati tra maiuscole e minuscole
          phonemeSet.add(ipa.ipa_symbol.toLowerCase());
        }
      });
    }
    
    // Fallback ai dati phoneme_segments esistenti
    let phonemeSegments: Phoneme[] = [];
    
    if (this.jsonContent.phoneme_segments && Array.isArray(this.jsonContent.phoneme_segments) && this.jsonContent.phoneme_segments.length > 0) {
      phonemeSegments = this.jsonContent.phoneme_segments;
    } else if (result && result.phoneme_segments && Array.isArray(result.phoneme_segments) && result.phoneme_segments.length > 0) {
      phonemeSegments = result.phoneme_segments;
    } else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
      // Estrai phonemes dai segments
      result.segments.forEach((segment: any) => {
        if (segment.phonemes && Array.isArray(segment.phonemes) && segment.phonemes.length > 0) {
          phonemeSegments.push(...segment.phonemes);
        }
      });
    }
    
    if (phonemeSegments.length > 0) {
      phonemeSegments.forEach((phoneme: Phoneme) => {
        if (phoneme.phoneme) {
          // Normalizza in minuscolo per evitare duplicati tra maiuscole e minuscole
          phonemeSet.add(phoneme.phoneme.toLowerCase());
        }
      });
    }
    
    this.uniquePhonemes = Array.from(phonemeSet).sort();
  }

  getFullIpaTranscription(): string {
    if (!this.jsonContent) {
      return '';
    }

    const result = this.jsonContent.result || this.jsonContent;
    let ipaSegments: IpaPhoneme[] = [];

    // Cerca IPA segments a livello root
    if (this.jsonContent.ipa_segments && Array.isArray(this.jsonContent.ipa_segments) && this.jsonContent.ipa_segments.length > 0) {
      ipaSegments = this.jsonContent.ipa_segments;
    } else if (result.ipa_segments && Array.isArray(result.ipa_segments) && result.ipa_segments.length > 0) {
      ipaSegments = result.ipa_segments;
    } else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
      // Estrai IPA segments dai segments
      result.segments.forEach((segment: any) => {
        if (segment.ipa_segments && Array.isArray(segment.ipa_segments) && segment.ipa_segments.length > 0) {
          ipaSegments.push(...segment.ipa_segments);
        }
      });
    }

    if (ipaSegments.length === 0) {
      return '';
    }

    // Ordina per timestamp
    const sortedIpa = [...ipaSegments].sort((a, b) => a.start - b.start);
    
    // Concatena i simboli IPA con spazi appropriati
    const ipaString = sortedIpa.map(ipa => ipa.ipa_symbol).join(' ');
    
    // Formatta come trascrizione IPA standard
    return `/${ipaString}/`;
  }

  getFullText(): string {
    if (!this.jsonContent) {
      return '';
    }

    const result = this.jsonContent.result || this.jsonContent;
    
    // Priorità: result.text > text (root) > segments[].text > fullText (processato)
    if (result.text) {
      return result.text.trim();
    } else if (this.jsonContent.text) {
      return this.jsonContent.text.trim();
    } else if (this.fullText) {
      return this.fullText.trim();
    }
    
    return '';
  }

  shouldShowPhonemes(): boolean {
    // Mostra i fonemi solo se il testo della frase di esempio corrisponde alla trascrizione completa
    if (!this.sampleSentence || !this.sampleSentence.text) {
      return false;
    }

    const fullText = this.getFullText();
    if (!fullText) {
      return false;
    }

    // Confronta i testi in lowercase, rimuovendo spazi extra e punteggiatura
    const normalizeText = (text: string): string => {
      return text.toLowerCase()
        .trim()
        .replace(/\s+/g, ' ') // Normalizza spazi multipli
        .replace(/[.,!?;:]/g, ''); // Rimuove punteggiatura per il confronto
    };

    const sampleNormalized = normalizeText(this.sampleSentence.text);
    const fullTextNormalized = normalizeText(fullText);

    return sampleNormalized === fullTextNormalized;
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
    // Confronto case-insensitive
    const normalizedFilter = this.selectedPhonemeFilter.toLowerCase();
    return phonemes.filter(p => p.phoneme.toLowerCase() === normalizedFilter);
  }

  hasFilteredPhonemes(phonemes: PhonemeWithStatus[]): boolean {
    return this.getFilteredPhonemes(phonemes).length > 0;
  }

  wordContainsFilteredPhoneme(word: ProcessedWord): boolean {
    if (!this.selectedPhonemeFilter) {
      return true;
    }
    // Confronto case-insensitive
    const normalizedFilter = this.selectedPhonemeFilter.toLowerCase();
    return word.phonemes.some(p => p.phoneme.toLowerCase() === normalizedFilter);
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
    // Confronto case-insensitive
    const normalizedFilter = this.selectedPhonemeFilter.toLowerCase();
    let count = 0;
    this.processedWords.forEach(word => {
      count += word.phonemes.filter(p => p.phoneme.toLowerCase() === normalizedFilter).length;
    });
    return count;
  }

  canMarkPhoneme(phoneme: PhonemeWithStatus): boolean {
    // Se c'è un filtro attivo, permettere di votare solo per il fonema selezionato
    if (this.selectedPhonemeFilter) {
      // Confronto case-insensitive
      return phoneme.phoneme.toLowerCase() === this.selectedPhonemeFilter.toLowerCase();
    }
    // Se non c'è filtro, permettere di votare per tutti
    return true;
  }

  phonemeMatchesFilter(phoneme: PhonemeWithStatus): boolean {
    // Helper per il template: verifica se un fonema corrisponde al filtro (case-insensitive)
    if (!this.selectedPhonemeFilter) {
      return false;
    }
    return phoneme.phoneme.toLowerCase() === this.selectedPhonemeFilter.toLowerCase();
  }

  selectWord(word: ProcessedWord): void {
    this.selectedWord = this.selectedWord === word ? null : word;
    
    // Scroll automatico per mostrare il pannello quando una parola viene selezionata
    if (this.selectedWord) {
      setTimeout(() => {
        const wordElement = document.querySelector('.word-item.selected');
        if (wordElement) {
          const detailsElement = wordElement.nextElementSibling as HTMLElement;
          if (detailsElement && detailsElement.classList.contains('word-details-inline')) {
            detailsElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        }
      }, 100);
    }
  }

  getPhonemesString(phonemes: PhonemeWithStatus[]): string {
    return phonemes.map(p => p.phoneme).join(' ');
  }

  getPhonemeTooltip(phoneme: PhonemeWithStatus): string {
    let tooltip = `IPA: ${phoneme.phoneme}\nScore: ${(phoneme.score * 100).toFixed(1)}%`;
    
    if (phoneme.linguistic_weight !== undefined) {
      tooltip += `\nLinguistic Weight: ${(phoneme.linguistic_weight * 100).toFixed(1)}%`;
    }
    
    if (phoneme.confidence !== undefined) {
      tooltip += `\nConfidence: ${(phoneme.confidence * 100).toFixed(1)}%`;
    }
    
    if (phoneme.description) {
      tooltip += `\n${phoneme.description}`;
    }
    
    return tooltip;
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
        // Supporta sia il formato con result che quello diretto
        if (data.result) {
          this.jsonContent = data.result;
        } else if (data.text || data.word_segments || data.segments) {
          // Il risultato è direttamente in data (nuovo formato)
          this.jsonContent = data;
        } else {
          this.transcriptionStatus = 'error';
          this.transcriptionError = 'Trascrizione completata ma risultato non disponibile.';
          return;
        }
        this.processJsonData();
        this.transcriptionStatus = 'done';
        this.transcriptionMessage = 'Trascrizione completata con successo.';
        this.selectedWord = null;
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
          const evaluation: any = {
            word: word.word,
            phoneme: phoneme.phoneme,
            start: phoneme.start,
            end: phoneme.end,
            score: phoneme.score,
            isCorrect: phoneme.isCorrect,
            phonemeId: phoneme.id
          };
          
          // Aggiungi informazioni IPA aggiuntive se disponibili
          if (phoneme.ipa_symbol && phoneme.ipa_symbol !== phoneme.phoneme) {
            evaluation.ipa_symbol = phoneme.ipa_symbol;
          }
          if (phoneme.linguistic_weight !== undefined) {
            evaluation.linguistic_weight = phoneme.linguistic_weight;
          }
          if (phoneme.confidence !== undefined) {
            evaluation.confidence = phoneme.confidence;
          }
          if (phoneme.description) {
            evaluation.description = phoneme.description;
          }
          
          evaluations.push(evaluation);
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

