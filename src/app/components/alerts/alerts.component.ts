import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './alerts.component.html',
  styleUrl: './alerts.component.css',
})
export class AlertsComponent {
  @Input() isSuccess = false;
  @Input() alertMessage = '';
}
