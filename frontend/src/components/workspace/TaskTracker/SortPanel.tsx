'use client';

import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SortRule, TaskField, TASK_FIELD_LABELS, genId } from './types';

interface SortPanelProps {
  sortRules: SortRule[];
  onChange: (rules: SortRule[]) => void;
  onClose: () => void;
}

const SORTABLE_FIELDS: TaskField[] = ['title', 'status', 'priority', 'workload', 'due_date', 'updated_at', 'assignees'];

export default function SortPanel({ sortRules, onChange, onClose }: SortPanelProps) {
  const t = useTranslations('taskTracker');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function addRule() {
    const usedFields = new Set(sortRules.map(r => r.field));
    const field = SORTABLE_FIELDS.find(f => !usedFields.has(f)) ?? 'title';
    onChange([...sortRules, { id: genId(), field, direction: 'asc' }]);
  }

  function updateRule(idx: number, patch: Partial<SortRule>) {
    const rules = [...sortRules];
    rules[idx] = { ...rules[idx], ...patch };
    onChange(rules);
  }

  function deleteRule(idx: number) {
    onChange(sortRules.filter((_, i) => i !== idx));
  }

  const selectStyle = {
    border: '1px solid var(--notion-border)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    color: 'var(--notion-text)',
    background: 'var(--notion-bg)',
    outline: 'none',
  };

  return (
    <div ref={ref} className="absolute z-[50] rounded-xl shadow-xl"
      style={{
        top: '100%',
        right: 0,
        marginTop: 4,
        width: 280,
        background: 'var(--notion-card-elevated, var(--notion-card, white))',
        border: '1px solid var(--notion-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--notion-border)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{t('sortRules')}</span>
        <button onClick={onClose} style={{ color: '#9B9A97' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--notion-text)'}
          onMouseLeave={e => e.currentTarget.style.color = '#9B9A97'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Rules */}
      <div className="px-3 py-2">
        {sortRules.length === 0 && (
          <p className="text-xs py-2 text-center" style={{ color: '#9B9A97' }}>{t('noSortRules')}</p>
        )}

        {sortRules.map((rule, idx) => (
          <div key={rule.id} className="flex items-center gap-2 py-1.5">
            {/* Drag handle (decorative) */}
            <span style={{ color: '#C2C0BC', fontSize: 12, cursor: 'grab' }}>⋮⋮</span>

            {/* Field */}
            <select value={rule.field} onChange={e => updateRule(idx, { field: e.target.value as TaskField })}
              style={{ ...selectStyle, flex: 1 }}>
              {SORTABLE_FIELDS.map(f => (
                <option key={f} value={f}>{TASK_FIELD_LABELS[f]}</option>
              ))}
            </select>

            {/* Direction toggle */}
            <button
              onClick={() => updateRule(idx, { direction: rule.direction === 'asc' ? 'desc' : 'asc' })}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors"
              style={{
                border: '1px solid var(--notion-border)',
                color: 'var(--notion-text)',
                background: 'var(--notion-bg)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--notion-bg)'}
            >
              {rule.direction === 'asc' ? `↑ ${t('ascending')}` : `↓ ${t('descending')}`}
            </button>

            {/* Delete */}
            <button onClick={() => deleteRule(idx)}
              className="p-1 rounded transition-colors flex-shrink-0"
              style={{ color: '#9B9A97' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#EB5757'; e.currentTarget.style.background = '#FFEAEA'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9B9A97'; e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}

        <button onClick={addRule}
          className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg transition-colors w-full mt-1"
          style={{ color: '#9B9A97' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('addSort')}
        </button>
      </div>
    </div>
  );
}
