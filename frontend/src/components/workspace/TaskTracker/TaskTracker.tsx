'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import {
  Task, SubTask, TaskStatus, TaskPriority,
  STATUS_CONFIG, PRIORITY_CONFIG,
  genId, isOverdue, getRowColor,
  ViewConfig, DEFAULT_VIEW_CONFIG, LayoutMode, LAYOUT_CONFIG,
  applyConfig,
} from './types';
import TaskModal from './TaskModal';
import FilterPanel from './FilterPanel';
import SortPanel from './SortPanel';
import SettingsPanel from './SettingsPanel';
import AutomationModal, { runAutomations } from './AutomationModal';
import DataSourcePanel from './DataSourcePanel';
import TimelineView from './views/TimelineView';
import GalleryTaskView from './views/GalleryTaskView';
import ChartView from './views/ChartView';
import CalendarTaskView from './views/CalendarTaskView';
import ActivityView from './views/ActivityView';

// ── Shared Badges ─────────────────────────────────────────────────────────────
function StatusBadge({ status, small }: { status: TaskStatus; small?: boolean }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
  return (
    <span className="inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap"
      style={{
        background: cfg.bg, color: cfg.color,
        fontSize: small ? 10 : 11, padding: small ? '1px 7px' : '2px 9px',
      }}>
      <span style={{ fontSize: small ? 8 : 9 }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: TaskPriority }) {
  if (!priority) return null;
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className="inline-flex items-center rounded font-medium"
      style={{ background: cfg.bg, color: cfg.color, fontSize: 10, padding: '1px 7px' }}>
      {cfg.label}
    </span>
  );
}

