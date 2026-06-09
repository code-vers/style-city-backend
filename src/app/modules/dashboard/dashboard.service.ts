import { Prisma } from '@prisma/client';

import prisma from '../../utils/prisma';
import type {
  DashboardOverviewMetrics,
  DashboardOverviewResponse,
  DashboardPeriod
} from './dashboard.interface';

type ApprovedDashboardEntry = {
  employeeId: string;
  totalPrice: number;
  actualPrice: number;
  tips: number | null;
  addHair: number | null;
  commissionRate: number | null;
  commissionEarnings: number | null;
  isSplit: boolean;
  splits: Array<{
    employeeId: string;
    totalPrice: number;
    tips: number | null;
    commissionRate: number | null;
    commissionEarnings: number | null;
  }>;
};

const dashboardEntrySelect = {
  employeeId: true,
  totalPrice: true,
  actualPrice: true,
  tips: true,
  addHair: true,
  commissionRate: true,
  commissionEarnings: true,
  isSplit: true,
  splits: {
    select: {
      employeeId: true,
      totalPrice: true,
      tips: true,
      commissionRate: true,
      commissionEarnings: true
    }
  }
} as const;

const normalizePeriod = (period?: string): DashboardPeriod => {
  const upperPeriod = period?.toUpperCase();

  if (upperPeriod === 'MONTH' || upperPeriod === 'OVERALL') {
    return upperPeriod;
  }

  return 'WEEK';
};

const getPeriodRange = (period: DashboardPeriod) => {
  if (period === 'OVERALL') {
    return null;
  }

  const now = new Date();

  if (period === 'WEEK') {
    const startDate = new Date(now);
    const dayIndex = startDate.getDay();
    const mondayOffset = (dayIndex + 6) % 7;

    startDate.setDate(startDate.getDate() - mondayOffset);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return { startDate, endDate };
};

const getDashboardScopeWhere = (
  userId: string,
  role: string,
  range: ReturnType<typeof getPeriodRange>
) => {
  const where: Prisma.SalonEntryWhereInput = {
    status: 'APPROVED'
  };

  if (range) {
    where.createdAt = {
      gte: range.startDate,
      lte: range.endDate
    };
  }

  if (role !== 'ADMIN') {
    where.OR = [{ employeeId: userId }, { splits: { some: { employeeId: userId } } }];
  }

  return where;
};

const calculateIndividualMetrics = (
  entries: ApprovedDashboardEntry[],
  userId: string
): DashboardOverviewMetrics => {
  let weeklyEarnings = 0;
  let weeklyServicesDone = 0;
  let weeklyTips = 0;

  entries.forEach((entry) => {
    if (entry.employeeId === userId) {
      let ownTips = entry.tips || 0;

      if (entry.isSplit && entry.splits.length > 0) {
        const otherSplits = entry.splits.filter((split) => split.employeeId !== userId);

        const splitTipsSum = otherSplits.reduce((sum, split) => sum + (split.tips || 0), 0);

        const splitPriceSum = otherSplits.reduce((sum, split) => sum + split.totalPrice, 0);

        ownTips -= splitTipsSum;
      }

      const commissionEarnings = entry.commissionEarnings ?? 0;

      weeklyServicesDone += 1;
      weeklyTips += ownTips;
      weeklyEarnings += commissionEarnings + ownTips;

      return;
    }

    const userSplit = entry.splits.find((split) => split.employeeId === userId);
    if (!userSplit) {
      return;
    }

    const splitTips = userSplit.tips || 0;
    const splitCommission = userSplit.commissionEarnings ?? 0;

    weeklyServicesDone += 1;
    weeklyTips += splitTips;
    weeklyEarnings += splitCommission + splitTips;
  });

  return {
    weeklyEarnings,
    weeklyServicesDone,
    weeklyTips
  };
};

const calculateSystemMetrics = (entries: ApprovedDashboardEntry[]): DashboardOverviewMetrics => {
  let weeklyEarnings = 0;
  let weeklyServicesDone = 0;
  let weeklyTips = 0;
  let grossRevenue = 0;
  let netSalonProfit = 0;

  entries.forEach((entry) => {
    const entryTips = entry.tips ?? 0;
    const entryCommission = entry.commissionEarnings ?? 0;
    const splitCommission = entry.splits
      .filter((split) => split.employeeId !== entry.employeeId)
      .reduce((sum, split) => sum + (split.commissionEarnings ?? 0), 0);

    weeklyServicesDone += 1;
    weeklyTips += entryTips;
    weeklyEarnings += entryCommission + splitCommission + entryTips;

    // Gross Revenue = Total Price + Tips
    // The totalPrice in DB includes the base service fee + hair add-on cost
    grossRevenue += entry.totalPrice + entryTips;

    // Net Profit = Total Price - Employee Commissions
    netSalonProfit += entry.totalPrice - entryCommission - splitCommission;
  });

  return {
    weeklyEarnings,
    weeklyServicesDone,
    weeklyTips,
    grossRevenue,
    netSalonProfit
  };
};

const getOverview = async (userId: string, role: string, period?: string) => {
  const normalizedPeriod = normalizePeriod(period);
  const range = getPeriodRange(normalizedPeriod);
  const where = getDashboardScopeWhere(userId, role, range);

  const [entries, systemCounts] = await Promise.all([
    prisma.salonEntry.findMany({
      where,
      select: dashboardEntrySelect
    }) as Promise<ApprovedDashboardEntry[]>,
    role === 'ADMIN'
      ? Promise.all([
          prisma.user.count({ where: { role: 'EMPLOYEE' } }),
          prisma.user.count({ where: { role: 'MANAGER' } }),
          prisma.salon.count(),
          prisma.salonEntry.count({ where: { status: 'APPROVED' } })
        ])
      : Promise.resolve(null)
  ]);

  const metrics =
    role === 'ADMIN'
      ? calculateSystemMetrics(entries)
      : calculateIndividualMetrics(entries, userId);

  return {
    period: normalizedPeriod,
    range: {
      startDate: range ? range.startDate.toISOString() : null,
      endDate: range ? range.endDate.toISOString() : null
    },
    scope: {
      role: role as any,
      type: role === 'ADMIN' ? 'system' : 'individual',
      userId
    },
    metrics,
    approvedEntriesCount: entries.length,
    systemCounts:
      systemCounts && role === 'ADMIN'
        ? {
            employees: systemCounts[0],
            managers: systemCounts[1],
            salons: systemCounts[2],
            approvedEntries: systemCounts[3]
          }
        : undefined
  } satisfies DashboardOverviewResponse;
};

export const DashboardService = {
  getOverview
};
