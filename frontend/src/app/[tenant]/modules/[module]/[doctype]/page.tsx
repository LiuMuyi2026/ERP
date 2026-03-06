'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getApiUrl, getAuthHeaders } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import DynamicTable from '@/components/ui/DynamicTable';
import DynamicKanban from '@/components/ui/DynamicKanban';
import DynamicForm, { validateForm } from '@/components/ui/DynamicForm';
import SlideOver from '@/components/ui/SlideOver';

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

interface ListResponse {
  records: any[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: '#dcfce7', color: '#15803d' }, approved: { bg: '#dcfce7', color: '#15803d' },
  paid: { bg: '#dcfce7', color: '#15803d' }, posted: { bg: '#dcfce7', color: '#15803d' },
  converted: { bg: '#dcfce7', color: '#15803d' }, completed: { bg: '#dcfce7', color: '#15803d' },
  qualified: { bg: '#dbeafe', color: '#1d4ed8' }, sent: { bg: '#dbeafe', color: '#1d4ed8' },
  replied: { bg: '#dbeafe', color: '#1d4ed8' },
  pending: { bg: '#fef9c3', color: '#a16207' }, quoted: { bg: '#fef9c3', color: '#a16207' },
  partial: { bg: '#ffedd5', color: '#c2410c' }, negotiating: { bg: '#ffedd5', color: '#c2410c' },
  overdue: { bg: '#fee2e2', color: '#dc2626' }, lost: { bg: '#fee2e2', color: '#dc2626' },
  rejected: { bg: '#fee2e2', color: '#dc2626' }, cancelled: { bg: '#fee2e2', color: '#dc2626' },
  draft: { bg: '#f3f4f6', color: '#6b7280' }, cold: { bg: '#f3f4f6', color: '#6b7280' },
  inquiry: { bg: '#ede9fe', color: '#7c3aed' }, procuring: { bg: '#ede9fe', color: '#7c3aed' },
};

