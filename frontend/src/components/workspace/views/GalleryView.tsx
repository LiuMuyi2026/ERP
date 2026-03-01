'use client';

import { useState, useCallback } from 'react';
import { DBColumn, DBRow, getOptionColor, generateRowId } from './types';
import { HandIcon } from '@/components/ui/HandIcon';

interface GalleryViewProps {
  columns: DBColumn[];
  rows: DBRow[];
  onRowsChange: (rows: DBRow[]) => void;
}

const CARD_GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
];

function hashGradient(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return CARD_GRADIENTS[Math.abs(h) % CARD_GRADIENTS.length];
}

function GalleryCard({ row, titleCol, otherCols, onDelete }: {
  row: DBRow; titleCol: DBColumn; otherCols: DBColumn[]; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const title = row[titleCol.key] || 'Untitled';
  const gradient = hashGradient(row._id || title);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col transition-all duration-200"
      style={{
        border: '1px solid var(--notion-border)',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-3px)' : 'none',
        background: 'var(--notion-card, white)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card cover */}
      <div className="relative" style={{ height: 100, background: gradient }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <HandIcon name="document" size={32} style={{ color: 'white' }} />
        </div>
        {hovered && (
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white transition-colors"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.8)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.35)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 flex-1">
        <h3 className="font-semibold text-sm mb-2 truncate" style={{ color: '#1a1a1a' }}>{title}</h3>
        <div className="space-y-1">
          {otherCols.slice(0, 4).map(col => {
            const val = row[col.key];
            if (!val) return null;
            if (col.type === 'select' || col.type === 'status') {
              const colors = getOptionColor(String(val), col.options);
              return (
                <div key={col.key} className="flex items-center gap-1.5">
                  <span className="text-[10px] truncate" style={{ color: 'var(--notion-text-muted)', width: 60, flexShrink: 0 }}>{col.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: colors.bg, color: colors.text }}>{String(val)}</span>
                </div>
              );
            }
            if (col.type === 'date' && val) {
              return (
                <div key={col.key} className="flex items-center gap-1.5">
                  <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)', width: 60, flexShrink: 0 }}>{col.title}</span>
                  <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: 'var(--notion-text)' }}><HandIcon name="alarm-clock" size={10} /> {new Date(val).toLocaleDateString()}</span>
                </div>
              );
            }
            if (col.type === 'checkbox') {
              return (
                <div key={col.key} className="flex items-center gap-1.5">
                  <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)', width: 60 }}>{col.title}</span>
                  {val ? <HandIcon name="checkmark" size={10} style={{ color: '#16a34a' }} /> : <span className="text-[10px]">☐</span>}
                </div>
              );
            }
            return (
              <div key={col.key} className="flex items-center gap-1.5">
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--notion-text-muted)', width: 60 }}>{col.title}</span>
                <span className="text-[10px] truncate" style={{ color: 'var(--notion-text)' }}>{String(val)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function GalleryView({ columns, rows, onRowsChange }: GalleryViewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const titleCol = columns.find(c => c.type === 'title') || columns[0];
  const otherCols = columns.filter(c => c.key !== titleCol?.key);

  const addCard = useCallback(() => {
    if (!newTitle.trim()) { setIsAdding(false); return; }
    const newRow: DBRow = { _id: generateRowId() };
    columns.forEach(c => { newRow[c.key] = c.type === 'checkbox' ? false : ''; });
    newRow[titleCol.key] = newTitle.trim();
    onRowsChange([...rows, newRow]);
    setNewTitle('');
    setIsAdding(false);
  }, [newTitle, columns, titleCol, rows, onRowsChange]);

  const deleteCard = useCallback((rowId: string) => {
    onRowsChange(rows.filter(r => r._id !== rowId));
  }, [rows, onRowsChange]);

  return (
    <div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {rows.map(row => (
          <GalleryCard key={row._id}
            row={row} titleCol={titleCol} otherCols={otherCols}
            onDelete={() => deleteCard(row._id!)}
          />
        ))}

        {/* Add card */}
        {isAdding ? (
          <div className="rounded-xl p-4 flex flex-col gap-2" style={{ border: '2px solid #7c3aed', background: '#faf9ff' }}>
            <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCard(); if (e.key === 'Escape') { setIsAdding(false); setNewTitle(''); } }}
              placeholder="Card title..."
              className="text-sm outline-none bg-transparent" style={{ color: 'var(--notion-text)' }} />
            <div className="flex gap-1.5 mt-1">
              <button onClick={addCard} className="flex-1 py-1 text-xs rounded-md text-white" style={{ background: '#7c3aed' }}>Add</button>
              <button onClick={() => { setIsAdding(false); setNewTitle(''); }} className="flex-1 py-1 text-xs rounded-md" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsAdding(true)}
            className="rounded-xl flex flex-col items-center justify-center gap-2 transition-all min-h-[140px]"
            style={{ border: '2px dashed var(--notion-border)', color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.background = '#faf9ff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--notion-border)'; e.currentTarget.style.color = 'var(--notion-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="text-sm">New card</span>
          </button>
        )}
      </div>
    </div>
  );
}
