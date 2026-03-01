'use client';

import { useState, useRef, useEffect } from 'react';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import { api, getApiUrl } from '@/lib/api';
import {
  Task, SubTask, Attachment, TaskStatus, TaskPriority,
  STATUS_CONFIG, PRIORITY_CONFIG, genId,
} from './types';

// ── Recursive SubTask Item ────────────────────────────────────────────────────
function SubTaskItem({
  sub, depth, onChange, onDelete,
}: {
  sub: SubTask;
  depth: number;
  onChange: (updated: SubTask) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('taskTracker');
  const [expanded, setExpanded] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [showAssignee, setShowAssignee] = useState(false);

  function updateField(patch: Partial<SubTask>) {
    onChange({ ...sub, ...patch });
  }

  function addChild() {
    if (!childTitle.trim()) { setAddingChild(false); return; }
    const child: SubTask = { id: genId(), title: childTitle.trim(), completed: false };
    updateField({ subtasks: [...(sub.subtasks ?? []), child] });
    setChildTitle('');
    setAddingChild(false);
    setExpanded(true);
  }

  function updateChild(idx: number, updated: SubTask) {
    const subs = [...(sub.subtasks ?? [])];
    subs[idx] = updated;
    updateField({ subtasks: subs });
  }

  function deleteChild(idx: number) {
    const subs = [...(sub.subtasks ?? [])];
    subs.splice(idx, 1);
    updateField({ subtasks: subs });
  }

  const hasChildren = (sub.subtasks?.length ?? 0) > 0;
  const doneSub = (sub.subtasks ?? []).filter(s => s.completed).length;
  const assignees = sub.assignees ?? [];

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div className="flex items-center gap-2 py-1.5 group rounded-lg px-1"
        onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF9'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>

        {/* Expand toggle */}
        <button
          className="w-4 h-4 flex items-center justify-center flex-shrink-0"
          style={{ opacity: hasChildren ? 1 : 0, color: '#9B9A97', fontSize: 9 }}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? '▼' : '▶'}
        </button>

        {/* Checkbox */}
        <button
          className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            borderColor: sub.completed ? '#0F9D58' : '#D3D2CF',
            background: sub.completed ? '#0F9D58' : 'transparent',
          }}
          onClick={() => updateField({ completed: !sub.completed })}
        >
          {sub.completed && <span className="text-white" style={{ fontSize: 9 }}>✓</span>}
        </button>

        {/* Title */}
        <input
          className="flex-1 text-sm bg-transparent outline-none"
          style={{
            color: 'var(--notion-text)',
            textDecoration: sub.completed ? 'line-through' : 'none',
            opacity: sub.completed ? 0.5 : 1,
          }}
          value={sub.title}
          onChange={e => updateField({ title: e.target.value })}
        />

        {/* Subtask count */}
        {hasChildren && (
          <span className="text-[10px]" style={{ color: '#9B9A97' }}>{doneSub}/{sub.subtasks!.length}</span>
        )}

        {/* Assignee chips — always visible when assigned */}
        {assignees.length > 0 && !showAssignee && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {assignees.slice(0, 2).map(name => (
              <button
                key={name}
                onClick={() => setShowAssignee(true)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{ background: '#ede9fe', color: '#7c3aed' }}
                title={name}
              >
                {name[0].toUpperCase()}
              </button>
            ))}
            {assignees.length > 2 && (
              <button
                onClick={() => setShowAssignee(true)}
                className="text-[9px] px-1 rounded-full flex-shrink-0"
                style={{ background: '#ede9fe', color: '#7c3aed' }}
              >
                +{assignees.length - 2}
              </button>
            )}
          </div>
        )}

        {/* Assign button — shows on hover when no one assigned */}
        {assignees.length === 0 && (
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ color: '#9B9A97', background: 'var(--notion-active)' }}
            onClick={() => setShowAssignee(v => !v)}
            title={t('assignPerson')}
          >
            <HandIcon name="person" size={10} />
          </button>
        )}

        {/* Due date badge */}
        {sub.due_date && (
          <span
            className="text-[9px] flex-shrink-0 cursor-pointer"
            style={{ color: '#9B9A97' }}
            onClick={() => setEditingMeta(v => !v)}
            title={t('dueDate')}
          >
            <HandIcon name="alarm-clock" size={9} /> {new Date(sub.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Due date toggle (when no date set) */}
        {!sub.due_date && (
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1 py-0.5 rounded flex-shrink-0"
            style={{ color: '#9B9A97' }}
            onClick={() => setEditingMeta(v => !v)}
            title={t('setDueDate')}
          >
            <HandIcon name="alarm-clock" size={10} />
          </button>
        )}

        {/* Add child */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          style={{ color: '#9B9A97' }}
          title={t('addSubtask')}
          onClick={() => setAddingChild(true)}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Delete */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          style={{ color: '#9B9A97' }}
          onClick={onDelete}
          onMouseEnter={e => { e.currentTarget.style.color = '#EB5757'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#9B9A97'; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>

      {/* Inline assignee picker */}
      {showAssignee && (
        <div className="ml-10 mb-2 pl-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium" style={{ color: '#9B9A97' }}>{t('assigneeLbl')}</span>
            <button
              onClick={() => setShowAssignee(false)}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ color: '#9B9A97' }}
            >
              {t('collapse')}
            </button>
          </div>
          <AssigneePicker
            value={assignees}
            onChange={v => updateField({ assignees: v })}
          />
        </div>
      )}

      {/* Inline due date picker */}
      {editingMeta && (
        <div className="ml-10 mb-2 pl-1">
          <span className="text-[10px] font-medium block mb-1" style={{ color: '#9B9A97' }}>{t('dueDate')}</span>
          <input
            type="date"
            className="text-[11px] bg-transparent outline-none border-b"
            style={{ color: '#5F5E5B', borderColor: 'var(--notion-border)' }}
            value={sub.due_date ?? ''}
            onChange={e => updateField({ due_date: e.target.value || undefined })}
          />
        </div>
      )}

      {/* Add child input */}
      {addingChild && (
        <div className="flex items-center gap-2 ml-10 mb-1">
          <input
            autoFocus
            className="flex-1 text-sm outline-none border-b py-0.5"
            style={{ color: 'var(--notion-text)', borderColor: '#7c3aed' }}
            placeholder={t('subtaskNamePlaceholder')}
            value={childTitle}
            onChange={e => setChildTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addChild();
              if (e.key === 'Escape') { setAddingChild(false); setChildTitle(''); }
            }}
          />
          <button onClick={addChild} className="text-[11px] px-2 py-0.5 rounded text-white" style={{ background: '#7c3aed' }}>{t('add')}</button>
          <button onClick={() => { setAddingChild(false); setChildTitle(''); }} className="text-[11px]" style={{ color: '#9B9A97' }}>{t('cancel')}</button>
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {sub.subtasks!.map((child, idx) => (
            <SubTaskItem
              key={child.id}
              sub={child}
              depth={depth + 1}
              onChange={updated => updateChild(idx, updated)}
              onDelete={() => deleteChild(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Attachment Item ───────────────────────────────────────────────────────────
function AttachmentItem({ att, onDelete }: { att: Attachment; onDelete: () => void }) {
  const iconNames: Record<string, string> = {
    image: 'folder-open', video: 'document', audio: 'document', url: 'link', file: 'paperclip',
  };
  const sizeStr = att.size
    ? att.size > 1024 * 1024
      ? `${(att.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(att.size / 1024)} KB`
    : null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg group"
      style={{ background: '#FAFAF9', border: '1px solid var(--notion-border)' }}>
      <HandIcon name={iconNames[att.type] ?? 'paperclip'} size={14} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <a href={att.url} target="_blank" rel="noreferrer"
          className="text-sm truncate block"
          style={{ color: '#2F80ED', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}>
          {att.name}
        </a>
        {sizeStr && <span className="text-[10px]" style={{ color: '#9B9A97' }}>{sizeStr}</span>}
      </div>
      <span className="text-[10px] px-1.5 rounded flex-shrink-0" style={{ background: 'var(--notion-active)', color: '#9B9A97' }}>
        {att.type}
      </span>
      <button onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ color: '#9B9A97' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#EB5757'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#9B9A97'; }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ── Assignee Picker ───────────────────────────────────────────────────────────
interface TenantUser { id: string; email: string; full_name: string | null; role: string; }

function AssigneePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations('taskTracker');
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/api/admin/users').then((data: any) => {
      if (Array.isArray(data)) setUsers(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(name: string) {
    onChange(value.includes(name) ? value.filter(v => v !== name) : [...value, name]);
  }

  const filtered = users.filter(u => {
    const name = u.full_name || u.email;
    return name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div ref={ref} className="relative">
      <div
        className="flex flex-wrap gap-1 min-h-[34px] px-2 py-1 rounded-lg cursor-pointer"
        style={{ background: 'var(--notion-active)', border: '1px solid var(--notion-border)' }}
        onClick={() => setOpen(v => !v)}
      >
        {value.length === 0 && (
          <span className="text-sm self-center" style={{ color: '#9B9A97' }}>{t('selectAssignee')}</span>
        )}
        {value.map(name => (
          <span key={name} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: '#ede9fe', color: '#7c3aed' }}>
            {name}
            <button
              onClick={e => { e.stopPropagation(); toggle(name); }}
              className="opacity-60 hover:opacity-100 leading-none"
            >×</button>
          </span>
        ))}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full rounded-xl shadow-xl overflow-hidden"
          style={{ background: 'var(--notion-card-elevated, var(--notion-card, white))', border: '1px solid var(--notion-border)' }}>
          <div className="px-2 pt-2 pb-1">
            <input
              autoFocus
              className="w-full text-sm px-2 py-1 rounded-lg outline-none"
              style={{ background: 'var(--notion-active)', color: 'var(--notion-text)' }}
              placeholder={t('searchUsers')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-center" style={{ color: '#9B9A97' }}>{t('noMatchingUsers')}</div>
            )}
            {filtered.map(u => {
              const name = u.full_name || u.email;
              const selected = value.includes(name);
              return (
                <button key={u.id}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                  style={{ background: selected ? '#faf5ff' : 'transparent', color: 'var(--notion-text)' }}
                  onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                  onClick={() => toggle(name)}
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    {name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    {u.full_name && <div className="text-[10px] truncate" style={{ color: '#9B9A97' }}>{u.email}</div>}
                  </div>
                  {selected && <span style={{ color: '#7c3aed', fontSize: 13 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Select helpers ────────────────────────────────────────────────────────────
function FieldSelect<T extends string>({ value, options, onChange, placeholder }: {
  value: T | undefined;
  options: { value: T; label: string; color?: string }[];
  onChange: (v: T | undefined) => void;
  placeholder: string;
}) {
  return (
    <select
      className="text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer"
      style={{ background: 'var(--notion-active)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}
      value={value ?? ''}
      onChange={e => onChange((e.target.value as T) || undefined)}
    >
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Main TaskModal ────────────────────────────────────────────────────────────
interface TaskModalProps {
  pageId: string;
  task: Task | null;
  defaultStatus: TaskStatus;
  defaultDate?: string;
  onSave: (task: Task) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function TaskModal({ pageId, task, defaultStatus, defaultDate, onSave, onDelete, onClose }: TaskModalProps) {
  const t = useTranslations('taskTracker');
  const now = new Date().toISOString();
  const [form, setForm] = useState<Task>(task ?? {
    id: genId(),
    title: '',
    status: defaultStatus,
    due_date: defaultDate,
    assignees: [],
    created_at: now,
    updated_at: now,
  });

  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [addingAtt, setAddingAtt] = useState(false);
  const [attTab, setAttTab] = useState<'file' | 'url'>('file');
  const [attName, setAttName] = useState('');
  const [attUrl, setAttUrl] = useState('');
  const [attType, setAttType] = useState<Attachment['type']>('url');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlanGoal, setAiPlanGoal] = useState('');

  function patch(p: Partial<Task>) {
    setForm(f => ({ ...f, ...p, updated_at: new Date().toISOString() }));
  }

  // ── Subtasks ────────────────────────────────────────────────────────────────
  function addSubtask() {
    if (!subtaskTitle.trim()) { setAddingSubtask(false); return; }
    patch({ subtasks: [...(form.subtasks ?? []), { id: genId(), title: subtaskTitle.trim(), completed: false }] });
    setSubtaskTitle('');
    setAddingSubtask(false);
  }

  function updateSubtask(idx: number, updated: SubTask) {
    const subs = [...(form.subtasks ?? [])];
    subs[idx] = updated;
    patch({ subtasks: subs });
  }

  function deleteSubtask(idx: number) {
    const subs = [...(form.subtasks ?? [])];
    subs.splice(idx, 1);
    patch({ subtasks: subs });
  }

  // ── Attachments ─────────────────────────────────────────────────────────────
  function addAttachment() {
    if (!attUrl.trim()) return;
    const name = attName.trim() || attUrl;
    patch({
      attachments: [...(form.attachments ?? []), { id: genId(), name, url: attUrl.trim(), type: attType }],
    });
    setAttName(''); setAttUrl(''); setAttType('url'); setAddingAtt(false);
  }

  function deleteAttachment(idx: number) {
    const atts = [...(form.attachments ?? [])];
    atts.splice(idx, 1);
    patch({ attachments: atts });
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError('');
    try {
      for (const file of Array.from(files)) {
        const res = await api.upload('/api/workspace/upload', file);
        patch({
          attachments: [...(form.attachments ?? []), {
            id: genId(),
            name: res.name,
            url: `${getApiUrl()}${res.url}`,
            type: res.type as Attachment['type'],
            size: res.size,
          }],
        });
      }
      setAddingAtt(false);
    } catch (e: any) {
      setUploadError(e.message || t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  // ── AI Planning ─────────────────────────────────────────────────────────────
  async function runAIPlan() {
    if (!aiPlanGoal.trim()) return;
    setAiPlanLoading(true);
    try {
      const res = await api.post(`/api/workspace/pages/${pageId}/ai-action`, {
        action: 'plan_subtasks',
        text: aiPlanGoal,
        prompt: `You are a project planning AI. Please decompose the following goal into a structured subtask tree (max 3 levels).
Return a strict JSON array, each subtask format: {"title": "subtask name", "subtasks": [...]}, subtasks can be empty array.
Goal: ${aiPlanGoal}

Only return the JSON array, no other text.`,
      });

      let parsed: any[] = [];
      if (res.type === 'json' && Array.isArray(res.result)) {
        parsed = res.result;
      } else if (typeof res.result === 'string') {
        try { parsed = JSON.parse(res.result); } catch {}
      }

      const toSubTask = (raw: any): SubTask => ({
        id: genId(),
        title: raw.title ?? 'Subtask',
        completed: false,
        subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.map(toSubTask) : [],
      });

      const newSubs = parsed.map(toSubTask);
      patch({ subtasks: [...(form.subtasks ?? []), ...newSubs] });
      setAiPlanning(false);
      setAiPlanGoal('');
    } catch {
      alert(t('aiPlanFailed'));
    } finally {
      setAiPlanLoading(false);
    }
  }

  const doneSub = (form.subtasks ?? []).filter(s => s.completed).length;
  const totalSub = (form.subtasks ?? []).length;
  const isNew = !task;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 680, maxHeight: '90vh' }}
      >
        {/* ── Header bar ── */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--notion-border)' }}>

          {/* Status selector */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['todo', 'in_progress', 'blocked', 'done'] as TaskStatus[]).map(s => {
              const cfg = STATUS_CONFIG[s];
              const active = form.status === s;
              return (
                <button key={s} onClick={() => patch({ status: s })}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-all"
                  style={{
                    background: active ? cfg.bg : 'transparent',
                    color: active ? cfg.color : '#9B9A97',
                    border: active ? `1px solid ${cfg.color}30` : '1px solid transparent',
                  }}>
                  <span style={{ fontSize: 9 }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Delete */}
          {onDelete && (
            <button onClick={() => { if (window.confirm(t('confirmDeleteTask'))) onDelete(); }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#9B9A97' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FFEAEA'; e.currentTarget.style.color = '#EB5757'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          )}

          {/* Close */}
          <button onClick={onClose} className="p-1.5 rounded-lg"
            style={{ color: '#9B9A97' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Title */}
          <input
            autoFocus={isNew}
            className="w-full text-2xl font-bold bg-transparent outline-none"
            style={{ color: 'var(--notion-text)', letterSpacing: '-0.02em' }}
            placeholder={t('taskNamePlaceholder')}
            value={form.title}
            onChange={e => patch({ title: e.target.value })}
          />

          {/* ── Properties grid ── */}
          <div className="grid gap-2.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {/* Assignee */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{t('assigneeLbl')}</span>
              <AssigneePicker
                value={form.assignees ?? []}
                onChange={v => patch({ assignees: v })}
              />
            </div>

            {/* Due date */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{t('dueDate')}</span>
              <input
                type="date"
                className="text-sm px-2.5 py-1.5 rounded-lg outline-none"
                style={{ background: 'var(--notion-active)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}
                value={form.due_date ?? ''}
                onChange={e => patch({ due_date: e.target.value })}
              />
            </label>

            {/* Priority */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{t('priorityLbl')}</span>
              <FieldSelect<TaskPriority>
                value={form.priority}
                placeholder={t('selectPriority')}
                options={[
                  { value: 'urgent', label: t('priorityUrgent') },
                  { value: 'high', label: t('priorityHigh') },
                  { value: 'medium', label: t('priorityMedium') },
                  { value: 'low', label: t('priorityLow') },
                ]}
                onChange={v => patch({ priority: v })}
              />
            </label>

            {/* Task type */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{t('taskType')}</span>
              <input
                className="text-sm px-2.5 py-1.5 rounded-lg outline-none"
                style={{ background: 'var(--notion-active)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}
                placeholder={t('taskTypePlaceholder')}
                value={form.task_type ?? ''}
                onChange={e => patch({ task_type: e.target.value || undefined })}
              />
            </label>


            {/* Overdue reminder */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{t('overdueReminder')}</span>
              <button
                onClick={() => patch({ overdue_reminder: !form.overdue_reminder })}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left"
                style={{
                  background: form.overdue_reminder ? '#E6F4EA' : 'var(--notion-active)',
                  color: form.overdue_reminder ? '#0F9D58' : '#9B9A97',
                  border: `1px solid ${form.overdue_reminder ? '#0F9D5840' : 'var(--notion-border)'}`,
                }}
              >
                <HandIcon name={form.overdue_reminder ? 'bell' : 'bell'} size={14} style={{ opacity: form.overdue_reminder ? 1 : 0.4 }} />
                {form.overdue_reminder ? t('reminderEnabled') : t('clickToEnable')}
              </button>
            </label>
          </div>

          {/* ── Description ── */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{t('descriptionLbl')}</span>
            <textarea
              className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none"
              style={{
                background: 'var(--notion-active)', color: 'var(--notion-text)',
                border: '1px solid var(--notion-border)', minHeight: 80,
              }}
              placeholder={t('addDescriptionPlaceholder')}
              value={form.description ?? ''}
              onChange={e => patch({ description: e.target.value })}
              rows={3}
            />
          </div>

          {/* ── Subtasks ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{t('subtasks')}</span>
                {totalSub > 0 && (
                  <span className="text-[10px] px-1.5 rounded-full"
                    style={{ background: 'var(--notion-active)', color: '#9B9A97' }}>
                    {doneSub}/{totalSub}
                  </span>
                )}
                {totalSub > 0 && (
                  <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: '#E3E2E0' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round((doneSub / totalSub) * 100)}%`, background: '#0F9D58' }} />
                  </div>
                )}
              </div>
              {/* AI Planning button */}
              <button
                onClick={() => setAiPlanning(v => !v)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg font-medium"
                style={{ background: '#ede9fe', color: '#7c3aed' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ddd6fe'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#ede9fe'; }}
              >
                ✦ {t('aiPlanSubsteps')}
              </button>
            </div>

            {/* AI Planning input */}
            {aiPlanning && (
              <div className="rounded-xl p-3 space-y-2" style={{ background: '#faf9ff', border: '1px solid #ddd6fe' }}>
                <p className="text-[11px] font-medium" style={{ color: '#7c3aed' }}>
                  ✦ {t('aiPlanDesc')}
                </p>
                <textarea
                  autoFocus
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-none"
                  style={{ background: 'var(--notion-card-elevated, var(--notion-card, white))', color: 'var(--notion-text)', border: '1px solid #ddd6fe', minHeight: 60 }}
                  placeholder={t('aiPlanPlaceholder')}
                  value={aiPlanGoal}
                  onChange={e => setAiPlanGoal(e.target.value)}
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={runAIPlan}
                    disabled={aiPlanLoading || !aiPlanGoal.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                    style={{ background: '#7c3aed' }}
                  >
                    {aiPlanLoading ? (
                      <>
                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        {t('planning')}
                      </>
                    ) : `✦ ${t('generateSubtasks')}`}
                  </button>
                  <button
                    onClick={() => { setAiPlanning(false); setAiPlanGoal(''); }}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ color: '#9B9A97' }}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Subtask list */}
            {(form.subtasks ?? []).length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
                <div className="px-3 py-1">
                  {(form.subtasks ?? []).map((sub, idx) => (
                    <SubTaskItem
                      key={sub.id}
                      sub={sub}
                      depth={0}
                      onChange={updated => updateSubtask(idx, updated)}
                      onDelete={() => deleteSubtask(idx)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Add subtask */}
            {addingSubtask ? (
              <div className="flex items-center gap-2 px-2">
                <div className="w-4 h-4 rounded border-2 flex-shrink-0" style={{ borderColor: '#D3D2CF' }} />
                <input
                  autoFocus
                  className="flex-1 text-sm outline-none border-b py-0.5"
                  style={{ color: 'var(--notion-text)', borderColor: '#7c3aed' }}
                  placeholder={t('subtaskNamePlaceholder')}
                  value={subtaskTitle}
                  onChange={e => setSubtaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addSubtask();
                    if (e.key === 'Escape') { setAddingSubtask(false); setSubtaskTitle(''); }
                  }}
                />
                <button onClick={addSubtask} className="text-xs px-2 py-0.5 rounded text-white" style={{ background: '#7c3aed' }}>{t('add')}</button>
                <button onClick={() => { setAddingSubtask(false); setSubtaskTitle(''); }} className="text-xs" style={{ color: '#9B9A97' }}>{t('cancel')}</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingSubtask(true)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left"
                style={{ color: '#9B9A97' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('addSubtask')}
              </button>
            )}
          </div>

          {/* ── Attachments ── */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{t('attachments')}</span>

            {(form.attachments ?? []).map((att, idx) => (
              <AttachmentItem key={att.id} att={att} onDelete={() => deleteAttachment(idx)} />
            ))}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
              onChange={e => handleFileUpload(e.target.files)}
            />

            {addingAtt ? (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
                {/* Tab switcher */}
                <div className="flex" style={{ borderBottom: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
                  {(['file', 'url'] as const).map(tab => (
                    <button key={tab}
                      className="flex-1 py-2 text-xs font-medium transition-colors"
                      style={{
                        background: attTab === tab ? 'white' : 'transparent',
                        color: attTab === tab ? 'var(--notion-text)' : '#9B9A97',
                        borderBottom: attTab === tab ? '2px solid #7c3aed' : '2px solid transparent',
                      }}
                      onClick={() => setAttTab(tab)}
                    >
                      {tab === 'file' ? <><HandIcon name="folder" size={11} /> {t('localUpload')}</> : <><HandIcon name="link" size={11} /> {t('pasteLink')}</>}
                    </button>
                  ))}
                </div>

                <div className="p-3 space-y-2">
                  {attTab === 'file' ? (
                    <>
                      {/* Drop zone */}
                      <div
                        className="rounded-xl flex flex-col items-center justify-center gap-2 py-7 cursor-pointer transition-colors"
                        style={{ border: '2px dashed var(--notion-border)', background: uploading ? '#faf5ff' : 'var(--notion-active)' }}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#7c3aed'; }}
                        onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
                        onDrop={e => {
                          e.preventDefault();
                          e.currentTarget.style.borderColor = 'var(--notion-border)';
                          handleFileUpload(e.dataTransfer.files);
                        }}
                      >
                        {uploading ? (
                          <>
                            <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            <span className="text-xs" style={{ color: '#7c3aed' }}>{t('uploading')}</span>
                          </>
                        ) : (
                          <>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="1.5">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            <span className="text-xs font-medium" style={{ color: '#9B9A97' }}>{t('clickOrDragFiles')}</span>
                            <span className="text-[10px]" style={{ color: '#C2C0BC' }}>{t('supportedFormats')}</span>
                          </>
                        )}
                      </div>
                      {uploadError && (
                        <div className="text-xs px-2 py-1 rounded-lg" style={{ background: '#FFEAEA', color: '#EB5757' }}>
                          <HandIcon name="warning" size={11} /> {uploadError}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        autoFocus
                        className="w-full text-sm px-2.5 py-1.5 rounded-lg outline-none"
                        style={{ background: 'var(--notion-active)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}
                        placeholder={t('nameOptional')}
                        value={attName}
                        onChange={e => setAttName(e.target.value)}
                      />
                      <input
                        className="w-full text-sm px-2.5 py-1.5 rounded-lg outline-none"
                        style={{ background: 'var(--notion-active)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}
                        placeholder="https://..."
                        value={attUrl}
                        onChange={e => setAttUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addAttachment(); }}
                      />
                      <select
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg outline-none"
                        style={{ background: 'var(--notion-active)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}
                        value={attType}
                        onChange={e => setAttType(e.target.value as Attachment['type'])}
                      >
                        <option value="url">{t('attTypeLink')}</option>
                        <option value="file">{t('attTypeFile')}</option>
                        <option value="image">{t('attTypeImage')}</option>
                        <option value="video">{t('attTypeVideo')}</option>
                        <option value="audio">{t('attTypeAudio')}</option>
                      </select>
                      <div className="flex gap-2">
                        <button onClick={addAttachment} className="text-xs px-3 py-1 rounded-lg text-white" style={{ background: '#7c3aed' }}>{t('add')}</button>
                      </div>
                    </>
                  )}

                  <button
                    onClick={() => { setAddingAtt(false); setAttName(''); setAttUrl(''); setUploadError(''); }}
                    className="text-xs w-full py-1 text-center rounded-lg transition-colors"
                    style={{ color: '#9B9A97' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAddingAtt(true); setAttTab('file'); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left"
                style={{ color: '#9B9A97' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('addAttachment')}
              </button>
            )}
          </div>

          {/* Timestamps */}
          {!isNew && (
            <div className="text-[10px] space-y-0.5" style={{ color: '#C2C0BC' }}>
              <div>{t('createdAt')}: {new Date(form.created_at).toLocaleString()}</div>
              <div>{t('updatedAt')}: {new Date(form.updated_at).toLocaleString()}</div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: '#9B9A97', border: '1px solid var(--notion-border)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            {t('cancel')}
          </button>
          <button
            onClick={() => { if (form.title.trim()) onSave(form); else alert(t('enterTaskName')); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#7c3aed' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            {isNew ? t('createTask') : t('saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
}
