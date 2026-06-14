import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ReportService } from './report.service';
const getWeeklyEmployeeEarnings = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getWeeklyEmployeeEarnings({
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    employeeId: req.query.employeeId as string,
    salonId: req.query.salonId as string
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Weekly employee earnings fetched successfully',
    data: result
  });
});

const getSalonRevenue = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getSalonRevenue({
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    employeeId: req.query.employeeId as string,
    salonId: req.query.salonId as string
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Salon revenue fetched successfully',
    data: result
  });
});

const getTopServices = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getTopServices({
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    employeeId: req.query.employeeId as string,
    salonId: req.query.salonId as string
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Top services fetched successfully',
    data: result
  });
});

export const ReportController = {
  getWeeklyEmployeeEarnings,
  getSalonRevenue,
  getTopServices
};
