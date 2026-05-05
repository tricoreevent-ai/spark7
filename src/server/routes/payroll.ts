import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Employee } from '../models/Employee.js';
import { Attendance } from '../models/Attendance.js';
import { ShiftSchedule } from '../models/ShiftSchedule.js';
import { PayrollStatutoryChallan, type PayrollChallanType } from '../models/PayrollStatutoryChallan.js';
import { PayrollArrear } from '../models/PayrollArrear.js';
import { PayrollForm16 } from '../models/PayrollForm16.js';
import { PayrollFullFinalSettlement } from '../models/PayrollFullFinalSettlement.js';
import { SalaryPayment } from '../models/SalaryPayment.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';
import { getTdsCompanySettings } from '../services/tds.js';
import { loadTenantGeneralSettings } from '../services/generalSettings.js';
import { jsPDF } from 'jspdf';

const router = Router();

interface PayrollRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  employmentType: string;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  weeklyOffDays: number;
  payableDays: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  arrearsPay: number;
  grossPay: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  professionalTax: number;
  tdsAmount: number;
  totalDeductions: number;
  totalEmployerContribution: number;
  netPay: number;
  totalPayable: number;
  arrearIds?: string[];
}

const round2 = (value: number): number => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const toNumber = (value: any): number => Number(value || 0);
const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const fyRegex = /^\d{4}-\d{2}$/;

const validateMonth = (month: string) => {
  if (!monthRegex.test(month)) throw new Error('month must be YYYY-MM format');
  return month;
};

const monthRange = (month: string) => {
  validateMonth(month);
  const [year, mon] = month.split('-').map(Number);
  return {
    start: new Date(year, mon - 1, 1),
    end: new Date(year, mon, 0, 23, 59, 59, 999),
    daysInMonth: new Date(year, mon, 0).getDate(),
  };
};

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthIndex = (month: string): number => {
  validateMonth(month);
  const [year, mon] = month.split('-').map(Number);
  return year * 12 + mon;
};

const financialYearForMonth = (month: string): string => {
  validateMonth(month);
  const [year, mon] = month.split('-').map(Number);
  const startYear = mon >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

const financialYearMonths = (financialYear: string): string[] => {
  if (!fyRegex.test(financialYear)) throw new Error('financialYear must be YYYY-YY format');
  const startYear = Number(financialYear.slice(0, 4));
  return [
    ...Array.from({ length: 9 }, (_, idx) => `${startYear}-${String(idx + 4).padStart(2, '0')}`),
    ...Array.from({ length: 3 }, (_, idx) => `${startYear + 1}-${String(idx + 1).padStart(2, '0')}`),
  ];
};

const dueDateForChallan = (month: string, challanType: PayrollChallanType): Date => {
  const { end } = monthRange(month);
  const due = new Date(end);
  due.setDate(1);
  due.setMonth(due.getMonth() + 1);
  due.setHours(0, 0, 0, 0);
  due.setDate(challanType === 'pt' ? 20 : challanType === 'tds' ? 7 : 15);
  return due;
};

const parseDate = (value: any, fallback?: Date): Date => {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (fallback) return fallback;
    throw new Error('Valid date is required');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid date value');
  return parsed;
};

const calculateStatutoryDeductions = (emp: any, grossPay: number, payableDays: number, daysInMonth: number) => {
  const monthlyBasic = Number(emp.basicSalary || 0) > 0
    ? Number(emp.basicSalary || 0)
    : Number(emp.monthlySalary || 0) * 0.5;
  const monthlyDa = Number(emp.dearnessAllowance || 0);
  const proratedBasicDa = emp.employmentType === 'salaried'
    ? ((monthlyBasic + monthlyDa) / Math.max(daysInMonth, 1)) * payableDays
    : grossPay;
  const pfBase = Math.min(Math.max(0, proratedBasicDa), 15000);
  const pfEmployee = emp.pfEnabled === false ? 0 : round2(pfBase * 0.12);
  const pfEmployer = emp.pfEnabled === false ? 0 : round2(pfBase * 0.12);
  const esiApplicable = emp.esiEnabled !== false && grossPay <= 21000;
  const esiEmployee = esiApplicable ? round2(grossPay * 0.0075) : 0;
  const esiEmployer = esiApplicable ? round2(grossPay * 0.0325) : 0;
  const professionalTax = emp.professionalTaxEnabled ? round2(Number(emp.professionalTax || 0)) : 0;
  const tdsAmount = emp.tdsEnabled ? round2(Number(emp.monthlyTdsOverride || 0)) : 0;
  const totalDeductions = round2(pfEmployee + esiEmployee + professionalTax + tdsAmount);
  const totalEmployerContribution = round2(pfEmployer + esiEmployer);
  const netPay = round2(Math.max(0, grossPay - totalDeductions));

  return {
    pfEmployee,
    pfEmployer,
    esiEmployee,
    esiEmployer,
    professionalTax,
    tdsAmount,
    totalDeductions,
    totalEmployerContribution,
    netPay,
  };
};

const loadArrearsByEmployee = async (month: string) => {
  const arrears = await PayrollArrear.find({
    payoutMonth: month,
    status: { $in: ['approved', 'included'] },
  }).sort({ createdAt: 1 });

  const map = new Map<string, { amount: number; ids: string[] }>();
  for (const row of arrears as any[]) {
    const key = String(row.employeeId);
    const existing = map.get(key) || { amount: 0, ids: [] };
    existing.amount = round2(existing.amount + toNumber(row.arrearsAmount));
    existing.ids.push(row._id.toString());
    map.set(key, existing);
  }
  return map;
};

const generatePayroll = async (month: string, options: { includeInactive?: boolean } = {}): Promise<PayrollRow[]> => {
  const { start, end, daysInMonth } = monthRange(month);
  const arrearsByEmployee = await loadArrearsByEmployee(month);

  const [employees, attendance, shifts] = await Promise.all([
    Employee.find(options.includeInactive ? {} : { active: true }).sort({ employeeCode: 1 }),
    Attendance.find({ date: { $gte: start, $lte: end } }).sort({ date: 1 }),
    ShiftSchedule.find({ date: { $gte: start, $lte: end } }).sort({ date: 1 }),
  ]);

  const attendanceMap = new Map<string, any>();
  for (const a of attendance) attendanceMap.set(`${String(a.employeeId)}_${a.dateKey}`, a);

  const shiftMap = new Map<string, any>();
  for (const s of shifts) shiftMap.set(`${String(s.employeeId)}_${s.dateKey}`, s);

  const rows: PayrollRow[] = [];

  for (const emp of employees as any[]) {
    let presentDays = 0;
    let halfDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let weeklyOffDays = 0;
    let payableDays = 0;
    let overtimeHours = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(start.getFullYear(), start.getMonth(), day);
      const dKey = dateKey(d);
      const attendanceRec = attendanceMap.get(`${String(emp._id)}_${dKey}`);
      const shiftRec = shiftMap.get(`${String(emp._id)}_${dKey}`);

      if (attendanceRec) {
        if (attendanceRec.status === 'present') {
          presentDays += 1;
          payableDays += 1;
        } else if (attendanceRec.status === 'half_day') {
          halfDays += 1;
          payableDays += 0.5;
        } else if (attendanceRec.status === 'leave') {
          leaveDays += 1;
          if (emp.paidLeave) payableDays += 1;
        } else {
          absentDays += 1;
        }
        overtimeHours += Number(attendanceRec.overtimeHours || 0);
      } else if (shiftRec?.isWeeklyOff) {
        weeklyOffDays += 1;
        if (emp.employmentType === 'salaried') payableDays += 1;
      } else {
        absentDays += 1;
      }
    }

    const monthlySalary = Number(emp.monthlySalary || 0);
    const dailyRate = Number(emp.dailyRate || 0);
    const overtimeRate = Number(emp.overtimeHourlyRate || 0);
    const basePay = emp.employmentType === 'salaried'
      ? (monthlySalary / Math.max(daysInMonth, 1)) * payableDays
      : dailyRate * payableDays;
    const overtimePay = overtimeHours * overtimeRate;
    const arrear = arrearsByEmployee.get(String(emp._id));
    const arrearsPay = round2(arrear?.amount || 0);
    const grossPay = round2(basePay + overtimePay + arrearsPay);
    const statutory = calculateStatutoryDeductions(emp, grossPay, payableDays, daysInMonth);

    rows.push({
      employeeId: String(emp._id),
      employeeCode: emp.employeeCode,
      name: emp.name,
      employmentType: emp.employmentType,
      presentDays,
      halfDays,
      leaveDays,
      absentDays,
      weeklyOffDays,
      payableDays,
      overtimeHours,
      basePay: round2(basePay),
      overtimePay: round2(overtimePay),
      arrearsPay,
      grossPay,
      ...statutory,
      totalPayable: statutory.netPay,
      arrearIds: arrear?.ids || [],
    });
  }

  return rows;
};

