import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Goal } from '../../_constants/interface';

@Component({
  selector: 'app-goal-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './goal-card.component.html',
  styleUrl: './goal-card.component.css',
})
export class GoalCardComponent {
  @Input() goal!: Goal;
  @Output() deleteGoal = new EventEmitter<string>();
  @Output() editGoal = new EventEmitter<string>();

  onDelete(goal: Goal) {
    this.deleteGoal.emit(goal.id);
  }

  onEdit(goal: Goal) {
    this.editGoal.emit(goal.id);
  }
}
