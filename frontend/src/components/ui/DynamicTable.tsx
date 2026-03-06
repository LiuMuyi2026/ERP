'use client';

import { useState, useMemo } from 'react';

/**
 * DynamicTable — renders a list/table view driven by module_definition field configs.
 *
 * Reads the `fields` array from a module_definition and shows columns where
 * `in_list_view === true`. Supports sort, status colors, and inline actions.
 */

export interface FieldDef {
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
  width?: string;
  sort_order?: number;
}

export interface DynamicTableProps {
  fields: FieldDef[];
  data: any[];
  statusColors?: Record<string, { bg: string; color: string }>;
  linkNames?: Record<string, Record<string, string>>;
  onRowClick?: (row: any) => void;
  onDelete?: (id: string) => void;
  onCreate?: () => void;
  createLabel?: string;
  emptyMessage?: string;
  loading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (!dir) return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40">
      <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
    </svg>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'asc' ? <path d="m7 9 5-5 5 5" /> : <path d="m7 15 5 5 5-5" />}
    </svg>
  );
}

const DEFAULT_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  // Greens
  active: { bg: '#dcfce7', color: '#15803d' }, approved: { bg: '#dcfce7', color: '#15803d' },
  paid: { bg: '#dcfce7', color: '#15803d' }, posted: { bg: '#dcfce7', color: '#15803d' },
  converted: { bg: '#dcfce7', color: '#15803d' }, completed: { bg: '#dcfce7', color: '#15803d' },
  // Blues
  qualified: { bg: '#dbeafe', color: '#1d4ed8' }, sent: { bg: '#dbeafe', color: '#1d4ed8' },
  replied: { bg: '#dbeafe', color: '#1d4ed8' },
  // Yellows
  pending: { bg: '#fef9c3', color: '#a16207' }, quoted: { bg: '#fef9c3', color: '#a16207' },
  on_leave: { bg: '#fef9c3', color: '#a16207' },
  // Oranges
  partial: { bg: '#ffedd5', color: '#c2410c' }, negotiating: { bg: '#ffedd5', color: '#c2410c' },
  overdue: { bg: '#fee2e2', color: '#dc2626' },
  // Reds
  lost: { bg: '#fee2e2', color: '#dc2626' }, rejected: { bg: '#fee2e2', color: '#dc2626' },
  cancelled: { bg: '#fee2e2', color: '#dc2626' }, terminated: { bg: '#fee2e2', color: '#dc2626' },
  // Grays
  draft: { bg: '#f3f4f6', color: '#6b7280' }, cold: { bg: '#f3f4f6', color: '#6b7280' },
  resigned: { bg: '#f3f4f6', color: '#6b7280' },
  // Purple
  inquiry: { bg: '#ede9fe', color: '#7c3aed' }, procuring: { bg: '#ede9fe', color: '#7c3aed' },
  // Cyan/Teal
  booking: { bg: '#cffafe', color: '#0891b2' }, fulfillment: { bg: '#ccfbf1', color: '#0d9488' },
  payment: { bg: '#fef3c7', color: '#d97706' },
};

