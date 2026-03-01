'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getApiUrl, getAuthHeaders } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { useTranslations } from 'next-intl';
import NotionTable, { Column } from '@/components/ui/NotionTable';
import SlideOver from '@/components/ui/SlideOver';
import { HandIcon } from '@/components/ui/HandIcon';
import { STATUS_CONFIG, PRIORITY_CONFIG } from '@/components/workspace/TaskTracker/types';
import type { Task } from '@/components/workspace/TaskTracker/types';

// ── Lead status display map (colors only; labels come from i18n) ─────────────
const LEAD_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  new:         { color: '#374151', bg: '#f3f4f6' },
  inquiry:     { color: '#1d4ed8', bg: '#dbeafe' },
  replied:     { color: '#0284c7', bg: '#e0f2fe' },
  engaged:     { color: '#7c3aed', bg: '#ede9fe' },
  qualified:   { color: '#059669', bg: '#d1fae5' },
  quoted:      { color: '#d97706', bg: '#fef3c7' },
  negotiating: { color: '#c2410c', bg: '#fff7ed' },
  procuring:   { color: '#0f766e', bg: '#f0fdfa' },
  booking:     { color: '#1d4ed8', bg: '#eff6ff' },
  fulfillment: { color: '#7c3aed', bg: '#f5f3ff' },
  payment:     { color: '#15803d', bg: '#f0fdf4' },
  converted:   { color: '#15803d', bg: '#d1fae5' },
};
const LEAD_STATUS_LABEL_KEYS: Record<string, string> = {
  new: 'leadStatusNew', inquiry: 'leadStatusInquiry', replied: 'leadStatusReplied',
  engaged: 'leadStatusEngaged', qualified: 'leadStatusQualified', quoted: 'leadStatusQuoted',
  negotiating: 'leadStatusNegotiating', procuring: 'leadStatusProcuring', booking: 'leadStatusBooking',
  fulfillment: 'leadStatusFulfillment', payment: 'leadStatusPayment', converted: 'leadStatusConverted',
};
const ACTIVE_STATUSES = new Set(['new','inquiry','replied','engaged','qualified','quoted','negotiating','procuring','booking','fulfillment']);
const CLOSED_STATUSES = new Set(['payment','converted']);

// relativeTime now lives inside the component so it can access `t`

const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

type TenantUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
};

type UserTask = Task & { page_id: string; page_title: string };

type Employee = {
  id: string;
  full_name: string;
  email: string;
  position: string;
  status: string;
  employment_type: string;
};

type Department = {
  id: string;
  name: string;
  code: string;
  manager_name: string;
  budget: number;
};

type Leave = {
  id: string;
  employee_id: string;
  employee_name?: string;
  approver_name?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: string;
};

// ── User Tasks Tab ────────────────────────────────────────────────────────────
function getUserTasks(user: TenantUser, allTasks: UserTask[]): UserTask[] {
  const name = user.full_name || user.email;
  return allTasks.filter(t =>
    (t.assignees ?? []).includes(name) ||
    (t.subtasks ?? []).some(s => (s.assignees ?? []).includes(name))
  );
}

