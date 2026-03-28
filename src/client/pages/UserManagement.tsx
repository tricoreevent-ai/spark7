import React, { useEffect, useMemo, useState } from 'react';
import { EMPTY_PERMISSIONS, PAGE_KEYS, PageKey, PermissionMatrix } from '@shared/rbac';
import { PaginationControls } from '../components/PaginationControls';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { apiUrl, fetchApiJson } from '../utils/api';

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
  const [roleDrafts, setRoleDrafts] = useState<Record<string, PermissionMatrix>>({});
  const [editingUserId, setEditingUserId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
  const usersPagination = usePaginatedRows(users, { initialPageSize: 10 });

  const clearBanner = () => {
    setError('');
    setMessage('');
  };

  const loadData = async () => {
    clearBanner();
    try {
      const [usersResp, rolesResp, pagesResp] = await Promise.all([
        fetchApiJson(apiUrl('/api/users'), { headers }),
        fetchApiJson(apiUrl('/api/rbac/roles'), { headers }),
        fetchApiJson(apiUrl('/api/rbac/pages'), { headers }),
      ]);

      const nextUsers: ManagedUser[] = usersResp.data || [];
      const nextRoles: ManagedRole[] = rolesResp.data || [];
      const nextPages: ManagedPage[] = pagesResp.data || [];
      setUsers(nextUsers);
      setRoles(nextRoles);
      setPages(nextPages);

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
      const payload = {
        email: form.email,
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
  };

  const onDeleteUser = async (id: string) => {
    clearBanner();
    if (!window.confirm('Delete this user?')) return;
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
    if (!window.confirm(`Delete role "${role}"?`)) return;
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">User Management</h1>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <form onSubmit={saveUser} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-white">{editingUserId ? 'Edit User' : 'Add User'}</h2>
          <input className={inputClass} type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active
          </label>

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

        <div className="rounded-xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-white">Users</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {usersPagination.paginatedRows.map((user) => (
                  <tr key={user._id}>
                    <td className="px-3 py-2 text-sm text-white">{user.firstName} {user.lastName}</td>
                    <td className="px-3 py-2 text-sm text-gray-300">{user.email}</td>
                    <td className="px-3 py-2 text-sm text-gray-300">{user.role}</td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`rounded-full px-2 py-1 text-xs ${user.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onEditUser(user)}
                          className="rounded bg-indigo-500/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/30"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteUser(user._id)}
                          className="rounded bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {usersPagination.paginatedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-center text-sm text-gray-400">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
