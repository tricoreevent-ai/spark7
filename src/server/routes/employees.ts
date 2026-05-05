import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Employee } from '../models/Employee.js';
import { Attendance } from '../models/Attendance.js';

const router = Router();

const sampleEmployees = [
  {
    employeeCode: 'DEMO001',
    name: 'Rahul Sharma',
    phone: '9988776655',
    email: 'rahul.sharma@spark.local',
    address: '18 Kanakapura Road, Bengaluru, Karnataka 560062',
    designation: 'Operations Manager',
    pan: 'ABCDE1234F',
    aadhaar: '1234 5678 9012',
    uan: '100200300400',
    esiNumber: 'ESI1002001',
    pfAccountNumber: 'PF/SPK/001',
    state: 'Karnataka',
    employmentType: 'salaried',
    monthlySalary: 52000,
    basicSalary: 26000,
    dearnessAllowance: 4000,
    hra: 13000,
    conveyanceAllowance: 2000,
    specialAllowance: 7000,
    dailyRate: 0,
    overtimeHourlyRate: 250,
    pfEnabled: true,
    esiEnabled: false,
    professionalTaxEnabled: true,
    professionalTax: 200,
    tdsEnabled: true,
    monthlyTdsOverride: 1800,
    paidLeave: true,
    active: true,
  },
  {
    employeeCode: 'DEMO002',
    name: 'Priya Nair',
    phone: '9876543210',
    email: 'priya.nair@spark.local',
    address: '42 JP Nagar 6th Phase, Bengaluru, Karnataka 560078',
    designation: 'Front Desk Executive',
    pan: 'FGHIJ5678K',
    aadhaar: '2345 6789 0123',
    uan: '100200300401',
    esiNumber: 'ESI1002002',
    pfAccountNumber: 'PF/SPK/002',
    state: 'Karnataka',
    employmentType: 'salaried',
    monthlySalary: 32000,
    basicSalary: 16000,
    dearnessAllowance: 2000,
    hra: 8000,
    conveyanceAllowance: 1600,
    specialAllowance: 4400,
    dailyRate: 0,
    overtimeHourlyRate: 180,
    pfEnabled: true,
    esiEnabled: false,
    professionalTaxEnabled: true,
    professionalTax: 200,
    tdsEnabled: false,
    monthlyTdsOverride: 0,
    paidLeave: true,
    active: true,
  },
  {
    employeeCode: 'DEMO003',
    name: 'Karthik Rao',
    phone: '9123456780',
    email: 'karthik.rao@spark.local',
    address: '9 Bannerghatta Main Road, Bengaluru, Karnataka 560076',
    designation: 'Badminton Coach',
    pan: 'KLMNO9012P',
    aadhaar: '3456 7890 1234',
    uan: '100200300402',
    esiNumber: 'ESI1002003',
    pfAccountNumber: 'PF/SPK/003',
    state: 'Karnataka',
    employmentType: 'salaried',
    monthlySalary: 45000,
    basicSalary: 22500,
    dearnessAllowance: 2500,
    hra: 11250,
    conveyanceAllowance: 1800,
    specialAllowance: 6950,
    dailyRate: 0,
    overtimeHourlyRate: 300,
    pfEnabled: true,
    esiEnabled: false,
    professionalTaxEnabled: true,
    professionalTax: 200,
    tdsEnabled: true,
    monthlyTdsOverride: 1200,
    paidLeave: true,
    active: true,
  },
  {
    employeeCode: 'DEMO004',
    name: 'Meera Joseph',
    phone: '9012345678',
    email: 'meera.joseph@spark.local',
    address: '27 HSR Layout Sector 2, Bengaluru, Karnataka 560102',
    designation: 'Swimming Instructor',
    pan: 'PQRST3456U',
    aadhaar: '4567 8901 2345',
    uan: '100200300403',
    esiNumber: 'ESI1002004',
    pfAccountNumber: 'PF/SPK/004',
    state: 'Karnataka',
    employmentType: 'salaried',
    monthlySalary: 38000,
    basicSalary: 19000,
    dearnessAllowance: 2000,
    hra: 9500,
    conveyanceAllowance: 1800,
    specialAllowance: 5700,
    dailyRate: 0,
    overtimeHourlyRate: 240,
    pfEnabled: true,
    esiEnabled: false,
    professionalTaxEnabled: true,
    professionalTax: 200,
    tdsEnabled: false,
    monthlyTdsOverride: 0,
    paidLeave: true,
    active: true,
  },
  {
    employeeCode: 'DEMO005',
    name: 'Naveen Kumar',
    phone: '9000012345',
    email: 'naveen.kumar@spark.local',
    address: '5 Mysore Road, Bengaluru, Karnataka 560026',
    designation: 'Housekeeping Associate',
    pan: 'UVWXY7890Z',
    aadhaar: '5678 9012 3456',
    uan: '100200300404',
    esiNumber: 'ESI1002005',
    pfAccountNumber: 'PF/SPK/005',
    state: 'Karnataka',
    employmentType: 'daily',
    monthlySalary: 0,
    basicSalary: 0,
    dearnessAllowance: 0,
    hra: 0,
    conveyanceAllowance: 0,
    specialAllowance: 0,
    dailyRate: 900,
    overtimeHourlyRate: 120,
    pfEnabled: true,
    esiEnabled: true,
    professionalTaxEnabled: false,
    professionalTax: 0,
    tdsEnabled: false,
    monthlyTdsOverride: 0,
    paidLeave: false,
    active: true,
  },
];

