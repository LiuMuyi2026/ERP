'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import toast from 'react-hot-toast';
import type { PipelineConfig, PipelineStage, StatusValue, OperationTask, FileCategory } from '@/lib/usePipelineConfig';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'stages' | 'statuses' | 'tasks' | 'approvals' | 'files';

type ApprovalRule = {
  action: string;
  conditions: { field: string; operator: string; value: any; reason?: string }[];
  condition_logic: string;
  level: string;
  default_approver: string;
  approver_thresholds?: { usd: number; cny: number; approver: string }[];
};

// ── Shared UI ─────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
const inputStyle = { background: 'var(--notion-hover)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>{children}</h3>;
}

function CardRow({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl group transition-colors"
      style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
      <div className="flex-1 min-w-0">{children}</div>
      {onRemove && (
        <button onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
          style={{ color: '#ef4444' }} title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{ color: 'var(--notion-accent)', border: '1px dashed var(--notion-border)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {label}
    </button>
  );
}

// ── Stage Editor ──────────────────────────────────────────────────────────────

function StagesEditor({ stages, onChange }: { stages: PipelineStage[]; onChange: (s: PipelineStage[]) => void }) {
  function update(idx: number, patch: Partial<PipelineStage>) {
    const next = stages.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  }
  function remove(idx: number) {
    onChange(stages.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...stages, { key: `stage_${Date.now()}`, label: '', icon: 'briefcase', color: '#7c3aed', bg: '#f5f3ff' }]);
  }
  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...stages];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Pipeline Stages</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        Define the workflow stages shown in the CRM funnel. Drag to reorder.
      </p>
      {stages.map((stage, i) => (
        <CardRow key={i} onRemove={() => remove(i)}>
          <div className="flex items-center gap-3">
            {i > 0 && (
              <button onClick={() => moveUp(i)} className="text-xs" style={{ color: 'var(--notion-text-muted)' }} title="Move up">↑</button>
            )}
            <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: stage.bg ?? '#f5f3ff' }}>
              <HandIcon name={stage.icon ?? 'briefcase'} size={14} style={{ color: stage.color ?? '#7c3aed' }} />
            </div>
            <div className="flex-1 grid grid-cols-4 gap-2">
              <input value={stage.key} onChange={e => update(i, { key: e.target.value })}
                className={inputCls} style={inputStyle} placeholder="Key" />
              <input value={stage.label ?? ''} onChange={e => update(i, { label: e.target.value })}
                className={inputCls} style={inputStyle} placeholder="Label" />
              <input value={stage.icon ?? ''} onChange={e => update(i, { icon: e.target.value })}
                className={inputCls} style={inputStyle} placeholder="Icon" />
              <input type="color" value={stage.color ?? '#7c3aed'} onChange={e => update(i, { color: e.target.value })}
                className="w-10 h-9 rounded-lg cursor-pointer border-0" />
            </div>
          </div>
        </CardRow>
      ))}
      <AddButton label="Add Stage" onClick={add} />
    </div>
  );
}

// ── Status Editor ─────────────────────────────────────────────────────────────

