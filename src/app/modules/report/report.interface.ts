export type ReportFilterParams = {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  salonId?: string;
};

export type WeeklyEarningsData = {
  day: string;
  earnings: number;
};

export type WeeklyEarningsResponse = {
  data: WeeklyEarningsData[];
  totalEarnings: number;
  comparisonPercentage: number;
};
