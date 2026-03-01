'use client';

import { useState, useCallback } from 'react';
import { DBColumn, DBRow, getOptionColor, generateRowId } from './types';
import { HandIcon } from '@/components/ui/HandIcon';

interface KanbanViewProps {
  columns: DBColumn[];
  rows: DBRow[];
  groupBy: string; // key of the select column to group by
  onRowsChange: (rows: DBRow[]) => void;
}

function KanbanCard({ row, titleCol, otherCols, groupCol, onEdit, onDelete }: {
  row: DBRow; titleCol: DBColumn; otherCols: DBColumn[]; groupCol: DBColumn;
  onEdit: (row: DBRow) => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const title = row[titleCol.key] || 'Untitled';

  return (
    <div
      className="rounded-lg p-3 cursor-pointer transition-all"
      style={{
        background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)',
        boxShadow: hovered ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-1px)' : 'none', transition: 'all 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: '#1a1a1a' }}>{title}</p>
          {otherCols.map(col => {
            const val = row[col.key];
            if (!val || col.key === groupCol.key) return null;
            if (col.type === 'select' || col.type === 'status') {
              const colors = getOptionColor(String(val), col.options);
              return (
                <span key={col.key} className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded mr-1 mt-1.5" style={{ background: colors.bg, color: colors.text }}>
                  {String(val)}
                </span>
              );
            }
            if (col.type === 'date' && val) {
              return <p key={col.key} className="text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: 'var(--notion-text-muted)' }}><HandIcon name="alarm-clock" size={11} /> {new Date(val).toLocaleDateString()}</p>;
            }
            if (col.type === 'checkbox') {
              return val ? <span key={col.key} className="text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: '#16a34a' }}><HandIcon name="checkmark" size={11} /> {col.title}</span> : null;
            }
            return <p key={col.key} className="text-[11px] mt-1 truncate" style={{ color: 'var(--notion-text-muted)' }}>{String(val)}</p>;
          })}
        </div>
        {hovered && (
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="flex-shrink-0 p-1 rounded transition-colors"
            style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--notion-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default function KanbanView({ columns, rows, groupBy, onRowsChange }: KanbanViewProps) {
  const [editingCard, setEditingCard] = useState<DBRow | null>(null);
  const [editingNewInCol, setEditingNewInCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');

  const groupCol = columns.find(c => c.key === groupBy) || columns[0];
  const titleCol = columns.find(c => c.type === 'title') || columns[0];
  const otherCols = columns.filter(c => c.key !== titleCol.key);

  // Collect all group values (from options + any orphan values in rows)
  const optionValues = groupCol?.options?.map(o => typeof o === 'string' ? o : o.value) ?? [];
  const rowValues = Array.from(new Set(rows.map(r => r[groupBy] || ''))).filter(v => v !== '' && !optionValues.includes(v));
  const allGroups = [...optionValues.filter(Boolean), ...rowValues, '']; // empty last

  const addCard = useCallback((groupValue: string) => {
    if (!newCardTitle.trim()) { setEditingNewInCol(null); return; }
    const newRow: DBRow = { _id: generateRowId() };
    columns.forEach(c => { newRow[c.key] = c.type === 'checkbox' ? false : ''; });
    newRow[titleCol.key] = newCardTitle.trim();
    newRow[groupBy] = groupValue;
    onRowsChange([...rows, newRow]);
    setNewCardTitle('');
    setEditingNewInCol(null);
  }, [newCardTitle, columns, titleCol, groupBy, rows, onRowsChange]);

  const moveCard = useCallback((rowId: string, newGroupValue: string) => {
    const updated = rows.map(r => r._id === rowId ? { ...r, [groupBy]: newGroupValue } : r);
    onRowsChange(updated);
  }, [rows, groupBy, onRowsChange]);

  const deleteCard = useCallback((rowId: string) => {
    onRowsChange(rows.filter(r => r._id !== rowId));
  }, [rows, onRowsChange]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
      {allGroups.map(groupVal => {
        const groupRows = rows.filter(r => (r[groupBy] || '') === groupVal);
        const colors = groupVal ? getOptionColor(groupVal) : { bg: '#f1f1ef', text: '#787774' };
        const isAddingHere = editingNewInCol === groupVal;

        return (
          <div key={groupVal || '__empty__'} className="flex flex-col flex-shrink-0" style={{ width: 260 }}>
            {/* Column header */}
            <div className="flex items-center gap-2 px-1 pb-2 mb-2" style={{ borderBottom: '1px solid var(--notion-border)' }}>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: colors.bg, color: colors.text }}>
                {groupVal || 'No status'}
              </span>
              <span className="text-xs ml-auto" style={{ color: 'var(--notion-text-muted)' }}>{groupRows.length}</span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 flex-1">
              {groupRows.map(row => (
                <KanbanCard key={row._id}
                  row={row} titleCol={titleCol} otherCols={otherCols} groupCol={groupCol}
                  onEdit={r => setEditingCard(r)}
                  onDelete={() => deleteCard(row._id!)}
                />
              ))}

              {/* New card input */}
              {isAddingHere && (
                <div className="rounded-lg p-2" style={{ background: 'var(--notion-card, white)', border: '1.5px solid #7c3aed' }}>
                  <input
                    autoFocus value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addCard(groupVal);
                      if (e.key === 'Escape') { setEditingNewInCol(null); setNewCardTitle(''); }
                    }}
                    placeholder="Card title..."
                    className="w-full text-sm outline-none" style={{ color: 'var(--notion-text)' }}
                  />
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => addCard(groupVal)}
                      className="px-3 py-1 text-xs rounded-md text-white" style={{ background: '#7c3aed' }}>
                      Add
                    </button>
                    <button onClick={() => { setEditingNewInCol(null); setNewCardTitle(''); }}
                      className="px-3 py-1 text-xs rounded-md" style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Add card button */}
            {!isAddingHere && (
              <button
                onClick={() => { setEditingNewInCol(groupVal); setNewCardTitle(''); }}
                className="flex items-center gap-1.5 px-2 py-2 rounded-lg mt-2 transition-colors w-full text-left text-sm"
                style={{ color: 'var(--notion-text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New card
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
