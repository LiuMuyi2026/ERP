'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import SecureFileLink from '@/components/ui/SecureFileLink';

// ── Step Type System ──────────────────────────────────────────────────────────

export type StepType = 'checklist' | 'file_upload' | 'approval' | 'data_input' | 'supplier_select' | 'custom';

export interface StepProps {
  leadId: string;
  stageKey: string;
  stepKey: string;
  stepLabel: string;
  stepDesc?: string;
  isDone: boolean;
  stepData: Record<string, any>;
  onSaveStepData: (key: string, data: Record<string, any>) => Promise<void>;
  onToggleStep: (key: string) => void;
  /** Current user info */
  currentUser: { id: string; name?: string; role?: string };
  /** All tenant users for assignment dropdowns */
  users?: { id: string; full_name: string; email: string }[];
  /** Step definition from template */
  stepDef?: {
    fields?: { key: string; label: string; type?: string; options?: string[] }[];
    checklist_items?: { key: string; label: string }[];
    file_category?: string;
    approver_role?: string;
  };
}

export type StepRenderer = React.FC<StepProps>;

// ── Generic Renderers ─────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
const inputStyle = { background: 'var(--notion-hover)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' };

/** Checklist step — simple items to tick off */
export function ChecklistStep({ stepKey, isDone, stepData, onSaveStepData, stepDef }: StepProps) {
  const items = stepDef?.checklist_items ?? [];
  const checked: Record<string, boolean> = stepData?.checked ?? {};

  async function toggle(itemKey: string) {
    const next = { ...checked, [itemKey]: !checked[itemKey] };
    await onSaveStepData(stepKey, { checked: next });
  }

  if (!items.length) {
    return <p className="text-xs italic" style={{ color: 'var(--notion-text-muted)' }}>No checklist items configured.</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <label key={item.key} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--notion-text)' }}>
          <input type="checkbox" checked={!!checked[item.key]} onChange={() => toggle(item.key)} disabled={isDone} />
          <span className={checked[item.key] ? 'line-through opacity-60' : ''}>{item.label}</span>
        </label>
      ))}
    </div>
  );
}

/** File upload step — upload one or more files */
export function FileUploadStep({ stepKey, leadId, isDone, stepData, onSaveStepData, stepDef, currentUser }: StepProps) {
  const files: { name: string; url: string }[] = stepData?.files ?? [];
  const [uploading, setUploading] = useState(false);
  const category = stepDef?.file_category ?? 'other';

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.upload(`/crm/lead-files/${leadId}/upload?category=${category}`, file);
      const newFile = { name: file.name, url: result.file_url || result.url || '' };
      await onSaveStepData(stepKey, {
        files: [...files, newFile],
        uploaded_by: currentUser.name ?? currentUser.id,
        uploaded_at: new Date().toISOString(),
      });
    } catch {
      // error handled by api layer
    } finally {
      setUploading(false);
    }
  }, [files, leadId, stepKey, category, currentUser, onSaveStepData]);

  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <HandIcon name="document-pen" size={12} style={{ color: 'var(--notion-text-muted)' }} />
          <SecureFileLink url={f.url} name={f.name} className="text-blue-600 hover:underline" />
        </div>
      ))}
      {!isDone && (
        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
          style={{ border: '1px dashed var(--notion-border)', color: 'var(--notion-accent)' }}>
          {uploading ? 'Uploading...' : '+ Upload File'}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      )}
    </div>
  );
}

/** Approval step — submit for approval with content and status tracking */
export function ApprovalStep({ stepKey, isDone, stepData, onSaveStepData, stepDef, currentUser, users }: StepProps) {
  const status = stepData?.status ?? 'draft';
  const content = stepData?.content ?? '';
  const [editContent, setEditContent] = useState(content);

  async function submitForApproval() {
    await onSaveStepData(stepKey, {
      ...stepData,
      content: editContent,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    });
  }

  async function decide(decision: 'approved' | 'rejected') {
    await onSaveStepData(stepKey, {
      ...stepData,
      status: decision,
      [`${decision}_at`]: new Date().toISOString(),
      [`${decision}_by`]: currentUser.name ?? currentUser.id,
    });
  }

  return (
    <div className="space-y-2">
      {status === 'draft' && !isDone && (
        <>
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
            className={inputCls} style={inputStyle} rows={3} placeholder="Approval details..." />
          <button onClick={submitForApproval}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: 'var(--notion-accent)' }}>
            Submit for Approval
          </button>
        </>
      )}
      {status === 'pending' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">Pending</span>
            <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
              Submitted {stepData?.submitted_at ? new Date(stepData.submitted_at).toLocaleDateString() : ''}
            </span>
          </div>
          {stepData?.content && <p className="text-xs" style={{ color: 'var(--notion-text)' }}>{stepData.content}</p>}
          <div className="flex gap-2">
            <button onClick={() => decide('approved')}
              className="px-3 py-1 rounded-lg text-xs font-medium text-white bg-green-600">
              Approve
            </button>
            <button onClick={() => decide('rejected')}
              className="px-3 py-1 rounded-lg text-xs font-medium text-white bg-red-500">
              Reject
            </button>
          </div>
        </div>
      )}
      {status === 'approved' && (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Approved</span>
          <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
            by {stepData?.approved_by ?? '—'} on {stepData?.approved_at ? new Date(stepData.approved_at).toLocaleDateString() : ''}
          </span>
        </div>
      )}
      {status === 'rejected' && (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">Rejected</span>
          <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
            by {stepData?.rejected_by ?? '—'}
          </span>
        </div>
      )}
    </div>
  );
}

