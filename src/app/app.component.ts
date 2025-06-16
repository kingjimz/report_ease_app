import { Component, OnInit } from '@angular/core';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Router, RouterOutlet } from '@angular/router';
import { ApiService } from './_services/api.service';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [RouterOutlet, CommonModule]
})
export class AppComponent implements OnInit {
  deferredPrompt: any;
  showInstallButton = false;

  constructor(private auth: Auth, private router: Router, private api: ApiService) {

  }

  ngOnInit() {
     window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event;
      this.showInstallButton = true;
    });
    
    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.router.navigateByUrl('/');
        this.loadBibleStudies();
      } else {
        this.router.navigateByUrl('/login');
      }
    });
  }

  async loadBibleStudies() {
    await this.api.getBibleStudies().then((data) => {
    }).catch(error => {
      console.error('Error fetching Bible studies:', error);
    });
  }

  installPWA() {
  if (this.deferredPrompt) {
    this.deferredPrompt.prompt(); // ✅ this shows the prompt
    this.deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('PWA setup accepted');
      }
      this.deferredPrompt = null;
      this.showInstallButton = false;
    });
  }
}

}
