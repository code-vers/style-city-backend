import type { UserRole } from '../../interfaces/auth.interface';

export type DashboardPeriod = 'WEEK' | 'MONTH' | 'OVERALL';

export interface DashboardOverviewQueryParams {
  period?: DashboardPeriod;
}

export interface DashboardOverviewMetrics {
  weeklyEarnings: number;
  weeklyServicesDone: number;
  weeklyTips: number;
  grossRevenue?: number;
  netSalonProfit?: number;
}

export interface DashboardOverviewRange {
  startDate: string | null;
  endDate: string | null;
}

export interface DashboardOverviewScope {
  role: UserRole;
  type: 'individual' | 'system';
  userId: string;
}

export interface DashboardOverviewResponse {
  period: DashboardPeriod;
  range: DashboardOverviewRange;
  scope: DashboardOverviewScope;
  metrics: DashboardOverviewMetrics;
  approvedEntriesCount: number;
  systemCounts?: {
    employees: number;
    managers: number;
    salons: number;
    approvedEntries: number;
  };
}
