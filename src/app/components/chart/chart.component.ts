// chart.component.ts
import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  SimpleChanges,
  OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

// Import Chart.js
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chart.component.html',
  styleUrl: './chart.component.css',
})
export class ChartComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas', { static: false })
  chartCanvas!: ElementRef<HTMLCanvasElement>;

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
        position: 'top' as const,
      },
      title: {
        display: false,
        text: 'Monthly Report',
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: {
          size: 14,
          weight: 'bold',
        },
        bodyFont: {
          size: 13,
        },
        borderColor: 'rgba(59, 130, 246, 0.5)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: function(context: any) {
            return `Hours: ${context.parsed.y}`;
          }
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
    elements: {
      point: {
        radius: 4,
        hoverRadius: 6,
        hoverBorderWidth: 2,
        backgroundColor: '#3b82f6',
        borderColor: '#ffffff',
        borderWidth: 2,
      },
      line: {
        tension: 0.4,
        borderWidth: 3,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
      },
    },
  };

  chartData: ChartConfiguration['data'] = {
    labels: [],
    datasets: [
      {
        label: 'Hours',
        data: [], // Default data for testing
        fill: true,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: '#3b82f6',
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        tension: 0.4,
      },
    ],
  };
  ngOnChanges(changes: SimpleChanges) {
    if (changes['reportData']) {
      console.log('Chart data changed:', {
        hasData: !!this.reportData,
        dataLength: this.reportData?.length || 0,
        firstItem: this.reportData?.[0]
      });
      
      if (this.reportData && this.reportData.length > 0) {
        this.processChartData();
      } else if (this.chart) {
        // Clear chart if no data
        this.chart.data.labels = [];
        this.chart.data.datasets[0].data = [];
        this.chart.update();
      }
    }
  }
  
  private processChartData() {
    if (!this.reportData || this.reportData.length === 0) {
      console.warn('processChartData: No report data available');
      return;
    }

    console.log('Processing chart data:', this.reportData.length, 'reports');

    // Filter out reports without valid dates
    const validReports = this.reportData.filter((report: any) => {
      const hasDate = !!report.report_date;
      const hasHours = report.hours !== undefined && report.hours !== null;
      return hasDate && hasHours;
    });

    console.log('Valid reports:', validReports.length);

    if (validReports.length === 0) {
      console.warn('No valid reports with dates found. Sample report:', this.reportData[0]);
      return;
    }

    // Sort reports by date
    const sortedData = [...validReports].sort((a: any, b: any) => {
      const dateA = this.getReportDate(a);
      const dateB = this.getReportDate(b);
      return dateA.getTime() - dateB.getTime();
    });

    // Get the latest 8 reports (or all if less than 8)
    const N = 8;
    const latestData = sortedData.slice(-N);

    // Process labels and data
    this.chartData.labels = latestData.map((item: any) => {
      const date = this.getReportDate(item);
      return date.toLocaleDateString('en-CA');
    });

    this.chartData.datasets[0].data = latestData.map((item: any) => {
      // Handle both hours and total_hours
      const hours = Number(item.hours) || Number(item.total_hours) || 0;
      return hours;
    });

    // Update chart if it exists, otherwise create it
    if (this.chart) {
      this.chart.data.labels = this.chartData.labels;
      this.chart.data.datasets[0].data = this.chartData.datasets[0].data;
      this.chart.update('active');
      console.log('Chart updated with', this.chartData.labels.length, 'data points');
    } else if (this.chartCanvas && this.chartCanvas.nativeElement) {
      // Chart not created yet, create it now
      setTimeout(() => {
        this.createChart();
      }, 100);
    } else {
      // Wait for canvas to be ready
      setTimeout(() => {
        if (this.chartCanvas && this.chartCanvas.nativeElement) {
          this.createChart();
        }
      }, 200);
    }
  }
  
  private getReportDate(report: any): Date {
    if (!report.report_date) {
      return new Date();
    }
    
    // Handle Firestore Timestamp with toDate method
    if (report.report_date.toDate && typeof report.report_date.toDate === 'function') {
      return report.report_date.toDate();
    }
    
    // Handle Firestore Timestamp object with seconds
    if (report.report_date.seconds) {
      return new Date(report.report_date.seconds * 1000);
    }
    
    // Handle Firestore Timestamp object with _seconds (alternative format)
    if (report.report_date._seconds) {
      return new Date(report.report_date._seconds * 1000);
    }
    
    // Handle Date object
    if (report.report_date instanceof Date) {
      return report.report_date;
    }
    
    // Handle string date
    if (typeof report.report_date === 'string') {
      return new Date(report.report_date);
    }
    
    // Fallback to current date
    console.warn('Unable to parse report date:', report.report_date);
    return new Date();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      // Process data first if available, then create chart
      if (this.reportData && this.reportData.length > 0) {
        this.processChartData();
      }
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
      this.chart = null;
    }

    // Ensure we have data before creating chart
    if (!this.chartData.labels || this.chartData.labels.length === 0) {
      // If no data yet, process it if available
      if (this.reportData && this.reportData.length > 0) {
        this.processChartData();
      } else {
        console.warn('No chart data available, creating empty chart');
      }
    }

    const config: ChartConfiguration = {
      type: this.chartType,
      data: this.chartData,
      options: this.chartOptions,
    };

    try {
      this.chart = new Chart(ctx, config);
      console.log('Chart created successfully with', this.chartData.labels?.length || 0, 'data points');
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
