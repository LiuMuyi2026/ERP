'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  FilterGroup, FilterCondition, TaskField, FilterOperator,
  TASK_FIELD_LABELS, FILTER_OPERATOR_LABELS,
  getOperatorsForField, getEnumOptions, getEnumLabel, getFieldType,
  genId,
} from './types';

interface FilterPanelProps {
  filterGroups: FilterGroup[];
  onChange: (groups: FilterGroup[]) => void;
}

const BASIC_FIELDS: TaskField[] = ['title', 'status', 'priority', 'assignees', 'due_date'];
const ADVANCED_FIELDS: TaskField[] = ['workload', 'task_type', 'description', 'overdue', 'updated_at', 'attachments'];

function ConditionRow({
  cond,
  onChange,
  onDelete,
}: {
  cond: FilterCondition;
  onChange: (c: FilterCondition) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('taskTracker');
  const operators = getOperatorsForField(cond.field);
  const fieldType = getFieldType(cond.field);
  const enumOpts = getEnumOptions(cond.field);
  const noValue = cond.operator === 'is_empty' || cond.operator === 'is_not_empty';

  const selectStyle = {
    border: '1px solid var(--notion-border)',
    borderRadius: 6,
    padding: '3px 6px',
    fontSize: 12,
    color: 'var(--notion-text)',
    background: 'var(--notion-bg)',
    outline: 'none',
    cursor: 'pointer',
  };

  return (
    <div className="flex items-center gap-2 py-1.5">
      {/* Field */}
      <select value={cond.field} onChange={e => {
        const f = e.target.value as TaskField;
        const ops = getOperatorsForField(f);
        onChange({ ...cond, field: f, operator: ops[0], value: '' });
      }} style={{ ...selectStyle, maxWidth: 100 }}>
        {[...BASIC_FIELDS, ...ADVANCED_FIELDS].map(f => (
          <option key={f} value={f}>{TASK_FIELD_LABELS[f]}</option>
        ))}
      </select>

      {/* Operator */}
      <select value={cond.operator} onChange={e => {
        onChange({ ...cond, operator: e.target.value as FilterOperator, value: '' });
      }} style={{ ...selectStyle, maxWidth: 90 }}>
        {operators.map(op => (
          <option key={op} value={op}>{FILTER_OPERATOR_LABELS[op]}</option>
        ))}
      </select>

      {/* Value */}
      {!noValue && (
        <>
          {fieldType === 'enum' ? (
            <select value={cond.value} onChange={e => onChange({ ...cond, value: e.target.value })}
              style={{ ...selectStyle, maxWidth: 90 }}>
              <option value="">{t('selectPlaceholder')}</option>
              {enumOpts.map(opt => (
                <option key={opt} value={opt}>{getEnumLabel(cond.field, opt)}</option>
              ))}
            </select>
          ) : fieldType === 'date' ? (
            <input type="date" value={cond.value}
              onChange={e => onChange({ ...cond, value: e.target.value })}
              style={{ ...selectStyle, maxWidth: 120 }} />
          ) : (
            <input type="text" value={cond.value} placeholder={t('valuePlaceholder')}
              onChange={e => onChange({ ...cond, value: e.target.value })}
              style={{ ...selectStyle, maxWidth: 120 }} />
          )}
        </>
      )}

      {/* Delete */}
      <button onClick={onDelete}
        className="flex-shrink-0 p-1 rounded transition-colors"
        style={{ color: '#9B9A97' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#EB5757'; e.currentTarget.style.background = '#FFEAEA'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#9B9A97'; e.currentTarget.style.background = 'transparent'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function GroupBlock({
  group,
  onChange,
  onDelete,
}: {
  group: FilterGroup;
  onChange: (g: FilterGroup) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('taskTracker');
  const [showAdvanced, setShowAdvanced] = useState(false);

  function addCondition(field: TaskField = 'title') {
    const ops = getOperatorsForField(field);
    const cond: FilterCondition = {
      id: genId(),
      field,
      operator: ops[0],
      value: '',
    };
    onChange({ ...group, conditions: [...group.conditions, cond] });
  }

  function updateCondition(idx: number, cond: FilterCondition) {
    const conditions = [...group.conditions];
    conditions[idx] = cond;
    onChange({ ...group, conditions });
  }

  function deleteCondition(idx: number) {
    const conditions = group.conditions.filter((_, i) => i !== idx);
    onChange({ ...group, conditions });
  }

  return (
    <div className="rounded-xl p-3 mb-3" style={{ border: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
      {/* Group header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium" style={{ color: '#9B9A97' }}>{t('conditionGroup')}</span>
        <select
          value={group.logic}
          onChange={e => onChange({ ...group, logic: e.target.value as 'AND' | 'OR' })}
          style={{
            border: '1px solid var(--notion-border)',
            borderRadius: 5,
            padding: '2px 6px',
            fontSize: 11,
            color: 'var(--notion-text)',
            background: 'var(--notion-card-elevated, var(--notion-card, white))',
            fontWeight: 600,
          }}
        >
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        </select>
        <div className="flex-1" />
        <button onClick={onDelete}
          className="text-[10px] px-2 py-0.5 rounded transition-colors"
          style={{ color: '#9B9A97', border: '1px solid var(--notion-border)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#EB5757'; e.currentTarget.style.borderColor = '#EB5757'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#9B9A97'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
        >
          {t('deleteGroup')}
        </button>
      </div>

      {/* Conditions */}
      {group.conditions.map((cond, idx) => (
        <ConditionRow
          key={cond.id}
          cond={cond}
          onChange={c => updateCondition(idx, c)}
          onDelete={() => deleteCondition(idx)}
        />
      ))}

      {group.conditions.length === 0 && (
        <p className="text-xs py-1" style={{ color: '#9B9A97' }}>{t('clickToAddCondition')}</p>
      )}

      {/* Add condition */}
      <div className="mt-2 space-y-1">
        <button onClick={() => addCondition('title')}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors"
          style={{ color: '#9B9A97' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('addCondition')}
        </button>

        <button onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors"
          style={{ color: '#9B9A97' }}
        >
          <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
          {t('advancedFields')}
        </button>

        {showAdvanced && (
          <div className="flex flex-wrap gap-1 mt-1 pl-4">
            {ADVANCED_FIELDS.map(f => (
              <button key={f} onClick={() => addCondition(f)}
                className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.color = '#7c3aed'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--notion-border)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
              >
                {TASK_FIELD_LABELS[f]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FilterPanel({ filterGroups, onChange }: FilterPanelProps) {
  const t = useTranslations('taskTracker');
  function addGroup() {
    const group: FilterGroup = {
      id: genId(),
      logic: 'AND',
      conditions: [],
    };
    onChange([...filterGroups, group]);
  }

  function updateGroup(idx: number, g: FilterGroup) {
    const groups = [...filterGroups];
    groups[idx] = g;
    onChange(groups);
  }

  function deleteGroup(idx: number) {
    onChange(filterGroups.filter((_, i) => i !== idx));
  }

  return (
    <div className="mt-2 mb-3 px-4 py-3 rounded-xl animate-in fade-in duration-150"
      style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card-elevated, var(--notion-card, white))' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{t('filterTitle')}</span>
        <div className="flex-1" />
        <button onClick={addGroup}
          className="text-xs px-2.5 py-1 rounded-lg transition-colors font-medium"
          style={{ color: '#7c3aed', background: '#ede9fe' }}
          onMouseEnter={e => e.currentTarget.style.background = '#ddd6fe'}
          onMouseLeave={e => e.currentTarget.style.background = '#ede9fe'}
        >
          + {t('addConditionGroup')}
        </button>
        {filterGroups.length > 0 && (
          <button onClick={() => onChange([])}
            className="text-xs px-2 py-1 rounded-lg transition-colors"
            style={{ color: '#9B9A97' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#EB5757'; e.currentTarget.style.background = '#FFEAEA'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9B9A97'; e.currentTarget.style.background = 'transparent'; }}
          >
            {t('clearAll')}
          </button>
        )}
      </div>

      {filterGroups.length === 0 && (
        <p className="text-xs py-2 text-center" style={{ color: '#9B9A97' }}>
          {t('clickAddGroupHint')}
        </p>
      )}

      {filterGroups.map((group, idx) => (
        <GroupBlock
          key={group.id}
          group={group}
          onChange={g => updateGroup(idx, g)}
          onDelete={() => deleteGroup(idx)}
        />
      ))}
    </div>
  );
}
