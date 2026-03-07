'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import { usePipelineConfig } from '@/lib/usePipelineConfig';

// ── Types ─────────────────────────────────────────────────────────────────────
export type TenantUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  position_name?: string | null;
};

const EMPTY_LEAD = {
  full_name: '', first_name: '', last_name: '', email: '', phone: '', whatsapp: '',
  company: '', title: '', status: 'inquiry', source: 'Direct', source_channel: '',
  follow_up_status: 'pending', assigned_to: '',
  gender: '', country: '', city: '', region_province: '', instagram: '',
  social_platform: '', religion: '',
  company_website: '', main_products: '', position: '', industry: '',
  customer_type: '', customer_grade: '',
  grade: '', product_category: '', required_products: '', end_usage: '',
  downstream_payment: '', competitor: '', annual_purchase: '', about_company: '',
  ceo_name: '', ceo_hobbies: '', ceo_beliefs: '', ceo_personality: '', ceo_political_views: '',
  monthly_usage: '', quarterly_usage: '', industry_product_quality: '',
  attack_notes: '', requirements_notes: '', contact_address: '', contact_notes: '',
  tags: '',
};

type LeadFormState = typeof EMPTY_LEAD;

type NameDupMatch = {
  id: string;
  full_name: string;
  company?: string;
  email?: string;
  whatsapp?: string;
  status: string;
  assigned_to?: string;
  assigned_to_name?: string;
  is_mine: boolean;
};

type DupCheck = {
  matches: { id: string; full_name: string; email?: string; status: string }[];
  has_active: boolean;
};

type NameDupResult = {
  matches: NameDupMatch[];
};

// ── Helpers shared with parent pages ──────────────────────────────────────────
export function getLeadStatusOptions(tCrm: any, config?: { statuses: { values: { key: string; label?: string; stage?: string | null }[] }; pipeline: { stages: { key: string; label?: string; labelKey?: string }[] } }) {
  if (config) {
    const stageLabels: Record<string, string> = {};
    for (const s of config.pipeline.stages) {
      stageLabels[s.key] = (s.labelKey ? tCrm(s.labelKey as any) : s.label) ?? s.key;
    }
    return config.statuses.values.map(sv => ({
      value: sv.key,
      label: sv.label ?? sv.key,
      group: sv.stage ? (stageLabels[sv.stage] ?? sv.stage) : tCrm('groupOther'),
    }));
  }
  // Fallback for backward compat
  return [
    { value: 'contact',     label: tCrm('statusContact'),     group: tCrm('groupCustomer') },
    { value: 'inquiry',     label: tCrm('statusInquiry'),     group: tCrm('groupSales') },
    { value: 'replied',     label: tCrm('statusReplied'),     group: tCrm('groupSales') },
    { value: 'qualified',   label: tCrm('statusQualified'),   group: tCrm('groupSales') },
    { value: 'quoted',      label: tCrm('statusQuoted'),      group: tCrm('groupContract') },
    { value: 'negotiating', label: tCrm('statusNegotiating'), group: tCrm('groupContract') },
    { value: 'procuring',   label: tCrm('statusProcuring'),   group: tCrm('groupProcurement') },
    { value: 'booking',     label: tCrm('statusBooking'),     group: tCrm('groupBooking') },
    { value: 'fulfillment', label: tCrm('statusFulfillment'), group: tCrm('groupShipping') },
    { value: 'payment',     label: tCrm('statusPayment'),     group: tCrm('groupCollection') },
    { value: 'converted',   label: tCrm('statusConverted'),   group: tCrm('groupCollection') },
    { value: 'cold',        label: tCrm('statusCold'),        group: tCrm('groupOther') },
    { value: 'lost',        label: tCrm('statusLost'),        group: tCrm('groupOther') },
  ];
}

export function getSourceChannels(tCrm: any) {
  return ['LinkedIn', 'WhatsApp', tCrm('channelExhibition'), tCrm('channelWebsite'), tCrm('channelReferral'), tCrm('channelAd'), tCrm('channelColdCall'), tCrm('channelOther')];
}

