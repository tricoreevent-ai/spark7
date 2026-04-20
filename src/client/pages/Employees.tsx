import React, { useEffect, useMemo, useState } from 'react';
import { PaginationControls } from '../components/PaginationControls';
import { FloatingField } from '../components/FloatingField';
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
  address?: string;
  designation?: string;
  pan?: string;
  aadhaar?: string;
  uan?: string;
  esiNumber?: string;
  pfAccountNumber?: string;
  state?: string;
  employmentType: 'salaried' | 'daily' | 'contractor';
  monthlySalary?: number;
  basicSalary?: number;
  dearnessAllowance?: number;
  hra?: number;
  conveyanceAllowance?: number;
  specialAllowance?: number;
  dailyRate?: number;
  overtimeHourlyRate?: number;
  pfEnabled?: boolean;
  esiEnabled?: boolean;
  professionalTaxEnabled?: boolean;
  professionalTax?: number;
  tdsEnabled?: boolean;
  monthlyTdsOverride?: number;
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
    address: '',
    designation: '',
    pan: '',
    aadhaar: '',
    uan: '',
    esiNumber: '',
    pfAccountNumber: '',
    state: '',
    employmentType: 'salaried',
    monthlySalary: '',
    basicSalary: '',
    dearnessAllowance: '',
    hra: '',
    conveyanceAllowance: '',
    specialAllowance: '',
    dailyRate: '',
    overtimeHourlyRate: '',
    pfEnabled: true,
    esiEnabled: true,
    professionalTaxEnabled: false,
    professionalTax: '',
    tdsEnabled: false,
    monthlyTdsOverride: '',
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
        address: '',
        designation: '',
        pan: '',
        aadhaar: '',
        uan: '',
        esiNumber: '',
        pfAccountNumber: '',
        state: '',
      employmentType: 'salaried',
      monthlySalary: '',
      basicSalary: '',
      dearnessAllowance: '',
      hra: '',
      conveyanceAllowance: '',
      specialAllowance: '',
      dailyRate: '',
      overtimeHourlyRate: '',
      pfEnabled: true,
      esiEnabled: true,
      professionalTaxEnabled: false,
      professionalTax: '',
      tdsEnabled: false,
      monthlyTdsOverride: '',
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
        basicSalary: Number(form.basicSalary || 0),
        dearnessAllowance: Number(form.dearnessAllowance || 0),
        hra: Number(form.hra || 0),
        conveyanceAllowance: Number(form.conveyanceAllowance || 0),
        specialAllowance: Number(form.specialAllowance || 0),
        dailyRate: Number(form.dailyRate || 0),
        overtimeHourlyRate: Number(form.overtimeHourlyRate || 0),
        professionalTax: Number(form.professionalTax || 0),
        monthlyTdsOverride: Number(form.monthlyTdsOverride || 0),
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
        address: employee.address || '',
        designation: employee.designation || '',
        pan: employee.pan || '',
        aadhaar: employee.aadhaar || '',
        uan: employee.uan || '',
        esiNumber: employee.esiNumber || '',
        pfAccountNumber: employee.pfAccountNumber || '',
        state: employee.state || '',
      employmentType: employee.employmentType || 'salaried',
      monthlySalary: String(employee.monthlySalary ?? ''),
      basicSalary: String(employee.basicSalary ?? ''),
      dearnessAllowance: String(employee.dearnessAllowance ?? ''),
      hra: String(employee.hra ?? ''),
      conveyanceAllowance: String(employee.conveyanceAllowance ?? ''),
      specialAllowance: String(employee.specialAllowance ?? ''),
      dailyRate: String(employee.dailyRate ?? ''),
      overtimeHourlyRate: String(employee.overtimeHourlyRate ?? ''),
      pfEnabled: employee.pfEnabled !== false,
      esiEnabled: employee.esiEnabled !== false,
      professionalTaxEnabled: Boolean(employee.professionalTaxEnabled),
      professionalTax: String(employee.professionalTax ?? ''),
      tdsEnabled: Boolean(employee.tdsEnabled),
      monthlyTdsOverride: String(employee.monthlyTdsOverride ?? ''),
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

  const seedSampleEmployees = async () => {
    setError('');
    setMessage('');
    try {
      const data = await fetchApiJson(apiUrl('/api/employees/demo-seed'), {
        method: 'POST',
        headers,
      });
      setMessage(data.message || 'Sample employees added');
      await loadEmployees();
    } catch (e: any) {
      setError(e.message || 'Failed to add sample employees');
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Employees</h1>
        <button
          type="button"
          onClick={seedSampleEmployees}
          className="rounded-md border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20"
        >
          Add Sample Employees
        </button>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <form onSubmit={saveEmployee} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-white">{editingId ? 'Edit Employee' : 'Add Employee'}</h2>
          <FloatingField label="Employee Code" required value={form.employeeCode} onChange={(value) => setForm({ ...form, employeeCode: value.toUpperCase() })} />
          <FloatingField label="Name" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <FloatingField label="Phone Number" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <FloatingField label="Email ID" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <FloatingField label="Address for Form 16" rows={2} value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          <FloatingField label="Designation" value={form.designation} onChange={(value) => setForm({ ...form, designation: value })} />
          <div className="grid grid-cols-2 gap-2">
            <FloatingField label="PAN" value={form.pan} onChange={(value) => setForm({ ...form, pan: value.toUpperCase() })} />
            <FloatingField label="Aadhaar" value={form.aadhaar} onChange={(value) => setForm({ ...form, aadhaar: value })} />
            <FloatingField label="UAN" value={form.uan} onChange={(value) => setForm({ ...form, uan: value })} />
            <FloatingField label="ESI No." value={form.esiNumber} onChange={(value) => setForm({ ...form, esiNumber: value })} />
            <FloatingField label="PF Account No." value={form.pfAccountNumber} onChange={(value) => setForm({ ...form, pfAccountNumber: value })} />
            <FloatingField label="State for PT" value={form.state} onChange={(value) => setForm({ ...form, state: value })} />
          </div>
          <FloatingField
            label="Employment Type"
            value={form.employmentType}
            onChange={(value) => setForm({ ...form, employmentType: value })}
            options={[
              { value: 'salaried', label: 'Salaried' },
              { value: 'daily', label: 'Daily Wage' },
              { value: 'contractor', label: 'Contractor' },
            ]}
          />
          <FloatingField label="Monthly Salary" type="number" min="0" step="0.01" value={form.monthlySalary} onChange={(value) => setForm({ ...form, monthlySalary: value })} />
          <div className="grid grid-cols-2 gap-2">
            <FloatingField label="Basic" type="number" min="0" step="0.01" value={form.basicSalary} onChange={(value) => setForm({ ...form, basicSalary: value })} />
            <FloatingField label="DA" type="number" min="0" step="0.01" value={form.dearnessAllowance} onChange={(value) => setForm({ ...form, dearnessAllowance: value })} />
            <FloatingField label="HRA" type="number" min="0" step="0.01" value={form.hra} onChange={(value) => setForm({ ...form, hra: value })} />
            <FloatingField label="Special Allowance" type="number" min="0" step="0.01" value={form.specialAllowance} onChange={(value) => setForm({ ...form, specialAllowance: value })} />
          </div>
          <FloatingField label="Conveyance Allowance" type="number" min="0" step="0.01" value={form.conveyanceAllowance} onChange={(value) => setForm({ ...form, conveyanceAllowance: value })} />
          <FloatingField label="Daily Rate" type="number" min="0" step="0.01" value={form.dailyRate} onChange={(value) => setForm({ ...form, dailyRate: value })} />
          <FloatingField label="Overtime Hourly Rate" type="number" min="0" step="0.01" value={form.overtimeHourlyRate} onChange={(value) => setForm({ ...form, overtimeHourlyRate: value })} />

          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.pfEnabled} onChange={(e) => setForm({ ...form, pfEnabled: e.target.checked })} />PF applicable</label>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.esiEnabled} onChange={(e) => setForm({ ...form, esiEnabled: e.target.checked })} />ESI applicable</label>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.professionalTaxEnabled} onChange={(e) => setForm({ ...form, professionalTaxEnabled: e.target.checked })} />Professional Tax applicable</label>
          <FloatingField label="Monthly Professional Tax" type="number" min="0" step="0.01" value={form.professionalTax} onChange={(value) => setForm({ ...form, professionalTax: value })} />
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.tdsEnabled} onChange={(e) => setForm({ ...form, tdsEnabled: e.target.checked })} />Salary TDS applicable</label>
          <FloatingField label="Monthly TDS Override" type="number" min="0" step="0.01" value={form.monthlyTdsOverride} onChange={(value) => setForm({ ...form, monthlyTdsOverride: value })} />
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
