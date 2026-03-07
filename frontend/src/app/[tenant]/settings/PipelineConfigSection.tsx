'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import toast from 'react-hot-toast';
import type { StatusValue, FileCategory, WorkflowStageDef, WorkflowStepDef } from '@/lib/usePipelineConfig';

// ── Shared UI ─────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
const inputStyle = { background: 'var(--notion-hover)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>{children}</h3>;
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

// ── Role Multi-Select ────────────────────────────────────────────────────────

function RoleMultiSelect({ value, roles, placeholder, onChange }: {
  value: string | undefined;
  roles: { key: string; label: string }[];
  placeholder: string;
  onChange: (v: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    if (!value) return new Set<string>();
    return new Set(value.split(/[、,\/]/).map(s => s.trim()).filter(Boolean));
  }, [value]);

  function toggle(label: string) {
    const next = new Set(selected);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange(next.size > 0 ? Array.from(next).join('、') : undefined);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (roles.length === 0) {
    return (
      <input value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}
        className="text-xs w-[120px] px-2 py-1 rounded flex-shrink-0" style={inputStyle} placeholder={placeholder} />
    );
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded min-w-[100px] max-w-[180px] text-left"
        style={{ ...inputStyle, cursor: 'pointer' }}>
        {selected.size > 0 ? (
          <span className="truncate">{Array.from(selected).join('、')}</span>
        ) : (
          <span style={{ color: 'var(--notion-text-muted)' }}>{placeholder}</span>
        )}
        <span className="ml-auto text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{ background: 'var(--notion-bg, white)', border: '1px solid var(--notion-border)' }}>
          {roles.map(r => (
            <label key={r.key}
              className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors"
              style={{ color: 'var(--notion-text)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <input type="checkbox" checked={selected.has(r.label)} onChange={() => toggle(r.label)}
                className="cursor-pointer" />
              {r.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step Type Defs ────────────────────────────────────────────────────────────

const STEP_TYPE_KEYS = ['checklist', 'file_upload', 'approval', 'data_input', 'custom'] as const;
const STEP_TYPE_I18N: Record<string, string> = {
  checklist: 'typeChecklist', file_upload: 'typeFileUpload', approval: 'typeApproval',
  data_input: 'typeDataInput', custom: 'typeCustom',
};

// ── Add Custom Step Form ──────────────────────────────────────────────────────

function AddStepForm({ allRoles, fileCategories, onAdd, onCancel }: {
  allRoles: { key: string; label: string }[];
  fileCategories: FileCategory[];
  onAdd: (step: WorkflowStepDef) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('pipelineConfig');
  const tc = useTranslations('common');
  const [label, setLabel] = useState('');
  const [desc, setDesc] = useState('');
  const [owner, setOwner] = useState<string | undefined>(undefined);
  const [type, setType] = useState('custom');
  const [checklistItems, setChecklistItems] = useState('');
  const [fileCategory, setFileCategory] = useState('');

  function handleSubmit() {
    if (!label.trim()) return;
    const step: WorkflowStepDef = {
      key: `custom_${Date.now()}`,
      label: label.trim(),
      desc: desc.trim() || undefined,
      owner: owner || undefined,
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
    if (type === 'file_upload' && fileCategory) {
      step.file_category = fileCategory;
    }
    onAdd(step);
  }

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ border: '1px dashed var(--notion-border)', background: 'var(--notion-hover)' }}>
      <div className="grid grid-cols-2 gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)}
          className={inputCls} style={inputStyle} placeholder={`${t('stepName')} *`} autoFocus />
        <select value={type} onChange={e => setType(e.target.value)}
          className={inputCls} style={inputStyle}>
          {STEP_TYPE_KEYS.map(k => <option key={k} value={k}>{t(STEP_TYPE_I18N[k] as any)}</option>)}
        </select>
      </div>
      <RoleMultiSelect value={owner} roles={allRoles} placeholder={t('ownerHint')} onChange={v => setOwner(v)} />
      <input value={desc} onChange={e => setDesc(e.target.value)}
        className={inputCls} style={inputStyle} placeholder={t('stepDesc')} />
      {type === 'checklist' && (
        <textarea value={checklistItems} onChange={e => setChecklistItems(e.target.value)}
          className={`${inputCls} h-20`} style={inputStyle} placeholder={t('checklistHint')} />
      )}
      {type === 'file_upload' && (
        <select value={fileCategory} onChange={e => setFileCategory(e.target.value)}
          className={inputCls} style={inputStyle}>
          <option value="">{t('fileCategory')}</option>
          {fileCategories.map(c => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
        </select>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSubmit}
          disabled={!label.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
          style={{ background: 'var(--notion-accent)', color: 'white' }}>
          {tc('create')}
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{ color: 'var(--notion-text-muted)' }}>
          {tc('cancel')}
        </button>
      </div>
    </div>
  );
}

// ── Workflow Stages Editor ─────────────────────────────────────────────────────

function WorkflowStagesEditor({
  stages, onChange, allRoles, fileCategories,
  stageStatuses, onStageStatusesChange,
}: {
  stages: WorkflowStageDef[];
  onChange: (s: WorkflowStageDef[]) => void;
  allRoles: { key: string; label: string }[];
  fileCategories: FileCategory[];
  stageStatuses: Record<string, StatusValue[]>;
  onStageStatusesChange: (s: Record<string, StatusValue[]>) => void;
}) {
  const t = useTranslations('pipelineConfig');
  const tc = useTranslations('common');
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
    onChange(stages.map((s, i) => (i === stageIdx ? { ...s, ...patch } : s)));
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

  // ── Inline status helpers ──
  function updateStatuses(stageKey: string, statuses: StatusValue[]) {
    onStageStatusesChange({ ...stageStatuses, [stageKey]: statuses });
  }

  function addStatus(stageKey: string) {
    const cur = stageStatuses[stageKey] ?? [];
    updateStatuses(stageKey, [...cur, { key: `status_${Date.now()}`, label: '', stage: stageKey }]);
  }

  function updateStatus(stageKey: string, idx: number, patch: Partial<StatusValue>) {
    const cur = stageStatuses[stageKey] ?? [];
    updateStatuses(stageKey, cur.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeStatus(stageKey: string, idx: number) {
    const cur = stageStatuses[stageKey] ?? [];
    updateStatuses(stageKey, cur.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <SectionTitle>{t('workflowTitle')}</SectionTitle>
      <p className="text-xs mb-3" style={{ color: 'var(--notion-text-muted)' }}>
        {t('workflowDesc')}
      </p>

      {stages.map((stage, stageIdx) => {
        const isExpanded = expanded[stage.key] ?? false;
        const enabledCount = stage.steps.filter(s => s.enabled !== false).length;
        const statuses = stageStatuses[stage.key] ?? [];

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
                  {enabledCount} / {stage.steps.length} {t('steps')}
                </span>
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--notion-text-muted)' }}>
                {isExpanded ? '▼' : '▶'}
              </span>
            </button>

            {/* Stage body */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-2">
                {/* Stage label + color */}
                <div className="flex items-center gap-2 mb-3 pt-2">
                  <input value={stage.label} onChange={e => updateStage(stageIdx, { label: e.target.value })}
                    className={`${inputCls} flex-1`} style={inputStyle} placeholder={t('stageName')} />
                  <input type="color" value={stage.color ?? '#7c3aed'}
                    onChange={e => updateStage(stageIdx, { color: e.target.value })}
                    className="w-10 h-9 rounded-lg cursor-pointer border-0" title={t('stageColor')} />
                </div>

                {/* Steps list */}
                {stage.steps.map((step, stepIdx) => {
                  const isEnabled = step.enabled !== false;
                  const isFileUpload = step.type === 'file_upload';
                  return (
                    <div key={step.key}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group"
                      style={{
                        border: '1px solid var(--notion-border)',
                        background: isEnabled ? 'var(--notion-card, white)' : 'var(--notion-hover)',
                        opacity: isEnabled ? 1 : 0.5,
                      }}>
                      <input type="checkbox" checked={isEnabled}
                        onChange={e => updateStep(stageIdx, stepIdx, { enabled: e.target.checked })}
                        className="flex-shrink-0 cursor-pointer" title={isEnabled ? t('disable') : t('enable')} />

                      <input value={step.label} onChange={e => updateStep(stageIdx, stepIdx, { label: e.target.value })}
                        className="flex-1 text-sm px-2 py-0.5 rounded" style={inputStyle} placeholder={t('stepName')} />

                      <RoleMultiSelect
                        value={step.owner}
                        roles={allRoles}
                        placeholder={t('owner')}
                        onChange={v => updateStep(stageIdx, stepIdx, { owner: v })} />

                      {/* Type badge */}
                      {step.type && STEP_TYPE_I18N[step.type] && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
                          style={{ background: 'var(--notion-hover)', color: 'var(--notion-text-muted)' }}>
                          {t(STEP_TYPE_I18N[step.type] as any)}
                        </span>
                      )}

                      {/* File category for file_upload steps */}
                      {isFileUpload && (
                        <select
                          value={step.file_category ?? ''}
                          onChange={e => updateStep(stageIdx, stepIdx, { file_category: e.target.value || undefined })}
                          className="text-[11px] px-1.5 py-0.5 rounded flex-shrink-0 max-w-[100px]"
                          style={inputStyle}
                          title={t('fileCategory')}>
                          <option value="">{t('fileCategory')}</option>
                          {fileCategories.map(c => (
                            <option key={c.key} value={c.key}>{c.label || c.key}</option>
                          ))}
                        </select>
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

                      <button onClick={() => removeStep(stageIdx, stepIdx)}
                        className="text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        style={{ color: '#ef4444' }} title={tc('delete')}>×</button>
                    </div>
                  );
                })}

                {/* Add custom step */}
                {addingStep === stage.key ? (
                  <AddStepForm
                    allRoles={allRoles}
                    fileCategories={fileCategories}
                    onAdd={step => addCustomStep(stageIdx, step)}
                    onCancel={() => setAddingStep(null)}
                  />
                ) : (
                  <AddButton label={t('addStep')} onClick={() => setAddingStep(stage.key)} />
                )}

                {/* Inline statuses for this stage */}
                <div className="mt-4 pt-3" style={{ borderTop: '1px dashed var(--notion-border)' }}>
                  <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text-muted)' }}>
                    {t('statusTitle')}
                  </h4>
                  <div className="space-y-1.5">
                    {statuses.map((sv, i) => (
                      <div key={i} className="flex items-center gap-2 group">
                        <input value={sv.key} onChange={e => updateStatus(stage.key, i, { key: e.target.value })}
                          className="text-xs px-2 py-1 rounded w-28" style={inputStyle} placeholder={t('identifier')} />
                        <input value={sv.label ?? ''} onChange={e => updateStatus(stage.key, i, { label: e.target.value })}
                          className="text-xs px-2 py-1 rounded flex-1" style={inputStyle} placeholder={t('displayName')} />
                        <button onClick={() => removeStatus(stage.key, i)}
                          className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: '#ef4444' }}>×</button>
                      </div>
                    ))}
                    <button onClick={() => addStatus(stage.key)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ color: 'var(--notion-accent)' }}>
                      + {t('addStatus')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PipelineConfigSection() {
  const t = useTranslations('pipelineConfig');
  const tc = useTranslations('common');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [workflowStages, setWorkflowStages] = useState<WorkflowStageDef[]>([]);
  const [stageStatuses, setStageStatuses] = useState<Record<string, StatusValue[]>>({});
  const [generalStatuses, setGeneralStatuses] = useState<StatusValue[]>([]);
  const [statusRank, setStatusRank] = useState<string[]>([]);
  const [fileCategories, setFileCategories] = useState<FileCategory[]>([]);

  // Reverse mapping: workflow stage key → pipeline stage key (for saving)
  const wToPRef = useRef<Record<string, string>>({});

  // All unique roles across all stages
  const allRoles = useMemo(() => {
    const seen = new Map<string, { key: string; label: string }>();
    for (const stage of workflowStages) {
      for (const role of stage.roles ?? []) {
        if (!seen.has(role.key)) seen.set(role.key, role);
      }
    }
    return Array.from(seen.values());
  }, [workflowStages]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/api/pipeline-config');
        const wfStages: WorkflowStageDef[] = data.workflow_stages ?? [];
        setWorkflowStages(wfStages);
        setFileCategories(data.file_categories ?? []);
        setStatusRank(data.statuses?.rank ?? []);

        // Build pipeline ↔ workflow stage key mapping
        const pipelineStages: { key: string }[] = data.pipeline?.stages ?? [];
        const wfKeys = new Set(wfStages.map(s => s.key));
        const p2w: Record<string, string> = {};

        // Direct matches first
        for (const ps of pipelineStages) {
          if (wfKeys.has(ps.key)) p2w[ps.key] = ps.key;
        }
        // Position match for remaining
        const unmatchedP = pipelineStages.filter(ps => !p2w[ps.key]);
        const matchedW = new Set(Object.values(p2w));
        const unmatchedW = wfStages.filter(ws => !matchedW.has(ws.key));
        for (let i = 0; i < Math.min(unmatchedP.length, unmatchedW.length); i++) {
          p2w[unmatchedP[i].key] = unmatchedW[i].key;
        }

        // Build reverse mapping for save
        const w2p: Record<string, string> = {};
        for (const [pk, wk] of Object.entries(p2w)) w2p[wk] = pk;
        wToPRef.current = w2p;

        // Group statuses by workflow stage key
        const grouped: Record<string, StatusValue[]> = {};
        const general: StatusValue[] = [];
        for (const sv of data.statuses?.values ?? []) {
          const mappedStage = sv.stage ? (p2w[sv.stage] ?? sv.stage) : null;
          if (mappedStage && wfKeys.has(mappedStage)) {
            (grouped[mappedStage] ??= []).push({ ...sv, stage: mappedStage });
          } else {
            general.push(sv);
          }
        }
        setStageStatuses(grouped);
        setGeneralStatuses(general);
      } catch (err) {
        toast.error(t('loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Flatten statuses → use pipeline stage keys for backward compat
      const allStatuses: StatusValue[] = [];
      const statusToStage: Record<string, string> = {};
      const w2p = wToPRef.current;

      for (const [wfKey, svList] of Object.entries(stageStatuses)) {
        const pKey = w2p[wfKey] ?? wfKey;
        for (const sv of svList) {
          allStatuses.push({ ...sv, stage: pKey });
          statusToStage[sv.key] = pKey;
        }
      }
      for (const sv of generalStatuses) {
        allStatuses.push({ ...sv, stage: null });
      }

      // Collect file categories from file_upload steps (preserve existing labels)
      const catMap = new Map<string, FileCategory>();
      for (const c of fileCategories) catMap.set(c.key, c);
      for (const stage of workflowStages) {
        for (const step of stage.steps) {
          if (step.type === 'file_upload' && step.file_category && !catMap.has(step.file_category)) {
            catMap.set(step.file_category, { key: step.file_category, label: step.file_category });
          }
        }
      }

      await api.patch('/api/pipeline-config', {
        workflow_stages: workflowStages,
        statuses: {
          values: allStatuses,
          status_to_stage: statusToStage,
          rank: statusRank,
        },
        file_categories: Array.from(catMap.values()),
      });
      setDirty(false);
      toast.success(t('saveOk'));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pipeline-config-updated'));
      }
    } catch (err) {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [workflowStages, stageStatuses, generalStatuses, statusRank, fileCategories, t]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true); };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
        {tc('loading')}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>{t('title')}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--notion-text-muted)' }}>
            {t('subtitle')}
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
          {saving ? t('saving') : dirty ? t('saveChanges') : t('saved')}
        </button>
      </div>

      <WorkflowStagesEditor
        stages={workflowStages}
        onChange={markDirty(setWorkflowStages)}
        allRoles={allRoles}
        fileCategories={fileCategories}
        stageStatuses={stageStatuses}
        onStageStatusesChange={markDirty(setStageStatuses)}
      />

      {/* General statuses (not tied to any stage) */}
      {generalStatuses.length > 0 && (
        <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--notion-border)' }}>
          <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>
            {t('generalStatuses')}
          </h4>
          <div className="space-y-1.5">
            {generalStatuses.map((sv, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <input value={sv.key}
                  onChange={e => {
                    const next = generalStatuses.map((s, j) => (j === i ? { ...s, key: e.target.value } : s));
                    setGeneralStatuses(next); setDirty(true);
                  }}
                  className="text-xs px-2 py-1 rounded w-28" style={inputStyle} placeholder={t('identifier')} />
                <input value={sv.label ?? ''}
                  onChange={e => {
                    const next = generalStatuses.map((s, j) => (j === i ? { ...s, label: e.target.value } : s));
                    setGeneralStatuses(next); setDirty(true);
                  }}
                  className="text-xs px-2 py-1 rounded flex-1" style={inputStyle} placeholder={t('displayName')} />
                <button onClick={() => {
                  setGeneralStatuses(generalStatuses.filter((_, j) => j !== i)); setDirty(true);
                }} className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: '#ef4444' }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