const buildPayrollSummary = (rows: PayrollRow[]) => ({
  totalPayout: round2(rows.reduce((sum, row) => sum + row.netPay, 0)),
  totalEmployerContribution: round2(rows.reduce((sum, row) => sum + row.totalEmployerContribution, 0)),
  totalPf: round2(rows.reduce((sum, row) => sum + row.pfEmployee + row.pfEmployer, 0)),
  totalEsi: round2(rows.reduce((sum, row) => sum + row.esiEmployee + row.esiEmployer, 0)),
  totalPt: round2(rows.reduce((sum, row) => sum + row.professionalTax, 0)),
  totalTds: round2(rows.reduce((sum, row) => sum + row.tdsAmount, 0)),
  totalArrears: round2(rows.reduce((sum, row) => sum + row.arrearsPay, 0)),
});

const challanAmountsForType = (rows: PayrollRow[], challanType: PayrollChallanType) => {
  const employeeBreakup = rows
    .map((row) => {
      const employeeAmount =
        challanType === 'pf'
          ? row.pfEmployee
          : challanType === 'esi'
            ? row.esiEmployee
            : challanType === 'pt'
              ? row.professionalTax
              : row.tdsAmount;
      const employerAmount =
        challanType === 'pf'
          ? row.pfEmployer
          : challanType === 'esi'
            ? row.esiEmployer
            : 0;

      return {
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        name: row.name,
        employeeAmount: round2(employeeAmount),
        employerAmount: round2(employerAmount),
        grossPay: round2(row.grossPay),
      };
    })
    .filter((row) => row.employeeAmount > 0 || row.employerAmount > 0);

  const employeeAmount = round2(employeeBreakup.reduce((sum, row) => sum + row.employeeAmount, 0));
  const employerAmount = round2(employeeBreakup.reduce((sum, row) => sum + row.employerAmount, 0));
  return { employeeBreakup, employeeAmount, employerAmount };
};

const challanLabel = (type: PayrollChallanType) => {
  if (type === 'pf') return 'Provident Fund';
  if (type === 'esi') return 'ESI';
  if (type === 'pt') return 'Professional Tax';
  return 'Salary TDS';
};

const buildChallanContent = (input: {
  challanType: PayrollChallanType;
  month: string;
  challanNumber: string;
  employeeAmount: number;
  employerAmount: number;
  totalAmount: number;
  employeeBreakup: any[];
}) => [
  `SPARK7_PAYROLL_CHALLAN|${input.challanType.toUpperCase()}|${input.month}|${input.challanNumber}`,
  `SUMMARY|EMPLOYEE:${round2(input.employeeAmount)}|EMPLOYER:${round2(input.employerAmount)}|TOTAL:${round2(input.totalAmount)}`,
  'EMPLOYEE_CODE|NAME|GROSS_PAY|EMPLOYEE_AMOUNT|EMPLOYER_AMOUNT',
  ...input.employeeBreakup.map((row) => [
    row.employeeCode,
    row.name,
    round2(row.grossPay),
    round2(row.employeeAmount),
    round2(row.employerAmount),
  ].join('|')),
  'NOTE|Internal challan worksheet. Use government portal / bank confirmation for statutory payment.',
].join('\n');

const money = (value: any): number => round2(Number(value || 0));
const cleanText = (value: any, fallback = ''): string => String(value ?? fallback).trim();
const toUpperClean = (value: any): string => cleanText(value).toUpperCase();
const formatMoney = (value: any): string => money(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (value: any): string => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN');
};

const assessmentYearForFinancialYear = (financialYear: string): string => {
  const startYear = Number(financialYear.slice(0, 4));
  return `${startYear + 1}-${String((startYear + 2) % 100).padStart(2, '0')}`;
};

const fiscalPeriodForFinancialYear = (financialYear: string) => {
  const startYear = Number(financialYear.slice(0, 4));
  return {
    start: new Date(startYear, 3, 1),
    end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
  };
};

