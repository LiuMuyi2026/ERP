'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import DynamicForm, { validateForm } from '@/components/ui/DynamicForm';

interface FieldDef {
  fieldname: string;
  fieldtype: string;
  label: string;
  options?: string;
  reqd?: boolean;
  hidden?: boolean;
  read_only?: boolean;
  in_list_view?: boolean;
  in_standard_filter?: boolean;
  default?: string;
  description?: string;
}

interface ModuleDef {
  id: string;
  module: string;
  doctype: string;
  label: string;
  label_plural: string;
  icon: string;
  fields: FieldDef[];
  list_settings: any;
  form_settings: any;
  workflow_settings: any;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: '#dcfce7', color: '#15803d' }, approved: { bg: '#dcfce7', color: '#15803d' },
  paid: { bg: '#dcfce7', color: '#15803d' }, posted: { bg: '#dcfce7', color: '#15803d' },
  converted: { bg: '#dcfce7', color: '#15803d' }, completed: { bg: '#dcfce7', color: '#15803d' },
  qualified: { bg: '#dbeafe', color: '#1d4ed8' }, sent: { bg: '#dbeafe', color: '#1d4ed8' },
  pending: { bg: '#fef9c3', color: '#a16207' }, quoted: { bg: '#fef9c3', color: '#a16207' },
  partial: { bg: '#ffedd5', color: '#c2410c' }, negotiating: { bg: '#ffedd5', color: '#c2410c' },
  overdue: { bg: '#fee2e2', color: '#dc2626' }, lost: { bg: '#fee2e2', color: '#dc2626' },
  rejected: { bg: '#fee2e2', color: '#dc2626' }, cancelled: { bg: '#fee2e2', color: '#dc2626' },
  draft: { bg: '#f3f4f6', color: '#6b7280' }, cold: { bg: '#f3f4f6', color: '#6b7280' },
  inquiry: { bg: '#ede9fe', color: '#7c3aed' },
};

