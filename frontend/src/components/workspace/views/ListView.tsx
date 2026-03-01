'use client';

import { useState, useCallback } from 'react';
import { DBColumn, DBRow, getOptionColor, generateRowId } from './types';
import { HandIcon } from '@/components/ui/HandIcon';

interface ListViewProps {
  columns: DBColumn[];
  rows: DBRow[];
  onRowsChange: (rows: DBRow[]) => void;
}

export default function ListView({ columns, rows, onRowsChange }: ListViewProps) {
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<DBRow>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const titleCol = columns.find(c => c.type === 'title') || columns[0];
  const statusCol = columns.find(c => c.type === 'select' || c.type === 'status');
  const dateCol = columns.find(c => c.type === 'date');
  const checkboxCol = columns.find(c => c.type === 'checkbox');
  const otherCols = columns.filter(c =>
    c.key !== titleCol?.key && c.key !== statusCol?.key && c.key !== dateCol?.key && c.key !== checkboxCol?.key
  ).slice(0, 2);

  const startEdit = (row: DBRow) => {
    setEditingRow(row._id!);
    setEditValues({ ...row });
  };

  const commitEdit = useCallback(() => {
    const updated = rows.map(r => r._id === editingRow ? { ...r, ...editValues } : r);
    onRowsChange(updated);
    setEditingRow(null);
    setEditValues({});
  }, [rows, editingRow, editValues, onRowsChange]);

  const toggleCheckbox = useCallback((rowId: string) => {
    if (!checkboxCol) return;
    const updated = rows.map(r => r._id === rowId ? { ...r, [checkboxCol.key]: !r[checkboxCol.key] } : r);
    onRowsChange(updated);
  }, [rows, checkboxCol, onRowsChange]);

  const addRow = useCallback(() => {
    if (!newTitle.trim()) { setIsAdding(false); return; }
    const newRow: DBRow = { _id: generateRowId() };
    columns.forEach(c => { newRow[c.key] = c.type === 'checkbox' ? false : ''; });
    newRow[titleCol.key] = newTitle.trim();
    onRowsChange([...rows, newRow]);
    setNewTitle('');
    setIsAdding(false);
  }, [newTitle, columns, titleCol, rows, onRowsChange]);

  const deleteRow = useCallback((rowId: string) => {
    onRowsChange(rows.filter(r => r._id !== rowId));
  }, [rows, onRowsChange]);

  return (
    <div className="flex flex-col">
      {/* List */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
        {rows.length === 0 && !isAdding ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <HandIcon name="clipboard" size={28} />
            <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>No items yet</p>
          </div>
        ) : (
          rows.map((row, idx) => {
            const isEdit = editingRow === row._id;
            const isDone = checkboxCol && row[checkboxCol.key];
            const isHovered = hoveredRow === row._id;
            const statusVal = statusCol ? row[statusCol.key] : null;
            const dateVal = dateCol ? row[dateCol.key] : null;

            return (
              <div key={row._id}
                onMouseEnter={() => setHoveredRow(row._id!)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  borderBottom: idx < rows.length - 1 ? '1px solid var(--notion-border)' : 'none',
                  background: isHovered ? '#fafaf9' : 'white', transition: 'background 0.1s',
                }}
              >
                {isEdit ? (
                  /* Edit mode */
                  <div className="px-4 py-3 space-y-2" style={{ borderLeft: '3px solid #7c3aed' }}>
                    <input autoFocus value={editValues[titleCol.key] || ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [titleCol.key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingRow(null); }}
                      className="w-full font-medium text-sm outline-none bg-transparent"
                      style={{ color: '#1a1a1a' }} />
                    <div className="flex flex-wrap gap-2">
                      {statusCol && (
                        <select value={editValues[statusCol.key] || ''}
                          onChange={e => setEditValues(prev => ({ ...prev, [statusCol.key]: e.target.value }))}
                          className="text-xs px-2 py-1 rounded-md outline-none"
                          style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                          <option value="">—</option>
                          {(statusCol.options || []).map(o => {
                            const v = typeof o === 'string' ? o : o.value;
                            return <option key={v} value={v}>{v}</option>;
                          })}
                        </select>
                      )}
                      {dateCol && (
                        <input type="date" value={editValues[dateCol.key] || ''}
                          onChange={e => setEditValues(prev => ({ ...prev, [dateCol.key]: e.target.value }))}
                          className="text-xs px-2 py-1 rounded-md outline-none"
                          style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }} />
                      )}
                      {otherCols.map(col => (
                        <input key={col.key} placeholder={col.title} value={editValues[col.key] || ''}
                          onChange={e => setEditValues(prev => ({ ...prev, [col.key]: e.target.value }))}
                          className="text-xs px-2 py-1 rounded-md outline-none"
                          style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)', maxWidth: 140 }} />
                      ))}
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button onClick={commitEdit} className="text-xs px-3 py-1 rounded-md text-white" style={{ background: '#7c3aed' }}>Save</button>
                      <button onClick={() => setEditingRow(null)} className="text-xs px-3 py-1 rounded-md" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="flex items-center gap-3 px-4 py-2.5" onClick={() => startEdit(row)}>
                    {/* Checkbox */}
                    {checkboxCol && (
                      <button onClick={e => { e.stopPropagation(); toggleCheckbox(row._id!); }}
                        className="flex-shrink-0" style={{ fontSize: 16 }}>
                        {isDone ? <HandIcon name="checkmark" size={16} style={{ color: '#16a34a' }} /> : <span style={{ width: 16, height: 16, border: '1.5px solid #d1d5db', borderRadius: 3, display: 'inline-block' }} />}
                      </button>
                    )}

                    {/* Title */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium" style={{
                        color: isDone ? 'var(--notion-text-muted)' : '#1a1a1a',
                        textDecoration: isDone ? 'line-through' : 'none',
                      }}>
                        {row[titleCol.key] || 'Untitled'}
                      </span>
                    </div>

                    {/* Metadata chips */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dateVal && (
                        <span className="text-[11px] inline-flex items-center gap-0.5" style={{ color: 'var(--notion-text-muted)' }}>
                          <HandIcon name="alarm-clock" size={11} /> {new Date(dateVal).toLocaleDateString()}
                        </span>
                      )}
                      {statusVal && (() => {
                        const colors = getOptionColor(String(statusVal), statusCol?.options);
                        return (
                          <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: colors.bg, color: colors.text }}>
                            {statusVal}
                          </span>
                        );
                      })()}
                      {otherCols.map(col => row[col.key] ? (
                        <span key={col.key} className="text-[11px] truncate" style={{ color: 'var(--notion-text-muted)', maxWidth: 80 }}>
                          {String(row[col.key])}
                        </span>
                      ) : null)}

                      {/* Delete */}
                      <button onClick={e => { e.stopPropagation(); deleteRow(row._id!); }}
                        style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s', color: 'var(--notion-text-muted)' }}
                        className="p-1 rounded"
                        onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--notion-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Inline add row */}
        {isAdding && (
          <div className="px-4 py-2 flex items-center gap-3" style={{ borderTop: rows.length > 0 ? '1px solid var(--notion-border)' : 'none', borderLeft: '3px solid #7c3aed' }}>
            {checkboxCol && <span style={{ width: 16, height: 16, border: '1.5px solid #d1d5db', borderRadius: 3, display: 'inline-block', flexShrink: 0 }} />}
            <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addRow(); if (e.key === 'Escape') { setIsAdding(false); setNewTitle(''); } }}
              placeholder="Item name..."
              className="flex-1 text-sm outline-none bg-transparent" style={{ color: 'var(--notion-text)' }} />
            <div className="flex gap-1">
              <button onClick={addRow} className="text-xs px-2.5 py-1 rounded-md text-white" style={{ background: '#7c3aed' }}>Add</button>
              <button onClick={() => { setIsAdding(false); setNewTitle(''); }} className="text-xs px-2.5 py-1 rounded-md" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>Esc</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <button onClick={() => { setIsAdding(true); setNewTitle(''); }}
        className="flex items-center gap-2 px-3 py-2 mt-1 rounded-md transition-colors text-sm w-fit"
        style={{ color: 'var(--notion-text-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New item
      </button>
    </div>
  );
}