const quarterForMonth = (month: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' => {
  const numericMonth = Number(month.slice(5, 7));
  if (numericMonth >= 4 && numericMonth <= 6) return 'Q1';
  if (numericMonth >= 7 && numericMonth <= 9) return 'Q2';
  if (numericMonth >= 10 && numericMonth <= 12) return 'Q3';
  return 'Q4';
};

const dateFromInput = (value: any, fallback: Date): Date => {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const tenantBusinessProfile = async (tenantId?: string) => {
  const settings = await loadTenantGeneralSettings(tenantId);
  const business = settings?.business && typeof settings.business === 'object' ? settings.business : {};
  const address = [
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state].filter(Boolean).join(', '),
    [business.pincode, business.country].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  return {
    legalName: cleanText(business.legalName || business.tradeName),
    pan: toUpperClean(business.pan),
    email: cleanText(business.email),
    phone: cleanText(business.phone),
    address,
  };
};

const form16Number = (body: any, key: string, fallback = 0): number => {
  if (body?.[key] === undefined || body?.[key] === null || body?.[key] === '') return money(fallback);
  return money(body[key]);
};

const tablePageBreak = (doc: jsPDF, y: number, required = 18): number => {
  if (y + required <= 282) return y;
  doc.addPage();
  return 16;
};

const drawHeader = (doc: jsPDF, row: any, part: 'PART A' | 'PART B') => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TDS', 16, 11);
  doc.setFontSize(8);
  doc.text('TRACES style certificate', 32, 11);
  doc.setFontSize(7);
  doc.text('Government of India - Income Tax Department', 134, 11);
  doc.setDrawColor(60);
  doc.line(14, 15, 196, 15);

  doc.setFontSize(13);
  doc.text('FORM NO. 16', 105, 23, { align: 'center' });
  doc.setFontSize(9);
  doc.text(part, 105, 29, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Certificate under Section 203 of the Income-tax Act, 1961 for tax deducted at source on salary', 105, 35, { align: 'center' });
  doc.text(`Certificate No. ${row.certificateNumber || '-'}`, 16, 42);
  doc.text(`Last updated on ${formatDate(row.lastUpdatedOn || row.generatedAt)}`, 196, 42, { align: 'right' });
};

const drawTable = (
  doc: jsPDF,
  startY: number,
  headers: string[],
  rows: Array<Array<string | number>>,
  widths: number[],
  options: { x?: number; fontSize?: number; headerFill?: boolean } = {}
): number => {
  const x = options.x ?? 14;
  const fontSize = options.fontSize ?? 7.2;
  let y = startY;
  const drawRow = (cells: Array<string | number>, bold = false, fill = false) => {
    const splitCells = cells.map((cell, idx) => doc.splitTextToSize(String(cell ?? '-'), widths[idx] - 3));
    const height = Math.max(7, ...splitCells.map((lines: string[]) => lines.length * 3.5 + 3));
    y = tablePageBreak(doc, y, height + 2);
    let cx = x;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    if (fill) {
      doc.setFillColor(237, 242, 247);
      doc.rect(x, y, widths.reduce((sum, width) => sum + width, 0), height, 'F');
    }
    for (let idx = 0; idx < cells.length; idx += 1) {
      doc.rect(cx, y, widths[idx], height);
      doc.text(splitCells[idx], cx + 1.5, y + 4);
      cx += widths[idx];
    }
    y += height;
  };
  drawRow(headers, true, options.headerFill !== false);
  rows.forEach((row) => drawRow(row));
  return y + 3;
};

const drawKeyValueGrid = (doc: jsPDF, startY: number, rows: Array<[string, string, string, string]>): number =>
  drawTable(doc, startY, ['Particulars', 'Value', 'Particulars', 'Value'], rows, [45, 46, 45, 46], { fontSize: 7.2 });

const drawVerification = (doc: jsPDF, row: any, y: number, part: 'PART A' | 'PART B'): number => {
  y = tablePageBreak(doc, y, 38);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Verification', 105, y, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  const statement = `I, ${row.responsiblePersonName || '<NAME OF EMPLOYER>'}, working in the capacity of ${row.responsiblePersonDesignation || 'Authorised Signatory'}, certify that the information in ${part} is true, complete and correct and is based on books of account, documents, TDS statements and other available records.`;
  const lines = doc.splitTextToSize(statement, 176);
  doc.rect(14, y, 182, lines.length * 3.8 + 6);
  doc.text(lines, 17, y + 5);
  y += lines.length * 3.8 + 8;
  y = drawTable(doc, y, ['Place', 'Date', 'Signature', 'Full Name'], [[row.employerAddress?.split(',')?.[0] || '-', formatDate(row.lastUpdatedOn || new Date()), '(Signature of person responsible for deduction of tax)', row.responsiblePersonName || '-']], [35, 35, 66, 46], { fontSize: 7 });
  return y;
};

const buildForm16Pdf = (rowInput: any): Buffer => {
  const row = typeof rowInput.toObject === 'function' ? rowInput.toObject() : rowInput;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  drawHeader(doc, row, 'PART A');
  let y = 48;
  y = drawTable(
    doc,
    y,
    ['Name and address of the Employer', 'Name and address of the Employee'],
    [[
      [row.employerName, row.employerAddress, row.employerPhone ? `Phone: ${row.employerPhone}` : '', row.employerEmail ? `Email: ${row.employerEmail}` : ''].filter(Boolean).join('\n') || '-',
      [row.employeeName, row.employeeAddress, row.employeeDesignation ? `Designation: ${row.employeeDesignation}` : ''].filter(Boolean).join('\n') || '-',
    ]],
    [91, 91],
    { fontSize: 7.2 }
  );
  y = drawKeyValueGrid(doc, y, [
    ['PAN of Deductor', row.employerPan || '-', 'TAN of Deductor', row.employerTan || '-'],
    ['PAN of Employee', row.pan || '-', 'Employee Reference No.', row.employeeCode || '-'],
    ['CIT (TDS)', row.citTds || '-', 'Assessment Year', row.assessmentYear || '-'],
    ['Period with Employer - From', formatDate(row.periodFrom), 'To', formatDate(row.periodTo)],
  ]);
  y = drawTable(
    doc,
    y,
    ['Quarter(s)', 'Receipt No. of original quarterly statement u/s 200', 'Amount paid/credited', 'Tax deducted', 'Tax deposited/remitted'],
    (row.quarterlyBreakup || []).map((q: any) => [q.quarter, q.receiptNumber || '-', formatMoney(q.amountPaidCredited), formatMoney(q.taxDeducted), formatMoney(q.taxDepositedRemitted)]),
    [25, 55, 34, 34, 34],
    { fontSize: 6.9 }
  );
  y = drawTable(
    doc,
    y,
    ['Sl. No.', 'Tax deposited for employee', 'BSR Code', 'Date of deposit', 'Challan Serial No.', 'OLTAS status'],
    (row.challanBreakup?.length ? row.challanBreakup : [{ serialNo: 1, taxDeposited: row.tdsDeposited || row.tdsDeducted }]).map((c: any, idx: number) => [c.serialNo || idx + 1, formatMoney(c.taxDeposited), c.bsrCode || '-', formatDate(c.depositedDate), c.challanSerialNumber || '-', c.oltasStatus || '-']),
    [18, 42, 32, 32, 32, 26],
    { fontSize: 6.9 }
  );
  y = drawVerification(doc, row, y, 'PART A');
  doc.setFontSize(6.5);
  doc.text('Note: Generated from payroll records. Reconcile statutory certificate values with TRACES before final issue.', 14, Math.min(290, y + 4));

  doc.addPage();
  drawHeader(doc, row, 'PART B');
  y = 48;
  y = drawKeyValueGrid(doc, y, [
    ['PAN of Deductor', row.employerPan || '-', 'TAN of Deductor', row.employerTan || '-'],
    ['PAN of Employee', row.pan || '-', 'Assessment Year', row.assessmentYear || '-'],
    ['Period with Employer - From', formatDate(row.periodFrom), 'To', formatDate(row.periodTo)],
  ]);
  y = drawTable(doc, y, ['Details of salary paid and other income and tax deducted', 'Amount'], [
    ['1(a) Salary as per provisions contained in section 17(1)', formatMoney(row.salary17_1)],
    ['1(b) Value of perquisites under section 17(2)', formatMoney(row.perquisites17_2)],
    ['1(c) Profits in lieu of salary under section 17(3)', formatMoney(row.profits17_3)],
    ['1(d) Gross salary', formatMoney(row.grossSalary)],
    ['1(e) Reported total salary received from other employer(s)', formatMoney(row.salaryFromOtherEmployers)],
    ['2(a) Travel concession or assistance under section 10(5)', formatMoney(row.travelConcessionExemption)],
    ['2(b) Death-cum-retirement gratuity under section 10(10)', formatMoney(row.gratuityExemption)],
    ['2(c) Commuted value of pension under section 10(10A)', formatMoney(row.pensionCommutationExemption)],
    ['2(d) Cash equivalent of leave salary encashment under section 10(10AA)', formatMoney(row.leaveEncashmentExemption)],
    ['2(e) House rent allowance under section 10(13A)', formatMoney(row.hraExemption)],
    ['2(g) Any other exemption under section 10', formatMoney(row.otherSection10Exemption)],
    ['2(h) Total exemption claimed under section 10', formatMoney(row.totalSection10Exemption)],
    ['3. Total salary received from current employer', formatMoney(row.salaryFromCurrentEmployer)],
    ['5(a) Standard deduction under section 16(ia)', formatMoney(row.standardDeduction)],
    ['5(b) Entertainment allowance under section 16(ii)', formatMoney(row.entertainmentAllowance)],
    ['5(c) Tax on employment under section 16(iii)', formatMoney(row.professionalTax)],
    ['6. Income chargeable under the head Salaries', formatMoney(row.incomeChargeableSalaries)],
    ['7(a) Income/loss from house property reported by employee', formatMoney(row.housePropertyIncome)],
    ['7(b) Income under the head Other Sources offered for TDS', formatMoney(row.otherSourcesIncome)],
    ['9. Gross total income', formatMoney(row.grossTotalIncome)],
  ], [140, 42], { fontSize: 6.8 });

  y = drawTable(doc, y, ['Deductions under Chapter VI-A', 'Deductible Amount'], [
    ['10(a) Deduction in respect of life insurance, provident fund etc. under section 80C', formatMoney(row.deduction80C)],
    ['10(b) Deduction in respect of certain pension funds under section 80CCC', formatMoney(row.deduction80CCC)],
    ['10(c) Deduction in respect of contribution by taxpayer to pension scheme under section 80CCD(1)', formatMoney(row.deduction80CCD1)],
    ['10(e) Deduction in respect of amount paid/deposited to notified pension scheme under section 80CCD(1B)', formatMoney(row.deduction80CCD1B)],
    ['10(f) Deduction in respect of contribution by Employer to pension scheme under section 80CCD(2)', formatMoney(row.deduction80CCD2)],
    ['10(g) Deduction in respect of health insurance premium under section 80D', formatMoney(row.deduction80D)],
    ['10(h) Deduction in respect of interest on loan for higher education under section 80E', formatMoney(row.deduction80E)],
    ['10(i) Total deduction in respect of donations to certain funds under section 80G', formatMoney(row.deduction80G)],
    ['10(j) Deduction in respect of interest on deposits in savings account under section 80TTA', formatMoney(row.deduction80TTA)],
    ['10(l) Any other Chapter VI-A deduction', formatMoney(row.otherChapterVIADeductions)],
    ['11. Aggregate deductible amount under Chapter VI-A', formatMoney(row.totalChapterVIADeductions)],
  ], [140, 42], { fontSize: 6.8 });

  y = drawTable(doc, y, ['Tax Computation', 'Amount'], [
    ['12. Total taxable income', formatMoney(row.taxableIncome)],
    ['13. Tax on total income', formatMoney(row.taxOnTotalIncome)],
    ['14. Rebate under section 87A, if applicable', formatMoney(row.rebate87A)],
    ['15. Surcharge, wherever applicable', formatMoney(row.surcharge)],
    ['16. Health and education cess', formatMoney(row.healthEducationCess)],
    ['17. Tax payable', formatMoney(money(row.taxOnTotalIncome) + money(row.surcharge) + money(row.healthEducationCess) - money(row.rebate87A))],
    ['18. Less: Relief under section 89', formatMoney(row.relief89)],
    ['19. Net tax payable', formatMoney(row.netTaxPayable)],
    ['TDS deducted from salary payroll', formatMoney(row.tdsDeducted)],
  ], [140, 42], { fontSize: 6.8 });
  drawVerification(doc, row, y, 'PART B');

  return Buffer.from(doc.output('arraybuffer'));
};

router.get('/generate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const month = validateMonth((req.query.month as string) || new Date().toISOString().slice(0, 7));
    const rows = await generatePayroll(month);
    const summary = buildPayrollSummary(rows);

    res.json({
      success: true,
      data: {
        month,
        totalEmployees: rows.length,
        ...summary,
        rows,
      },
    });
  } catch (error: any) {
    const status = String(error.message || '').includes('month must') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to generate payroll' });
  }
});

