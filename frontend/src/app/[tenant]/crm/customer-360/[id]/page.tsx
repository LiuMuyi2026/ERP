'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { WorkflowTab } from './WorkflowTab';
import { HandIcon } from '@/components/ui/HandIcon';

// ── Types ───────────────────────────────────────────────────────────────────
type Interaction = {
  id: string; type: string; direction: string; content: string;
  metadata: Record<string, unknown>; created_by: string;
  created_by_name: string; created_at: string;
};
type Contract360 = {
  id: string; contract_no: string; account_label: string;
  contract_amount: number; currency: string; status: string;
  sign_date: string; receivable_total: number; receivable_received: number;
  payable_total: number; payable_paid: number;
  created_at: string;
};
type AuditLog = {
  id: string; action: string; changes: Record<string, unknown>;
  user_name: string; user_email_addr: string; created_at: string;
};
type RelatedLead = {
  id: string; full_name: string; company?: string; email?: string;
  status: string; source?: string; is_cold?: boolean;
  cold_lead_reason?: string; created_at: string; updated_at?: string;
  assigned_to_name?: string;
};

type WorkflowStage = {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  statuses: string[];
};

function normalizeWorkflowStages(rawStages: any[], t: any): WorkflowStage[] {
  const defaultIcons = ['target', 'briefcase', 'sparkle-new', 'ship', 'money-bag', 'checkmark'];
  return (rawStages ?? []).map((stage, idx) => ({
    key: stage.key ?? `stage-${idx}`,
    label: stage.label ?? `阶段 ${idx + 1}`,
    icon: stage.icon ?? defaultIcons[idx % defaultIcons.length],
    color: stage.color ?? '#7c3aed',
    bg: stage.bg ?? '#f3f4ff',
    statuses: stage.statuses ?? [],
  }));
}

type Lead360Data = {
  lead: Record<string, any>;
  interactions: Interaction[];
  contracts: Contract360[];
  audit_logs: AuditLog[];
  related_leads: RelatedLead[];
};
type CompanyResearch = {
  summary: string; industry: string; size: string;
  products: string[];
  news: { title: string; date: string; summary: string }[];
};

