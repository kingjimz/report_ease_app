import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.css'
})
export class ThemeToggleComponent implements OnInit {
  isDarkMode = false;

  constructor(public themeService: ThemeService) {}

  ngOnInit(): void {
    this.themeService.darkMode$.subscribe(isDark => {
      this.isDarkMode = isDark;
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
