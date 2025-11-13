import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { JsonUploadComponent } from './components/json-upload/json-upload.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, JsonUploadComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'vibe-app';
}
