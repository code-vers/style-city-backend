import { Prisma } from '@prisma/client';
import prisma from '../../utils/prisma';
import type { IPayrollFilterParams } from './payroll.interface';

function parsePayrollDateParts(dateString: string) {
  const normalized = dateString.trim();

  // Handle ISO format YYYY-MM-DD
  const isoDateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnlyMatch) {
    return {
      year: Number(isoDateOnlyMatch[1]),
      month: Number(isoDateOnlyMatch[2]),
      day: Number(isoDateOnlyMatch[3])
    };
  }

  // Handle formats like MM/DD/YYYY or DD/MM/YYYY
  const slashDateMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashDateMatch) {
    const first = Number(slashDateMatch[1]);
    const second = Number(slashDateMatch[2]);
    const year = Number(slashDateMatch[3]);

    // Heuristic: if first > 12, it must be the day (DD/MM/YYYY)
    if (first > 12) {
      return { year, month: second, day: first };
    }
    // If second > 12, it must be the day (MM/DD/YYYY)
    if (second > 12) {
      return { year, month: first, day: second };
    }
    // Default to US format MM/DD/YYYY if both are <= 12
    return { year, month: first, day: second };
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid payroll date format: ${dateString}`);
  }

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate()
  };
}

function buildUtcDayStart(dateString: string) {
  const { year, month, day } = parsePayrollDateParts(dateString);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function buildUtcDayEnd(dateString: string) {
  const { year, month, day } = parsePayrollDateParts(dateString);
  // Using 23:59:59.999 to cover the absolute end of the UTC day
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

import { SalonEntryService } from '../salon-entry/salon-entry.service';
import { fromZonedTime } from 'date-fns-tz';

const getAllPayroll = async (filters: IPayrollFilterParams) => {
  const userConditions: Prisma.UserWhereInput[] = [
    { role: { in: ['EMPLOYEE', 'MANAGER'] } }
  ];

  if (filters.searchTerm) {
    userConditions.push({
      fullName: { contains: filters.searchTerm, mode: 'insensitive' }
    });
  }

  if (filters.employeeId) {
    userConditions.push({ id: filters.employeeId });
  }

  const users = await prisma.user.findMany({
    where: { AND: userConditions },
    include: {
      commissionRate: true,
      salon: true
    }
  });

  const entryFilter: Prisma.SalonEntryWhereInput = {
    status: 'APPROVED'
  };

  if (filters.startDate || filters.endDate) {
    entryFilter.createdAt = {};
    if (filters.startDate) {
      entryFilter.createdAt.gte = fromZonedTime(`${filters.startDate}T00:00:00`, 'America/Chicago');
    }
    if (filters.endDate) {
      entryFilter.createdAt.lte = fromZonedTime(`${filters.endDate}T23:59:59.999`, 'America/Chicago');
    }
  }

  // Fetch all APPROVED SalonEntries within the date range
  const entries = await prisma.salonEntry.findMany({
    where: entryFilter,
    include: {
      splits: true
    }
  });

  const payrollData = users.map((user) => {
    let totalOccurrences = 0;
    let serviceCharge = 0;
    let totalTips = 0;
    let commissionEarnings = 0;
    let paidEarnings = 0;
    let unpaidEarnings = 0;

    // Calculate metrics from entries
    entries.forEach(entry => {
      let isParticipant = false;

      if (entry.employeeId === user.id) {
        isParticipant = true;
        
        let ownServiceCharge = entry.totalPrice - (entry.addHair || 0);
        let ownTips = entry.tips || 0;

        if (entry.isSplit && entry.splits) {
           const otherSplits = entry.splits.filter(s => s.employeeId !== user.id);
           const splitServiceSum = otherSplits.reduce((sum, s) => sum + s.totalPrice, 0);
           const splitTipsSum = otherSplits.reduce((sum, s) => sum + (s.tips || 0), 0);
           
           ownServiceCharge -= splitServiceSum;
           ownTips -= splitTipsSum;
        }
        
        serviceCharge += ownServiceCharge;
        totalTips += ownTips;
        commissionEarnings += entry.commissionEarnings || 0;

        const mainEarnings = (entry.commissionEarnings || 0) + ownTips;
        if (entry.mainIsPaid) {
          paidEarnings += mainEarnings;
        } else {
          unpaidEarnings += mainEarnings;
        }

      } else if (entry.isSplit && entry.splits) {
        const userSplit = entry.splits.find(s => s.employeeId === user.id);
        if (userSplit) {
          isParticipant = true;
          serviceCharge += userSplit.totalPrice;
          totalTips += (userSplit.tips || 0);
          commissionEarnings += userSplit.commissionEarnings || 0;

          const splitEarnings = (userSplit.commissionEarnings || 0) + (userSplit.tips || 0);
          if (userSplit.isPaid) {
            paidEarnings += splitEarnings;
          } else {
            unpaidEarnings += splitEarnings;
          }
        }
      }

      if (isParticipant) {
        totalOccurrences += 1;
      }
    });

    // Calculate commission based on stored rate
    const currentCommissionRate = user.commissionRate?.rate || 0;

    const earnings = commissionEarnings + totalTips;

    return {
      employeeId: user.id,
      employeeName: user.fullName,
      salonName: user.salon?.name || 'N/A',
      totalOccurrences,
      commissionRate: currentCommissionRate,
      serviceCharge,
      commissionEarnings,
      totalTips,
      earnings,
      paidEarnings,
      unpaidEarnings
    };
  });

  // Filter out employees with no occurrences if you want, or show everyone.
  // The instructions said "show all employee and manager with there details". So we show all.
  return payrollData.sort((a, b) => b.earnings - a.earnings);
};

const getEmployeePayrollEntries = async (employeeId: string, filters: IPayrollFilterParams) => {
  return SalonEntryService.getAllSalonEntries(
    employeeId,
    'EMPLOYEE', 
    {
      startDate: filters.startDate,
      endDate: filters.endDate,
      status: 'APPROVED',
      employeeId: employeeId
    },
    1,
    1000
  );
};

const markEmployeePaid = async (
  payload: { employeeId: string; startDate?: string; endDate?: string }
) => {
  return await prisma.$transaction(async (tx) => {
    let dateFilter: any = {};
    if (payload.startDate || payload.endDate) {
      dateFilter.createdAt = {};
      if (payload.startDate) {
        dateFilter.createdAt.gte = fromZonedTime(`${payload.startDate}T00:00:00`, 'America/Chicago');
      }
      if (payload.endDate) {
        dateFilter.createdAt.lte = fromZonedTime(`${payload.endDate}T23:59:59.999`, 'America/Chicago');
      }
    }

    const mainUpdate = await tx.salonEntry.updateMany({
      where: {
        employeeId: payload.employeeId,
        status: 'APPROVED',
        mainIsPaid: false,
        ...dateFilter
      },
      data: {
        mainIsPaid: true,
        mainPaidAt: new Date()
      }
    });

    const splitUpdate = await tx.splitEntry.updateMany({
      where: {
        employeeId: payload.employeeId,
        isPaid: false,
        salonEntry: {
          status: 'APPROVED',
          ...dateFilter
        }
      },
      data: {
        isPaid: true,
        paidAt: new Date()
      }
    });

    return {
      success: true,
      updatedMainEntries: mainUpdate.count,
      updatedSplitEntries: splitUpdate.count
    };
  });
};

export const PayrollService = {
  getAllPayroll,
  getEmployeePayrollEntries,
  markEmployeePaid
};