export default function DynamicModulePage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const mod = params.module as string;
  const dt = params.doctype as string;

  const [mdef, setMdef] = useState<ModuleDef | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [extraFilters, setExtraFilters] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<any>(null);
  const [linkNames, setLinkNames] = useState<Record<string, Record<string, string>>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[]; total_rows: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // View mode
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  // SlideOver states
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Load module definition
  useEffect(() => {
    api.get<ModuleDef>(`/api/module-defs/lookup/${mod}/${dt}`)
      .then(d => setMdef(d))
      .catch(() => setMdef(null));
  }, [mod, dt]);

  // Load data
  const loadData = useCallback(async () => {
    if (!mdef) return;
    setLoading(true);
    try {
      const params: any = { page, page_size: 50 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      // Include extra filters
      const activeExtraFilters = Object.fromEntries(Object.entries(extraFilters).filter(([, v]) => v));
      if (Object.keys(activeExtraFilters).length > 0) {
        params.filters = JSON.stringify(activeExtraFilters);
      }
      const qs = new URLSearchParams(params).toString();
      const resp = await api.get<ListResponse>(`/api/module-data/${mod}/${dt}?${qs}`);
      setData(resp.records || []);
      setTotal(resp.total || 0);
      setTotalPages(resp.total_pages || 1);
    } catch { setData([]); }
    setLoading(false);
  }, [mdef, mod, dt, page, search, statusFilter, extraFilters]);

  useEffect(() => { loadData(); }, [loadData]);

  // Resolve Link field IDs to display names
  useEffect(() => {
    if (!mdef || data.length === 0) return;
    const linkFields = mdef.fields.filter(f => f.fieldtype === 'Link' && f.options);
    if (linkFields.length === 0) return;
    // Collect IDs per link type
    const idsByType: Record<string, Set<string>> = {};
    for (const lf of linkFields) {
      const linkType = lf.options!;
      if (!idsByType[linkType]) idsByType[linkType] = new Set();
      for (const row of data) {
        const v = row[lf.fieldname];
        if (v && typeof v === 'string') idsByType[linkType].add(v);
      }
    }
    const body: Record<string, string[]> = {};
    for (const [lt, ids] of Object.entries(idsByType)) {
      if (ids.size > 0) body[lt] = Array.from(ids);
    }
    if (Object.keys(body).length === 0) return;
    api.post<Record<string, Record<string, string>>>(`/api/module-data/${mod}/${dt}/resolve-links`, body)
      .then(resolved => setLinkNames(prev => {
        const merged = { ...prev };
        for (const [lt, mapping] of Object.entries(resolved)) {
          merged[lt] = { ...(merged[lt] || {}), ...mapping };
        }
        return merged;
      }))
      .catch(() => {});
  }, [mdef, data, mod, dt]);

  // Load stats
  useEffect(() => {
    if (!mdef) return;
    api.get(`/api/module-data/${mod}/${dt}/stats/summary`).then(setStats).catch(() => {});
  }, [mdef, mod, dt]);

  // Navigate to record detail page
  const openRecord = (row: any) => {
    router.push(`/${tenant}/modules/${mod}/${dt}/${row.id}`);
  };

  // Open new record form
  const openNew = () => {
    if (!mdef) return;
    const defaults: Record<string, any> = {};
    for (const f of mdef.fields) {
      if (f.default) defaults[f.fieldname] = f.default;
    }
    setSelectedRecord({});
    setFormValues(defaults);
    setFormErrors({});
    setIsNew(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!mdef) return;
    // Validate required fields
    const errs = validateForm(mdef.fields, formValues);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      if (isNew) {
        await api.post(`/api/module-data/${mod}/${dt}`, formValues);
      } else {
        await api.patch(`/api/module-data/${mod}/${dt}/${selectedRecord.id}`, formValues);
      }
      setSelectedRecord(null);
      setFormErrors({});
      loadData();
      // Refresh stats
      api.get(`/api/module-data/${mod}/${dt}/stats/summary`).then(setStats).catch(() => {});
    } catch (err: any) {
      alert('保存失败: ' + (err.message || err));
    } finally { setSaving(false); }
  };

  // Status change (kanban drag-and-drop)
  const handleStatusChange = async (recordId: string, newStatus: string) => {
    if (!mdef) return;
    const sf = mdef.workflow_settings?.status_field || 'status';
    try {
      await api.patch(`/api/module-data/${mod}/${dt}/${recordId}`, { [sf]: newStatus });
      // Optimistically update local data
      setData(prev => prev.map(r => r.id === recordId ? { ...r, [sf]: newStatus } : r));
      // Refresh stats
      api.get(`/api/module-data/${mod}/${dt}/stats/summary`).then(setStats).catch(() => {});
    } catch (err: any) {
      alert('状态更新失败: ' + (err.message || err));
      loadData(); // revert by reloading
    }
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？`)) return;
    try {
      await api.post(`/api/module-data/${mod}/${dt}/batch/delete`, { ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      loadData();
      api.get(`/api/module-data/${mod}/${dt}/stats/summary`).then(setStats).catch(() => {});
    } catch (err: any) { alert('批量删除失败: ' + (err.message || err)); }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (!mdef || selectedIds.size === 0) return;
    const sf = mdef.workflow_settings?.status_field || 'status';
    try {
      await api.post(`/api/module-data/${mod}/${dt}/batch/update`, {
        ids: Array.from(selectedIds),
        data: { [sf]: newStatus },
      });
      setSelectedIds(new Set());
      loadData();
      api.get(`/api/module-data/${mod}/${dt}/stats/summary`).then(setStats).catch(() => {});
    } catch (err: any) { alert('批量更新失败: ' + (err.message || err)); }
  };

  // Export CSV
  const handleExport = async () => {
    if (!mdef) return;
    const params: any = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    const activeExtraFilters = Object.fromEntries(Object.entries(extraFilters).filter(([, v]) => v));
    if (Object.keys(activeExtraFilters).length > 0) params.filters = JSON.stringify(activeExtraFilters);
    const qs = new URLSearchParams(params).toString();
    const url = `${getApiUrl()}/api/module-data/${mod}/${dt}/export/csv${qs ? '?' + qs : ''}`;
    const headers = getAuthHeaders();
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${mod}_${dt}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) { alert('导出失败: ' + (err.message || err)); }
  };

  // Import CSV
  const handleImport = async (file: File) => {
    if (!mdef) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = `${getApiUrl()}/api/module-data/${mod}/${dt}/import/csv`;
      const headers = getAuthHeaders();
      const resp = await fetch(url, { method: 'POST', headers, body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Import failed' }));
        throw new Error(err.detail || 'Import failed');
      }
      const result = await resp.json();
      setImportResult(result);
      if (result.created > 0) {
        loadData();
        api.get(`/api/module-data/${mod}/${dt}/stats/summary`).then(setStats).catch(() => {});
      }
    } catch (err: any) { alert('导入失败: ' + (err.message || err)); }
    finally { setImporting(false); }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除吗？')) return;
    try {
      await api.delete(`/api/module-data/${mod}/${dt}/${id}`);
      loadData();
    } catch (err: any) { alert(err.message); }
  };

  if (!mdef) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#9B9A97' }}>
      {loading ? (
        <>
          <svg className="animate-spin mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          加载中...
        </>
      ) : '模块未找到'}
    </div>
  );

  // Extract status options for filter
  const statusField = mdef.fields.find(f => f.fieldname === (mdef.workflow_settings?.status_field || 'status') && f.fieldtype === 'Select');
  const statusOptions = statusField?.options?.split('\n').filter(Boolean) || [];

  // Extract filter fields (Select fields marked as in_standard_filter, excluding the main status field)
  const sfName = mdef.workflow_settings?.status_field || 'status';
  const filterFields = mdef.fields.filter(f => f.in_standard_filter && f.fieldtype === 'Select' && f.fieldname !== sfName);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--notion-bg)' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
            <HandIcon name={mdef.icon || 'folder'} size={18} style={{ color: 'white' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>
              {mdef.label_plural || mdef.label}
            </h1>
            <p className="text-xs" style={{ color: '#9B9A97' }}>
              共 {total} 条记录
              {stats?.by_status && Object.keys(stats.by_status).length > 0 && (
                <> · {Object.entries(stats.by_status).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View switcher */}
          {statusOptions.length > 0 && (
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
              <button onClick={() => setViewMode('table')}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{ background: viewMode === 'table' ? '#7c3aed' : 'transparent', color: viewMode === 'table' ? 'white' : 'var(--notion-text-muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" />
                </svg>
                表格
              </button>
              <button onClick={() => setViewMode('kanban')}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{ background: viewMode === 'kanban' ? '#7c3aed' : 'transparent', color: viewMode === 'kanban' ? 'white' : 'var(--notion-text-muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }}>
                  <rect x="2" y="3" width="6" height="18" rx="1" /><rect x="9" y="3" width="6" height="12" rx="1" /><rect x="16" y="3" width="6" height="15" rx="1" />
                </svg>
                看板
              </button>
            </div>
          )}
          <input ref={importInputRef} type="file" accept=".csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
          <button onClick={() => importInputRef.current?.click()} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {importing ? '导入中...' : '导入'}
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: '#7c3aed' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新建{mdef.label}
          </button>
        </div>
      </div>

      {/* ── Stats dashboard ── */}
      {stats && (
        <div className="px-8 py-3 flex gap-3 flex-shrink-0 flex-wrap">
          {/* Total count card */}
          <div className="px-4 py-2.5 rounded-xl" style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9B9A97' }}>总数</p>
            <p className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>{stats.total}</p>
          </div>
          {/* Currency sum cards */}
          {Object.entries(stats).filter(([k]) => k.startsWith('sum_')).map(([k, v]) => {
            const fname = k.replace('sum_', '');
            const fmeta = mdef.fields.find(f => f.fieldname === fname);
            return (
              <div key={k} className="px-4 py-2.5 rounded-xl" style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9B9A97' }}>{fmeta?.label || fname}</p>
                <p className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>
                  ¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            );
          })}
          {/* Status donut chart + legend */}
          {stats.by_status && Object.keys(stats.by_status).length > 0 && (() => {
            const entries = Object.entries(stats.by_status as Record<string, number>);
            const total = entries.reduce((s, [, c]) => s + (c as number), 0);
            if (total === 0) return null;
            // Build donut segments
            const R = 40, CX = 50, CY = 50, STROKE = 14;
            const C = 2 * Math.PI * R;
            let offset = 0;
            const segments = entries.map(([status, count]) => {
              const pct = (count as number) / total;
              const dash = pct * C;
              const sc = STATUS_COLORS[status] || { bg: '#e5e7eb', color: '#9ca3af' };
              const seg = { status, count: count as number, pct, dash, gap: C - dash, offset, color: sc.color };
              offset += dash;
              return seg;
            });
            return (
              <div className="px-4 py-2.5 rounded-xl flex-1 flex items-center gap-4"
                style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                {/* SVG Donut */}
                <svg width="64" height="64" viewBox="0 0 100 100" className="flex-shrink-0">
                  <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--notion-border)" strokeWidth={STROKE} />
                  {segments.map(seg => (
                    <circle key={seg.status} cx={CX} cy={CY} r={R} fill="none"
                      stroke={seg.color} strokeWidth={STROKE}
                      strokeDasharray={`${seg.dash} ${seg.gap}`}
                      strokeDashoffset={-seg.offset}
                      transform={`rotate(-90 ${CX} ${CY})`}
                      style={{ transition: 'stroke-dasharray 0.3s, stroke-dashoffset 0.3s' }} />
                  ))}
                  <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
                    fontSize="16" fontWeight="bold" fill="var(--notion-text)">
                    {total}
                  </text>
                </svg>
                {/* Legend */}
                <div className="flex gap-x-4 gap-y-1 flex-wrap">
                  {segments.map(seg => {
                    const sc = STATUS_COLORS[seg.status] || { bg: '#f3f4f6', color: '#6b7280' };
                    return (
                      <button key={seg.status}
                        className="flex items-center gap-1.5 text-[11px] transition-colors rounded px-1 py-0.5"
                        style={{ color: sc.color }}
                        onClick={() => { setStatusFilter(prev => prev === seg.status ? '' : seg.status); setPage(1); }}
                        onMouseEnter={e => (e.currentTarget.style.background = sc.bg)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                        <span className="font-medium">{seg.status}</span>
                        <span className="font-bold">{seg.count}</span>
                        <span style={{ color: '#9B9A97' }}>({Math.round(seg.pct * 100)}%)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="px-8 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={`搜索${mdef.label}...`}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-card, white)' }} />
        </div>
        {statusOptions.length > 0 && (
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border outline-none"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-card, white)' }}>
            <option value="">全部状态</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {filterFields.map(ff => {
          const opts = (ff.options || '').split('\n').filter(Boolean);
          return (
            <select key={ff.fieldname}
              value={extraFilters[ff.fieldname] || ''}
              onChange={e => { setExtraFilters(prev => ({ ...prev, [ff.fieldname]: e.target.value })); setPage(1); }}
              className="px-3 py-2 text-sm rounded-lg border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-card, white)' }}>
              <option value="">全部{ff.label}</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        })}
        {/* Clear filters */}
        {(statusFilter || search || Object.values(extraFilters).some(Boolean)) && (
          <button onClick={() => { setSearch(''); setStatusFilter(''); setExtraFilters({}); setPage(1); }}
            className="px-3 py-2 text-xs rounded-lg transition-colors"
            style={{ color: '#9B9A97', border: '1px solid var(--notion-border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            清除筛选
          </button>
        )}
      </div>

      {/* ── Import result ── */}
      {importResult && (
        <div className="px-8 py-2 flex items-center justify-between flex-shrink-0"
          style={{ background: importResult.errors.length ? '#fef3c7' : '#dcfce7', borderBottom: '1px solid var(--notion-border)' }}>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium" style={{ color: importResult.errors.length ? '#92400e' : '#166534' }}>
              成功导入 {importResult.created}/{importResult.total_rows} 条记录
            </span>
            {importResult.errors.length > 0 && (
              <span className="text-xs" style={{ color: '#92400e' }}>
                ({importResult.errors.length} 个错误)
              </span>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="text-xs" style={{ color: '#9B9A97' }}>✕</button>
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="px-8 py-2 flex items-center gap-3 flex-shrink-0"
          style={{ background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>
          <span className="text-sm font-medium" style={{ color: '#7c3aed' }}>
            已选 {selectedIds.size} 项
          </span>
          <div className="flex items-center gap-2">
            {statusOptions.length > 0 && (
              <select
                defaultValue=""
                onChange={e => { if (e.target.value) handleBulkStatusChange(e.target.value); e.target.value = ''; }}
                className="px-2 py-1 text-xs rounded-lg border outline-none"
                style={{ borderColor: '#ddd6fe', color: '#7c3aed', background: 'white' }}>
                <option value="">批量改状态...</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <button onClick={handleBulkDelete}
              className="px-3 py-1 rounded-lg text-xs font-medium"
              style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca' }}>
              批量删除
            </button>
          </div>
          <button onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs" style={{ color: '#9B9A97' }}>
            取消选择
          </button>
        </div>
      )}

      {/* ── Data View ── */}
      <div className="flex-1 overflow-auto px-8 pb-4">
        {viewMode === 'kanban' && statusOptions.length > 0 ? (
          <DynamicKanban
            fields={mdef.fields}
            data={data}
            statusField={mdef.workflow_settings?.status_field || 'status'}
            statusOptions={statusOptions}
            statusColors={STATUS_COLORS}
            linkNames={linkNames}
            titleField={mdef.form_settings?.title_field}
            onCardClick={openRecord}
            onCreate={(status) => {
              openNew();
              if (status) setFormValues(prev => ({ ...prev, [mdef.workflow_settings?.status_field || 'status']: status }));
            }}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <DynamicTable
            fields={mdef.fields}
            data={data}
            statusColors={STATUS_COLORS}
            linkNames={linkNames}
            onRowClick={openRecord}
            onDelete={handleDelete}
            onCreate={openNew}
            createLabel={`+ 新建${mdef.label}`}
            emptyMessage={`暂无${mdef.label}数据`}
            loading={loading}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-30"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>
              上一页
            </button>
            <span className="text-sm" style={{ color: '#9B9A97' }}>
              {page} / {totalPages}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-30"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>
              下一页
            </button>
          </div>
        )}
      </div>

      {/* ── Record SlideOver ── */}
      <SlideOver open={!!selectedRecord} onClose={() => setSelectedRecord(null)}
        title={isNew ? `新建${mdef.label}` : `编辑${mdef.label}`} width="w-[560px]">
        <div className="p-6">
          <DynamicForm
            fields={mdef.fields}
            values={formValues}
            onChange={(fn, v) => {
              setFormValues(prev => ({ ...prev, [fn]: v }));
              // Clear field error on change
              if (formErrors[fn]) setFormErrors(prev => { const n = { ...prev }; delete n[fn]; return n; });
            }}
            errors={formErrors}
            linkContext={{ module: mod, doctype: dt }}
            linkNames={linkNames}
          />
          <div className="flex gap-2 mt-6 pt-4" style={{ borderTop: '1px solid var(--notion-border)' }}>
            <button onClick={() => setSelectedRecord(null)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>
              取消
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#7c3aed' }}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
