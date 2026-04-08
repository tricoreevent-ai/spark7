import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_PERMISSIONS, PAGE_KEYS, PageKey, PermissionMatrix } from '@shared/rbac';
import { PaginationControls } from '../components/PaginationControls';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showConfirmDialog } from '../utils/appDialogs';

interface ManagedUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  role: string;
  businessName?: string;
  isActive: boolean;
}

interface ManagedRole {
  role: string;
  isSystemRole: boolean;
  permissions: PermissionMatrix;
}

interface ManagedPage {
  key: PageKey;
  title: string;
  path: string;
}

const cloneEmptyPermissions = (): PermissionMatrix => ({ ...EMPTY_PERMISSIONS });

export const UserManagement: React.FC<{ onReloadMe: () => Promise<void> }> = ({ onReloadMe }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [pages, setPages] = useState<ManagedPage[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [roleDrafts, setRoleDrafts] = useState<Record<string, PermissionMatrix>>({});
  const [editingUserId, setEditingUserId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statusUpdatingUserId, setStatusUpdatingUserId] = useState('');
  const formCardRef = useRef<HTMLFormElement | null>(null);

  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    businessName: '',
    role: 'receptionist',
    isActive: true,
  });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !query || [
        user.firstName,
        user.lastName,
        user.email,
        user.phoneNumber,
        user.businessName,
        user.role,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all'
          || (statusFilter === 'active' && user.isActive)
          || (statusFilter === 'inactive' && !user.isActive);

      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [roleFilter, searchQuery, statusFilter, users]);

  const usersPagination = usePaginatedRows(filteredUsers, {
    initialPageSize: 10,
    resetDeps: [searchQuery, roleFilter, statusFilter],
  });
  const activeUsersCount = useMemo(() => users.filter((user) => user.isActive).length, [users]);
  const inactiveUsersCount = users.length - activeUsersCount;
  const customRolesCount = useMemo(() => roles.filter((role) => !role.isSystemRole).length, [roles]);

  const normalizeRoleLabel = (role: string) =>
    String(role || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const isProtectedManagedRole = (role: string) => ['admin', 'super_admin'].includes(String(role || '').trim().toLowerCase());

  const getInitials = (user: ManagedUser) => {
    const combined = `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim();
    if (!combined) {
      return String(user.email || 'U').slice(0, 2).toUpperCase();
    }
    return combined
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  };

  const focusForm = () => {
    formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const clearBanner = () => {
    setError('');
    setMessage('');
  };

  const loadData = async () => {
    clearBanner();
    try {
      const [usersResp, rolesResp, pagesResp, meResp] = await Promise.all([
        fetchApiJson(apiUrl('/api/users'), { headers }),
        fetchApiJson(apiUrl('/api/rbac/roles'), { headers }),
        fetchApiJson(apiUrl('/api/rbac/pages'), { headers }),
        fetchApiJson(apiUrl('/api/auth/me'), { headers }),
      ]);

      const nextUsers: ManagedUser[] = usersResp.data || [];
      const nextRoles: ManagedRole[] = rolesResp.data || [];
      const nextPages: ManagedPage[] = pagesResp.data || [];
      setUsers(nextUsers);
      setRoles(nextRoles);
      setPages(nextPages);
      setCurrentUserId(String(meResp?.user?._id || ''));
      setCurrentUserRole(String(meResp?.user?.role || '').toLowerCase());

      setRoleDrafts(
        nextRoles.reduce(
          (acc, item) => {
            acc[item.role] = { ...cloneEmptyPermissions(), ...(item.permissions || {}) };
            return acc;
          },
          {} as Record<string, PermissionMatrix>
        )
      );

      setForm((prev) => {
        const currentRoleExists = nextRoles.some((item) => item.role === prev.role);
        return {
          ...prev,
          role: currentRoleExists ? prev.role : nextRoles[0]?.role || 'receptionist',
        };
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load user management data');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setEditingUserId('');
    setForm({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phoneNumber: '',
      businessName: '',
      role: roles[0]?.role || 'receptionist',
      isActive: true,
    });
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    clearBanner();
    try {
      const normalizedEmail = form.email.trim().toLowerCase();
      if (!normalizedEmail) {
        setError('Email ID is required for login and OTP.');
        return;
      }

      const confirmed = await showConfirmDialog(
        editingUserId ? 'Save changes to this user?' : 'Create this user now?',
        {
          title: editingUserId ? 'Confirm User Update' : 'Confirm User Creation',
          confirmText: editingUserId ? 'Update User' : 'Create User',
          cancelText: 'Cancel',
        }
      );
      if (!confirmed) return;

      const payload = {
        email: normalizedEmail,
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber,
        businessName: form.businessName,
        role: form.role,
        isActive: form.isActive,
        ...(form.password ? { password: form.password } : {}),
      };

      if (editingUserId) {
        await fetchApiJson(apiUrl(`/api/users/${editingUserId}`), {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
        setMessage('User updated successfully');
      } else {
        if (!form.password) {
          setError('Password is required for new users');
          return;
        }
        await fetchApiJson(apiUrl('/api/users'), {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        setMessage('User created successfully');
      }

      await loadData();
      await onReloadMe();
      resetForm();
    } catch (e: any) {
      setError(e.message || 'Failed to save user');
    }
  };

  const onEditUser = (user: ManagedUser) => {
    clearBanner();
    setEditingUserId(user._id);
    setForm({
      email: user.email || '',
      password: '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phoneNumber: user.phoneNumber || '',
      businessName: user.businessName || '',
      role: user.role || roles[0]?.role || 'receptionist',
      isActive: Boolean(user.isActive),
    });
    focusForm();
  };

  const onDeleteUser = async (id: string) => {
    clearBanner();
    if (!(await showConfirmDialog('Delete this user?', { title: 'Delete User', confirmText: 'Delete' }))) return;
    try {
      await fetchApiJson(apiUrl(`/api/users/${id}`), {
        method: 'DELETE',
        headers,
      });
      setMessage('User deleted successfully');
      await loadData();
      await onReloadMe();
      if (editingUserId === id) resetForm();
    } catch (e: any) {
      setError(e.message || 'Failed to delete user');
    }
  };

  const canToggleStatus = (user: ManagedUser) =>
    user._id !== currentUserId && !isProtectedManagedRole(user.role);

  const canDeleteUser = (user: ManagedUser) =>
    user._id !== currentUserId && !isProtectedManagedRole(user.role);

  const getStatusLockReason = (user: ManagedUser) => {
    if (user._id === currentUserId) return 'Current session';
    if (isProtectedManagedRole(user.role)) return 'Protected role';
    return 'Status locked';
  };

  const toggleUserStatus = async (user: ManagedUser) => {
    clearBanner();
    const actionLabel = user.isActive ? 'Deactivate' : 'Activate';
    const confirmed = await showConfirmDialog(
      `${actionLabel} ${`${user.firstName} ${user.lastName}`.trim() || user.email}?`,
      {
        title: `${actionLabel} User`,
        confirmText: actionLabel,
        cancelText: 'Cancel',
        severity: user.isActive ? 'warning' : 'info',
      }
    );
    if (!confirmed) return;

    try {
      setStatusUpdatingUserId(user._id);
      await fetchApiJson(apiUrl(`/api/users/${user._id}/status`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      setMessage(`User ${!user.isActive ? 'activated' : 'deactivated'} successfully`);
      await loadData();
      await onReloadMe();
      if (editingUserId === user._id) {
        setForm((prev) => ({ ...prev, isActive: !user.isActive }));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to update user status');
    } finally {
      setStatusUpdatingUserId('');
    }
  };

  const toggleRolePage = (role: string, page: PageKey, checked: boolean) => {
    setRoleDrafts((prev) => ({
      ...prev,
      [role]: {
        ...cloneEmptyPermissions(),
        ...(prev[role] || {}),
        [page]: checked,
      },
    }));
  };

  const saveRolePermissions = async (role: string) => {
    clearBanner();
    try {
      await fetchApiJson(apiUrl(`/api/rbac/roles/${encodeURIComponent(role)}/permissions`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ permissions: roleDrafts[role] || cloneEmptyPermissions() }),
      });
      setMessage(`Permissions updated for role: ${role}`);
      await loadData();
      await onReloadMe();
    } catch (e: any) {
      setError(e.message || 'Failed to update role permissions');
    }
  };

  const createNewRole = async () => {
    clearBanner();
    const role = newRoleName.trim().toLowerCase();
    if (!role) {
      setError('Role name is required');
      return;
    }

    try {
      await fetchApiJson(apiUrl('/api/rbac/roles'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ role, permissions: cloneEmptyPermissions() }),
      });
      setMessage(`Role "${role}" created successfully`);
      setNewRoleName('');
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to create role');
    }
  };

  const deleteRoleByName = async (role: string) => {
    clearBanner();
    if (!(await showConfirmDialog(`Delete role "${role}"?`, { title: 'Delete Role', confirmText: 'Delete' }))) return;
    try {
      await fetchApiJson(apiUrl(`/api/rbac/roles/${encodeURIComponent(role)}`), {
        method: 'DELETE',
        headers,
      });
      setMessage(`Role "${role}" deleted successfully`);
      await loadData();
      await onReloadMe();
    } catch (e: any) {
      setError(e.message || 'Failed to delete role');
    }
  };

  const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500';
  const isStatusUpdating = (user: ManagedUser) => statusUpdatingUserId === user._id;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">User Management</h1>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <form ref={formCardRef} onSubmit={saveUser} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-white">{editingUserId ? 'Edit User' : 'Add User'}</h2>
          <input className={inputClass} type="email" placeholder="Email ID (required for login & OTP)" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inputClass} type="password" placeholder={editingUserId ? 'New Password (optional)' : 'Password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className={inputClass} placeholder="First Name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <input className={inputClass} placeholder="Last Name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <input className={inputClass} placeholder="Phone Number" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
          <input className={inputClass} placeholder="Business Name" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />

          <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((role) => (
              <option key={role.role} value={role.role}>{role.role}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.isActive}
              disabled={Boolean(editingUserId) && (editingUserId === currentUserId || isProtectedManagedRole(form.role))}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active
          </label>
          {editingUserId && (
            <p className="text-xs text-slate-400">
              Status can also be changed directly from the users table with confirmation. Protected admin roles and the current logged-in user cannot be deactivated.
            </p>
          )}

          <div className="flex gap-2">
            <button className="flex-1 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
              {editingUserId ? 'Update User' : 'Create User'}
            </button>
            {editingUserId && (
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

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-0 shadow-[0_24px_70px_rgba(2,6,23,0.24)] xl:col-span-2 overflow-hidden">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">User directory</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Users</h2>
                <p className="mt-2 text-sm text-slate-400">Flowbite-style CRUD table layout with fast search, status filters, and direct actions.</p>
                <p className="mt-2 text-xs text-slate-500">Current role: {normalizeRoleLabel(currentUserRole || 'unknown')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  focusForm();
                }}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"
              >
                + Add new user
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Total users</p>
                <p className="mt-2 text-2xl font-semibold text-white">{users.length}</p>
              </div>
              <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Active</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-100">{activeUsersCount}</p>
              </div>
              <div className="rounded-xl border border-rose-400/10 bg-rose-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-rose-200">Inactive</p>
                <p className="mt-2 text-2xl font-semibold text-rose-100">{inactiveUsersCount}</p>
              </div>
              <div className="rounded-xl border border-cyan-400/10 bg-cyan-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Custom roles</p>
                <p className="mt-2 text-2xl font-semibold text-cyan-100">{customRolesCount}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Search</label>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, phone, business, or role"
                  className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Role</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full bg-transparent text-sm text-white outline-none"
                >
                  <option value="all">All roles</option>
                  {roles.map((role) => (
                    <option key={`filter-${role.role}`} value={role.role}>
                      {normalizeRoleLabel(role.role)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                  className="w-full bg-transparent text-sm text-white outline-none"
                >
                  <option value="all">All status</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/10 bg-slate-950/60 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <tr>
                  <th className="px-5 py-4">User</th>
                  <th className="px-5 py-4">Business</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Phone</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {usersPagination.paginatedRows.map((user) => (
                  <tr key={user._id} className="bg-slate-900/40 transition hover:bg-white/5">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/10 text-sm font-semibold text-cyan-100">
                          {getInitials(user)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">{`${user.firstName} ${user.lastName}`.trim() || 'Unnamed User'}</p>
                          <p className="truncate text-xs text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="min-w-[140px]">
                        <p className="text-sm text-slate-100">{user.businessName || 'Not assigned'}</p>
                        <p className="mt-1 text-xs text-slate-500">Workspace member</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full border border-indigo-400/20 bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-100">
                        {normalizeRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-300">{user.phoneNumber || 'Not provided'}</td>
                    <td className="px-5 py-4">
                      <div className="flex min-w-[160px] items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={user.isActive}
                          aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${`${user.firstName} ${user.lastName}`.trim() || user.email}`}
                          onClick={() => {
                            if (!canToggleStatus(user) || isStatusUpdating(user)) return;
                            void toggleUserStatus(user);
                          }}
                          disabled={!canToggleStatus(user) || isStatusUpdating(user)}
                          title={!canToggleStatus(user) ? getStatusLockReason(user) : `${user.isActive ? 'Deactivate' : 'Activate'} user`}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-4 ${
                            user.isActive
                              ? 'border-indigo-300/20 bg-indigo-500 focus:ring-indigo-500/25'
                              : 'border-white/10 bg-slate-600 focus:ring-slate-400/20'
                          } ${isStatusUpdating(user) ? 'animate-pulse' : ''}`}
                          style={{ cursor: !canToggleStatus(user) ? 'not-allowed' : undefined }}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition ${
                              user.isActive ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <span className={`text-sm font-semibold ${
                          user.isActive ? 'text-emerald-200' : 'text-rose-200'
                        }`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEditUser(user)}
                          className="rounded-lg border border-indigo-400/20 bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/25"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteUser(user._id)}
                          disabled={!canDeleteUser(user)}
                          title={!canDeleteUser(user) ? getStatusLockReason(user) : 'Delete user'}
                          className="rounded-lg border border-rose-400/20 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {usersPagination.paginatedRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                      No users match the current search or filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/10 px-5 py-4">
            <PaginationControls
              currentPage={usersPagination.currentPage}
              totalPages={usersPagination.totalPages}
              totalRows={usersPagination.totalRows}
              pageSize={usersPagination.pageSize}
              startIndex={usersPagination.startIndex}
              endIndex={usersPagination.endIndex}
              itemLabel="users"
              onPageChange={usersPagination.setCurrentPage}
              onPageSizeChange={usersPagination.setPageSize}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Role Access Configuration</h2>
          <div className="flex gap-2">
            <input
              className={inputClass}
              placeholder="new-role-name"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
            />
            <button
              type="button"
              onClick={createNewRole}
              className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              Create Role
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {roles.map((role) => (
            <div key={role.role} className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">{role.role}</h3>
                  <p className="text-xs text-gray-400">{role.isSystemRole ? 'System role' : 'Custom role'}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveRolePermissions(role.role)}
                    className="rounded-md bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
                  >
                    Save Permissions
                  </button>
                  {!role.isSystemRole && (
                    <button
                      type="button"
                      onClick={() => deleteRoleByName(role.role)}
                      className="rounded-md bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/30"
                    >
                      Delete Role
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {(pages.length ? pages : PAGE_KEYS.map((key) => ({ key, title: key, path: '' } as ManagedPage))).map((page) => (
                  <label key={`${role.role}-${page.key}`} className="flex items-center gap-2 rounded border border-white/10 px-2 py-2 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={Boolean(roleDrafts[role.role]?.[page.key])}
                      onChange={(e) => toggleRolePage(role.role, page.key, e.target.checked)}
                    />
                    <span>{page.title}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
