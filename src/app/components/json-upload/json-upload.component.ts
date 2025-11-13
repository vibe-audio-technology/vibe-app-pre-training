import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { v4 as uuidv4 } from 'uuid';

interface Segment {
  start: number;
  end: number;
  text: string;
  words: Word[];
  phonemes: Phoneme[];
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
  selector: 'app-json-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-upload.component.html',
  styleUrl: './json-upload.component.css'
})

export class JsonUploadComponent implements OnDestroy {
  uploadedFile: File | null = null;
  jsonContent: any = null;
  errorMessage: string = '';
  fileName: string = '';
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // Check if file is JSON
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        this.errorMessage = 'Please upload a valid JSON file.';
        this.jsonContent = null;
        this.uploadedFile = null;
        this.fileName = '';
        return;
      }

      this.uploadedFile = file;
      this.fileName = file.name;
      this.errorMessage = '';

      // Read and parse JSON file
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          this.jsonContent = JSON.parse(text);
          this.processJsonData();
          this.errorMessage = '';
        } catch (error) {
          this.errorMessage = 'Invalid JSON format. Please check your file.';
          this.jsonContent = null;
        }
      };
      reader.readAsText(file);
    }
  }

  processJsonData(): void {
    if (!this.jsonContent || !this.jsonContent.segments) {
      return;
    }

    // Estrai il testo completo
    this.fullText = this.jsonContent.segments
      .map((segment: Segment) => segment.text.trim())
      .join(' ');

    // Processa le parole con i loro fonemi
    this.processedWords = [];
    
    if (this.jsonContent.segments && this.jsonContent.segments.length > 0) {
      const segment = this.jsonContent.segments[0];
      
      if (segment.words && segment.phonemes) {
        segment.words.forEach((word: Word) => {
          // Trova i fonemi che appartengono a questa parola
          // Usa un margine di tolleranza per il matching
          const tolerance = 0.1;
          const wordPhonemes = segment.phonemes.filter((phoneme: Phoneme) => 
            phoneme.start >= (word.start - tolerance) && 
            phoneme.end <= (word.end + tolerance) &&
            !(phoneme.end < word.start || phoneme.start > word.end)
          );

          // Crea fonemi con stato e ID univoco
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
            word: word.word,
            start: word.start,
            end: word.end,
            score: word.score,
            phonemes: phonemesWithStatus
          });
        });
      }
    }
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

  onAudioSelected(event: Event): void {
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

      // Create object URL for audio playback
      if (this.audioUrl) {
        URL.revokeObjectURL(this.audioUrl);
      }
      this.audioUrl = URL.createObjectURL(file);

      // Initialize audio element
      this.initializeAudio();
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
      fileName: this.fileName,
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

  clearFile(): void {
    this.uploadedFile = null;
    this.jsonContent = null;
    this.errorMessage = '';
    this.fileName = '';
    this.selectedWord = null;
    this.fullText = '';
    this.processedWords = [];
    this.phonemeEvaluations.clear();
    // Reset file input
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  ngOnDestroy(): void {
    // Clean up audio URL when component is destroyed
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
    }
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
}

