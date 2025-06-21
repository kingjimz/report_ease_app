import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../_services/api.service';
import { FormsModule } from '@angular/forms';
import { AlertsComponent } from '../alerts/alerts.component';
import { ModalComponent } from '../modal/modal.component';

@Component({
  selector: 'app-bible-studies',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertsComponent, ModalComponent],
  templateUrl: './bible-studies.component.html',
  styleUrl: './bible-studies.component.css',
})
export class BibleStudiesComponent {
  @Input() bibleStudies: any[] = [];
  @Output() edit = new EventEmitter<any>();
  hoveredCard: number | null = null;
  bible_study = '';
  address = '';
  schedule: Date | null = null;
  type = 'rv';
  next_lesson = '';
  isSuccess = false;
  isLoading = false;
  alertMessage = 'Warning: Please verify your input carefully.';
  showModal = false;

  constructor(private api: ApiService) {}

  ngOnInit() {}

  editStudy(study: any) {
    this.edit.emit(study);
  }

  getInitials(name: string): string {
    if (!name) return '';
    const parts = name.split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return parts[0].charAt(0).toUpperCase() + parts[1].charAt(0).toUpperCase();
  }

  getCardClasses(index: number): string {
    const baseClasses =
      'group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl cursor-pointer transition-all duration-500 ease-out hover:-translate-y-2 hover:scale-[1.02] overflow-hidden';
    const borderColor = this.getBorderColor(index);
    const ringClass =
      this.hoveredCard === index ? 'ring-2 ring-blue-200 ring-opacity-60' : '';

    return `${baseClasses} ${borderColor} ${ringClass}`;
  }

  getGradientOverlayClasses(index: number): string {
    const gradient = this.getGradientColor(index);
    return `absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} opacity-10 rounded-bl-full transform translate-x-16 -translate-y-16 group-hover:scale-150 transition-transform duration-700`;
  }

  getAvatarClasses(index: number): string {
    const gradient = this.getGradientColor(index);
    return `bg-gradient-to-br ${gradient} text-white rounded-xl p-3 mr-4 w-12 h-12 flex items-center justify-center font-bold text-lg shadow-lg group-hover:shadow-xl transition-shadow duration-300 group-hover:rotate-12 transition-transform duration-300`;
  }

  private getGradientColor(index: number): string {
    const gradients = [
      'from-blue-500 to-purple-600',
      'from-emerald-500 to-teal-600',
      'from-orange-500 to-red-500',
      'from-purple-500 to-pink-600',
    ];
    return gradients[index % gradients.length];
  }

  private getBorderColor(index: number): string {
    const colors = [
      'border-l-4 border-blue-500',
      'border-l-4 border-emerald-500',
      'border-l-4 border-orange-500',
      'border-l-4 border-purple-500',
    ];
    return colors[index % colors.length];
  }

  async onSubmit() {
    this.isLoading = true;
    const data = {
      bible_study: this.bible_study,
      address: this.address,
      schedule: this.schedule,
      type: this.type,
      lesson: this.next_lesson,
      updated_at: new Date(),
    };
    try {
      await this.api.addStudy(data);
      this.bible_study = '';
      this.address = '';
      this.schedule = null;
      this.type = '';
      this.next_lesson = '';
      this.isSuccess = true;
      this.alertMessage = 'Study added! View reports section.';
      this.api
        .getBibleStudies()
        .then((data) => {
          this.api.updateBibleStudies(data);
        })
        .catch((error) => {
          console.error('Error updating Bible studies:', error);
        });
    } catch (error) {
      console.error('Error submitting data', error);
      this.isSuccess = false;
      this.alertMessage = 'Error submitting data';
      this.isLoading = false;
    }
    this.isLoading = false;
    this.showModal = false;
  }
}
