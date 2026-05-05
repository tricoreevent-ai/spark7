import React, { useState } from 'react';
import { ActionIconButton } from '../components/ActionIconButton';
import { useCategories } from '../hooks/useCategories';
import { Table, Column } from '../components/Table';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showConfirmDialog } from '../utils/appDialogs';

export const Categories: React.FC = () => {
  const { categories, loading, error, refetch } = useCategories();
  const [newCategory, setNewCategory] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;

    setSubmitting(true);
    setActionError('');
    setMessage('');
    try {
      const token = localStorage.getItem('token');
      await fetchApiJson(apiUrl('/api/categories'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newCategory, description })
      });
      setNewCategory('');
      setDescription('');
      setMessage('Category saved successfully.');
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await showConfirmDialog('Are you sure you want to delete this category?', { title: 'Delete Category', confirmText: 'Delete' }))) return;
    
    try {
      const token = localStorage.getItem('token');
      setActionError('');
      setMessage('');
      await fetchApiJson(apiUrl(`/api/categories/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMessage('Category deleted successfully.');
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (error) return <div className="mx-auto max-w-7xl px-4 py-6 text-red-500">Error: {error}</div>;

  const columns: Column<typeof categories[0]>[] = [
    { header: 'Name', accessor: 'name', className: 'font-medium text-white' },
    { header: 'Description', sortValue: (cat) => cat.description || '', render: (cat) => cat.description || '-' },
    {
      header: 'Actions',
      className: 'text-right',
      sortable: false,
      render: (cat) => (
        <div className="flex justify-end">
          <ActionIconButton kind="delete" onClick={() => void handleDelete(cat._id)} title={`Delete ${cat.name}`} />
        </div>
      )
    }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight mb-8">Categories</h1>
      {message && <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {actionError && <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{actionError}</div>}
      
      <div className="mb-8 rounded-lg bg-white/5 p-6 shadow border border-white/10">
        <h2 className="text-lg font-medium leading-6 text-white mb-4">Add New Category</h2>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:w-1/3">
            <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input 
              type="text" 
              value={newCategory} 
              onChange={(e) => setNewCategory(e.target.value)} 
              required 
              className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
            />
          </div>
          <div className="w-full sm:w-1/2">
            <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <input 
              type="text" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
            />
          </div>
          <button type="submit" disabled={submitting} className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
            {submitting ? 'Adding...' : 'Add Category'}
          </button>
        </form>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium leading-6 text-white mb-4">Existing Categories</h2>
        <Table data={categories} columns={columns} emptyMessage="No categories found" />
      </div>
    </div>
  );
};