function StatusesEditor({
  statuses, stageKeys, onChange,
}: {
  statuses: StatusValue[];
  stageKeys: string[];
  onChange: (s: StatusValue[]) => void;
}) {
  function update(idx: number, patch: Partial<StatusValue>) {
    const next = statuses.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  }
  function remove(idx: number) {
    onChange(statuses.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...statuses, { key: `status_${Date.now()}`, label: '', color: 'bg-gray-100 text-gray-500', stage: stageKeys[0] ?? null }]);
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Lead Statuses</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        Configure statuses and their stage mapping. Each status belongs to a pipeline stage.
      </p>
      {statuses.map((sv, i) => (
        <CardRow key={i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-4 gap-2">
            <input value={sv.key} onChange={e => update(i, { key: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="Key" />
            <input value={sv.label ?? ''} onChange={e => update(i, { label: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="Label" />
            <select value={sv.stage ?? ''} onChange={e => update(i, { stage: e.target.value || null })}
              className={inputCls} style={inputStyle}>
              <option value="">— No Stage —</option>
              {stageKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <input value={sv.color ?? ''} onChange={e => update(i, { color: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="CSS class" />
          </div>
        </CardRow>
      ))}
      <AddButton label="Add Status" onClick={add} />
    </div>
  );
}

// ── Task Editor ───────────────────────────────────────────────────────────────

function TasksEditor({ tasks, onChange }: { tasks: OperationTask[]; onChange: (t: OperationTask[]) => void }) {
  function update(idx: number, patch: Partial<OperationTask>) {
    const next = tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChange(next);
  }
  function remove(idx: number) {
    onChange(tasks.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...tasks, { code: '', title: '', owner_role: '', requires_attachment: false }]);
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Operation Tasks</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        Default tasks created for each export flow order.
      </p>
      {tasks.map((task, i) => (
        <CardRow key={i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-4 gap-2">
            <input value={task.code} onChange={e => update(i, { code: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="Code" />
            <input value={task.title} onChange={e => update(i, { title: e.target.value })}
              className={`${inputCls} col-span-2`} style={inputStyle} placeholder="Title" />
            <input value={task.owner_role} onChange={e => update(i, { owner_role: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="Owner role" />
          </div>
          <div className="mt-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--notion-text-muted)' }}>
              <input type="checkbox" checked={task.requires_attachment}
                onChange={e => update(i, { requires_attachment: e.target.checked })} />
              Requires attachment
            </label>
          </div>
        </CardRow>
      ))}
      <AddButton label="Add Task" onClick={add} />
    </div>
  );
}

// ── Approval Rules Editor ─────────────────────────────────────────────────────

function ApprovalRulesEditor({ rules, onChange }: { rules: ApprovalRule[]; onChange: (r: ApprovalRule[]) => void }) {
  function update(idx: number, patch: Partial<ApprovalRule>) {
    const next = rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  }
  function remove(idx: number) {
    onChange(rules.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...rules, {
      action: '', conditions: [], condition_logic: 'any',
      level: 'medium', default_approver: '',
    }]);
  }
  function addCondition(ruleIdx: number) {
    const r = rules[ruleIdx];
    update(ruleIdx, { conditions: [...r.conditions, { field: '', operator: '>', value: 0 }] });
  }
  function updateCondition(ruleIdx: number, condIdx: number, patch: Record<string, any>) {
    const r = rules[ruleIdx];
    const next = r.conditions.map((c, i) => (i === condIdx ? { ...c, ...patch } : c));
    update(ruleIdx, { conditions: next });
  }
  function removeCondition(ruleIdx: number, condIdx: number) {
    const r = rules[ruleIdx];
    update(ruleIdx, { conditions: r.conditions.filter((_, i) => i !== condIdx) });
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Approval Rules</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        Configure when approvals are required (e.g., high-value shipments).
      </p>
      {rules.map((rule, ri) => (
        <CardRow key={ri} onRemove={() => remove(ri)}>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <input value={rule.action} onChange={e => update(ri, { action: e.target.value })}
                className={inputCls} style={inputStyle} placeholder="Action (e.g. delivery_notice)" />
              <select value={rule.level} onChange={e => update(ri, { level: e.target.value })}
                className={inputCls} style={inputStyle}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input value={rule.default_approver} onChange={e => update(ri, { default_approver: e.target.value })}
                className={inputCls} style={inputStyle} placeholder="Default approver" />
            </div>
            <div className="pl-4 space-y-1">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase" style={{ color: 'var(--notion-text-muted)' }}>
                <span>Conditions</span>
                <select value={rule.condition_logic} onChange={e => update(ri, { condition_logic: e.target.value })}
                  className="px-2 py-0.5 rounded text-[10px]" style={inputStyle}>
                  <option value="any">ANY</option>
                  <option value="all">ALL</option>
                </select>
              </div>
              {rule.conditions.map((cond, ci) => (
                <div key={ci} className="flex items-center gap-2">
                  <input value={cond.field} onChange={e => updateCondition(ri, ci, { field: e.target.value })}
                    className="flex-1 px-2 py-1 rounded text-xs" style={inputStyle} placeholder="Field" />
                  <select value={cond.operator} onChange={e => updateCondition(ri, ci, { operator: e.target.value })}
                    className="w-16 px-1 py-1 rounded text-xs" style={inputStyle}>
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<">&lt;</option>
                    <option value="==">=</option>
                    <option value="!=">!=</option>
                  </select>
                  <input value={String(cond.value)} onChange={e => {
                    const v = e.target.value;
                    updateCondition(ri, ci, { value: v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v) });
                  }}
                    className="w-28 px-2 py-1 rounded text-xs" style={inputStyle} placeholder="Value" />
                  <button onClick={() => removeCondition(ri, ci)} className="text-xs" style={{ color: '#ef4444' }}>×</button>
                </div>
              ))}
              <button onClick={() => addCondition(ri)}
                className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--notion-accent)' }}>
                + Condition
              </button>
            </div>
          </div>
        </CardRow>
      ))}
      <AddButton label="Add Rule" onClick={add} />
    </div>
  );
}

// ── File Categories Editor ────────────────────────────────────────────────────

function FileCategoriesEditor({ categories, onChange }: { categories: FileCategory[]; onChange: (c: FileCategory[]) => void }) {
  function update(idx: number, patch: Partial<FileCategory>) {
    const next = categories.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  }
  function remove(idx: number) {
    onChange(categories.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...categories, { key: '', label: '', color: 'bg-gray-100 text-gray-600' }]);
  }

  return (
    <div className="space-y-2">
      <SectionTitle>File Categories</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        Categories for lead/contract file attachments.
      </p>
      {categories.map((cat, i) => (
        <CardRow key={i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-3 gap-2">
            <input value={cat.key} onChange={e => update(i, { key: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="Key" />
            <input value={cat.label ?? ''} onChange={e => update(i, { label: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="Label" />
            <input value={cat.color ?? ''} onChange={e => update(i, { color: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="CSS class" />
          </div>
        </CardRow>
      ))}
      <AddButton label="Add Category" onClick={add} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PipelineConfigSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('stages');
  const [dirty, setDirty] = useState(false);

  // Config state
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [statuses, setStatuses] = useState<StatusValue[]>([]);
  const [statusToStage, setStatusToStage] = useState<Record<string, string>>({});
  const [transitions, setTransitions] = useState<Record<string, string>>({});
  const [statusRank, setStatusRank] = useState<string[]>([]);
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  const [fileCategories, setFileCategories] = useState<FileCategory[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/pipeline-config');
        setStages(data.pipeline?.stages ?? []);
        setStatuses(data.statuses?.values ?? []);
        setStatusToStage(data.statuses?.status_to_stage ?? {});
        setTransitions(data.statuses?.transitions ?? {});
        setStatusRank(data.statuses?.rank ?? []);
        setTasks(data.operation_tasks ?? []);
        setApprovalRules(data.approval_rules ?? []);
        setFileCategories(data.file_categories ?? []);
      } catch (err) {
        toast.error('Failed to load pipeline config');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Auto-derive status_to_stage from statuses when statuses change
  const derivedStatusToStage = useMemo(() => {
    const map: Record<string, string> = {};
    for (const sv of statuses) {
      if (sv.stage) map[sv.key] = sv.stage;
    }
    return map;
  }, [statuses]);

  const stageKeys = useMemo(() => stages.map(s => s.key), [stages]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.patch('/pipeline-config', {
        pipeline: { stages },
        statuses: {
          values: statuses,
          status_to_stage: derivedStatusToStage,
          transitions,
          rank: statusRank,
        },
        operation_tasks: tasks,
        approval_rules: approvalRules,
        file_categories: fileCategories,
      });
      setDirty(false);
      toast.success('Pipeline config saved');
      // Invalidate the frontend cache
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pipeline-config-updated'));
      }
    } catch (err) {
      toast.error('Failed to save pipeline config');
    } finally {
      setSaving(false);
    }
  }, [stages, statuses, derivedStatusToStage, transitions, statusRank, tasks, approvalRules, fileCategories]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true); };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
        Loading pipeline config...
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'stages', label: 'Stages', icon: 'briefcase' },
    { key: 'statuses', label: 'Statuses', icon: 'tag' },
    { key: 'tasks', label: 'Tasks', icon: 'checklist' },
    { key: 'approvals', label: 'Approvals', icon: 'shield-lock' },
    { key: 'files', label: 'Files', icon: 'folder' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>Pipeline Configuration</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--notion-text-muted)' }}>
            Customize CRM pipeline stages, statuses, tasks, approval rules, and file categories.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{
            background: dirty ? 'var(--notion-accent)' : 'var(--notion-hover)',
            color: dirty ? 'white' : 'var(--notion-text-muted)',
            opacity: saving ? 0.6 : 1,
          }}>
          {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 pb-2" style={{ borderBottom: '1px solid var(--notion-border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{
              background: tab === t.key ? 'var(--notion-active)' : 'transparent',
              color: tab === t.key ? 'var(--notion-text)' : 'var(--notion-text-muted)',
              fontWeight: tab === t.key ? 600 : 400,
            }}>
            <HandIcon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'stages' && <StagesEditor stages={stages} onChange={markDirty(setStages)} />}
      {tab === 'statuses' && <StatusesEditor statuses={statuses} stageKeys={stageKeys} onChange={markDirty(setStatuses)} />}
      {tab === 'tasks' && <TasksEditor tasks={tasks} onChange={markDirty(setTasks)} />}
      {tab === 'approvals' && <ApprovalRulesEditor rules={approvalRules} onChange={markDirty(setApprovalRules)} />}
      {tab === 'files' && <FileCategoriesEditor categories={fileCategories} onChange={markDirty(setFileCategories)} />}

      {/* Transitions editor (inline under statuses tab) */}
      {tab === 'statuses' && (
        <div className="mt-8 space-y-2">
          <SectionTitle>Status Transitions</SectionTitle>
          <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
            Define what the &quot;next&quot; status is when advancing a lead.
          </p>
          {Object.entries(transitions).map(([from, to]) => (
            <div key={from} className="flex items-center gap-2">
              <span className="text-xs font-medium w-28 text-right" style={{ color: 'var(--notion-text)' }}>{from}</span>
              <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>→</span>
              <select value={to} onChange={e => {
                const next = { ...transitions, [from]: e.target.value };
                setTransitions(next);
                setDirty(true);
              }} className="px-2 py-1 rounded text-xs" style={inputStyle}>
                {statuses.map(sv => <option key={sv.key} value={sv.key}>{sv.key} ({sv.label})</option>)}
              </select>
              <button onClick={() => {
                const next = { ...transitions };
                delete next[from];
                setTransitions(next);
                setDirty(true);
              }} className="text-xs" style={{ color: '#ef4444' }}>×</button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2">
            <select id="new-trans-from" className="px-2 py-1 rounded text-xs" style={inputStyle}>
              {statuses.filter(sv => !(sv.key in transitions)).map(sv => (
                <option key={sv.key} value={sv.key}>{sv.key}</option>
              ))}
            </select>
            <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>→</span>
            <select id="new-trans-to" className="px-2 py-1 rounded text-xs" style={inputStyle}>
              {statuses.map(sv => <option key={sv.key} value={sv.key}>{sv.key}</option>)}
            </select>
            <button onClick={() => {
              const fromEl = document.getElementById('new-trans-from') as HTMLSelectElement;
              const toEl = document.getElementById('new-trans-to') as HTMLSelectElement;
              if (fromEl?.value && toEl?.value) {
                setTransitions({ ...transitions, [fromEl.value]: toEl.value });
                setDirty(true);
              }
            }} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--notion-accent)' }}>
              + Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
