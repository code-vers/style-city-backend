import type { RequestHandler } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { PayrollService } from './payroll.service';

const getAllPayroll: RequestHandler = catchAsync(async (req, res) => {
  const searchTerm = req.query.searchTerm as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const employeeId = req.query.employeeId as string | undefined;

  const result = await PayrollService.getAllPayroll({ searchTerm, startDate, endDate, employeeId });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Payroll retrieved successfully.',
    data: result
  });
});

const getEmployeePayrollEntries: RequestHandler = catchAsync(async (req, res) => {
  const employeeId = req.params.employeeId as string;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  const result = await PayrollService.getEmployeePayrollEntries(employeeId, { startDate, endDate });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Employee payroll entries retrieved successfully.',
    data: result.data,
    meta: result.meta
  });
});

const markEmployeePaid: RequestHandler = catchAsync(async (req, res) => {
  const result = await PayrollService.markEmployeePaid(req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Employee marked as paid successfully.',
    data: result
  });
});

export const PayrollController = {
  getAllPayroll,
  getEmployeePayrollEntries,
  markEmployeePaid
};
