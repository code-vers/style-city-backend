import { Prisma } from '@prisma/client';
import { format, startOfWeek, endOfWeek, subWeeks, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import prisma from '../../utils/prisma';
import { WeeklyEarningsResponse, ReportFilterParams } from './report.interface';

const TIMEZONE = 'America/Chicago';

const getWeeklyEmployeeEarnings = async (filters: ReportFilterParams): Promise<WeeklyEarningsResponse> => {
  console.log('ReportService filters:', filters);
  const now = toZonedTime(new Date(), TIMEZONE);

  const isFilterEmpty = !filters.startDate || !filters.endDate;

  const currentStart = !isFilterEmpty
    ? toZonedTime(`${filters.startDate}T00:00:00.000`, TIMEZONE)
    : startOfWeek(now, { weekStartsOn: 1 });
  currentStart.setHours(0, 0, 0, 0);

  const currentEnd = !isFilterEmpty
    ? toZonedTime(`${filters.endDate}T23:59:59.999`, TIMEZONE)
    : endOfWeek(now, { weekStartsOn: 1 });
  currentEnd.setHours(23, 59, 59, 999);

  // Previous Week calculation remains relative to the *default* current week or the calculated range
  // For simplicity when filtering, we compare against the same range shifted back
  const rangeDuration = currentEnd.getTime() - currentStart.getTime();
  const prevStart = new Date(currentStart.getTime() - rangeDuration - 1);
  const prevEnd = new Date(currentStart.getTime() - 1);

  const buildWhereClause = (start: Date, end: Date): Prisma.SalonEntryWhereInput => {
    const where: Prisma.SalonEntryWhereInput = {
      status: 'APPROVED',
      createdAt: {
        gte: start,
        lte: end
      }
    };

    if (filters.salonId) {
      where.salonId = filters.salonId;
    }

    if (filters.employeeId) {
      where.OR = [
        { employeeId: filters.employeeId },
        { splits: { some: { employeeId: filters.employeeId } } }
      ];
    }

    return where;
  };

  const fetchEarningsForRange = async (start: Date, end: Date) => {
    const entries = await prisma.salonEntry.findMany({
      where: buildWhereClause(start, end),
      select: {
        createdAt: true,
        employeeId: true,
        commissionEarnings: true,
        tips: true,
        isSplit: true,
        splits: {
          select: {
            employeeId: true,
            commissionEarnings: true,
            tips: true
          }
        }
      }
    });
    console.log(`Entries for range ${start.toISOString()} to ${end.toISOString()}:`, entries.length);
    return entries;
  };

  const currentEntries = await fetchEarningsForRange(currentStart, currentEnd);
  console.log('Current Entries Sample:', currentEntries[0]);
  const prevEntries = await fetchEarningsForRange(prevStart, prevEnd);

  const calculateTotal = (entries: any[]) => {
    return entries.reduce((sum, entry) => {
      let entryTotal = 0;

      if (filters.employeeId) {
        if (entry.employeeId === filters.employeeId) {
          const mainEarnings = entry.commissionEarnings || 0;
          let ownTips = entry.tips || 0;

          if (entry.isSplit && entry.splits.length > 0) {
            const otherSplits = entry.splits.filter((s: any) => s.employeeId !== filters.employeeId);
            const splitTipsSum = otherSplits.reduce((sumTips: number, split: any) => sumTips + (split.tips || 0), 0);
            ownTips -= splitTipsSum;
          }
          entryTotal += mainEarnings + ownTips;
        } else {
          const userSplit = entry.splits.find((s: any) => s.employeeId === filters.employeeId);
          if (userSplit) {
            entryTotal += (userSplit.commissionEarnings || 0) + (userSplit.tips || 0);
          }
        }
      } else {
        const mainEarnings = entry.commissionEarnings || 0;
        const tips = entry.tips || 0;
        const splitEarnings = entry.splits
          .filter((s: any) => s.employeeId !== entry.employeeId)
          .reduce((s: number, split: any) => s + (split.commissionEarnings || 0), 0);
        entryTotal += mainEarnings + tips + splitEarnings;
      }

      return sum + entryTotal;
    }, 0);
  };

  const currentTotal = calculateTotal(currentEntries);
  const prevTotal = calculateTotal(prevEntries);

  // Group by day for current week
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dailyEarnings = days.map((day, index) => {
    const dayStart = addDays(currentStart, index);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEntries = currentEntries.filter((entry) => {
      const entryDate = toZonedTime(entry.createdAt, TIMEZONE);
      return entryDate >= dayStart && entryDate <= dayEnd;
    });

    return {
      day,
      earnings: Number(calculateTotal(dayEntries).toFixed(2))
    };
  });

  let comparisonPercentage = 0;
  if (prevTotal > 0) {
    comparisonPercentage = Number((((currentTotal - prevTotal) / prevTotal) * 100).toFixed(2));
  } else if (currentTotal > 0) {
    comparisonPercentage = 100;
  }

  return {
    data: dailyEarnings,
    totalEarnings: Number(currentTotal.toFixed(2)),
    comparisonPercentage
  };
};

const getSalonRevenue = async (filters: ReportFilterParams) => {
  const now = toZonedTime(new Date(), TIMEZONE);
  const isFilterEmpty = !filters.startDate || !filters.endDate;

  const currentStart = !isFilterEmpty
    ? toZonedTime(`${filters.startDate}T00:00:00.000`, TIMEZONE)
    : startOfWeek(now, { weekStartsOn: 1 });
  currentStart.setHours(0, 0, 0, 0);

  const currentEnd = !isFilterEmpty
    ? toZonedTime(`${filters.endDate}T23:59:59.999`, TIMEZONE)
    : endOfWeek(now, { weekStartsOn: 1 });
  currentEnd.setHours(23, 59, 59, 999);

  const where: Prisma.SalonEntryWhereInput = {
    status: 'APPROVED',
    createdAt: {
      gte: currentStart,
      lte: currentEnd
    }
  };

  if (filters.salonId) {
    where.salonId = filters.salonId;
  }

  if (filters.employeeId) {
    where.OR = [
      { employeeId: filters.employeeId },
      { splits: { some: { employeeId: filters.employeeId } } }
    ];
  }

  const entries = await prisma.salonEntry.findMany({
    where,
    select: {
      createdAt: true,
      totalPrice: true,
      tips: true
    }
  });

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const data = days.map((day, index) => {
    const dayStart = addDays(currentStart, index);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayRevenue = entries
      .filter(e => {
        const entryDate = toZonedTime(e.createdAt, TIMEZONE);
        return entryDate >= dayStart && entryDate <= dayEnd;
      })
      .reduce((sum, e) => sum + e.totalPrice + (e.tips || 0), 0);

    return {
      day,
      revenue: Number(dayRevenue.toFixed(2)),
      expenses: 0
    };
  });

  return data;
};

const getTopServices = async (filters: ReportFilterParams) => {
  const now = toZonedTime(new Date(), TIMEZONE);
  const isFilterEmpty = !filters.startDate || !filters.endDate;

  const currentStart = !isFilterEmpty
    ? toZonedTime(`${filters.startDate}T00:00:00.000`, TIMEZONE)
    : startOfWeek(now, { weekStartsOn: 1 });
  currentStart.setHours(0, 0, 0, 0);

  const currentEnd = !isFilterEmpty
    ? toZonedTime(`${filters.endDate}T23:59:59.999`, TIMEZONE)
    : endOfWeek(now, { weekStartsOn: 1 });
  currentEnd.setHours(23, 59, 59, 999);

  const where: Prisma.SalonEntryWhereInput = {
    status: 'APPROVED',
    createdAt: {
      gte: currentStart,
      lte: currentEnd
    }
  };

  if (filters.salonId) {
    where.salonId = filters.salonId;
  }

  if (filters.employeeId) {
    where.OR = [
      { employeeId: filters.employeeId },
      { splits: { some: { employeeId: filters.employeeId } } }
    ];
  }

  // Group by serviceId
  const serviceStats = await prisma.salonEntry.groupBy({
    by: ['serviceId'],
    where,
    _count: {
      serviceId: true
    },
    _sum: {
      actualPrice: true
    }
  });

  // Fetch service names
  const serviceIds = serviceStats.map(s => s.serviceId);
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, name: true }
  });

  const data = serviceStats.map(stat => ({
    name: services.find(s => s.id === stat.serviceId)?.name || 'Unknown',
    count: stat._count.serviceId,
    revenue: Number((stat._sum.actualPrice || 0).toFixed(2))
  }));

  return data.sort((a, b) => b.revenue - a.revenue);
};

export const ReportService = {
  getWeeklyEmployeeEarnings,
  getSalonRevenue,
  getTopServices
};
