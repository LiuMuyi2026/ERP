'use client';

import { useState } from 'react';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import {
  ViewConfig, LayoutMode, TaskField, ColorCondition,
  LAYOUT_CONFIG, TASK_FIELD_LABELS, FilterOperator,
  getOperatorsForField, FILTER_OPERATOR_LABELS, getEnumOptions, getEnumLabel, getFieldType,
  genId,
} from './types';

interface SettingsPanelProps {
  config: ViewConfig;
  onChange: (c: ViewConfig) => void;
  onClose: () => void;
}

const PROP_FIELDS: TaskField[] = [
  'status', 'priority', 'workload', 'task_type', 'assignees',
  'due_date', 'description', 'updated_at', 'attachments',
];

const PRESET_COLORS = [
  '#FFEAEA', '#FFF3E0', '#FFFDE7', '#E8F5E9',
  '#EBF5FF', '#EDE9FE', '#FCE4EC', '#E3F2FD',
  '#F3E5F5', '#F1F8E9', '#FFF8E1', '#E8EAF6',
];

type SettingsTab = 'layout' | 'display' | 'properties' | 'colors';

export default function SettingsPanel({ config, onChange, onClose }: SettingsPanelProps) {
  const t = useTranslations('taskTracker');
  const [tab, setTab] = useState<SettingsTab>('layout');

  function patch(updates: Partial<ViewConfig>) {
    onChange({ ...config, ...updates });
  }

  function toggleProperty(field: TaskField) {
    const vis = config.visibleProperties;
    if (vis.includes(field)) {
      patch({ visibleProperties: vis.filter(f => f !== field) });
    } else {
      patch({ visibleProperties: [...vis, field] });
    }
  }

  function addColorCondition() {
    const cc: ColorCondition = {
      id: genId(),
      field: 'priority',
      operator: 'is',
      value: 'urgent',
      color: '#FFEAEA',
    };
    patch({ colorConditions: [...config.colorConditions, cc] });
  }

  function updateColorCondition(idx: number, updated: ColorCondition) {
    const arr = [...config.colorConditions];
    arr[idx] = updated;
    patch({ colorConditions: arr });
  }

  function deleteColorCondition(idx: number) {
    patch({ colorConditions: config.colorConditions.filter((_, i) => i !== idx) });
  }

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'layout', label: t('tabLayout') },
    { id: 'display', label: t('tabDisplay') },
    { id: 'properties', label: t('tabProperties') },
    { id: 'colors', label: t('tabColors') },
  ];

  const LAYOUTS = Object.entries(LAYOUT_CONFIG) as [LayoutMode, { label: string; icon: string }][];

  const inputStyle = {
    border: '1px solid var(--notion-border)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    color: 'var(--notion-text)',
    background: 'var(--notion-bg)',
    outline: 'none',
  };

  return (
    <div className="fixed right-0 top-0 h-full z-[90] flex flex-col shadow-2xl"
      style={{ width: 400, background: 'var(--notion-card-elevated, var(--notion-card, white))', borderLeft: '1px solid var(--notion-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--notion-border)' }}>
        <span className="text-sm font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--notion-text)' }}><HandIcon name="gear" size={14} /> {t('settingsTitle')}</span>
        <button onClick={onClose} style={{ color: '#9B9A97' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--notion-text)'}
          onMouseLeave={e => e.currentTarget.style.color = '#9B9A97'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-1 mx-4 mt-3 rounded-lg flex-shrink-0"
        style={{ background: 'var(--notion-active)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: tab === t.id ? 'white' : 'transparent',
              color: tab === t.id ? 'var(--notion-text)' : 'var(--notion-text-muted)',
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">

        {/* Layout tab */}
        {tab === 'layout' && (
          <div>
            <p className="text-xs font-medium mb-3" style={{ color: '#9B9A97' }}>{t('chooseLayout')}</p>
            <div className="grid grid-cols-4 gap-2">
              {LAYOUTS.map(([mode, cfg]) => (
                <button key={mode} onClick={() => patch({ layout: mode })}
                  className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl text-xs font-medium transition-all"
                  style={{
                    border: config.layout === mode ? '2px solid #7c3aed' : '1px solid var(--notion-border)',
                    background: config.layout === mode ? '#faf5ff' : 'var(--notion-bg)',
                    color: config.layout === mode ? '#7c3aed' : 'var(--notion-text)',
                  }}>
                  <HandIcon name={cfg.icon} size={18} />
                  <span>{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Display tab */}
        {tab === 'display' && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-medium mb-3" style={{ color: '#9B9A97' }}>{t('displayOptions')}</p>
              <div className="space-y-3">
                {([
                  { key: 'showVerticalLines', label: t('showVerticalLines') },
                  { key: 'showPageIcons', label: t('showPageIcons') },
                  { key: 'allContentRows', label: t('allContentRows') },
                ] as { key: keyof ViewConfig; label: string }[]).map(item => (
                  <div key={item.key} className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--notion-text)' }}>{item.label}</span>
                    <button
                      onClick={() => patch({ [item.key]: !config[item.key] })}
                      className="relative transition-colors"
                      style={{
                        width: 36, height: 20,
                        borderRadius: 10,
                        background: config[item.key] as boolean ? '#7c3aed' : '#E3E2E0',
                      }}
                    >
                      <span className="absolute top-0.5 transition-all"
                        style={{
                          width: 16, height: 16,
                          borderRadius: '50%',
                          background: 'var(--notion-card-elevated, var(--notion-card, white))',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          left: config[item.key] as boolean ? 18 : 2,
                        }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-3" style={{ color: '#9B9A97' }}>{t('openPageMode')}</p>
              <div className="space-y-2">
                {([
                  { val: 'side_preview', label: t('sidePreview') },
                  { val: 'center_preview', label: t('centerPreview') },
                  { val: 'full_page', label: t('fullPage') },
                ] as { val: ViewConfig['openPageMode']; label: string }[]).map(item => (
                  <button key={item.val}
                    onClick={() => patch({ openPageMode: item.val })}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors text-sm"
                    style={{
                      border: config.openPageMode === item.val ? '1px solid #7c3aed' : '1px solid var(--notion-border)',
                      background: config.openPageMode === item.val ? '#faf5ff' : 'var(--notion-bg)',
                      color: config.openPageMode === item.val ? '#7c3aed' : 'var(--notion-text)',
                    }}>
                    <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor: config.openPageMode === item.val ? '#7c3aed' : '#D3D2CF',
                      }}>
                      {config.openPageMode === item.val && (
                        <span className="w-2 h-2 rounded-full" style={{ background: '#7c3aed' }} />
                      )}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Properties tab */}
        {tab === 'properties' && (
          <div>
            <p className="text-xs font-medium mb-3" style={{ color: '#9B9A97' }}>{t('visibleColumns')}</p>
            <div className="space-y-1">
              {/* Title always on */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'var(--notion-active)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{t('taskName')}</span>
                <span className="text-xs" style={{ color: '#9B9A97' }}>{t('alwaysVisible')}</span>
              </div>

              {PROP_FIELDS.map(field => {
                const visible = config.visibleProperties.includes(field);
                return (
                  <button key={field}
                    onClick={() => toggleProperty(field)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors"
                    style={{ color: 'var(--notion-text)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="text-sm">{TASK_FIELD_LABELS[field]}</span>
                    <span className="w-4 h-4 rounded border-2 flex items-center justify-center"
                      style={{
                        borderColor: visible ? '#7c3aed' : '#D3D2CF',
                        background: visible ? '#7c3aed' : 'transparent',
                      }}>
                      {visible && <span className="text-white" style={{ fontSize: 8 }}>✓</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Colors tab */}
        {tab === 'colors' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium" style={{ color: '#9B9A97' }}>{t('colorConditionRules')}</p>
              <button onClick={addColorCondition}
                className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
                style={{ color: '#7c3aed', background: '#ede9fe' }}
                onMouseEnter={e => e.currentTarget.style.background = '#ddd6fe'}
                onMouseLeave={e => e.currentTarget.style.background = '#ede9fe'}
              >
                + {t('addRule')}
              </button>
            </div>

            {config.colorConditions.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: '#9B9A97' }}>
                {t('colorConditionHint')}
              </p>
            )}

            {config.colorConditions.map((cc, idx) => {
              const ops = getOperatorsForField(cc.field);
              const enumOpts = getEnumOptions(cc.field);
              const ft = getFieldType(cc.field);
              const noValue = cc.operator === 'is_empty' || cc.operator === 'is_not_empty';

              return (
                <div key={cc.id} className="rounded-xl p-3 mb-3"
                  style={{ border: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <select value={cc.field}
                      onChange={e => {
                        const f = e.target.value as TaskField;
                        const newOps = getOperatorsForField(f);
                        updateColorCondition(idx, { ...cc, field: f, operator: newOps[0], value: '' });
                      }}
                      style={{ ...inputStyle, maxWidth: 90 }}>
                      {(['title', 'status', 'priority', 'workload', 'task_type', 'overdue'] as TaskField[]).map(f => (
                        <option key={f} value={f}>{TASK_FIELD_LABELS[f]}</option>
                      ))}
                    </select>

                    <select value={cc.operator}
                      onChange={e => updateColorCondition(idx, { ...cc, operator: e.target.value as FilterOperator, value: '' })}
                      style={{ ...inputStyle, maxWidth: 80 }}>
                      {ops.map(op => (
                        <option key={op} value={op}>{FILTER_OPERATOR_LABELS[op]}</option>
                      ))}
                    </select>

                    {!noValue && (
                      ft === 'enum' ? (
                        <select value={cc.value}
                          onChange={e => updateColorCondition(idx, { ...cc, value: e.target.value })}
                          style={{ ...inputStyle, maxWidth: 80 }}>
                          <option value="">{t('selectPlaceholder')}</option>
                          {enumOpts.map(opt => (
                            <option key={opt} value={opt}>{getEnumLabel(cc.field, opt)}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="text" value={cc.value} placeholder={t('valuePlaceholder')}
                          onChange={e => updateColorCondition(idx, { ...cc, value: e.target.value })}
                          style={{ ...inputStyle, maxWidth: 80 }} />
                      )
                    )}

                    <button onClick={() => deleteColorCondition(idx)}
                      className="ml-auto p-1 rounded transition-colors"
                      style={{ color: '#9B9A97' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#EB5757'; e.currentTarget.style.background = '#FFEAEA'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#9B9A97'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Color picker */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px]" style={{ color: '#9B9A97' }}>{t('rowBackground')}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => updateColorCondition(idx, { ...cc, color: c })}
                          className="w-5 h-5 rounded-md transition-transform hover:scale-110"
                          style={{
                            background: c,
                            border: cc.color === c ? '2px solid #7c3aed' : '1px solid var(--notion-border)',
                          }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: '#9B9A97' }}>{t('preview')}</span>
                    <span className="text-xs px-3 py-1 rounded" style={{ background: cc.color || '#F1F1EF' }}>
                      {t('taskRowExample')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
