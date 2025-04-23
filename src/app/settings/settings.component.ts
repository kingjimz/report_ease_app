import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../_services/api.service';
import { AlertsComponent } from '../components/alerts/alerts.component';
import { ModalComponent } from '../components/modal/modal.component';
import { MapComponent } from '../components/map/map.component';
import { LoaderComponent } from '../components/loader/loader.component';
      
declare const google: any;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertsComponent, ModalComponent, MapComponent, LoaderComponent],
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
  showMap = false;
  openModalConfirm = false;
  location = {
    lat: 0,
    lng: 0,
    locationName: ''
  }

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

  saveLocation(location: { lat: number; lng: number, locationName: string }) {
    this.address = location.locationName;
    this.openModalConfirm = false;
  }

  getLocation(event: { lat: number; lng: number, locationName: string }) {
    this.location = event;
    if(this.location) {
      this.address = this.location.locationName;
      this.showMap = false;
    }
  }

  }