// ── View: All Tasks Table ─────────────────────────────────────────────────────
function AllTasksView({ tasks, onEdit, onStatusChange, onAdd, config }: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onAdd: () => void;
  config: ViewConfig;
}) {
  const t = useTranslations('taskTracker');
  const [hovered, setHovered] = useState<string | null>(null);
  const vis = config.visibleProperties;

  return (
    <div>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
        {/* Header */}
        <div className="grid text-[10px] font-semibold uppercase tracking-wider px-4 py-2"
          style={{
            gridTemplateColumns: `2fr ${vis.includes('status') ? '100px' : ''} ${vis.includes('priority') ? '75px' : ''} ${vis.includes('assignees') ? '140px' : ''} ${vis.includes('due_date') ? '110px' : ''}`.trim(),
            background: '#FAFAF9', color: '#9B9A97',
            borderBottom: '1px solid var(--notion-border)',
          }}>
          <span>{t('taskName')}</span>
          {vis.includes('status') && <span>{t('statusCol')}</span>}
          {vis.includes('priority') && <span>{t('priorityCol')}</span>}
          {vis.includes('assignees') && <span>{t('assigneeCol')}</span>}
          {vis.includes('due_date') && <span>{t('dueDateCol')}</span>}
        </div>

        {tasks.length === 0 ? (
          <div className="py-14 text-center text-sm" style={{ color: '#9B9A97' }}>
            {t('noTasksCreate')}
          </div>
        ) : tasks.map(task => {
          const overdue = isOverdue(task);
          const doneSub = (task.subtasks ?? []).filter(s => s.completed).length;
          const totalSub = (task.subtasks ?? []).length;
          const rowBg = getRowColor(task, config.colorConditions);
          return (
            <div key={task.id}
              className="grid items-center px-4 py-2.5 cursor-pointer"
              style={{
                gridTemplateColumns: `2fr ${vis.includes('status') ? '100px' : ''} ${vis.includes('priority') ? '75px' : ''} ${vis.includes('assignees') ? '140px' : ''} ${vis.includes('due_date') ? '110px' : ''}`.trim(),
                borderBottom: '1px solid var(--notion-border)',
                background: rowBg ?? (hovered === task.id ? '#FAFAF9' : 'white'),
                opacity: task.status === 'done' ? 0.65 : 1,
              }}
              onMouseEnter={() => setHovered(task.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onEdit(task)}
            >
              {/* Title cell */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-[9px] transition-colors"
                  style={{
                    borderColor: task.status === 'done' ? '#0F9D58' : '#D3D2CF',
                    background: task.status === 'done' ? '#0F9D58' : 'transparent',
                    color: 'white',
                  }}
                  onClick={e => { e.stopPropagation(); onStatusChange(task.id, task.status === 'done' ? 'todo' : 'done'); }}
                >
                  {task.status === 'done' ? '✓' : ''}
                </button>
                <span className="truncate text-sm font-medium" style={{
                  color: 'var(--notion-text)',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                }}>
                  {task.title || 'Untitled'}
                </span>
                {totalSub > 0 && (
                  <span className="text-[10px] px-1.5 rounded flex-shrink-0"
                    style={{ background: 'var(--notion-active)', color: '#9B9A97' }}>
                    {doneSub}/{totalSub}
                  </span>
                )}
                {overdue && (
                  <span className="text-[9px] px-1.5 rounded flex-shrink-0"
                    style={{ background: '#FFEAEA', color: '#EB5757' }}>{t('overdue')}</span>
                )}
                {(task.attachments?.length ?? 0) > 0 && (
                  <HandIcon name="paperclip" size={9} style={{ color: '#9B9A97' }} />
                )}
              </div>
              {vis.includes('status') && <StatusBadge status={task.status} small />}
              {vis.includes('priority') && <PriorityBadge priority={task.priority} />}
              {vis.includes('assignees') && (
                <span className="text-[12px] truncate" style={{ color: '#5F5E5B' }}>
                  {task.assignees?.join(', ') || '—'}
                </span>
              )}
              {vis.includes('due_date') && (
                <span className="text-[11px]" style={{ color: overdue ? '#EB5757' : '#9B9A97' }}>
                  {task.due_date ? new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={onAdd}
        className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg text-sm w-full text-left"
        style={{ color: '#9B9A97' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {t('newTask')}
      </button>
    </div>
  );
}

// ── View: By Status (Kanban) ──────────────────────────────────────────────────
function StatusView({ tasks, onEdit, onAdd, onStatusChange, config }: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onAdd: (s: TaskStatus) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  config: ViewConfig;
}) {
  const t = useTranslations('taskTracker');
  const statuses: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statuses.map(status => {
        const cfg = STATUS_CONFIG[status];
        const col = tasks.filter(t => t.status === status);
        return (
          <div key={status} className="flex flex-col flex-shrink-0" style={{ width: 265 }}>
            <div className="flex items-center gap-2 px-1 pb-2 mb-2"
              style={{ borderBottom: `2px solid ${cfg.color}` }}>
              <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-xs ml-auto px-1.5 rounded-full"
                style={{ background: cfg.bg, color: cfg.color }}>{col.length}</span>
            </div>

            <div className="flex flex-col gap-2 flex-1">
              {col.map(task => {
                const overdue = isOverdue(task);
                const totalSub = (task.subtasks ?? []).length;
                const doneSub = (task.subtasks ?? []).filter(s => s.completed).length;
                const rowBg = getRowColor(task, config.colorConditions);
                return (
                  <div key={task.id}
                    onClick={() => onEdit(task)}
                    className="rounded-xl p-3 cursor-pointer"
                    style={{
                      background: rowBg ?? 'white',
                      border: '1px solid var(--notion-border)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium flex-1 min-w-0" style={{
                        color: '#1a1a1a',
                        textDecoration: status === 'done' ? 'line-through' : 'none',
                        opacity: status === 'done' ? 0.6 : 1,
                      }}>
                        {task.title || 'Untitled'}
                      </p>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {task.assignees?.length ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"
                          style={{ background: '#F1F0EE', color: '#5F5E5B' }}>
                          <HandIcon name="person" size={10} /> {task.assignees.join(', ')}
                        </span>
                      ) : null}
                      {task.due_date && (
                        <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: overdue ? '#EB5757' : '#9B9A97' }}>
                          <HandIcon name="alarm-clock" size={10} /> {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                          {overdue ? <> <HandIcon name="warning" size={10} /></> : ''}
                        </span>
                      )}
                      {totalSub > 0 && (
                        <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: '#9B9A97' }}>
                          <HandIcon name="checkmark" size={10} /> {doneSub}/{totalSub}
                        </span>
                      )}
                    </div>
                    {task.task_type && (
                      <span className="text-[10px] mt-1.5 inline-block px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--notion-active)', color: '#5F5E5B' }}>
                        {task.task_type}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={() => onAdd(status)}
              className="flex items-center gap-1.5 px-2 py-2 rounded-lg mt-2 text-sm text-left"
              style={{ color: '#9B9A97' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('newTask')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── View: List ────────────────────────────────────────────────────────────────
function ListView({ tasks, onEdit, onStatusChange, onAdd }: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onAdd: () => void;
}) {
  const t = useTranslations('taskTracker');
  const statuses: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
  return (
    <div className="space-y-6 max-w-2xl">
      {statuses.map(status => {
        const cfg = STATUS_CONFIG[status];
        const group = tasks.filter(t => t.status === status);
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-xs" style={{ color: '#9B9A97' }}>{group.length}</span>
            </div>
            <div className="space-y-1">
              {group.map(task => {
                const done = task.status === 'done';
                const overdue = isOverdue(task);
                const doneSub = (task.subtasks ?? []).filter(s => s.completed).length;
                const totalSub = (task.subtasks ?? []).length;
                return (
                  <div key={task.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg group"
                    style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                  >
                    <button
                      className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ borderColor: done ? '#0F9D58' : '#D3D2CF', background: done ? '#0F9D58' : 'transparent' }}
                      onClick={() => onStatusChange(task.id, done ? 'todo' : 'done')}
                    >
                      {done && <span className="text-white" style={{ fontSize: 9 }}>✓</span>}
                    </button>
                    <span className="flex-1 text-sm cursor-pointer"
                      style={{ color: 'var(--notion-text)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.5 : 1 }}
                      onClick={() => onEdit(task)}>
                      {task.title || 'Untitled'}
                    </span>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <PriorityBadge priority={task.priority} />
                      {task.assignees?.length ? <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: '#9B9A97' }}><HandIcon name="person" size={10} /> {task.assignees.join(', ')}</span> : null}
                      {task.due_date && (
                        <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: overdue ? '#EB5757' : '#9B9A97' }}>
                          <HandIcon name="alarm-clock" size={10} /> {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {totalSub > 0 && <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: '#9B9A97' }}><HandIcon name="checkmark" size={10} /> {doneSub}/{totalSub}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {tasks.length === 0 && (
        <div className="py-14 text-center text-sm" style={{ color: '#9B9A97' }}>{t('noTasks')}</div>
      )}
      <button onClick={onAdd}
        className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg text-sm w-full text-left"
        style={{ color: '#9B9A97' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {t('newTask')}
      </button>
    </div>
  );
}

// ── AI Summary Panel ──────────────────────────────────────────────────────────
function AISummaryPanel({ tasks, pageId, onClose }: { tasks: Task[]; pageId: string; onClose: () => void }) {
  const t = useTranslations('taskTracker');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);

  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const inProg = tasks.filter(t => t.status === 'in_progress').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  const overdue = tasks.filter(isOverdue);
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  useEffect(() => {
    async function go() {
      try {
        const taskList = tasks.map(tk =>
          `- [${STATUS_CONFIG[tk.status].label}] ${tk.title}${tk.assignees?.length ? ` ${t('promptAssignee')}:${tk.assignees.join(',')}` : ''}${tk.due_date ? ` ${t('promptDueDate')}:${tk.due_date}` : ''}${tk.priority ? ` ${t('promptPriority')}:${tk.priority}` : ''}`
        ).join('\n');
        const res = await api.post(`/api/workspace/pages/${pageId}/ai-action`, {
          action: 'summarize',
          text: `${t('promptReportTitle')}\n${t('promptTotalTasks', { total, done, rate, inProg, blocked, overdue: overdue.length })}\n\n${t('promptTaskList')}：\n${taskList}`,
        });
        setSummary(res.result || t('cannotGenerateSummary'));
      } catch {
        setSummary(t('summaryFailed'));
      } finally {
        setLoading(false);
      }
    }
    go();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = [
    { label: t('completionRate'), value: `${rate}%`, color: '#0F9D58' },
    { label: t('inProgress'), value: inProg, color: '#2F80ED' },
    { label: t('blocked'), value: blocked, color: '#EB5757' },
    { label: t('overdueCount'), value: overdue.length, color: overdue.length > 0 ? '#EB5757' : '#9B9A97' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ width: 580, maxHeight: '82vh' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--notion-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>AI</div>
            <span className="font-semibold text-sm" style={{ color: 'var(--notion-text)' }}>{t('aiSummaryTitle')}</span>
          </div>
          <button onClick={onClose} style={{ color: '#9B9A97' }} className="hover:text-[#37352F]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--notion-border)' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{t('overallProgress')}</span>
            <span className="text-xs font-bold ml-auto" style={{ color: '#0F9D58' }}>{done}/{total} {t('completedCount')}</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#E3E2E0' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: 'linear-gradient(90deg, #0F9D58, #43e97b)' }} />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 px-6 py-4" style={{ borderBottom: '1px solid var(--notion-border)' }}>
          {stats.map(s => (
            <div key={s.label} className="text-center rounded-xl py-3" style={{ background: '#FAFAF9' }}>
              <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] mt-0.5" style={{ color: '#9B9A97' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-3 text-sm" style={{ color: '#9B9A97' }}>
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              {t('aiAnalyzing')}
            </div>
          ) : (
            <div className="text-sm leading-relaxed" style={{ color: 'var(--notion-text)', whiteSpace: 'pre-wrap' }}>
              {summary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main TaskTracker ──────────────────────────────────────────────────────────
interface TaskTrackerProps {
  pageId: string;
  initialTasks?: Task[];
  onTasksChange?: (tasks: Task[]) => void;
}

export default function TaskTracker({ pageId, initialTasks, onTasksChange }: TaskTrackerProps) {
  const t = useTranslations('taskTracker');
  const [tasks, setTasks] = useState<Task[]>(initialTasks ?? []);
  const [config, setConfig] = useState<ViewConfig>(DEFAULT_VIEW_CONFIG);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [showDataSource, setShowDataSource] = useState(false);
  const [showAISummary, setShowAISummary] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);
  const [currentUser, setCurrentUser] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sortBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user?.email || '');
  }, []);

  const saveTasks = useCallback((updated: Task[], prevTask?: Task, changedTask?: Task) => {
    setTasks(updated);

    // Run automations
    if (changedTask && config.automations.length > 0) {
      runAutomations(config.automations, changedTask, prevTask);
    }

    if (onTasksChange) {
      onTasksChange(updated);
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.patch(`/api/workspace/pages/${pageId}`, {
          content: { _type: 'task_tracker', _tasks: updated, _config: config },
        });
      } catch {}
    }, 800);
  }, [pageId, onTasksChange, config]);

  // Save config changes too
  const saveConfig = useCallback((newConfig: ViewConfig) => {
    setConfig(newConfig);
    if (onTasksChange) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.patch(`/api/workspace/pages/${pageId}`, {
          content: { _type: 'task_tracker', _tasks: tasks, _config: newConfig },
        });
      } catch {}
    }, 800);
  }, [pageId, onTasksChange, tasks]);

  function openNew(status: TaskStatus = 'todo', date?: string) {
    setDefaultStatus(status);
    setDefaultDate(date);
    setEditingTask(null);
    setShowModal(true);
  }

  function handleSaveTask(task: Task) {
    const prev = tasks.find(t => t.id === task.id);
    const updated = prev
      ? tasks.map(t => t.id === task.id ? task : t)
      : [...tasks, task];
    saveTasks(updated, prev, task);
    setShowModal(false);
  }

  function handleDeleteTask(taskId: string) {
    saveTasks(tasks.filter(t => t.id !== taskId));
    setShowModal(false);
  }

  function handleStatusChange(taskId: string, status: TaskStatus) {
    const prev = tasks.find(t => t.id === taskId);
    const changed = prev ? { ...prev, status, updated_at: new Date().toISOString() } : undefined;
    saveTasks(
      tasks.map(t => t.id === taskId ? { ...t, status, updated_at: new Date().toISOString() } : t),
      prev,
      changed,
    );
  }

  // Filtered + sorted tasks for display
  const displayTasks = applyConfig(tasks, config, searchQuery);

  const done = tasks.filter(t => t.status === 'done').length;
  const rate = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const filterCount = config.filterGroups.reduce((acc, g) => acc + g.conditions.length, 0);
  const sortCount = config.sortRules.length;

  const LAYOUTS = Object.entries(LAYOUT_CONFIG) as [LayoutMode, { label: string; icon: string }][];

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Layout tab row ── */}
      <div className="flex items-center flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-0.5 p-1 rounded-lg" style={{ background: 'var(--notion-active)' }}>
          {LAYOUTS.map(([mode, cfg]) => (
            <button key={mode}
              onClick={() => saveConfig({ ...config, layout: mode })}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: config.layout === mode ? 'white' : 'transparent',
                color: config.layout === mode ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                boxShadow: config.layout === mode ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                border: config.layout === mode ? '1px solid #ede9fe' : '1px solid transparent',
              }}>
              <HandIcon name={cfg.icon} size={12} />
              <span className="hidden sm:inline">{cfg.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right actions row ── */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        {/* Search toggle */}
        <button
          onClick={() => setShowSearch(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: showSearch ? '#ede9fe' : 'var(--notion-active)',
            color: showSearch ? '#7c3aed' : 'var(--notion-text-muted)',
          }}>
          <HandIcon name="magnifier" size={12} />
        </button>

        {/* Filter */}
        <button
          onClick={() => setShowFilter(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: showFilter || filterCount > 0 ? '#ede9fe' : 'var(--notion-active)',
            color: showFilter || filterCount > 0 ? '#7c3aed' : 'var(--notion-text-muted)',
          }}>
          <HandIcon name="lightning" size={12} /> {t('filter')}{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>

        {/* Sort */}
        <div className="relative" ref={sortBtnRef}>
          <button
            onClick={() => setShowSort(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: showSort || sortCount > 0 ? '#ede9fe' : 'var(--notion-active)',
              color: showSort || sortCount > 0 ? '#7c3aed' : 'var(--notion-text-muted)',
            }}>
            ↕ {t('sort')}{sortCount > 0 ? ` (${sortCount})` : ''}
          </button>
          {showSort && (
            <SortPanel
              sortRules={config.sortRules}
              onChange={rules => saveConfig({ ...config, sortRules: rules })}
              onClose={() => setShowSort(false)}
            />
          )}
        </div>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: showSettings ? '#ede9fe' : 'var(--notion-active)',
            color: showSettings ? '#7c3aed' : 'var(--notion-text-muted)',
          }}>
          <HandIcon name="gear" size={12} /> {t('settingsBtn')}
        </button>

        {/* Automation */}
        <button
          onClick={() => setShowAutomation(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'var(--notion-active)', color: 'var(--notion-text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.color = '#7c3aed'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-active)'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}>
          <HandIcon name="robot" size={12} /> {t('automationBtn')}
          {config.automations.filter(a => a.enabled).length > 0 && (
            <span className="ml-1 px-1.5 rounded-full text-[9px] font-bold"
              style={{ background: '#7c3aed', color: 'white' }}>
              {config.automations.filter(a => a.enabled).length}
            </span>
          )}
        </button>

        {/* Data source */}
        <button
          onClick={() => setShowDataSource(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: showDataSource ? '#ede9fe' : 'var(--notion-active)',
            color: showDataSource ? '#7c3aed' : 'var(--notion-text-muted)',
          }}>
          <HandIcon name="package" size={12} /> {t('dataSource')}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Progress */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--notion-active)', color: '#9B9A97' }}>
            <span>{t('completedCount')}</span>
            <span className="font-semibold tabular-nums" style={{ color: '#0F9D58' }}>{done}/{tasks.length}</span>
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: '#E3E2E0' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: '#0F9D58' }} />
            </div>
          </div>
        )}

        {/* AI Summary */}
        <button onClick={() => setShowAISummary(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: '#ede9fe', color: '#7c3aed' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#ddd6fe'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#ede9fe'; }}>
          ✦ {t('aiSummary')}
        </button>

        {/* New task */}
        <button onClick={() => openNew()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ background: '#7c3aed' }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('newTask')}
        </button>
      </div>

      {/* ── Search bar ── */}
      {showSearch && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
          style={{ border: '1px solid #7c3aed', background: 'var(--notion-card, white)' }}>
          <HandIcon name="magnifier" size={14} style={{ color: '#9B9A97' }} />
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: 'var(--notion-text)' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ color: '#9B9A97' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* ── Filter panel (inline) ── */}
      {showFilter && (
        <FilterPanel
          filterGroups={config.filterGroups}
          onChange={groups => saveConfig({ ...config, filterGroups: groups })}
        />
      )}

      {/* ── Result count banner ── */}
      {(searchQuery || filterCount > 0) && displayTasks.length !== tasks.length && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ background: '#ede9fe', color: '#7c3aed' }}>
          <span className="inline-flex items-center gap-1"><HandIcon name="magnifier" size={11} /> {t('showingTasks', { shown: displayTasks.length, total: tasks.length })}</span>
          <button onClick={() => { setSearchQuery(''); saveConfig({ ...config, filterGroups: [] }); }}
            className="ml-auto text-[10px] px-2 py-0.5 rounded-full transition-colors"
            style={{ background: '#7c3aed', color: 'white' }}>
            {t('clearBtn')}
          </button>
        </div>
      )}

      {/* ── View content ── */}
      {config.layout === 'table' && (
        <AllTasksView
          tasks={displayTasks}
          onEdit={t => { setEditingTask(t); setShowModal(true); }}
          onStatusChange={handleStatusChange}
          onAdd={() => openNew()}
          config={config}
        />
      )}
      {config.layout === 'kanban' && (
        <StatusView
          tasks={displayTasks}
          onEdit={t => { setEditingTask(t); setShowModal(true); }}
          onAdd={s => openNew(s)}
          onStatusChange={handleStatusChange}
          config={config}
        />
      )}
      {config.layout === 'list' && (
        <ListView
          tasks={displayTasks}
          onEdit={t => { setEditingTask(t); setShowModal(true); }}
          onStatusChange={handleStatusChange}
          onAdd={() => openNew()}
        />
      )}
      {config.layout === 'timeline' && (
        <TimelineView
          tasks={displayTasks}
          onEdit={t => { setEditingTask(t); setShowModal(true); }}
        />
      )}
      {config.layout === 'gallery' && (
        <GalleryTaskView
          tasks={displayTasks}
          onEdit={t => { setEditingTask(t); setShowModal(true); }}
          onAdd={() => openNew()}
        />
      )}
      {config.layout === 'chart' && (
        <ChartView tasks={displayTasks} />
      )}
      {config.layout === 'calendar' && (
        <CalendarTaskView
          tasks={displayTasks}
          onEdit={t => { setEditingTask(t); setShowModal(true); }}
          onAdd={(status, date) => openNew(status ?? 'todo', date)}
        />
      )}
      {config.layout === 'activity' && (
        <ActivityView
          tasks={displayTasks}
          onEdit={t => { setEditingTask(t); setShowModal(true); }}
        />
      )}

      {/* ── Task Modal ── */}
      {showModal && (
        <TaskModal
          pageId={pageId}
          task={editingTask}
          defaultStatus={defaultStatus}
          defaultDate={defaultDate}
          onSave={handleSaveTask}
          onDelete={editingTask ? () => handleDeleteTask(editingTask.id) : undefined}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── Settings panel ── */}
      {showSettings && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setShowSettings(false)}
            style={{ background: 'rgba(0,0,0,0.15)' }} />
          <SettingsPanel
            config={config}
            onChange={saveConfig}
            onClose={() => setShowSettings(false)}
          />
        </>
      )}

      {/* ── DataSource panel ── */}
      {showDataSource && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setShowDataSource(false)}
            style={{ background: 'rgba(0,0,0,0.15)' }} />
          <DataSourcePanel
            config={{}}
            onChange={() => {}}
            onClose={() => setShowDataSource(false)}
          />
        </>
      )}

      {/* ── Automation modal ── */}
      {showAutomation && (
        <AutomationModal
          automations={config.automations}
          onChange={automations => saveConfig({ ...config, automations })}
          onClose={() => setShowAutomation(false)}
        />
      )}

      {/* ── AI Summary ── */}
      {showAISummary && (
        <AISummaryPanel tasks={tasks} pageId={pageId} onClose={() => setShowAISummary(false)} />
      )}
    </div>
  );
}
