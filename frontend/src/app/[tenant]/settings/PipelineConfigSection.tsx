'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import toast from 'react-hot-toast';
import type { PipelineConfig, StatusValue, FileCategory, WorkflowStageDef, WorkflowStepDef } from '@/lib/usePipelineConfig';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'workflow' | 'statuses' | 'files';

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

// ── Workflow Stages Editor ─────────────────────────────────────────────────────

function WorkflowStagesEditor({
  stages,
  onChange,
}: {
  stages: WorkflowStageDef[];
  onChange: (s: WorkflowStageDef[]) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (stages.length > 0) init[stages[0].key] = true;
    return init;
  });
  const [addingStep, setAddingStep] = useState<string | null>(null);

  function toggleExpand(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function updateStage(stageIdx: number, patch: Partial<WorkflowStageDef>) {
    const next = stages.map((s, i) => (i === stageIdx ? { ...s, ...patch } : s));
    onChange(next);
  }

  function updateStep(stageIdx: number, stepIdx: number, patch: Partial<WorkflowStepDef>) {
    const stage = stages[stageIdx];
    const newSteps = stage.steps.map((s, i) => (i === stepIdx ? { ...s, ...patch } : s));
    updateStage(stageIdx, { steps: newSteps });
  }

  function moveStep(stageIdx: number, stepIdx: number, dir: -1 | 1) {
    const stage = stages[stageIdx];
    const targetIdx = stepIdx + dir;
    if (targetIdx < 0 || targetIdx >= stage.steps.length) return;
    const newSteps = [...stage.steps];
    [newSteps[stepIdx], newSteps[targetIdx]] = [newSteps[targetIdx], newSteps[stepIdx]];
    updateStage(stageIdx, { steps: newSteps });
  }

  function removeStep(stageIdx: number, stepIdx: number) {
    const stage = stages[stageIdx];
    updateStage(stageIdx, { steps: stage.steps.filter((_, i) => i !== stepIdx) });
  }

  function addCustomStep(stageIdx: number, step: WorkflowStepDef) {
    const stage = stages[stageIdx];
    updateStage(stageIdx, { steps: [...stage.steps, step] });
    setAddingStep(null);
  }

  return (
    <div className="space-y-3">
      <SectionTitle>工作流程管理</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        管理 Customer 360 工作流的阶段和步骤。所有步骤均可编辑、排序和删除。
      </p>

      {stages.map((stage, stageIdx) => {
        const isExpanded = expanded[stage.key] ?? false;
        const enabledCount = stage.steps.filter(s => s.enabled !== false).length;

        return (
          <div key={stage.key} className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--notion-border)' }}>
            {/* Stage header */}
            <button
              onClick={() => toggleExpand(stage.key)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{ background: isExpanded ? 'var(--notion-hover)' : 'transparent' }}
              onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--notion-hover)'; }}
              onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: stage.bg ?? '#f5f3ff' }}>
                <HandIcon name={stage.icon ?? 'briefcase'} size={16} style={{ color: stage.color ?? '#7c3aed' }} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm" style={{ color: 'var(--notion-text)' }}>{stage.label}</span>
                <span className="ml-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                  {enabledCount} / {stage.steps.length} 步骤
                </span>
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--notion-text-muted)' }}>
                {isExpanded ? '▼' : '▶'}
              </span>
            </button>

            {/* Stage body */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-2">
                {/* Stage label + color edit */}
                <div className="flex items-center gap-2 mb-3 pt-2">
                  <input value={stage.label} onChange={e => updateStage(stageIdx, { label: e.target.value })}
                    className={`${inputCls} flex-1`} style={inputStyle} placeholder="阶段名称" />
                  <input type="color" value={stage.color ?? '#7c3aed'}
                    onChange={e => updateStage(stageIdx, { color: e.target.value })}
                    className="w-10 h-9 rounded-lg cursor-pointer border-0" title="阶段颜色" />
                </div>

                {/* Steps list */}
                {stage.steps.map((step, stepIdx) => {
                  const isEnabled = step.enabled !== false;
                  const isBuiltin = step.builtin === true;
                  return (
                    <div key={step.key}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group"
                      style={{
                        border: '1px solid var(--notion-border)',
                        background: isEnabled ? 'var(--notion-card, white)' : 'var(--notion-hover)',
                        opacity: isEnabled ? 1 : 0.5,
                      }}>
                      {/* Enable toggle */}
                      <input type="checkbox" checked={isEnabled}
                        onChange={e => updateStep(stageIdx, stepIdx, { enabled: e.target.checked })}
                        className="flex-shrink-0 cursor-pointer" title={isEnabled ? '点击禁用' : '点击启用'} />

                      {/* Step label */}
                      <input value={step.label} onChange={e => updateStep(stageIdx, stepIdx, { label: e.target.value })}
                        className="flex-1 text-sm px-2 py-0.5 rounded" style={inputStyle} placeholder="步骤名称" />

                      {/* Owner */}
                      <input value={step.owner ?? ''} onChange={e => updateStep(stageIdx, stepIdx, { owner: e.target.value || undefined })}
                        className="text-xs w-[100px] px-2 py-0.5 rounded flex-shrink-0" style={inputStyle} placeholder="负责人" />

                      {/* Badge */}
                      {isBuiltin ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'var(--notion-hover)', color: 'var(--notion-text-muted)' }}>
                          内置
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: '#dbeafe', color: '#2563eb' }}>
                          自定义
                        </span>
                      )}

                      {/* Move buttons */}
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => moveStep(stageIdx, stepIdx, -1)}
                          disabled={stepIdx === 0}
                          className="text-xs px-1 disabled:opacity-30" style={{ color: 'var(--notion-text-muted)' }}>↑</button>
                        <button onClick={() => moveStep(stageIdx, stepIdx, 1)}
                          disabled={stepIdx === stage.steps.length - 1}
                          className="text-xs px-1 disabled:opacity-30" style={{ color: 'var(--notion-text-muted)' }}>↓</button>
                      </div>

                      {/* Delete */}
                      <button onClick={() => removeStep(stageIdx, stepIdx)}
                        className="text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        style={{ color: '#ef4444' }} title="删除步骤">×</button>
                    </div>
                  );
                })}

                {/* Add custom step */}
                {addingStep === stage.key ? (
                  <AddStepForm
                    onAdd={step => addCustomStep(stageIdx, step)}
                    onCancel={() => setAddingStep(null)}
                  />
                ) : (
                  <AddButton label="添加自定义步骤" onClick={() => setAddingStep(stage.key)} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Add Custom Step Form ──────────────────────────────────────────────────────

const STEP_TYPES = [
  { value: 'checklist', label: '检查列表' },
  { value: 'file_upload', label: '文件上传' },
  { value: 'approval', label: '审批' },
  { value: 'data_input', label: '数据输入' },
  { value: 'custom', label: '通用步骤' },
];

function AddStepForm({
  onAdd,
  onCancel,
}: {
  onAdd: (step: WorkflowStepDef) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [desc, setDesc] = useState('');
  const [owner, setOwner] = useState('');
  const [type, setType] = useState('custom');
  const [checklistItems, setChecklistItems] = useState('');

  function handleSubmit() {
    if (!label.trim()) return;
    const step: WorkflowStepDef = {
      key: `custom_${Date.now()}`,
      label: label.trim(),
      desc: desc.trim() || undefined,
      owner: owner.trim() || undefined,
      builtin: false,
      enabled: true,
      type,
    };
    if (type === 'checklist' && checklistItems.trim()) {
      step.checklist_items = checklistItems.split('\n').filter(Boolean).map((line, i) => ({
        key: `item_${i}`,
        label: line.trim(),
      }));
    }
    onAdd(step);
  }

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ border: '1px dashed var(--notion-border)', background: 'var(--notion-hover)' }}>
      <div className="grid grid-cols-2 gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)}
          className={inputCls} style={inputStyle} placeholder="步骤名称 *" autoFocus />
        <select value={type} onChange={e => setType(e.target.value)}
          className={inputCls} style={inputStyle}>
          {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <input value={owner} onChange={e => setOwner(e.target.value)}
        className={inputCls} style={inputStyle} placeholder="负责人 (如: 业务员)" />
      <input value={desc} onChange={e => setDesc(e.target.value)}
        className={inputCls} style={inputStyle} placeholder="步骤描述" />
      {type === 'checklist' && (
        <textarea value={checklistItems} onChange={e => setChecklistItems(e.target.value)}
          className={`${inputCls} h-20`} style={inputStyle} placeholder="检查项（每行一项）" />
      )}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSubmit}
          disabled={!label.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
          style={{ background: 'var(--notion-accent)', color: 'white' }}>
          添加
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{ color: 'var(--notion-text-muted)' }}>
          取消
        </button>
      </div>
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
      <SectionTitle>线索状态</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        配置状态及其所属阶段。
      </p>
      {statuses.map((sv, i) => (
        <CardRow key={i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-3 gap-2">
            <input value={sv.key} onChange={e => update(i, { key: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="标识符" />
            <input value={sv.label ?? ''} onChange={e => update(i, { label: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="显示名称" />
            <select value={sv.stage ?? ''} onChange={e => update(i, { stage: e.target.value || null })}
              className={inputCls} style={inputStyle}>
              <option value="">— 无阶段 —</option>
              {stageKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </CardRow>
      ))}
      <AddButton label="添加状态" onClick={add} />
    </div>
  );
}

// ── Transitions Editor ────────────────────────────────────────────────────────

function TransitionsEditor({
  transitions, statuses, onChange,
}: {
  transitions: Record<string, string>;
  statuses: StatusValue[];
  onChange: (t: Record<string, string>) => void;
}) {
  return (
    <div className="mt-8 space-y-2">
      <SectionTitle>状态流转</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        定义线索推进时的下一状态。
      </p>
      {Object.entries(transitions).map(([from, to]) => (
        <div key={from} className="flex items-center gap-2">
          <span className="text-xs font-medium w-28 text-right" style={{ color: 'var(--notion-text)' }}>{from}</span>
          <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>&rarr;</span>
          <select value={to} onChange={e => onChange({ ...transitions, [from]: e.target.value })}
            className="px-2 py-1 rounded text-xs" style={inputStyle}>
            {statuses.map(sv => <option key={sv.key} value={sv.key}>{sv.key} ({sv.label})</option>)}
          </select>
          <button onClick={() => {
            const next = { ...transitions };
            delete next[from];
            onChange(next);
          }} className="text-xs" style={{ color: '#ef4444' }}>×</button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-2">
        <select id="new-trans-from" className="px-2 py-1 rounded text-xs" style={inputStyle}>
          {statuses.filter(sv => !(sv.key in transitions)).map(sv => (
            <option key={sv.key} value={sv.key}>{sv.key}</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>&rarr;</span>
        <select id="new-trans-to" className="px-2 py-1 rounded text-xs" style={inputStyle}>
          {statuses.map(sv => <option key={sv.key} value={sv.key}>{sv.key}</option>)}
        </select>
        <button onClick={() => {
          const fromEl = document.getElementById('new-trans-from') as HTMLSelectElement;
          const toEl = document.getElementById('new-trans-to') as HTMLSelectElement;
          if (fromEl?.value && toEl?.value) {
            onChange({ ...transitions, [fromEl.value]: toEl.value });
          }
        }} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--notion-accent)' }}>
          + 添加
        </button>
      </div>
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
      <SectionTitle>文件分类</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        线索/合同附件的文件分类。
      </p>
      {categories.map((cat, i) => (
        <CardRow key={i} onRemove={() => remove(i)}>
          <div className="grid grid-cols-2 gap-2">
            <input value={cat.key} onChange={e => update(i, { key: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="标识符" />
            <input value={cat.label ?? ''} onChange={e => update(i, { label: e.target.value })}
              className={inputCls} style={inputStyle} placeholder="显示名称" />
          </div>
        </CardRow>
      ))}
      <AddButton label="添加分类" onClick={add} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PipelineConfigSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('workflow');
  const [dirty, setDirty] = useState(false);

  // Config state
  const [workflowStages, setWorkflowStages] = useState<WorkflowStageDef[]>([]);
  const [statuses, setStatuses] = useState<StatusValue[]>([]);
  const [transitions, setTransitions] = useState<Record<string, string>>({});
  const [statusRank, setStatusRank] = useState<string[]>([]);
  const [fileCategories, setFileCategories] = useState<FileCategory[]>([]);

  // Pipeline stage keys for status mapping (from pipeline.stages)
  const [pipelineStageKeys, setPipelineStageKeys] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/api/pipeline-config');
        setWorkflowStages(data.workflow_stages ?? []);
        setStatuses(data.statuses?.values ?? []);
        setTransitions(data.statuses?.transitions ?? {});
        setStatusRank(data.statuses?.rank ?? []);
        setFileCategories(data.file_categories ?? []);
        setPipelineStageKeys((data.pipeline?.stages ?? []).map((s: any) => s.key));
      } catch (err) {
        toast.error('加载流程配置失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const derivedStatusToStage = useMemo(() => {
    const map: Record<string, string> = {};
    for (const sv of statuses) {
      if (sv.stage) map[sv.key] = sv.stage;
    }
    return map;
  }, [statuses]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.patch('/api/pipeline-config', {
        workflow_stages: workflowStages,
        statuses: {
          values: statuses,
          status_to_stage: derivedStatusToStage,
          transitions,
          rank: statusRank,
        },
        file_categories: fileCategories,
      });
      setDirty(false);
      toast.success('流程配置已保存');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pipeline-config-updated'));
      }
    } catch (err) {
      toast.error('保存流程配置失败');
    } finally {
      setSaving(false);
    }
  }, [workflowStages, statuses, derivedStatusToStage, transitions, statusRank, fileCategories]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true); };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
        加载中...
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'workflow', label: '工作流程', icon: 'briefcase' },
    { key: 'statuses', label: '状态配置', icon: 'tag' },
    { key: 'files', label: '文件分类', icon: 'folder' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>流程配置</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--notion-text-muted)' }}>
            管理工作流阶段、步骤、状态和文件分类。
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
          {saving ? '保存中...' : dirty ? '保存更改' : '已保存'}
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
      {tab === 'workflow' && (
        <WorkflowStagesEditor stages={workflowStages} onChange={markDirty(setWorkflowStages)} />
      )}
      {tab === 'statuses' && (
        <>
          <StatusesEditor statuses={statuses} stageKeys={pipelineStageKeys} onChange={markDirty(setStatuses)} />
          <TransitionsEditor
            transitions={transitions}
            statuses={statuses}
            onChange={t => { setTransitions(t); setDirty(true); }}
          />
        </>
      )}
      {tab === 'files' && (
        <FileCategoriesEditor categories={fileCategories} onChange={markDirty(setFileCategories)} />
      )}
    </div>
  );
}