router.get('/', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const employees = await Employee.find().sort({ active: -1, name: 1 });
    res.json({ success: true, data: employees });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch employees' });
  }
});

router.post('/demo-seed', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const saved = [];
    for (const row of sampleEmployees) {
      const employee = await Employee.findOneAndUpdate(
        { employeeCode: row.employeeCode },
        {
          ...row,
          createdBy: req.userId,
        },
        { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved.push(employee);
    }

    res.json({
      success: true,
      data: saved,
      message: `${saved.length} sample employee records are ready for testing`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to seed sample employees' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      employeeCode,
      name,
      phone,
      email,
      address,
      designation,
      pan,
      aadhaar,
      uan,
      esiNumber,
      pfAccountNumber,
      state,
      employmentType,
      monthlySalary,
      basicSalary,
      dearnessAllowance,
      hra,
      conveyanceAllowance,
      specialAllowance,
      dailyRate,
      overtimeHourlyRate,
      pfEnabled,
      esiEnabled,
      professionalTaxEnabled,
      professionalTax,
      tdsEnabled,
      monthlyTdsOverride,
      paidLeave,
      active,
      joinDate,
    } = req.body;

    if (!employeeCode || !name || !employmentType) {
      return res.status(400).json({ success: false, error: 'employeeCode, name and employmentType are required' });
    }

    const existing = await Employee.findOne({ employeeCode: String(employeeCode).toUpperCase() });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Employee code already exists' });
    }

    const employee = await Employee.create({
      employeeCode: String(employeeCode).toUpperCase(),
      name,
      phone,
      email,
      address,
      designation,
      pan: String(pan || '').trim().toUpperCase(),
      aadhaar,
      uan,
      esiNumber,
      pfAccountNumber,
      state,
      employmentType,
      monthlySalary: Number(monthlySalary || 0),
      basicSalary: Number(basicSalary || 0),
      dearnessAllowance: Number(dearnessAllowance || 0),
      hra: Number(hra || 0),
      conveyanceAllowance: Number(conveyanceAllowance || 0),
      specialAllowance: Number(specialAllowance || 0),
      dailyRate: Number(dailyRate || 0),
      overtimeHourlyRate: Number(overtimeHourlyRate || 0),
      pfEnabled: pfEnabled !== undefined ? Boolean(pfEnabled) : true,
      esiEnabled: esiEnabled !== undefined ? Boolean(esiEnabled) : true,
      professionalTaxEnabled: professionalTaxEnabled !== undefined ? Boolean(professionalTaxEnabled) : false,
      professionalTax: Number(professionalTax || 0),
      tdsEnabled: tdsEnabled !== undefined ? Boolean(tdsEnabled) : false,
      monthlyTdsOverride: Number(monthlyTdsOverride || 0),
      paidLeave: paidLeave !== undefined ? Boolean(paidLeave) : true,
      active: active !== undefined ? Boolean(active) : true,
      joinDate: joinDate ? new Date(joinDate) : new Date(),
      createdBy: req.userId,
    });

    res.status(201).json({ success: true, data: employee, message: 'Employee created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create employee' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = { ...req.body };
    if (updates.employeeCode) updates.employeeCode = String(updates.employeeCode).toUpperCase();

    if (updates.employeeCode) {
      const duplicate = await Employee.findOne({
        employeeCode: updates.employeeCode,
        _id: { $ne: req.params.id as any },
      });
      if (duplicate) {
        return res.status(409).json({ success: false, error: 'Employee code already exists' });
      }
    }

    const employee = await Employee.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after', runValidators: true });
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

    res.json({ success: true, data: employee, message: 'Employee updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update employee' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

    res.json({ success: true, message: 'Employee deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete employee' });
  }
});

router.get('/:id/salary-summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ success: false, error: 'month must be YYYY-MM format' });
    }

    const [year, mon] = month.split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0, 23, 59, 59, 999);
    const daysInMonth = new Date(year, mon, 0).getDate();

    const attendance = await Attendance.find({
      employeeId: employee._id,
      date: { $gte: start, $lte: end },
    }).sort({ date: 1 });

    let presentDays = 0;
    let halfDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let payableDays = 0;
    let overtimeHours = 0;

    for (const record of attendance) {
      if (record.status === 'present') {
        presentDays += 1;
        payableDays += 1;
      } else if (record.status === 'half_day') {
        halfDays += 1;
        payableDays += 0.5;
      } else if (record.status === 'leave') {
        leaveDays += 1;
        payableDays += employee.paidLeave ? 1 : 0;
      } else {
        absentDays += 1;
      }

      overtimeHours += Number(record.overtimeHours || 0);
    }

    const monthlySalary = Number(employee.monthlySalary || 0);
    const dailyRate = Number(employee.dailyRate || 0);
    const overtimeRate = Number(employee.overtimeHourlyRate || 0);

    const basePay =
      employee.employmentType === 'salaried'
        ? (monthlySalary / Math.max(daysInMonth, 1)) * payableDays
        : dailyRate * payableDays;

    const overtimePay = overtimeHours * overtimeRate;
    const totalPayable = basePay + overtimePay;

    res.json({
      success: true,
      data: {
        employee,
        month,
        attendance: {
          totalMarkedDays: attendance.length,
          presentDays,
          halfDays,
          leaveDays,
          absentDays,
          payableDays,
          overtimeHours,
        },
        salary: {
          employmentType: employee.employmentType,
          monthlySalary,
          dailyRate,
          overtimeRate,
          basePay,
          overtimePay,
          totalPayable,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to compute salary summary' });
  }
});

export default router;