export function getCustomerTypes(tCrm: any) {
  return [tCrm('typeTrader'), tCrm('typeEndUser'), tCrm('typeManufacturer'), tCrm('typeDistributor'), tCrm('typeGovernment'), tCrm('typeOther')];
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="py-2 px-0 mb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B9A97' }}>{title}</span>
    </div>
  );
}

function LabeledField({ label, maxLen, children }: { label: string; maxLen?: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: '#5F5E5B' }}>{label}{maxLen ? ` 0/${maxLen}` : ''}</span>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg text-sm outline-none";
const inputStyle = { background: 'var(--notion-hover)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' };
const selectStyle = { ...inputStyle, background: 'var(--notion-card, white)' };

// ── Main Component ────────────────────────────────────────────────────────────
export interface LeadModalProps {
  users: TenantUser[];
  onClose: () => void;
  onSave: () => void;
  /** If true, this is called from leads page — enables "create lead under customer" flow */
  isLeadContext?: boolean;
  /** Override modal title (defaults to tCrm('modalTitle')) */
  customTitle?: string;
  /** Override submit button label (defaults to tCrm('createLeadBtn')) */
  customSubmitLabel?: string;
  /** Override default status (defaults to 'inquiry') */
  defaultStatus?: string;
  /** Pre-fill form fields (e.g. when creating a lead from customer-360) */
  prefillData?: {
    full_name?: string; email?: string; phone?: string;
    whatsapp?: string; company?: string; title?: string;
    country?: string; custom_fields?: Record<string, any>;
  };
}

