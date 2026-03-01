'use client';

import { useState, useRef, useCallback } from 'react';
import { DBColumn, DBRow, getOptionColor, generateRowId } from './types';
import { HandIcon } from '@/components/ui/HandIcon';

interface TableViewProps {
  columns: DBColumn[];
  rows: DBRow[];
  onRowsChange: (rows: DBRow[]) => void;
  onColumnsChange?: (columns: DBColumn[]) => void;
}

// ── Cell Renderer ─────────────────────────────────────────────────────────────

function SelectBadge({ value, col }: { value: string; col: DBColumn }) {
  const colors = getOptionColor(value, col.options);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium truncate max-w-full"
      style={{ background: colors.bg, color: colors.text }}>
      {value}
    </span>
  );
}

function CellView({ value, col }: { value: any; col: DBColumn }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: '#c9c9c7', fontStyle: 'italic', fontSize: 13 }}>Empty</span>;
  }
  switch (col.type) {
    case 'checkbox':
      return value ? <HandIcon name="checkmark" size={14} style={{ color: '#16a34a' }} /> : <span style={{ fontSize: 14 }}>☐</span>;
    case 'select':
    case 'status':
      return <SelectBadge value={String(value)} col={col} />;
    case 'multi_select':
      return (
        <div className="flex gap-1 flex-wrap">
          {String(value).split(',').filter(Boolean).map(v => (
            <SelectBadge key={v.trim()} value={v.trim()} col={col} />
          ))}
        </div>
      );
    case 'date':
      if (!value) return null;
      try { return <span style={{ fontSize: 13, color: '#374151' }}>{new Date(value).toLocaleDateString()}</span>; }
      catch { return <span style={{ fontSize: 13 }}>{value}</span>; }
    case 'url':
      return <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate" style={{ fontSize: 13 }}>{value}</a>;
    case 'number':
      return <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span>;
    case 'title':
      return <span className="font-medium" style={{ fontSize: 14, color: '#1a1a1a' }}>{value}</span>;
    default:
      return <span style={{ fontSize: 13, color: '#374151' }}>{String(value)}</span>;
  }
}

// ── Inline cell editor ────────────────────────────────────────────────────────

function CellEditor({ value, col, onSave, onCancel }: {
  value: any; col: DBColumn; onSave: (v: any) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(String(value ?? ''));
  const options = col.options?.map(o => (typeof o === 'string' ? o : o.value)) ?? [];

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onSave(col.type === 'number' ? Number(v) : v); }
    if (e.key === 'Escape') onCancel();
  };

  if (col.type === 'checkbox') {
    return (
      <input type="checkbox" checked={!!value} onChange={e => onSave(e.target.checked)} autoFocus
        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#7c3aed' }} />
    );
  }
  if (col.type === 'select' || col.type === 'status') {
    return (
      <select autoFocus value={v} onChange={e => { onSave(e.target.value); }}
        className="w-full text-sm outline-none rounded"
        style={{ background: '#faf9ff', border: '1.5px solid #7c3aed', padding: '4px 8px', fontSize: 13 }}
        onBlur={() => onSave(v)} onKeyDown={handleKey}
      >
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.type === 'date') {
    return <input type="date" autoFocus value={v} onChange={e => setV(e.target.value)}
      onBlur={() => onSave(v)} onKeyDown={handleKey}
      className="w-full text-sm outline-none rounded"
      style={{ background: '#faf9ff', border: '1.5px solid #7c3aed', padding: '4px 8px', fontSize: 13 }} />;
  }
  return (
    <input autoFocus value={v} onChange={e => setV(e.target.value)}
      onBlur={() => onSave(v)} onKeyDown={handleKey}
      type={col.type === 'number' ? 'number' : col.type === 'email' ? 'email' : col.type === 'url' ? 'url' : 'text'}
      className="w-full text-sm outline-none"
      style={{ background: '#faf9ff', border: '1.5px solid #7c3aed', padding: '4px 8px', fontSize: 13, borderRadius: 4 }} />
  );
}

// ── Type icon ─────────────────────────────────────────────────────────────────
const TYPE_ICON: Record<string, string> = {
  title: '𝐀', text: '¶', select: '◉', multi_select: '⊕', status: 'lightning',
  date: 'alarm-clock', number: '#', checkbox: '☑', url: 'link', email: 'envelope', person: 'person',
};

// ── Main Table View ───────────────────────────────────────────────────────────

