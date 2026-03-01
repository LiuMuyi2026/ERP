'use client';

import { useState, useRef, useEffect } from 'react';

export type ColumnType = 'text' | 'status' | 'date' | 'number' | 'mono';

export interface Column<T> {
  key: keyof T;
  label: string;
  type?: ColumnType;
  width?: string;
  render?: (value: any, row: T) => React.ReactNode;
}

export interface NotionTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  onEdit?: (id: string, field: string, value: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCreate?: () => void;
  createLabel?: string;
  statusColors?: Record<string, string>;
  emptyMessage?: string;
  rowActions?: (row: T) => React.ReactNode;
}

interface EditState {
  rowId: string;
  field: string;
  value: string;
}

function StatusBadge({ value, statusColors }: { value: string; statusColors?: Record<string, string> }) {
  const cls = statusColors?.[value] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {value}
    </span>
  );
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

export default function NotionTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  onEdit,
  onDelete,
  onCreate,
  createLabel = '+ New',
  statusColors,
  emptyMessage = 'No records yet.',
  rowActions,
}: NotionTableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editing, setEditing] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  function toggleSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey] as any;
        const bv = b[sortKey] as any;
        const cmp = av == null ? -1 : bv == null ? 1 : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  async function commitEdit() {
    if (!editing || !onEdit) return;
    setSavingEdit(true);
    try {
      await onEdit(editing.rowId, editing.field, editing.value);
    } finally {
      setSavingEdit(false);
      setEditing(null);
    }
  }

  function startEdit(rowId: string, field: string, currentValue: any, e: React.MouseEvent) {
    if (!onEdit) return;
    e.stopPropagation();
    setEditing({ rowId, field, value: String(currentValue ?? '') });
  }

  function renderCell(col: Column<T>, row: T) {
    const raw = row[col.key];

    if (editing?.rowId === row.id && editing.field === String(col.key) && onEdit) {
      return (
        <input
          ref={editInputRef}
          value={editing.value}
          onChange={e => setEditing(prev => prev ? { ...prev, value: e.target.value } : null)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditing(null);
          }}
          onClick={e => e.stopPropagation()}
          disabled={savingEdit}
          className="w-full px-1 py-0.5 text-sm rounded border outline-none"
          style={{ borderColor: 'var(--notion-accent)', color: 'var(--notion-text)', background: 'var(--notion-card, white)' }}
        />
      );
    }

    if (col.render) return col.render(raw, row);

    if (col.type === 'status') {
      return <StatusBadge value={String(raw ?? '')} statusColors={statusColors} />;
    }

    if (col.type === 'date' && raw) {
      try { return new Date(raw as string).toLocaleDateString(); } catch { return String(raw); }
    }

    if (col.type === 'mono') {
      return <span className="font-mono">{String(raw ?? '—')}</span>;
    }

    const display = raw == null || raw === '' ? '—' : String(raw);
    if (!onEdit) return <span>{display}</span>;

    return (
      <span
        className="cursor-text hover:bg-yellow-50 rounded px-0.5 -mx-0.5 transition-colors"
        onClick={e => startEdit(row.id, String(col.key), raw, e)}
      >
        {display}
      </span>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
      <table className="w-full border-collapse" role="table" aria-label="Data table">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--notion-border)' }}>
            {columns.map(col => (
              <th
                key={String(col.key)}
                className="group text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                style={{ color: 'var(--notion-text-muted)', width: col.width }}
                onClick={() => toggleSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  <SortIcon dir={sortKey === col.key ? sortDir : null} />
                </div>
              </th>
            ))}
            {/* Action column */}
            <th className="w-28 px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr
              key={row.id}
              className="group border-b last:border-0 cursor-pointer transition-colors"
              style={{ borderColor: 'var(--notion-border)' }}
              onClick={() => onRowClick?.(row)}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-sidebar)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {columns.map((col, ci) => (
                <td
                  key={String(col.key)}
                  className="px-4 py-2.5 text-sm"
                  style={{ color: ci === 0 ? 'var(--notion-text)' : 'var(--notion-text-muted)' }}
                >
                  {ci === 0
                    ? <span className="font-medium" style={{ color: 'var(--notion-text)' }}>{renderCell(col, row)}</span>
                    : renderCell(col, row)
                  }
                </td>
              ))}
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                  {rowActions?.(row)}
                  {onRowClick && (
                    <button
                      onClick={e => { e.stopPropagation(); onRowClick(row); }}
                      className="px-2 py-1 rounded text-xs transition-colors"
                      style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-active)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--notion-active)')}
                    >
                      Open
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(row.id); }}
                      className="px-2 py-1 rounded text-xs transition-colors"
                      style={{ color: '#ef4444', background: '#fef2f2' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div className="text-center py-14 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
          {emptyMessage}
        </div>
      )}

      {onCreate && (
        <div style={{ borderTop: sorted.length > 0 ? '1px solid var(--notion-border)' : 'none' }}>
          <button
            onClick={onCreate}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
            style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-sidebar)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {createLabel}
          </button>
        </div>
      )}
    </div>
  );
}