export default function LeadModal({ users, onClose, onSave, isLeadContext, customTitle, customSubmitLabel, defaultStatus, prefillData }: LeadModalProps) {
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const config = usePipelineConfig();
  const LEAD_STATUS_OPTIONS = getLeadStatusOptions(tCrm, config);
  const SOURCE_CHANNELS = getSourceChannels(tCrm);
  const CUSTOMER_TYPES = getCustomerTypes(tCrm);

  const [form, setForm] = useState<LeadFormState>(() => {
    const me = getCurrentUser();
    const base = { ...EMPTY_LEAD, status: defaultStatus || 'inquiry', assigned_to: me?.sub || '' };
    if (prefillData) {
      if (prefillData.full_name) base.full_name = prefillData.full_name;
      if (prefillData.email) base.email = prefillData.email;
      if (prefillData.phone) base.phone = prefillData.phone;
      if (prefillData.whatsapp) base.whatsapp = prefillData.whatsapp;
      if (prefillData.company) base.company = prefillData.company;
      if (prefillData.title) base.title = prefillData.title;
      if (prefillData.country) base.country = prefillData.country;
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [dupCheck, setDupCheck] = useState<DupCheck | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  const p = (k: Partial<LeadFormState>) => setForm(f => ({ ...f, ...k }));

  // Enhanced duplicate check state
  const [nameDupMatches, setNameDupMatches] = useState<NameDupMatch[]>([]);
  const [showDupDialog, setShowDupDialog] = useState(false);
  const [acquireSubmitting, setAcquireSubmitting] = useState(false);
  const [acquireMessage, setAcquireMessage] = useState('');

  async function checkDuplicate() {
    const { full_name, email, whatsapp } = form;
    if (!full_name.trim() && !email.trim() && !whatsapp.trim()) return;
    setDupChecking(true);
    try {
      // Original duplicate check
      const result = await api.post('/api/crm/leads/check-duplicate', {
        full_name: full_name || null,
        email: email || null,
        whatsapp: whatsapp || null,
      }) as DupCheck;
      if (result.matches?.length > 0) setDupCheck(result);
      else setDupCheck(null);
    } catch { /* ignore */ }
    finally { setDupChecking(false); }
  }

  async function checkNameDuplicate() {
    const name = form.full_name.trim();
    if (!name) return;
    try {
      const result = await api.post('/api/crm/leads/check-name-duplicate', {
        full_name: name,
      }) as NameDupResult;
      if (result.matches?.length > 0) {
        setNameDupMatches(result.matches);
        setShowDupDialog(true);
      } else {
        setNameDupMatches([]);
        setShowDupDialog(false);
      }
    } catch { /* ignore */ }
  }

  async function handleNameBlur() {
    await checkDuplicate();
    await checkNameDuplicate();
  }

  async function handleAcquire(match: NameDupMatch) {
    setAcquireSubmitting(true);
    try {
      await api.post('/api/crm/customers/acquire', {
        customer_lead_id: match.id,
      });
      setAcquireMessage(tCrm('acquireSubmitted'));
      setShowDupDialog(false);
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setAcquireSubmitting(false);
    }
  }

  function handleImportCustomer(match: NameDupMatch) {
    // Auto-fill form with matched customer's info
    setForm(f => ({
      ...f,
      full_name: match.full_name || f.full_name,
      company: match.company || f.company,
      email: match.email || f.email,
      whatsapp: match.whatsapp || f.whatsapp,
    }));
    setShowDupDialog(false);
    setNameDupMatches([]);
  }

  return (
    <div className="fixed inset-0 z-[4000] flex" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', isolation: 'isolate' }}>
      <div className="ml-auto h-full flex flex-col bg-white overflow-hidden" style={{ width: 680, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--notion-border)' }}>
          <span className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>{customTitle || tCrm('modalTitle')}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: '#9B9A97' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={e => e.preventDefault()} className="flex-1 overflow-y-auto px-6 py-4 space-y-1">

          {/* Acquire success message */}
          {acquireMessage && (
            <div className="rounded-xl px-4 py-3 mb-2" style={{ background: '#d1fae5', border: '1px solid #6ee7b7' }}>
              <p className="text-xs font-semibold" style={{ color: '#065f46' }}>{acquireMessage}</p>
            </div>
          )}

          {/* ── Enhanced Duplicate Dialog ── */}
          {showDupDialog && nameDupMatches.length > 0 && (
            <div className="rounded-xl px-4 py-3 mb-2" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
              {nameDupMatches.map(match => {
                const hasOwner = !!match.assigned_to;
                if (match.is_mine && isLeadContext) {
                  // Scenario B: own customer (leads page only) — auto-fill
                  return (
                    <div key={match.id} className="mb-2 last:mb-0">
                      <p className="text-xs font-semibold mb-1" style={{ color: '#7c3aed' }}>
                        {tCrm('ownedByYou')}
                      </p>
                      <p className="text-[11px]" style={{ color: '#374151' }}>
                        {tCrm('customer360Label')}: {match.full_name}
                        {match.company ? ` (${match.company})` : ''}
                      </p>
                      {match.email && <p className="text-[11px]" style={{ color: '#6b7280' }}>{tCrm('emailLabel')}: {match.email}</p>}
                      {match.whatsapp && <p className="text-[11px]" style={{ color: '#6b7280' }}>WhatsApp: {match.whatsapp}</p>}
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={() => handleImportCustomer(match)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                          style={{ background: '#7c3aed' }}>
                          {tCrm('createLeadUnder')}
                        </button>
                        <button type="button" onClick={() => { setShowDupDialog(false); setNameDupMatches([]); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                          {tCrm('createIndependent')}
                        </button>
                      </div>
                    </div>
                  );
                } else if (!match.is_mine && hasOwner) {
                  // Scenario A: someone else's customer — acquire flow
                  return (
                    <div key={match.id} className="mb-2 last:mb-0">
                      <p className="text-xs font-semibold mb-1" style={{ color: '#c2410c' }}>
                        {tCrm('dupFound')}
                      </p>
                      <p className="text-[11px]" style={{ color: '#92400e' }}>
                        {tCrm('customer360Label')}: {match.full_name}
                        {match.company ? ` (${match.company})` : ''}
                      </p>
                      <p className="text-[11px]" style={{ color: '#92400e' }}>
                        {tCrm('dupOwner')}: {match.assigned_to_name || '—'}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={() => handleAcquire(match)}
                          disabled={acquireSubmitting}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                          style={{ background: '#f59e0b' }}>
                          {acquireSubmitting ? '...' : tCrm('acquireCustomer')}
                        </button>
                        <button type="button" onClick={() => { setShowDupDialog(false); setNameDupMatches([]); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                          {tCrm('cancelCreate')}
                        </button>
                      </div>
                    </div>
                  );
                } else if (!match.is_mine && !hasOwner) {
                  // Scenario C: unassigned duplicate — warn, allow continue
                  return (
                    <div key={match.id} className="mb-2 last:mb-0">
                      <p className="text-xs font-semibold mb-1" style={{ color: '#c2410c' }}>
                        {tCrm('dupFound')}
                      </p>
                      <p className="text-[11px]" style={{ color: '#92400e' }}>
                        {match.full_name}
                        {match.company ? ` (${match.company})` : ''}
                        {match.email ? ` · ${match.email}` : ''}
                        {' — '}{match.status}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={() => { setShowDupDialog(false); setNameDupMatches([]); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                          {tCrm('cancelCreate')}
                        </button>
                        <button type="button" onClick={() => { setShowDupDialog(false); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: 'var(--notion-hover)', color: 'var(--notion-text)' }}>
                          {tCrm('createIndependent')}
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {/* Management */}
          <SectionHeader title={tCrm('sectionManagement')} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <LabeledField label={tCrm('assignedTo')}>
              <select className={inputCls} style={selectStyle} value={form.assigned_to} onChange={e => p({ assigned_to: e.target.value })}>
                <option value="">{tCrm('selectSalesperson')}</option>
                {users.map(u => <option key={u.id} value={u.id}>{(u.full_name || u.email) + (u.position_name ? ` (${u.position_name})` : '')}</option>)}
              </select>
            </LabeledField>
            <LabeledField label={tCrm('sourceChannel')}>
              <select className={inputCls} style={selectStyle} value={form.source_channel} onChange={e => p({ source_channel: e.target.value })}>
                <option value="">{tCrm('pleaseSelect')}</option>
                {SOURCE_CHANNELS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </LabeledField>
            <LabeledField label={tCrm('sourceMethod')}>
              <input className={inputCls} style={inputStyle} value={form.source} onChange={e => p({ source: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('tags')}>
              <select className={inputCls} style={selectStyle} value={form.tags} onChange={e => p({ tags: e.target.value })}>
                <option value="">{tCrm('pleaseSelect')}</option>
                {[tCrm('tagKeyCustomer'), tCrm('tagPotential'), tCrm('tagFollowUp'), tCrm('tagLost'), tCrm('tagColdLead')].map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </LabeledField>
          </div>

          {/* Lead Status */}
          <SectionHeader title={tCrm('sectionLeadStatus')} />
          <div className="flex flex-wrap gap-2 mb-3">
            {LEAD_STATUS_OPTIONS.map(opt => (
              <button type="button" key={opt.value}
                onClick={() => p({ status: opt.value })}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: form.status === opt.value ? '#7c3aed' : 'var(--notion-active)',
                  color: form.status === opt.value ? 'white' : '#5F5E5B',
                  border: form.status === opt.value ? 'none' : '1px solid var(--notion-border)',
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* ── Old duplicate warning (from original check-duplicate endpoint) ── */}
          {dupCheck && dupCheck.matches.length > 0 && (
            <div className="rounded-xl px-4 py-3 mb-2"
              style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
              <div className="flex items-start gap-2">
                <HandIcon name="warning" size={16} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold mb-1" style={{ color: '#c2410c' }}>{tCrm('duplicateWarning')}</p>
                  {dupCheck.matches.map(m => (
                    <p key={m.id} className="text-[11px]" style={{ color: '#92400e' }}>
                      · {m.full_name}
                      {m.email ? ` (${m.email})` : ''}
                      {' — '}
                      <span className="font-medium">{m.status}</span>
                      {m.status === 'converted' && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#d1fae5', color: '#065f46' }}>{tCrm('existingCustomer')}</span>}
                    </p>
                  ))}
                  {dupCheck.has_active && (
                    <p className="text-[11px] font-semibold mt-1" style={{ color: '#c2410c' }}>
                      <HandIcon name="lightning" size={12} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> {tCrm('activeLeadWarning')}
                    </p>
                  )}
                  <button onClick={() => setDupCheck(null)} className="text-[10px] mt-1.5 underline" style={{ color: '#9a3412' }}>
                    {tCrm('ignoreAndContinue')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Contact Information */}
          <SectionHeader title={tCrm('sectionContact')} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <LabeledField label={tCrm('nameRequired')} maxLen={100}>
              <input required className={inputCls} style={inputStyle} value={form.full_name} maxLength={100}
                placeholder={tCrm('pleaseEnterName')} onChange={e => p({ full_name: e.target.value })}
                onBlur={handleNameBlur} />
            </LabeledField>
            <LabeledField label={tCrm('gender')}>
              <select className={inputCls} style={selectStyle} value={form.gender} onChange={e => p({ gender: e.target.value })}>
                <option value="">{tCrm('pleaseSelect')}</option>
                <option value="male">{tCrm('male')}</option>
                <option value="female">{tCrm('female')}</option>
                <option value="other">{tCrm('otherGender')}</option>
              </select>
            </LabeledField>
            <LabeledField label="First Name" maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.first_name} maxLength={300}
                onChange={e => p({ first_name: e.target.value })} />
            </LabeledField>
            <LabeledField label="Last Name" maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.last_name} maxLength={300}
                onChange={e => p({ last_name: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('emailLabel')}>
              <input type="email" className={inputCls} style={inputStyle} value={form.email}
                onChange={e => p({ email: e.target.value })} onBlur={checkDuplicate} />
            </LabeledField>
            <LabeledField label={tCrm('phoneLabel')}>
              <input type="tel" className={inputCls} style={inputStyle} value={form.phone}
                onChange={e => p({ phone: e.target.value })} />
            </LabeledField>
            <LabeledField label="WhatsApp">
              <input type="tel" className={inputCls} style={inputStyle} value={form.whatsapp}
                onChange={e => p({ whatsapp: e.target.value })} onBlur={checkDuplicate} />
            </LabeledField>
            <LabeledField label="Instagram" maxLen={50}>
              <input className={inputCls} style={inputStyle} value={form.instagram} maxLength={50}
                onChange={e => p({ instagram: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('socialPlatform')}>
              <select className={inputCls} style={selectStyle} value={form.social_platform} onChange={e => p({ social_platform: e.target.value })}>
                <option value="">{tCrm('pleaseSelect')}</option>
                {['WhatsApp', 'LinkedIn', 'Instagram', 'Facebook', 'WeChat', 'Telegram', 'Twitter/X'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </LabeledField>
            <LabeledField label={tCrm('religion')}>
              <input className={inputCls} style={inputStyle} value={form.religion}
                onChange={e => p({ religion: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('countryRegion')}>
              <input className={inputCls} style={inputStyle} value={form.country}
                onChange={e => p({ country: e.target.value })} />
            </LabeledField>
            <LabeledField label="City" maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.city} maxLength={300}
                onChange={e => p({ city: e.target.value })} />
            </LabeledField>
            <LabeledField label="Region/Province" maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.region_province} maxLength={300}
                onChange={e => p({ region_province: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('contactAddress')} maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.contact_address} maxLength={300}
                onChange={e => p({ contact_address: e.target.value })} />
            </LabeledField>
          </div>

          {/* Company Info */}
          <SectionHeader title={tCrm('sectionCompany')} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <LabeledField label={tCrm('companyName')} maxLen={200}>
              <input className={inputCls} style={inputStyle} value={form.company} maxLength={200}
                onChange={e => p({ company: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('companyWebsite')} maxLen={500}>
              <input className={inputCls} style={inputStyle} value={form.company_website} maxLength={500}
                onChange={e => p({ company_website: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('mainProducts')} maxLen={50}>
              <input className={inputCls} style={inputStyle} value={form.main_products} maxLength={50}
                onChange={e => p({ main_products: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('jobTitle')} maxLen={100}>
              <input className={inputCls} style={inputStyle} value={form.title} maxLength={100}
                onChange={e => p({ title: e.target.value })} />
            </LabeledField>
            <LabeledField label="Position">
              <input className={inputCls} style={inputStyle} value={form.position}
                onChange={e => p({ position: e.target.value })} />
            </LabeledField>
            <LabeledField label="Industry">
              <input className={inputCls} style={inputStyle} value={form.industry}
                onChange={e => p({ industry: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('aboutCompany')} maxLen={300}>
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 60, resize: 'none' }}
                value={form.about_company} maxLength={300}
                placeholder={tCrm('aboutCompanyPlaceholder')}
                onChange={e => p({ about_company: e.target.value })} />
            </LabeledField>
          </div>

          {/* CEO Info */}
          <SectionHeader title="决策层画像 (CEO)" />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <LabeledField label="CEO 姓名">
              <input className={inputCls} style={inputStyle} value={form.ceo_name}
                onChange={e => p({ ceo_name: e.target.value })} />
            </LabeledField>
            <LabeledField label="爱好">
              <input className={inputCls} style={inputStyle} value={form.ceo_hobbies}
                placeholder="如：高尔夫、旅行、钓鱼"
                onChange={e => p({ ceo_hobbies: e.target.value })} />
            </LabeledField>
            <LabeledField label="信仰">
              <input className={inputCls} style={inputStyle} value={form.ceo_beliefs}
                onChange={e => p({ ceo_beliefs: e.target.value })} />
            </LabeledField>
            <LabeledField label="性格">
              <input className={inputCls} style={inputStyle} value={form.ceo_personality}
                placeholder="如：果断型、温和型、分析型"
                onChange={e => p({ ceo_personality: e.target.value })} />
            </LabeledField>
            <LabeledField label="政治理念">
              <input className={inputCls} style={inputStyle} value={form.ceo_political_views}
                onChange={e => p({ ceo_political_views: e.target.value })} />
            </LabeledField>
          </div>

          {/* Usage & Quality */}
          <SectionHeader title="用量与品质" />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <LabeledField label="月度用量">
              <input className={inputCls} style={inputStyle} value={form.monthly_usage}
                placeholder="如：300吨/月"
                onChange={e => p({ monthly_usage: e.target.value })} />
            </LabeledField>
            <LabeledField label="季度用量">
              <input className={inputCls} style={inputStyle} value={form.quarterly_usage}
                placeholder="如：900吨/季度"
                onChange={e => p({ quarterly_usage: e.target.value })} />
            </LabeledField>
            <LabeledField label="行业产品品质">
              <select className={inputCls} style={selectStyle} value={form.industry_product_quality} onChange={e => p({ industry_product_quality: e.target.value })}>
                <option value="">请选择</option>
                <option value="优质">优质</option>
                <option value="中上">中上</option>
                <option value="中等">中等</option>
                <option value="一般">一般</option>
                <option value="低端">低端</option>
              </select>
            </LabeledField>
          </div>

          {/* Business Info */}
          <SectionHeader title={tCrm('sectionBusiness')} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <LabeledField label={tCrm('customerType')}>
              <select className={inputCls} style={selectStyle} value={form.customer_type} onChange={e => p({ customer_type: e.target.value })}>
                <option value="">{tCrm('pleaseSelect')}</option>
                {CUSTOMER_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            </LabeledField>
            <LabeledField label={tCrm('customerGrade')}>
              <select className={inputCls} style={selectStyle} value={form.customer_grade} onChange={e => p({ customer_grade: e.target.value })}>
                <option value="">{tCrm('pleaseSelect')}</option>
                {['S', 'A', 'B', 'C', 'D'].map(g => <option key={g} value={g}>{g} {tCrm('gradeLevel')}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="GRADE" maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.grade} maxLength={300}
                onChange={e => p({ grade: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('productCategory')}>
              <select className={inputCls} style={selectStyle} value={form.product_category} onChange={e => p({ product_category: e.target.value })}>
                <option value="">{tCrm('pleaseSelect')}</option>
                {[tCrm('productCatHotRolled'), tCrm('productCatColdRolled'), tCrm('productCatGalvanized'), tCrm('productCatColorCoated'), tCrm('productCatStainless'), tCrm('productCatProfile'), tCrm('productCatPipe'), tCrm('productCatWire'), tCrm('productCatOther')].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </LabeledField>
            <LabeledField label={tCrm('requiredProducts')} maxLen={200}>
              <input className={inputCls} style={inputStyle} value={form.required_products} maxLength={200}
                onChange={e => p({ required_products: e.target.value })} />
            </LabeledField>
            <LabeledField label="End Usage" maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.end_usage} maxLength={300}
                placeholder={tCrm('endUsagePlaceholder')}
                onChange={e => p({ end_usage: e.target.value })} />
            </LabeledField>
          </div>

          {/* Commercial Details */}
          <SectionHeader title={tCrm('sectionCommercial')} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <LabeledField label={tCrm('downstreamPayment')} maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.downstream_payment} maxLength={300}
                placeholder={tCrm('downstreamPaymentPlaceholder')}
                onChange={e => p({ downstream_payment: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('annualPurchase')} maxLen={300}>
              <input className={inputCls} style={inputStyle} value={form.annual_purchase} maxLength={300}
                onChange={e => p({ annual_purchase: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('competitor')} maxLen={300}>
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 60, resize: 'none' }}
                value={form.competitor} maxLength={300}
                placeholder={tCrm('competitorPlaceholder')}
                onChange={e => p({ competitor: e.target.value })} />
            </LabeledField>
          </div>

          {/* Notes */}
          <SectionHeader title={tCrm('sectionNotes')} />
          <div className="grid grid-cols-1 gap-3">
            <LabeledField label={tCrm('requirementsNotes')} maxLen={4000}>
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 80, resize: 'none' }}
                value={form.requirements_notes} maxLength={4000}
                onChange={e => p({ requirements_notes: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('attackNotes')} maxLen={300}>
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 60, resize: 'none' }}
                value={form.attack_notes} maxLength={300}
                onChange={e => p({ attack_notes: e.target.value })} />
            </LabeledField>
            <LabeledField label={tCrm('contactNotes')} maxLen={500}>
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 60, resize: 'none' }}
                value={form.contact_notes} maxLength={500}
                onChange={e => p({ contact_notes: e.target.value })} />
            </LabeledField>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
            {tCrm('cancelBtn')}
          </button>
          <button type="button" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: '#7c3aed' }}
            onClick={async () => {
              if (!form.full_name.trim()) { alert(tCrm('pleaseEnterName')); return; }
              setSaving(true);
              try {
                const { full_name, email, phone, whatsapp, company, title, status, source,
                        follow_up_status, assigned_to, ...rest } = form;
                const custom_fields: Record<string, any> = {};
                for (const [k, v] of Object.entries(rest)) { if (v) custom_fields[k] = v; }
                if (prefillData?.custom_fields) {
                  Object.assign(custom_fields, prefillData.custom_fields);
                }
                await api.post('/api/crm/leads', {
                  full_name, email: email || null, phone: phone || null,
                  whatsapp: whatsapp || null, company: company || null,
                  title: title || null, status, source, follow_up_status,
                  assigned_to: assigned_to || null,
                  custom_fields: Object.keys(custom_fields).length ? custom_fields : null,
                });
                onSave();
              } catch (e: any) { alert(e.message); } finally { setSaving(false); }
            }}>
            {saving ? tCrm('savingText') : (customSubmitLabel || tCrm('createLeadBtn'))}
          </button>
        </div>
      </div>
    </div>
  );
}