export default function RecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const mod = params.module as string;
  const dt = params.doctype as string;
  const id = params.id as string;

  const [mdef, setMdef] = useState<ModuleDef | null>(null);
  const [record, setRecord] = useState<any>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [linkNames, setLinkNames] = useState<Record<string, Record<string, string>>>({});
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  // Load module definition
  useEffect(() => {
    api.get<ModuleDef>(`/api/module-defs/lookup/${mod}/${dt}`)
      .then(d => setMdef(d))
      .catch(() => setMdef(null));
  }, [mod, dt]);

  // Load record
  const loadRecord = useCallback(async () => {
    if (!mdef) return;
    setLoading(true);
    try {
      const rec = await api.get<any>(`/api/module-data/${mod}/${dt}/${id}`);
      setRecord(rec);
      setFormValues({ ...rec });
      setDirty(false);
    } catch {
      setRecord(null);
    }
    setLoading(false);
  }, [mdef, mod, dt, id]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  // Resolve Link fields
  useEffect(() => {
    if (!mdef || !record) return;
    const linkFields = mdef.fields.filter(f => f.fieldtype === 'Link' && f.options);
    if (linkFields.length === 0) return;
    const body: Record<string, string[]> = {};
    for (const lf of linkFields) {
      const v = record[lf.fieldname];
      if (v && typeof v === 'string') {
        if (!body[lf.options!]) body[lf.options!] = [];
        body[lf.options!].push(v);
      }
    }
    if (Object.keys(body).length === 0) return;
    api.post<Record<string, Record<string, string>>>(`/api/module-data/${mod}/${dt}/resolve-links`, body)
      .then(setLinkNames).catch(() => {});
  }, [mdef, record, mod, dt]);

  // Load audit logs
  const loadAuditLogs = useCallback(() => {
    if (!mdef || !id) return;
    api.get<{ logs: any[] }>(`/api/module-data/${mod}/${dt}/audit/${id}`)
      .then(r => setAuditLogs(r.logs || []))
      .catch(() => {});
  }, [mdef, mod, dt, id]);

  useEffect(() => { if (showAudit) loadAuditLogs(); }, [showAudit, loadAuditLogs]);

  // Save
  const handleSave = async () => {
    if (!mdef) return;
    const errs = validateForm(mdef.fields, formValues);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      await api.patch(`/api/module-data/${mod}/${dt}/${id}`, formValues);
      await loadRecord();
      if (showAudit) loadAuditLogs();
    } catch (err: any) {
      alert('保存失败: ' + (err.message || err));
    } finally { setSaving(false); }
  };

  // Delete
  const handleDelete = async () => {
    if (!confirm('确定要删除这条记录吗？此操作不可撤销。')) return;
    try {
      await api.delete(`/api/module-data/${mod}/${dt}/${id}`);
      router.push(`/${tenant}/modules/${mod}/${dt}`);
    } catch (err: any) { alert(err.message); }
  };

  // Status transition buttons
  const statusField = mdef?.workflow_settings?.status_field || 'status';
  const statusFieldDef = mdef?.fields.find(f => f.fieldname === statusField && f.fieldtype === 'Select');
  const statusOptions = statusFieldDef?.options?.split('\n').filter(Boolean) || [];
  const currentStatus = formValues[statusField] || '';

  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    try {
      await api.patch(`/api/module-data/${mod}/${dt}/${id}`, { [statusField]: newStatus });
      await loadRecord();
    } catch (err: any) {
      alert('状态更新失败: ' + (err.message || err));
    } finally { setSaving(false); }
  };

  if (loading && !mdef) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#9B9A97' }}>
      <svg className="animate-spin mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      加载中...
    </div>
  );

  if (!mdef) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#9B9A97' }}>模块未找到</div>
  );

  if (!loading && !record) return (
    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#9B9A97' }}>
      <p>记录未找到</p>
      <button onClick={() => router.push(`/${tenant}/modules/${mod}/${dt}`)}
        className="px-4 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>
        返回列表
      </button>
    </div>
  );

  // Get title
  const titleFieldName = mdef.form_settings?.title_field;
  const title = titleFieldName && record?.[titleFieldName]
    ? record[titleFieldName]
    : mdef.fields.find(f => f.fieldtype === 'Data' && f.in_list_view)
      ? record?.[mdef.fields.find(f => f.fieldtype === 'Data' && f.in_list_view)!.fieldname] || id.slice(0, 8)
      : id.slice(0, 8);

  const sc = STATUS_COLORS[currentStatus] || { bg: '#f3f4f6', color: '#6b7280' };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--notion-bg)' }}>
      {/* Breadcrumb + Actions */}
      <div className="flex items-center justify-between px-8 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div className="flex items-center gap-2">
          {/* Breadcrumb */}
          <button onClick={() => router.push(`/${tenant}/modules/${mod}/${dt}`)}
            className="text-sm transition-colors"
            style={{ color: '#9B9A97' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--notion-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = '#9B9A97')}>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              {mdef.label_plural || mdef.label}
            </span>
          </button>
          <span style={{ color: '#d1d5db' }}>/</span>
          <div className="flex items-center gap-2">
            <HandIcon name={mdef.icon || 'folder'} size={16} style={{ color: '#7c3aed' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{title}</span>
          </div>
          {/* Status badge */}
          {currentStatus && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ml-2"
              style={{ background: sc.bg, color: sc.color }}>
              {currentStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Status transition buttons */}
          {statusOptions.length > 1 && (
            <div className="flex items-center gap-1 mr-2">
              {statusOptions.filter(s => s !== currentStatus).slice(0, 3).map(s => {
                const c = STATUS_COLORS[s] || { bg: '#f3f4f6', color: '#6b7280' };
                return (
                  <button key={s} onClick={() => handleStatusChange(s)} disabled={saving}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
                    style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}>
                    → {s}
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={handleDelete}
            className="px-3 py-2 rounded-xl text-sm transition-colors"
            style={{ color: '#ef4444', border: '1px solid #fecaca' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            删除
          </button>
          <button onClick={handleSave} disabled={saving || !dirty}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-colors"
            style={{ background: '#7c3aed' }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20" style={{ color: '#9B9A97' }}>
              <svg className="animate-spin mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              加载中...
            </div>
          ) : (
            <DynamicForm
              fields={mdef.fields}
              values={formValues}
              onChange={(fn, v) => {
                setFormValues(prev => ({ ...prev, [fn]: v }));
                setDirty(true);
                if (formErrors[fn]) setFormErrors(prev => { const n = { ...prev }; delete n[fn]; return n; });
              }}
              errors={formErrors}
              linkContext={{ module: mod, doctype: dt }}
              linkNames={linkNames}
            />
          )}

          {/* Metadata */}
          {record && (
            <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--notion-border)' }}>
              <div className="grid grid-cols-2 gap-4 text-[11px]" style={{ color: '#9B9A97' }}>
                {record.created_at && (
                  <div>
                    <span className="uppercase tracking-wide">创建时间</span>
                    <p className="font-medium mt-0.5">{new Date(record.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                )}
                {record.updated_at && (
                  <div>
                    <span className="uppercase tracking-wide">更新时间</span>
                    <p className="font-medium mt-0.5">{new Date(record.updated_at).toLocaleString('zh-CN')}</p>
                  </div>
                )}
                {record.created_by && (
                  <div>
                    <span className="uppercase tracking-wide">创建者</span>
                    <p className="font-medium mt-0.5">{record.created_by}</p>
                  </div>
                )}
                <div>
                  <span className="uppercase tracking-wide">ID</span>
                  <p className="font-mono font-medium mt-0.5">{record.id}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