router.get('/export/csv', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const month = validateMonth((req.query.month as string) || new Date().toISOString().slice(0, 7));
    const rows = await generatePayroll(month);

    const headers = [
      'Employee Code',
      'Name',
      'Type',
      'Present',
      'Half Day',
      'Leave',
      'Absent',
      'Weekly Off',
      'Payable Days',
      'OT Hours',
      'Base Pay',
      'OT Pay',
      'Arrears',
      'Gross Pay',
      'PF Employee',
      'PF Employer',
      'ESI Employee',
      'ESI Employer',
      'Professional Tax',
      'TDS',
      'Total Deductions',
      'Net Pay',
    ];

    const csvRows = rows.map((r) => [
      r.employeeCode,
      r.name,
      r.employmentType,
      r.presentDays,
      r.halfDays,
      r.leaveDays,
      r.absentDays,
      r.weeklyOffDays,
      r.payableDays,
      r.overtimeHours,
      r.basePay,
      r.overtimePay,
      r.arrearsPay,
      r.grossPay,
      r.pfEmployee,
      r.pfEmployer,
      r.esiEmployee,
      r.esiEmployer,
      r.professionalTax,
      r.tdsAmount,
      r.totalDeductions,
      r.netPay,
    ]);

    const csv = [
      headers.join(','),
      ...csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_${month}.csv`);
    res.send(csv);
  } catch (error: any) {
    const status = String(error.message || '').includes('month must') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to export payroll CSV' });
  }
});

router.get('/challans', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter: any = {};
    if (req.query.challanType) filter.challanType = String(req.query.challanType);
    if (req.query.periodKey) filter.periodKey = String(req.query.periodKey);
    if (req.query.financialYear) filter.financialYear = String(req.query.financialYear);
    const rows = await PayrollStatutoryChallan.find(filter).sort({ generatedDate: -1, createdAt: -1 }).limit(200);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch payroll challans' });
  }
});

router.post('/challans/generate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const month = validateMonth(String(req.body?.month || new Date().toISOString().slice(0, 7)));
    const challanType = String(req.body?.challanType || '').toLowerCase() as PayrollChallanType;
    if (!['pf', 'esi', 'pt', 'tds'].includes(challanType)) {
      return res.status(400).json({ success: false, error: 'challanType must be pf, esi, pt, or tds' });
    }

    const rows = await generatePayroll(month);
    const amounts = challanAmountsForType(rows, challanType);
    const penaltyAmount = round2(toNumber(req.body?.penaltyAmount));
    const interestAmount = round2(toNumber(req.body?.interestAmount));
    const totalAmount = round2(amounts.employeeAmount + amounts.employerAmount + penaltyAmount + interestAmount);

    if (totalAmount <= 0) {
      return res.status(400).json({ success: false, error: `No ${challanLabel(challanType)} payable amount found for ${month}` });
    }

    const challanNumber =
      String(req.body?.challanNumber || '').trim().toUpperCase()
      || await generateNumber('payroll_challan', { prefix: `PC-${challanType.toUpperCase()}-`, datePart: true, padTo: 5 });
    const fileContent = buildChallanContent({
      challanType,
      month,
      challanNumber,
      employeeAmount: amounts.employeeAmount,
      employerAmount: amounts.employerAmount,
      totalAmount,
      employeeBreakup: amounts.employeeBreakup,
    });

    const challan = await PayrollStatutoryChallan.findOneAndUpdate(
      { challanType, periodKey: month },
      {
        challanType,
        periodType: 'month',
        periodKey: month,
        financialYear: financialYearForMonth(month),
        dueDate: dueDateForChallan(month, challanType),
        generatedDate: new Date(),
        paymentDate: req.body?.paymentDate ? parseDate(req.body.paymentDate) : undefined,
        challanNumber,
        utrNumber: String(req.body?.utrNumber || '').trim().toUpperCase(),
        bankName: String(req.body?.bankName || '').trim(),
        status: req.body?.markPaid ? 'paid' : 'generated',
        employeeAmount: amounts.employeeAmount,
        employerAmount: amounts.employerAmount,
        penaltyAmount,
        interestAmount,
        totalAmount,
        employeeBreakup: amounts.employeeBreakup,
        fileName: `payroll-${challanType}-challan-${month}.txt`,
        fileContent,
        notes: String(req.body?.notes || '').trim(),
        createdBy: req.userId,
      },
      { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await writeAuditLog({
      module: 'payroll',
      action: 'payroll_statutory_challan_generated',
      entityType: 'payroll_challan',
      entityId: challan._id.toString(),
      referenceNo: challan.challanNumber,
      userId: req.userId,
      after: challan.toObject(),
    });

    res.status(201).json({ success: true, message: `${challanLabel(challanType)} challan generated`, data: challan });
  } catch (error: any) {
    const msg = String(error.message || '');
    const status = msg.includes('month must') || msg.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to generate statutory challan' });
  }
});

router.get('/challans/:id/download', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await PayrollStatutoryChallan.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Payroll challan not found' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${row.fileName || `payroll-challan-${row._id}.txt`}`);
    res.send(row.fileContent || '');
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to download challan' });
  }
});

