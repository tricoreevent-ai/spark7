import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Attendance } from '../models/Attendance.js';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { loadTenantGeneralSettings } from '../services/generalSettings.js';
import { canAccessPage } from '../services/rbac.js';

const router = Router();
const INDIA_TIME_ZONE = 'Asia/Kolkata';

const toDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const parseDateInput = (value?: string): Date => {
  const source = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    const [year, month, day] = source.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = source ? new Date(source) : new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const parseDateRangeValue = (value: string | undefined, fallback: Date, endOfDay = false): Date => {
  const source = String(value || '').trim();
  const date = source ? parseDateInput(source) : new Date(fallback);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

const parseDateRange = (startDate?: string, endDate?: string) => {
  const today = getTodayInIndia();
  const start = parseDateRangeValue(startDate, today, false);
  const end = parseDateRangeValue(endDate, today, true);

  if (start <= end) {
    return { start, end };
  }

  return {
    start: new Date(new Date(end).setHours(0, 0, 0, 0)),
    end: new Date(new Date(start).setHours(23, 59, 59, 999)),
  };
};

const parseMonthValue = (value?: string) => {
  const source = String(value || '').trim() || toDateKey(getTodayInIndia()).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(source)) {
    throw new Error('Month must be in YYYY-MM format.');
  }

  const [year, month] = source.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return {
    month: source,
    year,
    monthNumber: month,
    start,
    end,
    daysInMonth: new Date(year, month, 0).getDate(),
  };
};

const getTodayInIndia = (): Date => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value || '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value || '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value || '0');
  return new Date(year, Math.max(0, month - 1), day || 1);
};

const formatTimeLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: INDIA_TIME_ZONE,
  }).format(date);

const formatMonthLabel = (year: number, month: number): string =>
  new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: INDIA_TIME_ZONE,
  }).format(new Date(year, month - 1, 1));

const formatDateLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: INDIA_TIME_ZONE,
  }).format(date);

const parseClockMinutes = (value?: string): number | null => {
  const source = String(value || '').trim();
  const match = source.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
};

const computeWorkedMinutes = (entry: any): number | null => {
  if (entry?.checkInAt && entry?.checkOutAt) {
    const start = new Date(entry.checkInAt).getTime();
    const end = new Date(entry.checkOutAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return Math.round((end - start) / 60_000);
    }
  }

  const checkInMinutes = parseClockMinutes(entry?.checkIn);
  const checkOutMinutes = parseClockMinutes(entry?.checkOut);
  if (checkInMinutes === null || checkOutMinutes === null || checkOutMinutes < checkInMinutes) {
    return null;
  }

  return checkOutMinutes - checkInMinutes;
};

