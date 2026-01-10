import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../_services/pwa.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-pwa-install-prompt',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pwa-install-prompt.component.html',
  styleUrls: ['./pwa-install-prompt.component.css']
})
export class PwaInstallPromptComponent implements OnInit, OnDestroy {
  showPrompt = false;
  private destroy$ = new Subject<void>();

  constructor(private pwaService: PwaService) {}

  ngOnInit() {
    this.pwaService.showInstallPrompt$
      .pipe(takeUntil(this.destroy$))
      .subscribe(show => {
        this.showPrompt = show;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async installApp() {
    const installed = await this.pwaService.installPwa();
    if (installed) {
      console.log('App installation accepted');
    }
  }

  dismissPrompt() {
    this.pwaService.dismissPrompt();
  }
}





