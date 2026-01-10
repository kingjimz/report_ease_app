import { Component, OnInit, OnDestroy } from '@angular/core';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Router, RouterOutlet } from '@angular/router';
import { ApiService } from './_services/api.service';
import { CommonModule } from '@angular/common';
import { PwaInstallPromptComponent } from './components/pwa-install-prompt/pwa-install-prompt.component';
import { ThemeService } from './services/theme.service';
import { NetworkService } from './_services/network.service';
import { Subscription } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [RouterOutlet, CommonModule, PwaInstallPromptComponent],
})
export class AppComponent implements OnInit, OnDestroy {
  isOnline = true;
  private networkSubscription?: Subscription;

  constructor(
    private auth: Auth,
    private router: Router,
    private api: ApiService,
    private themeService: ThemeService,
    private networkService: NetworkService,
  ) {}

  ngOnInit() {
    // Subscribe to network status
    this.networkSubscription = this.networkService.onlineStatus$.subscribe(
      (isOnline) => {
        this.isOnline = isOnline;
        if (isOnline) {
          console.log('App is back online, syncing data...');
        } else {
          console.log('App is offline, using cached data');
        }
      }
    );
    this.isOnline = this.networkService.isOnline;

    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.router.navigateByUrl('/');
        // Load Bible studies (will use cache if offline)
        this.loadBibleStudies();
      } else {
        // Only redirect to login if online (offline users should stay on current page)
        if (this.networkService.isOnline) {
          this.router.navigateByUrl('/login');
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.networkSubscription) {
      this.networkSubscription.unsubscribe();
    }
  }

  async loadBibleStudies() {
    await this.api
      .getBibleStudies()
      .then((data) => {})
      .catch((error) => {
        console.error('Error fetching Bible studies:', error);
      });
  }
}
