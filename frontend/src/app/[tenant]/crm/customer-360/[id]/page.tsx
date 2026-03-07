'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { WorkflowTab } from './WorkflowTab';
import { HandIcon } from '@/components/ui/HandIcon';
import WhatsAppChatPanel from '@/components/messaging/WhatsAppChatPanel';
import SlideOver from '@/components/ui/SlideOver';
import LeadModal, { TenantUser } from '../../components/LeadModal';
import LeadScoreCard from '@/components/ai/LeadScoreCard';
import { usePipelineConfig } from '@/lib/usePipelineConfig';

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

type WaContact = {
  id: string; wa_account_id: string; wa_jid: string;
  phone_number?: string; display_name?: string; push_name?: string;
  profile_pic_url?: string; is_group?: boolean;
  last_message_at?: string; unread_count?: number;
};
type WaMessage = {
  id: string; wa_contact_id: string; direction: string;
  message_type: string; content?: string; media_url?: string;
  media_mime_type?: string; status?: string; timestamp: string;
  reply_to_message_id?: string; is_deleted?: boolean; is_edited?: boolean;
  metadata?: any;
};
type UnifiedCommRecord = {
  id: string; source: 'interaction' | 'wa_message';
  channel: string; direction: string; content: string;
  timestamp: string; created_by_name?: string;
  message_type?: string; media_url?: string; status?: string;
};
type Lead360Data = {
  lead: Record<string, any>;
  interactions: Interaction[];
  contracts: Contract360[];
  audit_logs: AuditLog[];
  related_leads: RelatedLead[];
  wa_contact: WaContact | null;
  wa_contacts?: WaContact[];
  wa_messages: WaMessage[];
};

