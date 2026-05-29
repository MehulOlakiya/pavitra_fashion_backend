import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard-stats')
  getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('booking-stats')
  getBookingStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getBookingStats(new Date(startDate), new Date(endDate));
  }

  @Get('monthly-revenue')
  getMonthlyRevenue(@Query('year') year: string) {
    const yearNum = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.analyticsService.getMonthlyRevenue(yearNum);
  }
}
