import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent {
  bible_study = '';
  address = '';
  schedule: Date | null = null;
  type = 'rv';
  isSuccess = false;
  isLoading = false;

  constructor(public api: ApiService) { }

  async onSubmit() {
    this.isLoading = true;
    const data = {
      bible_study: this.bible_study,
      address: this.address,
      schedule: this.schedule,
      type: this.type
    }
    try {
      await this.api.addStudy(data);
      this.bible_study = '';
      this.address = '';
      this.schedule = null;
      this.type = '';
      this.isSuccess = true;
    } catch (error) {
      console.error('Error submitting data', error);
      this.isLoading = false;
    }
    this.isLoading = false;
  }

}
