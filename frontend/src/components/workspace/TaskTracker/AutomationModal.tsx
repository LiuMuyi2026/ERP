'use client';

import { useState } from 'react';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import { AutomationRule, STATUS_CONFIG, PRIORITY_CONFIG, genId, Task } from './types';

interface AutomationModalProps {
  automations: AutomationRule[];
  onChange: (rules: AutomationRule[]) => void;
  onClose: () => void;
}

export function runAutomations(automations: AutomationRule[], task: Task, prevTask?: Task) {
  for (const rule of automations) {
    if (!rule.enabled) continue;

    let triggered = false;

    if (rule.trigger.type === 'status_changed') {
      triggered = !!prevTask && prevTask.status !== task.status &&
        (!rule.trigger.value || task.status === rule.trigger.value);
    } else if (rule.trigger.type === 'due_today') {
      if (task.due_date) {
        const d = new Date(task.due_date);
        const today = new Date();
        triggered = d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === today.getDate();
      }
    } else if (rule.trigger.type === 'created') {
      triggered = !prevTask;
    }

    if (triggered) {
      if (rule.action.type === 'reminder') {
        const msg = rule.action.message || `Automation: ${rule.name}`;
        setTimeout(() => alert(msg), 100);
      }
    }
  }
}

export default function AutomationModal({ automations, onChange, onClose }: AutomationModalProps) {
  const t = useTranslations('taskTracker');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const TRIGGER_LABELS: Record<AutomationRule['trigger']['type'], string> = {
    status_changed: t('triggerStatusChanged'),
    due_today: t('triggerDueToday'),
    created: t('triggerCreated'),
  };

  const ACTION_LABELS: Record<AutomationRule['action']['type'], string> = {
    set_field: t('actionSetField'),
    reminder: t('actionReminder'),
    summarize: t('actionSummarize'),
  };

  const DEFAULT_RULES: AutomationRule[] = [
    {
      id: 'preset-1',
      name: t('presetCompleteReminder'),
      enabled: false,
      trigger: { type: 'status_changed', value: 'done' },
      action: { type: 'reminder', message: t('taskCompleted') },
    },
    {
      id: 'preset-2',
      name: t('presetDueUrgent'),
      enabled: false,
      trigger: { type: 'due_today' },
      action: { type: 'set_field', field: 'priority', value: 'urgent' },
    },
    {
      id: 'preset-3',
      name: t('presetCreatedAI'),
      enabled: false,
      trigger: { type: 'created' },
      action: { type: 'summarize' },
    },
  ];

  // Merge presets with user automations (avoid duplicates by id)
  const allRules: AutomationRule[] = [
    ...DEFAULT_RULES.filter(p => !automations.find(a => a.id === p.id)),
    ...automations,
  ];

  function toggleRule(id: string) {
    const existing = automations.find(a => a.id === id);
    const preset = DEFAULT_RULES.find(p => p.id === id);
    if (existing) {
      onChange(automations.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
    } else if (preset) {
      // Add from preset and enable it
      onChange([...automations, { ...preset, enabled: true }]);
    }
  }

  function isEnabled(id: string): boolean {
    const a = automations.find(a => a.id === id);
    if (a) return a.enabled;
    return false;
  }

  function addCustomRule() {
    const rule: AutomationRule = {
      id: genId(),
      name: t('customRule'),
      enabled: true,
      trigger: { type: 'status_changed', value: 'done' },
      action: { type: 'reminder', message: t('taskStatusChanged') },
    };
    onChange([...automations, rule]);
    setEditingIdx(automations.length);
  }

  function deleteRule(id: string) {
    onChange(automations.filter(a => a.id !== id));
  }

  function updateRule(idx: number, rule: AutomationRule) {
    const arr = [...automations];
    arr[idx] = rule;
    onChange(arr);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 640, maxHeight: '82vh', background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--notion-border)' }}>
          <div className="flex items-center gap-2.5">
            <HandIcon name="lightning" size={16} />
            <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{t('automationRules')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={addCustomRule}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: '#ede9fe', color: '#7c3aed' }}
              onMouseEnter={e => e.currentTarget.style.background = '#ddd6fe'}
              onMouseLeave={e => e.currentTarget.style.background = '#ede9fe'}
            >
              + {t('newRule')}
            </button>
            <button onClick={onClose} style={{ color: '#9B9A97' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--notion-text)'}
              onMouseLeave={e => e.currentTarget.style.color = '#9B9A97'}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Rules list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {allRules.map((rule, idx) => {
            const enabled = isEnabled(rule.id);
            const isCustom = automations.some(a => a.id === rule.id) && !DEFAULT_RULES.find(p => p.id === rule.id);
            const customIdx = automations.findIndex(a => a.id === rule.id);

            return (
              <div key={rule.id} className="rounded-xl p-4"
                style={{
                  border: `1px solid ${enabled ? '#7c3aed' : 'var(--notion-border)'}`,
                  background: enabled ? '#faf5ff' : '#FAFAF9',
                }}>
                <div className="flex items-start gap-3">
                  {/* Toggle */}
                  <button onClick={() => toggleRule(rule.id)}
                    className="relative flex-shrink-0 mt-0.5"
                    style={{
                      width: 32, height: 18, borderRadius: 9,
                      background: enabled ? '#7c3aed' : '#E3E2E0',
                      transition: 'background 0.2s',
                    }}>
                    <span className="absolute top-0.5 transition-all"
                      style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: 'var(--notion-card, white)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        left: enabled ? 16 : 2,
                        transition: 'left 0.2s',
                      }} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{rule.name}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: '#EBF5FF', color: '#2F80ED' }}>
                        {t('whenLabel')}: {TRIGGER_LABELS[rule.trigger.type]}
                        {rule.trigger.value ? ` → ${(STATUS_CONFIG as Record<string, { label: string }>)[rule.trigger.value]?.label || rule.trigger.value}` : ''}
                      </span>
                      <span className="text-[10px]" style={{ color: '#9B9A97' }}>→</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: '#E6F4EA', color: '#0F9D58' }}>
                        {t('doLabel')}: {ACTION_LABELS[rule.action.type]}
                        {rule.action.message ? `「${rule.action.message}」` : ''}
                        {rule.action.field ? ` ${rule.action.field}=${rule.action.value}` : ''}
                      </span>
                    </div>
                  </div>

                  {isCustom && (
                    <button onClick={() => deleteRule(rule.id)}
                      className="flex-shrink-0 p-1 rounded transition-colors"
                      style={{ color: '#9B9A97' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#EB5757'; e.currentTarget.style.background = '#FFEAEA'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#9B9A97'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Edit form for custom rules */}
                {isCustom && editingIdx === customIdx && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--notion-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-10" style={{ color: '#9B9A97' }}>{t('nameLabel')}</span>
                      <input type="text" value={rule.name}
                        onChange={e => updateRule(customIdx, { ...rule, name: e.target.value })}
                        className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
                        style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-10" style={{ color: '#9B9A97' }}>{t('triggerLabel')}</span>
                      <select value={rule.trigger.type}
                        onChange={e => updateRule(customIdx, { ...rule, trigger: { type: e.target.value as any } })}
                        className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
                        style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                        {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      {rule.trigger.type === 'status_changed' && (
                        <select value={rule.trigger.value ?? ''}
                          onChange={e => updateRule(customIdx, { ...rule, trigger: { ...rule.trigger, value: e.target.value } })}
                          className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
                          style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                          <option value="">{t('anyStatus')}</option>
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-10" style={{ color: '#9B9A97' }}>{t('executeLabel')}</span>
                      <select value={rule.action.type}
                        onChange={e => updateRule(customIdx, { ...rule, action: { type: e.target.value as any } })}
                        className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
                        style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                        {Object.entries(ACTION_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      {rule.action.type === 'reminder' && (
                        <input type="text" value={rule.action.message ?? ''}
                          placeholder={t('reminderContent')}
                          onChange={e => updateRule(customIdx, { ...rule, action: { ...rule.action, message: e.target.value } })}
                          className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
                          style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }} />
                      )}
                    </div>
                    <button onClick={() => setEditingIdx(null)}
                      className="text-xs px-2 py-1 rounded-lg transition-colors"
                      style={{ color: '#7c3aed', background: '#ede9fe' }}>
                      {t('done')}
                    </button>
                  </div>
                )}

                {isCustom && editingIdx !== customIdx && (
                  <button onClick={() => setEditingIdx(customIdx)}
                    className="mt-2 text-xs px-2 py-0.5 rounded transition-colors"
                    style={{ color: '#9B9A97' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--notion-text)'}
                    onMouseLeave={e => e.currentTarget.style.color = '#9B9A97'}>
                    {t('editBtn')}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3 text-xs" style={{ borderTop: '1px solid var(--notion-border)', color: '#9B9A97', background: '#FAFAF9' }}>
          {t('automationHint')}
        </div>
      </div>
    </div>
  );
}
