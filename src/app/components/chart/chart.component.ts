// chart.component.ts
import { Component, Input, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, SimpleChanges, OnChanges } from '@angular/core';
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
export class ChartComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  
  private chart: Chart | null = null;
  @Input() reportData: any[] = [];
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
        display: false,
        text:  'Monthly Report',
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
        radius: 0,
        hoverRadius: 0
      },
      line: {
        tension: 0.4 
      }
    }
  };

  chartData: ChartConfiguration['data'] = {
    labels: [],
    datasets: [
      {
        label: 'Hours',
        data: [], // Default data for testing
        fill: true,
        pointRadius: 0, 
        pointHoverRadius: 0
      }
    ]
  };
  ngOnChanges(changes: SimpleChanges) {
    if (changes['reportData'] && this.reportData && this.reportData.length) {
      const sortedData = [...this.reportData].sort((a: any, b: any) => {
        return a.report_date.seconds - b.report_date.seconds;
      });

      const N = 8;
      const latestData = sortedData.slice(-N);

      this.chartData.labels = latestData.map((item: any) => {
        // Use UTC date to avoid timezone offset issues
        const date = new Date(item.report_date.seconds * 1000);
        return date.toLocaleDateString('en-CA');
      });

      this.chartData.datasets[0].data = latestData.map((item: any) => Number(item.hours));

      if (this.chart) {
        this.chart.data.labels = this.chartData.labels;
        this.chart.data.datasets[0].data = this.chartData.datasets[0].data;
        this.chart.update();
      }
    }

    if (this.chartOptions && this.chartOptions.scales) {
      if (!this.chartOptions.scales.x) {
        this.chartOptions.scales.x = {};
      }
      this.chartOptions.scales.x.ticks = { display: false };

      if (!this.chartOptions.scales.y) {
        this.chartOptions.scales.y = {};
      }
      this.chartOptions.scales.y.ticks = {
        ...this.chartOptions.scales.y.ticks,
        callback: function(value: any) {
          // Only show whole numbers
          if (Number.isInteger(value)) {
            return value;
          }
          return '';
        },
        stepSize: 1
      };
    }

    if (this.chartOptions && this.chartOptions.plugins && this.chartOptions.plugins.legend) {
      this.chartOptions.plugins.legend.display = false;
    }
  }

  ngAfterViewInit() {
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