router.get('/arrears', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter: any = {};
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    if (req.query.payoutMonth) filter.payoutMonth = String(req.query.payoutMonth);
    const rows = await PayrollArrear.find(filter).sort({ payoutMonth: -1, createdAt: -1 }).limit(200);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch arrears' });
  }
});

router.post('/arrears', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employee = await Employee.findById(req.body?.employeeId);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
    const effectiveMonth = validateMonth(String(req.body?.effectiveMonth || ''));
    const payoutMonth = validateMonth(String(req.body?.payoutMonth || new Date().toISOString().slice(0, 7)));
    const previousMonthlySalary = round2(toNumber(req.body?.previousMonthlySalary || employee.monthlySalary));
    const revisedMonthlySalary = round2(toNumber(req.body?.revisedMonthlySalary));
    if (revisedMonthlySalary <= 0) return res.status(400).json({ success: false, error: 'revisedMonthlySalary must be greater than 0' });
    const monthsCount = Math.max(1, monthIndex(payoutMonth) - monthIndex(effectiveMonth));
    const monthlyDifference = round2(revisedMonthlySalary - previousMonthlySalary);
    const arrearsAmount = round2(monthlyDifference * monthsCount);

    const row = await PayrollArrear.create({
      employeeId: employee._id,
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      effectiveMonth,
      payoutMonth,
      previousMonthlySalary,
      revisedMonthlySalary,
      monthlyDifference,
      monthsCount,
      arrearsAmount,
      reason: String(req.body?.reason || '').trim(),
      status: req.body?.status === 'draft' ? 'draft' : 'approved',
      createdBy: req.userId,
      approvedBy: req.body?.status === 'draft' ? undefined : req.userId,
      approvedAt: req.body?.status === 'draft' ? undefined : new Date(),
    });

    if (req.body?.applyRevision) {
      employee.monthlySalary = revisedMonthlySalary;
      await employee.save();
    }

    await writeAuditLog({
      module: 'payroll',
      action: 'payroll_arrear_created',
      entityType: 'payroll_arrear',
      entityId: row._id.toString(),
      referenceNo: `${employee.employeeCode}:${payoutMonth}`,
      userId: req.userId,
      after: row.toObject(),
    });

    res.status(201).json({ success: true, message: 'Salary arrears calculated and saved', data: row });
  } catch (error: any) {
    const msg = String(error.message || '');
    const status = msg.includes('month must') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to create arrears' });
  }
});

