'use client';

import { useState, useEffect, useRef } from 'react';
import { api, getAuthHeaders } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';

// ── Types ─────────────────────────────────────────────────────────────────────

type TriggerType = 'mention' | 'page_created' | 'page_updated' | 'page_deleted' | 'scheduled';
type ActionType = 'summarize' | 'extract_actions' | 'generate_report' | 'set_field' | 'reminder';

interface AutomationRule {
  id: string;
  workspace_id: string;
  workspace_name?: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  action_type: ActionType;
  action_config: Record<string, any>;
  last_run_at?: string;
  last_result?: string;
  run_count: number;
  created_at: string;
}

interface Workspace {
  id: string;
  name?: string;
  visibility?: string;
}

// ── Constants (built lazily inside components using i18n) ─────────────────────

type TriggerOption = { value: TriggerType; label: string; desc: string; icon: string };
type ActionOption = { value: ActionType; label: string; desc: string; icon: string };

function buildTriggerOptions(a: any): TriggerOption[] {
  return [
    { value: 'mention',      label: a('triggerMention'),      desc: a('triggerMentionDesc'),      icon: 'chat-bubble' },
    { value: 'page_created', label: a('triggerPageCreated'),  desc: a('triggerPageCreatedDesc'),  icon: 'document' },
    { value: 'page_updated', label: a('triggerPageUpdated'),  desc: a('triggerPageUpdatedDesc'),  icon: 'pencil' },
    { value: 'page_deleted', label: a('triggerPageDeleted'),  desc: a('triggerPageDeletedDesc'),  icon: 'trash-can' },
    { value: 'scheduled',    label: a('triggerScheduled'),    desc: a('triggerScheduledDesc'),    icon: 'alarm-clock' },
  ];
}

function buildActionOptions(a: any): ActionOption[] {
  return [
    { value: 'summarize',       label: a('actionSummarize'), desc: a('actionSummarizeDesc'), icon: 'document-pen' },
    { value: 'extract_actions', label: a('actionExtract'),   desc: a('actionExtractDesc'),   icon: 'checkmark' },
    { value: 'generate_report', label: a('actionReport'),    desc: a('actionReportDesc'),    icon: 'bar-chart' },
    { value: 'set_field',       label: a('actionSetField'),  desc: a('actionSetFieldDesc'),  icon: 'refresh-arrows' },
    { value: 'reminder',        label: a('actionReminder'),  desc: a('actionReminderDesc'),  icon: 'bell' },
  ];
}

// ── RuleEditor modal ──────────────────────────────────────────────────────────

