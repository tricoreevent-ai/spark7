import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaginationControls } from '../components/PaginationControls';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { apiUrl, fetchApiJson } from '../utils/api';

interface AttendanceProps {
  currentUserRole?: string;
}

interface Employee {
  _id: string;
  employeeCode: string;
  name: string;
  designation?: string;
}

interface AttendanceRecord {
  _id: string;
  status: 'present' | 'half_day' | 'absent' | 'leave';
  checkIn?: string;
  checkOut?: string;
  overtimeHours?: number;
  notes?: string;
  isLocked?: boolean;
  lockedAt?: string;
  unlockedAt?: string;
  updatedAt?: string;
}

interface RegisterRow {
  employee: Employee;
  attendance: AttendanceRecord | null;
  canUnlock?: boolean;
}

const getTodayLocalDate = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const isAdminRole = (role?: string): boolean => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'super_admin';
};

export const Attendance: React.FC<AttendanceProps> = ({ currentUserRole }) => {
  const [date, setDate] = useState(getTodayLocalDate());
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingRegister, setLoadingRegister] = useState(false);
  const loadRequestIdRef = useRef(0);
  const isAdmin = useMemo(() => isAdminRole(currentUserRole), [currentUserRole]);
  const rowsPagination = usePaginatedRows(rows, { initialPageSize: 10, resetDeps: [date] });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const loadRegister = useCallback(
    async (targetDate: string = date) => {
      const requestId = ++loadRequestIdRef.current;
      setLoadingRegister(true);
      setError('');
      try {
        const data = await fetchApiJson(apiUrl(`/api/attendance/register?date=${targetDate}`), { headers });
        if (requestId !== loadRequestIdRef.current) return;
        setRows(data.data.register || []);
      } catch (e: any) {
        if (requestId !== loadRequestIdRef.current) return;
        setError(e.message || 'Failed to load attendance register');
        setRows([]);
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setLoadingRegister(false);
        }
      }
    },
    [date, headers]
  );

  useEffect(() => {
    void loadRegister(date);
  }, [date, loadRegister]);

  const saveAttendance = async (employeeId: string, payload: any) => {
    setError('');
    setMessage('');
    try {
      await fetchApiJson(apiUrl('/api/attendance/mark'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ employeeId, date, ...payload }),
      });
      setMessage('Attendance saved and locked. Admin approval is required for further edits.');
      await loadRegister(date);
    } catch (e: any) {
      setError(e.message || 'Failed to save attendance');
    }
  };

  const unlockAttendance = async (employeeId: string) => {
    setError('');
    setMessage('');
    try {
      await fetchApiJson(apiUrl('/api/attendance/unlock'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ employeeId, date }),
      });
      setMessage('Attendance unlocked for editing. Save again to relock the entry.');
      await loadRegister(date);
    } catch (e: any) {
      setError(e.message || 'Failed to unlock attendance');
    }
  };

  const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white';

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Attendance Register</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-300">Date</label>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => {
              setMessage('');
              setDate(e.target.value);
            }}
          />
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      {loadingRegister && <div className="text-sm text-indigo-200">Loading attendance register...</div>}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10">
          <thead>
            <tr>
              {['Code', 'Employee', 'Status', 'Check In', 'Check Out', 'OT Hours', 'Notes', 'Entry', 'Action'].map((h) => (
                <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-300">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rowsPagination.paginatedRows.map((row) => {
              const state = {
                status: row.attendance?.status || 'present',
                checkIn: row.attendance?.checkIn || '',
                checkOut: row.attendance?.checkOut || '',
                overtimeHours: String(row.attendance?.overtimeHours || 0),
                notes: row.attendance?.notes || '',
              };

              return (
                <AttendanceRow
                  key={`${date}-${row.employee._id}`}
                  row={row}
                  attendanceDate={date}
                  initialState={state}
                  isLocked={Boolean(row.attendance && row.attendance.isLocked !== false)}
                  canUnlock={Boolean(row.canUnlock || (isAdmin && row.attendance && row.attendance.isLocked !== false))}
                  onSave={(payload) => saveAttendance(row.employee._id, payload)}
                  onUnlock={() => unlockAttendance(row.employee._id)}
                  inputClass={inputClass}
                />
              );
            })}
            {rowsPagination.paginatedRows.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-3 text-sm text-center text-gray-400">No active employees found.</td></tr>
            )}
          </tbody>
        </table>
        <PaginationControls
          currentPage={rowsPagination.currentPage}
          totalPages={rowsPagination.totalPages}
          totalRows={rowsPagination.totalRows}
          pageSize={rowsPagination.pageSize}
          startIndex={rowsPagination.startIndex}
          endIndex={rowsPagination.endIndex}
          itemLabel="attendance rows"
          onPageChange={rowsPagination.setCurrentPage}
          onPageSizeChange={rowsPagination.setPageSize}
        />
      </div>
    </div>
  );
};

