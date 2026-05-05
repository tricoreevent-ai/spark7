import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ShiftSchedule } from '../models/ShiftSchedule.js';
import { Employee } from '../models/Employee.js';

const router = Router();

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

router.get('/register', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const dateKey = toDateKey(date);

    const [employees, shifts] = await Promise.all([
      Employee.find({ active: true }).sort({ name: 1 }),
      ShiftSchedule.find({ dateKey }).populate('employeeId', 'employeeCode name designation employmentType').sort({ createdAt: 1 }),
    ]);

    const shiftMap = new Map(shifts.map((s) => [String(s.employeeId), s]));

    const register = employees.map((employee) => ({
      employee,
      shift: shiftMap.get(String(employee._id)) || null,
    }));

    res.json({ success: true, data: { date: dateKey, register } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load shift register' });
  }
});

router.post('/assign', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId, date, shiftName, startTime, endTime, isWeeklyOff, notes } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'employeeId is required' });
    }

    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });

    const shiftDate = date ? new Date(date) : new Date();
    shiftDate.setHours(0, 0, 0, 0);
    const dateKey = toDateKey(shiftDate);

    const shift = await ShiftSchedule.findOneAndUpdate(
      { employeeId, dateKey },
      {
        employeeId,
        date: shiftDate,
        dateKey,
        shiftName: shiftName || 'General',
        startTime,
        endTime,
        isWeeklyOff: Boolean(isWeeklyOff),
        notes,
        createdBy: req.userId,
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    res.json({ success: true, data: shift, message: 'Shift assigned' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to assign shift' });
  }
});

router.get('/employee/:employeeId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { month } = req.query;
    const filter: any = { employeeId: req.params.employeeId };

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month as string)) {
      const [y, m] = (month as string).split('-').map(Number);
      filter.date = { $gte: new Date(y, m - 1, 1), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
    }

    const shifts = await ShiftSchedule.find(filter).sort({ date: 1 });
    res.json({ success: true, data: shifts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load employee shifts' });
  }
});

export default router;
