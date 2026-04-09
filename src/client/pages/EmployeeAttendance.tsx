import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { apiUrl, fetchApiJson } from '../utils/api';

interface EmployeeAttendanceSummary {
  employee: {
    _id: string;
    employeeCode: string;
    name: string;
    designation?: string;
    email?: string;
    phone?: string;
  };
  today: string;
  nowTime: string;
  geofence: {
    enabled: boolean;
    locationName: string;
    radiusMeters: number;
    isConfigured: boolean;
  };
  entry?: {
    _id: string;
    status: 'present' | 'half_day' | 'absent' | 'leave';
    checkIn?: string;
    checkOut?: string;
    checkInAt?: string;
    checkOutAt?: string;
    isLocked?: boolean;
  } | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
}

const getCurrentLocation = (): Promise<{ latitude: number; longitude: number; accuracyMeters?: number }> =>
  new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This device does not support GPS location. Use a mobile device with location access enabled.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
        });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Turn on mobile GPS and allow location access to mark attendance.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Current location is not available. Move to an open area and try again.'
              : error.code === error.TIMEOUT
                ? 'Location lookup took too long. Please try again with GPS enabled.'
                : 'Could not read your current location. Please try again.';
        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      }
    );
  });

export const EmployeeAttendance: React.FC = () => {
  const [summary, setSummary] = useState<EmployeeAttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'check-in' | 'check-out' | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetchApiJson(apiUrl('/api/attendance/self'), { headers });
      setSummary((response?.data as EmployeeAttendanceSummary) || null);
    } catch (loadError: any) {
      setSummary(null);
      setError(loadError?.message || 'Failed to load employee attendance');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const runAttendanceAction = async (mode: 'check-in' | 'check-out') => {
    setError('');
    setMessage('');
    setActionLoading(mode);

    try {
      const location = await getCurrentLocation();
      const response = await fetchApiJson(apiUrl(`/api/attendance/self/${mode}`), {
        method: 'POST',
        headers,
        body: JSON.stringify(location),
      });
      setMessage(String(response?.message || (mode === 'check-in' ? 'Check-in recorded.' : 'Check-out recorded.')));
      await loadSummary();
    } catch (actionError: any) {
      setError(actionError?.message || `Failed to record ${mode}`);
    } finally {
      setActionLoading('');
    }
  };

  const cardClass = 'rounded-2xl border border-white/10 bg-white/5 p-5';

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Employee Self Attendance</p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Check in and check out with current time</h1>
          <p className="max-w-3xl text-sm text-gray-300">
            Use your mobile phone at the sports complex to mark your own attendance. The system uses the current time and, when enabled by the administrator, verifies that your GPS location is inside the allowed attendance area.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ManualHelpLink anchor="transaction-employee-attendance" />
          <Link
            to="/attendance/reports"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
          >
            Open Attendance Reports
          </Link>
          <Link
            to="/attendance"
            className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/20"
          >
            Open Attendance Register
          </Link>
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-indigo-200">Loading employee attendance...</div>
      ) : summary ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <section className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Employee</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{summary.employee.name}</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {summary.employee.employeeCode}
                    {summary.employee.designation ? ` • ${summary.employee.designation}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Today</p>
                  <p className="mt-2 text-lg font-semibold text-white">{summary.today}</p>
                  <p className="mt-1 text-sm text-cyan-100">Current time {summary.nowTime}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Check In</p>
                  <p className="mt-2 text-xl font-semibold text-white">{summary.entry?.checkIn || '--:--'}</p>
                  <p className="mt-1 text-xs text-slate-400">Captured from current system time</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Check Out</p>
                  <p className="mt-2 text-xl font-semibold text-white">{summary.entry?.checkOut || '--:--'}</p>
                  <p className="mt-1 text-xs text-slate-400">Captured from current system time</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!summary.canCheckIn || Boolean(actionLoading)}
                  onClick={() => void runAttendanceAction('check-in')}
                  className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading === 'check-in' ? 'Checking in...' : 'Check In Now'}
                </button>
                <button
                  type="button"
                  disabled={!summary.canCheckOut || Boolean(actionLoading)}
                  onClick={() => void runAttendanceAction('check-out')}
                  className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading === 'check-out' ? 'Checking out...' : 'Check Out Now'}
                </button>
                <button
                  type="button"
                  disabled={loading || Boolean(actionLoading)}
                  onClick={() => void loadSummary()}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </section>

            <section className={`${cardClass} space-y-4`}>
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-200">Attendance rule</p>
                <p className="mt-2 text-sm leading-6 text-amber-50">
                  Turn on mobile GPS when marking attendance. This screen is for employee self-attendance only. Supervisors should continue using the manual attendance register for corrections or bulk updates.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Location control</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {summary.geofence.enabled ? `Restricted to ${summary.geofence.locationName}` : 'Location restriction is currently disabled'}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {summary.geofence.enabled
                    ? `You must be inside the allowed attendance area. Radius: ${summary.geofence.radiusMeters} meters.`
                    : 'An administrator can enable sports complex GPS restriction from Settings > Security.'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Current entry status</p>
                <p className="mt-2 text-sm text-slate-300">
                  {!summary.entry
                    ? 'No attendance entry has been created for today yet.'
                    : summary.canCheckOut
                      ? 'Check-in is already saved. You can now record check-out from the sports complex.'
                      : summary.entry.checkOut
                        ? 'Today’s attendance is complete and locked after check-out.'
                        : 'Attendance entry exists for today.'}
                </p>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
};
