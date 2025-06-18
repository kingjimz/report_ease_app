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
        is_joined_ministry: "no", 
        reports: []
      };
    }

    // Add hours and minutes separately
    aggregated[yearMonth].total_hours += hours;
    aggregated[yearMonth].total_minutes += minutes;
    aggregated[yearMonth].report_count++;
    aggregated[yearMonth].reports.push(report);

    if (report.is_joined_ministry?.toLowerCase() === "yes") {
      aggregated[yearMonth].is_joined_ministry = "yes";
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
    month.total_time_decimal = month.total_hours + (month.total_minutes / 60);
    month.total_time_decimal = Math.round(month.total_time_decimal * 100) / 100;
  });

  return Object.values(aggregated).sort((a, b) => 
    b.year - a.year || b.month - a.month
  );
}

generatePNG(report: any, isPioneer: boolean) {
  // Load Poppins font first
  const loadFont = () => {
    return new Promise((resolve) => {
      // Check if font is already loaded
      if (document.fonts && document.fonts.check && document.fonts.check('16px Poppins')) {
        resolve(true);
        return;
      }
      
      // Create font link if it doesn't exist
      if (!document.querySelector('link[href*="fonts.googleapis.com"][href*="Poppins"]')) {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      
      // Wait for font to load
      if (document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.load('400 16px Poppins'),
          document.fonts.load('600 16px Poppins'),
          document.fonts.load('700 16px Poppins')
        ]).then(() => {
          setTimeout(resolve, 100); // Small delay to ensure font is ready
        }).catch(() => {
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
  
  // High DPI scaling for better quality
  const scale = window.devicePixelRatio || 2; // Use device pixel ratio or default to 2x
  const width = 600;
  const height = 400;
  
  // Set actual canvas size in memory (scaled up)
  canvas.width = width * scale;
  canvas.height = height * scale;
  
  // Scale the canvas back down using CSS
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  
  // Scale the drawing context so everything draws at the higher resolution
  ctx.scale(scale, scale);
  
  // Enable anti-aliasing and high-quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Main content card
  const cardMargin = 20;
  const cardX = cardMargin;
  const cardY = cardMargin;
  const cardWidth = width - (cardMargin * 2);
  const cardHeight = height - (cardMargin * 2);
  
  // Simple card background with shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(cardX + 4, cardY + 4, cardWidth, cardHeight);
  
  ctx.fillStyle = 'white';
  ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
  
  // Header section with accent color
  const headerHeight = 60;
  const headerGradient = ctx.createLinearGradient(0, cardY, 0, cardY + headerHeight);
  headerGradient.addColorStop(0, '#4f46e5');
  headerGradient.addColorStop(1, '#7c3aed');
  ctx.fillStyle = headerGradient;
  ctx.fillRect(cardX, cardY, cardWidth, headerHeight);
  
  // Header text with Poppins font
  ctx.fillStyle = 'white';
  ctx.font = '700 24px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerX = width / 2;
  ctx.fillText('Monthly Field Service Report', centerX, cardY + 38);
  
  // Month badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  const badgeWidth = 200;
  const badgeHeight = 25;
  const badgeX = centerX - badgeWidth / 2;
  const badgeY = cardY + headerHeight + 15;
  ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
  
  ctx.fillStyle = '#4f46e5';
  ctx.font = '600 16px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(report.month, centerX, badgeY + 17);
  
  // Pioneer/Publisher text (no badge background)
  const typeText = isPioneer ? "Pioneer Report Card" : "Publisher Report Card";
  const typeBadgeY = badgeY + 35;
  ctx.fillStyle = '#1e293b'; // Dark color for better visibility
  ctx.font = '600 14px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(typeText, centerX, typeBadgeY + 14);
  
  // Report statistics section
  let yPosition = cardY + headerHeight + 85;
  const leftMargin = cardX + 50;
  const rightMargin = cardX + cardWidth - 50;
  
  // Statistics with different handling for pioneer vs publisher
  if (isPioneer) {
    // Pioneer - show all stats including hours
    const stats = [
      { 
        label: '⏱️ Hours', 
        value: report.hours !== undefined ? report.hours.toString() : 'N/A'
      },
      { 
        label: '📖 Bible Studies', 
        value: report.bibleStudies.toString()
      },
      { 
        label: '🤝 Ministry Participation', 
        value: this.capitalizeFirstLetter(report.is_joined_ministry)
      }
    ];
    
    stats.forEach((stat, index) => {
      const statY = yPosition + (index * 60);
      
      // Label
      ctx.fillStyle = '#475569';
      ctx.font = '400 18px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(stat.label, leftMargin, statY);
      
      // Value
      ctx.fillStyle = '#1e293b';
      ctx.font = '600 20px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(stat.value, rightMargin, statY);
    });
  } else {
    // Publisher - show hours field with line instead of value
    let currentY = yPosition;
    
    // Hours field with line
    ctx.fillStyle = '#475569';
    ctx.font = '400 18px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('⏱️ Hours', leftMargin, currentY);
    
    // Draw horizontal line instead of value
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const lineStartX = rightMargin - 20;
    ctx.moveTo(lineStartX, currentY);
    ctx.lineTo(rightMargin, currentY);
    ctx.stroke();
    
    currentY += 60;
    
    // Bible Studies
    ctx.fillStyle = '#475569';
    ctx.font = '400 18px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('📖 Bible Studies', leftMargin, currentY);
    
    ctx.fillStyle = '#1e293b';
    ctx.font = '600 20px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(report.bibleStudies.toString(), rightMargin, currentY);
    
    currentY += 60;
    
    // Ministry Participation
    ctx.fillStyle = '#475569';
    ctx.font = '400 18px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🤝 Ministry Participation', leftMargin, currentY);
    
    ctx.fillStyle = '#1e293b';
    ctx.font = '600 20px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.capitalizeFirstLetter(report.is_joined_ministry), rightMargin, currentY);
  }
  
  // Footer section
  const footerY = cardY + cardHeight - 40;
  
  // Decorative line
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftMargin, footerY - 15);
  ctx.lineTo(rightMargin, footerY - 15);
  ctx.stroke();
  
  // Footer text with Poppins font
  ctx.fillStyle = '#64748b';
  ctx.font = '400 12px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Generated by Field Service Tracker', centerX, footerY);
  
  // Timestamp
  const now = new Date();
  const timestamp = now.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 10px Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Generated on ${timestamp}`, centerX, footerY + 15);
  
  // Download the Image with enhanced quality
  const image = canvas.toDataURL('image/png', 1.0); // Maximum quality
  const link = document.createElement('a');
  link.href = image;
  link.download = `${isPioneer ? 'Pioneer' : 'Publisher'}-report-${report.month.replace(' ', '-')}.png`;
  link.click();
}
}
