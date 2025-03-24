import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../_services/api.service';
import { AlertsComponent } from '../components/alerts/alerts.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertsComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent {
  bible_study = '';
  address = '';
  schedule: Date | null = null;
  type = 'rv';
  next_lesson = '';
  isSuccess = false;
  isLoading = false;
  alertMessage = 'Warning: Please verify your input carefully.';

  constructor(public api: ApiService) { }

  async onSubmit() {
    this.isLoading = true;
    const data = {
      bible_study: this.bible_study,
      address: this.address,
      schedule: this.schedule,
      type: this.type,
      lesson: this.next_lesson,
      updated_at: new Date(),
    }
    try {
      await this.api.addStudy(data);
      this.bible_study = '';
      this.address = '';
      this.schedule = null;
      this.type = '';
      this.next_lesson = '';
      this.isSuccess = true;
      this.alertMessage = 'Study added! View reports section.';
    } catch (error) {
      console.error('Error submitting data', error);
      this.isSuccess = false;
      this.alertMessage = 'Error submitting data';
      this.isLoading = false;
    }
    this.isLoading = false;
  }

}