router.get('/form16', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter: any = {};
    if (req.query.financialYear) filter.financialYear = String(req.query.financialYear);
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    const rows = await PayrollForm16.find(filter).sort({ financialYear: -1, employeeCode: 1 }).limit(200);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch Form 16 records' });
  }
});

router.post('/form16/generate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const financialYear = String(req.body?.financialYear || financialYearForMonth(new Date().toISOString().slice(0, 7))).trim();
    if (!fyRegex.test(financialYear)) return res.status(400).json({ success: false, error: 'financialYear must be YYYY-YY format' });

    const company = await getTdsCompanySettings();
    const business = await tenantBusinessProfile(req.tenantId);
    const months = financialYearMonths(financialYear);
    const fiscalPeriod = fiscalPeriodForFinancialYear(financialYear);
    const assessmentYear = cleanText(req.body?.assessmentYear) || assessmentYearForFinancialYear(financialYear);
    const monthRows = await Promise.all(months.map((month) => generatePayroll(month, { includeInactive: true })));
    const salaryPayments = await SalaryPayment.find({ month: { $in: months } }).sort({ payDate: 1, createdAt: 1 });
    const salaryByEmployeeMonth = new Map<string, any>();
    for (const payment of salaryPayments as any[]) {
      if (payment.employeeId) salaryByEmployeeMonth.set(`${String(payment.employeeId)}_${payment.month}`, payment);
    }
    const tdsChallans = await PayrollStatutoryChallan.find({ challanType: 'tds', financialYear }).sort({ periodKey: 1, generatedDate: 1 });
    const employeeFilter: any = {};
    if (req.body?.employeeId) employeeFilter._id = String(req.body.employeeId);
    const employees = await Employee.find(employeeFilter).sort({ employeeCode: 1 });
    const generated: any[] = [];

    for (const employee of employees as any[]) {
      const monthlyBreakup = months.map((month, idx) => {
        const paidRow = salaryByEmployeeMonth.get(`${String(employee._id)}_${month}`);
        const row = monthRows[idx].find((pay) => pay.employeeId === String(employee._id));
        const grossFromPayment = money(paidRow?.grossSalary || (money(paidRow?.baseAmount) + money(paidRow?.bonusAmount)) || paidRow?.amount);
        return {
          month,
          grossPay: round2(paidRow ? grossFromPayment : row?.grossPay || 0),
          professionalTax: round2(paidRow ? paidRow.professionalTax || 0 : row?.professionalTax || 0),
          tdsAmount: round2(paidRow ? paidRow.tdsAmount || 0 : row?.tdsAmount || 0),
          netPay: round2(paidRow ? paidRow.netPay ?? paidRow.amount ?? 0 : row?.netPay || 0),
        };
      });
      const payrollGrossSalary = round2(monthlyBreakup.reduce((sum, row) => sum + row.grossPay, 0));
      const professionalTax = round2(monthlyBreakup.reduce((sum, row) => sum + row.professionalTax, 0));
      const tdsDeducted = round2(monthlyBreakup.reduce((sum, row) => sum + row.tdsAmount, 0));
      if (payrollGrossSalary <= 0 && tdsDeducted <= 0) continue;

      const salary17_1 = req.body?.salary17_1 === undefined || req.body?.salary17_1 === ''
        ? payrollGrossSalary
        : form16Number(req.body, 'salary17_1');
      const perquisites17_2 = form16Number(req.body, 'perquisites17_2');
      const profits17_3 = form16Number(req.body, 'profits17_3');
      const grossSalary = round2(salary17_1 + perquisites17_2 + profits17_3);
      const salaryFromOtherEmployers = form16Number(req.body, 'salaryFromOtherEmployers');
      const travelConcessionExemption = form16Number(req.body, 'travelConcessionExemption');
      const gratuityExemption = form16Number(req.body, 'gratuityExemption');
      const pensionCommutationExemption = form16Number(req.body, 'pensionCommutationExemption');
      const leaveEncashmentExemption = form16Number(req.body, 'leaveEncashmentExemption');
      const hraExemption = form16Number(req.body, 'hraExemption');
      const otherSection10Exemption = form16Number(req.body, 'otherSection10Exemption');
      const totalSection10Exemption = round2(
        travelConcessionExemption
        + gratuityExemption
        + pensionCommutationExemption
        + leaveEncashmentExemption
        + hraExemption
        + otherSection10Exemption
      );
      const salaryFromCurrentEmployer = round2(Math.max(0, grossSalary - totalSection10Exemption));
      const standardDeduction = round2(Math.min(salaryFromCurrentEmployer, form16Number(req.body, 'standardDeduction', 75000)));
      const entertainmentAllowance = form16Number(req.body, 'entertainmentAllowance');
      const totalDeductionsUnder16 = round2(standardDeduction + entertainmentAllowance + professionalTax);
      const incomeChargeableSalaries = round2(Math.max(0, salaryFromCurrentEmployer - totalDeductionsUnder16));
      const housePropertyIncome = form16Number(req.body, 'housePropertyIncome');
      const otherSourcesIncome = form16Number(req.body, 'otherSourcesIncome');
      const totalOtherIncome = round2(housePropertyIncome + otherSourcesIncome);
      const grossTotalIncome = round2(Math.max(0, incomeChargeableSalaries + totalOtherIncome));
      const deduction80C = form16Number(req.body, 'deduction80C');
      const deduction80CCC = form16Number(req.body, 'deduction80CCC');
      const deduction80CCD1 = form16Number(req.body, 'deduction80CCD1');
      const deduction80CCD1B = form16Number(req.body, 'deduction80CCD1B');
      const deduction80CCD2 = form16Number(req.body, 'deduction80CCD2');
      const deduction80D = form16Number(req.body, 'deduction80D');
      const deduction80E = form16Number(req.body, 'deduction80E');
      const deduction80G = form16Number(req.body, 'deduction80G');
      const deduction80TTA = form16Number(req.body, 'deduction80TTA');
      const otherChapterVIADeductions = form16Number(req.body, 'otherChapterVIADeductions');
      const totalChapterVIADeductions = round2(
        deduction80C + deduction80CCC + deduction80CCD1 + deduction80CCD1B + deduction80CCD2
        + deduction80D + deduction80E + deduction80G + deduction80TTA + otherChapterVIADeductions
      );
      const taxableIncome = round2(Math.max(0, grossTotalIncome - totalChapterVIADeductions));
      const taxOnTotalIncome = req.body?.taxOnTotalIncome === undefined || req.body?.taxOnTotalIncome === ''
        ? tdsDeducted
        : form16Number(req.body, 'taxOnTotalIncome');
      const rebate87A = form16Number(req.body, 'rebate87A');
      const surcharge = form16Number(req.body, 'surcharge');
      const healthEducationCess = req.body?.healthEducationCess === undefined || req.body?.healthEducationCess === ''
        ? 0
        : form16Number(req.body, 'healthEducationCess');
      const relief89 = form16Number(req.body, 'relief89');
      const netTaxPayable = round2(Math.max(0, taxOnTotalIncome + surcharge + healthEducationCess - rebate87A - relief89));
      const periodFrom = dateFromInput(req.body?.periodFrom, employee.joinDate && new Date(employee.joinDate) > fiscalPeriod.start ? new Date(employee.joinDate) : fiscalPeriod.start);
      const periodTo = dateFromInput(req.body?.periodTo, fiscalPeriod.end);
      const employerAddress = cleanText(req.body?.employerAddress) || cleanText(company.address) || business.address;
      const employeeAddress = cleanText(req.body?.employeeAddress) || cleanText(employee.address) || cleanText(employee.state);
      const responsiblePersonName = cleanText(req.body?.responsiblePersonName) || cleanText(company.responsiblePersonName) || cleanText(company.legalName) || business.legalName;
      const responsiblePersonDesignation = cleanText(req.body?.responsiblePersonDesignation) || cleanText(company.responsiblePersonDesignation) || 'Authorised Signatory';

      const quarterlyBreakup = ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter) => {
        const quarterRows = monthlyBreakup.filter((row) => quarterForMonth(row.month) === quarter);
        const challanAmount = (tdsChallans as any[])
          .filter((challan) => quarterForMonth(String(challan.periodKey || months[0])) === quarter)
          .reduce((sum, challan) => sum + money(challan.totalAmount), 0);
        const taxDeducted = round2(quarterRows.reduce((sum, row) => sum + row.tdsAmount, 0));
        return {
          quarter,
          receiptNumber: cleanText(req.body?.[`${quarter.toLowerCase()}ReceiptNumber`]) || `24Q-${financialYear}-${quarter}-DRAFT`,
          amountPaidCredited: round2(quarterRows.reduce((sum, row) => sum + row.grossPay, 0)),
          taxDeducted,
          taxDepositedRemitted: challanAmount > 0 ? round2(challanAmount) : taxDeducted,
        };
      });
      const tdsDeposited = round2(quarterlyBreakup.reduce((sum, row) => sum + row.taxDepositedRemitted, 0));
      const challanBreakup = (tdsChallans as any[]).length
        ? (tdsChallans as any[]).map((challan, idx) => ({
          serialNo: idx + 1,
          taxDeposited: money(challan.totalAmount),
          bsrCode: cleanText(challan.bankName),
          depositedDate: challan.paymentDate || challan.generatedDate,
          challanSerialNumber: challan.challanNumber || challan.utrNumber || '-',
          oltasStatus: challan.status === 'paid' ? 'F' : 'P',
        }))
        : [{
          serialNo: 1,
          taxDeposited: tdsDeducted,
          bsrCode: cleanText(req.body?.bsrCode),
          depositedDate: new Date(),
          challanSerialNumber: cleanText(req.body?.challanSerialNumber) || 'DRAFT',
          oltasStatus: 'P',
        }];
      const certificateNumber = `F16-${financialYear}-${employee.employeeCode}-${Date.now().toString().slice(-5)}`.toUpperCase();
      const fileContent = JSON.stringify({
        financialYear,
        assessmentYear,
        employeeCode: employee.employeeCode,
        employeeName: employee.name,
        taxableIncome,
        tdsDeducted,
        generatedFrom: 'payroll_form16_pdf',
      }, null, 2);

      const row = await PayrollForm16.findOneAndUpdate(
        { financialYear, employeeId: employee._id },
        {
          financialYear,
          assessmentYear,
          employeeId: employee._id,
          employeeCode: employee.employeeCode,
          employeeName: employee.name,
          employeeAddress,
          employeeDesignation: employee.designation,
          pan: employee.pan,
          certificateNumber,
          lastUpdatedOn: new Date(),
          employerName: cleanText(company.legalName) || business.legalName || 'SPARK7 Sports Arena',
          employerAddress,
          employerPan: toUpperClean(company.pan || business.pan),
          employerTan: toUpperClean(company.tan),
          employerEmail: cleanText(company.email || business.email),
          employerPhone: cleanText(company.phone || business.phone),
          citTds: cleanText(req.body?.citTds || company.deductorCategory),
          responsiblePersonName,
          responsiblePersonDesignation,
          periodFrom,
          periodTo,
          salary17_1,
          perquisites17_2,
          profits17_3,
          salaryFromOtherEmployers,
          travelConcessionExemption,
          gratuityExemption,
          pensionCommutationExemption,
          leaveEncashmentExemption,
          hraExemption,
          otherSection10Exemption,
          totalSection10Exemption,
          salaryFromCurrentEmployer,
          grossSalary,
          standardDeduction,
          entertainmentAllowance,
          professionalTax,
          totalDeductionsUnder16,
          incomeChargeableSalaries,
          housePropertyIncome,
          otherSourcesIncome,
          totalOtherIncome,
          grossTotalIncome,
          deduction80C,
          deduction80CCC,
          deduction80CCD1,
          deduction80CCD1B,
          deduction80CCD2,
          deduction80D,
          deduction80E,
          deduction80G,
          deduction80TTA,
          otherChapterVIADeductions,
          totalChapterVIADeductions,
          taxableIncome,
          taxOnTotalIncome,
          rebate87A,
          surcharge,
          healthEducationCess,
          relief89,
          netTaxPayable,
          tdsDeducted,
          tdsDeposited,
          quarterlyBreakup,
          challanBreakup,
          monthlyBreakup,
          fileName: `form16-${financialYear}-${employee.employeeCode}.pdf`,
          fileContent,
          status: 'generated',
          generatedAt: new Date(),
          notes: String(req.body?.notes || '').trim(),
          createdBy: req.userId,
        },
        { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      generated.push(row);
    }

    await writeAuditLog({
      module: 'payroll',
      action: 'payroll_form16_generated',
      entityType: 'payroll_form16',
      referenceNo: financialYear,
      userId: req.userId,
      metadata: { generatedCount: generated.length, employeeId: req.body?.employeeId || '' },
    });

    res.status(201).json({ success: true, message: `Generated ${generated.length} Form 16 draft(s)`, data: generated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate Form 16' });
  }
});