export default function TableView({ columns, rows, onRowsChange, onColumnsChange }: TableViewProps) {
  const [editing, setEditing] = useState<{ rowId: string; colKey: string } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const commitCell = useCallback((rowId: string, colKey: string, value: any) => {
    const updated = rows.map(r => r._id === rowId ? { ...r, [colKey]: value } : r);
    onRowsChange(updated);
    setEditing(null);
  }, [rows, onRowsChange]);

  const addRow = useCallback(() => {
    const emptyRow: DBRow = { _id: generateRowId() };
    columns.forEach(c => { emptyRow[c.key] = c.type === 'checkbox' ? false : ''; });
    onRowsChange([...rows, emptyRow]);
  }, [rows, columns, onRowsChange]);

  const deleteRow = useCallback((rowId: string) => {
    onRowsChange(rows.filter(r => r._id !== rowId));
  }, [rows, onRowsChange]);

  // Sort + filter
  let displayRows = [...rows];
  if (filterText) {
    displayRows = displayRows.filter(r =>
      columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(filterText.toLowerCase()))
    );
  }
  if (sortKey) {
    displayRows.sort((a, b) => {
      const av = String(a[sortKey] ?? '').toLowerCase();
      const bv = String(b[sortKey] ?? '').toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', maxWidth: 240 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input value={filterText} onChange={e => setFilterText(e.target.value)}
            placeholder="Filter..." className="outline-none bg-transparent text-xs" style={{ color: 'var(--notion-text)', width: 160 }} />
        </div>
        <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
          {displayRows.length} {displayRows.length === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--notion-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f7f7f5' }}>
              {columns.map((col, ci) => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11,
                    color: 'var(--notion-text-muted)', borderBottom: '1px solid var(--notion-border)',
                    borderRight: ci < columns.length - 1 ? '1px solid var(--notion-border)' : 'none',
                    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                    minWidth: col.width || (col.type === 'title' ? 220 : 140),
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <HandIcon name={TYPE_ICON[col.type] || '¶'} size={10} style={{ opacity: 0.6 }} />
                    <span className="uppercase tracking-wider">{col.title}</span>
                    {sortKey === col.key && <span style={{ fontSize: 9 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
              ))}
              <th style={{ width: 40, borderBottom: '1px solid var(--notion-border)' }} />
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--notion-text-muted)' }}>
                  <div className="flex flex-col items-center gap-2">
                    <HandIcon name="clipboard" size={28} />
                    <span className="text-sm">{filterText ? 'No matching rows' : 'No entries yet'}</span>
                    {!filterText && <button onClick={addRow} className="text-xs mt-1 px-3 py-1.5 rounded-lg text-white" style={{ background: '#7c3aed' }}>+ Add first row</button>}
                  </div>
                </td>
              </tr>
            ) : (
              displayRows.map(row => {
                const rowId = row._id || '';
                const isHovered = hoveredRow === rowId;
                return (
                  <tr key={rowId} onMouseEnter={() => setHoveredRow(rowId)} onMouseLeave={() => setHoveredRow(null)}
                    style={{ background: isHovered ? '#fafaf9' : 'white', transition: 'background 0.1s' }}>
                    {columns.map((col, ci) => {
                      const isEditing = editing?.rowId === rowId && editing?.colKey === col.key;
                      return (
                        <td key={col.key} onClick={() => setEditing({ rowId, colKey: col.key })}
                          style={{
                            padding: isEditing ? 0 : '6px 12px',
                            borderBottom: '1px solid var(--notion-border)',
                            borderRight: ci < columns.length - 1 ? '1px solid var(--notion-border)' : 'none',
                            cursor: col.type === 'url' ? 'default' : 'text',
                            verticalAlign: 'middle', minHeight: 36,
                          }}
                        >
                          {isEditing ? (
                            <div style={{ padding: '0' }}>
                              <CellEditor value={row[col.key]} col={col}
                                onSave={v => commitCell(rowId, col.key, v)}
                                onCancel={() => setEditing(null)} />
                            </div>
                          ) : (
                            <CellView value={row[col.key]} col={col} />
                          )}
                        </td>
                      );
                    })}
                    <td style={{ borderBottom: '1px solid var(--notion-border)', textAlign: 'center', width: 40, verticalAlign: 'middle' }}>
                      <button onClick={() => deleteRow(rowId)}
                        style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add row footer */}
      <button onClick={addRow} className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm w-fit"
        style={{ color: 'var(--notion-text-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New row
      </button>
    </div>
  );
}
