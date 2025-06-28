import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../_services/api.service';
import { GoalCardComponent } from './goal-card/goal-card.component';
import { Goal } from '../_constants/interface';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, GoalCardComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  target_date = '';
  category = '';
  goal_title = '';
  goal_description = '';
  goals: Goal[] = [];
  goalFilter = '';
  showGoalModal = false;
  goalSelected: any = null;

  constructor(public api: ApiService) {
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
          this.target_date = '';
          this.category = '';
          this.goal_title = '';
          this.goal_description = '';
          this.showGoalModal = false;
          this.loadGoals();
        })
        .catch((error) => {
          console.error('Error adding goal:', error);
        });
    }
  }

  async loadGoals() {
    try {
      const rawGoals = await this.api.getGoals();
      this.goals = rawGoals.map((g: any) => ({
        id: String(g.id),
        goal_title: g.goal_title || '',
        goal_description: g.goal_description || '',
        target_date: g.target_date || '',
        category: g.category || '',
      }));
      this.api.notifyGoalChange(this.goals);
    } catch (error) {
      console.error('Error loading goals:', error);
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
    if (!this.goalFilter) {
      return this.goals;
    }
    return this.goals.filter(
      (goal) => goal.category && goal.category.toLowerCase().includes(this.goalFilter.toLowerCase())
    );
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
        this.target_date = '';
        this.category = '';
        this.goal_title = '';
        this.goal_description = '';
        this.showGoalModal = false;
        this.goalSelected = null;
        this.loadGoals();
      })
      .catch((error) => {
        console.error('Error updating goal:', error);
      });
  }
}
