import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AudioUploadComponent } from './components/audio-upload/audio-upload.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AudioUploadComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'vibe-app';
}