function mergeCommRecords(interactions: Interaction[], waMessages: WaMessage[]): UnifiedCommRecord[] {
  const fromInteractions: UnifiedCommRecord[] = interactions.map(i => ({
    id: i.id, source: 'interaction' as const, channel: i.type, direction: i.direction,
    content: i.content, timestamp: i.created_at, created_by_name: i.created_by_name,
  }));
  const fromWa: UnifiedCommRecord[] = waMessages.map(m => ({
    id: m.id, source: 'wa_message' as const, channel: 'whatsapp', direction: m.direction,
    content: m.content || '', timestamp: m.timestamp,
    message_type: m.message_type, media_url: m.media_url, status: m.status,
  }));
  return [...fromInteractions, ...fromWa].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
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
    contact:     { label: t('lsContact'),     color: '#3b82f6', bg: '#eff6ff' },
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

// ── Unified Compose Box ──────────────────────────────────────────────────────
function UnifiedComposeBox({ leadId, lead, waContact, onSaved }: {
  leadId: string; lead: Record<string, any>; waContact: WaContact | null; onSaved: () => void;
}) {
  const t = useTranslations('customer360');
  const CH = getCH(t);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('note');
  const [dir, setDir] = useState<'outbound' | 'inbound'>('outbound');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Email-specific fields
  const [emailSubject, setEmailSubject] = useState('');
  const [emailTo, setEmailTo] = useState(lead.email || '');

  const isEmailMode = type === 'email' && dir === 'outbound';
  const isWhatsAppMode = type === 'whatsapp' && dir === 'outbound';
  const hasEmail = !!(lead.email);
  const hasWa = !!waContact;

  useEffect(() => { if (open) ref.current?.focus(); }, [open, type]);

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      if (isWhatsAppMode && waContact) {
        // Send real WhatsApp message
        await api.post(`/api/whatsapp/conversations/${waContact.id}/send`, {
          content: text.trim(), message_type: 'text',
        });
      } else if (isEmailMode && hasEmail) {
        // Send real email
        await api.post(`/api/crm/leads/${leadId}/send-email`, {
          to_email: emailTo || lead.email,
          subject: emailSubject || '(No Subject)',
          body: text.trim(),
        });
      } else {
        // Log as interaction
        await api.post(`/api/crm/leads/${leadId}/interactions`, {
          type, direction: dir, content: text,
        });
      }
      setText(''); setEmailSubject(''); setOpen(false); onSaved();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  function getSendLabel() {
    if (saving) return t('composeSaving');
    if (isWhatsAppMode) return waContact ? t('sendWhatsApp') : t('noWaLinked');
    if (isEmailMode) return hasEmail ? t('sendEmail') : t('noEmail');
    return t('composeSave');
  }
  const canSend = text.trim() && !saving &&
    !(isWhatsAppMode && !waContact) &&
    !(isEmailMode && !hasEmail);

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
            {Object.entries(CH).map(([chKey, cfg]) => {
              const disabled = (chKey === 'whatsapp' && !waContact) || (chKey === 'email' && !hasEmail);
              return (
                <button key={chKey} onClick={() => !disabled && setType(chKey)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  title={chKey === 'whatsapp' && !waContact ? t('noWaLinked') : chKey === 'email' && !hasEmail ? t('noEmail') : ''}
                  style={{
                    background: type === chKey ? cfg.color : cfg.bg,
                    color: type === chKey ? 'white' : cfg.color,
                    transform: type === chKey ? 'scale(1.05)' : 'none',
                    opacity: disabled ? 0.4 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}>
                  <HandIcon name={cfg.icon} size={14} /> {cfg.label}
                </button>
              );
            })}
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

          {/* Email-specific fields */}
          {isEmailMode && (
            <div className="px-4 py-2 space-y-2" style={{ borderBottom: '1px solid var(--notion-border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium w-12 flex-shrink-0" style={{ color: '#9B9A97' }}>To:</span>
                <input value={emailTo} onChange={e => setEmailTo(e.target.value)}
                  className="flex-1 text-xs outline-none px-2 py-1 rounded" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium w-12 flex-shrink-0" style={{ color: '#9B9A97' }}>{t('emailSubject')}:</span>
                <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                  className="flex-1 text-xs outline-none px-2 py-1 rounded" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  placeholder={t('emailSubject')} />
              </div>
            </div>
          )}

          <textarea ref={ref} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            rows={4} className="w-full px-4 py-3.5 text-sm outline-none resize-none"
            style={{ color: 'var(--notion-text)' }}
            placeholder={isEmailMode ? t('emailBody') : isWhatsAppMode ? t('sendWhatsApp') + '...' : t('composePlaceholder', { label: CH[type]?.label || '' })} />
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderTop: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
            <span className="text-[10px]" style={{ color: '#9B9A97' }}>
              {text.length > 0 ? t('composeCharCount', { n: text.length }) : t('composeSubmitHint')}
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setOpen(false); setText(''); setEmailSubject(''); }}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ color: '#9B9A97', border: '1px solid var(--notion-border)' }}>{t('composeCancel')}</button>
              <button onClick={submit} disabled={!canSend}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ background: (isWhatsAppMode ? '#15803d' : isEmailMode ? '#1d4ed8' : '#7c3aed'), opacity: !canSend ? 0.4 : 1 }}>
                {getSendLabel()}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Unified Comm Card ────────────────────────────────────────────────────────
function UnifiedCommCard({ r, expanded, onToggle }: {
  r: UnifiedCommRecord; expanded: boolean; onToggle: () => void;
}) {
  const t = useTranslations('customer360');
  const CH = getCH(t);
  const cfg = CH[r.channel] ?? CH.note;
  const isWa = r.source === 'wa_message';
  const isLong = r.content.length > 180;
  const preview = isLong && !expanded ? r.content.slice(0, 180) + '...' : r.content;

  const statusIcon = isWa && r.status ? (
    r.status === 'read' ? '\u2713\u2713' : r.status === 'delivered' ? '\u2713\u2713' : r.status === 'sent' ? '\u2713' : ''
  ) : null;

  return (
    <div onClick={onToggle} className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: 'var(--notion-card, white)',
        borderLeft: `4px solid ${cfg.border}`,
        boxShadow: expanded
          ? '0 4px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)'
          : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s',
      }}>
      <div className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
            {isWa && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: '#f0fdf4', color: '#15803d' }}>
                {r.message_type !== 'text' ? r.message_type : ''}
              </span>
            )}
            {!isWa && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--notion-hover)', color: '#9B9A97' }}>
                {t('sourceLog')}
              </span>
            )}
            <span className="text-[10px]" style={{ color: '#9B9A97' }}>
              {r.direction === 'inbound' ? `\u2199 ${t('dirInbound')}` : `\u2197 ${t('dirOutbound')}`} · {relTime(r.timestamp, t)}
            </span>
            {statusIcon && (
              <span className="text-[10px] ml-1" style={{ color: r.status === 'read' ? '#1d4ed8' : '#9B9A97' }}>
                {statusIcon}
              </span>
            )}
          </div>
          {r.media_url && r.message_type && ['image', 'video'].includes(r.message_type) && (
            <div className="rounded-lg overflow-hidden" style={{ maxWidth: 200 }}>
              {r.message_type === 'image' ? (
                <img src={r.media_url} alt="" className="w-full h-auto rounded-lg" style={{ maxHeight: 120, objectFit: 'cover' }} />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: cfg.bg }}>
                  <HandIcon name="play" size={14} />
                  <span className="text-xs" style={{ color: cfg.color }}>Video</span>
                </div>
              )}
            </div>
          )}
          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--notion-text)' }}>
            {preview}
          </p>
          <div className="text-[10px] text-[#9B9A97]">
            {r.created_by_name ? `${r.created_by_name} · ` : ''}{absTime(r.timestamp)}
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