router.get('/form16/:id/download', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await PayrollForm16.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Form 16 not found' });
    const pdf = buildForm16Pdf(row);
    const fileName = String(row.fileName || `form16-${row._id}.pdf`).replace(/\.txt$/i, '.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(pdf);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to download Form 16' });
  }
});

router.get('/settlements', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter: any = {};
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    const rows = await PayrollFullFinalSettlement.find(filter).sort({ settlementDate: -1, createdAt: -1 }).limit(200);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch full and final settlements' });
  }
});

router.post('/settlements', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employee: any = await Employee.findById(req.body?.employeeId);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
    const terminationDate = parseDate(req.body?.terminationDate);
    const lastWorkingDate = parseDate(req.body?.lastWorkingDate, terminationDate);
    const settlementDate = parseDate(req.body?.settlementDate, new Date());
    const daysInMonth = monthRange(dateKey(lastWorkingDate).slice(0, 7)).daysInMonth;
    const monthlySalary = round2(toNumber(req.body?.monthlySalary || employee.monthlySalary));
    const dailySalary = monthlySalary / Math.max(1, daysInMonth);
    const noticePayDays = round2(toNumber(req.body?.noticePayDays));
    const noticePay = round2(toNumber(req.body?.noticePay || (dailySalary * noticePayDays)));
    const leaveEncashmentDays = round2(toNumber(req.body?.leaveEncashmentDays));
    const leaveEncashment = round2(toNumber(req.body?.leaveEncashment || (dailySalary * leaveEncashmentDays)));
    const joinDate = employee.joinDate ? new Date(employee.joinDate) : terminationDate;
    const gratuityYears = round2(Math.max(0, (terminationDate.getTime() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
    const basicForGratuity = toNumber(employee.basicSalary || monthlySalary * 0.5);
    const computedGratuity = gratuityYears >= 5 ? round2((basicForGratuity / 26) * 15 * Math.floor(gratuityYears)) : 0;
    const gratuityAmount = round2(req.body?.gratuityAmount === undefined ? computedGratuity : toNumber(req.body.gratuityAmount));
    const otherEarnings = round2(toNumber(req.body?.otherEarnings));
    const recoveries = round2(toNumber(req.body?.recoveries));
    const tdsAmount = round2(toNumber(req.body?.tdsAmount));
    const grossSettlement = round2(noticePay + leaveEncashment + gratuityAmount + otherEarnings);
    const totalDeductions = round2(recoveries + tdsAmount);
    const netSettlement = round2(Math.max(0, grossSettlement - totalDeductions));
    const fileName = `full-final-${employee.employeeCode}-${dateKey(settlementDate)}.txt`;
    const fileContent = [
      `FULL AND FINAL SETTLEMENT | ${employee.employeeCode}`,
      `Employee: ${employee.name}`,
      `Termination Date: ${dateKey(terminationDate)} | Last Working Date: ${dateKey(lastWorkingDate)} | Settlement Date: ${dateKey(settlementDate)}`,
      `Notice Pay: ${noticePay}`,
      `Leave Encashment: ${leaveEncashment}`,
      `Gratuity (${gratuityYears} years): ${gratuityAmount}`,
      `Other Earnings: ${otherEarnings}`,
      `Recoveries: ${recoveries}`,
      `TDS: ${tdsAmount}`,
      `Net Settlement: ${netSettlement}`,
    ].join('\n');

    const row = await PayrollFullFinalSettlement.create({
      employeeId: employee._id,
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      terminationDate,
      lastWorkingDate,
      settlementDate,
      monthlySalary,
      noticePayDays,
      noticePay,
      leaveEncashmentDays,
      leaveEncashment,
      gratuityYears,
      gratuityAmount,
      otherEarnings,
      recoveries,
      tdsAmount,
      grossSettlement,
      totalDeductions,
      netSettlement,
      status: req.body?.status === 'draft' ? 'draft' : 'finalized',
      fileName,
      fileContent,
      notes: String(req.body?.notes || '').trim(),
      createdBy: req.userId,
      finalizedBy: req.body?.status === 'draft' ? undefined : req.userId,
      finalizedAt: req.body?.status === 'draft' ? undefined : new Date(),
    });

    if (req.body?.deactivateEmployee !== false && row.status === 'finalized') {
      employee.active = false;
      await employee.save();
    }

    await writeAuditLog({
      module: 'payroll',
      action: 'payroll_full_final_settlement_created',
      entityType: 'payroll_full_final_settlement',
      entityId: row._id.toString(),
      referenceNo: `${employee.employeeCode}:${dateKey(terminationDate)}`,
      userId: req.userId,
      after: row.toObject(),
    });

    res.status(201).json({ success: true, message: 'Full and final settlement calculated', data: row });
  } catch (error: any) {
    const msg = String(error.message || '');
    const status = msg.includes('date') || msg.includes('Employee not found') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to create settlement' });
  }
});

router.get('/settlements/:id/download', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await PayrollFullFinalSettlement.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Settlement not found' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${row.fileName || `full-final-${row._id}.txt`}`);
    res.send(row.fileContent || '');
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to download settlement' });
  }
});

export default router;
