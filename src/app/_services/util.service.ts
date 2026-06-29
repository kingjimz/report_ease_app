import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UtilService {
  constructor() {}

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

  formatDateToHumanReadable(timestamp: {
    seconds: number;
    nanoseconds: number;
  }): string {
    if (!timestamp || !timestamp.seconds) return 'Invalid Date';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }); // e.g., "Mar 25, 2025"
  }

  formatDateTime(schedule: string): string {
    const date = new Date(schedule);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    });
  }

  capitalizeFirstLetter(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Returns a local-time YYYY-MM-DD key (used as a per-day doc ID prefix)
  getLocalDateKey(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  aggregateReportsByMonth(reports: any[]): any[] {
    const aggregated: Record<string, any> = {};

    reports.forEach((report) => {
      const reportDate =
        report.report_date instanceof Date
          ? report.report_date
          : new Date(report.report_date.seconds * 1000);

      // Group by Year-Month (e.g., "2024-04" for April 2024)
      const yearMonth = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;

      // Parse hours and minutes separately
      const hours = parseInt(report.hours) || 0;
      const minutes = parseInt(report.minutes) || 0;

      if (!aggregated[yearMonth]) {
        aggregated[yearMonth] = {
          year: reportDate.getFullYear(),
          month: reportDate.getMonth() + 1,
          month_name: reportDate.toLocaleString('default', { month: 'long' }),
          total_hours: 0,
          total_minutes: 0, // Track minutes separately
          report_count: 0,
          is_joined_ministry: 'no',
          reports: [],
        };
      }

      // Add hours and minutes separately
      aggregated[yearMonth].total_hours += hours;
      aggregated[yearMonth].total_minutes += minutes;
      aggregated[yearMonth].report_count++;
      aggregated[yearMonth].reports.push(report);

      if (report.is_joined_ministry?.toLowerCase() === 'yes') {
        aggregated[yearMonth].is_joined_ministry = 'yes';
      }
    });

    // Process each month to convert accumulated minutes to hours
    Object.values(aggregated).forEach((month: any) => {
      // Convert every 60 minutes to 1 hour
      const additionalHours = Math.floor(month.total_minutes / 60);
      const remainingMinutes = month.total_minutes % 60;

      // Update total hours and remaining minutes
      month.total_hours += additionalHours;
      month.total_minutes = remainingMinutes;

      // For display purposes, you might want total time as decimal
      month.total_time_decimal = month.total_hours + month.total_minutes / 60;
      month.total_time_decimal =
        Math.round(month.total_time_decimal * 100) / 100;
    });

    return Object.values(aggregated).sort(
      (a, b) => b.year - a.year || b.month - a.month,
    );
  }

  generatePNG(report: any, isPioneer: boolean) {
    // Load Poppins font first
    const loadFont = () => {
      return new Promise((resolve) => {
        // Check if font is already loaded
        if (
          document.fonts &&
          document.fonts.check &&
          document.fonts.check('16px Poppins')
        ) {
          resolve(true);
          return;
        }

        // Create font link if it doesn't exist
        if (
          !document.querySelector(
            'link[href*="fonts.googleapis.com"][href*="Poppins"]',
          )
        ) {
          const link = document.createElement('link');
          link.href =
            'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap';
          link.rel = 'stylesheet';
          document.head.appendChild(link);
        }

        // Wait for font to load
        if (document.fonts && document.fonts.load) {
          Promise.all([
            document.fonts.load('400 16px Poppins'),
            document.fonts.load('600 16px Poppins'),
            document.fonts.load('700 16px Poppins'),
          ])
            .then(() => {
              setTimeout(resolve, 100); // Small delay to ensure font is ready
            })
            .catch(() => {
              resolve(true); // Continue even if font loading fails
            });
        } else {
          // Fallback for older browsers
          setTimeout(resolve, 1000);
        }
      });
    };

    loadFont().then(() => {
      this.renderCanvas(report, isPioneer);
    });
  }

  renderCanvas(report: any, isPioneer: boolean) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const scale = window.devicePixelRatio || 2;
    const width = 600;
    const height = 520;

    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    this.drawFieldServiceReport(ctx, width, height, report, isPioneer);

    const image = canvas.toDataURL('image/png', 1.0);

    const link = document.createElement('a');
    link.href = image;
    link.download = `Field-Service-Report-${report.month.replace(' ', '-')}.png`;
    link.click();

    return image;
  }

  private drawFieldServiceReport(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    report: any,
    isPioneer: boolean,
  ) {
    const fontFamily = 'Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const margin = 40;
    const contentWidth = width - margin * 2;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = '#000000';
    ctx.font = `700 22px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FIELD SERVICE REPORT', width / 2, 40);

    // Name field with dotted line
    let y = 80;
    ctx.font = `700 15px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText('Name/Email:', margin, y);
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin + 100, y + 5);
    ctx.lineTo(width - margin, y + 5);
    ctx.stroke();

    // Fill in the name value (signed-in user's email): bigger but not bold,
    // auto-shrinking the font so a long email still fits on the line.
    const nameValue = report.name || '';
    const nameX = margin + 105;
    const nameMaxWidth = width - margin - nameX;
    let nameSize = 20;
    ctx.font = `400 ${nameSize}px ${fontFamily}`;
    while (nameSize > 11 && ctx.measureText(nameValue).width > nameMaxWidth) {
      nameSize -= 1;
      ctx.font = `400 ${nameSize}px ${fontFamily}`;
    }
    ctx.fillText(nameValue, nameX, y);

    // Month field with dotted line and filled value
    y = 110;
    ctx.font = `700 15px ${fontFamily}`;
    ctx.setLineDash([2, 3]);
    ctx.fillText('Month:', margin, y);
    ctx.beginPath();
    ctx.moveTo(margin + 60, y + 5);
    ctx.lineTo(width - margin, y + 5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill in month value: bigger but not bold.
    ctx.font = `400 20px ${fontFamily}`;
    ctx.fillText(report.month, margin + 65, y);

    // Table section
    const tableTop = 140;
    const tableLeft = margin;
    const tableWidth = contentWidth;
    const valueColWidth = 70;
    const labelColWidth = tableWidth - valueColWidth;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;

    // Row 1: Ministry participation
    const row1Height = 55;
    ctx.strokeRect(tableLeft, tableTop, tableWidth, row1Height);
    // Vertical divider
    ctx.beginPath();
    ctx.moveTo(tableLeft + labelColWidth, tableTop);
    ctx.lineTo(tableLeft + labelColWidth, tableTop + row1Height);
    ctx.stroke();

    // Row 1 text
    ctx.font = `400 13px ${fontFamily}`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    const row1Text1 = 'Check the box if you shared in any form';
    const row1Text2 = 'of the ministry during the month';
    ctx.fillText(row1Text1, tableLeft + 10, tableTop + 22);
    ctx.fillText(row1Text2, tableLeft + 10, tableTop + 40);

    // Checkbox for ministry participation
    const checkboxSize = 18;
    const checkboxX = tableLeft + labelColWidth + (valueColWidth - checkboxSize) / 2;
    const checkboxY = tableTop + (row1Height - checkboxSize) / 2;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(checkboxX, checkboxY, checkboxSize, checkboxSize);

    // Fill checkbox if participated
    if (report.is_joined_ministry === 'yes') {
      ctx.fillStyle = '#000000';
      ctx.font = `700 16px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2713', checkboxX + checkboxSize / 2, checkboxY + checkboxSize / 2 + 1);
    }

    // Row 2: Bible studies
    const row2Top = tableTop + row1Height;
    const row2Height = 45;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tableLeft, row2Top, tableWidth, row2Height);
    ctx.beginPath();
    ctx.moveTo(tableLeft + labelColWidth, row2Top);
    ctx.lineTo(tableLeft + labelColWidth, row2Top + row2Height);
    ctx.stroke();

    ctx.font = `400 13px ${fontFamily}`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const row2line1 = 'Number of different Bible studies conducted';
    ctx.fillText(row2line1, tableLeft + 10, row2Top + row2Height / 2);

    // Bible studies value
    ctx.font = `600 15px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      report.bibleStudies.toString(),
      tableLeft + labelColWidth + valueColWidth / 2,
      row2Top + row2Height / 2,
    );

    // Row 3: Hours
    const row3Top = row2Top + row2Height;
    const row3Height = 55;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tableLeft, row3Top, tableWidth, row3Height);
    ctx.beginPath();
    ctx.moveTo(tableLeft + labelColWidth, row3Top);
    ctx.lineTo(tableLeft + labelColWidth, row3Top + row3Height);
    ctx.stroke();

    ctx.font = `400 13px ${fontFamily}`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const row3Text1 = 'Hours (if auxiliary, regular, or special pioneer';
    const row3Text2 = 'or field missionary)';
    ctx.fillText(row3Text1, tableLeft + 10, row3Top + 22);
    ctx.fillText(row3Text2, tableLeft + 10, row3Top + 40);

    // Hours value (only for pioneers)
    if (isPioneer && report.hours !== undefined) {
      ctx.font = `600 15px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(
        report.hours.toString(),
        tableLeft + labelColWidth + valueColWidth / 2,
        row3Top + row3Height / 2,
      );
    }

    // Comments section
    const commentsTop = row3Top + row3Height + 20;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tableLeft, commentsTop, tableWidth, 100);

    ctx.font = `700 13px ${fontFamily}`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Comments:', tableLeft + 10, commentsTop + 10);

    // Footer
    ctx.fillStyle = '#999999';
    ctx.font = `400 10px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Generated by Field Service Tracker', width / 2, height - 15);
  }

  async shareReport(report: any, isPioneer: boolean): Promise<void> {
    // Load font and generate image
    const loadFont = () => {
      return new Promise((resolve) => {
        if (
          document.fonts &&
          document.fonts.check &&
          document.fonts.check('16px Poppins')
        ) {
          resolve(true);
          return;
        }

        if (
          !document.querySelector(
            'link[href*="fonts.googleapis.com"][href*="Poppins"]',
          )
        ) {
          const link = document.createElement('link');
          link.href =
            'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap';
          link.rel = 'stylesheet';
          document.head.appendChild(link);
        }

        if (document.fonts && document.fonts.load) {
          Promise.all([
            document.fonts.load('400 16px Poppins'),
            document.fonts.load('600 16px Poppins'),
            document.fonts.load('700 16px Poppins'),
          ])
            .then(() => {
              setTimeout(resolve, 100);
            })
            .catch(() => {
              resolve(true);
            });
        } else {
          setTimeout(resolve, 1000);
        }
      });
    };

    await loadFont();
    
    // Generate image data URL
    const imageDataUrl = this.renderCanvasForShare(report, isPioneer);
    
    // Convert data URL to blob
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    const file = new File([blob], `Field-Service-Report-${report.month.replace(' ', '-')}.png`, {
      type: 'image/png',
    });

    // Check if Web Share API is available
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `Field Service Report - ${report.month}`,
          text: `Field Service Report for ${report.month}`,
          files: [file],
        });
      } catch (error: any) {
        // User cancelled or error occurred
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error);
          // Fallback to download
          this.downloadImageFromDataUrl(imageDataUrl, `Field-Service-Report-${report.month.replace(' ', '-')}.png`);
        }
      }
    } else {
      // Fallback: copy to clipboard or download
      try {
        // Try to copy to clipboard (for images, this may not work in all browsers)
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        alert('Image copied to clipboard! You can paste it in your messenger or other apps.');
      } catch (clipboardError) {
        // If clipboard fails, just download
        this.downloadImageFromDataUrl(imageDataUrl, `Field-Service-Report-${report.month.replace(' ', '-')}.png`);
      }
    }
  }

  renderCanvasForShare(report: any, isPioneer: boolean): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return '';

    const scale = window.devicePixelRatio || 2;
    const width = 600;
    const height = 520;

    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    this.drawFieldServiceReport(ctx, width, height, report, isPioneer);

    return canvas.toDataURL('image/png', 1.0);
  }

  downloadImageFromDataUrl(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
}
