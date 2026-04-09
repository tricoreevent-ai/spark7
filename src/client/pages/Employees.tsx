import React, { useEffect, useMemo, useState } from 'react';
import { PaginationControls } from '../components/PaginationControls';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showConfirmDialog } from '../utils/appDialogs';

interface Employee {
  _id: string;
  employeeCode: string;
  name: string;
  phone?: string;
  email?: string;
  designation?: string;
  employmentType: 'salaried' | 'daily' | 'contractor';
  monthlySalary?: number;
  dailyRate?: number;
  overtimeHourlyRate?: number;
  paidLeave: boolean;
  active: boolean;
}

interface SalarySummary {
  month: string;
  attendance: {
    presentDays: number;
    halfDays: number;
    leaveDays: number;
    absentDays: number;
    payableDays: number;
    overtimeHours: number;
  };
  salary: {
    basePay: number;
    overtimePay: number;
    totalPayable: number;
    employmentType: string;
  };
}

export const Employees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [salaryMonth, setSalaryMonth] = useState(new Date().toISOString().slice(0, 7));
  const [salarySummary, setSalarySummary] = useState<SalarySummary | null>(null);

  const [form, setForm] = useState({
    employeeCode: '',
    name: '',
    phone: '',
    email: '',
    designation: '',
    employmentType: 'salaried',
    monthlySalary: '',
    dailyRate: '',
    overtimeHourlyRate: '',
    paidLeave: true,
    active: true,
  });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);
  const employeesPagination = usePaginatedRows(employees, { initialPageSize: 10 });

  const loadEmployees = async () => {
    try {
      const data = await fetchApiJson(apiUrl('/api/employees'), { headers });
      setEmployees(data.data || []);
      if (!selectedId && data.data?.[0]?._id) setSelectedId(data.data[0]._id);
    } catch (e: any) {
      setError(e.message || 'Failed to load employees');
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const resetForm = () => {
    setEditingId('');
      setForm({
        employeeCode: '',
        name: '',
        phone: '',
        email: '',
        designation: '',
      employmentType: 'salaried',
      monthlySalary: '',
      dailyRate: '',
      overtimeHourlyRate: '',
      paidLeave: true,
      active: true,
    });
  };

  const saveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      const body = {
        ...form,
        monthlySalary: Number(form.monthlySalary || 0),
        dailyRate: Number(form.dailyRate || 0),
        overtimeHourlyRate: Number(form.overtimeHourlyRate || 0),
      };

      await fetchApiJson(apiUrl(editingId ? `/api/employees/${editingId}` : '/api/employees'), {
        method: editingId ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(body),
      });

      setMessage(editingId ? 'Employee updated successfully' : 'Employee added successfully');
      resetForm();
      await loadEmployees();
    } catch (e: any) {
      setError(e.message || `Failed to ${editingId ? 'update' : 'create'} employee`);
    }
  };

  const editEmployee = (employee: Employee) => {
    setError('');
    setMessage('');
    setEditingId(employee._id);
      setForm({
        employeeCode: employee.employeeCode || '',
        name: employee.name || '',
        phone: employee.phone || '',
        email: employee.email || '',
        designation: employee.designation || '',
      employmentType: employee.employmentType || 'salaried',
      monthlySalary: String(employee.monthlySalary ?? ''),
      dailyRate: String(employee.dailyRate ?? ''),
      overtimeHourlyRate: String(employee.overtimeHourlyRate ?? ''),
      paidLeave: Boolean(employee.paidLeave),
      active: Boolean(employee.active),
    });
  };

  const deleteEmployee = async (id: string) => {
    setError('');
    setMessage('');
    if (!(await showConfirmDialog('Delete this employee?', { title: 'Delete Employee', confirmText: 'Delete' }))) return;

    try {
      await fetchApiJson(apiUrl(`/api/employees/${id}`), {
        method: 'DELETE',
        headers,
      });
      setMessage('Employee deleted successfully');
      await loadEmployees();
      if (editingId === id) resetForm();
      if (selectedId === id) setSelectedId('');
    } catch (e: any) {
      setError(e.message || 'Failed to delete employee');
    }
  };

  const loadSalarySummary = async () => {
    if (!selectedId) return;
    setError('');
    try {
      const data = await fetchApiJson(apiUrl(`/api/employees/${selectedId}/salary-summary?month=${salaryMonth}`), { headers });
      setSalarySummary(data.data);
    } catch (e: any) {
      setError(e.message || 'Failed to compute salary');
      setSalarySummary(null);
    }
  };

  const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500';
  const selectClass = `${inputClass} [&>option]:bg-gray-900 [&>option]:text-white`;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Employees</h1>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <form onSubmit={saveEmployee} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-white">{editingId ? 'Edit Employee' : 'Add Employee'}</h2>
          <input className={inputClass} placeholder="Employee Code" required value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value.toUpperCase() })} />
          <input className={inputClass} placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={inputClass} placeholder="Phone Number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={inputClass} type="email" placeholder="Email ID" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inputClass} placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <select className={selectClass} value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
            <option value="salaried">Salaried</option>
            <option value="daily">Daily Wage</option>
            <option value="contractor">Contractor</option>
          </select>
          <input className={inputClass} type="number" min="0" step="0.01" placeholder="Monthly Salary" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} />
          <input className={inputClass} type="number" min="0" step="0.01" placeholder="Daily Rate" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: e.target.value })} />
          <input className={inputClass} type="number" min="0" step="0.01" placeholder="Overtime Hourly Rate" value={form.overtimeHourlyRate} onChange={(e) => setForm({ ...form, overtimeHourlyRate: e.target.value })} />

          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.paidLeave} onChange={(e) => setForm({ ...form, paidLeave: e.target.checked })} />Paid Leave</label>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Active</label>

          <div className="flex gap-2">
            <button className="flex-1 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
              {editingId ? 'Update Employee' : 'Save Employee'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-white">Employee List</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  {['Code', 'Name', 'Type', 'Designation', 'Base Rate', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {employeesPagination.paginatedRows.map((emp) => (
                  <tr key={emp._id}>
                    <td className="px-3 py-2 text-sm text-white">{emp.employeeCode}</td>
                    <td className="px-3 py-2 text-sm text-white">
                      <div>
                        <div>{emp.name}</div>
                        {(emp.email || emp.phone) && (
                          <div className="mt-1 text-xs text-gray-400">
                            {[emp.email, emp.phone].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-300 uppercase">{emp.employmentType}</td>
                    <td className="px-3 py-2 text-sm text-gray-300">{emp.designation || '-'}</td>
                    <td className="px-3 py-2 text-sm text-gray-300">
                      {emp.employmentType === 'salaried' ? formatCurrency(Number(emp.monthlySalary || 0)) : formatCurrency(Number(emp.dailyRate || 0))}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`rounded-full px-2 py-1 text-xs ${emp.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                        {emp.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editEmployee(emp)}
                          className="rounded bg-indigo-500/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/30"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEmployee(emp._id)}
                          className="rounded bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {employeesPagination.paginatedRows.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-3 text-sm text-center text-gray-400">No employees yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={employeesPagination.currentPage}
            totalPages={employeesPagination.totalPages}
            totalRows={employeesPagination.totalRows}
            pageSize={employeesPagination.pageSize}
            startIndex={employeesPagination.startIndex}
            endIndex={employeesPagination.endIndex}
            itemLabel="employees"
            onPageChange={employeesPagination.setCurrentPage}
            onPageSizeChange={employeesPagination.setPageSize}
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Salary Calculation From Attendance</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Employee</label>
            <select className={selectClass} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.employeeCode} - {emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Month</label>
            <input className={inputClass} type="month" value={salaryMonth} onChange={(e) => setSalaryMonth(e.target.value)} />
          </div>
          <button onClick={loadSalarySummary} className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Calculate</button>
        </div>

        {salarySummary && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded border border-white/10 p-3"><p className="text-xs text-gray-400">Payable Days</p><p className="text-white font-semibold">{salarySummary.attendance.payableDays}</p></div>
            <div className="rounded border border-white/10 p-3"><p className="text-xs text-gray-400">Overtime Hours</p><p className="text-white font-semibold">{salarySummary.attendance.overtimeHours}</p></div>
            <div className="rounded border border-white/10 p-3"><p className="text-xs text-gray-400">Total Payable</p><p className="text-emerald-300 font-semibold">{formatCurrency(salarySummary.salary.totalPayable)}</p></div>
          </div>
        )}
      </div>
    </div>
  );
};