// ── Channel config ──────────────────────────────────────────────────────────
type CHConfig = Record<string, { icon: string; label: string; color: string; bg: string; border: string }>;
function getCH(t: any): CHConfig {
  return {
    email:        { icon: 'envelope',     label: t('chEmail'),      color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd' },
    whatsapp:     { icon: 'chat-bubble',  label: t('chWhatsApp'),   color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
    call:         { icon: 'phone',        label: t('chCall'),       color: '#c2410c', bg: '#fff7ed', border: '#fdba74' },
    meeting:      { icon: 'handshake',    label: t('chMeeting'),    color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
    note:         { icon: 'document-pen', label: t('chNote'),       color: '#374151', bg: 'var(--notion-hover)', border: '#D0CFC9' },
    feishu:       { icon: 'kite',         label: t('chFeishu'),     color: '#3370FF', bg: '#EEF3FF', border: '#A3BBFF' },
    dingtalk:     { icon: 'bell',         label: t('chDingtalk'),   color: '#1677FF', bg: '#E8F3FF', border: '#91CAFF' },
    wechat_work:  { icon: 'briefcase',    label: t('chWechatWork'), color: '#07C160', bg: '#E8FFF0', border: '#7DE8A8' },
  };
}

function getLeadStatus(t: any): Record<string, { label: string; color: string; bg: string }> {
  return {
    inquiry:     { label: t('lsInquiry'),     color: '#818cf8', bg: '#eef2ff' },
    new:         { label: t('lsNew'),         color: '#60a5fa', bg: '#eff6ff' },
    replied:     { label: t('lsReplied'),     color: '#34d399', bg: '#ecfdf5' },
    quoted:      { label: t('lsQuoted'),      color: '#fbbf24', bg: '#fffbeb' },
    engaged:     { label: t('lsEngaged'),     color: '#f97316', bg: '#fff7ed' },
    qualified:   { label: t('lsQualified'),   color: '#e879f9', bg: '#fdf4ff' },
    negotiating: { label: t('lsNegotiating'), color: '#f43f5e', bg: '#fff1f2' },
    procuring:   { label: t('lsProcuring'),   color: '#c2410c', bg: '#fff7ed' },
    booking:     { label: t('lsBooking'),     color: '#15803d', bg: '#f0fdf4' },
    fulfillment: { label: t('lsFulfillment'), color: '#0284c7', bg: '#e0f2fe' },
    payment:     { label: t('lsPayment'),     color: '#059669', bg: '#d1fae5' },
    converted:   { label: t('lsConverted'),   color: '#0f9d58', bg: '#f0fdf4' },
    cold:        { label: t('lsCold'),        color: '#9B9A97', bg: 'var(--notion-hover)' },
    lost:        { label: t('lsLost'),        color: '#9B9A97', bg: 'var(--notion-hover)' },
  };
}

function getContractStatus(t: any): Record<string, { bg: string; text: string; label: string }> {
  return {
    draft:     { bg: 'var(--notion-hover)', text: '#5F5E5B', label: t('csDraft') },
    active:    { bg: '#dcfce7', text: '#15803d', label: t('csActive') },
    shipped:   { bg: '#dbeafe', text: '#1e40af', label: t('csShipped') },
    completed: { bg: '#dcfce7', text: '#15803d', label: t('csCompleted') },
    cancelled: { bg: '#fee2e2', text: '#dc2626', label: t('csCancelled') },
  };
}

function getLeadStatuses(t: any) {
  return Object.entries(getLeadStatus(t)).map(([k, v]) => ({ key: k, ...v }));
}
function getSources(t: any) {
  return [t('srcWebsite'), t('srcExhibition'), t('srcReferral'), t('srcEmailDev'), t('srcPlatform'), t('srcLinkedIn'), t('srcOther')];
}

// ── 6-Stage Business Flow ────────────────────────────────────────────────
function getFlowSteps(t: any) {
  return [
    { key: 'sales',       label: t('flowSales'),       icon: 'briefcase',    statuses: ['inquiry', 'new', 'replied', 'engaged', 'qualified', 'quoted', 'negotiating', 'cold'], color: '#7c3aed', bg: '#f5f3ff' },
    { key: 'contract',    label: t('flowContract'),    icon: 'document-pen', statuses: [] as string[],                       color: '#0284c7', bg: '#e0f2fe' },
    { key: 'procurement', label: t('flowProcurement'), icon: 'factory',      statuses: ['procuring'],                         color: '#c2410c', bg: '#fff7ed' },
    { key: 'booking',     label: t('flowBooking'),     icon: 'ship',         statuses: ['booking'],                           color: '#15803d', bg: '#f0fdf4' },
    { key: 'shipping',    label: t('flowShipping'),    icon: 'package',      statuses: ['fulfillment'],                       color: '#d97706', bg: '#fffbeb' },
    { key: 'collection',  label: t('flowCollection'),  icon: 'money-bag',    statuses: ['payment', 'converted'],              color: '#059669', bg: '#d1fae5' },
  ];
}

function getStepIndex(status: string, flowSteps: ReturnType<typeof getFlowSteps>): number {
  for (let i = 0; i < flowSteps.length; i++) {
    if (flowSteps[i].statuses.includes(status)) return i;
  }
  return 0;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function relTime(ts: string, t: any) {
  if (!ts) return '';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t('relJustNow');
    if (m < 60) return t('relMinutesAgo');
    const h = Math.floor(m / 60);
    if (h < 24) return t('relHoursAgo');
    const d = Math.floor(h / 24);
    if (d === 1) return t('relYesterday');
    if (d < 7) return t('relDaysAgo');
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function absTime(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

function dateGroupKey(ts: string, t: any): string {
  try {
    const d = new Date(ts);
    const today = new Date();
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    if (d.toDateString() === today.toDateString()) return t('dgToday');
    if (d.toDateString() === yest.toDateString()) return t('dgYesterday');
    if (d >= weekAgo) return t('dgThisWeek');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  } catch { return t('dgEarlier'); }
}

function isActive(updatedAt: string | undefined, lastContactedAt: string | undefined): boolean {
  const ts = updatedAt || lastContactedAt;
  if (!ts) return false;
  const diff = Date.now() - new Date(ts).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000; // within 7 days
}

// ── Sub-components ───────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: 'var(--notion-border)' }} />;
}

function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: '#9B9A97' }}>{title}</p>
      {children}
    </div>
  );
}

function InteractionCard({ i, expanded, onToggle }: {
  i: Interaction; expanded: boolean; onToggle: () => void;
}) {
  const t = useTranslations('customer360');
  const CH = getCH(t);
  const cfg = CH[i.type] ?? CH.note;
  const isLong = i.content.length > 180;
  const preview = isLong && !expanded ? i.content.slice(0, 180) + '…' : i.content;
  return (
    <div
      onClick={onToggle}
      className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: 'var(--notion-card, white)',
        borderLeft: `4px solid ${cfg.border}`,
        boxShadow: expanded
          ? '0 4px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)'
          : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s',
      }}
    >
      <div className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
            <span className="text-[10px]" style={{ color: '#9B9A97' }}>
              {i.direction === 'inbound' ? `↙ ${t('dirInbound')}` : `↗ ${t('dirOutbound')}`} · {relTime(i.created_at, t)}
            </span>
          </div>
          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--notion-text)' }}>
            {preview}
          </p>
          <div className="text-[10px] text-[#9B9A97]">
            {(i.created_by_name || i.created_by) ?
              `${i.created_by_name || i.created_by} · ${absTime(i.created_at)}`
              : absTime(i.created_at)}
          </div>
          {isLong && (
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--notion-border)' }}>
            <span className="text-[10px] text-[#9B9A97]">{expanded ? 'Collapse' : 'Expand'}</span>
              <span className="text-[10px] text-[#D0CFC9]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline Compose ───────────────────────────────────────────────────────────
function ComposeBox({ leadId, onSaved }: { leadId: string; onSaved: () => void }) {
  const t = useTranslations('customer360');
  const CH = getCH(t);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('note');
  const [dir, setDir] = useState<'outbound' | 'inbound'>('outbound');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) ref.current?.focus(); }, [open, type]);

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/crm/leads/${leadId}/interactions`, { type, direction: dir, content: text });
      setText(''); setOpen(false); onSaved();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: 'var(--notion-card, white)',
      boxShadow: open
        ? '0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(124,58,237,0.3)'
        : '0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
      transition: 'box-shadow 0.2s',
    }}>
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: '#7c3aed' }}>+</div>
          <span className="text-sm flex-1" style={{ color: '#9B9A97' }}>{t('composeHint')}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {Object.values(CH).slice(0, 5).map(c => (
              <span key={c.label} className="text-sm opacity-50"><HandIcon name={c.icon} size={14} /></span>
            ))}
          </div>
        </button>
      ) : (
        <>
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap"
            style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
            {Object.entries(CH).map(([chKey, cfg]) => (
              <button key={chKey} onClick={() => setType(chKey)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: type === chKey ? cfg.color : cfg.bg,
                  color: type === chKey ? 'white' : cfg.color,
                  transform: type === chKey ? 'scale(1.05)' : 'none',
                }}>
                <HandIcon name={cfg.icon} size={14} /> {cfg.label}
              </button>
            ))}
            <div className="ml-auto flex gap-1.5">
              {(['outbound', 'inbound'] as const).map(d => (
                <button key={d} onClick={() => setDir(d)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  style={{
                    background: dir === d ? '#7c3aed' : 'var(--notion-active)',
                    color: dir === d ? 'white' : '#9B9A97',
                    border: `1px solid ${dir === d ? '#7c3aed' : 'var(--notion-border)'}`,
                  }}>
                  {d === 'outbound' ? `↗ ${t('dirOutbound')}` : `↙ ${t('dirInbound')}`}
                </button>
              ))}
            </div>
          </div>
          <textarea ref={ref} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            rows={4} className="w-full px-4 py-3.5 text-sm outline-none resize-none"
            style={{ color: 'var(--notion-text)' }}
            placeholder={t('composePlaceholder', { label: CH[type]?.label || '' })} />
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderTop: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
            <span className="text-[10px]" style={{ color: '#9B9A97' }}>
              {text.length > 0 ? t('composeCharCount', { n: text.length }) : t('composeSubmitHint')}
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setOpen(false); setText(''); }}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ color: '#9B9A97', border: '1px solid var(--notion-border)' }}>{t('composeCancel')}</button>
              <button onClick={submit} disabled={!text.trim() || saving}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ background: '#7c3aed', opacity: !text.trim() || saving ? 0.4 : 1 }}>
                {saving ? t('composeSaving') : t('composeSave')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Comms Tab ─────────────────────────────────────────────────────────────────
function CommsTab({ leadId, interactions, onRefresh }: {
  leadId: string; interactions: Interaction[]; onRefresh: () => void;
}) {
  const t = useTranslations('customer360');
  const CH = getCH(t);
  const [view, setView] = useState<'timeline' | 'channel' | 'list'>('timeline');
  const [filterCh, setFilterCh] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = filterCh === 'all' ? interactions : interactions.filter(i => i.type === filterCh);

  const grouped: [string, Interaction[]][] = [];
  if (view === 'timeline') {
    const map = new Map<string, Interaction[]>();
    for (const i of filtered) {
      const k = dateGroupKey(i.created_at, t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    }
    grouped.push(...Array.from(map.entries()));
  }

  const byChannel: [string, Interaction[]][] = [];
  if (view === 'channel') {
    const map = new Map<string, Interaction[]>();
    for (const i of interactions) {
      if (!map.has(i.type)) map.set(i.type, []);
      map.get(i.type)!.push(i);
    }
    byChannel.push(...Array.from(map.entries()));
  }

  return (
    <div className="space-y-4">
      <ComposeBox leadId={leadId} onSaved={onRefresh} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
          {([['timeline', t('viewTimeline')], ['channel', t('viewChannel')], ['list', t('viewList')]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 text-xs font-medium"
              style={{
                background: view === v ? '#7c3aed' : 'white',
                color: view === v ? 'white' : '#9B9A97',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setFilterCh('all')}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium"
            style={{
              background: filterCh === 'all' ? '#7c3aed' : 'white',
              color: filterCh === 'all' ? 'white' : '#374151',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
            }}>
            {t('filterAll', { n: interactions.length })}
          </button>
          {Object.entries(CH).filter(([k]) => interactions.some(i => i.type === k)).map(([k, cfg]) => {
            const cnt = interactions.filter(i => i.type === k).length;
            return (
              <button key={k} onClick={() => setFilterCh(k)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                style={{
                  background: filterCh === k ? cfg.color : 'white',
                  color: filterCh === k ? 'white' : cfg.color,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
                }}>
                <HandIcon name={cfg.icon} size={14} /> {cfg.label} {cnt}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center rounded-2xl" style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <p className="text-3xl mb-2"><HandIcon name="chat-bubble" size={28} /></p>
          <p className="text-sm" style={{ color: '#9B9A97' }}>{t('noInteractions')}</p>
        </div>
      )}

      {view === 'timeline' && grouped.map(([label, items]) => (
        <div key={label}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px" style={{ background: 'var(--notion-border)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ color: '#9B9A97', background: 'var(--notion-hover)' }}>{label}</span>
            <div className="flex-1 h-px" style={{ background: 'var(--notion-border)' }} />
          </div>
          <div className="space-y-2">
            {items.map(i => (
              <InteractionCard key={i.id} i={i} expanded={expandedId === i.id}
                onToggle={() => setExpandedId(expandedId === i.id ? null : i.id)} />
            ))}
          </div>
        </div>
      ))}

      {view === 'channel' && byChannel.map(([chType, items]) => {
        const cfg = CH[chType] ?? CH.note;
        return (
          <div key={chType} className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
            <div className="px-4 py-3 flex items-center gap-2"
              style={{ borderBottom: '1px solid var(--notion-border)', background: cfg.bg }}>
              <span className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: 'var(--notion-card, white)', color: cfg.color }}>
                {t('channelCount', { n: items.length })}
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--notion-border)' }}>
              {items.map(i => (
                <div key={i.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: i.direction === 'inbound' ? '#f0fdf4' : '#eff6ff',
                        color: i.direction === 'inbound' ? '#15803d' : '#1d4ed8',
                      }}>
                      {i.direction === 'inbound' ? `↙ ${t('dirInbound')}` : `↗ ${t('dirOutbound')}`}
                    </span>
                    <span className="text-[10px] ml-auto" style={{ color: '#9B9A97' }}>{relTime(i.created_at, t)}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--notion-text)' }}>
                    {i.content.length > 200 ? i.content.slice(0, 200) + '…' : i.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {view === 'list' && filtered.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
                {[t('thChannel'), t('thDirection'), t('thContentSummary'), t('thOwner'), t('thTime')].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold" style={{ color: '#9B9A97' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i, idx) => {
                const cfg = CH[i.type] ?? CH.note;
                return (
                  <tr key={i.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid var(--notion-border)' : 'none' }}
                    className="hover:bg-[var(--notion-hover)] transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span><HandIcon name={cfg.icon} size={14} /></span>
                        <span style={{ color: cfg.color }}>{cfg.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: i.direction === 'inbound' ? '#f0fdf4' : '#eff6ff',
                          color: i.direction === 'inbound' ? '#15803d' : '#1d4ed8',
                        }}>
                        {i.direction === 'inbound' ? t('dirInbound') : t('dirOutbound')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: 'var(--notion-text)' }}>
                      {i.content.slice(0, 80)}{i.content.length > 80 ? '…' : ''}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: '#9B9A97' }}>{i.created_by_name || '—'}</td>
                    <td className="px-4 py-2.5" style={{ color: '#9B9A97' }} title={absTime(i.created_at)}>
                      {relTime(i.created_at, t)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px dashed var(--notion-border)' }}>
        <p className="text-xs font-semibold mb-3" style={{ color: '#9B9A97' }}>{t('connectedApps')}</p>
        <div className="flex gap-3">
          {(['feishu', 'dingtalk', 'wechat_work'] as const).map(k => {
            const cfg = CH[k];
            return (
              <div key={k} className="flex-1 rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer"
                style={{ background: cfg.bg, border: `1px dashed ${cfg.border}` }}>
                <span className="text-xl"><HandIcon name={cfg.icon} size={20} /></span>
                <span className="text-[10px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="text-[9px]" style={{ color: '#9B9A97' }}>{t('notConnected')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Profile Tab ─────────────────────────────────────────────────────────────────
function ProfileTab({ leadId, lead, onRefresh }: {
  leadId: string; lead: Record<string, any>; onRefresh: () => void;
}) {
  const t = useTranslations('customer360');
  const LEAD_STATUS = getLeadStatus(t);
  const LEAD_STATUSES = getLeadStatuses(t);
  const SOURCES = getSources(t);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [research, setResearch] = useState<CompanyResearch | null>(null);
  const [researching, setResearching] = useState(false);

  function startEdit(section: string) {
    setEditing(section);
    setDraft({ ...lead, custom_fields: { ...(lead.custom_fields ?? {}) } });
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.patch(`/api/crm/leads/${leadId}/profile`, draft);
      setEditing(null); onRefresh();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function runResearch() {
    setResearching(true);
    try {
      const r = await api.post(`/api/crm/leads/${leadId}/ai-research-company`, {});
      setResearch(r as CompanyResearch);
      onRefresh();
    } catch (e: any) { alert(e.message); }
    finally { setResearching(false); }
  }

  function field(label: string, key: string, opts?: { type?: string; options?: string[] }) {
    const val = editing === 'basic' || editing === 'company' || editing === 'followup'
      ? (key.startsWith('cf_')
        ? draft.custom_fields?.[key.slice(3)] ?? ''
        : draft[key] ?? '')
      : (key.startsWith('cf_')
        ? lead.custom_fields?.[key.slice(3)] ?? ''
        : lead[key] ?? '');

    const isEditing = editing !== null;
    const editable = isEditing;

    function onChange(v: string) {
      if (key.startsWith('cf_')) {
        setDraft(d => ({ ...d, custom_fields: { ...d.custom_fields, [key.slice(3)]: v } }));
      } else {
        setDraft(d => ({ ...d, [key]: v }));
      }
    }

    return (
      <div key={key} className="flex items-start gap-3 py-2"
        style={{ borderBottom: '1px solid var(--notion-border)' }}>
        <span className="text-[11px] w-20 flex-shrink-0 pt-1" style={{ color: '#9B9A97' }}>{label}</span>
        {editable ? (
          opts?.options ? (
            <select value={val} onChange={e => onChange(e.target.value)}
              className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
              style={{ border: '1px solid #7c3aed', color: 'var(--notion-text)' }}>
              <option value="">—</option>
              {opts.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={opts?.type ?? 'text'} value={val} onChange={e => onChange(e.target.value)}
              className="flex-1 text-xs px-2 py-1 rounded-lg outline-none"
              style={{ border: '1px solid #7c3aed', color: 'var(--notion-text)' }} />
          )
        ) : (
          <span className="flex-1 text-xs" style={{ color: val ? 'var(--notion-text)' : '#D0CFC9' }}>
            {val || '—'}
          </span>
        )}
      </div>
    );
  }

  function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{title}</span>
          {editing === id ? (
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)}
                className="text-xs px-3 py-1 rounded-lg" style={{ color: '#9B9A97', border: '1px solid var(--notion-border)' }}>
                {t('cancelBtn')}
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="text-xs px-3 py-1 rounded-lg text-white"
                style={{ background: '#7c3aed', opacity: saving ? 0.5 : 1 }}>
                {saving ? t('savingBtn') : t('saveBtn')}
              </button>
            </div>
          ) : (
            <button onClick={() => startEdit(id)}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{ color: '#7c3aed', background: '#ede9fe' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#ddd6fe')}
              onMouseLeave={e => (e.currentTarget.style.background = '#ede9fe')}>
              {t('editBtn')}
            </button>
          )}
        </div>
        <div className="px-5 pb-3 pt-1">{children}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section id="basic" title={t('sectionBasicInfo')}>
        {field(t('fieldName'), 'full_name')}
        {field(t('fieldEmail'), 'email', { type: 'email' })}
        {field(t('fieldPhone'), 'phone', { type: 'tel' })}
        {field(t('fieldWhatsApp'), 'whatsapp')}
        {field(t('fieldTitle'), 'title')}
        {field(t('fieldSource'), 'source', { options: SOURCES })}
        {field(t('fieldStatus'), 'status', { options: LEAD_STATUSES.map(s => s.key) })}
      </Section>

      <Section id="company" title={t('sectionCompanyInfo')}>
        <div className="flex items-center gap-2 py-2 mb-1">
          {field(t('fieldCompanyName'), 'company')}
          {lead.company && !editing && (
            <button onClick={runResearch} disabled={researching}
              className="flex-shrink-0 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-medium"
              style={{ background: researching ? 'var(--notion-hover)' : '#ede9fe', color: '#7c3aed' }}>
              {researching ? (
                <><span className="animate-spin">⟳</span> {t('aiResearching')}</>
              ) : (
                <><span>✦</span> {t('aiResearch')}</>
              )}
            </button>
          )}
        </div>
        {field(t('fieldWebsite'), 'cf_website')}
        {field(t('fieldCountry'), 'cf_country')}
        {field(t('fieldCity'), 'cf_city')}
        {field(t('fieldIndustry'), 'cf_industry')}
        {field(t('fieldCompanySize'), 'cf_company_size')}

        {(research || lead.ai_summary) && (
          <div className="mt-3 rounded-xl p-4"
            style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #c4b5fd' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">✦</span>
              <span className="text-xs font-semibold" style={{ color: '#7c3aed' }}>{t('aiResearchReport')}</span>
            </div>
            {research ? (
              <>
                <p className="text-xs leading-relaxed mb-2" style={{ color: '#374151' }}>{research.summary}</p>
                <div className="flex gap-3 flex-wrap mb-2">
                  {research.industry && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#ddd6fe', color: '#7c3aed' }}>
                      <HandIcon name="factory" size={10} /> {research.industry}
                    </span>
                  )}
                  {research.size && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#ddd6fe', color: '#7c3aed' }}>
                      <HandIcon name="people-group" size={10} /> {research.size}
                    </span>
                  )}
                </div>
                {research.products?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-semibold mb-1" style={{ color: '#9B9A97' }}>{t('aiMainProducts')}</p>
                    <div className="flex flex-wrap gap-1">
                      {research.products.slice(0, 5).map(p => (
                        <span key={p} className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--notion-card, white)', color: '#5F5E5B', border: '1px solid var(--notion-border)' }}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>{lead.ai_summary}</p>
            )}
          </div>
        )}
      </Section>

      <Section id="followup" title={t('sectionFollowup')}>
        {field(t('fieldNotes'), 'notes')}
        {field(t('fieldBudget'), 'cf_budget')}
        {field(t('fieldPurchaseCycle'), 'cf_purchase_cycle')}
        {field(t('fieldDecisionMaker'), 'cf_decision_maker')}
      </Section>
    </div>
  );
}

// ── Business Tab ─────────────────────────────────────────────────────────────────
function BusinessTab({
  contracts, currentLead, relatedLeads, tenantSlug,
}: {
  contracts: Contract360[];
  currentLead: Record<string, any>;
  relatedLeads: RelatedLead[];
  tenantSlug: string;
}) {
  const t = useTranslations('customer360');
  const LEAD_STATUS = getLeadStatus(t);
  const CONTRACT_STATUS = getContractStatus(t);
  const router = useRouter();

  // All leads: current + related (deduplicated)
  const allLeads: RelatedLead[] = [
    {
      id: currentLead.id,
      full_name: currentLead.full_name,
      company: currentLead.company,
      email: currentLead.email,
      status: currentLead.status,
      source: currentLead.source,
      is_cold: currentLead.is_cold,
      cold_lead_reason: currentLead.cold_lead_reason,
      created_at: currentLead.created_at,
      updated_at: currentLead.updated_at,
      assigned_to_name: currentLead.assigned_to_name,
    },
    ...relatedLeads,
  ];

  const LEAD_STAGE_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    inquiry:     { label: t('lsInquiry'),     color: '#818cf8', bg: '#eef2ff',  icon: 'target' },
    new:         { label: t('lsNew'),         color: '#60a5fa', bg: '#eff6ff',  icon: 'sparkle-new' },
    replied:     { label: t('lsReplied'),     color: '#34d399', bg: '#ecfdf5',  icon: 'phone' },
    quoted:      { label: t('lsQuoted'),      color: '#fbbf24', bg: '#fffbeb',  icon: 'money-bag' },
    engaged:     { label: t('lsEngaged'),     color: '#f97316', bg: '#fff7ed',  icon: 'flame' },
    qualified:   { label: t('lsQualified'),   color: '#e879f9', bg: '#fdf4ff',  icon: 'target' },
    negotiating: { label: t('lsNegotiating'), color: '#f43f5e', bg: '#fff1f2',  icon: 'handshake' },
    fulfillment: { label: t('lsFulfillment'), color: '#0284c7', bg: '#e0f2fe',  icon: 'ship' },
    payment:     { label: t('lsPayment'),     color: '#059669', bg: '#d1fae5',  icon: 'dollar-bill' },
    converted:   { label: t('lsConverted'),   color: '#0f9d58', bg: '#f0fdf4',  icon: 'checkmark' },
    cold:        { label: t('lsCold'),        color: '#9B9A97', bg: 'var(--notion-hover)',  icon: 'ice-cube' },
    lost:        { label: t('lsLost'),        color: '#9B9A97', bg: 'var(--notion-hover)',  icon: 'cross-mark' },
  };

  function LeadRow({ lead, isCurrent }: { lead: RelatedLead; isCurrent: boolean }) {
    const meta = LEAD_STAGE_META[lead.is_cold ? 'cold' : lead.status]
      ?? { label: lead.status, color: '#9B9A97', bg: 'var(--notion-hover)', icon: '•' };
    const createdDate = lead.created_at
      ? new Date(lead.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-all rounded-xl group"
        style={{
          background: isCurrent ? '#f5f3ff' : 'white',
          border: isCurrent ? '1px solid #c4b5fd' : '1px solid var(--notion-border)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
        onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'var(--notion-hover)'; }}
        onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'white'; }}
        onClick={() => router.push(`/${tenantSlug}/crm/customer-360/${lead.id}`)}
      >
        {/* Icon */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
          style={{ background: meta.bg }}>
          <HandIcon name={meta.icon} size={16} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: '#374151' }}>
              {lead.full_name}
            </span>
            {isCurrent && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: '#ede9fe', color: '#7c3aed' }}>{t('currentLabel')}</span>
            )}
            {lead.status === 'converted' && !lead.is_cold && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: '#d1fae5', color: '#065f46' }}><HandIcon name="star" size={10} /> {t('convertedLabel')}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
              style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
            {lead.source && (
              <span className="text-[10px]" style={{ color: '#9B9A97' }}>{t('sourceLabel')}: {lead.source}</span>
            )}
            {lead.assigned_to_name && (
              <span className="text-[10px]" style={{ color: '#9B9A97' }}>{t('assignedLabel')}: {lead.assigned_to_name}</span>
            )}
            {createdDate && (
              <span className="text-[10px]" style={{ color: '#C2C0BC' }}>{createdDate}</span>
            )}
          </div>
          {lead.is_cold && lead.cold_lead_reason && (
            <p className="text-[10px] mt-1 leading-relaxed" style={{ color: '#9B9A97' }}>
              {t('coldLeadReason')}: {lead.cold_lead_reason}
            </p>
          )}
        </div>

        {/* Arrow */}
        <svg className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    );
  }

  function ContractCard({ c }: { c: Contract360 }) {
    const st = CONTRACT_STATUS[c.status] ?? { bg: 'var(--notion-hover)', text: '#5F5E5B', label: c.status };
    const pct = c.receivable_total > 0
      ? Math.min(100, Math.round((c.receivable_received / c.receivable_total) * 100))
      : 0;
    const payPct = c.payable_total > 0
      ? Math.min(100, Math.round((c.payable_paid / c.payable_total) * 100))
      : 0;
    return (
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
        <div className="px-5 py-3.5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-bold font-mono" style={{ color: '#374151' }}>{c.contract_no}</p>
              {c.account_label && (
                <p className="text-[11px] mt-0.5" style={{ color: '#9B9A97' }}>{c.account_label}</p>
              )}
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
              style={{ background: st.bg, color: st.text }}>{st.label}</span>
          </div>
          <div className="flex items-baseline gap-1 mb-3">
            <span className="text-xl font-bold" style={{ color: '#1d4ed8' }}>
              {c.currency} {Number(c.contract_amount || 0).toLocaleString()}
            </span>
          </div>
          {/* Receivable progress */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px]" style={{ color: '#9B9A97' }}>{t('paymentProgressLabel')}</span>
              <span className="text-[10px] font-semibold" style={{ color: '#15803d' }}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--notion-hover)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: pct === 100 ? '#15803d' : '#7c3aed' }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px]" style={{ color: '#9B9A97' }}>
                {t('received', { currency: c.currency, amount: Number(c.receivable_received || 0).toLocaleString( ) })}
              </span>
              <span className="text-[9px]" style={{ color: '#9B9A97' }}>
                {t('receivable', { currency: c.currency, amount: Number(c.receivable_total || 0).toLocaleString( ) })}
              </span>
            </div>
          </div>
          {/* Payable progress */}
          {c.payable_total > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px]" style={{ color: '#9B9A97' }}>应付进度</span>
                <span className="text-[10px] font-semibold" style={{ color: '#dc2626' }}>{payPct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--notion-hover)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${payPct}%`, background: payPct === 100 ? '#15803d' : '#f59e0b' }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px]" style={{ color: '#9B9A97' }}>
                  已付: {c.currency} {Number(c.payable_paid || 0).toLocaleString()}
                </span>
                <span className="text-[9px]" style={{ color: '#9B9A97' }}>
                  应付: {c.currency} {Number(c.payable_total || 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}
          {c.sign_date && (
            <p className="text-[10px] mt-2" style={{ color: '#9B9A97' }}>
              {t('signedOn')}: {new Date(c.sign_date).toLocaleDateString(undefined)}
            </p>
          )}
          <p className="text-[9px] mt-1" style={{ color: '#b0aead' }}>详见财务管理</p>
        </div>
      </div>
    );
  }

  const activeContracts = contracts.filter(c => !['cancelled', 'completed'].includes(c.status));
  const pastContracts = contracts.filter(c => ['cancelled', 'completed'].includes(c.status));

  return (
    <div className="space-y-6">

      {/* ── 线索历史 ── */}
      <div>
        <p className="text-xs font-bold mb-3 flex items-center gap-2" style={{ color: '#374151' }}>
          <span className="text-sm"><HandIcon name="target" size={14} /></span>
          {t('leadHistory', { n: allLeads.length })}
          <span className="text-[10px] font-normal" style={{ color: '#9B9A97' }}>{t('leadHistoryHint')}</span>
        </p>
        <div className="space-y-2">
          {allLeads.map(lead => (
            <LeadRow key={lead.id} lead={lead} isCurrent={lead.id === currentLead.id} />
          ))}
        </div>
      </div>

      {/* ── 合同记录 ── */}
      <div>
        <p className="text-xs font-bold mb-3 flex items-center gap-2" style={{ color: '#374151' }}>
          <span className="text-sm"><HandIcon name="document" size={14} /></span>
          {t('contractRecords', { n: contracts.length })}
        </p>
        {contracts.length === 0 ? (
          <div className="py-10 text-center rounded-2xl"
            style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <p className="text-2xl mb-1"><HandIcon name="document" size={24} /></p>
            <p className="text-sm" style={{ color: '#9B9A97' }}>{t('noContractRecords')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {activeContracts.length > 0 && (
              <div>
                <p className="text-[10px] font-bold mb-2 flex items-center gap-1.5" style={{ color: '#15803d' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#15803d' }} />
                  {t('activeLabel', { n: activeContracts.length })}
                </p>
                <div className="space-y-3">{activeContracts.map(c => <ContractCard key={c.id} c={c} />)}</div>
              </div>
            )}
            {pastContracts.length > 0 && (
              <div>
                <p className="text-[10px] font-bold mb-2 flex items-center gap-1.5" style={{ color: '#9B9A97' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#D0CFC9' }} />
                  {t('historyLabel', { n: pastContracts.length })}
                </p>
                <div className="space-y-3">{pastContracts.map(c => <ContractCard key={c.id} c={c} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Timeline Tab ────────────────────────────────────────────────────────────────
function TimelineTab({ interactions, contracts, auditLogs, lead }: {
  interactions: Interaction[];
  contracts: Contract360[];
  auditLogs: AuditLog[];
  lead: Record<string, any>;
}) {
  const t = useTranslations('customer360');
  const CH = getCH(t);
  const CONTRACT_STATUS = getContractStatus(t);
  type TLItem = { id: string; ts: string; kind: string; data: any };
  const items: TLItem[] = [
    { id: 'created', ts: lead.created_at, kind: 'created', data: { source: lead.source } },
    ...interactions.map(i => ({ id: i.id, ts: i.created_at, kind: 'interaction', data: i })),
    ...contracts.map(c => ({ id: `c-${c.id}`, ts: c.created_at, kind: 'contract', data: c })),
    ...auditLogs.map(al => ({ id: al.id, ts: al.created_at, kind: 'audit', data: al })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const grouped = new Map<string, TLItem[]>();
  for (const item of items) {
    const k = dateGroupKey(item.ts, t);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(item);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([label, grpItems]) => (
        <div key={label}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px" style={{ background: 'var(--notion-border)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ color: '#9B9A97', background: 'var(--notion-hover)' }}>{label}</span>
            <div className="flex-1 h-px" style={{ background: 'var(--notion-border)' }} />
          </div>
          <div className="space-y-2">
            {grpItems.map(item => {
              if (item.kind === 'interaction') {
                const i: Interaction = item.data;
                const cfg = CH[i.type] ?? CH.note;
                return (
              <div key={item.id} className="rounded-xl px-4 py-3"
                style={{ background: 'var(--notion-card, white)', borderLeft: `4px solid ${cfg.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                  <span className="text-[10px] text-[#9B9A97] ml-auto">
                    {i.direction === 'inbound' ? `↙ ${t('dirInbound')}` : `↗ ${t('dirOutbound')}`} · {relTime(i.created_at, t)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed mb-1" style={{ color: 'var(--notion-text)' }}>
                  {i.content.slice(0, 100)}{i.content.length > 100 ? '…' : ''}
                </p>
                <p className="text-[10px] text-[#9B9A97]">
                  {(i.created_by_name || i.created_by)
                    ? `${i.created_by_name || i.created_by} · ${absTime(i.created_at)}`
                    : absTime(i.created_at)}
                </p>
              </div>
            );
          }
              if (item.kind === 'contract') {
                const c: Contract360 = item.data;
                const st = CONTRACT_STATUS[c.status] ?? { bg: 'var(--notion-hover)', text: '#5F5E5B', label: c.status };
                return (
              <div key={item.id} className="rounded-xl px-4 py-3"
                style={{ background: 'var(--notion-card, white)', borderLeft: '4px solid #D0CFC9', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold font-mono" style={{ color: '#374151' }}>{c.contract_no}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: st.bg, color: st.text }}>{st.label}</span>
                  <span className="text-xs font-bold ml-auto" style={{ color: '#374151' }}>
                    {c.currency} {Number(c.contract_amount || 0).toLocaleString()}
                  </span>
                </div>
                <p className="text-[10px] text-[#9B9A97]">
                  {relTime(c.created_at, t)}
                </p>
              </div>
            );
          }
              if (item.kind === 'created') {
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ background: 'var(--notion-card, white)', borderLeft: '4px solid #a5b4fc', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <span className="text-sm"><HandIcon name="target" size={14} /></span>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: '#374151' }}>{t('leadCreated')}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#9B9A97' }}>
                        {t('createdFrom', { source: item.data.source })} · {relTime(item.ts, t)}
                      </p>
                    </div>
                  </div>
                );
              }
              if (item.kind === 'audit') {
                const al: AuditLog = item.data;
                return (
              <div key={item.id} className="rounded-xl px-4 py-3"
                style={{ background: 'var(--notion-card, white)', borderLeft: '4px solid #e9d5ff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <p className="text-xs font-semibold" style={{ color: '#374151' }}>{al.action}</p>
                <p className="text-[10px] text-[#9B9A97] mt-1">
                  {(al.user_name || al.user_email_addr)
                    ? `${al.user_name || al.user_email_addr} · ${absTime(al.created_at)}`
                    : absTime(al.created_at)}
                </p>
              </div>
            );
          }
              return null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Cold Lead Modal ───────────────────────────────────────────────────────────
function ColdLeadModal({ leadId, onClose, onSaved }: {
  leadId: string; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('customer360');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!reason.trim()) { alert(t('coldLeadReasonAlert')); return; }
    setSaving(true);
    try {
      await api.patch(`/api/crm/leads/${leadId}/cold`, { reason });
      onSaved();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ width: 480 }}>
        <div className="px-6 py-4 flex items-center gap-3"
          style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
          <span className="text-xl"><HandIcon name="ice-cube" size={20} /></span>
          <span className="font-semibold text-sm" style={{ color: 'var(--notion-text)' }}>{t('markAsCold')}</span>
          <button onClick={onClose} className="ml-auto p-1 rounded-lg" style={{ color: '#9B9A97' }}>✕</button>
        </div>
        <div className="px-6 py-4">
          <p className="text-xs mb-4" style={{ color: '#9B9A97' }}>
            {t('coldLeadDesc')}
          </p>
          <label className="block text-xs font-medium mb-2" style={{ color: '#5F5E5B' }}>{t('coldLeadReasonReq')}</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            placeholder={t('coldLeadPlaceholder')}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
            autoFocus
          />
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ color: '#9B9A97', border: '1px solid var(--notion-border)' }}>
              {t('composeCancel')}
            </button>
            <button onClick={submit} disabled={!reason.trim() || saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#6b7280', opacity: !reason.trim() || saving ? 0.5 : 1 }}>
              {saving ? t('composeSaving') : t('confirmColdLead')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Customer360Page() {
  const t = useTranslations('customer360');
  const CH = getCH(t);
  const LEAD_STATUS = getLeadStatus(t);
  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const dynamicFlowSteps = workflowStages.length ? workflowStages : getFlowSteps(t);
  const FLOW_STEPS = dynamicFlowSteps;
  const { tenant, id } = useParams<{ tenant: string; id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Lead360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const tabParam = searchParams.get('tab') as 'comms' | 'profile' | 'business' | 'timeline' | 'workflow' | null;
  const [tab, setTab] = useState<'comms' | 'profile' | 'business' | 'timeline' | 'workflow'>(tabParam || 'workflow');
  const [tabInitialized, setTabInitialized] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [showColdModal, setShowColdModal] = useState(false);
  const [changingStage, setChangingStage] = useState(false);
  useEffect(() => {
    let mounted = true;
    api.get('/api/crm/workflow-template')
      .then(data => {
        if (!mounted) return;
        setWorkflowStages(normalizeWorkflowStages(data?.definition?.stages ?? [], t));
      })
      .catch(err => {
        if (!mounted) return;
        setWorkflowError(err.message || '无法加载流程');
      })
      .finally(() => {
        if (mounted) setWorkflowLoading(false);
      });
    return () => { mounted = false; };
  }, [t]);

  const load = useCallback(async () => {
    try { setData(await api.get(`/api/crm/customer-360/${id}`)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Default to 'business' tab for customers (converted leads)
  useEffect(() => {
    if (data && !tabInitialized && !tabParam) {
      const isCustomerCheck = data.lead.status === 'converted' || data.contracts.length > 0;
      if (isCustomerCheck) {
        setTab('business');
      }
      setTabInitialized(true);
    }
  }, [data, tabInitialized, tabParam]);

  async function advanceStage() {
    setAdvancing(true);
    try {
      await api.patch(`/api/crm/leads/${id}/advance-stage`, {});
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setAdvancing(false); }
  }

  const FAMILIARITY_STAGES = [
    { key: 'new', label: t('fsNew'), color: '#60a5fa', bg: '#eff6ff' },
    { key: 'replied', label: t('fsReplied'), color: '#34d399', bg: '#ecfdf5' },
    { key: 'quoted', label: t('fsQuoted'), color: '#fbbf24', bg: '#fffbeb' },
    { key: 'engaged', label: t('fsEngaged'), color: '#f97316', bg: '#fff7ed' },
    { key: 'qualified', label: t('fsQualified'), color: '#e879f9', bg: '#fdf4ff' },
    { key: 'negotiating', label: t('fsNegotiating'), color: '#f43f5e', bg: '#fff1f2' },
    { key: 'converted', label: t('fsConverted'), color: '#0f9d58', bg: '#f0fdf4' },
  ];

  async function setFamiliarityStage(newStage: string) {
    if (newStage === lead.familiarity_stage || changingStage) return;
    setChangingStage(true);
    try {
      await api.patch(`/api/crm/leads/${id}`, { familiarity_stage: newStage });
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setChangingStage(false); }
  }

  if (loading) return (
    <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--notion-text-muted)' }}>
      {t('loadingText')}
    </div>
  );
  if (!data) return (
    <div className="h-full flex items-center justify-center text-sm" style={{ color: '#EB5757' }}>
      {t('notFound')}
    </div>
  );

  const { lead, interactions, contracts, audit_logs } = data;
  const statusCfg = LEAD_STATUS[lead.status] ?? { label: lead.status, color: '#9B9A97', bg: 'var(--notion-hover)' };
  const totalValue = contracts.reduce((s, c) => s + (c.contract_amount || 0), 0);
  const activeCount = contracts.filter(c => !['cancelled', 'completed'].includes(c.status)).length;

  const currentStepIdx = getStepIndex(lead.status, FLOW_STEPS);
  const currentStep = FLOW_STEPS[currentStepIdx];
  const isCold = lead.is_cold;
  const isCustomer = lead.status === 'converted' || contracts.length > 0;
  const isConverted = contracts.length > 0;
  const clientIsActive = isActive(lead.updated_at, lead.last_contacted_at);

  // Determine if we can advance
  const NEXT_STAGE_MAP: Record<string, boolean> = {
    inquiry: true, new: true, replied: true, engaged: true,
    qualified: true, quoted: true, negotiating: true,
    procuring: true, booking: true, fulfillment: true, payment: true,
  };
  const canAdvance = NEXT_STAGE_MAP[lead.status] && !isCold;

  const TABS = [
    { key: 'workflow', label: t('tabWorkflow'), badge: 0, icon: 'gear' },
    { key: 'comms',    label: t('tabComms'),    badge: interactions.length },
    { key: 'profile',  label: t('tabProfile'),  badge: 0 },
    { key: 'business', label: t('tabBusiness'), badge: contracts.length },
    { key: 'timeline', label: t('tabTimeline'), badge: 0 },
  ] as const;

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--notion-hover)' }}>

      {/* ── LEFT SIDEBAR (260px) ─────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 h-full overflow-y-auto flex flex-col"
        style={{ background: 'var(--notion-card, white)', borderRight: '1px solid var(--notion-border)' }}>

        {/* Back nav */}
        <div className="px-4 pt-4 pb-1">
          <button onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {isCustomer ? '返回客户列表' : t('backToCustomers')}
          </button>
        </div>

        {/* Identity */}
        <div className="px-5 py-4">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{
                  background: isCustomer
                    ? 'linear-gradient(135deg, #0f9d58, #34d399)'
                    : isCold
                      ? 'linear-gradient(135deg, #9B9A97, #6B7280)'
                      : `linear-gradient(135deg, ${statusCfg.color}, ${statusCfg.color}cc)`,
                  boxShadow: isCustomer
                    ? '0 0 0 3px white, 0 0 0 5px #0f9d5844'
                    : `0 0 0 3px white, 0 0 0 5px ${isCold ? '#9B9A9744' : statusCfg.color + '44'}`,
                }}>
                {lead.full_name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              {/* Active indicator */}
              {clientIsActive && !isCold && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center"
                  style={{ background: '#10b981' }} title={t('activeClient')} />
              )}
            </div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--notion-text)' }}>{lead.full_name}</h2>
            {lead.title && <p className="text-[11px] mt-0.5" style={{ color: '#9B9A97' }}>{lead.title}</p>}
            {lead.company && <p className="text-xs mt-0.5 font-medium" style={{ color: '#5F5E5B' }}>{lead.company}</p>}

            {isCustomer ? (
              <>
                {/* Customer badge */}
                <div className="flex flex-wrap gap-1 mt-2 justify-center">
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold"
                    style={{ background: '#d1fae5', color: '#065f46' }}>
                    <HandIcon name="star" size={10} /> 已转化客户
                  </span>
                  {(lead.custom_fields as Record<string, any>)?.customer_type && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: '#ede9fe', color: '#6d28d9' }}>{(lead.custom_fields as Record<string, any>).customer_type}</span>
                  )}
                  {clientIsActive && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: '#d1fae5', color: '#059669' }}>{t('activeLabel2')}</span>
                  )}
                </div>
                {/* Customer stats summary */}
                <div className="w-full mt-3 grid grid-cols-2 gap-1.5">
                  <div className="rounded-lg px-2 py-1.5" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <p className="text-[9px]" style={{ color: '#9B9A97' }}>合同总额</p>
                    <p className="text-xs font-bold" style={{ color: '#065f46' }}>${totalValue.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <p className="text-[9px]" style={{ color: '#9B9A97' }}>进行中</p>
                    <p className="text-xs font-bold" style={{ color: '#1d4ed8' }}>{activeCount} 单</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Stage + Score for leads */}
                {!isCold && (() => {
                  const stageIdx = FAMILIARITY_STAGES.findIndex(s => s.key === (lead.familiarity_stage || 'new'));
                  const currentStage = FAMILIARITY_STAGES[stageIdx >= 0 ? stageIdx : 0];
                  const progress = Math.round(((stageIdx >= 0 ? stageIdx : 0) + 1) / FAMILIARITY_STAGES.length * 100);
                  return (
                    <div className="w-full mt-2 px-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: currentStage.color, transition: 'width 0.5s ease' }} />
                        </div>
                        <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: currentStage.color }}>{currentStage.label}</span>
                      </div>
                    </div>
                  );
                })()}
                {isCold && (
                  <div className="w-full mt-2 px-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                        <div className="h-full rounded-full" style={{ width: '0%' }} />
                      </div>
                      <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: '#9B9A97' }}>{t('coldLeadLabel')}</span>
                    </div>
                  </div>
                )}

                {/* Status + type badges */}
                <div className="flex flex-wrap gap-1 mt-1.5 justify-center">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: isCold ? 'var(--notion-hover)' : statusCfg.bg, color: isCold ? '#9B9A97' : statusCfg.color }}>
                    {isCold ? <><HandIcon name="ice-cube" size={10} /> {t('coldLeadLabel')}</> : statusCfg.label}
                  </span>
                  {(lead.custom_fields as Record<string, any>)?.customer_type && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: '#ede9fe', color: '#6d28d9' }}>{(lead.custom_fields as Record<string, any>).customer_type}</span>
                  )}
                  {clientIsActive && !isCold && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: '#d1fae5', color: '#059669' }}>{t('activeLabel2')}</span>
                  )}
                </div>
              </>
            )}

            {/* View customer details — only show for leads, not customers */}
            {!isCustomer && (
              <button
                onClick={() => router.push(`/${tenant}/crm/customers?tab=customers&search=${encodeURIComponent(lead.full_name)}`)}
                className="mt-2 text-[10px] font-medium px-3 py-1 rounded-md transition-colors"
                style={{ color: '#7c3aed', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#ede9fe')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                查看客户详情 →
              </button>
            )}
          </div>

          {/* Quick action buttons */}
          <div className="grid grid-cols-5 gap-1.5 mt-4">
            {Object.entries(CH).slice(0, 5).map(([type, cfg]) => (
              <button key={type} title={t('recordLabel', { label: cfg.label })}
                onClick={() => setTab('comms')}
                className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-all"
                style={{ background: 'var(--notion-active)' }}
                onMouseEnter={e => { e.currentTarget.style.background = cfg.bg; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-active)'; e.currentTarget.style.transform = 'none'; }}>
                <span className="text-base leading-none"><HandIcon name={cfg.icon} size={16} /></span>
                <span className="text-[8px] font-medium" style={{ color: '#9B9A97' }}>{cfg.label}</span>
              </button>
            ))}
          </div>

          {/* Cold lead reason display */}
          {isCold && lead.cold_lead_reason && (
            <div className="mt-3 rounded-xl px-3 py-2.5"
              style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#9B9A97' }}>{t('coldLeadReasonLabel')}</p>
              <p className="text-xs leading-relaxed" style={{ color: '#5F5E5B' }}>{lead.cold_lead_reason}</p>
            </div>
          )}
        </div>

        <Divider />

        {/* Assigned rep */}
        {lead.assigned_to_name && (
          <>
            <SideSection title={t('assignedRep')}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: '#7c3aed' }}>
                  {lead.assigned_to_name.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{lead.assigned_to_name}</p>
                  <p className="text-[10px]" style={{ color: '#9B9A97' }}>{t('primaryRep')}</p>
                </div>
              </div>
            </SideSection>
            <Divider />
          </>
        )}

        {/* Contact info */}
        <SideSection title={t('contactInfo')}>
          <div className="space-y-2">
            {[
              { icon: 'envelope', label: t('emailLabel'), value: lead.email },
              { icon: 'phone', label: t('phoneLabel'), value: lead.phone },
              { icon: 'chat-bubble', label: 'WhatsApp', value: lead.whatsapp },
            ].filter(f => f.value).map(f => (
              <div key={f.label} className="flex items-center gap-2">
                <span className="text-xs w-4 flex-shrink-0"><HandIcon name={f.icon} size={12} /></span>
                <span className="text-[10px] flex-shrink-0 w-14" style={{ color: '#9B9A97' }}>{f.label}</span>
                <span className="text-[11px] flex-1 truncate" style={{ color: 'var(--notion-text)' }}>{f.value}</span>
              </div>
            ))}
          </div>
        </SideSection>

        <Divider />


        {/* Stats */}
        <SideSection title={t('businessOverview')}>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: t('totalContractValue'), value: `$${totalValue.toLocaleString()}`, color: '#1d4ed8' },
              { label: t('tabBusiness'), value: t('inProgressCount', { n: activeCount }), color: '#7c3aed' },
              { label: t('tabComms'), value: t('interactionCount', { n: interactions.length }), color: '#15803d' },
              { label: t('tabTimeline'), value: t('totalContracts', { n: contracts.length }), color: '#5F5E5B' },
            ].map(s => (
              <div key={s.label} className="rounded-xl px-3 py-2"
                style={{ background: 'var(--notion-active)', border: '1px solid var(--notion-border)' }}>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: '#9B9A97' }}>{s.label}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        </SideSection>

        <Divider />

        {/* Actions */}
        <SideSection title={t('actionsLabel')}>
          <div className="space-y-2">
            {!isCold && (
              <button onClick={() => setShowColdModal(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                style={{ color: '#9B9A97', border: '1px solid var(--notion-border)', background: 'var(--notion-active)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--notion-active)')}>
                <HandIcon name="ice-cube" size={14} /> {t('markColdBtn')}
              </button>
            )}
          </div>
        </SideSection>

        <div className="flex-1" />

        {/* Last contacted */}
        {lead.last_contacted_at && (
          <div className="px-5 py-3" style={{ borderTop: '1px solid var(--notion-border)' }}>
            <p className="text-[10px]" style={{ color: '#9B9A97' }}>
              {t('lastContacted')}: {relTime(lead.last_contacted_at, t)}
            </p>
          </div>
        )}
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <main className="flex-1 h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6">

          {/* ── 6-Step Business Flow Stepper ── */}
          <div className="mb-6 rounded-2xl overflow-hidden"
            style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>
                {isCustomer ? '客户历程' : t('businessFlow')}
                {isCold && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--notion-hover)', color: '#9B9A97' }}>{t('coldLeadBadge')}</span>}
                {isCustomer && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#d1fae5', color: '#065f46' }}>已完成转化</span>}
              </p>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-0">
                {FLOW_STEPS.map((step, idx) => {
                  const isDone = isCustomer ? true : idx < currentStepIdx;
                  const isCurrent = isCustomer ? false : (idx === currentStepIdx && !isCold);
                  const isFuture = isCustomer ? false : idx > currentStepIdx;
                  return (
                    <div key={step.key} className="flex items-center flex-1 min-w-0">
                      {/* Step node */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                          style={{
                            background: isCold ? 'var(--notion-hover)'
                              : isDone ? step.color
                              : isCurrent ? step.color
                              : 'var(--notion-active)',
                            color: isCold ? '#9B9A97'
                              : isDone || isCurrent ? 'white'
                              : '#D0CFC9',
                            boxShadow: isCurrent ? `0 0 0 3px ${step.color}33` : 'none',
                            transform: isCurrent ? 'scale(1.1)' : 'none',
                          }}>
                          {isDone ? <HandIcon name="checkmark" size={14} /> : <HandIcon name={step.icon} size={14} />}
                        </div>
                        <span className="text-[10px] font-medium mt-1.5 whitespace-nowrap"
                          style={{
                            color: isCold ? '#9B9A97'
                              : isCurrent ? step.color
                              : isDone ? '#374151'
                              : '#D0CFC9',
                            fontWeight: isCurrent ? 700 : 500,
                          }}>
                          {step.label}
                        </span>
                      </div>
                      {/* Connector line */}
                      {idx < FLOW_STEPS.length - 1 && (
                        <div className="flex-1 h-0.5 mx-1 rounded-full transition-all"
                          style={{
                            background: isCold ? '#E3E2E0'
                              : isDone ? step.color
                              : 'var(--notion-border)',
                          }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Current stage description */}
              {!isCold && !isCustomer && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--notion-border)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm"><HandIcon name={currentStep.icon} size={14} /></span>
                      <span className="text-xs font-semibold" style={{ color: currentStep.color }}>
                        {t('currentStage', { label: currentStep.label })}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {isCustomer && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--notion-border)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm"><HandIcon name="checkmark" size={14} /></span>
                    <span className="text-xs font-semibold" style={{ color: '#0f9d58' }}>
                      客户已完成全部业务流程转化
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-6 rounded-xl p-1"
            style={{ background: 'var(--notion-active)', border: '1px solid var(--notion-border)', width: 'fit-content' }}>
            {TABS.map(tb => (
              <button key={tb.key} onClick={() => setTab(tb.key)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: tab === tb.key ? 'white' : 'transparent',
                  color: tab === tb.key ? 'var(--notion-text)' : '#9B9A97',
                  boxShadow: tab === tb.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}>
                {'icon' in tb && tb.icon && <HandIcon name={tb.icon as string} size={12} />}
                {tb.label}
                {tb.badge > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                    style={{
                      background: tab === tb.key ? '#ede9fe' : 'var(--notion-border)',
                      color: tab === tb.key ? '#7c3aed' : '#9B9A97',
                    }}>
                    {tb.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'workflow' && (
            <WorkflowTab leadId={id} isCold={isCold} onMarkCold={() => setShowColdModal(true)} />
          )}
          {tab === 'comms' && (
            <CommsTab leadId={id} interactions={interactions} onRefresh={load} />
          )}
          {tab === 'profile' && (
            <ProfileTab leadId={id} lead={lead} onRefresh={load} />
          )}
          {tab === 'business' && (
            <BusinessTab contracts={contracts} currentLead={lead} relatedLeads={data.related_leads ?? []} tenantSlug={tenant} />
          )}
          {tab === 'timeline' && (
            <TimelineTab interactions={interactions} contracts={contracts} auditLogs={audit_logs} lead={lead} />
          )}

          <div className="h-12" />
        </div>
      </main>

      {/* Cold Lead Modal */}
      {showColdModal && (
        <ColdLeadModal
          leadId={id}
          onClose={() => setShowColdModal(false)}
          onSaved={() => { setShowColdModal(false); load(); }}
        />
      )}
    </div>
  );
}