/** Data input step — configurable form fields */
export function DataInputStep({ stepKey, isDone, stepData, onSaveStepData, stepDef }: StepProps) {
  const fields = stepDef?.fields ?? [];
  const [formData, setFormData] = useState<Record<string, any>>(stepData ?? {});

  async function save() {
    await onSaveStepData(stepKey, { ...formData, saved_at: new Date().toISOString() });
  }

  if (!fields.length) {
    return <p className="text-xs italic" style={{ color: 'var(--notion-text-muted)' }}>No fields configured.</p>;
  }

  return (
    <div className="space-y-3">
      {fields.map(field => (
        <div key={field.key}>
          <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: 'var(--notion-text-muted)' }}>
            {field.label}
          </label>
          {field.type === 'select' && field.options ? (
            <select value={formData[field.key] ?? ''} onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
              className={inputCls} style={inputStyle} disabled={isDone}>
              <option value="">—</option>
              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea value={formData[field.key] ?? ''} onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
              className={inputCls} style={inputStyle} rows={3} disabled={isDone} />
          ) : field.type === 'checkbox' ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!formData[field.key]}
                onChange={e => setFormData({ ...formData, [field.key]: e.target.checked })} disabled={isDone} />
              <span className="text-sm" style={{ color: 'var(--notion-text)' }}>{field.label}</span>
            </label>
          ) : (
            <input value={formData[field.key] ?? ''} onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
              className={inputCls} style={inputStyle} disabled={isDone}
              type={field.type === 'number' ? 'number' : 'text'} />
          )}
        </div>
      ))}
      {!isDone && (
        <button onClick={save}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ background: 'var(--notion-accent)' }}>
          Save
        </button>
      )}
    </div>
  );
}

/** Supplier selection step */
export function SupplierSelectStep({ stepKey, isDone, stepData, onSaveStepData }: StepProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  async function doSearch() {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const data = await api.get(`/inventory/suppliers?search=${encodeURIComponent(search)}&limit=10`);
      setResults(Array.isArray(data) ? data : data.items ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function selectSupplier(supplier: any) {
    await onSaveStepData(stepKey, {
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      confirmed: true,
      confirmed_at: new Date().toISOString(),
    });
  }

  if (stepData?.confirmed || isDone) {
    return (
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
          {stepData?.supplier_name ?? 'Selected'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
          className={inputCls} style={inputStyle} placeholder="Search suppliers..." />
        <button onClick={doSearch}
          className="px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
          style={{ background: 'var(--notion-hover)', color: 'var(--notion-text)' }}>
          {searching ? '...' : 'Search'}
        </button>
      </div>
      {results.map(s => (
        <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors"
          style={{ border: '1px solid var(--notion-border)' }}
          onClick={() => selectSupplier(s)}>
          <div>
            <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{s.name}</span>
            {s.contact_person && <span className="text-xs ml-2" style={{ color: 'var(--notion-text-muted)' }}>{s.contact_person}</span>}
          </div>
          <span className="text-xs" style={{ color: 'var(--notion-accent)' }}>Select</span>
        </div>
      ))}
    </div>
  );
}

// ── Registry ──────────────────────────────────────────────────────────────────

const STEP_RENDERERS: Record<StepType, StepRenderer> = {
  checklist: ChecklistStep,
  file_upload: FileUploadStep,
  approval: ApprovalStep,
  data_input: DataInputStep,
  supplier_select: SupplierSelectStep,
  custom: () => null, // custom steps are handled by existing key-based rendering
};

/**
 * Get the renderer for a step type. Returns null for 'custom' or unknown types,
 * meaning the existing key-based rendering should handle it.
 */
export function getStepRenderer(type?: string): StepRenderer | null {
  if (!type || type === 'custom') return null;
  return STEP_RENDERERS[type as StepType] ?? null;
}

/**
 * StepRendererComponent — renders a step using the type-based registry.
 * If the step has no type or type='custom', returns null so the caller
 * can fall through to existing key-based rendering.
 */
export function StepRendererComponent({ type, ...props }: StepProps & { type?: string }) {
  const Renderer = getStepRenderer(type);
  if (!Renderer) return null;
  return <Renderer {...props} />;
}
