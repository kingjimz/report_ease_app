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
  target_date: Date | null = null;
  category = '';
  goal_title = '';
  goal_description = '';
  goals: any[] = []; // Initialize goals array
  showCompletedGoals = false; // Flag to toggle completed goals view
  completedGoals: any[] = []; // Array to hold completed goals


  constructor(public api: ApiService) { 
    this.loadGoals();
    this.loadCompletedGoals();
  }

  async onSubmit() {
    this.api.addGoal({
      target_date: this.target_date,
      category: this.category,
      goal_title: this.goal_title,
      goal_description: this.goal_description
    }).then(() => {
      this.target_date = null;
      this.category = '';
      this.goal_title = '';
      this.goal_description = '';
    }).catch((error) => {
      console.error('Error adding goal:', error);
    });
  }

  async loadGoals() {
    try {
      this.goals = await this.api.getGoals();
      
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  }

  async loadCompletedGoals() {
    try {
      const completedGoals = await this.api.getCompletedGoals();
      this.completedGoals = completedGoals || [];
      
    } catch (error) {
      console.error('Error loading completed goals:', error);
    }
  }

  markAsCompleted(goal: any) {
   this.api.moveGoalToCompleted(goal).then(() => {
      this.loadGoals(); // Reload goals after marking as completed
      this.loadCompletedGoals(); // Reload completed goals after marking
    }).catch((error) => {
      console.error('Error marking goal as completed:', error);
    } );
  }

  markAsInProgress(goal: any) {
    this.api.markGoalAsInProgress(goal).then(() => {
      this.deleteCompletedGoal(goal); // Delete the goal from the active list
      this.loadGoals(); 
      this.loadCompletedGoals();
    }).catch((error) => {
      console.error('Error marking goal as in progress:', error);
    });
  }

deleteGoal(goal: any) {
  console.log('Deleting goal:', goal);
  this.api.deleteGoal(goal).then(() => {
    this.loadGoals(); // Reload goals after deletion
    this.loadCompletedGoals(); // Reload completed goals after deletion
  }).catch((error) => {
    console.error('Error deleting goal:', error);
  });
}

deleteCompletedGoal(goal: any) {
  console.log('Deleting completed goal:', goal);
  this.api.deleteCompletedGoal(goal).then(() => {
    this.loadCompletedGoals(); // Reload completed goals after deletion
  }).catch((error) => {
    console.error('Error deleting completed goal:', error);
  });
}
}