const formatWorkedTime = (minutes: number | null): string => {
  if (!Number.isFinite(Number(minutes)) || minutes === null) return '-';
  const safeMinutes = Math.max(0, Number(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}h ${String(remainder).padStart(2, '0')}m`;
};

const buildLocationLink = (location?: {
  latitude?: number;
  longitude?: number;
}) => {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
};

const isAdminRole = (role?: string): boolean => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'super_admin';
};

const loadRequestUser = async (req: AuthenticatedRequest) => {
  if (req.user) return req.user;
  if (!req.userId) return null;

  const user = await User.findById(req.userId);
  req.user = user;
  req.userRole = user?.role;
  return user;
};

const ensureManualAttendanceAccess = async (req: AuthenticatedRequest, res: Response) => {
  const user = await loadRequestUser(req);
  if (!user || !user.isActive || user.isDeleted) {
    res.status(403).json({ success: false, error: 'User is inactive or not found' });
    return null;
  }

  const allowed = await canAccessPage(String(user.role || ''), 'attendance');
  if (!allowed) {
    res.status(403).json({ success: false, error: 'You do not have permission to access the manual attendance register' });
    return null;
  }

  return user;
};

const ensureEmployeeAttendanceAccess = async (req: AuthenticatedRequest, res: Response) => {
  const user = await loadRequestUser(req);
  if (!user || !user.isActive || user.isDeleted) {
    res.status(403).json({ success: false, error: 'User is inactive or not found' });
    return null;
  }

  const [employeeAttendanceAllowed, manualAttendanceAllowed] = await Promise.all([
    canAccessPage(String(user.role || ''), 'employee-attendance'),
    canAccessPage(String(user.role || ''), 'attendance'),
  ]);
  if (!employeeAttendanceAllowed && !manualAttendanceAllowed) {
    res.status(403).json({ success: false, error: 'You do not have permission to use employee attendance' });
    return null;
  }

  return user;
};

const findEmployeeForUser = async (user: any) => {
  const explicitEmployeeId = String(user?.employeeId || '').trim();
  if (explicitEmployeeId && mongoose.isValidObjectId(explicitEmployeeId)) {
    const explicitEmployee = await Employee.findOne({ _id: explicitEmployeeId, active: true });
    if (explicitEmployee) return explicitEmployee;
  }

  const orFilters: Array<Record<string, any>> = [];
  const email = String(user?.email || '').trim().toLowerCase();
  const phone = String(user?.phoneNumber || '').trim();
  if (email) orFilters.push({ email });
  if (phone) orFilters.push({ phone });

  if (!orFilters.length) return null;
  return Employee.findOne({ active: true, $or: orFilters }).sort({ updatedAt: -1 });
};

const haversineDistanceMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
};

const normalizeLocationPayload = (body: any) => {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const accuracyMeters = Number(body?.accuracyMeters ?? body?.accuracy);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Turn on mobile GPS and allow location access before marking attendance.');
  }

  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracyMeters) && accuracyMeters >= 0 ? accuracyMeters : undefined,
    capturedAt: new Date(),
  };
};

const ensureEmployeeGeofence = async (req: AuthenticatedRequest, location: { latitude: number; longitude: number; accuracyMeters?: number }) => {
  const settings = await loadTenantGeneralSettings(req.tenantId);
  const geofenceEnabled = Boolean(settings?.security?.employeeAttendanceGeofenceEnabled);
  const locationName = String(settings?.security?.attendanceLocationName || 'Sports Complex').trim() || 'Sports Complex';
  const radiusMeters = Number(settings?.security?.attendanceRadiusMeters || 150);
  const targetLatitude = Number(settings?.security?.attendanceLatitude || 0);
  const targetLongitude = Number(settings?.security?.attendanceLongitude || 0);

  if (!geofenceEnabled) {
    return {
      geofenceEnabled,
      locationName,
      radiusMeters,
      distanceMeters: 0,
    };
  }

  if (!Number.isFinite(targetLatitude) || !Number.isFinite(targetLongitude) || (targetLatitude === 0 && targetLongitude === 0)) {
    throw new Error('Employee attendance location is not configured. Please contact your administrator.');
  }

  const distanceMeters = haversineDistanceMeters(
    { latitude: targetLatitude, longitude: targetLongitude },
    location
  );
  const accuracyBuffer = Math.min(75, Math.max(0, Number(location.accuracyMeters || 0)));
  const allowedDistance = radiusMeters + accuracyBuffer;

  if (distanceMeters > allowedDistance) {
    throw new Error(`You are outside the allowed attendance area for ${locationName}. Move closer to the sports complex and try again.`);
  }

  return {
    geofenceEnabled,
    locationName,
    radiusMeters,
    distanceMeters,
  };
};

const buildSelfAttendancePayload = async (req: AuthenticatedRequest, user: any) => {
  const employee = await findEmployeeForUser(user);
  if (!employee) {
    throw new Error('No active employee record is linked to this login. Please ask the administrator to link your user to an employee profile.');
  }

  const now = new Date();
  const today = getTodayInIndia();
  const todayKey = toDateKey(today);
  const entry = await Attendance.findOne({ employeeId: employee._id, dateKey: todayKey });
  const settings = await loadTenantGeneralSettings(req.tenantId);

  return {
    employee: {
      _id: employee._id.toString(),
      employeeCode: employee.employeeCode,
      name: employee.name,
      designation: employee.designation || '',
      email: employee.email || '',
      phone: employee.phone || '',
    },
    today: todayKey,
    nowTime: formatTimeLabel(now),
    geofence: {
      enabled: Boolean(settings?.security?.employeeAttendanceGeofenceEnabled),
      locationName: String(settings?.security?.attendanceLocationName || 'Sports Complex').trim() || 'Sports Complex',
      radiusMeters: Number(settings?.security?.attendanceRadiusMeters || 150),
      isConfigured:
        Number(settings?.security?.attendanceLatitude || 0) !== 0
        || Number(settings?.security?.attendanceLongitude || 0) !== 0,
    },
    entry,
    canCheckIn: !entry?.checkIn,
    canCheckOut: Boolean(entry?.checkIn) && !entry?.checkOut,
  };
};

router.post('/mark', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestUser = await ensureManualAttendanceAccess(req, res);
    if (!requestUser) return;

    const { employeeId, date, status, checkIn, checkOut, overtimeHours, notes } = req.body;

    if (!employeeId || !status) {
      return res.status(400).json({ success: false, error: 'employeeId and status are required' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

    const userIsAdmin = isAdminRole(requestUser?.role);
    const attendanceDate = parseDateInput(date);
    const dateKey = toDateKey(attendanceDate);
    const existingEntry = await Attendance.findOne({ employeeId, dateKey });

    const isLocked = Boolean(existingEntry && existingEntry.isLocked !== false);
    if (isLocked && !userIsAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Attendance for this employee and date is locked. Admin approval is required to edit.',
      });
    }

    const updateOps: Record<string, any> = {
      $set: {
        employeeId,
        date: attendanceDate,
        dateKey,
        status,
        checkIn,
        checkOut,
        ...(checkIn ? { checkInSource: 'manual' } : {}),
        ...(checkOut ? { checkOutSource: 'manual' } : {}),
        overtimeHours: Number(overtimeHours || 0),
        notes,
        lastUpdatedBy: req.userId,
        isLocked: true,
        lockedAt: new Date(),
      },
      $unset: {
        unlockedAt: 1,
        unlockedBy: 1,
        unlockReason: 1,
      },
    };

    if (!existingEntry) {
      updateOps.$setOnInsert = {
        createdBy: req.userId,
      };
    }

    const entry = await Attendance.findOneAndUpdate(
      { employeeId, dateKey },
      updateOps,
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: entry,
      message: 'Attendance saved and locked. Admin approval is required for further edits.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to save attendance' });
  }
});

router.get('/register', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureManualAttendanceAccess(req, res);
    if (!user) return;

    const date = parseDateInput(req.query.date as string);
    const dateKey = toDateKey(date);
    const userIsAdmin = isAdminRole(user?.role);

    const [employees, entries] = await Promise.all([
      Employee.find({ active: true }).sort({ name: 1 }),
      Attendance.find({ dateKey }).sort({ createdAt: 1 }),
    ]);

    const map = new Map(entries.map((entry) => [String(entry.employeeId), entry]));

    const register = employees.map((employee) => ({
      employee,
      attendance: map.get(String(employee._id)) || null,
      canUnlock: Boolean(map.get(String(employee._id)) && map.get(String(employee._id))?.isLocked !== false && userIsAdmin),
    }));

    res.json({ success: true, data: { date: dateKey, register } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load attendance register' });
  }
});

router.post('/unlock', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestUser = await ensureManualAttendanceAccess(req, res);
    if (!requestUser) return;

    const { employeeId, date, reason } = req.body;
    if (!employeeId || !date) {
      return res.status(400).json({ success: false, error: 'employeeId and date are required' });
    }

    if (!isAdminRole(requestUser?.role)) {
      return res.status(403).json({ success: false, error: 'Only admin users can unlock attendance entries' });
    }

    const unlockDate = parseDateInput(date);
    const unlockDateKey = toDateKey(unlockDate);
    const entry = await Attendance.findOne({ employeeId, dateKey: unlockDateKey });

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Attendance entry not found' });
    }

    entry.isLocked = false;
    entry.unlockedAt = new Date();
    entry.unlockedBy = req.userId;
    entry.unlockReason = reason ? String(reason).trim() : 'Approved for correction';
    entry.lastUpdatedBy = req.userId;
    await entry.save();

    res.json({ success: true, data: entry, message: 'Attendance unlocked for editing' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to unlock attendance' });
  }
});

router.get('/entries', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureManualAttendanceAccess(req, res);
    if (!user) return;

    const { employeeId, month } = req.query;
    const filter: any = {};
    if (employeeId) filter.employeeId = employeeId;

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month as string)) {
      const [year, mon] = (month as string).split('-').map(Number);
      filter.date = { $gte: new Date(year, mon - 1, 1), $lte: new Date(year, mon, 0, 23, 59, 59, 999) };
    }

    const entries = await Attendance.find(filter).populate('employeeId', 'employeeCode name designation employmentType').sort({ date: -1 });
    res.json({ success: true, data: entries });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load attendance entries' });
  }
});

router.get('/reports/detailed', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureManualAttendanceAccess(req, res);
    if (!user) return;

    const { start, end } = parseDateRange(req.query.startDate as string | undefined, req.query.endDate as string | undefined);
    const employeeId = String(req.query.employeeId || '').trim();
    const status = String(req.query.status || '').trim().toLowerCase();
    const filter: Record<string, any> = {
      date: { $gte: start, $lte: end },
    };

    if (employeeId) {
      if (!mongoose.isValidObjectId(employeeId)) {
        return res.status(400).json({ success: false, error: 'Select a valid employee.' });
      }
      filter.employeeId = employeeId;
    }

    if (status) {
      if (!['present', 'half_day', 'absent', 'leave'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Select a valid attendance status.' });
      }
      filter.status = status;
    }

    const entries = await Attendance.find(filter)
      .populate('employeeId', 'employeeCode name designation active')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const rows = entries
      .map((entry: any) => {
        const employee = entry?.employeeId;
        if (!employee?._id) return null;

        const workedMinutes = computeWorkedMinutes(entry);
        return {
          _id: String(entry._id),
          employeeId: String(employee._id),
          employeeCode: String(employee.employeeCode || ''),
          employeeName: String(employee.name || 'Unknown'),
          designation: String(employee.designation || ''),
          date: formatDateLabel(new Date(entry.date)),
          dateKey: String(entry.dateKey || ''),
          status: String(entry.status || 'present'),
          checkIn: String(entry.checkIn || ''),
          checkOut: String(entry.checkOut || ''),
          totalWorkedMinutes: workedMinutes ?? 0,
          totalWorkedHours: Number((((workedMinutes ?? 0) / 60) || 0).toFixed(2)),
          totalWorkedLabel: formatWorkedTime(workedMinutes),
          overtimeHours: Number(Number(entry.overtimeHours || 0).toFixed(2)),
          checkInLocationLink: buildLocationLink(entry.checkInLocation),
          checkOutLocationLink: buildLocationLink(entry.checkOutLocation),
          checkInSource: String(entry.checkInSource || ''),
          checkOutSource: String(entry.checkOutSource || ''),
          notes: String(entry.notes || ''),
          isLocked: Boolean(entry.isLocked !== false),
        };
      })
      .filter(Boolean);

    const summary = rows.reduce(
      (acc: any, row: any) => {
        acc.totalEntries += 1;
        acc.employeeIds.add(row.employeeId);
        acc.totalWorkedMinutes += Number(row.totalWorkedMinutes || 0);
        acc.totalOvertimeHours += Number(row.overtimeHours || 0);

        if (row.status === 'present') acc.presentCount += 1;
        else if (row.status === 'half_day') acc.halfDayCount += 1;
        else if (row.status === 'leave') acc.leaveCount += 1;
        else if (row.status === 'absent') acc.absentCount += 1;

        return acc;
      },
      {
        totalEntries: 0,
        employeeIds: new Set<string>(),
        presentCount: 0,
        halfDayCount: 0,
        leaveCount: 0,
        absentCount: 0,
        totalWorkedMinutes: 0,
        totalOvertimeHours: 0,
      }
    );

    res.json({
      success: true,
      data: {
        startDate: formatDateLabel(start),
        endDate: formatDateLabel(end),
        rows,
        summary: {
          totalEntries: summary.totalEntries,
          employeeCount: summary.employeeIds.size,
          presentCount: summary.presentCount,
          halfDayCount: summary.halfDayCount,
          leaveCount: summary.leaveCount,
          absentCount: summary.absentCount,
          totalWorkedMinutes: summary.totalWorkedMinutes,
          totalWorkedHours: Number((summary.totalWorkedMinutes / 60).toFixed(2)),
          totalWorkedLabel: formatWorkedTime(summary.totalWorkedMinutes),
          totalOvertimeHours: Number(summary.totalOvertimeHours.toFixed(2)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load attendance detail report' });
  }
});

router.get('/reports/monthly', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureManualAttendanceAccess(req, res);
    if (!user) return;

    const employeeId = String(req.query.employeeId || '').trim();
    if (employeeId && !mongoose.isValidObjectId(employeeId)) {
      return res.status(400).json({ success: false, error: 'Select a valid employee.' });
    }

    const { month, year, monthNumber, start, end, daysInMonth } = parseMonthValue(req.query.month as string | undefined);
    const attendanceFilter: Record<string, any> = { date: { $gte: start, $lte: end } };
    if (employeeId) attendanceFilter.employeeId = employeeId;

    const entries = await Attendance.find(attendanceFilter)
      .populate('employeeId', 'employeeCode name designation active')
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const employeeIdsFromEntries = Array.from(
      new Set(
        entries
          .map((entry: any) => {
            const employee = entry?.employeeId;
            return String(employee?._id || employee || '').trim();
          })
          .filter(Boolean)
      )
    );

    const employeeFilter = employeeId
      ? { _id: employeeId }
      : employeeIdsFromEntries.length > 0
        ? { $or: [{ active: true }, { _id: { $in: employeeIdsFromEntries } }] }
        : { active: true };

    const employees = await Employee.find(employeeFilter).sort({ name: 1 }).lean();

    const entryMap = new Map<string, any>();
    for (const entry of entries) {
      const employee = entry?.employeeId;
      const currentEmployeeId = String(employee?._id || employee || '').trim();
      if (!currentEmployeeId) continue;
      entryMap.set(`${currentEmployeeId}_${entry.dateKey}`, entry);
    }

    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const dayNumber = index + 1;
      const currentDate = new Date(year, monthNumber - 1, dayNumber);
      const weekdayShort = new Intl.DateTimeFormat('en-IN', {
        weekday: 'short',
        timeZone: INDIA_TIME_ZONE,
      }).format(currentDate);
      return {
        day: dayNumber,
        dateKey: toDateKey(currentDate),
        weekdayShort,
      };
    });

    const rows = employees.map((employee: any) => {
      let presentEquivalentDays = 0;
      let markedDays = 0;

      const dayMarks = days.map((day) => {
        const entry = entryMap.get(`${String(employee._id)}_${day.dateKey}`);
        const status = String(entry?.status || '');
        const mark = status === 'present' || status === 'half_day' ? '✓' : '';
        if (entry) markedDays += 1;
        if (status === 'present') presentEquivalentDays += 1;
        else if (status === 'half_day') presentEquivalentDays += 0.5;

        return {
          day: day.day,
          dateKey: day.dateKey,
          weekdayShort: day.weekdayShort,
          mark,
          status,
        };
      });

      return {
        employeeId: String(employee._id),
        employeeCode: String(employee.employeeCode || ''),
        employeeName: String(employee.name || 'Unknown'),
        designation: String(employee.designation || ''),
        presentEquivalentDays: Number(presentEquivalentDays.toFixed(1)),
        attendancePercent: Number(((presentEquivalentDays / Math.max(daysInMonth, 1)) * 100).toFixed(2)),
        markedDays,
        dayMarks,
      };
    });

    const totalPresentEquivalentDays = rows.reduce(
      (sum, row) => sum + Number(row.presentEquivalentDays || 0),
      0
    );

    res.json({
      success: true,
      data: {
        month,
        monthLabel: formatMonthLabel(year, monthNumber),
        startDate: formatDateLabel(start),
        endDate: formatDateLabel(end),
        daysInMonth,
        days,
        rows,
        totalEmployees: rows.length,
        totalPresentEquivalentDays: Number(totalPresentEquivalentDays.toFixed(1)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load monthly attendance sheet' });
  }
});

router.get('/self', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureEmployeeAttendanceAccess(req, res);
    if (!user) return;

    const payload = await buildSelfAttendancePayload(req, user);
    res.json({ success: true, data: payload });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to load employee attendance status' });
  }
});

router.post('/self/check-in', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureEmployeeAttendanceAccess(req, res);
    if (!user) return;

    const employee = await findEmployeeForUser(user);
    if (!employee) {
      return res.status(400).json({ success: false, error: 'No active employee record is linked to this login.' });
    }

    const location = normalizeLocationPayload(req.body);
    const geofence = await ensureEmployeeGeofence(req, location);
    const now = new Date();
    const today = getTodayInIndia();
    const dateKey = toDateKey(today);
    const currentEntry = await Attendance.findOne({ employeeId: employee._id, dateKey });

    if (currentEntry?.checkIn) {
      return res.status(400).json({ success: false, error: 'Check-in is already recorded for today.' });
    }

    const entry = await Attendance.findOneAndUpdate(
      { employeeId: employee._id, dateKey },
      {
        $set: {
          employeeId: employee._id,
          date: today,
          dateKey,
          status: 'present',
          checkIn: formatTimeLabel(now),
          checkInAt: now,
          checkInSource: 'self_service',
          checkInLocation: location,
          lastUpdatedBy: req.userId,
          isLocked: false,
          unlockedAt: now,
          unlockedBy: req.userId,
          unlockReason: 'Employee self check-in pending check-out',
        },
        $setOnInsert: {
          createdBy: req.userId,
          overtimeHours: 0,
          notes: '',
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: geofence.geofenceEnabled
        ? `Check-in recorded from inside ${geofence.locationName}.`
        : 'Check-in recorded successfully.',
      data: {
        entry,
        distanceMeters: geofence.distanceMeters,
        locationName: geofence.locationName,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to record check-in' });
  }
});

router.post('/self/check-out', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureEmployeeAttendanceAccess(req, res);
    if (!user) return;

    const employee = await findEmployeeForUser(user);
    if (!employee) {
      return res.status(400).json({ success: false, error: 'No active employee record is linked to this login.' });
    }

    const location = normalizeLocationPayload(req.body);
    const geofence = await ensureEmployeeGeofence(req, location);
    const now = new Date();
    const today = getTodayInIndia();
    const dateKey = toDateKey(today);
    const currentEntry = await Attendance.findOne({ employeeId: employee._id, dateKey });

    if (!currentEntry?.checkIn) {
      return res.status(400).json({ success: false, error: 'Check-in is not recorded yet for today.' });
    }

    if (currentEntry.checkOut) {
      return res.status(400).json({ success: false, error: 'Check-out is already recorded for today.' });
    }

    currentEntry.checkOut = formatTimeLabel(now);
    currentEntry.checkOutAt = now;
    currentEntry.checkOutSource = 'self_service';
    currentEntry.checkOutLocation = location;
    currentEntry.lastUpdatedBy = req.userId;
    currentEntry.isLocked = true;
    currentEntry.lockedAt = now;
    currentEntry.unlockedAt = undefined;
    currentEntry.unlockedBy = undefined;
    currentEntry.unlockReason = undefined;
    await currentEntry.save();

    res.json({
      success: true,
      message: geofence.geofenceEnabled
        ? `Check-out recorded from inside ${geofence.locationName}.`
        : 'Check-out recorded successfully.',
      data: {
        entry: currentEntry,
        distanceMeters: geofence.distanceMeters,
        locationName: geofence.locationName,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to record check-out' });
  }
});

export default router;