const AttendanceRow: React.FC<{
  row: RegisterRow;
  attendanceDate: string;
  initialState: { status: string; checkIn: string; checkOut: string; overtimeHours: string; notes: string };
  isLocked: boolean;
  canUnlock: boolean;
  onSave: (payload: any) => Promise<void>;
  onUnlock: () => Promise<void>;
  inputClass: string;
}> = ({ row, attendanceDate, initialState, isLocked, canUnlock, onSave, onUnlock, inputClass }) => {
  const [local, setLocal] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    setLocal(initialState);
  }, [attendanceDate, initialState.status, initialState.checkIn, initialState.checkOut, initialState.overtimeHours, initialState.notes]);

  const hasEntry = Boolean(row.attendance);
  const canEdit = !isLocked;
  const hasUnsavedChanges =
    local.status !== initialState.status ||
    local.checkIn !== initialState.checkIn ||
    local.checkOut !== initialState.checkOut ||
    local.overtimeHours !== initialState.overtimeHours ||
    local.notes !== initialState.notes;

  const entryLabel = !hasEntry ? 'Not Entered' : isLocked ? 'Saved - Locked' : 'Unlocked for Edit';
  const entryClass = !hasEntry
    ? 'border-gray-500/40 bg-gray-500/20 text-gray-200'
    : isLocked
      ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200'
      : 'border-amber-500/30 bg-amber-500/20 text-amber-200';

  const saveDisabled = !canEdit || saving;

  const handleSave = async () => {
    if (saveDisabled) return;
    setSaving(true);
    try {
      await onSave({ ...local, overtimeHours: Number(local.overtimeHours || 0) });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!canUnlock || unlocking) return;
    setUnlocking(true);
    try {
      await onUnlock();
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <tr className={hasEntry ? 'bg-white/[0.02]' : ''}>
      <td className="px-2 py-2 text-sm text-gray-300">{row.employee.employeeCode}</td>
      <td className="px-2 py-2 text-sm text-white">{row.employee.name}</td>
      <td className="px-2 py-2">
        <select
          className={inputClass}
          value={local.status}
          disabled={!canEdit}
          onChange={(e) => setLocal({ ...local, status: e.target.value })}
        >
          <option value="present">Present</option>
          <option value="half_day">Half Day</option>
          <option value="absent">Absent</option>
          <option value="leave">Leave</option>
        </select>
      </td>
      <td className="px-2 py-2"><input className={inputClass} disabled={!canEdit} value={local.checkIn} onChange={(e) => setLocal({ ...local, checkIn: e.target.value })} placeholder="09:00" /></td>
      <td className="px-2 py-2"><input className={inputClass} disabled={!canEdit} value={local.checkOut} onChange={(e) => setLocal({ ...local, checkOut: e.target.value })} placeholder="18:00" /></td>
      <td className="px-2 py-2"><input className={inputClass} disabled={!canEdit} type="number" min="0" step="0.5" value={local.overtimeHours} onChange={(e) => setLocal({ ...local, overtimeHours: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputClass} disabled={!canEdit} value={local.notes} onChange={(e) => setLocal({ ...local, notes: e.target.value })} placeholder="Optional" /></td>
      <td className="px-2 py-2">
        <div className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${entryClass}`}>{entryLabel}</div>
        {hasUnsavedChanges && canEdit && <div className="mt-1 text-xs text-amber-200">Unsaved changes</div>}
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <button
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-70"
            disabled={saveDisabled}
            onClick={handleSave}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        ) : canUnlock ? (
          <button
            className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-70"
            disabled={unlocking}
            onClick={handleUnlock}
          >
            {unlocking ? 'Unlocking...' : 'Admin Unlock'}
          </button>
        ) : (
          <span className="inline-flex rounded-md border border-white/20 px-2 py-1 text-xs text-gray-300">Locked</span>
        )}
      </td>
    </tr>
  );
};
