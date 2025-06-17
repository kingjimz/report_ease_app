// chart.component.ts
import { Component, Input, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

// Import Chart.js
import {
  Chart,
  ChartConfiguration,
  ChartType,
  registerables
} from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chart.component.html',
  styleUrl: './chart.component.css'
})
export class ChartComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  
  private chart: Chart | null = null;

  // Default chart data for testing
  @Input() chartData: any = {
    labels: ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig'],
    datasets: [
      {
        label: 'Fruit Sales',
        data: [15, 9, 13, 7, 6, 11],
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 159, 64, 0.8)'
        ],
        borderColor: [
          'rgba(255,99,132,1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 159, 64, 1)'
        ],
        borderWidth: 2
      }
    ]
  };

  @Input() chartType: ChartType = 'line';
  @Input() chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 0,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const
      },
      title: {
        display: true,
        text: 'Sample Chart'
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    },
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    },
    elements: {
      point: {
        radius: 0, // Remove dots at intersection
        hoverRadius: 0
      },
      line: {
        tension: 0.4 // Make the line smooth
      }
    }
  };

  ngOnInit() {
    // Component initialization
  }

  ngAfterViewInit() {
    // Create chart after view is initialized
    setTimeout(() => {
      this.createChart();
    }, 0);
  }

  private createChart() {
    if (!this.chartCanvas) {
      console.error('Canvas element not found');
      return;
    }

    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    // Destroy existing chart if it exists
    if (this.chart) {
      this.chart.destroy();
    }

    const config: ChartConfiguration = {
      type: this.chartType,
      data: this.chartData,
      options: this.chartOptions
    };

    try {
      this.chart = new Chart(ctx, config);
      console.log('Chart created successfully');
    } catch (error) {
      console.error('Error creating chart:', error);
    }
  }

  updateChart(newData: any) {
    if (this.chart) {
      this.chart.data = newData;
      this.chart.update();
    }
  }

  changeChartType(newType: ChartType) {
    this.chartType = newType;
    this.createChart();
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}