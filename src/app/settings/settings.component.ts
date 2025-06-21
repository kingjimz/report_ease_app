import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../_services/api.service';
import { AlertsComponent } from '../components/alerts/alerts.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  target_date: Date | null = null;
  category = '';
  goal_title = '';
  goal_description = '';
  goals: any[] = [];
  goalFilter = '';
  showGoalModal = false;

  constructor(public api: ApiService) {
    this.loadGoals();
  }

  async onSubmit() {
    this.api
      .addGoal({
        target_date: this.target_date,
        category: this.category,
        goal_title: this.goal_title,
        goal_description: this.goal_description,
      })
      .then(() => {
        this.target_date = null;
        this.category = '';
        this.goal_title = '';
        this.goal_description = '';
        this.loadGoals();
      })
      .catch((error) => {
        console.error('Error adding goal:', error);
      });
  }

  async loadGoals() {
    try {
      this.goals = await this.api.getGoals();
      this.api.notifyGoalChange(this.goals);
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  }

  deleteGoal(goal: any) {
    this.api
      .deleteGoal(goal)
      .then(() => {
        this.loadGoals();
      })
      .catch((error) => {
        console.error('Error deleting goal:', error);
      });
  }

  filteredGoals() {
    if (!this.goalFilter) {
      return this.goals;
    }
    return this.goals.filter(
      (goal) =>
        goal.category &&
        goal.category.toLowerCase().includes(this.goalFilter.toLowerCase()),
    );
  }
}