export default function DynamicTable({
  fields, data, statusColors, linkNames, onRowClick, onDelete, onCreate, createLabel = '+ 新建', emptyMessage = '暂无数据', loading,
  selectable, selectedIds, onSelectionChange,
}: DynamicTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const mergedColors = useMemo(() => ({ ...DEFAULT_STATUS_COLORS, ...statusColors }), [statusColors]);

  // Only show columns where in_list_view=true, skip layout fields
  const columns = useMemo(() =>
    fields.filter(f => f.in_list_view && !['Section Break', 'Column Break', 'Tab Break'].includes(f.fieldtype)),
    [fields]
  );

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = av == null ? -1 : bv == null ? 1 : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  function renderCell(field: FieldDef, row: any) {
    const val = row[field.fieldname];

    if (field.fieldtype === 'Link' && field.options && val) {
      const resolved = linkNames?.[field.options]?.[val];
      return (
        <span className="text-sm" style={{ color: '#7c3aed' }}>
          {resolved || val.slice(0, 8) + '…'}
        </span>
      );
    }

    if (field.fieldtype === 'Select') {
      const display = val ?? '';
      const colors = mergedColors[display] || { bg: '#f3f4f6', color: '#6b7280' };
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ background: colors.bg, color: colors.color }}>
          {display || '—'}
        </span>
      );
    }
    if (field.fieldtype === 'Check') return val ? '✓' : '—';
    if (field.fieldtype === 'Date' && val) {
      try { return new Date(val).toLocaleDateString('zh-CN'); } catch { return String(val); }
    }
    if (field.fieldtype === 'Datetime' && val) {
      try { return new Date(val).toLocaleString('zh-CN'); } catch { return String(val); }
    }
    if (field.fieldtype === 'Currency' && val != null) {
      return Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (field.fieldtype === 'Int' && val != null) return Number(val).toLocaleString();
    if (field.fieldtype === 'Float' && val != null) return Number(val).toLocaleString('zh-CN', { maximumFractionDigits: 4 });

    return val == null || val === '' ? '—' : String(val);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: '#9B9A97' }}>
      <svg className="animate-spin mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      加载中...
    </div>
  );

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--notion-border)' }}>
              {selectable && (
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox"
                    checked={sorted.length > 0 && selectedIds?.size === sorted.length}
                    onChange={e => {
                      if (e.target.checked) onSelectionChange?.(new Set(sorted.map(r => r.id)));
                      else onSelectionChange?.(new Set());
                    }}
                    className="w-3.5 h-3.5 rounded" />
                </th>
              )}
              {columns.map(col => (
                <th key={col.fieldname}
                  className="group text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: 'var(--notion-text-muted)', width: col.width || undefined }}
                  onClick={() => toggleSort(col.fieldname)}>
                  <div className="flex items-center gap-1">
                    {col.label}
                    <SortIcon dir={sortKey === col.fieldname ? sortDir : null} />
                  </div>
                </th>
              ))}
              <th className="w-20 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const isSelected = selectedIds?.has(row.id);
              return (
              <tr key={row.id}
                className="group border-b last:border-0 cursor-pointer transition-colors"
                style={{ borderColor: 'var(--notion-border)', background: isSelected ? 'var(--notion-active, #f3f0ff)' : undefined }}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--notion-sidebar)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                {selectable && (
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={!!isSelected}
                      onChange={e => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(row.id); else next.delete(row.id);
                        onSelectionChange?.(next);
                      }}
                      className="w-3.5 h-3.5 rounded" />
                  </td>
                )}
                {columns.map((col, ci) => (
                  <td key={col.fieldname} className="px-4 py-2.5 text-sm"
                    style={{ color: ci === 0 ? 'var(--notion-text)' : 'var(--notion-text-muted)' }}>
                    {ci === 0
                      ? <span className="font-medium" style={{ color: 'var(--notion-text)' }}>{renderCell(col, row)}</span>
                      : renderCell(col, row)}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                    {onRowClick && (
                      <button onClick={e => { e.stopPropagation(); onRowClick(row); }}
                        className="px-2 py-1 rounded text-xs" style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-active)' }}>
                        查看
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={e => { e.stopPropagation(); onDelete(row.id); }}
                        className="px-2 py-1 rounded text-xs" style={{ color: '#ef4444', background: '#fef2f2' }}>
                        删除
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-14 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
          {emptyMessage}
        </div>
      )}

      {onCreate && (
        <div style={{ borderTop: sorted.length > 0 ? '1px solid var(--notion-border)' : 'none' }}>
          <button onClick={onCreate}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
            style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-sidebar)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {createLabel}
          </button>
        </div>
      )}
    </div>
  );
}
