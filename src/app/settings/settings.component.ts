import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../_services/api.service';
import { AlertsComponent } from '../components/alerts/alerts.component';
import { ModalService } from '../_services/modal.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnDestroy {
  target_date = '';
  category = '';
  goal_title = '';
  goal_description = '';
  goals: any[] = [];
  goalFilter = '';
  searchQuery = '';
  showGoalModal = false;
  goalSelected: any = null;
  showDeleteConfirm = false;
  goalToDelete: any = null;
  showAllGoals = false;
  
  // Expose Math to template
  Math = Math;

  constructor(
    public api: ApiService,
    private modalService: ModalService,
  ) {
    this.loadGoals();
  }

  async onSubmit() {
    if (this.goalSelected) {
      await this.updateGoal();
    } else {
      this.api
        .addGoal({
          target_date: this.target_date,
          category: this.category,
          goal_title: this.goal_title,
          goal_description: this.goal_description,
        })
        .then(() => {
          this.resetForm();
          this.showGoalModal = false;
          this.modalService.closeModal();
          this.loadGoals();
        })
        .catch((error) => {
          console.error('Error adding goal:', error);
        });
    }
  }

  async loadGoals() {
    try {
      this.goals = await this.api.getGoals();
      this.api.notifyGoalChange(this.goals);
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  }

  openDeleteConfirm(goal: any) {
    this.goalToDelete = goal;
    this.showDeleteConfirm = true;
    this.modalService.openModal();
  }

  confirmDelete() {
    if (this.goalToDelete) {
      this.deleteGoal(this.goalToDelete);
      this.closeDeleteConfirm();
    }
  }

  closeDeleteConfirm() {
    this.showDeleteConfirm = false;
    this.goalToDelete = null;
    // Only close modal service if goal modal is also closed
    if (!this.showGoalModal) {
      this.modalService.closeModal();
    }
  }

  deleteGoal(goal: any) {
    this.api
      .deleteGoal(goal)
      .then(() => {
        this.goals = this.goals.filter((g) => g.id !== goal.id);
        this.api.notifyGoalChange(this.goals);
        console.log('Goal deleted successfully');
      })
      .catch((error) => {
        console.error('Error deleting goal:', error);
      });
  }

  filteredGoals() {
    let filtered = this.goals;

    // Apply category filter
    if (this.goalFilter) {
      filtered = filtered.filter(
        (goal) =>
          goal.category &&
          goal.category.toLowerCase().includes(this.goalFilter.toLowerCase()),
      );
    }

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (goal) =>
          goal.goal_title?.toLowerCase().includes(query) ||
          goal.goal_description?.toLowerCase().includes(query) ||
          goal.category?.toLowerCase().includes(query),
      );
    }

    return filtered;
  }

  getDisplayedGoals() {
    const filtered = this.filteredGoals();
    if (this.showAllGoals) {
      return filtered;
    }
    return filtered.slice(0, 3);
  }

  toggleShowAllGoals() {
    this.showAllGoals = !this.showAllGoals;
  }

  onSearchChange() {
    // Search is handled in filteredGoals()
  }

  getCategoryCount(category: string): number {
    return this.goals.filter((goal) => goal.category === category).length;
  }

  editGoal(goal: any) {
    this.target_date = goal.target_date
      ? new Date(goal.target_date).toISOString().slice(0, 10)
      : '';
    this.category = goal.category || '';
    this.goal_title = goal.goal_title || '';
    this.goal_description = goal.goal_description || '';
    this.goalSelected = goal;
    this.showGoalModal = true;
    this.modalService.openModal();
  }

  async updateGoal() {
    if (!this.goalSelected || !this.goalSelected.id) {
      console.error('No goal selected or missing ID');
      return;
    }
    this.api
      .updateGoal({
        id: this.goalSelected.id,
        target_date: this.target_date,
        category: this.category,
        goal_title: this.goal_title,
        goal_description: this.goal_description,
      })
      .then(() => {
        this.resetForm();
        this.showGoalModal = false;
        this.goalSelected = null;
        this.modalService.closeModal();
        this.loadGoals();
      })
      .catch((error) => {
        console.error('Error updating goal:', error);
      });
  }

  openGoalModal() {
    this.showGoalModal = true;
    this.goalSelected = null;
    this.resetForm();
    this.modalService.openModal();
  }

  closeGoalModal() {
    this.showGoalModal = false;
    this.goalSelected = null;
    this.resetForm();
    // Only close modal service if delete confirm is also closed
    if (!this.showDeleteConfirm) {
      this.modalService.closeModal();
    }
  }

  resetForm() {
    this.target_date = '';
    this.category = '';
    this.goal_title = '';
    this.goal_description = '';
    this.goalSelected = null;
  }

  formatTargetDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getDaysUntilTarget(dateString: string): number | null {
    if (!dateString) return null;
    const targetDate = new Date(dateString);
    if (isNaN(targetDate.getTime())) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  getGoalStatus(goal: any): string | null {
    if (!goal.target_date) return null;
    
    const daysUntil = this.getDaysUntilTarget(goal.target_date);
    if (daysUntil === null) return null;
    
    if (daysUntil < 0) {
      return 'overdue';
    } else if (daysUntil <= 7) {
      return 'due-soon';
    } else {
      return 'on-track';
    }
  }

  ngOnDestroy(): void {
    // Clean up modal state if component is destroyed with modals open
    if (this.showGoalModal || this.showDeleteConfirm) {
      this.modalService.closeModal();
    }
  }
}