function RuleEditor({
  rule,
  workspaces,
  onSave,
  onClose,
}: {
  rule?: AutomationRule | null;
  workspaces: Workspace[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const tWorkspace = useTranslations('workspace');
  const tCommon = useTranslations('common');
  const a = useTranslations('automation');
  const TRIGGER_OPTIONS = buildTriggerOptions(a);
  const ACTION_OPTIONS = buildActionOptions(a);

  const [name, setName] = useState(rule?.name ?? a('newRule'));
  const [description, setDescription] = useState(rule?.description ?? '');
  const [workspaceId, setWorkspaceId] = useState(rule?.workspace_id ?? workspaces[0]?.id ?? '');
  const [triggerType, setTriggerType] = useState<TriggerType>(rule?.trigger_type ?? 'mention');
  const [actionType, setActionType] = useState<ActionType>(rule?.action_type ?? 'summarize');
  const [frequency, setFrequency] = useState(rule?.trigger_config?.frequency ?? 'daily');
  const [scheduleTime, setScheduleTime] = useState(rule?.trigger_config?.time ?? '09:00');
  const [customPrompt, setCustomPrompt] = useState(rule?.action_config?.prompt ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await onSave({
        workspace_id: workspaceId,
        name,
        description,
        trigger_type: triggerType,
        trigger_config: triggerType === 'scheduled'
          ? { frequency, time: scheduleTime }
          : {},
        action_type: actionType,
        action_config: customPrompt ? { prompt: customPrompt } : {},
      });
      onClose();
    } catch (err: any) {
      alert(err.message || a('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative flex flex-col rounded-2xl shadow-2xl"
        style={{ width: 620, maxHeight: '90vh', background: 'var(--notion-card, #fff)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0' }} className="flex items-center justify-between">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: 0 }}>
              {rule ? a('editRule') : a('createRule')}
            </h2>
            <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>{a('subtitle')}</p>
          </div>
          <button onClick={onClose} style={{ color: '#bbb', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}><HandIcon name="cross-mark" size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }} className="space-y-5">
          {/* Name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>{a('ruleName')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, outline: 'none' }}
              placeholder={a('ruleNamePlaceholder')}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>{a('descriptionLabel')}</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, outline: 'none' }}
              placeholder={a('descriptionPlaceholder')}
            />
          </div>

          {/* Workspace */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>{a('workspaceSelect')}</label>
            <select
              value={workspaceId}
              onChange={e => setWorkspaceId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, outline: 'none', background: 'var(--notion-card, #fff)' }}
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name || (w.visibility === 'private' ? tWorkspace('untitled') : w.visibility)}</option>
              ))}
            </select>
          </div>

          {/* Trigger */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>{a('triggerLabel')}</label>
            <div className="grid grid-cols-3 gap-2">
              {TRIGGER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTriggerType(opt.value)}
                  style={{
                    padding: '10px 12px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                    border: triggerType === opt.value ? '2px solid #7c3aed' : '1px solid #e5e5e5',
                    background: triggerType === opt.value ? 'rgba(124,58,237,0.05)' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ marginBottom: 4 }}><HandIcon name={opt.icon} size={18} /></div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
            {triggerType === 'scheduled' && (
              <div className="flex gap-3 mt-3">
                <select
                  value={frequency}
                  onChange={e => setFrequency(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, outline: 'none', background: 'var(--notion-card, #fff)' }}
                >
                  <option value="daily">{a('freqDaily')}</option>
                  <option value="weekly">{a('freqWeekly')}</option>
                </select>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, outline: 'none' }}
                />
              </div>
            )}
          </div>

          {/* Action */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>{a('actionLabel')}</label>
            <div className="grid grid-cols-3 gap-2">
              {ACTION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setActionType(opt.value)}
                  style={{
                    padding: '10px 12px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                    border: actionType === opt.value ? '2px solid #7c3aed' : '1px solid #e5e5e5',
                    background: actionType === opt.value ? 'rgba(124,58,237,0.05)' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ marginBottom: 4 }}><HandIcon name={opt.icon} size={18} /></div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom prompt */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
              {a('customPrompt')}
            </label>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder={a('customPromptPlaceholder')}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0' }} className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, cursor: 'pointer', background: 'var(--notion-card, #fff)', color: '#555' }}
          >
            {a('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !workspaceId}
            style={{
              padding: '8px 24px', borderRadius: 8, border: 'none', fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: '#fff', fontWeight: 600, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? a('savingRule') : a('saveRule')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RunResultPanel ────────────────────────────────────────────────────────────

function RunResultPanel({
  ruleId,
  ruleName,
  onClose,
}: {
  ruleId: string;
  ruleName: string;
  onClose: () => void;
}) {
  const tWorkspace = useTranslations('workspace');
  const tCommon = useTranslations('common');
  const a = useTranslations('automation');
  const [result, setResult] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const response = await fetch(`/api/automation/rules/${ruleId}/run`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        if (!response.body) { setError(a('noResponse')); return; }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (!cancelled) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          const text = decoder.decode(value);
          const lines = text.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.chunk) setResult(prev => prev + payload.chunk);
              if (payload.done) setDone(true);
              if (payload.error) setError(payload.error);
            } catch {}
          }
        }
      } catch (e: any) {
        setError(e.message || a('runError'));
      }
    }
    run();
    return () => { cancelled = true; };
  }, [ruleId, a]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [result]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ width: 680, maxHeight: '80vh', background: 'var(--notion-card, #fff)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><HandIcon name="lightning" size={16} /> {ruleName}</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>{done ? a('executionDone') : error ? a('executionError') : a('running')}</p>
          </div>
          <button onClick={onClose} style={{ color: '#bbb', cursor: 'pointer', background: 'none', border: 'none' }}><HandIcon name="cross-mark" size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', fontFamily: 'inherit' }}>
          {error ? (
            <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 14 }}>{error}</div>
          ) : result ? (
            <div style={{ fontSize: 14, color: '#222', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{result}</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 14 }}>
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              {a('aiProcessing')}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 20px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, cursor: 'pointer', background: 'var(--notion-card, #fff)', color: '#555' }}
          >
            {a('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AutomationsPage({ params }: { params: { tenant: string } }) {
  const tWorkspace = useTranslations('workspace');
  const tCommon = useTranslations('common');
  const a = useTranslations('automation');
  const TRIGGER_OPTIONS = buildTriggerOptions(a);
  const ACTION_OPTIONS = buildActionOptions(a);

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [runningRuleName, setRunningRuleName] = useState('');
  const [filter, setFilter] = useState<'all' | TriggerType>('all');

  async function loadData() {
    setLoading(true);
    try {
      const [rulesData, treeData] = await Promise.all([
        api.get('/api/automation/rules'),
        api.get('/api/workspace/sidebar/tree'),
      ]);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      if (Array.isArray(treeData)) {
        setWorkspaces(treeData.map((w: any) => ({ id: w.id, name: w.name, visibility: w.visibility })));
      }
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreate(data: any) {
    await api.post('/api/automation/rules', data);
    await loadData();
  }

  async function handleUpdate(ruleId: string, data: any) {
    await api.patch(`/api/automation/rules/${ruleId}`, data);
    await loadData();
  }

  async function handleToggle(rule: AutomationRule) {
    await api.patch(`/api/automation/rules/${rule.id}`, { enabled: !rule.enabled });
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
  }

  async function handleDelete(ruleId: string) {
    if (!confirm(a('confirmDelete'))) return;
    await api.delete(`/api/automation/rules/${ruleId}`);
    setRules(prev => prev.filter(r => r.id !== ruleId));
  }

  function handleRunNow(rule: AutomationRule) {
    setRunningRuleId(rule.id);
    setRunningRuleName(rule.name);
  }

  const filteredRules = filter === 'all' ? rules : rules.filter(r => r.trigger_type === filter);

  function triggerLabel(t: TriggerType) {
    return TRIGGER_OPTIONS.find(o => o.value === t)?.label ?? t;
  }
  function actionLabel(a: ActionType) {
    return ACTION_OPTIONS.find(o => o.value === a)?.label ?? a;
  }
  function triggerIcon(t: TriggerType) {
    return TRIGGER_OPTIONS.find(o => o.value === t)?.icon ?? 'lightning';
  }
  function actionIcon(a: ActionType) {
    return ACTION_OPTIONS.find(o => o.value === a)?.icon ?? 'robot';
  }

  return (
    <div style={{ flex: 1, background: '#FAFAF9', minHeight: '100vh' }}>
      {/* Page header */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px 0' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div style={{
                width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg,#7c3aed22,#6366f122)', border: '1px solid rgba(124,58,237,0.2)',
              }}><HandIcon name="lightning" size={20} /></div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111', margin: 0 }}>{a('title')}</h1>
            </div>
            <p style={{ fontSize: 14, color: '#888', margin: 0 }}>
              {a('subtitle')}
            </p>
          </div>
          <button
            onClick={() => { setEditingRule(null); setShowEditor(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
              borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: '#fff', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {a('newRule')}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: a('totalRules'), value: rules.length, color: '#6366f1' },
            { label: a('enabledRules'), value: rules.filter(r => r.enabled).length, color: '#22c55e' },
            { label: a('runCount'), value: rules.reduce((sum, r) => sum + (r.run_count || 0), 0), color: '#f59e0b' },
            { label: a('workspacesLabel'), value: workspaces.length, color: '#7c3aed' },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--notion-card, #fff)', borderRadius: 12, padding: '16px 20px', border: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-4">
          {[{ value: 'all' as const, label: a('filterAll'), icon: '' }, ...TRIGGER_OPTIONS.map(o => ({ value: o.value, label: o.label, icon: o.icon }))].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value as any)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
                background: filter === tab.value ? '#7c3aed' : '#f0f0f0',
                color: filter === tab.value ? '#fff' : '#555',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {tab.icon && <HandIcon name={tab.icon} size={12} />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Rules list */}
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#bbb', fontSize: 14 }}>
            <svg className="animate-spin inline-block mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {tCommon('loading')}
          </div>
        ) : filteredRules.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}><HandIcon name="lightning" size={48} /></div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#444', marginBottom: 8 }}>{a('noRules')}</p>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>
              {a('noRulesDesc')}
            </p>
            <button
              onClick={() => { setEditingRule(null); setShowEditor(true); }}
              style={{
                padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: '#fff',
              }}
            >
              {a('createFirst')}
            </button>
          </div>
        ) : (
          <div className="space-y-3 pb-12">
            {filteredRules.map(rule => (
              <div
                key={rule.id}
                style={{
                  background: 'var(--notion-card, #fff)', borderRadius: 12, border: '1px solid #f0f0f0',
                  padding: '16px 20px', transition: 'box-shadow 0.15s',
                  opacity: rule.enabled ? 1 : 0.6,
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div className="flex items-start gap-4">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(rule)}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 2,
                      background: rule.enabled ? '#7c3aed' : '#d1d5db', transition: 'background 0.2s',
                      position: 'relative',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--notion-card, #fff)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
                      left: rule.enabled ? 18 : 2,
                    }} />
                  </button>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{rule.name}</span>
                      {!rule.enabled && (
                        <span style={{ fontSize: 10, color: '#999', background: '#f5f5f5', borderRadius: 4, padding: '1px 6px' }}>{a('disabled')}</span>
                      )}
                    </div>
                    {rule.description && (
                      <p style={{ fontSize: 13, color: '#888', margin: '0 0 8px' }}>{rule.description}</p>
                    )}

                    {/* Trigger → Action badge row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(99,102,241,0.08)', color: '#4f46e5', fontWeight: 500,
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <HandIcon name={triggerIcon(rule.trigger_type)} size={11} /> {a('triggerBadge')}：{triggerLabel(rule.trigger_type)}
                        {rule.trigger_type === 'scheduled' && rule.trigger_config?.frequency
                          ? `（${rule.trigger_config.frequency === 'daily' ? a('freqDaily') : a('freqWeekly')} ${rule.trigger_config.time || ''}）`
                          : ''}
                      </span>
                      <span style={{ color: '#ccc' }}><HandIcon name="arrow-right" size={14} /></span>
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(34,197,94,0.08)', color: '#15803d', fontWeight: 500,
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <HandIcon name={actionIcon(rule.action_type)} size={11} /> {a('actionBadge')}：{actionLabel(rule.action_type)}
                      </span>
                    </div>

                    {/* Last run */}
                    {(rule.last_run_at || rule.run_count > 0) && (
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, display: 'flex', gap: 12 }}>
                        {rule.run_count > 0 && <span>{a('runTimes', { n: rule.run_count })}</span>}
                        {rule.last_run_at && (
                          <span>{a('lastRun')}：{new Date(rule.last_run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                    )}

                    {/* Last result preview */}
                    {rule.last_result && (
                      <div style={{
                        fontSize: 12, color: '#666', marginTop: 8, padding: '8px 10px',
                        background: '#f9f9f9', borderRadius: 6, borderLeft: '2px solid #e0e0e0',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {rule.last_result}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleRunNow(rule)}
                      title={a('run')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                        borderRadius: 7, border: '1px solid #e5e5e5', cursor: 'pointer', fontSize: 12,
                        background: 'var(--notion-card, #fff)', color: '#7c3aed', fontWeight: 500,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = '#7c3aed'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e5e5'; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      {a('run')}
                    </button>
                    <button
                      onClick={() => { setEditingRule(rule); setShowEditor(true); }}
                      title={tCommon('edit')}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e5e5', cursor: 'pointer', background: 'var(--notion-card, #fff)', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#333'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#888'; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      title={tCommon('delete')}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e5e5', cursor: 'pointer', background: 'var(--notion-card, #fff)', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#e5e5e5'; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showEditor && (
        <RuleEditor
          rule={editingRule}
          workspaces={workspaces}
          onSave={editingRule
            ? (data) => handleUpdate(editingRule.id, data)
            : handleCreate}
          onClose={() => { setShowEditor(false); setEditingRule(null); }}
        />
      )}

      {runningRuleId && (
        <RunResultPanel
          ruleId={runningRuleId}
          ruleName={runningRuleName}
          onClose={() => { setRunningRuleId(null); loadData(); }}
        />
      )}
    </div>
  );
}