function UserTasksTab({ users, allTasks, onSelectUser, tHr }: {
  users: TenantUser[];
  allTasks: UserTask[];
  onSelectUser: (u: TenantUser) => void;
  tHr: any;
}) {
  if (users.length === 0) {
    return <div className="py-16 text-center text-sm" style={{ color: '#9B9A97' }}>{tHr('noUserData')}</div>;
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
      {/* Header */}
      <div className="grid text-[10px] font-semibold uppercase tracking-wider px-5 py-2"
        style={{
          gridTemplateColumns: '1fr 80px 80px 80px 80px',
          background: 'var(--notion-hover)', color: '#9B9A97',
          borderBottom: '1px solid var(--notion-border)',
        }}>
        <span>{tHr('colUser')}</span><span>{tHr('colAllTasks')}</span><span>{tHr('colInProgress')}</span><span>{tHr('colCompleted')}</span><span>{tHr('colRole')}</span>
      </div>
      {users.map(user => {
        const tasks = getUserTasks(user, allTasks);
        const inProgress = tasks.filter(t => t.status === 'in_progress').length;
        const done = tasks.filter(t => t.status === 'done').length;
        const name = user.full_name || user.email;
        return (
          <div key={user.id}
            className="grid items-center px-5 py-3 cursor-pointer transition-colors"
            style={{
              gridTemplateColumns: '1fr 80px 80px 80px 80px',
              borderBottom: '1px solid var(--notion-border)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
            onClick={() => onSelectUser(user)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: '#ede9fe', color: '#7c3aed' }}>
                {name[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{name}</div>
                {user.full_name && <div className="text-[11px] truncate" style={{ color: '#9B9A97' }}>{user.email}</div>}
              </div>
            </div>
            <span className="text-sm font-semibold" style={{ color: tasks.length > 0 ? 'var(--notion-text)' : '#9B9A97' }}>{tasks.length || '—'}</span>
            <span className="text-sm" style={{ color: inProgress > 0 ? '#2F80ED' : '#9B9A97' }}>{inProgress || '—'}</span>
            <span className="text-sm" style={{ color: done > 0 ? '#0F9D58' : '#9B9A97' }}>{done || '—'}</span>
            <span className="text-xs px-2 py-0.5 rounded-full capitalize"
              style={{ background: user.role === 'admin' ? '#ede9fe' : '#f0fdf4', color: user.role === 'admin' ? '#7c3aed' : '#16a34a' }}>
              {user.role}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function UserTaskSlideOverContent({ user, allTasks, tHr }: { user: TenantUser; allTasks: UserTask[]; tHr: any }) {
  const tasks = getUserTasks(user, allTasks);
  const current = tasks.filter(t => t.status !== 'done');
  const completed = tasks.filter(t => t.status === 'done');
  const name = user.full_name || user.email;

  function TaskRow({ task }: { task: UserTask }) {
    const cfg = STATUS_CONFIG[task.status];
    const pCfg = task.priority ? PRIORITY_CONFIG[task.priority] : null;
    const isSubAssignee = !(task.assignees ?? []).includes(name) &&
      (task.subtasks ?? []).some(s => (s.assignees ?? []).includes(name));
    return (
      <div className="flex items-start gap-3 py-2.5 px-1 rounded-lg"
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
        <span className="mt-0.5 text-[11px] font-bold flex-shrink-0" style={{ color: cfg.color }}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{task.title}</span>
            {pCfg && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: pCfg.bg, color: pCfg.color }}>{pCfg.label}</span>
            )}
            {isSubAssignee && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: '#FFF3E0', color: '#F2994A' }}>{tHr('subtask')}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-[11px] inline-flex items-center gap-1" style={{ color: '#9B9A97' }}><HandIcon name="clipboard" size={11} /> {task.page_title || tHr('taskTracker')}</span>
            {task.due_date && (
              <span className="text-[11px] inline-flex items-center gap-1" style={{ color: new Date(task.due_date) < new Date() && task.status !== 'done' ? '#EB5757' : '#9B9A97' }}>
                <HandIcon name="alarm-clock" size={11} /> {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-5">
      {/* User header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
          style={{ background: '#ede9fe', color: '#7c3aed' }}>
          {name[0].toUpperCase()}
        </div>
        <div>
          <p className="font-semibold" style={{ color: 'var(--notion-text)' }}>{name}</p>
          <p className="text-sm" style={{ color: '#9B9A97' }}>{user.email}</p>
          <span className="text-[11px] px-2 py-0.5 rounded-full capitalize"
            style={{ background: user.role === 'admin' ? '#ede9fe' : '#f0fdf4', color: user.role === 'admin' ? '#7c3aed' : '#16a34a' }}>
            {user.role}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: tHr('colAllTasks'), value: tasks.length, color: 'var(--notion-text)' },
          { label: tHr('colInProgress'), value: current.length, color: '#2F80ED' },
          { label: tHr('colCompleted'), value: completed.length, color: '#0F9D58' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] mt-0.5" style={{ color: '#9B9A97' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Current tasks */}
      {current.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#9B9A97' }}>{tHr('currentTasks')}</div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
            <div className="px-3 py-1 divide-y" style={{ borderColor: 'var(--notion-border)' }}>
              {current.map(t => <TaskRow key={t.id} task={t} />)}
            </div>
          </div>
        </div>
      )}

      {/* Completed tasks */}
      {completed.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#9B9A97' }}>{tHr('completedTasks')}</div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)', opacity: 0.7 }}>
            <div className="px-3 py-1 divide-y" style={{ borderColor: 'var(--notion-border)' }}>
              {completed.map(t => <TaskRow key={t.id} task={t} />)}
            </div>
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="py-12 text-center text-sm" style={{ color: '#9B9A97' }}>{tHr('noTaskRecords')}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function HRPage() {
  const tHr = useTranslations('hr');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const tenant = params?.tenant as string;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [allTasks, setAllTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<any[]>([]);
  const [tab, setTab] = useState<'employees' | 'departments' | 'leave' | 'tasks' | 'conversations'>('employees');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', title: '', position_id: '', department_id: '', employment_type: 'full_time', start_date: '' });
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', days: '', reason: '' });
  const [showLeaveCreate, setShowLeaveCreate] = useState(false);
  const [leaveView, setLeaveView] = useState<'my' | 'management'>('my');
  const [myLeaves, setMyLeaves] = useState<Leave[]>([]);
  const [myLeavesLoading, setMyLeavesLoading] = useState(false);
  const [noLinkedEmployee, setNoLinkedEmployee] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [editingEmployee, setEditingEmployee] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  // Employee leads
  const [empLeads, setEmpLeads] = useState<any[]>([]);
  const [empLeadsLoading, setEmpLeadsLoading] = useState(false);
  const [selectedDept, setSelectedDept] = useState<any | null>(null);
  const [editingDept, setEditingDept] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', parent_id: '' });
  const [showCreateDept, setShowCreateDept] = useState(false);
  const [selectedUserForTasks, setSelectedUserForTasks] = useState<TenantUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Conversations tab state
  const [convList, setConvList] = useState<any[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [selectedConv, setSelectedConv] = useState<any | null>(null);
  const [convThread, setConvThread] = useState<any[]>([]);
  const [convThreadLoading, setConvThreadLoading] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  // Browse / filter / sort / download controls
  const [convViewMode, setConvViewMode] = useState<'list' | 'table' | 'stats'>('list');
  const [convSortBy, setConvSortBy] = useState<'last_at' | 'most' | 'least' | 'name'>('last_at');
  const [convFilterUser, setConvFilterUser] = useState('');
  const [convDateFrom, setConvDateFrom] = useState('');
  const [convDateTo, setConvDateTo] = useState('');
  const [convMinMsgs, setConvMinMsgs] = useState('');
  const [convShowFilter, setConvShowFilter] = useState(false);
  const [convShowSort, setConvShowSort] = useState(false);
  const [convShowDownload, setConvShowDownload] = useState(false);

  function relativeTime(iso: string | null): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return tHr('relTimeToday');
    if (days === 1) return tHr('relTimeYesterday');
    if (days < 30) return tHr('relTimeDaysAgo', { n: days });
    const months = Math.floor(days / 30);
    if (months < 12) return tHr('relTimeMonthsAgo', { n: months });
    return tHr('relTimeYearsAgo', { n: Math.floor(months / 12) });
  }

  useEffect(() => {
    const user = getCurrentUser();
    if (user?.role === 'tenant_admin' || user?.role === 'platform_admin') {
      setIsAdmin(true);
      return;
    }
    // Also check is_admin flag from server
    api.get('/api/admin/my-permissions').then((perms: any) => {
      // If all apps return 'edit', treat as admin (or check a dedicated flag)
      if (perms && typeof perms === 'object') {
        const allEdit = Object.values(perms).every(v => v === 'edit');
        if (allEdit) setIsAdmin(true);
      }
    }).catch(() => {});
  }, []);

  // Set default leaveView based on role
  useEffect(() => {
    if (isAdmin) setLeaveView('management');
  }, [isAdmin]);

  // Auto-calculate days from start/end dates
  useEffect(() => {
    if (leaveForm.start_date && leaveForm.end_date) {
      const start = new Date(leaveForm.start_date);
      const end = new Date(leaveForm.end_date);
      if (end >= start) {
        const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
        setLeaveForm(prev => ({ ...prev, days: String(diff) }));
      }
    }
  }, [leaveForm.start_date, leaveForm.end_date]);

  useEffect(() => {
    Promise.all([
      api.get('/api/hr/employees').catch(() => []),
      api.get('/api/hr/departments').catch(() => []),
      api.get('/api/hr/leave-requests').catch(() => []),
      api.get('/api/admin/users').catch(() => []),
      api.get('/api/workspace/user-tasks').catch(() => []),
      api.get('/api/admin/positions').catch(() => []),
    ]).then(([emps, depts, lvs, users, tasks, pos]) => {
      setEmployees(Array.isArray(emps) ? emps : []);
      setDepartments(Array.isArray(depts) ? depts : []);
      setLeaves(Array.isArray(lvs) ? lvs : []);
      setTenantUsers(Array.isArray(users) ? users : []);
      setAllTasks(Array.isArray(tasks) ? tasks : []);
      setPositions(Array.isArray(pos) ? pos : []);
    }).finally(() => setLoading(false));
  }, []);

  // Load leads when an employee is selected (if they have a linked user account)
  useEffect(() => {
    if (!selectedEmployee?.user_id) {
      setEmpLeads([]);
      return;
    }
    setEmpLeadsLoading(true);
    api.get(`/api/hr/staff/${selectedEmployee.user_id}/leads`)
      .then((data: any) => setEmpLeads(Array.isArray(data) ? data : []))
      .catch(() => setEmpLeads([]))
      .finally(() => setEmpLeadsLoading(false));
  }, [selectedEmployee?.user_id]);

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.full_name || id?.slice(0, 8) || '—';

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const payload: any = {
        full_name: form.full_name,
        email: form.email,
        title: form.title || undefined,
        position_id: form.position_id || undefined,
        department_id: form.department_id || undefined,
        employment_type: form.employment_type,
        start_date: form.start_date || undefined,
      };
      const emp = await api.post('/api/hr/employees', payload);
      const posName = positions.find(p => p.id === form.position_id)?.name || '';
      setEmployees(prev => [{ ...emp, full_name: form.full_name, email: form.email, position_name: posName, status: 'active', employment_type: form.employment_type }, ...prev]);
      setShowCreate(false);
      setForm({ full_name: '', email: '', title: '', position_id: '', department_id: '', employment_type: 'full_time', start_date: '' });
    } catch (err: any) { alert(err.message); }
    finally { setCreating(false); }
  }

  async function createLeave(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const req = await api.post('/api/hr/leave-requests', { ...leaveForm, days: parseFloat(leaveForm.days) || 1 });
      setLeaves(prev => [{ ...leaveForm, id: req.id, status: 'pending', created_at: new Date().toISOString() } as any, ...prev]);
      setShowLeaveCreate(false);
      setLeaveForm({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', days: '', reason: '' });
    } catch (err: any) { alert(err.message); }
    finally { setCreating(false); }
  }

  async function loadMyLeaves() {
    setMyLeavesLoading(true);
    try {
      const data = await api.get('/api/hr/my-leave-requests');
      setMyLeaves(Array.isArray(data) ? data : []);
      setNoLinkedEmployee(false);
    } catch (err: any) {
      if (err.message?.includes('404') || err.status === 404) {
        setNoLinkedEmployee(true);
        setMyLeaves([]);
      } else {
        setMyLeaves([]);
      }
    } finally {
      setMyLeavesLoading(false);
    }
  }

  async function createMyLeave(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const req = await api.post('/api/hr/my-leave-requests', {
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        days: parseFloat(leaveForm.days) || 1,
        reason: leaveForm.reason || undefined,
      });
      setShowLeaveCreate(false);
      setLeaveForm({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', days: '', reason: '' });
      loadMyLeaves();
    } catch (err: any) {
      if (err.message?.includes('404') || err.status === 404) {
        setNoLinkedEmployee(true);
      }
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function approveLeave(id: string) {
    try {
      await api.patch(`/api/hr/leave-requests/${id}/approve`, {});
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'approved' } : l));
    } catch (err: any) { alert(err.message); }
  }

  async function rejectLeave(id: string) {
    if (!confirm(tHr('confirmReject'))) return;
    try {
      await api.patch(`/api/hr/leave-requests/${id}/reject`, {});
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'rejected' } : l));
    } catch (err: any) { alert(err.message); }
  }

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployee) return;
    setSaving(true);
    try {
      await api.patch(`/api/hr/employees/${selectedEmployee.id}`, editForm);
      const posName = positions.find((p: any) => p.id === editForm.position_id)?.name || selectedEmployee.position_name || '';
      const deptName = departments.find((d: any) => d.id === editForm.department_id)?.name || selectedEmployee.department_name || '';
      const updated = { ...selectedEmployee, ...editForm, position_name: posName, department_name: deptName };
      setSelectedEmployee(updated);
      setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
      setEditingEmployee(false);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function createDept(e: React.FormEvent) {
    e.preventDefault();
    try {
      const params = new URLSearchParams({ name: deptForm.name });
      if (deptForm.parent_id) params.set('parent_id', deptForm.parent_id);
      const d = await api.post(`/api/hr/departments?${params}`, {});
      setDepartments(prev => [...prev, { id: d.id, name: deptForm.name, parent_id: deptForm.parent_id || null }]);
      setShowCreateDept(false);
      setDeptForm({ name: '', parent_id: '' });
    } catch (err: any) { alert(err.message); }
  }

  async function saveDept(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDept) return;
    setSaving(true);
    try {
      const params = new URLSearchParams({ name: deptForm.name });
      await api.patch(`/api/hr/departments/${selectedDept.id}?${params}`, {});
      const updated = { ...selectedDept, name: deptForm.name };
      setDepartments(prev => prev.map(d => d.id === selectedDept.id ? updated : d));
      setSelectedDept(updated);
      setEditingDept(false);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function deleteDept(id: string) {
    if (!confirm(tHr('confirmDeleteDept'))) return;
    try {
      await api.delete(`/api/hr/departments/${id}`);
      setDepartments(prev => prev.filter(d => d.id !== id));
      setSelectedDept(null);
    } catch (err: any) { alert(err.message); }
  }

  const empCols: Column<any>[] = [
    { key: 'full_name', label: tCommon('name') },
    { key: 'email', label: tCommon('email') },
    { key: 'position_name', label: tHr('colPositionName'), render: v => v ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={{ background: '#ede9fe', color: '#7c3aed' }}>{v}</span>
    ) : <span style={{ color: '#9B9A97' }}>—</span> },
    { key: 'employment_type', label: tCommon('type'), render: v => String(v || '').replace('_', ' ') },
    { key: 'status', label: tCommon('status'), type: 'status', render: v => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${v === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{v}</span>
    )},
  ];

  const deptCols: Column<Department>[] = [
    { key: 'name', label: tHr('colDepartment') },
    { key: 'code', label: tHr('colCode'), type: 'mono' },
    { key: 'manager_name', label: tHr('colManager') },
    { key: 'budget', label: tHr('colBudget'), render: v => v ? `$${Number(v).toLocaleString()}` : '—' },
  ];

  const LEAVE_TYPE_LABELS: Record<string, string> = {
    annual: tHr('leaveTypeAnnual'), sick: tHr('leaveTypeSick'),
    personal: tHr('leaveTypePersonal'), maternity: tHr('leaveTypeMaternity'),
    other: tHr('leaveTypeOther'),
  };
  const leaveStatusLabel = (s: string) => ({ pending: tHr('statusPending'), approved: tHr('statusApproved'), rejected: tHr('statusRejected') }[s] || s);

  const leaveMgmtCols: Column<Leave>[] = [
    { key: 'employee_name' as any, label: tHr('colApplicant'), render: (v: any, row: any) => v || getEmployeeName(row.employee_id) },
    { key: 'leave_type', label: tCommon('type'), render: v => LEAVE_TYPE_LABELS[v] || (String(v).charAt(0).toUpperCase() + String(v).slice(1)) },
    { key: 'start_date', label: tHr('colStart') },
    { key: 'end_date', label: tHr('colEnd') },
    { key: 'days', label: tHr('colDays') },
    { key: 'status', label: tCommon('status'), type: 'status', render: (v: any) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${LEAVE_STATUS_COLORS[v] || ''}`}>{leaveStatusLabel(v)}</span>
    )},
    { key: 'approver_name' as any, label: tHr('colApprover'), render: (v: any) => v || '—' },
  ];

  const myLeaveCols: Column<Leave>[] = [
    { key: 'leave_type', label: tCommon('type'), render: v => LEAVE_TYPE_LABELS[v] || (String(v).charAt(0).toUpperCase() + String(v).slice(1)) },
    { key: 'start_date', label: tHr('colStart') },
    { key: 'end_date', label: tHr('colEnd') },
    { key: 'days', label: tHr('colDays') },
    { key: 'status', label: tCommon('status'), type: 'status', render: (v: any) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${LEAVE_STATUS_COLORS[v] || ''}`}>{leaveStatusLabel(v)}</span>
    )},
    { key: 'reason', label: tHr('reason'), render: (v: any) => v || '—' },
  ];

  const TAB_LABELS: Record<string, string> = {
    employees: tHr('tabEmployees'),
    departments: tHr('tabDepartments'),
    leave: tHr('tabLeave'),
    tasks: tHr('tabTasks'),
    conversations: tHr('tabConversations'),
  };

  async function loadConversations() {
    if (convList.length > 0) return; // already loaded
    setConvLoading(true);
    try {
      const data = await api.get('/api/messages/admin/conversations');
      setConvList(data);
    } catch (err: any) {
      alert(err.message || tHr('cannotLoadConv'));
    } finally {
      setConvLoading(false);
    }
  }

  async function loadThread(conv: any) {
    setSelectedConv(conv);
    setConvThread([]);
    setConvThreadLoading(true);
    try {
      const data = await api.get(`/api/messages/admin/thread/${conv.uid_a}/${conv.uid_b}`);
      setConvThread(data);
    } catch {
      setConvThread([]);
    } finally {
      setConvThreadLoading(false);
    }
  }

  function downloadConvCSV() {
    const apiBase = getApiUrl();
    const url = `${apiBase}/api/messages/admin/export`;
    fetch(url, { headers: getAuthHeaders() })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `conversations_all_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert(tHr('downloadFailed')));
  }

  function downloadFilteredCSV(filtered: any[]) {
    const rows = [[tHr('csvHeaderUserA'), tHr('csvHeaderEmailA'), tHr('csvHeaderUserB'), tHr('csvHeaderEmailB'), tHr('csvHeaderMsgCount'), tHr('csvHeaderLastActive')]];
    filtered.forEach(c => {
      rows.push([c.name_a || '', c.email_a || '', c.name_b || '', c.email_b || '',
        String(c.total_messages), c.last_at ? new Date(c.last_at).toLocaleString('zh-CN') : '']);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `conversations_filtered_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function downloadThreadTxt() {
    if (!selectedConv || convThread.length === 0) return;
    const header = `${tHr('convRecord')} — ${selectedConv.name_a || selectedConv.email_a} ↔ ${selectedConv.name_b || selectedConv.email_b}\n${tHr('exportTime')}: ${new Date().toISOString()}\n${'─'.repeat(60)}\n\n`;
    const body = convThread.map(m => {
      const time = m.created_at ? new Date(m.created_at).toLocaleString('zh-CN') : '';
      const sender = m.from_name || m.from_email || '—';
      return `[${time}] ${sender}:\n${m.content}\n`;
    }).join('\n');
    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const fn = `${selectedConv.name_a || 'A'}_${selectedConv.name_b || 'B'}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.download = fn;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  if (loading) return <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</div>;

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="px-8 pt-8 pb-4">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--notion-text)' }}>{tHr('title')}</h1>
        <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tHr('employeesCount', { n: employees.length })}</p>
      </div>

      {/* Toolbar */}
      <div className="px-8 pb-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--notion-active)' }}>
          {(['employees', 'departments', 'leave', 'tasks', ...(isAdmin ? ['conversations' as const] : [])] as const).map(tabKey => (
            <button key={tabKey} onClick={() => { setTab(tabKey); if (tabKey === 'conversations') loadConversations(); if (tabKey === 'leave' && leaveView === 'my' && myLeaves.length === 0 && !myLeavesLoading) loadMyLeaves(); }}
              className="px-3 py-1 rounded text-sm font-medium transition-colors"
              style={{
                background: tab === tabKey ? 'white' : 'transparent',
                color: tab === tabKey ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                boxShadow: tab === tabKey ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {TAB_LABELS[tabKey]}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          {tab === 'employees' && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white transition-opacity"
              style={{ background: 'var(--notion-accent)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {tHr('newEmployee')}
            </button>
          )}
          {tab === 'departments' && (
            <button onClick={() => setShowCreateDept(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white transition-opacity"
              style={{ background: 'var(--notion-accent)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {tHr('newDept')}
            </button>
          )}
          {tab === 'leave' && (
            <button onClick={() => setShowLeaveCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white transition-opacity"
              style={{ background: 'var(--notion-accent)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {leaveView === 'my' ? tHr('submitLeave') : tHr('newRequest')}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-4">
        {tab === 'employees' && (
          <NotionTable columns={empCols} data={employees} onRowClick={setSelectedEmployee}
            onCreate={() => setShowCreate(true)} createLabel={tHr('createEmpLabel')} emptyMessage={tHr('emptyEmployees')} />
        )}
        {tab === 'departments' && (
          <NotionTable columns={deptCols} data={departments} emptyMessage={tHr('emptyDepts')}
            onRowClick={d => { setSelectedDept(d); setEditingDept(false); }}
            onCreate={() => setShowCreateDept(true)} createLabel={tHr('createDeptLabel')} />
        )}
        {tab === 'leave' && (() => {
          const viewData = leaveView === 'my' ? myLeaves : leaves;
          const pending = viewData.filter(l => l.status === 'pending').length;
          const approved = viewData.filter(l => l.status === 'approved').length;
          const rejected = viewData.filter(l => l.status === 'rejected').length;

          return (
            <div className="space-y-4">
              {/* Sub-tab bar */}
              <div className="flex items-center gap-4">
                <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--notion-active)' }}>
                  <button onClick={() => { setLeaveView('my'); if (myLeaves.length === 0) loadMyLeaves(); }}
                    className="px-3 py-1 rounded text-sm font-medium transition-colors"
                    style={{
                      background: leaveView === 'my' ? 'white' : 'transparent',
                      color: leaveView === 'my' ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                      boxShadow: leaveView === 'my' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    {tHr('myLeave')}
                  </button>
                  {isAdmin && (
                    <button onClick={() => setLeaveView('management')}
                      className="px-3 py-1 rounded text-sm font-medium transition-colors"
                      style={{
                        background: leaveView === 'management' ? 'white' : 'transparent',
                        color: leaveView === 'management' ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                        boxShadow: leaveView === 'management' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      }}>
                      {tHr('leaveManagement')}
                    </button>
                  )}
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: tHr('totalRequests'), value: viewData.length, color: 'var(--notion-text)', bg: 'var(--notion-hover)' },
                  { label: tHr('pendingRequests'), value: pending, color: '#d97706', bg: '#fef3c7' },
                  { label: tHr('approvedRequests'), value: approved, color: '#059669', bg: '#d1fae5' },
                  { label: tHr('rejectedRequests'), value: rejected, color: '#dc2626', bg: '#fee2e2' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center"
                    style={{ background: s.bg, border: '1px solid var(--notion-border)' }}>
                    <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#9B9A97' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* My Leave view */}
              {leaveView === 'my' && (
                noLinkedEmployee ? (
                  <div className="py-12 text-center rounded-xl" style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
                    <p className="text-sm" style={{ color: '#9B9A97' }}>{tHr('noLinkedEmployee')}</p>
                  </div>
                ) : myLeavesLoading ? (
                  <div className="py-12 text-center text-sm" style={{ color: '#9B9A97' }}>{tCommon('loading')}</div>
                ) : (
                  <NotionTable columns={myLeaveCols} data={myLeaves} statusColors={LEAVE_STATUS_COLORS}
                    onCreate={() => setShowLeaveCreate(true)} createLabel={tHr('submitLeave')} emptyMessage={tHr('myLeaveEmpty')} />
                )
              )}

              {/* Leave Management view (admin) */}
              {leaveView === 'management' && (
                <NotionTable columns={leaveMgmtCols} data={leaves} statusColors={LEAVE_STATUS_COLORS}
                  onCreate={() => setShowLeaveCreate(true)} createLabel={tHr('createLeaveLabel')} emptyMessage={tHr('emptyLeave')}
                  rowActions={row => row.status === 'pending' ? (
                    <div className="flex gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); approveLeave(row.id); }}
                        className="px-2 py-1 rounded text-xs transition-colors"
                        style={{ color: '#16a34a', background: '#f0fdf4' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#dcfce7')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#f0fdf4')}>
                        {tHr('approve')}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); rejectLeave(row.id); }}
                        className="px-2 py-1 rounded text-xs transition-colors"
                        style={{ color: '#dc2626', background: '#fee2e2' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#fecaca')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fee2e2')}>
                        {tHr('reject')}
                      </button>
                    </div>
                  ) : null}
                />
              )}
            </div>
          );
        })()}
        {tab === 'tasks' && (
          <UserTasksTab
            users={tenantUsers}
            allTasks={allTasks}
            onSelectUser={setSelectedUserForTasks}
            tHr={tHr}
          />
        )}

        {tab === 'conversations' && (() => {
          // ── computed filter + sort ──────────────────────────────────────────
          const activeFilterCount = [convFilterUser, convDateFrom, convDateTo, convMinMsgs].filter(Boolean).length;

          const filteredConvList = convList
            .filter(c => {
              const q = convSearch.trim().toLowerCase();
              if (q && ![(c.name_a||''),(c.email_a||''),(c.name_b||''),(c.email_b||'')]
                .some(s => s.toLowerCase().includes(q))) return false;
              if (convFilterUser && c.uid_a !== convFilterUser && c.uid_b !== convFilterUser) return false;
              if (convDateFrom && c.last_at && new Date(c.last_at) < new Date(convDateFrom)) return false;
              if (convDateTo && c.last_at && new Date(c.last_at) > new Date(convDateTo + 'T23:59:59')) return false;
              if (convMinMsgs && Number(c.total_messages) < Number(convMinMsgs)) return false;
              return true;
            })
            .sort((a, b) => {
              if (convSortBy === 'most')  return Number(b.total_messages) - Number(a.total_messages);
              if (convSortBy === 'least') return Number(a.total_messages) - Number(b.total_messages);
              if (convSortBy === 'name')  return (a.name_a||a.email_a||'').localeCompare(b.name_a||b.email_a||'');
              return new Date(b.last_at||0).getTime() - new Date(a.last_at||0).getTime();
            });

          // unique users for filter dropdown
          const userMap = new Map<string, string>();
          convList.forEach(c => {
            if (!userMap.has(c.uid_a)) userMap.set(c.uid_a, c.name_a||c.email_a||c.uid_a);
            if (!userMap.has(c.uid_b)) userMap.set(c.uid_b, c.name_b||c.email_b||c.uid_b);
          });
          const allConvUsers = Array.from(userMap.entries()).sort((a,b) => a[1].localeCompare(b[1]));

          // stats
          const totalMsgs = convList.reduce((s,c) => s + Number(c.total_messages), 0);
          const userTotals = new Map<string, { name: string; count: number }>();
          convList.forEach(c => {
            const n = Number(c.total_messages);
            const half = Math.ceil(n / 2);
            userTotals.set(c.uid_a, { name: c.name_a||c.email_a||'?', count: (userTotals.get(c.uid_a)?.count||0) + half });
            userTotals.set(c.uid_b, { name: c.name_b||c.email_b||'?', count: (userTotals.get(c.uid_b)?.count||0) + (n - half) });
          });
          const topUsers = Array.from(userTotals.values()).sort((a,b)=>b.count-a.count).slice(0,6);
          const maxUserCount = topUsers[0]?.count || 1;
          const topConvs = [...convList].sort((a,b)=>Number(b.total_messages)-Number(a.total_messages)).slice(0,5);

          const SORT_LABELS: Record<string, string> = {
            last_at: tHr('sortRecentActive'), most: tHr('sortMostMessages'), least: tHr('sortLeastMessages'), name: tHr('sortNameAZ'),
          };

          return (
          <div className="flex flex-col gap-0" style={{ height: '100%' }}>

            {/* ── Sub-toolbar ── */}
            <div className="flex items-center gap-2 mb-3 flex-wrap relative">

              {/* Search */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)', minWidth: 180, maxWidth: 240 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input value={convSearch} onChange={e => setConvSearch(e.target.value)}
                  placeholder={tHr('searchUserOrEmail')} className="flex-1 text-xs outline-none bg-transparent"
                  style={{ color: 'var(--notion-text)', minWidth: 0 }} />
                {convSearch && (
                  <button onClick={() => setConvSearch('')} style={{ color: '#9B9A97', lineHeight: 1 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Filter */}
              <div className="relative">
                <button
                  onClick={() => { setConvShowFilter(v=>!v); setConvShowSort(false); setConvShowDownload(false); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: (convShowFilter||activeFilterCount>0) ? '#ede9fe' : 'var(--notion-active)',
                    color: (convShowFilter||activeFilterCount>0) ? '#7c3aed' : 'var(--notion-text-muted)',
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                  {tHr('filter')}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </button>
                {convShowFilter && (
                  <div className="absolute top-full left-0 mt-1 rounded-xl shadow-xl z-50 p-4 space-y-3"
                    style={{ width: 280, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{tHr('filterConditions')}</p>

                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('filterUser')}</label>
                      <select value={convFilterUser} onChange={e => setConvFilterUser(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-card, white)' }}>
                        <option value="">{tHr('allUsers')}</option>
                        {allConvUsers.map(([uid, name]) => (
                          <option key={uid} value={uid}>{name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('startDateLabel')}</label>
                        <input type="date" value={convDateFrom} onChange={e => setConvDateFrom(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('endDateLabel')}</label>
                        <input type="date" value={convDateTo} onChange={e => setConvDateTo(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('minMessages')}</label>
                      <input type="number" min="1" value={convMinMsgs} onChange={e => setConvMinMsgs(e.target.value)}
                        placeholder={tHr('minMsgPlaceholder')}
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setConvFilterUser(''); setConvDateFrom(''); setConvDateTo(''); setConvMinMsgs(''); }}
                        className="flex-1 py-1.5 rounded-lg text-xs transition-colors"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--notion-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        {tHr('clearAll')}
                      </button>
                      <button onClick={() => setConvShowFilter(false)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white"
                        style={{ background: '#7c3aed' }}>
                        {tHr('done')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sort */}
              <div className="relative">
                <button
                  onClick={() => { setConvShowSort(v=>!v); setConvShowFilter(false); setConvShowDownload(false); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: (convShowSort||convSortBy!=='last_at') ? '#ede9fe' : 'var(--notion-active)',
                    color: (convShowSort||convSortBy!=='last_at') ? '#7c3aed' : 'var(--notion-text-muted)',
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  {SORT_LABELS[convSortBy]}
                </button>
                {convShowSort && (
                  <div className="absolute top-full left-0 mt-1 rounded-xl shadow-xl z-50 py-1.5"
                    style={{ width: 180, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                    {(['last_at','most','least','name'] as const).map(k => (
                      <button key={k} onClick={() => { setConvSortBy(k); setConvShowSort(false); }}
                        className="w-full text-left px-4 py-2 text-xs transition-colors flex items-center gap-2"
                        style={{ color: convSortBy===k ? '#7c3aed' : 'var(--notion-text)' }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--notion-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        {convSortBy===k && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        {convSortBy!==k && <span style={{ width: 10 }}/>}
                        {SORT_LABELS[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* View mode */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--notion-active)' }}>
                {([['list',tHr('viewList')],['table',tHr('viewTable')],['stats',tHr('viewStats')]] as [string, string][]).map(([mode, label]) => (
                  <button key={mode} onClick={() => setConvViewMode(mode as 'list' | 'table' | 'stats')}
                    className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                    style={{
                      background: convViewMode===mode ? 'white' : 'transparent',
                      color: convViewMode===mode ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                      boxShadow: convViewMode===mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Download dropdown */}
              <div className="relative ml-auto">
                <button
                  onClick={() => { setConvShowDownload(v=>!v); setConvShowFilter(false); setConvShowSort(false); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: '#ede9fe', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {tHr('download')}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {convShowDownload && (
                  <div className="absolute top-full right-0 mt-1 rounded-xl shadow-xl z-50 py-1.5"
                    style={{ width: 220, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                    <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{tHr('downloadOptions')}</p>
                    {[
                      { label: tHr('downloadAllCSV'), sub: tHr('downloadAllSub', { n: convList.length }), onClick: () => { downloadConvCSV(); setConvShowDownload(false); }, icon: 'mailbox' },
                      { label: tHr('downloadFilteredCSV'), sub: tHr('downloadFilteredSub', { n: filteredConvList.length }), onClick: () => { downloadFilteredCSV(filteredConvList); setConvShowDownload(false); }, icon: 'magnifier' },
                      ...(selectedConv && convThread.length > 0 ? [{ label: tHr('downloadThreadTXT'), sub: tHr('downloadThreadSub', { n: convThread.length }), onClick: () => { downloadThreadTxt(); setConvShowDownload(false); }, icon: 'chat-bubble' }] : []),
                    ].map(item => (
                      <button key={item.label} onClick={item.onClick}
                        className="w-full text-left px-4 py-2.5 transition-colors flex items-start gap-2.5"
                        onMouseEnter={e => e.currentTarget.style.background='var(--notion-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        <HandIcon name={item.icon} size={14} />
                        <div>
                          <div className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{item.label}</div>
                          <div className="text-[10px]" style={{ color: '#9B9A97' }}>{item.sub}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Active filter banner ── */}
            {(activeFilterCount > 0 || convSearch) && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs"
                style={{ background: '#ede9fe', color: '#7c3aed' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                {tHr('showingConv')} <strong>{filteredConvList.length}</strong> {tHr('ofConv', { n: convList.length })}
                {convFilterUser && <span className="px-2 py-0.5 rounded-full bg-white text-[10px]" style={{ color: '#7c3aed' }}>{tHr('filterUserChip', { name: userMap.get(convFilterUser) || '' })}</span>}
                {convDateFrom && <span className="px-2 py-0.5 rounded-full bg-white text-[10px]" style={{ color: '#7c3aed' }}>{tHr('fromChip', { d: convDateFrom })}</span>}
                {convDateTo   && <span className="px-2 py-0.5 rounded-full bg-white text-[10px]" style={{ color: '#7c3aed' }}>{tHr('toChip', { d: convDateTo })}</span>}
                {convMinMsgs  && <span className="px-2 py-0.5 rounded-full bg-white text-[10px]" style={{ color: '#7c3aed' }}>{tHr('minMsgChip', { n: convMinMsgs })}</span>}
                <button onClick={() => { setConvSearch(''); setConvFilterUser(''); setConvDateFrom(''); setConvDateTo(''); setConvMinMsgs(''); }}
                  className="ml-auto px-2 py-0.5 rounded-full bg-white text-[10px] font-medium transition-colors"
                  style={{ color: '#7c3aed' }}
                  onMouseEnter={e => e.currentTarget.style.background='#ddd6fe'}
                  onMouseLeave={e => e.currentTarget.style.background='white'}>
                  {tHr('clearAll')}
                </button>
              </div>
            )}

            {/* ── LIST VIEW ── */}
            {convViewMode === 'list' && (
              <div className="flex gap-4" style={{ flex: 1, minHeight: 0 }}>

                {/* Left: conversation list */}
                <div className="flex flex-col rounded-xl overflow-hidden flex-shrink-0"
                  style={{ width: 320, border: '1px solid var(--notion-border)' }}>
                  <div className="grid text-[10px] font-semibold uppercase tracking-wider px-4 py-2"
                    style={{ gridTemplateColumns: '1fr 50px', background: 'var(--notion-hover)', color: '#9B9A97', borderBottom: '1px solid var(--notion-border)' }}>
                    <span>{tHr('convParties')}</span><span className="text-right">{tHr('msgCount')}</span>
                  </div>
                  <div className="flex-1 overflow-auto">
                    {convLoading ? (
                      <div className="py-12 text-center text-sm" style={{ color: '#9B9A97' }}>{tHr('loadingText')}</div>
                    ) : filteredConvList.length === 0 ? (
                      <div className="py-12 text-center text-sm" style={{ color: '#9B9A97' }}>{tHr('noMatchingConv')}</div>
                    ) : filteredConvList.map(conv => {
                      const isSel = selectedConv?.uid_a===conv.uid_a && selectedConv?.uid_b===conv.uid_b;
                      const lastAt = conv.last_at ? new Date(conv.last_at).toLocaleDateString('zh-CN',{month:'short',day:'numeric'}) : '';
                      return (
                        <div key={`${conv.uid_a}-${conv.uid_b}`} onClick={() => loadThread(conv)}
                          className="px-4 py-3 cursor-pointer transition-colors"
                          style={{ background: isSel?'#ede9fe':'white', borderBottom:'1px solid var(--notion-border)', borderLeft: isSel?'3px solid #7c3aed':'3px solid transparent' }}
                          onMouseEnter={e => { if (!isSel) e.currentTarget.style.background='var(--notion-hover)'; }}
                          onMouseLeave={e => { if (!isSel) e.currentTarget.style.background='white'; }}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: '#7c3aed' }}>
                                {(conv.name_a||conv.email_a||'?')[0].toUpperCase()}
                              </div>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: '#0F9D58' }}>
                                {(conv.name_b||conv.email_b||'?')[0].toUpperCase()}
                              </div>
                              <span className="text-xs font-medium truncate" style={{ color: isSel?'#7c3aed':'var(--notion-text)' }}>
                                {conv.name_a||conv.email_a} ↔ {conv.name_b||conv.email_b}
                              </span>
                            </div>
                            <span className="text-[10px] flex-shrink-0 ml-1 tabular-nums font-semibold px-1.5 py-0.5 rounded-full" style={{ color:'#7c3aed', background:'#ede9fe' }}>
                              {conv.total_messages}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] truncate flex-1" style={{ color:'#9B9A97' }}>{conv.last_content||'—'}</p>
                            <span className="text-[10px] flex-shrink-0 ml-1" style={{ color:'#9B9A97' }}>{lastAt}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: thread */}
                <div className="flex-1 flex flex-col rounded-xl overflow-hidden" style={{ border:'1px solid var(--notion-border)', minWidth:0 }}>
                  {!selectedConv ? (
                    <div className="flex-1 flex items-center justify-center flex-col gap-3" style={{ color:'#9B9A97' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span className="text-sm">{tHr('selectConvToView')}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
                        style={{ borderBottom:'1px solid var(--notion-border)', background:'var(--notion-hover)' }}>
                        {[
                          { uid: selectedConv.uid_a, name: selectedConv.name_a, email: selectedConv.email_a, color: '#7c3aed' },
                          null,
                          { uid: selectedConv.uid_b, name: selectedConv.name_b, email: selectedConv.email_b, color: '#0F9D58' },
                        ].map((u, i) => u === null ? (
                          <svg key="arr" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2">
                            <path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/>
                          </svg>
                        ) : (
                          <div key={u.uid} className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: u.color }}>
                              {(u.name||u.email||'?')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs font-semibold" style={{ color:'var(--notion-text)' }}>{u.name||'—'}</div>
                              <div className="text-[10px]" style={{ color:'#9B9A97' }}>{u.email}</div>
                            </div>
                          </div>
                        ))}
                        <div className="ml-auto text-[11px] px-2 py-0.5 rounded-full" style={{ background:'#ede9fe', color:'#7c3aed' }}>
                          {tHr('totalMessages', { n: selectedConv.total_messages })}
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
                        {convThreadLoading ? (
                          <div className="py-12 text-center text-sm" style={{ color:'#9B9A97' }}>{tHr('loadingText')}</div>
                        ) : convThread.map((msg, idx) => {
                          const isA = msg.from_user_id === selectedConv.uid_a;
                          const name = msg.from_name||msg.from_email||'—';
                          const prev = convThread[idx-1];
                          const showHead = !prev || prev.from_user_id !== msg.from_user_id;
                          const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
                          return (
                            <div key={msg.id} className={`flex gap-2.5 ${isA?'':'flex-row-reverse'}`}>
                              {showHead
                                ? <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: isA?'#7c3aed':'#0F9D58' }}>{name[0]?.toUpperCase()}</div>
                                : <div className="w-7 flex-shrink-0" />}
                              <div className={`flex flex-col max-w-[65%] ${isA?'items-start':'items-end'}`}>
                                {showHead && <span className="text-[10px] mb-1" style={{ color:'#9B9A97' }}>{name} · {timeStr}</span>}
                                <div className="px-3 py-2 text-sm" style={{
                                  background: isA?'#ede9fe':'#f0fdf4', color:'var(--notion-text)',
                                  borderRadius: isA?'4px 14px 14px 14px':'14px 4px 14px 14px',
                                  wordBreak:'break-word', maxWidth:'100%',
                                }}>{msg.content}</div>
                                {!msg.is_read && <span className="text-[9px] mt-0.5" style={{ color:'#9B9A97' }}>{tHr('unread')}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── TABLE VIEW ── */}
            {convViewMode === 'table' && (
              <div className="rounded-xl overflow-hidden" style={{ border:'1px solid var(--notion-border)', flex:1, overflowY:'auto' }}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr style={{ background:'var(--notion-hover)', borderBottom:'1px solid var(--notion-border)' }}>
                      {[tHr('colUserA'), tHr('colEmailA'), tHr('colUserB'), tHr('colEmailB'), tHr('colMsgCount'), tHr('colLastActive'), tHr('colActions')].map((h: string) => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color:'#9B9A97', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {convLoading ? (
                      <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color:'#9B9A97' }}>{tHr('loadingText')}</td></tr>
                    ) : filteredConvList.length === 0 ? (
                      <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color:'#9B9A97' }}>{tHr('noMatchingResults')}</td></tr>
                    ) : filteredConvList.map(conv => {
                      const isSel = selectedConv?.uid_a===conv.uid_a && selectedConv?.uid_b===conv.uid_b;
                      return (
                        <tr key={`${conv.uid_a}-${conv.uid_b}`}
                          style={{ borderBottom:'1px solid var(--notion-border)', background: isSel?'#faf5ff':'white', cursor:'pointer' }}
                          onMouseEnter={e => { if (!isSel) e.currentTarget.style.background='var(--notion-hover)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isSel?'#faf5ff':'white'; }}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background:'#7c3aed' }}>
                                {(conv.name_a||conv.email_a||'?')[0].toUpperCase()}
                              </div>
                              <span className="text-xs font-medium" style={{ color:'var(--notion-text)' }}>{conv.name_a||'—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color:'#9B9A97' }}>{conv.email_a||'—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background:'#0F9D58' }}>
                                {(conv.name_b||conv.email_b||'?')[0].toUpperCase()}
                              </div>
                              <span className="text-xs font-medium" style={{ color:'var(--notion-text)' }}>{conv.name_b||'—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color:'#9B9A97' }}>{conv.email_b||'—'}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full" style={{ background:'#ede9fe', color:'#7c3aed' }}>
                              {conv.total_messages}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color:'#9B9A97' }}>
                            {conv.last_at ? new Date(conv.last_at).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => { loadThread(conv); setConvViewMode('list'); }}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                              style={{ background:'#ede9fe', color:'#7c3aed' }}
                              onMouseEnter={e => e.currentTarget.style.background='#ddd6fe'}
                              onMouseLeave={e => e.currentTarget.style.background='#ede9fe'}>
                              {tHr('viewConv')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── STATS VIEW ── */}
            {convViewMode === 'stats' && (
              <div className="flex-1 overflow-auto space-y-5">
                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: tHr('statConvPairs'), value: convList.length, sub: tHr('statFiltered', { n: filteredConvList.length }), color:'#7c3aed', bg:'#ede9fe' },
                    { label: tHr('statTotalMsgs'), value: totalMsgs, sub: tHr('statTotalMsgsSub'), color:'#1d6fa8', bg:'#e8f4fd' },
                    { label: tHr('statAvgMsgs'), value: convList.length ? Math.round(totalMsgs/convList.length) : 0, sub: tHr('statAvgMsgsSub'), color:'#0F9D58', bg:'#e8f5e9' },
                    { label: tHr('statActiveUsers'), value: userMap.size, sub: tHr('statActiveUsersSub'), color:'#d97706', bg:'#fef3c7' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-4 flex flex-col gap-1"
                      style={{ border:'1px solid var(--notion-border)', background:'white' }}>
                      <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                      <div className="text-xs font-semibold" style={{ color:'var(--notion-text)' }}>{s.label}</div>
                      <div className="text-[10px]" style={{ color:'#9B9A97' }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Top users bar chart */}
                  <div className="rounded-xl p-5" style={{ border:'1px solid var(--notion-border)', background:'white' }}>
                    <p className="text-xs font-semibold mb-4" style={{ color:'var(--notion-text)' }}>{tHr('topUsersTitle', { n: topUsers.length })}</p>
                    {topUsers.length === 0 ? (
                      <p className="text-sm text-center py-6" style={{ color:'#9B9A97' }}>{tHr('noData')}</p>
                    ) : topUsers.map((u, i) => (
                      <div key={u.name} className="flex items-center gap-2.5 mb-3">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                          style={{ background: ['#7c3aed','#2F80ED','#0F9D58','#d97706','#EB5757','#9B9A97'][i] }}>
                          {i+1}
                        </div>
                        <span className="text-xs w-24 truncate flex-shrink-0" style={{ color:'var(--notion-text)' }}>{u.name}</span>
                        <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background:'#F1F1EF' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width:`${Math.round((u.count/maxUserCount)*100)}%`, background: ['#7c3aed','#2F80ED','#0F9D58','#d97706','#EB5757','#9B9A97'][i] }} />
                        </div>
                        <span className="text-[11px] tabular-nums font-semibold w-8 text-right flex-shrink-0" style={{ color:'#9B9A97' }}>{u.count}</span>
                      </div>
                    ))}
                  </div>

                  {/* Top conversations */}
                  <div className="rounded-xl p-5" style={{ border:'1px solid var(--notion-border)', background:'white' }}>
                    <p className="text-xs font-semibold mb-4" style={{ color:'var(--notion-text)' }}>{tHr('topConvsTitle', { n: topConvs.length })}</p>
                    {topConvs.length === 0 ? (
                      <p className="text-sm text-center py-6" style={{ color:'#9B9A97' }}>{tHr('noData')}</p>
                    ) : topConvs.map((conv, i) => {
                      const pct = Math.round((Number(conv.total_messages) / (Number(topConvs[0].total_messages)||1)) * 100);
                      return (
                        <div key={`${conv.uid_a}-${conv.uid_b}`} className="mb-3 cursor-pointer"
                          onClick={() => { loadThread(conv); setConvViewMode('list'); }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs truncate" style={{ color:'var(--notion-text)', maxWidth:'75%' }}>
                              <span className="font-medium">{conv.name_a||conv.email_a}</span>
                              <span style={{ color:'#9B9A97' }}> ↔ </span>
                              <span className="font-medium">{conv.name_b||conv.email_b}</span>
                            </span>
                            <span className="text-[11px] tabular-nums font-semibold" style={{ color:'#7c3aed' }}>{conv.total_messages}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'#F1F1EF' }}>
                            <div className="h-full rounded-full" style={{ width:`${pct}%`, background:'#7c3aed' }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[10px] mt-3" style={{ color:'#9B9A97' }}>{tHr('clickToViewInList')}</p>
                  </div>
                </div>
              </div>
            )}

          </div>
          );
        })()}
      </div>

      {/* User task detail SlideOver */}
      <SlideOver open={!!selectedUserForTasks} onClose={() => setSelectedUserForTasks(null)}
        title={selectedUserForTasks ? tHr('userTasks', { name: selectedUserForTasks.full_name || selectedUserForTasks.email }) : ''}>
        {selectedUserForTasks && (
          <UserTaskSlideOverContent user={selectedUserForTasks} allTasks={allTasks} tHr={tHr} />
        )}
      </SlideOver>

      {/* Employee detail SlideOver */}
      <SlideOver
        open={!!selectedEmployee}
        onClose={() => { setSelectedEmployee(null); setEditingEmployee(false); }}
        title={selectedEmployee?.full_name || tHr('employeeDetail')}
      >
        {selectedEmployee && (
          <div className="flex flex-col h-full">
            {/* Avatar + header */}
            <div className="px-6 pt-5 pb-4 flex items-center gap-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--notion-border)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', color: '#7c3aed' }}>
                {selectedEmployee.full_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate" style={{ color: 'var(--notion-text)' }}>
                  {selectedEmployee.full_name}
                </p>
                {selectedEmployee.position_name && (
                  <span className="inline-flex items-center mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    {selectedEmployee.position_name}
                  </span>
                )}
                {selectedEmployee.title && (
                  <p className="text-xs mt-0.5" style={{ color: '#9B9A97' }}>{selectedEmployee.title}</p>
                )}
              </div>
              {isAdmin && (
                <button
                  onClick={() => {
                    setEditForm({
                      full_name: selectedEmployee.full_name || '',
                      email: selectedEmployee.email || '',
                      phone: selectedEmployee.phone || '',
                      title: selectedEmployee.title || '',
                      position_id: selectedEmployee.position_id || null,
                      department_id: selectedEmployee.department_id || null,
                      employment_type: selectedEmployee.employment_type || 'full_time',
                      salary: selectedEmployee.salary ?? '',
                      currency: selectedEmployee.currency || 'USD',
                      status: selectedEmployee.status || 'active',
                    });
                    setEditingEmployee(v => !v);
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: editingEmployee ? '#ede9fe' : 'var(--notion-active)',
                    color: editingEmployee ? '#7c3aed' : 'var(--notion-text-muted)',
                    border: editingEmployee ? '1px solid #d8b4fe' : '1px solid transparent',
                  }}>
                  {editingEmployee ? `✕ ${tHr('cancelEdit')}` : <><HandIcon name="pencil" size={12} /> {tHr('editBtn')}</>}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3 px-6 py-4"
                style={{ borderBottom: '1px solid var(--notion-border)' }}>
                {[
                  { label: tHr('employeeNumber'), value: selectedEmployee.employee_number || '—' },
                  { label: tHr('startDate'), value: selectedEmployee.start_date ? new Date(selectedEmployee.start_date).toLocaleDateString() : '—' },
                  { label: tHr('labelStatus'), value: selectedEmployee.status === 'active' ? tHr('statusActive') : tHr('statusTerminated'), color: selectedEmployee.status === 'active' ? '#15803d' : '#dc2626' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center"
                    style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
                    <div className="text-sm font-semibold" style={{ color: (s as any).color || 'var(--notion-text)' }}>{s.value}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#9B9A97' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {editingEmployee && isAdmin ? (
                /* ── Edit Form ── */
                <form onSubmit={saveEmployee} className="px-6 py-4 space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{tHr('editEmployeeInfo')}</p>

                  {/* Name + Email */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelName')}</label>
                      <input required value={editForm.full_name}
                        onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelEmail')}</label>
                      <input type="email" value={editForm.email}
                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>
                  </div>

                  {/* Phone + Title */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelPhone')}</label>
                      <input value={editForm.phone}
                        onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelTitle')}</label>
                      <input value={editForm.title}
                        onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                        placeholder={tHr('titlePlaceholder')}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>
                  </div>

                  {/* Position + Department */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelPosition')}</label>
                      <select value={editForm.position_id ?? ''}
                        onChange={e => setEditForm({ ...editForm, position_id: e.target.value || null })}
                        className="w-full px-3 py-2 rounded-xl text-sm bg-white outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                        <option value="">{tHr('noneOption')}</option>
                        {positions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelDepartment')}</label>
                      <select value={editForm.department_id ?? ''}
                        onChange={e => setEditForm({ ...editForm, department_id: e.target.value || null })}
                        className="w-full px-3 py-2 rounded-xl text-sm bg-white outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                        <option value="">{tHr('noneOption')}</option>
                        {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Type + Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelEmploymentType')}</label>
                      <select value={editForm.employment_type}
                        onChange={e => setEditForm({ ...editForm, employment_type: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-sm bg-white outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                        <option value="full_time">{tHr('empFullTime')}</option>
                        <option value="part_time">{tHr('empPartTime')}</option>
                        <option value="contractor">{tHr('empContractor')}</option>
                        <option value="intern">{tHr('empIntern')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelStatus')}</label>
                      <select value={editForm.status}
                        onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-sm bg-white outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                        <option value="active">{tHr('statusActive')}</option>
                        <option value="terminated">{tHr('statusTerminated')}</option>
                      </select>
                    </div>
                  </div>

                  {/* Salary */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelSalary')}</label>
                      <input type="number" value={editForm.salary}
                        onChange={e => setEditForm({ ...editForm, salary: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('labelCurrency')}</label>
                      <select value={editForm.currency}
                        onChange={e => setEditForm({ ...editForm, currency: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-sm bg-white outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                        {['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button type="submit" disabled={saving}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 mt-2"
                    style={{ background: '#7c3aed' }}>
                    {saving ? tHr('saving') : <><HandIcon name="document-pen" size={14} /> {tHr('saveChanges')}</>}
                  </button>
                </form>
              ) : (
                /* ── View Mode ── */
                <div className="px-6 py-4 space-y-5">
                  {/* Basic info */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#9B9A97' }}>{tHr('basicInfo')}</p>
                    <div className="space-y-3">
                      {[
                        { label: tHr('labelEmail'),      value: selectedEmployee.email },
                        { label: tHr('labelPhone'),      value: selectedEmployee.phone },
                        { label: tHr('labelTitle'),      value: selectedEmployee.title },
                        { label: tHr('labelPosition'),   value: selectedEmployee.position_name },
                        { label: tHr('labelDepartment'), value: selectedEmployee.department_name },
                      ].map(row => row.value ? (
                        <div key={row.label} className="flex items-center justify-between py-1"
                          style={{ borderBottom: '1px solid var(--notion-border)' }}>
                          <span className="text-xs" style={{ color: '#9B9A97' }}>{row.label}</span>
                          <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{row.value}</span>
                        </div>
                      ) : null)}
                    </div>
                  </div>

                  {/* Employment info */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#9B9A97' }}>{tHr('employmentInfo')}</p>
                    <div className="space-y-3">
                      {[
                        { label: tHr('labelEmploymentType'), value: { full_time: tHr('empFullTime'), part_time: tHr('empPartTime'), contractor: tHr('empContractor'), intern: tHr('empIntern') }[selectedEmployee.employment_type as string] || selectedEmployee.employment_type },
                        { label: tHr('labelSalary'), value: selectedEmployee.salary ? `${Number(selectedEmployee.salary).toLocaleString()} ${selectedEmployee.currency || 'USD'}` : null },
                        { label: tHr('startDate'), value: selectedEmployee.start_date ? new Date(selectedEmployee.start_date).toLocaleDateString() : null },
                      ].map(row => row.value ? (
                        <div key={row.label} className="flex items-center justify-between py-1"
                          style={{ borderBottom: '1px solid var(--notion-border)' }}>
                          <span className="text-xs" style={{ color: '#9B9A97' }}>{row.label}</span>
                          <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{row.value}</span>
                        </div>
                      ) : null)}
                    </div>
                  </div>

                  {!isAdmin && (
                    <p className="text-xs text-center mt-4" style={{ color: '#9B9A97' }}>
                      {tHr('adminOnlyEdit')}
                    </p>
                  )}

                  {/* ── Lead History Section ── */}
                  {selectedEmployee.user_id && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#9B9A97' }}>
                        {tHr('leadRecords')}
                      </p>
                      {empLeadsLoading ? (
                        <div className="text-xs text-center py-6" style={{ color: '#9B9A97' }}>{tHr('loadingText')}</div>
                      ) : empLeads.length === 0 ? (
                        <div className="text-xs text-center py-6 rounded-xl"
                          style={{ color: '#9B9A97', background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
                          {tHr('noLeadRecords')}
                        </div>
                      ) : (() => {
                        const activeLeads = empLeads.filter(l => !l.is_cold && ACTIVE_STATUSES.has(l.status));
                        const closedLeads = empLeads.filter(l => !l.is_cold && CLOSED_STATUSES.has(l.status));
                        const coldLeads  = empLeads.filter(l => l.is_cold);

                        function LeadRow({ lead, dim }: { lead: any; dim?: boolean }) {
                          const cfg = LEAD_STATUS_COLORS[lead.status] ?? { color: '#374151', bg: '#f3f4f6' };
                          const statusLabel = tHr(LEAD_STATUS_LABEL_KEYS[lead.status] as any) || lead.status;
                          return (
                            <div
                              className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg cursor-pointer"
                              style={{ opacity: dim ? 0.6 : 1 }}
                              onClick={() => router.push(`/${tenant}/crm/customer-360/${lead.id}`)}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>
                                    {lead.full_name || '—'}
                                  </span>
                                  {lead.company && (
                                    <span className="text-xs truncate flex-shrink-0" style={{ color: '#9B9A97' }}>
                                      · {lead.company}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] mt-0.5" style={{ color: '#9B9A97' }}>
                                  {relativeTime(lead.updated_at)}
                                  {lead.contract_value ? ` · ${Number(lead.contract_value).toLocaleString()} ${lead.currency || ''}` : ''}
                                </div>
                              </div>
                              {lead.is_cold ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 inline-flex items-center gap-1"
                                  style={{ background: '#f3f4f6', color: '#6b7280' }}><HandIcon name="ice-cube" size={10} /> {tHr('coldLead')}</span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{ background: cfg.bg, color: cfg.color }}>{statusLabel}</span>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-3">
                            {/* Summary stats */}
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { label: tHr('allLeads'), value: empLeads.length, color: 'var(--notion-text)', bg: 'var(--notion-hover)' },
                                { label: tHr('inProgress'),   value: activeLeads.length, color: '#7c3aed', bg: '#ede9fe' },
                                { label: tHr('converted'),   value: closedLeads.length, color: '#059669', bg: '#d1fae5' },
                              ].map(s => (
                                <div key={s.label} className="rounded-xl py-2.5 text-center"
                                  style={{ background: s.bg, border: '1px solid var(--notion-border)' }}>
                                  <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                                  <div className="text-[10px] mt-0.5" style={{ color: '#9B9A97' }}>{s.label}</div>
                                </div>
                              ))}
                            </div>

                            {/* Active leads */}
                            {activeLeads.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-semibold" style={{ color: '#9B9A97' }}>{tHr('inProgress')}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                    style={{ background: '#ede9fe', color: '#7c3aed' }}>{activeLeads.length}</span>
                                </div>
                                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
                                  {activeLeads.map(l => <LeadRow key={l.id} lead={l} />)}
                                </div>
                              </div>
                            )}

                            {/* Closed leads */}
                            {closedLeads.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-semibold" style={{ color: '#9B9A97' }}>{tHr('converted')}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                    style={{ background: '#d1fae5', color: '#059669' }}>{closedLeads.length}</span>
                                </div>
                                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
                                  {closedLeads.map(l => <LeadRow key={l.id} lead={l} dim />)}
                                </div>
                              </div>
                            )}

                            {/* Cold leads */}
                            {coldLeads.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-semibold" style={{ color: '#9B9A97' }}>{tHr('coldLead')}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                    style={{ background: '#f3f4f6', color: '#6b7280' }}>{coldLeads.length}</span>
                                </div>
                                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
                                  {coldLeads.map(l => <LeadRow key={l.id} lead={l} dim />)}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {!selectedEmployee.user_id && (
                    <div className="text-xs text-center py-4 rounded-xl"
                      style={{ color: '#9B9A97', background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
                      <HandIcon name="link" size={12} /> {tHr('noLinkedAccount')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* Create Employee Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tHr('empModalTitle')}</h3>
            <form onSubmit={createEmployee} className="space-y-3">
              <input required placeholder={tHr('fullName')} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <input required type="email" placeholder={tHr('emailReq')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              {/* Position (职务) dropdown */}
              <select value={form.position_id} onChange={e => setForm({ ...form, position_id: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm bg-white" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                <option value="">{tHr('selectPosition')}</option>
                {positions.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_builtin ? ' ✦' : ''}</option>)}
              </select>
              {/* Optional freeform title within position */}
              <input placeholder={tHr('titleOptional')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm bg-white" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                <option value="">{tCommon('noDept')}</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm bg-white" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                {['full_time', 'part_time', 'contractor', 'intern'].map(tp => <option key={tp} value={tp}>{tp.replace('_', ' ')}</option>)}
              </select>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 py-2 rounded-md text-sm text-white disabled:opacity-50" style={{ background: 'var(--notion-accent)' }}>
                  {creating ? tCommon('creating') : tHr('addEmployee')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Department detail SlideOver */}
      <SlideOver
        open={!!selectedDept}
        onClose={() => { setSelectedDept(null); setEditingDept(false); }}
        title={selectedDept?.name || tHr('deptDetail')}
      >
        {selectedDept && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 flex items-center gap-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--notion-border)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', color: '#1d4ed8' }}>
                <HandIcon name="building" size={28} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate" style={{ color: 'var(--notion-text)' }}>{selectedDept.name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#9B9A97' }}>
                  {tHr('nEmployees', { n: employees.filter((e: any) => e.department_id === selectedDept.id).length })}
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => {
                    setDeptForm({ name: selectedDept.name, parent_id: selectedDept.parent_id || '' });
                    setEditingDept(v => !v);
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: editingDept ? '#ede9fe' : 'var(--notion-active)',
                    color: editingDept ? '#7c3aed' : 'var(--notion-text-muted)',
                    border: editingDept ? '1px solid #d8b4fe' : '1px solid transparent',
                  }}>
                  {editingDept ? `✕ ${tHr('cancelEdit')}` : <><HandIcon name="pencil" size={12} /> {tHr('editBtn')}</>}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {editingDept && isAdmin ? (
                <form onSubmit={saveDept} className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#9B9A97' }}>{tHr('editDept')}</p>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('deptName')}</label>
                    <input required value={deptForm.name}
                      onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('parentDept')}</label>
                    <select value={deptForm.parent_id}
                      onChange={e => setDeptForm({ ...deptForm, parent_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm bg-white outline-none"
                      style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                      <option value="">{tHr('noParent')}</option>
                      {departments.filter(d => d.id !== selectedDept.id).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" disabled={saving}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#7c3aed' }}>
                    {saving ? tHr('saving') : <><HandIcon name="document-pen" size={14} /> {tHr('saveChanges')}</>}
                  </button>
                  <button type="button" onClick={() => deleteDept(selectedDept.id)}
                    className="w-full py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ color: '#EB5757', border: '1px solid #FFEAEA' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FFEAEA'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <HandIcon name="trash-can" size={14} /> {tHr('deleteDept')}
                  </button>
                </form>
              ) : (
                <div className="space-y-5">
                  {/* Info */}
                  <div className="space-y-3">
                    {[
                      { label: tHr('parentDeptLabel'), value: departments.find(d => d.id === selectedDept.parent_id)?.name || '—' },
                      { label: tHr('deptId'), value: selectedDept.id?.slice(0, 8) + '...' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-1"
                        style={{ borderBottom: '1px solid var(--notion-border)' }}>
                        <span className="text-xs" style={{ color: '#9B9A97' }}>{row.label}</span>
                        <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Members */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#9B9A97' }}>{tHr('deptMembers')}</p>
                    <div className="space-y-1">
                      {employees.filter((e: any) => e.department_id === selectedDept.id).length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: '#9B9A97' }}>{tHr('noMembers')}</p>
                      ) : employees.filter((e: any) => e.department_id === selectedDept.id).map((emp: any) => (
                        <div key={emp.id} className="flex items-center gap-3 py-2 rounded-xl px-2 cursor-pointer"
                          style={{ transition: 'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={() => { setSelectedDept(null); setTimeout(() => { setSelectedEmployee(emp); setEditingEmployee(false); }, 150); }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: '#ede9fe', color: '#7c3aed' }}>
                            {emp.full_name?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{emp.full_name}</p>
                            {emp.position_name && (
                              <p className="text-[10px]" style={{ color: '#9B9A97' }}>{emp.position_name}</p>
                            )}
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: emp.status === 'active' ? '#dcfce7' : '#f3f4f6', color: emp.status === 'active' ? '#15803d' : '#9B9A97' }}>
                            {emp.status === 'active' ? tHr('statusActive') : tHr('statusTerminated')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* Create Department Modal */}
      {showCreateDept && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-sm shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tHr('newDept')}</h3>
            <form onSubmit={createDept} className="space-y-3">
              <input required placeholder={tHr('deptNameReq')} value={deptForm.name}
                onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <select value={deptForm.parent_id}
                onChange={e => setDeptForm({ ...deptForm, parent_id: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm bg-white outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                <option value="">{tHr('noParentDept')}</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowCreateDept(false)}
                  className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--notion-border)' }}>{tCommon('cancel')}</button>
                <button type="submit"
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: '#7c3aed' }}>{tCommon('create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Leave Modal */}
      {showLeaveCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>
              {leaveView === 'my' ? tHr('submitLeave') : tHr('leaveModalTitle')}
            </h3>
            <form onSubmit={leaveView === 'management' ? createLeave : createMyLeave} className="space-y-3">
              {/* Employee selector only for admin management view */}
              {leaveView === 'management' && (
                <select required value={leaveForm.employee_id} onChange={e => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm bg-white" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                  <option value="">{tHr('selectEmployee')}</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              )}
              <select value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm bg-white" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                {[
                  { value: 'annual', label: tHr('leaveTypeAnnual') },
                  { value: 'sick', label: tHr('leaveTypeSick') },
                  { value: 'personal', label: tHr('leaveTypePersonal') },
                  { value: 'maternity', label: tHr('leaveTypeMaternity') },
                  { value: 'other', label: tHr('leaveTypeOther') },
                ].map(tp => (
                  <option key={tp.value} value={tp.value}>{tp.label}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('colStart')}</label>
                  <input required type="date" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{tHr('colEnd')}</label>
                  <input required type="date" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs" style={{ color: '#9B9A97' }}>{tHr('colDays')}</label>
                  {leaveForm.start_date && leaveForm.end_date && (
                    <span className="text-[10px]" style={{ color: '#9B9A97' }}>{tHr('autoCalcDays')}</span>
                  )}
                </div>
                <input required type="number" step="0.5" placeholder={tHr('daysReq')} value={leaveForm.days} onChange={e => setLeaveForm({ ...leaveForm, days: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <textarea placeholder={tHr('reason')} value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm h-20 resize-none outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowLeaveCreate(false)}
                  className="flex-1 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 py-2 rounded-md text-sm text-white disabled:opacity-50" style={{ background: 'var(--notion-accent)' }}>
                  {creating ? tCommon('submitting') : tCommon('submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