// ── Comms Tab ─────────────────────────────────────────────────────────────────
function CommsTab({ leadId, lead, interactions, waContact, waMessages, onRefresh }: {
  leadId: string; lead: Record<string, any>; interactions: Interaction[];
  waContact: WaContact | null; waMessages: WaMessage[]; onRefresh: () => void;
}) {
  const t = useTranslations('customer360');
  const CH = getCH(t);
  const [view, setView] = useState<'timeline' | 'channel' | 'list'>('timeline');
  const [filterCh, setFilterCh] = useState('all');
  const [filterSource, setFilterSource] = useState<'all' | 'actual' | 'log'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allRecords = mergeCommRecords(interactions, waMessages);
  let filtered = filterCh === 'all' ? allRecords : allRecords.filter(r => r.channel === filterCh);
  if (filterSource === 'actual') filtered = filtered.filter(r => r.source === 'wa_message');
  if (filterSource === 'log') filtered = filtered.filter(r => r.source === 'interaction');

  const grouped: [string, UnifiedCommRecord[]][] = [];
  if (view === 'timeline') {
    const map = new Map<string, UnifiedCommRecord[]>();
    for (const r of filtered) {
      const k = dateGroupKey(r.timestamp, t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    grouped.push(...Array.from(map.entries()));
  }

  const byChannel: [string, UnifiedCommRecord[]][] = [];
  if (view === 'channel') {
    const map = new Map<string, UnifiedCommRecord[]>();
    for (const r of filtered) {
      if (!map.has(r.channel)) map.set(r.channel, []);
      map.get(r.channel)!.push(r);
    }
    byChannel.push(...Array.from(map.entries()));
  }

  return (
    <div className="space-y-4">
      <UnifiedComposeBox leadId={leadId} lead={lead} waContact={waContact} onSaved={onRefresh} />

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

        {/* Source filter */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
          {([['all', t('sourceAll')], ['actual', t('sourceActual')], ['log', t('sourceLog')]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setFilterSource(v)}
              className="px-2.5 py-1.5 text-[11px] font-medium"
              style={{
                background: filterSource === v ? '#374151' : 'white',
                color: filterSource === v ? 'white' : '#9B9A97',
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
            {t('filterAll', { n: allRecords.length })}
          </button>
          {Object.entries(CH).filter(([k]) => allRecords.some(r => r.channel === k)).map(([k, cfg]) => {
            const cnt = allRecords.filter(r => r.channel === k).length;
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
            {items.map(r => (
              <UnifiedCommCard key={r.id} r={r} expanded={expandedId === r.id}
                onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
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
              {items.map(r => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: r.direction === 'inbound' ? '#f0fdf4' : '#eff6ff',
                        color: r.direction === 'inbound' ? '#15803d' : '#1d4ed8',
                      }}>
                      {r.direction === 'inbound' ? `\u2199 ${t('dirInbound')}` : `\u2197 ${t('dirOutbound')}`}
                    </span>
                    {r.source === 'wa_message' && r.status && (
                      <span className="text-[9px]" style={{ color: r.status === 'read' ? '#1d4ed8' : '#9B9A97' }}>
                        {r.status === 'read' ? '\u2713\u2713' : r.status === 'delivered' ? '\u2713\u2713' : '\u2713'}
                      </span>
                    )}
                    <span className="text-[10px] ml-auto" style={{ color: '#9B9A97' }}>{relTime(r.timestamp, t)}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--notion-text)' }}>
                    {r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content}
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
              {filtered.map((r, idx) => {
                const cfg = CH[r.channel] ?? CH.note;
                return (
                  <tr key={r.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid var(--notion-border)' : 'none' }}
                    className="hover:bg-[var(--notion-hover)] transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span><HandIcon name={cfg.icon} size={14} /></span>
                        <span style={{ color: cfg.color }}>{cfg.label}</span>
                        {r.source === 'interaction' && (
                          <span className="text-[9px] px-1 rounded" style={{ background: 'var(--notion-hover)', color: '#9B9A97' }}>{t('sourceLog')}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: r.direction === 'inbound' ? '#f0fdf4' : '#eff6ff',
                          color: r.direction === 'inbound' ? '#15803d' : '#1d4ed8',
                        }}>
                        {r.direction === 'inbound' ? t('dirInbound') : t('dirOutbound')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: 'var(--notion-text)' }}>
                      {r.content.slice(0, 80)}{r.content.length > 80 ? '...' : ''}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: '#9B9A97' }}>{r.created_by_name || '\u2014'}</td>
                    <td className="px-4 py-2.5" style={{ color: '#9B9A97' }} title={absTime(r.timestamp)}>
                      {relTime(r.timestamp, t)}
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

// ── Profile Tab (5 categories with completeness %) ──────────────────────────
type ProfileCategory = {
  id: string;
  title: string;
  fields: { label: string; key: string; opts?: { type?: string; options?: string[] } }[];
};

function getProfileCategories(t: any): ProfileCategory[] {
  return [
    {
      id: 'contact',
      title: '联系方式',
      fields: [
        { label: t('fieldEmail'), key: 'email', opts: { type: 'email' } },
        { label: t('fieldPhone'), key: 'phone', opts: { type: 'tel' } },
        { label: t('fieldWhatsApp'), key: 'whatsapp' },
        { label: 'Instagram', key: 'cf_instagram' },
        { label: '社交平台', key: 'cf_social_platform' },
        { label: '联系地址', key: 'cf_contact_address' },
      ],
    },
    {
      id: 'personal',
      title: '个人信息',
      fields: [
        { label: t('fieldName'), key: 'full_name' },
        { label: 'First Name', key: 'cf_first_name' },
        { label: 'Last Name', key: 'cf_last_name' },
        { label: '性别', key: 'cf_gender', opts: { options: ['male', 'female', 'other'] } },
        { label: t('fieldTitle'), key: 'title' },
        { label: t('fieldSource'), key: 'source' },
        { label: '来源渠道', key: 'cf_source_channel' },
        { label: '信仰', key: 'cf_religion' },
        { label: '国家/地区', key: 'cf_country' },
        { label: '城市', key: 'cf_city' },
        { label: '省/州', key: 'cf_region_province' },
      ],
    },
    {
      id: 'company',
      title: '公司信息',
      fields: [
        { label: t('fieldCompanyName'), key: 'company' },
        { label: '公司网站', key: 'cf_company_website' },
        { label: '行业', key: 'cf_industry' },
        { label: '主营产品', key: 'cf_main_products' },
        { label: '公司简介', key: 'cf_about_company' },
        { label: '公司规模', key: 'cf_company_size' },
        { label: '职位', key: 'cf_position' },
        { label: 'CEO 姓名', key: 'cf_ceo_name' },
        { label: 'CEO 爱好', key: 'cf_ceo_hobbies' },
        { label: 'CEO 信仰', key: 'cf_ceo_beliefs' },
        { label: 'CEO 性格', key: 'cf_ceo_personality' },
        { label: 'CEO 政治理念', key: 'cf_ceo_political_views' },
        { label: '月度用量', key: 'cf_monthly_usage' },
        { label: '季度用量', key: 'cf_quarterly_usage' },
        { label: '行业产品品质', key: 'cf_industry_product_quality', opts: { options: ['优质', '中上', '中等', '一般', '低端'] } },
      ],
    },
    {
      id: 'business',
      title: '业务信息',
      fields: [
        { label: '状态', key: 'status' },
        { label: '跟进状态', key: 'follow_up_status', opts: { options: ['pending', 'done'] } },
        { label: '客户类型', key: 'cf_customer_type' },
        { label: '客户等级', key: 'cf_customer_grade', opts: { options: ['S', 'A', 'B', 'C', 'D'] } },
        { label: 'GRADE', key: 'cf_grade' },
        { label: '产品品类', key: 'cf_product_category' },
        { label: '需求产品', key: 'cf_required_products' },
        { label: '终端用途', key: 'cf_end_usage' },
        { label: '标签', key: 'cf_tags' },
      ],
    },
    {
      id: 'commercial',
      title: '商务信息',
      fields: [
        { label: '年采购额', key: 'cf_annual_purchase' },
        { label: '下游付款', key: 'cf_downstream_payment' },
        { label: '竞对', key: 'cf_competitor' },
        { label: '预算', key: 'cf_budget' },
        { label: '采购周期', key: 'cf_purchase_cycle' },
        { label: '决策人', key: 'cf_decision_maker' },
        { label: '攻略笔记', key: 'cf_attack_notes' },
        { label: '需求备注', key: 'cf_requirements_notes' },
        { label: '联系备注', key: 'cf_contact_notes' },
      ],
    },
  ];
}

function computeCompleteness(lead: Record<string, any>, fields: { key: string }[]): number {
  let filled = 0;
  for (const f of fields) {
    const val = f.key.startsWith('cf_')
      ? lead.custom_fields?.[f.key.slice(3)]
      : lead[f.key];
    if (val && String(val).trim()) filled++;
  }
  return fields.length > 0 ? Math.round((filled / fields.length) * 100) : 0;
}

function CompletenessBar({ pct }: { pct: number }) {
  const color = pct < 30 ? '#ef4444' : pct < 70 ? '#3b82f6' : '#10b981';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-bold" style={{ color }}>{pct}%</span>
    </div>
  );
}

function ProfileTab({ leadId, lead, onRefresh }: {
  leadId: string; lead: Record<string, any>; onRefresh: () => void;
}) {
  const t = useTranslations('customer360');
  const LEAD_STATUSES = getLeadStatuses(t);
  const SOURCES = getSources(t);
  const categories = getProfileCategories(t);
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
    const currentData = editing ? draft : lead;
    const val = key.startsWith('cf_')
      ? currentData.custom_fields?.[key.slice(3)] ?? ''
      : currentData[key] ?? '';

    const isEditing = editing !== null;

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
        <span className="text-[11px] w-24 flex-shrink-0 pt-1" style={{ color: '#9B9A97' }}>{label}</span>
        {isEditing ? (
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

  return (
    <div className="space-y-4">
      {categories.map(cat => {
        const pct = computeCompleteness(lead, cat.fields);
        return (
          <div key={cat.id} className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{cat.title}</span>
                <CompletenessBar pct={pct} />
              </div>
              {editing === cat.id ? (
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
                <button onClick={() => startEdit(cat.id)}
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{ color: '#7c3aed', background: '#ede9fe' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#ddd6fe')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#ede9fe')}>
                  {t('editBtn')}
                </button>
              )}
            </div>
            <div className="px-5 pb-3 pt-1">
              {cat.fields.map(f => field(f.label, f.key, f.opts))}

              {/* AI Research in company section */}
              {cat.id === 'company' && (
                <>
                  {lead.company && !editing && (
                    <div className="py-2">
                      <button onClick={runResearch} disabled={researching}
                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: researching ? 'var(--notion-hover)' : '#ede9fe', color: '#7c3aed' }}>
                        {researching ? (
                          <><span className="animate-spin">&#x27F3;</span> {t('aiResearching')}</>
                        ) : (
                          <><span>&#x2726;</span> {t('aiResearch')}</>
                        )}
                      </button>
                    </div>
                  )}
                  {(research || lead.ai_summary) && (
                    <div className="mt-3 rounded-xl p-4"
                      style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #c4b5fd' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">&#x2726;</span>
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
                </>
              )}
            </div>
          </div>
        );
      })}
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
function TimelineTab({ interactions, contracts, auditLogs, lead, waMessages }: {
  interactions: Interaction[];
  contracts: Contract360[];
  auditLogs: AuditLog[];
  lead: Record<string, any>;
  waMessages?: WaMessage[];
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
    ...(waMessages ?? []).map(m => ({ id: `wa-${m.id}`, ts: m.timestamp, kind: 'wa_message', data: m })),
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
              if (item.kind === 'wa_message') {
                const m: WaMessage = item.data;
                const waCfg = CH.whatsapp;
                return (
                  <div key={item.id} className="rounded-xl px-4 py-3"
                    style={{ background: 'var(--notion-card, white)', borderLeft: `4px solid ${waCfg.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold" style={{ color: waCfg.color }}>{waCfg.label}</span>
                      {m.message_type !== 'text' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#15803d' }}>{m.message_type}</span>
                      )}
                      <span className="text-[10px] text-[#9B9A97] ml-auto">
                        {m.direction === 'inbound' ? `\u2199 ${t('dirInbound')}` : `\u2197 ${t('dirOutbound')}`} · {relTime(m.timestamp, t)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed mb-1" style={{ color: 'var(--notion-text)' }}>
                      {(m.content || '').slice(0, 100)}{(m.content || '').length > 100 ? '...' : ''}
                    </p>
                    <p className="text-[10px] text-[#9B9A97]">{absTime(m.timestamp)}</p>
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
  const pipelineConfig = usePipelineConfig();
  const CH = getCH(t);
  const LEAD_STATUS = getLeadStatus(t);
  // Derive workflow stages from pipeline config (single source of truth)
  const workflowStages = useMemo<WorkflowStage[]>(() => {
    if (pipelineConfig.workflow_stages.length > 0) {
      return normalizeWorkflowStages(pipelineConfig.workflow_stages, t);
    }
    return [];
  }, [pipelineConfig.workflow_stages, t]);
  const FLOW_STEPS = workflowStages.length ? workflowStages : getFlowSteps(t);
  const { tenant, id } = useParams<{ tenant: string; id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Lead360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const tabParam = searchParams.get('tab') as 'comms' | 'profile' | 'business' | 'timeline' | 'workflow' | null;
  const [tab, setTab] = useState<'comms' | 'profile' | 'business' | 'timeline' | 'workflow'>(tabParam || 'workflow');
  const [showColdModal, setShowColdModal] = useState(false);
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [changingStage, setChangingStage] = useState(false);
  const [waSlideOpen, setWaSlideOpen] = useState(false);
  const [waSlideContact, setWaSlideContact] = useState<WaContact | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.get(`/api/crm/customer-360/${id}`)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/api/admin/users-lite').then((res: any) => {
      const list = Array.isArray(res) ? res : res.users ?? [];
      setTenantUsers(list.map((u: any) => ({ id: u.id, email: u.email || '', full_name: u.full_name || u.email || '', role: u.role || '', position_name: u.position_name })));
    }).catch(() => {});
  }, []);

  const [startingWa, setStartingWa] = useState(false);
  async function handleStartWhatsApp() {
    if (!data) return;
    const lead = data.lead;
    const waPhone = lead.whatsapp || lead.phone;
    if (!waPhone) return;
    setStartingWa(true);
    try {
      // Get first connected WhatsApp account
      const raw = await api.get('/api/whatsapp/accounts');
      const accounts: any[] = Array.isArray(raw) ? raw : [];
      const connected = accounts.find((a: any) => a.status === 'connected');
      if (!connected) { toast.error('没有已连接的WhatsApp账号'); return; }
      // Add contact
      const addRes: any = await api.post('/api/whatsapp/contacts/add', {
        phone_number: waPhone, account_id: connected.id,
        display_name: lead.full_name || undefined,
      });
      const newContactId = addRes.id || addRes.contact_id;
      // Link to lead
      await api.post(`/api/whatsapp/contacts/${newContactId}/link-lead`, { lead_id: id });
      // Refresh data and open slide
      await load();
      // Open the WhatsApp chat slide
      setWaSlideContact({ id: newContactId, wa_account_id: connected.id, wa_jid: '', phone_number: waPhone, display_name: lead.full_name });
      setWaSlideOpen(true);
    } catch (e: any) { toast.error(e.message || '发起WhatsApp对话失败'); }
    finally { setStartingWa(false); }
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

  const allCommsCount = interactions.length + (data.wa_messages?.length || 0);
  const TABS = [
    { key: 'workflow', label: t('tabWorkflow'), badge: 0, icon: 'gear' },
    { key: 'comms',    label: t('tabComms'),    badge: allCommsCount },
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
            {t('backToCustomers')}
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

            {/* View customer details — switch to profile tab */}
            <button
              onClick={() => setTab('profile')}
              className="mt-2 text-[10px] font-medium px-3 py-1 rounded-md transition-colors"
              style={{ color: '#7c3aed', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#ede9fe')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              查看客户详情 →
            </button>
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

        {/* AI Lead Score */}
        <div className="px-4 py-2">
          <LeadScoreCard leadId={id} />
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
            {/* WhatsApp contacts linked to this lead */}
            {(data?.wa_contacts || (data?.wa_contact ? [data.wa_contact] : [])).map((wc: WaContact) => (
              <div key={wc.id} className="flex items-center gap-2">
                <span className="text-xs w-4 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.252-.149-2.868.852.852-2.868-.149-.252A7.963 7.963 0 014 12a8 8 0 1116 0 8 8 0 01-8 8z"/>
                  </svg>
                </span>
                <span className="text-[10px] flex-shrink-0 w-14" style={{ color: '#9B9A97' }}>WA Chat</span>
                <span className="text-[11px] flex-1 truncate" style={{ color: 'var(--notion-text)' }}>
                  {wc.display_name || wc.push_name || wc.phone_number || wc.wa_jid}
                </span>
                <button onClick={() => { setWaSlideContact(wc); setWaSlideOpen(true); }}
                  className="text-[10px] px-2 py-0.5 rounded-md font-medium flex-shrink-0"
                  style={{ color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; }}>
                  {t('openChat')}
                </button>
              </div>
            ))}
            {/* Start WhatsApp conversation when lead has WA number but no linked contacts */}
            {!(data?.wa_contacts?.length || data?.wa_contact) && lead.whatsapp && (
              <button onClick={handleStartWhatsApp} disabled={startingWa}
                className="flex items-center gap-2 text-[10px] px-2 py-1 rounded-md font-medium mt-1"
                style={{ color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#25D366">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
                </svg>
                {startingWa ? '连接中...' : '发起 WhatsApp 对话'}
              </button>
            )}
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
            <button onClick={() => setShowNewLeadModal(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all"
              style={{ background: '#7c3aed' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              <HandIcon name="plus" size={14} /> {t('createNewLead')}
            </button>
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
            <CommsTab leadId={id} lead={lead} interactions={interactions}
              waContact={data.wa_contact} waMessages={data.wa_messages ?? []} onRefresh={load} />
          )}
          {tab === 'profile' && (
            <ProfileTab leadId={id} lead={lead} onRefresh={load} />
          )}
          {tab === 'business' && (
            <BusinessTab contracts={contracts} currentLead={lead} relatedLeads={data.related_leads ?? []} tenantSlug={tenant} />
          )}
          {tab === 'timeline' && (
            <TimelineTab interactions={interactions} contracts={contracts} auditLogs={audit_logs} lead={lead} waMessages={data.wa_messages ?? []} />
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

      {showNewLeadModal && (
        <LeadModal
          users={tenantUsers}
          onClose={() => setShowNewLeadModal(false)}
          onSave={() => { setShowNewLeadModal(false); load(); }}
          defaultStatus="new"
          customTitle={t('createNewLead')}
          prefillData={{
            full_name: lead.full_name || '',
            email: lead.email || '',
            phone: lead.phone || '',
            whatsapp: lead.whatsapp || '',
            company: lead.company || '',
            title: lead.title || '',
            country: (lead as any).country || lead.custom_fields?.country || '',
            custom_fields: { customer_origin_id: lead.id },
          }}
        />
      )}

      {/* WhatsApp Chat SlideOver */}
      <SlideOver open={waSlideOpen} onClose={() => { setWaSlideOpen(false); setWaSlideContact(null); }}
        title={`WhatsApp - ${waSlideContact?.display_name || waSlideContact?.push_name || data?.wa_contact?.display_name || data?.wa_contact?.push_name || lead.full_name || ''}`}>
        {waSlideOpen && (waSlideContact || data?.wa_contact) && (
          <div style={{ height: 500 }}>
            <WhatsAppChatPanel
              contactId={(waSlideContact || data!.wa_contact!).id}
              contactName={(waSlideContact || data!.wa_contact!).display_name || (waSlideContact || data!.wa_contact!).push_name || lead.full_name}
              profilePicUrl={(waSlideContact || data!.wa_contact!).profile_pic_url}
              isGroup={(waSlideContact || data!.wa_contact!).is_group}
            />
          </div>
        )}
      </SlideOver>
    </div>
  );
}
