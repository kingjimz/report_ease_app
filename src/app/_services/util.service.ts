import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UtilService {

  constructor() { }


  calculateDaysAgo(date: { seconds: number; nanoseconds: number }): number {
    if (!date || !date.seconds) return 0;
    const reportDate = new Date(date.seconds * 1000);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - reportDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } 

  formatDate(timestamp: { seconds: number; nanoseconds: number }): string {
    if (!timestamp || !timestamp.seconds) return 'Invalid Date';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }); // e.g., "March 2025"
  }

  formatDateToHumanReadable(timestamp: { seconds: number; nanoseconds: number }): string {
    if (!timestamp || !timestamp.seconds) return 'Invalid Date';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); // e.g., "Mar 25, 2025"
  }

  formatDateTime(schedule: string): string {
    const date = new Date(schedule);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
  }

  capitalizeFirstLetter(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  aggregateReportsByMonth(reports: any[]): any[] {
     const aggregated: Record<string, any> = {};
   
     reports.forEach(report => {
       const reportDate = report.report_date instanceof Date 
         ? report.report_date 
         : new Date(report.report_date.seconds * 1000);
       
       // Group by Year-Month (e.g., "2024-04" for April 2024)
       const yearMonth = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;
       const hours = parseInt(report.hours) || 0;
   
       if (!aggregated[yearMonth]) {
         aggregated[yearMonth] = {
           year: reportDate.getFullYear(),
           month: reportDate.getMonth() + 1,
           month_name: reportDate.toLocaleString('default', { month: 'long' }),
           total_hours: 0,
           report_count: 0,
           is_joined_ministry: "no", 
           reports: []
         };
       }
   
       aggregated[yearMonth].total_hours += hours;
       aggregated[yearMonth].report_count++;
       aggregated[yearMonth].reports.push(report);
 
       if (report.is_joined_ministry?.toLowerCase() === "yes") {
         aggregated[yearMonth].is_joined_ministry = "yes";
       }
     });
   
     return Object.values(aggregated).sort((a, b) => 
       b.year - a.year || b.month - a.month
     );
   }
}
