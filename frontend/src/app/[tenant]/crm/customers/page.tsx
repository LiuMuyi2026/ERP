'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Dispatch, SetStateAction } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, getApiUrl, getAuthHeaders } from '@/lib/api';
import { getCurrentUser, getTenantId } from '@/lib/auth';
import { HandIcon } from '@/components/ui/HandIcon';

// ── Shared Types ───────────────────────────────────────────────────────────────
interface Customer {
  id: string;
  full_name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  source: string | null;
  status: string;
  ai_summary: string | null;
  custom_fields: Record<string, any> | null;
  assigned_to: string | null;
  assigned_name: string | null;
  contract_count: number;
  total_contract_value: number;
  customer_score: number;
  score_label: string;
  updated_at: string;
}

interface Portrait {
  personality_tags?: string[];
  buying_intention?: string;
  communication_style?: string;
  key_concerns?: string[];
  recommended_strategy?: string;
  risk_factors?: string[];
  opportunity_score?: number;
  next_actions?: string[];
  customer_type?: string;
  industry_insight?: string;
  cultural_awareness?: string;
  country_business_customs?: string;
  customer_needs_summary?: string;
}

interface NewsItem {
  title: string;
  url: string;
  snippet?: string;
}

interface FoundPerson {
  id?: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  email?: string;
  phone?: string;
  wechat?: string;
  linkedin_url?: string;
  summary?: string;
  source_url?: string;
  source_title?: string;
  match_reason?: string;
  confidence?: number;
  news?: NewsItem[];
}

interface CompanyReport {
  company_name?: string;
  industry?: string;
  overview?: string;
  founded?: string;
  headquarters?: string;
  size?: string;
  website?: string;
  key_personnel?: { name: string; title: string; email?: string; phone?: string; linkedin?: string }[];
  products_services?: string[];
  recent_news?: { title: string; date?: string; summary?: string; url?: string }[];
  contact_info?: { email?: string; phone?: string; address?: string };
  market_position?: string;
  target_customers?: string;
  strengths?: string[];
  business_opportunities?: string[];
  risk_score?: number;
  risk_notes?: string[];
  sources?: string[];
}

interface CompanySummaryItem {
  id: string;
  company_name: string;
  industry?: string;
  location?: string;
  snippet?: string;
  website?: string;
  source_url: string;
  source_title?: string;
  confidence: number;
  founded?: string;
  size?: string;
}

interface RelatedLead {
  id: string;
  full_name: string;
  company?: string;
  email?: string;
  status: string;
  source?: string;
  is_cold?: boolean;
  cold_lead_reason?: string;
  created_at: string;
  updated_at?: string;
  assigned_to_name?: string;
}

// ── Score components ───────────────────────────────────────────────────────────
function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#3b82f6' : '#ef4444';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 13, fontWeight: 700, fill: color, transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}>
        {score}
      </text>
    </svg>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#3b82f6' : '#ef4444';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--notion-text-muted)' }}>客户了解度</span>
        <span style={{ fontWeight: 600, color }}>{label}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: '#e5e7eb', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginTop: 3 }}>
        资料完整度 {score}%
      </div>
    </div>
  );
}

// ── PortraitPanel ──────────────────────────────────────────────────────────────
function PortraitPanel({ portrait }: { portrait: Portrait }) {
  const ic = portrait.buying_intention === '高' ? '#10b981' : portrait.buying_intention === '中' ? '#f59e0b' : '#6b7280';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {portrait.customer_type && (
          <div style={{ flex: 1, padding: '12px 16px', borderRadius: 10, textAlign: 'center', background: 'linear-gradient(135deg, #ede9fe, #e0e7ff)', border: '1px solid #c4b5fd' }}>
            <div style={{ fontSize: 11, color: '#7c3aed', marginBottom: 4 }}>客户类型</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#4c1d95' }}>{portrait.customer_type}</div>
          </div>
        )}
        {portrait.opportunity_score !== undefined && (
          <div style={{ flex: 1, padding: '12px 16px', borderRadius: 10, textAlign: 'center', background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', border: '1px solid #6ee7b7' }}>
            <div style={{ fontSize: 11, color: '#065f46', marginBottom: 4 }}>商机评分</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#065f46' }}>{portrait.opportunity_score}</div>
            <div style={{ fontSize: 10, color: '#065f46' }}>/ 100</div>
          </div>
        )}
        {portrait.buying_intention && (
          <div style={{ flex: 1, padding: '12px 16px', borderRadius: 10, textAlign: 'center', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginBottom: 4 }}>购买意向</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ic }}>{portrait.buying_intention}</div>
          </div>
        )}
      </div>
      {portrait.personality_tags && portrait.personality_tags.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', marginBottom: 8, fontWeight: 500 }}>客户标签</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {portrait.personality_tags.map((tag, i) => (
              <span key={i} style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>{tag}</span>
            ))}
          </div>
        </div>
      )}
      {portrait.recommended_strategy && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>建议跟进策略</div>
          <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{portrait.recommended_strategy}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {portrait.key_concerns && portrait.key_concerns.length > 0 && (
          <div style={{ padding: 12, borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0c4a6e', marginBottom: 8 }}>关注要点</div>
            {portrait.key_concerns.map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: '#0369a1', marginBottom: 4, display: 'flex', gap: 6 }}><span>•</span>{c}</div>
            ))}
          </div>
        )}
        {portrait.risk_factors && portrait.risk_factors.length > 0 && (
          <div style={{ padding: 12, borderRadius: 10, background: '#fff1f2', border: '1px solid #fecdd3' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9f1239', marginBottom: 8 }}>风险因素</div>
            {portrait.risk_factors.map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: '#be123c', marginBottom: 4, display: 'flex', gap: 6 }}><span>⚠</span>{r}</div>
            ))}
          </div>
        )}
      </div>
      {portrait.next_actions && portrait.next_actions.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--notion-text)', marginBottom: 8 }}>建议行动项</div>
          {portrait.next_actions.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--notion-hover)', marginBottom: 4, fontSize: 13 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
              {a}
            </div>
          ))}
        </div>
      )}
      {portrait.industry_insight && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>行业洞察</div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{portrait.industry_insight}</div>
        </div>
      )}
      {portrait.cultural_awareness && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fefce8', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>文化与国家特性</div>
          <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{portrait.cultural_awareness}</div>
        </div>
      )}
      {portrait.country_business_customs && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>国家商务习惯建议</div>
          <div style={{ fontSize: 13, color: '#15803d', lineHeight: 1.6 }}>{portrait.country_business_customs}</div>
        </div>
      )}
      {portrait.customer_needs_summary && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#ede9fe', border: '1px solid #c4b5fd' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5b21b6', marginBottom: 6 }}>客户核心需求</div>
          <div style={{ fontSize: 13, color: '#6d28d9', lineHeight: 1.6 }}>{portrait.customer_needs_summary}</div>
        </div>
      )}
    </div>
  );
}

// ── Helper: get custom field value ────────────────────────────────────────────
function cf(customer: Customer, key: string): string | null {
  const v = customer.custom_fields?.[key];
  if (!v || (typeof v === 'string' && !v.trim())) return null;
  return String(v);
}

// ── DetailSection ─────────────────────────────────────────────────────────────
function DetailSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 12, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--notion-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--notion-text-muted)' }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--notion-text)', letterSpacing: 0.3 }}>{title}</span>
      </div>
      <div style={{ padding: 12 }}>
        {children}
      </div>
    </div>
  );
}

// ── InfoGrid: render label-value pairs in 2-col grid (editable when editing) ──
interface InfoGridItem {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
  fieldKey?: string;         // key for editing (e.g. 'email', 'phone')
  type?: 'text' | 'select' | 'textarea';
  options?: string[];        // for select type
}

function InfoGrid({ items, editing, editForm, onFieldChange }: {
  items: InfoGridItem[];
  editing?: boolean;
  editForm?: Record<string, string>;
  onFieldChange?: (key: string, value: string) => void;
}) {
  const showItems = items;
  if (showItems.length === 0) return <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', padding: '4px 0' }}>暂无信息</div>;
  const inputStyle = { width: '100%', fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)', outline: 'none' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {showItems.map((f, i) => (
        <div key={i} style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--notion-hover)', ...(f.wide ? { gridColumn: '1 / -1' } : {}) }}>
          <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginBottom: 2 }}>{f.label}</div>
          {editing && f.fieldKey && onFieldChange ? (
            f.type === 'select' && f.options ? (
              <select value={editForm?.[f.fieldKey] ?? ''} onChange={e => onFieldChange(f.fieldKey!, e.target.value)} style={{ ...inputStyle, padding: '4px 6px' }}>
                <option value="">—</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea value={editForm?.[f.fieldKey] ?? ''} onChange={e => onFieldChange(f.fieldKey!, e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            ) : (
              <input value={editForm?.[f.fieldKey] ?? ''} onChange={e => onFieldChange(f.fieldKey!, e.target.value)} style={inputStyle} />
            )
          ) : (
            <div style={{ fontSize: 13, fontWeight: 500, color: f.value ? 'var(--notion-text)' : 'var(--notion-text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.value || '—'}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── CustomerDrawer ─────────────────────────────────────────────────────────────
function CustomerDrawer({ customer, onClose, onUpdated }: { customer: Customer; onClose: () => void; onUpdated?: () => void }) {
  const [tab, setTab] = useState<'profile' | 'portrait' | 'leads'>('profile');
  const [portrait, setPortrait] = useState<Portrait | null>(null);
  const [generating, setGenerating] = useState(false);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [relatedLeads, setRelatedLeads] = useState<RelatedLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsFetched, setLeadsFetched] = useState(false);
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();

  // ── Edit mode ──
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  // Permission: admin or assigned salesperson can edit
  const me = getCurrentUser();
  const isAdmin = me?.role === 'platform_admin' || me?.role === 'tenant_admin';
  const isAssigned = !!(me?.sub && customer.assigned_to && me.sub === customer.assigned_to);
  const canEdit = isAdmin || isAssigned;

  // Load full customer detail on open
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.get(`/api/crm/customers/${customer.id}`);
        if (!cancelled) setDetail(d);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [customer.id]);

  // Load related leads when switching to leads tab
  useEffect(() => {
    if (tab !== 'leads' || leadsFetched) return;
    let cancelled = false;
    (async () => {
      setLeadsLoading(true);
      try {
        const data = await api.get(`/api/crm/customer-360/${customer.id}`);
        if (!cancelled) {
          const current: RelatedLead = {
            id: data.lead.id,
            full_name: data.lead.full_name,
            company: data.lead.company,
            email: data.lead.email,
            status: data.lead.status,
            source: data.lead.source,
            is_cold: data.lead.is_cold,
            cold_lead_reason: data.lead.cold_lead_reason,
            created_at: data.lead.created_at,
            updated_at: data.lead.updated_at,
            assigned_to_name: data.lead.assigned_to_name,
          };
          const others: RelatedLead[] = (data.related_leads ?? []).filter((l: RelatedLead) => l.id !== current.id);
          setRelatedLeads([current, ...others]);
          setLeadsFetched(true);
        }
      } catch {}
      finally { if (!cancelled) setLeadsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tab, customer.id, leadsFetched]);

  const c = detail || customer;

  useEffect(() => {
    const cached = c.custom_fields?.['_ai_portrait'];
    if (cached) setPortrait(cached);
  }, [c]);

  // Initialize edit form from customer data
  function startEditing() {
    const cf_data = c.custom_fields || {};
    setEditForm({
      full_name: c.full_name || '',
      email: c.email || '',
      phone: c.phone || '',
      whatsapp: c.whatsapp || '',
      company: c.company || '',
      title: c.title || '',
      country: c.country || '',
      source: c.source || '',
      // custom_fields
      first_name: cf_data.first_name || '',
      last_name: cf_data.last_name || '',
      gender: cf_data.gender || '',
      city: cf_data.city || '',
      region_province: cf_data.region_province || '',
      instagram: cf_data.instagram || '',
      social_platform: cf_data.social_platform || '',
      religion: cf_data.religion || '',
      contact_address: cf_data.contact_address || '',
      position: cf_data.position || '',
      industry: cf_data.industry || '',
      company_website: cf_data.company_website || '',
      main_products: cf_data.main_products || '',
      about_company: cf_data.about_company || '',
      customer_type: cf_data.customer_type || '',
      customer_quality: cf_data.customer_quality || '',
      customer_grade: cf_data.customer_grade || '',
      grade: cf_data.grade || '',
      product_category: cf_data.product_category || '',
      required_products: cf_data.required_products || '',
      end_usage: cf_data.end_usage || '',
      downstream_payment: cf_data.downstream_payment || '',
      annual_purchase: cf_data.annual_purchase || '',
      competitor: cf_data.competitor || '',
      source_channel: cf_data.source_channel || '',
      tags: cf_data.tags || '',
      requirements_notes: cf_data.requirements_notes || '',
      attack_notes: cf_data.attack_notes || '',
      contact_notes: cf_data.contact_notes || '',
    });
    setEditing(true);
  }

  function handleFieldChange(key: string, value: string) {
    setEditForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Separate core fields from custom_fields
      const CORE_KEYS = ['full_name', 'email', 'phone', 'whatsapp', 'company', 'title', 'country', 'source'];
      const coreUpdate: Record<string, string | null> = {};
      const cfUpdate: Record<string, string> = {};
      for (const [k, v] of Object.entries(editForm)) {
        if (CORE_KEYS.includes(k)) {
          coreUpdate[k] = v || null;
        } else if (v) {
          cfUpdate[k] = v;
        }
      }
      await api.patch(`/api/crm/leads/${c.id}/profile`, {
        ...coreUpdate,
        custom_fields: Object.keys(cfUpdate).length > 0 ? cfUpdate : undefined,
      });
      // Reload detail
      const d = await api.get(`/api/crm/customers/${c.id}`);
      setDetail(d);
      setEditing(false);
      onUpdated?.();
    } catch (e: any) {
      alert(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePortrait() {
    setGenerating(true);
    setTab('portrait');
    try {
      const res = await api.post(`/api/crm/customers/${c.id}/ai-portrait`, {});
      setPortrait(res.portrait);
    } catch {}
    finally { setGenerating(false); }
  }

  // Translate label maps
  const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', other: '其他' };
  const tags = cf(c, 'tags');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 560, height: '100%', background: 'var(--notion-bg)', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--notion-border)', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700 }}>
            {c.full_name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--notion-text)' }}>{c.full_name}</span>
              {cf(c, 'gender') && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b' }}>{GENDER_LABEL[cf(c, 'gender')!] || cf(c, 'gender')}</span>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--notion-text-muted)', marginTop: 2 }}>
              {(cf(c, 'position') || c.title) && `${cf(c, 'position') || c.title} · `}{c.company || '未知公司'}
            </div>
            {tags && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {tags.split(',').map((t, i) => (
                  <span key={i} style={{ padding: '1px 8px', borderRadius: 99, fontSize: 11, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>{t.trim()}</span>
                ))}
              </div>
            )}
            <div style={{ marginTop: 8 }}><ScoreBar score={c.customer_score} label={c.score_label} /></div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {canEdit && !editing && (
              <button onClick={startEditing} style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--notion-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--notion-text-muted)', fontSize: 12 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.color = '#7c3aed'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--notion-border)'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}>
                编辑
              </button>
            )}
            {editing && (
              <>
                <button onClick={() => setEditing(false)} disabled={saving} style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--notion-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--notion-text-muted)', fontSize: 12 }}>取消</button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '4px 10px', background: '#7c3aed', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', color: 'white', fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                  {saving ? '保存中...' : '保存'}
                </button>
              </>
            )}
            <button onClick={onClose} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--notion-text-muted)', fontSize: 18 }}>✕</button>
          </div>
        </div>
        {/* AI Portrait action */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--notion-border)' }}>
          <button onClick={handleGeneratePortrait} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: generating ? '#ede9fe' : 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: generating ? '#7c3aed' : 'white', border: 'none', cursor: generating ? 'not-allowed' : 'pointer' }}>
            {generating ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> 正在生成...</> : <><span>✦</span> {portrait ? '重新生成 AI 画像' : '生成 AI 客户画像'}</>}
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--notion-border)', padding: '0 24px' }}>
          {(['profile', 'portrait', 'leads'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 0', marginRight: 24, fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? '#7c3aed' : 'var(--notion-text-muted)', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `2px solid ${tab === t ? '#7c3aed' : 'transparent'}`, marginBottom: -1 }}>
              {t === 'profile' ? '客户信息' : t === 'portrait' ? 'AI 画像' : '线索记录'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {tab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* ── 联系方式 ── */}
              <DetailSection title="联系方式" icon={<HandIcon name="phone" size={14} />}>
                <InfoGrid editing={editing} editForm={editForm} onFieldChange={handleFieldChange} items={[
                  { label: '邮箱', value: c.email, fieldKey: 'email' },
                  { label: '电话', value: c.phone, fieldKey: 'phone' },
                  { label: 'WhatsApp', value: c.whatsapp, fieldKey: 'whatsapp' },
                  { label: 'Instagram', value: cf(c, 'instagram'), fieldKey: 'instagram' },
                  { label: '社交平台', value: cf(c, 'social_platform'), fieldKey: 'social_platform', type: 'select', options: ['WhatsApp', 'LinkedIn', 'Instagram', 'Facebook', 'WeChat', 'Telegram', 'Twitter/X'] },
                  { label: '联系地址', value: cf(c, 'contact_address'), fieldKey: 'contact_address', wide: true },
                ]} />
              </DetailSection>

              {/* ── 个人信息 ── */}
              <DetailSection title="个人信息" icon={<HandIcon name="person" size={14} />}>
                <InfoGrid editing={editing} editForm={editForm} onFieldChange={handleFieldChange} items={[
                  { label: '姓名', value: c.full_name, fieldKey: 'full_name' },
                  { label: '名', value: cf(c, 'first_name'), fieldKey: 'first_name' },
                  { label: '姓', value: cf(c, 'last_name'), fieldKey: 'last_name' },
                  { label: '性别', value: cf(c, 'gender') ? (GENDER_LABEL[cf(c, 'gender')!] || cf(c, 'gender')) : null, fieldKey: 'gender', type: 'select', options: ['male', 'female', 'other'] },
                  { label: '职位', value: cf(c, 'position') || c.title, fieldKey: 'position' },
                  { label: '国家', value: c.country, fieldKey: 'country' },
                  { label: '城市', value: cf(c, 'city'), fieldKey: 'city' },
                  { label: '省/地区', value: cf(c, 'region_province'), fieldKey: 'region_province' },
                  { label: '宗教', value: cf(c, 'religion'), fieldKey: 'religion' },
                ]} />
              </DetailSection>

              {/* ── 公司信息 ── */}
              <DetailSection title="公司信息" icon={<HandIcon name="building" size={14} />}>
                <InfoGrid editing={editing} editForm={editForm} onFieldChange={handleFieldChange} items={[
                  { label: '公司名称', value: c.company, fieldKey: 'company' },
                  { label: '行业', value: cf(c, 'industry'), fieldKey: 'industry' },
                  { label: '公司官网', value: cf(c, 'company_website'), fieldKey: 'company_website' },
                  { label: '主营产品', value: cf(c, 'main_products'), fieldKey: 'main_products' },
                  { label: '公司简介', value: cf(c, 'about_company'), fieldKey: 'about_company', wide: true, type: 'textarea' },
                ]} />
              </DetailSection>

              {/* ── 业务信息 ── */}
              <DetailSection title="业务信息" icon={<HandIcon name="bar-chart" size={14} />}>
                <InfoGrid editing={editing} editForm={editForm} onFieldChange={handleFieldChange} items={[
                  { label: '客户类型', value: cf(c, 'customer_type'), fieldKey: 'customer_type', type: 'select', options: ['贸易商', '终端用户', '制造商', '分销商', '政府/机构', '其他'] },
                  { label: '客户质量', value: cf(c, 'customer_quality'), fieldKey: 'customer_quality' },
                  { label: '客户等级', value: cf(c, 'customer_grade'), fieldKey: 'customer_grade', type: 'select', options: ['S级', 'A级', 'B级', 'C级', 'D级'] },
                  { label: '评级', value: cf(c, 'grade'), fieldKey: 'grade' },
                  { label: '产品类别', value: cf(c, 'product_category'), fieldKey: 'product_category', type: 'select', options: ['热轧卷', '冷轧卷', '镀锌卷', '彩涂卷', '不锈钢', '型材', '钢管', '线材', '其他'] },
                  { label: '需求产品', value: cf(c, 'required_products'), fieldKey: 'required_products' },
                  { label: '最终用途', value: cf(c, 'end_usage'), fieldKey: 'end_usage', wide: true },
                ]} />
              </DetailSection>

              {/* ── 商务信息 ── */}
              <DetailSection title="商务信息" icon={<HandIcon name="money-bag" size={14} />}>
                <InfoGrid editing={editing} editForm={editForm} onFieldChange={handleFieldChange} items={[
                  { label: '下游付款方式', value: cf(c, 'downstream_payment'), fieldKey: 'downstream_payment' },
                  { label: '年采购量', value: cf(c, 'annual_purchase'), fieldKey: 'annual_purchase' },
                  { label: '竞争对手', value: cf(c, 'competitor'), fieldKey: 'competitor', wide: true, type: 'textarea' },
                ]} />
              </DetailSection>

              {/* ── 合同统计 ── */}
              <DetailSection title="合同 & 管理" icon={<HandIcon name="clipboard" size={14} />}>
                <InfoGrid editing={editing} editForm={editForm} onFieldChange={handleFieldChange} items={[
                  { label: '合同数', value: c.contract_count ? `${c.contract_count} 份` : null },
                  { label: '合同总额', value: c.total_contract_value ? `$${Number(c.total_contract_value).toLocaleString()}` : null },
                  { label: '来源', value: c.source, fieldKey: 'source' },
                  { label: '来源渠道', value: cf(c, 'source_channel'), fieldKey: 'source_channel', type: 'select', options: ['LinkedIn', 'WhatsApp', '展会', '官网', '转介绍', '广告', '电话开发', '其他'] },
                  { label: '负责人', value: c.assigned_name },
                  { label: '状态', value: c.status },
                ]} />
              </DetailSection>

              {/* ── 备注 ── */}
              {(editing || cf(c, 'requirements_notes') || cf(c, 'attack_notes') || cf(c, 'contact_notes')) && (
                <DetailSection title="备注" icon={<HandIcon name="pencil" size={14} />}>
                  <InfoGrid editing={editing} editForm={editForm} onFieldChange={handleFieldChange} items={[
                    { label: '需求备注', value: cf(c, 'requirements_notes'), fieldKey: 'requirements_notes', wide: true, type: 'textarea' },
                    { label: '攻略备注', value: cf(c, 'attack_notes'), fieldKey: 'attack_notes', wide: true, type: 'textarea' },
                    { label: '联系备注', value: cf(c, 'contact_notes'), fieldKey: 'contact_notes', wide: true, type: 'textarea' },
                  ]} />
                </DetailSection>
              )}

              {/* ── AI 摘要 ── */}
              {c.ai_summary && (
                <div style={{ padding: 14, borderRadius: 10, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', marginBottom: 6 }}>AI 摘要</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: '#4c1d95', whiteSpace: 'pre-wrap' }}>{c.ai_summary}</div>
                </div>
              )}

              {/* ── 了解度评分 ── */}
              <div style={{ padding: 16, borderRadius: 12, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <ScoreRing score={c.customer_score} size={72} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>客户了解度</div>
                    <div style={{ fontSize: 13, color: 'var(--notion-text-muted)' }}>{c.score_label}</div>
                  </div>
                </div>
                {[
                  { label: '姓名', value: c.full_name, weight: 15 },
                  { label: '邮箱', value: c.email, weight: 12 },
                  { label: '电话', value: c.phone, weight: 10 },
                  { label: 'WhatsApp', value: c.whatsapp, weight: 10 },
                  { label: '公司', value: c.company, weight: 12 },
                  { label: '职位', value: c.title, weight: 8 },
                  { label: '国家', value: c.country, weight: 8 },
                  { label: '来源', value: c.source, weight: 5 },
                  { label: 'AI 摘要', value: c.ai_summary, weight: 15 },
                  { label: '自定义资料', value: c.custom_fields && Object.keys(c.custom_fields).filter(k => !k.startsWith('_')).length > 0 ? true : null, weight: 5 },
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--notion-border)' }}>
                    <span style={{ fontSize: 13, color: f.value ? '#10b981' : '#d1d5db' }}>{f.value ? '✓' : '○'}</span>
                    <span style={{ flex: 1, fontSize: 12, color: f.value ? 'var(--notion-text)' : 'var(--notion-text-muted)' }}>{f.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--notion-text-muted)' }}>+{f.weight}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'portrait' && (
            generating ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
                <div style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>✦</div>
                <div style={{ fontSize: 14, color: 'var(--notion-text-muted)' }}>AI 正在分析客户画像...</div>
              </div>
            ) : portrait ? <PortraitPanel portrait={portrait} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 40 }}>✦</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>点击「生成 AI 客户画像」</div>
                <div style={{ fontSize: 13, color: 'var(--notion-text-muted)', maxWidth: 280, lineHeight: 1.6 }}>AI 将综合客户信息、互动记录和合同数据，生成专业的客户画像分析</div>
              </div>
            )
          )}
          {tab === 'leads' && (() => {
            const LEAD_STAGE: Record<string, { label: string; color: string; bg: string }> = {
              inquiry:     { label: '询盘',     color: '#818cf8', bg: '#eef2ff' },
              new:         { label: '新线索',   color: '#60a5fa', bg: '#eff6ff' },
              replied:     { label: '取得回复', color: '#34d399', bg: '#ecfdf5' },
              quoted:      { label: '初次报价', color: '#fbbf24', bg: '#fffbeb' },
              engaged:     { label: '粘度增加', color: '#f97316', bg: '#fff7ed' },
              qualified:   { label: '知己知彼', color: '#e879f9', bg: '#fdf4ff' },
              negotiating: { label: '实单谈判', color: '#f43f5e', bg: '#fff1f2' },
              fulfillment: { label: '履约中',   color: '#0284c7', bg: '#e0f2fe' },
              payment:     { label: '待回款',   color: '#059669', bg: '#d1fae5' },
              converted:   { label: '客户成交', color: '#0f9d58', bg: '#f0fdf4' },
              cold:        { label: '冷线索',   color: '#9B9A97', bg: '#f3f4f6' },
              lost:        { label: '已流失',   color: '#9B9A97', bg: '#f3f4f6' },
            };
            return leadsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
                <div style={{ fontSize: 24, animation: 'spin 1s linear infinite' }}>⟳</div>
                <div style={{ fontSize: 14, color: 'var(--notion-text-muted)' }}>加载线索记录...</div>
              </div>
            ) : relatedLeads.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12, textAlign: 'center' }}>
                <div style={{ opacity: 0.3, color: 'var(--notion-text-muted)' }}><HandIcon name="clipboard" size={40} /></div>
                <div style={{ fontSize: 14, color: 'var(--notion-text-muted)' }}>暂无线索记录</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', marginBottom: 4 }}>共 {relatedLeads.length} 条线索记录</div>
                {relatedLeads.map((lead, idx) => {
                  const isCurrent = idx === 0;
                  const meta = LEAD_STAGE[lead.is_cold ? 'cold' : lead.status]
                    ?? { label: lead.status, color: '#9B9A97', bg: '#f3f4f6' };
                  const date = lead.created_at
                    ? new Date(lead.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
                    : '';
                  return (
                    <div
                      key={lead.id}
                      onClick={() => router.push(`/${tenant}/crm/customer-360/${lead.id}`)}
                      onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'var(--notion-hover, #f7f7f7)'; }}
                      onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'white'; }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                        background: isCurrent ? '#f5f3ff' : 'white',
                        border: isCurrent ? '1px solid #c4b5fd' : '1px solid var(--notion-border)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: meta.bg, color: meta.color, fontWeight: 700 }}>
                        {lead.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{lead.full_name}</span>
                          {isCurrent && (
                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, fontWeight: 700, background: '#ede9fe', color: '#7c3aed' }}>当前</span>
                          )}
                          {lead.status === 'converted' && !lead.is_cold && (
                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, fontWeight: 700, background: '#d1fae5', color: '#065f46' }}>⭐ 成交</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, fontWeight: 500, background: meta.bg, color: meta.color }}>{meta.label}</span>
                          {lead.company && <span style={{ fontSize: 10, color: '#6b7280' }}>{lead.company}</span>}
                          {lead.source && <span style={{ fontSize: 10, color: '#9B9A97' }}>来源: {lead.source}</span>}
                          {lead.assigned_to_name && <span style={{ fontSize: 10, color: '#9B9A97' }}>负责: {lead.assigned_to_name}</span>}
                          {date && <span style={{ fontSize: 10, color: '#C2C0BC' }}>{date}</span>}
                        </div>
                        {lead.is_cold && lead.cold_lead_reason && (
                          <div style={{ fontSize: 10, marginTop: 4, color: '#9B9A97', lineHeight: 1.4 }}>冷线索原因：{lead.cold_lead_reason}</div>
                        )}
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.4 }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Filter constants ──────────────────────────────────────────────────────────
const FILTER_STAGES = [
  { key: 'new', label: '新线索' }, { key: 'replied', label: '取得回复' },
  { key: 'quoted', label: '初次报价' }, { key: 'engaged', label: '增加粘度' },
  { key: 'qualified', label: '知己知彼' }, { key: 'negotiating', label: '实单谈判' },
  { key: 'converted', label: '成交客户' }, { key: 'procuring', label: '采购中' },
  { key: 'booking', label: '订舱中' }, { key: 'fulfillment', label: '发货中' },
  { key: 'payment', label: '待回款' },
];
const FILTER_GRADES = ['A', 'B', 'C', 'D'];
const FILTER_TYPES = ['贸易商', '终端用户', '制造商', '分销商', '政府机构'];
const FILTER_SOURCES = ['官网', '展会', '引荐', '邮件开发', '平台', 'LinkedIn', '其他'];

function FilterSection({ title, options, selected, onToggle }: {
  title: string; options: { key: string; label: string }[];
  selected: string[]; onToggle: (key: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--notion-text-muted)', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(o => {
          const active = selected.includes(o.key);
          return (
            <button key={o.key} onClick={() => onToggle(o.key)}
              style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                border: active ? '1px solid #7c3aed' : '1px solid var(--notion-border)',
                background: active ? '#ede9fe' : 'var(--notion-card, white)',
                color: active ? '#7c3aed' : 'var(--notion-text-muted)',
              }}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab 1: Customers ───────────────────────────────────────────────────────────
function CustomersTab() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Customer | null>(null);

  // ── Filters ──
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fGrade, setFGrade] = useState<string[]>([]);
  const [fCustomerType, setFCustomerType] = useState<string[]>([]);
  const [fAssignedTo, setFAssignedTo] = useState<string[]>([]);
  const [fSource, setFSource] = useState<string[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const filterRef = useRef<HTMLDivElement>(null);

  // ── View mode ──
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [kanbanGroupBy, setKanbanGroupBy] = useState<'stage' | 'customer_grade' | 'customer_type'>('stage');

  // ── Sorting ──
  type SortKey = 'full_name' | 'company' | 'customer_score' | 'contract_count' | 'total_contract_value' | 'status' | 'updated_at' | 'customer_grade' | 'customer_type';
  const [sortBy, setSortBy] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir(key === 'full_name' || key === 'company' || key === 'status' ? 'asc' : 'desc');
    }
  }

  const activeFilterCount = fStatus.length + fGrade.length + fCustomerType.length + fAssignedTo.length + fSource.length;

  // Load users for assigned_to filter
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/api/users');
        setUsers((data.users || data || []).map((u: any) => ({ id: String(u.id), full_name: u.full_name })));
      } catch {}
    })();
  }, []);

  // Close filter panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilterPanel(false);
    }
    if (showFilterPanel) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFilterPanel]);

  function toggleFilter(arr: string[], set: Dispatch<SetStateAction<string[]>>, key: string) {
    set(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: q, skip: '0', limit: '40', sort_by: sortBy, sort_dir: sortDir });
      if (fStatus.length) params.set('status', fStatus.join(','));
      if (fGrade.length) params.set('customer_grade', fGrade.join(','));
      if (fCustomerType.length) params.set('customer_type', fCustomerType.join(','));
      if (fAssignedTo.length) params.set('assigned_to', fAssignedTo.join(','));
      if (fSource.length) params.set('source', fSource.join(','));
      const data = await api.get(`/api/crm/customers?${params}`);
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [fStatus, fGrade, fCustomerType, fAssignedTo, fSource, sortBy, sortDir]);

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  const avgScore = customers.length
    ? Math.round(customers.reduce((s, c) => s + c.customer_score, 0) / customers.length) : 0;
  const highCount = customers.filter(c => c.customer_score >= 80).length;
  const lowCount = customers.filter(c => c.customer_score < 40).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stats */}
      <div style={{ padding: '16px 32px', display: 'flex', gap: 16, borderBottom: '1px solid var(--notion-border)' }}>
        {[
          { label: '客户总数', value: total, color: '#4338ca', bg: '#e0e7ff' },
          { label: '平均了解度', value: `${avgScore}%`, color: '#059669', bg: '#d1fae5' },
          { label: '深度了解', value: highCount, color: '#10b981', bg: '#ecfdf5' },
          { label: '待提升', value: lowCount, color: '#ef4444', bg: '#fef2f2' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '10px 18px', borderRadius: 10, background: s.bg, border: `1px solid ${s.color}22`, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
        {/* Search + Filter + View Toggle */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)', maxWidth: 260, width: '100%' }}>
            <span style={{ color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center' }}><HandIcon name="magnifier" size={14} /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索客户名、公司..." style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: 'var(--notion-text)' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--notion-text-muted)' }}>✕</button>}
          </div>

          {/* Filter button */}
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button onClick={() => setShowFilterPanel(!showFilterPanel)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                border: activeFilterCount > 0 ? '1px solid #7c3aed' : '1px solid var(--notion-border)',
                background: activeFilterCount > 0 ? '#ede9fe' : 'var(--notion-card, white)',
                color: activeFilterCount > 0 ? '#7c3aed' : 'var(--notion-text-muted)',
              }}>
              筛选
              {activeFilterCount > 0 && (
                <span style={{ minWidth: 18, height: 18, borderRadius: 99, background: '#7c3aed', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilterCount}</span>
              )}
            </button>
            {/* Filter panel */}
            {showFilterPanel && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 360, padding: 16, borderRadius: 12, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-text)' }}>筛选条件</span>
                  {activeFilterCount > 0 && (
                    <button onClick={() => { setFStatus([]); setFGrade([]); setFCustomerType([]); setFAssignedTo([]); setFSource([]); }}
                      style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>清除全部</button>
                  )}
                </div>
                <FilterSection title="阶段" options={FILTER_STAGES} selected={fStatus} onToggle={k => toggleFilter(fStatus, setFStatus, k)} />
                <FilterSection title="客户等级" options={FILTER_GRADES.map(g => ({ key: g, label: g }))} selected={fGrade} onToggle={k => toggleFilter(fGrade, setFGrade, k)} />
                <FilterSection title="客户类型" options={FILTER_TYPES.map(t => ({ key: t, label: t }))} selected={fCustomerType} onToggle={k => toggleFilter(fCustomerType, setFCustomerType, k)} />
                <FilterSection title="负责人" options={users.map(u => ({ key: u.id, label: u.full_name }))} selected={fAssignedTo} onToggle={k => toggleFilter(fAssignedTo, setFAssignedTo, k)} />
                <FilterSection title="来源" options={FILTER_SOURCES.map(s => ({ key: s, label: s }))} selected={fSource} onToggle={k => toggleFilter(fSource, setFSource, k)} />
              </div>
            )}
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', borderRadius: 8, border: '1px solid var(--notion-border)', overflow: 'hidden' }}>
            {([['table', '☰', '表格'], ['kanban', '⊞', '看板']] as const).map(([mode, icon, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                title={label}
                style={{ padding: '7px 10px', fontSize: 14, cursor: 'pointer', border: 'none',
                  background: viewMode === mode ? '#ede9fe' : 'var(--notion-card, white)',
                  color: viewMode === mode ? '#7c3aed' : 'var(--notion-text-muted)',
                }}>{icon}</button>
            ))}
          </div>

          {/* Kanban group-by selector */}
          {viewMode === 'kanban' && (
            <select value={kanbanGroupBy} onChange={e => setKanbanGroupBy(e.target.value as any)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--notion-border)', fontSize: 12, background: 'var(--notion-card, white)', color: 'var(--notion-text)', cursor: 'pointer' }}>
              <option value="stage">按阶段</option>
              <option value="customer_grade">按等级</option>
              <option value="customer_type">按类型</option>
            </select>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div style={{ padding: '8px 32px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--notion-border)' }}>
          {fStatus.map(s => {
            const lbl = FILTER_STAGES.find(x => x.key === s)?.label || s;
            return <span key={`s-${s}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd' }}>阶段: {lbl} <button onClick={() => setFStatus(prev => prev.filter(x => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 12, padding: 0 }}>✕</button></span>;
          })}
          {fGrade.map(g => (
            <span key={`g-${g}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>等级: {g} <button onClick={() => setFGrade(prev => prev.filter(x => x !== g))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 12, padding: 0 }}>✕</button></span>
          ))}
          {fCustomerType.map(t => (
            <span key={`t-${t}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' }}>类型: {t} <button onClick={() => setFCustomerType(prev => prev.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', fontSize: 12, padding: 0 }}>✕</button></span>
          ))}
          {fAssignedTo.map(a => {
            const name = users.find(u => u.id === a)?.full_name || a;
            return <span key={`a-${a}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}>负责人: {name} <button onClick={() => setFAssignedTo(prev => prev.filter(x => x !== a))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontSize: 12, padding: 0 }}>✕</button></span>;
          })}
          {fSource.map(s => (
            <span key={`src-${s}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, background: '#f0f9ff', color: '#0c4a6e', border: '1px solid #bae6fd' }}>来源: {s} <button onClick={() => setFSource(prev => prev.filter(x => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0c4a6e', fontSize: 12, padding: 0 }}>✕</button></span>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px' }}>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--notion-text-muted)' }}>加载中...</div>
        ) : customers.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{ marginBottom: 16, color: 'var(--notion-text-muted)', opacity: 0.4 }}><HandIcon name="building" size={40} /></div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>暂无客户数据</div>
            <div style={{ fontSize: 13, color: 'var(--notion-text-muted)' }}>{search ? '没有找到匹配的客户' : '从线索管理中转化线索后，客户将出现在这里'}</div>
          </div>
        ) : viewMode === 'kanban' ? renderKanban() : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--notion-border)' }}>
                {([
                  { label: '客户名称', key: 'full_name' as SortKey },
                  { label: '公司 / 职位', key: 'company' as SortKey },
                  { label: '客户类型', key: 'customer_type' as SortKey },
                  { label: '客户等级', key: 'customer_grade' as SortKey },
                  { label: '客户了解度', key: 'customer_score' as SortKey },
                  { label: '合同', key: 'contract_count' as SortKey },
                  { label: '状态', key: 'status' as SortKey },
                  { label: '更新时间', key: 'updated_at' as SortKey },
                  { label: '操作', key: null },
                ]).map((col) => (
                  <th key={col.label}
                    onClick={col.key ? () => toggleSort(col.key!) : undefined}
                    style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
                      color: sortBy === col.key ? '#7c3aed' : 'var(--notion-text-muted)',
                      cursor: col.key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
                    }}>
                    {col.label}
                    {col.key && sortBy === col.key && (
                      <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                    {col.key && sortBy !== col.key && (
                      <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.3 }}>⇅</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)} style={{ borderBottom: '1px solid var(--notion-border)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#7c3aed', flexShrink: 0 }}>{c.full_name.charAt(0)}</div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.full_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ fontSize: 13 }}>{c.company || '—'}</div>
                    {c.title && <div style={{ fontSize: 11, color: 'var(--notion-text-muted)' }}>{c.title}</div>}
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <span style={{ fontSize: 12, color: 'var(--notion-text)' }}>{c.custom_fields?.customer_type || '—'}</span>
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    {c.custom_fields?.customer_grade ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: c.custom_fields.customer_grade.startsWith('S') ? '#d1fae5' : c.custom_fields.customer_grade.startsWith('A') ? '#dbeafe' : c.custom_fields.customer_grade.startsWith('B') ? '#fef3c7' : '#f3f4f6', color: c.custom_fields.customer_grade.startsWith('S') ? '#065f46' : c.custom_fields.customer_grade.startsWith('A') ? '#1e40af' : c.custom_fields.customer_grade.startsWith('B') ? '#92400e' : '#6b7280' }}>{c.custom_fields.customer_grade}</span>
                    ) : <span style={{ fontSize: 12, color: 'var(--notion-text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 80, height: 6, borderRadius: 99, background: '#e5e7eb', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${c.customer_score}%`, borderRadius: 99, background: c.customer_score >= 80 ? '#10b981' : c.customer_score >= 60 ? '#f59e0b' : c.customer_score >= 40 ? '#3b82f6' : '#ef4444' }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 28 }}>{c.customer_score}%</span>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: c.customer_score >= 80 ? '#d1fae5' : c.customer_score >= 60 ? '#fef3c7' : c.customer_score >= 40 ? '#dbeafe' : '#fee2e2', color: c.customer_score >= 80 ? '#065f46' : c.customer_score >= 60 ? '#92400e' : c.customer_score >= 40 ? '#1e40af' : '#991b1b' }}>{c.score_label}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.contract_count > 0 ? '#059669' : 'var(--notion-text-muted)' }}>
                      {c.contract_count > 0 ? `${c.contract_count} 份` : '—'}
                    </div>
                    {c.total_contract_value > 0 && <div style={{ fontSize: 11, color: 'var(--notion-text-muted)' }}>${Number(c.total_contract_value).toLocaleString()}</div>}
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: '#ede9fe', color: '#6d28d9' }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <span style={{ fontSize: 12, color: 'var(--notion-text-muted)' }}>
                      {c.updated_at ? new Date(c.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <button onClick={e => { e.stopPropagation(); router.push(`/${tenant}/crm/customer-360/${c.id}`); }}
                      style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--notion-border)', background: 'none', cursor: 'pointer', color: 'var(--notion-text-muted)' }}>
                      客户详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected && <CustomerDrawer customer={selected} onClose={() => setSelected(null)} onUpdated={() => load(search)} />}
    </div>
  );

  // ── Kanban Rendering ──────────────────────────────────────────────────────────
  function renderKanban() {
    const KANBAN_GROUPS: Record<string, { key: string; label: string; color: string; bg: string }[]> = {
      stage: [
        { key: 'new', label: '新线索', color: '#60a5fa', bg: '#eff6ff' },
        { key: 'replied', label: '取得回复', color: '#34d399', bg: '#ecfdf5' },
        { key: 'quoted', label: '初次报价', color: '#fbbf24', bg: '#fffbeb' },
        { key: 'engaged', label: '增加粘度', color: '#f97316', bg: '#fff7ed' },
        { key: 'qualified', label: '知己知彼', color: '#e879f9', bg: '#fdf4ff' },
        { key: 'negotiating', label: '实单谈判', color: '#f43f5e', bg: '#fff1f2' },
        { key: 'converted', label: '成交客户', color: '#0f9d58', bg: '#f0fdf4' },
        { key: '_other', label: '其他', color: '#9B9A97', bg: '#f5f5f5' },
      ],
      customer_grade: [
        { key: 'A', label: 'A 级', color: '#10b981', bg: '#d1fae5' },
        { key: 'B', label: 'B 级', color: '#3b82f6', bg: '#dbeafe' },
        { key: 'C', label: 'C 级', color: '#f59e0b', bg: '#fef3c7' },
        { key: 'D', label: 'D 级', color: '#ef4444', bg: '#fee2e2' },
        { key: '_unrated', label: '未评级', color: '#9B9A97', bg: '#f5f5f5' },
      ],
      customer_type: [
        { key: '贸易商', label: '贸易商', color: '#7c3aed', bg: '#ede9fe' },
        { key: '终端用户', label: '终端用户', color: '#0284c7', bg: '#e0f2fe' },
        { key: '制造商', label: '制造商', color: '#c2410c', bg: '#fff7ed' },
        { key: '分销商', label: '分销商', color: '#059669', bg: '#d1fae5' },
        { key: '政府机构', label: '政府机构', color: '#dc2626', bg: '#fef2f2' },
        { key: '_other', label: '其他', color: '#9B9A97', bg: '#f5f5f5' },
      ],
    };

    const groups = KANBAN_GROUPS[kanbanGroupBy] || KANBAN_GROUPS.stage;
    const grouped: Record<string, Customer[]> = {};
    for (const g of groups) grouped[g.key] = [];

    for (const c of customers) {
      let key: string;
      if (kanbanGroupBy === 'stage') {
        key = groups.some(g => g.key === c.status) ? c.status : '_other';
      } else if (kanbanGroupBy === 'customer_grade') {
        const grade = c.custom_fields?.customer_grade as string | undefined;
        key = grade && groups.some(g => g.key === grade) ? grade : '_unrated';
      } else {
        const ctype = c.custom_fields?.customer_type as string | undefined;
        key = ctype && groups.some(g => g.key === ctype) ? ctype : '_other';
      }
      (grouped[key] ??= []).push(c);
    }

    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, marginTop: 16, minHeight: 480 }}>
        {groups.map(col => {
          const cards = grouped[col.key] || [];
          return (
            <div key={col.key} style={{ flexShrink: 0, width: 240, display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--notion-border)', background: col.bg }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: col.color }}>{col.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: col.color + '22', color: col.color }}>{cards.length}</span>
              </div>
              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cards.map(c => (
                  <div key={c.id}
                    onClick={() => setSelected(c)}
                    style={{ padding: 12, borderRadius: 10, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#7c3aed', flexShrink: 0 }}>{c.full_name.charAt(0)}</div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--notion-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</span>
                    </div>
                    {c.company && <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company}</div>}
                    {/* Score bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 99, background: '#e5e7eb', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${c.customer_score}%`, borderRadius: 99, background: c.customer_score >= 80 ? '#10b981' : c.customer_score >= 60 ? '#f59e0b' : c.customer_score >= 40 ? '#3b82f6' : '#ef4444' }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--notion-text-muted)' }}>{c.customer_score}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={e => { e.stopPropagation(); router.push(`/${tenant}/crm/customer-360/${c.id}`); }}
                        style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--notion-border)', background: 'none', cursor: 'pointer', color: 'var(--notion-text-muted)' }}>
                        客户详情
                      </button>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <div style={{ fontSize: 11, color: '#ccc', textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>暂无</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}

// CompanyResearchTab removed — merged into AIFinderTab as company mode

function CompanyReportView({ report }: { report: CompanyReport }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header card */}
      <div style={{ padding: '20px 24px', borderRadius: 14, background: 'linear-gradient(135deg, #4338ca08, #7c3aed08)', border: '1px solid #c4b5fd' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #4338ca, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white' }}><HandIcon name="building" size={26} /></div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--notion-text)' }}>{report.company_name || '未知公司'}</div>
            {report.industry && <div style={{ fontSize: 13, color: '#7c3aed', marginTop: 4 }}>{report.industry}</div>}
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              {report.founded && <span style={{ fontSize: 12, color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><HandIcon name="alarm-clock" size={12} /> 成立 {report.founded}</span>}
              {report.headquarters && <span style={{ fontSize: 12, color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><HandIcon name="pin" size={12} /> {report.headquarters}</span>}
              {report.size && <span style={{ fontSize: 12, color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><HandIcon name="people-group" size={12} /> {report.size}</span>}
              {report.website && <a href={report.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4 }}><HandIcon name="globe" size={12} /> {report.website}</a>}
            </div>
          </div>
        </div>
        {report.overview && <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--notion-text)', margin: 0 }}>{report.overview}</p>}
      </div>

      {/* Key personnel */}
      {report.key_personnel && report.key_personnel.length > 0 && (
        <Section title="核心人员" icon={<HandIcon name="people-group" size={14} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {report.key_personnel.map((p, i) => (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'white', flexShrink: 0 }}>{p.name.charAt(0)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-text)' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 500 }}>{p.title}</div>
                  </div>
                </div>
                {(p.email || p.phone || p.linkedin) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 46 }}>
                    {p.email && (
                      <a href={`mailto:${p.email}`} style={{ fontSize: 12, color: 'var(--notion-text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <HandIcon name="envelope" size={11} /> {p.email}
                      </a>
                    )}
                    {p.phone && (
                      <a href={`tel:${p.phone}`} style={{ fontSize: 12, color: 'var(--notion-text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <HandIcon name="phone" size={11} /> {p.phone}
                      </a>
                    )}
                    {p.linkedin && (
                      <a href={p.linkedin} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0a66c2', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <HandIcon name="briefcase" size={11} /> LinkedIn
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Contact info */}
      {report.contact_info && (report.contact_info.email || report.contact_info.phone || report.contact_info.address) && (
        <Section title="公司联系信息" icon={<HandIcon name="phone" size={14} />}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {report.contact_info.email && <InfoRow label="邮箱" value={report.contact_info.email} />}
            {report.contact_info.phone && <InfoRow label="电话" value={report.contact_info.phone} />}
            {report.contact_info.address && <InfoRow label="地址" value={report.contact_info.address} />}
          </div>
        </Section>
      )}

      {/* Products */}
      {report.products_services && report.products_services.length > 0 && (
        <Section title="产品 / 服务" icon={<HandIcon name="package" size={14} />}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {report.products_services.map((p, i) => (
              <span key={i} style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>{p}</span>
            ))}
          </div>
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Strengths */}
        {report.strengths && report.strengths.length > 0 && (
          <Section title="核心优势" icon={<HandIcon name="sparkle-star" size={14} />}>
            {report.strengths.map((s, i) => <BulletItem key={i} text={s} color="#10b981" />)}
          </Section>
        )}

        {/* Business opportunities */}
        {report.business_opportunities && report.business_opportunities.length > 0 && (
          <Section title="商业机遇" icon={<HandIcon name="lightning" size={14} />} accent>
            {report.business_opportunities.map((o, i) => <BulletItem key={i} text={o} color="#7c3aed" />)}
          </Section>
        )}
      </div>

      {/* Market position + target customers */}
      {(report.market_position || report.target_customers) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {report.market_position && (
            <Section title="市场地位" icon={<HandIcon name="bar-chart" size={14} />}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--notion-text)', margin: 0 }}>{report.market_position}</p>
            </Section>
          )}
          {report.target_customers && (
            <Section title="目标客户" icon={<HandIcon name="target" size={14} />}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--notion-text)', margin: 0 }}>{report.target_customers}</p>
            </Section>
          )}
        </div>
      )}

      {/* News */}
      {report.recent_news && report.recent_news.length > 0 && (
        <Section title="近期动态" icon={<HandIcon name="document" size={14} />}>
          {report.recent_news.map((n, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--notion-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)', marginBottom: 4 }}>
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noreferrer" style={{ color: '#7c3aed', textDecoration: 'none' }}>
                    {n.title} <span style={{ fontSize: 11 }}>↗</span>
                  </a>
                ) : n.title}
              </div>
              {n.date && <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginBottom: 4 }}>{n.date}</div>}
              {n.summary && <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', lineHeight: 1.5 }}>{n.summary}</div>}
            </div>
          ))}
        </Section>
      )}

      {/* Risk */}
      {report.risk_notes && report.risk_notes.length > 0 && (
        <div style={{
          padding: '16px 20px', borderRadius: 12,
          background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
          border: '1px solid #fca5a5',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️</span>风险提示
            </div>
            {report.risk_score !== undefined && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 99,
                background: report.risk_score >= 7 ? '#dc2626' : report.risk_score >= 4 ? '#f59e0b' : '#10b981',
                color: 'white', fontSize: 12, fontWeight: 700,
              }}>
                风险评分 {report.risk_score}/10
              </div>
            )}
          </div>
          {report.risk_notes.map((r, i) => <BulletItem key={i} text={r} color="#dc2626" />)}
        </div>
      )}

      {/* Sources */}
      {report.sources && report.sources.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', paddingTop: 8 }}>
          <span style={{ fontWeight: 600 }}>信息来源：</span>
          {report.sources.slice(0, 5).map((s, i) => (
            <a key={i} href={s} target="_blank" rel="noreferrer" style={{ color: '#7c3aed', marginLeft: 8 }}>来源{i + 1}</a>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children, accent }: { title: string; icon: React.ReactNode; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ padding: '16px 20px', borderRadius: 12, background: accent ? 'linear-gradient(135deg, #faf5ff, #ede9fe)' : 'var(--notion-card, white)', border: `1px solid ${accent ? '#c4b5fd' : 'var(--notion-border)'}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--notion-text-muted)' }}>{icon}</span>{title}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--notion-text-muted)', minWidth: 40 }}>{label}</span>
      <span style={{ color: 'var(--notion-text)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function BulletItem({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 13, alignItems: 'flex-start' }}>
      <span style={{ color, flexShrink: 0, marginTop: 1 }}>•</span>
      <span style={{ color: 'var(--notion-text)', lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function CompanyCard({ company, onDetail }: { company: CompanySummaryItem; onDetail: (c: CompanySummaryItem) => void }) {
  const pct = Math.round(company.confidence * 100);
  const badgeColor = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#6b7280';
  const badgeBg = pct >= 70 ? '#d1fae5' : pct >= 50 ? '#fef3c7' : '#f3f4f6';

  return (
    <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Company icon */}
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #4338ca, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white' }}><HandIcon name="building" size={22} /></div>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--notion-text)' }}>{company.company_name}</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: badgeBg, color: badgeColor, fontWeight: 600 }}>匹配度 {pct}%</span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--notion-text-muted)', marginBottom: 4 }}>
            {company.industry && <span style={{ padding: '2px 8px', borderRadius: 99, background: '#e0e7ff', color: '#4338ca', fontSize: 11 }}>{company.industry}</span>}
            {company.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><HandIcon name="pin" size={11} /> {company.location}</span>}
            {company.founded && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><HandIcon name="alarm-clock" size={11} /> 成立 {company.founded}</span>}
            {company.size && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><HandIcon name="people-group" size={11} /> {company.size}</span>}
          </div>
        </div>
      </div>

      {/* Snippet */}
      {company.snippet && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--notion-hover)', fontSize: 13, color: 'var(--notion-text)', lineHeight: 1.6 }}>
          {company.snippet}
        </div>
      )}

      {/* Footer: links + detail button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {company.website && (
            <a href={company.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#7c3aed', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <HandIcon name="globe" size={12} /> 官网 <span style={{ fontSize: 10 }}>↗</span>
            </a>
          )}
          {company.source_url && (
            <a href={company.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--notion-text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <HandIcon name="link" size={12} /> {company.source_title || '来源'} <span style={{ fontSize: 10 }}>↗</span>
            </a>
          )}
        </div>
        <button
          onClick={() => onDetail(company)}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: '#7c3aed', color: 'white', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <HandIcon name="magnifier" size={13} /> 搜索详情
        </button>
      </div>
    </div>
  );
}

// ── Tab 3: AI Finder ──────────────────────────────────────────────────────────

type SearchPhase = 'idle' | 'searching' | 'scraping' | 'extracting' | 'done';

interface ProgressState {
  phase: SearchPhase;
  totalCandidates: number;
  completed: number;
  found: number;
  limit: number;
  statusMsg: string;
}

function SearchProgress({ prog }: { prog: ProgressState }) {
  if (prog.phase === 'idle') return null;

  const steps: { key: SearchPhase; label: string; sub: string }[] = [
    { key: 'searching',  label: '搜索',   sub: '多引擎检索' },
    { key: 'scraping',   label: '分析',   sub: '并发抓取页面' },
    { key: 'extracting', label: 'AI 提取', sub: '结构化识别' },
  ];

  const stepIndex = (p: SearchPhase) => {
    if (p === 'searching') return 0;
    if (p === 'scraping') return 1;
    if (p === 'extracting' || p === 'done') return 2;
    return -1;
  };
  const activeIdx = stepIndex(prog.phase);

  // Bar fill %
  let fillPct = 0;
  if (prog.phase === 'searching') fillPct = 12;
  else if (prog.phase === 'scraping') fillPct = 30;
  else if (prog.phase === 'extracting' || prog.phase === 'done') {
    const base = 40;
    const extra = prog.totalCandidates > 0
      ? (prog.completed / prog.totalCandidates) * 55
      : 0;
    fillPct = Math.min(base + extra, prog.phase === 'done' ? 100 : 95);
  }

  const isDone = prog.phase === 'done';

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12, marginBottom: 20,
      background: isDone ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #faf5ff, #ede9fe)',
      border: `1px solid ${isDone ? '#86efac' : '#c4b5fd'}`,
    }}>
      {/* Step indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 14 }}>
        {steps.map((step, i) => {
          const isActive = activeIdx === i && !isDone;
          const isDoneStep = isDone || activeIdx > i;
          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                {/* Circle */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  background: isDoneStep ? '#10b981' : isActive ? '#7c3aed' : '#e5e7eb',
                  color: (isDoneStep || isActive) ? 'white' : '#9ca3af',
                  boxShadow: isActive ? '0 0 0 4px #ede9fe' : 'none',
                  transition: 'all 0.3s',
                  animation: isActive ? 'pulse-ring 1.5s ease-in-out infinite' : 'none',
                }}>
                  {isDoneStep ? '✓' : i + 1}
                </div>
                {/* Label */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isDoneStep ? '#059669' : isActive ? '#7c3aed' : '#9ca3af' }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{step.sub}</div>
                </div>
              </div>
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, margin: '0 8px', marginBottom: 20, background: activeIdx > i || isDone ? '#10b981' : '#e5e7eb', transition: 'background 0.4s' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 99, background: '#e5e7eb', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%', borderRadius: 99,
          width: `${fillPct}%`,
          background: isDone ? '#10b981' : 'linear-gradient(90deg, #7c3aed, #6d28d9)',
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>

      {/* Bottom row: status text + counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isDone && (
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 13, color: '#7c3aed' }}>✦</span>
          )}
          <span style={{ fontSize: 12, color: isDone ? '#059669' : '#7c3aed', fontWeight: 500 }}>
            {prog.statusMsg || (isDone ? '搜索完成' : '处理中...')}
          </span>
        </div>
        {(prog.phase === 'extracting' || prog.phase === 'done') && prog.totalCandidates > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: isDone ? '#059669' : '#7c3aed' }}>{prog.found}</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>/ 目标 {prog.limit} 人</span>
            <span style={{ fontSize: 11, color: '#c4b5fd', marginLeft: 4 }}>已扫描 {prog.completed}/{prog.totalCandidates} 页</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#6b7280';
  const bg = pct >= 70 ? '#d1fae5' : pct >= 50 ? '#fef3c7' : '#f3f4f6';
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: bg, color, fontWeight: 600 }}>匹配度 {pct}%</span>;
}

function ContactField({ icon, label, value, href, color }: { icon: React.ReactNode; label: string; value?: string; href?: string; color?: string }) {
  const hasValue = !!value;
  const content = (
    <div style={{
      padding: '10px 14px', borderRadius: 10,
      background: hasValue ? 'var(--notion-hover)' : '#f9fafb',
      border: `1px solid ${hasValue ? 'var(--notion-border)' : '#f3f4f6'}`,
      flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>{label}
      </div>
      <div style={{
        fontSize: 13, fontWeight: hasValue ? 600 : 400,
        color: hasValue ? (color || 'var(--notion-text)') : '#c9cdd4',
        fontStyle: hasValue ? 'normal' : 'italic',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {hasValue ? value : '暂没有找到'}
      </div>
    </div>
  );
  if (hasValue && href) {
    return <a href={href} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>{content}</a>;
  }
  return content;
}

function PersonCard({ person, onFindSimilar, onSaveToLeads }: { person: FoundPerson; onFindSimilar: (p: FoundPerson) => void; onSaveToLeads: (p: FoundPerson) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSaveToLeads(person);
      setSaved(true);
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)', marginBottom: 14 }}>
      {/* Match reason bar */}
      {person.match_reason && (
        <div style={{ padding: '6px 14px', borderRadius: 8, background: '#faf5ff', border: '1px solid #e9d5ff', marginBottom: 14, fontSize: 12, color: '#7c3aed', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>✦</span>{person.match_reason}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Avatar */}
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
          {person.name.charAt(0).toUpperCase()}
        </div>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--notion-text)' }}>{person.name}</span>
            {person.confidence !== undefined && <ConfidenceBadge score={person.confidence} />}
          </div>
          {person.title && <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600, marginBottom: 2 }}>{person.title}</div>}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--notion-text-muted)' }}>
            {person.company && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><HandIcon name="building" size={11} /> {person.company}</span>}
            {person.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><HandIcon name="pin" size={11} /> {person.location}</span>}
          </div>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {person.linkedin_url && (
            <a href={person.linkedin_url} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #0a66c2', background: '#0a66c2', color: 'white', fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>LinkedIn</a>
          )}
          <button
            onClick={save}
            disabled={saving || saved}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: saved ? '#d1fae5' : '#7c3aed', color: saved ? '#065f46' : 'white', cursor: (saving || saved) ? 'default' : 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {saved ? '✓ 已保存' : saving ? '保存中...' : '存为线索'}
          </button>
          <button
            onClick={() => onFindSimilar(person)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #7c3aed', background: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <HandIcon name="refresh-arrows" size={12} /> 找类似
          </button>
        </div>
      </div>

      {/* Contact fields — always visible 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
        <ContactField icon={<HandIcon name="phone" size={12} />} label="电话" value={person.phone} href={person.phone ? `tel:${person.phone}` : undefined} color="#059669" />
        <ContactField icon={<HandIcon name="envelope" size={12} />} label="邮箱" value={person.email} href={person.email ? `mailto:${person.email}` : undefined} />
        <ContactField icon={<HandIcon name="chat-bubble" size={12} />} label="微信" value={person.wechat} color="#07c160" />
      </div>

      {/* Summary — show first 2 lines by default */}
      {person.summary && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--notion-hover)', fontSize: 13, color: 'var(--notion-text)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: expanded ? 999 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {person.summary}
        </div>
      )}

      {/* Source link — always visible */}
      {person.source_url && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href={person.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#7c3aed', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <HandIcon name="link" size={11} /> {person.source_title || '查看来源'} <span style={{ fontSize: 10 }}>↗</span>
          </a>
        </div>
      )}

      {/* Expand for news */}
      {person.news && person.news.length > 0 && (
        <>
          <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 8, padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {expanded ? '▾ 收起新闻' : `▸ 相关新闻 (${person.news.length})`}
          </button>
          {expanded && (
            <div style={{ marginTop: 6, padding: '10px 14px', borderRadius: 8, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <HandIcon name="document" size={12} /> 相关新闻
              </div>
              {person.news.map((n, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6, fontSize: 12, lineHeight: 1.5 }}>
                  <span style={{ color: '#7c3aed', flexShrink: 0 }}>•</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--notion-text)' }}>{n.snippet || n.title}</span>
                    {n.url && (
                      <a href={n.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#7c3aed', textDecoration: 'none', whiteSpace: 'nowrap' }}>[来源]</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const SEARCH_LIMIT = 15;

// ── History types ──────────────────────────────────────────────────────────────
interface HistoryItem {
  id: string;
  query: string;
  result_count: number;
  share_token: string | null;
  created_at: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ── HistoryPanel ───────────────────────────────────────────────────────────────
function HistoryPanel({
  onClose, onRestore, onShare,
}: {
  onClose: () => void;
  onRestore: (item: HistoryItem) => void;
  onShare: (item: HistoryItem) => void;
}) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/ai-finder/history')
      .then(d => setItems(d.history || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await api.delete(`/api/ai-finder/history/${id}`);
    setItems(prev => prev.filter(x => x.id !== id));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: 400, height: '100%', zIndex: 1,
        background: 'var(--notion-bg)', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--notion-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>历史搜索</div>
            <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', marginTop: 2 }}>自动保存，最多 50 条</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--notion-text-muted)', padding: 4 }}>✕</button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--notion-text-muted)' }}>加载中...</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ marginBottom: 10, color: 'var(--notion-text-muted)', opacity: 0.4 }}><HandIcon name="magnifier" size={32} /></div>
              <div style={{ fontSize: 14, color: 'var(--notion-text-muted)' }}>暂无搜索记录</div>
            </div>
          ) : items.map(item => (
            <div key={item.id} style={{
              padding: '12px 20px', borderBottom: '1px solid var(--notion-border)',
              cursor: 'pointer', transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ flexShrink: 0, marginTop: 1, color: '#7c3aed' }}><HandIcon name="magnifier" size={16} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.query}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: '#ede9fe', color: '#7c3aed', fontWeight: 600 }}>
                      {item.result_count} 人
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--notion-text-muted)' }}>{relativeTime(item.created_at)}</span>
                    {item.share_token && (
                      <span style={{ fontSize: 11, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 3 }}><HandIcon name="link" size={10} /> 已分享</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button
                  onClick={() => onRestore(item)}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid #7c3aed', background: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  查看结果
                </button>
                <button
                  onClick={() => onShare(item)}
                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--notion-border)', background: 'none', color: 'var(--notion-text-muted)', cursor: 'pointer', fontSize: 12 }}
                >
                  分享
                </button>
                <button
                  onClick={e => handleDelete(item.id, e)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #fecdd3', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ShareModal ─────────────────────────────────────────────────────────────────
function ShareModal({
  item, onClose, onTokenGenerated,
}: {
  item: HistoryItem;
  onClose: () => void;
  onTokenGenerated: (id: string, token: string) => void;
}) {
  const { tenant } = useParams<{ tenant: string }>();
  const [token, setToken] = useState<string | null>(item.share_token);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = token
    ? `${window.location.origin}/${tenant}/crm/customers?tab=ai-finder&share_token=${token}&share_tenant=${tenant}`
    : null;

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await api.post(`/api/ai-finder/history/${item.id}/share`, {});
      setToken(res.share_token);
      onTokenGenerated(item.id, res.share_token);
    } catch {}
    finally { setGenerating(false); }
  }

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: 480, borderRadius: 16, zIndex: 1,
        background: 'var(--notion-bg)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--notion-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><HandIcon name="link" size={16} /> 分享搜索结果</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--notion-text-muted)' }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Search info */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--notion-hover)', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', marginBottom: 4 }}>搜索词</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{item.query}</div>
            <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 4 }}>找到 {item.result_count} 位联系人</div>
          </div>

          {token ? (
            <>
              {/* Share link */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>分享链接</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--notion-hover)',
                    border: '1px solid var(--notion-border)', fontSize: 12,
                    color: 'var(--notion-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {shareUrl}
                  </div>
                  <button
                    onClick={handleCopy}
                    style={{
                      padding: '10px 16px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      background: copied ? '#10b981' : '#7c3aed', color: 'white', flexShrink: 0, transition: 'background 0.2s',
                    }}
                  >
                    {copied ? '✓ 已复制' : '复制'}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', lineHeight: 1.6, padding: '10px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                ⚠️ 任何有此链接的人都可查看搜索词和结果摘要。不包含联系人的完整个人信息。
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
              <div style={{ fontSize: 13, color: 'var(--notion-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                生成分享链接后，任何有链接的人都可查看此次搜索结果
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  padding: '10px 28px', borderRadius: 10, border: 'none',
                  background: generating ? '#ede9fe' : '#7c3aed', color: generating ? '#7c3aed' : 'white',
                  fontWeight: 600, fontSize: 14, cursor: generating ? 'not-allowed' : 'pointer',
                }}
              >
                {generating ? '生成中...' : '生成分享链接'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AIFinderTab() {
  const { tenant } = useParams<{ tenant: string }>();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'people' | 'company'>('people');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<FoundPerson[]>([]);
  const [searchLimit, setSearchLimit] = useState(SEARCH_LIMIT);
  const [prog, setProg] = useState<ProgressState>({
    phase: 'idle', totalCandidates: 0, completed: 0, found: 0, limit: searchLimit, statusMsg: '',
  });
  const [similarFor, setSimilarFor] = useState<FoundPerson | null>(null);
  const [similarPeople, setSimilarPeople] = useState<FoundPerson[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarStatus, setSimilarStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const similarAbortRef = useRef<AbortController | null>(null);

  // Company mode state
  const [companyPhase, setCompanyPhase] = useState<'list' | 'detail'>('list');
  const [companySummaries, setCompanySummaries] = useState<CompanySummaryItem[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanySummaryItem | null>(null);
  const [companyStatus, setCompanyStatus] = useState('');
  const [companyReport, setCompanyReport] = useState<CompanyReport | null>(null);
  const [companyPeople, setCompanyPeople] = useState<FoundPerson[]>([]);
  const companyAbortRef = useRef<AbortController | null>(null);

  // History / share state
  const [showHistory, setShowHistory] = useState(false);
  const [shareItem, setShareItem] = useState<HistoryItem | null>(null);
  const [savedHistoryId, setSavedHistoryId] = useState<string | null>(null);
  const [isSharedView, setIsSharedView] = useState(false);

  // Load AI Finder settings from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ai_finder_settings');
      if (raw) {
        const settings = JSON.parse(raw);
        const depthMap: Record<string, number> = { fast: 5, standard: 15, thorough: 25 };
        if (settings.search_depth && depthMap[settings.search_depth]) {
          setSearchLimit(depthMap[settings.search_depth]);
        }
        if (settings.default_mode && (settings.default_mode === 'people' || settings.default_mode === 'company')) {
          setMode(settings.default_mode);
        }
      }
    } catch {}
  }, []);

  // Load shared search on mount if ?share_token= present
  useEffect(() => {
    const token = searchParams.get('share_token');
    const shareTenant = searchParams.get('share_tenant') || tenant;
    if (!token) return;
    setIsSharedView(true);
    setProg(p => ({ ...p, phase: 'searching', statusMsg: '正在加载分享的搜索结果...' }));
    api.get(`/api/ai-finder/shared/${shareTenant}/${token}`)
      .then((data: any) => {
        setQuery(data.query || '');
        setPeople(data.results_json || []);
        setProg(p => ({ ...p, phase: 'done', found: (data.results_json || []).length, statusMsg: `分享记录：${data.result_count} 位联系人` }));
      })
      .catch(() => {
        setProg(p => ({ ...p, phase: 'idle', statusMsg: '' }));
        setIsSharedView(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const PEOPLE_SUGGESTIONS = ['外贸采购总监 巴西', '德国机械制造商 CEO', '新加坡投资人 科技行业', '跨境电商 品牌负责人'];
  const COMPANY_SUGGESTIONS = ['华为技术', 'OpenAI', '宁德时代', '特斯拉', 'NVIDIA'];

  function resetProg() {
    setProg({ phase: 'idle', totalCandidates: 0, completed: 0, found: 0, limit: searchLimit, statusMsg: '' });
  }

  async function streamPeople(
    url: string,
    body: object,
    onPerson: (p: FoundPerson) => void,
    onProgUpdate: (ev: any) => void,
    setLoad: (b: boolean) => void,
    abort: AbortController,
    onError?: (msg: string) => void,
  ) {
    const apiBase = getApiUrl();
    try {
      const res = await fetch(`${apiBase}${url}`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        onError?.(err.detail || `请求失败 (${res.status})`);
        return;
      }
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            onProgUpdate(ev);
            if (ev.type === 'person') {
              const d = ev.data;
              onPerson({ ...d, linkedin_url: d.linkedin_url || d.linkedin });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') onError?.('搜索失败，请重试');
    } finally {
      setLoad(false);
    }
  }

  async function handleCompanySearch() {
    if (!query.trim() || loading) return;
    companyAbortRef.current?.abort();
    companyAbortRef.current = new AbortController();
    setLoading(true);
    setCompanyStatus('正在搜索...');
    setCompanyPhase('list');
    setCompanySummaries([]);
    setSelectedCompany(null);
    setCompanyReport(null);
    setCompanyPeople([]);

    try {
      const apiBase = getApiUrl();
      const res = await fetch(`${apiBase}/api/ai-finder/company-search`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query: query.trim(), limit: 10 }),
        signal: companyAbortRef.current.signal,
      });
      if (!res.ok) { setCompanyStatus(`请求失败 (${res.status})`); setLoading(false); return; }
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'status') setCompanyStatus(ev.message);
            if (ev.type === 'company') {
              setCompanySummaries(prev => [...prev, ev.data as CompanySummaryItem]);
            }
            if (ev.type === 'error') { setCompanyStatus(`错误: ${ev.message}`); }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setCompanyStatus('搜索失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompanyDetail(company: CompanySummaryItem) {
    companyAbortRef.current?.abort();
    companyAbortRef.current = new AbortController();
    setSelectedCompany(company);
    setCompanyPhase('detail');
    setLoading(true);
    setCompanyStatus('正在生成详细报告...');
    setCompanyReport(null);
    setCompanyPeople([]);

    try {
      const apiBase = getApiUrl();
      const res = await fetch(`${apiBase}/api/ai-finder/company`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query: company.company_name, tenant_id: getTenantId() || '' }),
        signal: companyAbortRef.current.signal,
      });
      if (!res.ok) { setCompanyStatus(`请求失败 (${res.status})`); setLoading(false); return; }
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'status') setCompanyStatus(ev.message);
            if (ev.type === 'report') { setCompanyReport(ev.data); setCompanyStatus(''); }
            if (ev.type === 'company_person') {
              const p = ev.data;
              setCompanyPeople(prev => {
                if (prev.some(x => x.name === p.name)) return prev;
                return [...prev, {
                  id: p.id, name: p.name, title: p.title, company: p.company,
                  location: p.location, email: p.email, phone: p.phone, wechat: p.wechat,
                  linkedin_url: p.linkedin, summary: p.summary, source_url: p.source_url,
                  confidence: p.confidence,
                }];
              });
            }
            if (ev.type === 'error') { setCompanyStatus(`错误: ${ev.message}`); }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setCompanyStatus('搜索失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    if (mode === 'company') { handleCompanySearch(); return; }
    if (!query.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setIsSharedView(false);
    setSavedHistoryId(null);
    setPeople([]);
    setSimilarFor(null);
    setSimilarPeople([]);
    setProg({ phase: 'searching', totalCandidates: 0, completed: 0, found: 0, limit: searchLimit, statusMsg: '正在多引擎检索...' });

    const tid = getTenantId() || '';
    const searchQuery = query.trim();

    // Capture results for auto-save
    const collectedPeople: FoundPerson[] = [];

    await streamPeople(
      '/api/ai-finder/people',
      { query: searchQuery, limit: searchLimit, tenant_id: tid },
      (person) => {
        collectedPeople.push(person);
        setPeople(prev => [...prev, person]);
      },
      (ev) => {
        if (ev.type === 'status') {
          const phase: SearchPhase =
            ev.phase === 'searching' ? 'searching' :
            ev.phase === 'scraping' ? 'scraping' :
            ev.phase === 'done' ? 'done' : 'extracting';
          setProg(prev => ({
            ...prev, phase,
            statusMsg: ev.message || prev.statusMsg,
            totalCandidates: ev.total_candidates ?? prev.totalCandidates,
            found: ev.found ?? prev.found,
          }));
          // Auto-save when done (fire and forget)
          if (ev.phase === 'done' && collectedPeople.length > 0) {
            api.post('/api/ai-finder/history', { query: searchQuery, results: collectedPeople })
              .then((res: any) => setSavedHistoryId(res.id))
              .catch(() => {});
          }
        } else if (ev.type === 'heartbeat') {
          setProg(prev => ({
            ...prev, phase: 'searching',
            statusMsg: `正在多引擎检索... ${ev.elapsed ?? ''}s`,
          }));
        } else if (ev.type === 'person' || ev.type === 'progress') {
          setProg(prev => ({
            ...prev, phase: 'extracting',
            completed: ev.completed ?? prev.completed,
            totalCandidates: ev.total_candidates ?? prev.totalCandidates,
            found: ev.found ?? prev.found,
          }));
        } else if (ev.type === 'person_news') {
          // Attach news to the matching person by id
          setPeople(prev => prev.map(p =>
            p.id === ev.person_id ? { ...p, news: ev.news } : p
          ));
        }
      },
      setLoading,
      abortRef.current,
      (msg) => setProg(prev => ({ ...prev, phase: 'done', statusMsg: msg })),
    );
  }

  async function handleFindSimilar(person: FoundPerson) {
    similarAbortRef.current?.abort();
    similarAbortRef.current = new AbortController();
    setSimilarFor(person);
    setSimilarPeople([]);
    setSimilarLoading(true);
    setSimilarStatus(`正在寻找与 ${person.name} 类似的人...`);

    const tid = getTenantId() || '';
    await streamPeople(
      '/api/ai-finder/find-similar',
      { person: { name: person.name, title: person.title, company: person.company, location: person.location }, limit: 6, tenant_id: tid },
      (p) => setSimilarPeople(prev => [...prev, p]),
      (ev) => { if (ev.type === 'status') setSimilarStatus(ev.message || ''); },
      setSimilarLoading,
      similarAbortRef.current,
    );
  }

  async function saveToLeads(person: FoundPerson) {
    const tid = getTenantId() || '';
    await api.post('/api/crm/leads', {
      full_name: person.name,
      email: person.email || null,
      company: person.company || null,
      title: person.title || null,
      source: 'AI找人',
      ai_summary: person.summary || null,
      tenant_id: tid,
    });
  }

  // Sort controls
  const [sortBy, setSortBy] = useState<'relevance' | 'name' | 'company'>('relevance');
  const sortedPeople = useMemo(() => {
    if (sortBy === 'relevance') return people;
    const sorted = [...people];
    if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    if (sortBy === 'company') sorted.sort((a, b) => (a.company || '').localeCompare(b.company || '', 'zh-CN'));
    return sorted;
  }, [people, sortBy]);

  const isSearching = prog.phase !== 'idle';

  function handleRestoreHistory(item: HistoryItem) {
    setShowHistory(false);
    setQuery(item.query);
    // Load full results
    api.get(`/api/ai-finder/history/${item.id}/results`)
      .then((data: any) => {
        setPeople(data.results_json || []);
        setProg({
          phase: 'done', totalCandidates: item.result_count,
          completed: item.result_count, found: item.result_count,
          limit: searchLimit, statusMsg: `历史记录 · ${relativeTime(item.created_at)}`,
        });
      })
      .catch(() => {});
  }

  const suggestions = mode === 'people' ? PEOPLE_SUGGESTIONS : COMPANY_SUGGESTIONS;
  const placeholder = mode === 'people'
    ? '描述你想找的人，例如：德国汽车配件采购总监...'
    : '输入公司名称，例如：华为技术、OpenAI、特斯拉...';

  function handleStop() {
    if (mode === 'company') {
      companyAbortRef.current?.abort();
    } else {
      abortRef.current?.abort();
      resetProg();
    }
    setLoading(false);
  }

  async function handleSearchMorePeople() {
    if (!query.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setProg(prev => ({ ...prev, phase: 'searching', statusMsg: '正在搜索更多...' }));

    const tid = getTenantId() || '';
    const existingNames = people.map(p => p.name);

    await streamPeople(
      '/api/ai-finder/people',
      { query: query.trim(), limit: searchLimit, tenant_id: tid, exclude_names: existingNames },
      (person) => setPeople(prev => [...prev, person]),
      (ev) => {
        if (ev.type === 'status') {
          const phase: SearchPhase =
            ev.phase === 'searching' ? 'searching' :
            ev.phase === 'scraping' ? 'scraping' :
            ev.phase === 'done' ? 'done' : 'extracting';
          setProg(prev => ({
            ...prev, phase,
            statusMsg: ev.message || prev.statusMsg,
            totalCandidates: ev.total_candidates ?? prev.totalCandidates,
            found: (people.length) + (ev.found ?? 0),
          }));
        } else if (ev.type === 'heartbeat') {
          setProg(prev => ({ ...prev, phase: 'searching', statusMsg: `正在继续搜索... ${ev.elapsed ?? ''}s` }));
        } else if (ev.type === 'person' || ev.type === 'progress') {
          setProg(prev => ({
            ...prev, phase: 'extracting',
            completed: ev.completed ?? prev.completed,
            totalCandidates: ev.total_candidates ?? prev.totalCandidates,
            found: (people.length) + (ev.found ?? 0),
          }));
        }
      },
      setLoading,
      abortRef.current,
      (msg) => setProg(prev => ({ ...prev, phase: 'done', statusMsg: msg })),
    );
  }

  async function handleSearchMoreCompanies() {
    if (!query.trim() || loading) return;
    companyAbortRef.current?.abort();
    companyAbortRef.current = new AbortController();
    setLoading(true);
    setCompanyStatus('正在搜索更多公司...');

    const existingNames = companySummaries.map(c => c.company_name);

    try {
      const apiBase = getApiUrl();
      const res = await fetch(`${apiBase}/api/ai-finder/company-search`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query: query.trim(), limit: 10, exclude_names: existingNames }),
        signal: companyAbortRef.current.signal,
      });
      if (!res.ok) { setCompanyStatus(`请求失败 (${res.status})`); setLoading(false); return; }
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'status') setCompanyStatus(ev.message);
            if (ev.type === 'company') {
              setCompanySummaries(prev => [...prev, ev.data as CompanySummaryItem]);
            }
            if (ev.type === 'error') { setCompanyStatus(`错误: ${ev.message}`); }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setCompanyStatus('搜索失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Mode toggle + header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            {/* Mode toggle */}
            <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--notion-border)', overflow: 'hidden' }}>
              {([
                { key: 'people' as const, label: '找人', icon: 'magnifier' },
                { key: 'company' as const, label: '查公司', icon: 'building' },
              ]).map(m => (
                <button
                  key={m.key}
                  onClick={() => { setMode(m.key); setQuery(''); setCompanyPhase('list'); setCompanySummaries([]); setCompanyReport(null); setCompanyPeople([]); setCompanyStatus(''); }}
                  style={{
                    padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: mode === m.key ? '#7c3aed' : 'transparent',
                    color: mode === m.key ? 'white' : 'var(--notion-text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><HandIcon name={m.icon} size={13} /> {m.label}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Share current results */}
              {mode === 'people' && savedHistoryId && (
                <button
                  onClick={() => setShareItem({ id: savedHistoryId, query, result_count: people.length, share_token: null, created_at: new Date().toISOString() })}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--notion-border)', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <HandIcon name="link" size={12} /> 分享结果
                </button>
              )}
              <button
                onClick={() => setShowHistory(true)}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--notion-border)', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <HandIcon name="clipboard" size={12} /> 历史记录
              </button>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--notion-text-muted)', marginBottom: 14 }}>
            {isSharedView
              ? '正在查看分享的搜索结果'
              : mode === 'people'
                ? '用自然语言描述你想找的人，AI 将从互联网搜索并整理联系人信息'
                : '输入公司名称，AI 将从互联网搜集信息并整理企业风险调研报告'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={placeholder}
              style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid var(--notion-border)', fontSize: 14, outline: 'none', background: 'var(--notion-card, white)', color: 'var(--notion-text)' }}
            />
            <button
              onClick={loading ? handleStop : handleSearch}
              disabled={!query.trim() && !loading}
              style={{
                padding: '12px 24px', borderRadius: 10, border: 'none',
                background: loading ? '#fee2e2' : !query.trim() ? '#e5e7eb' : '#7c3aed',
                color: loading ? '#dc2626' : !query.trim() ? '#9ca3af' : 'white',
                cursor: (!query.trim() && !loading) ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap',
              }}
            >
              {loading ? '停止' : mode === 'people' ? '开始搜索' : '查公司'}
            </button>
          </div>
          {!isSearching && !isSharedView && !(mode === 'company' && (companySummaries.length > 0 || companyReport)) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => setQuery(s)} style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, background: 'var(--notion-hover)', border: '1px solid var(--notion-border)', cursor: 'pointer', color: 'var(--notion-text-muted)' }}>{s}</button>
              ))}
            </div>
          )}
        </div>

        {/* ── People mode content ── */}
        {mode === 'people' && (
          <>
            {/* Progress bar */}
            <SearchProgress prog={prog} />

            {/* Results */}
            {people.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--notion-text)' }}>
                    找到 {people.length} 位联系人{loading && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--notion-text-muted)', marginLeft: 8 }}>搜索中...</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([
                      { key: 'relevance' as const, label: '按匹配度' },
                      { key: 'name' as const, label: '按姓名' },
                      { key: 'company' as const, label: '按公司' },
                    ]).map(s => (
                      <button
                        key={s.key}
                        onClick={() => setSortBy(s.key)}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                          border: `1px solid ${sortBy === s.key ? '#7c3aed' : 'var(--notion-border)'}`,
                          background: sortBy === s.key ? '#ede9fe' : 'transparent',
                          color: sortBy === s.key ? '#7c3aed' : 'var(--notion-text-muted)',
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {sortedPeople.map((p, i) => (
                  <PersonCard key={p.id || i} person={p} onFindSimilar={handleFindSimilar} onSaveToLeads={saveToLeads} />
                ))}

                {/* Search more button */}
                {!loading && prog.phase === 'done' && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button
                      onClick={handleSearchMorePeople}
                      style={{
                        padding: '10px 28px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        border: '1px solid #7c3aed', background: 'none', color: '#7c3aed',
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <HandIcon name="magnifier" size={13} /> 搜索更多
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Similar people */}
            {similarFor && (
              <div style={{ marginTop: 24, paddingTop: 24, borderTop: '2px dashed var(--notion-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>与 {similarFor.name} 类似的人</div>
                  {similarLoading && (
                    <span style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>✦</span>
                      {similarStatus}
                    </span>
                  )}
                </div>
                {similarPeople.map((p, i) => (
                  <PersonCard key={i} person={p} onFindSimilar={handleFindSimilar} onSaveToLeads={saveToLeads} />
                ))}
                {!similarLoading && similarPeople.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--notion-text-muted)', textAlign: 'center', padding: 20 }}>暂未找到类似人员</div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!loading && people.length === 0 && prog.phase === 'idle' && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ marginBottom: 16, color: 'var(--notion-text-muted)', opacity: 0.3 }}><HandIcon name="magnifier" size={48} /></div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>开始搜索目标联系人</div>
                <div style={{ fontSize: 13, color: 'var(--notion-text-muted)', maxWidth: 400, margin: '0 auto', lineHeight: 1.7 }}>
                  输入你想找的人的描述，AI 将搜索互联网并整理出最匹配的联系人信息，可直接保存为线索
                </div>
                <button
                  onClick={() => setShowHistory(true)}
                  style={{ marginTop: 20, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--notion-border)', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--notion-text-muted)' }}
                >
                  <HandIcon name="clipboard" size={13} /> 查看历史搜索
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Company mode content ── */}
        {mode === 'company' && (
          <>
            {companyPhase === 'list' && (
              <>
                {/* Loading status */}
                {companyStatus && companySummaries.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderRadius: 10, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 18 }}>✦</span>
                    <span style={{ fontSize: 14, color: '#7c3aed' }}>{companyStatus}</span>
                  </div>
                )}

                {/* Company list */}
                {companySummaries.length > 0 && (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--notion-text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HandIcon name="building" size={15} /> 找到 {companySummaries.length} 家相关公司
                      {loading && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--notion-text-muted)' }}>搜索中...</span>}
                    </div>
                    {companySummaries.map(c => (
                      <CompanyCard key={c.id} company={c} onDetail={handleCompanyDetail} />
                    ))}

                    {/* Search more button */}
                    {!loading && (
                      <div style={{ textAlign: 'center', marginTop: 16 }}>
                        <button
                          onClick={handleSearchMoreCompanies}
                          style={{
                            padding: '10px 28px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                            border: '1px solid #7c3aed', background: 'none', color: '#7c3aed',
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <HandIcon name="magnifier" size={13} /> 搜索更多公司
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {!loading && companySummaries.length === 0 && !companyStatus && (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <div style={{ marginBottom: 16, color: 'var(--notion-text-muted)', opacity: 0.3 }}><HandIcon name="building" size={48} /></div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>AI 企业风险调研</div>
                    <div style={{ fontSize: 13, color: 'var(--notion-text-muted)', maxWidth: 400, margin: '0 auto', lineHeight: 1.7 }}>
                      输入公司名称或行业关键词，AI 将搜索匹配的公司列表，点击可查看详细调研报告
                    </div>
                  </div>
                )}
              </>
            )}

            {companyPhase === 'detail' && (
              <>
                {/* Back button */}
                <button
                  onClick={() => { setCompanyPhase('list'); setCompanyReport(null); setCompanyPeople([]); setCompanyStatus(''); companyAbortRef.current?.abort(); setLoading(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                    borderRadius: 8, border: '1px solid var(--notion-border)', background: 'none',
                    cursor: 'pointer', fontSize: 13, color: 'var(--notion-text-muted)', marginBottom: 16,
                  }}
                >
                  ← 返回公司列表
                </button>

                {/* Loading status */}
                {companyStatus && !companyReport && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderRadius: 10, background: '#faf5ff', border: '1px solid #e9d5ff', marginBottom: 16 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 18 }}>✦</span>
                    <span style={{ fontSize: 14, color: '#7c3aed' }}>{companyStatus}</span>
                  </div>
                )}

                {/* Report */}
                {companyReport && <CompanyReportView report={companyReport} />}

                {/* Company personnel */}
                {companyPeople.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--notion-text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HandIcon name="people-group" size={15} /> 搜索到的关键人员 ({companyPeople.length})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                      {companyPeople.map((p, i) => (
                        <PersonCard key={p.id || i} person={p} onFindSimilar={() => {}} onSaveToLeads={saveToLeads} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Loading people status */}
                {companyReport && companyPeople.length === 0 && companyStatus && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', marginTop: 16, borderRadius: 10, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 16 }}>✦</span>
                    <span style={{ fontSize: 13, color: '#7c3aed' }}>{companyStatus}</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* History panel */}
      {showHistory && (
        <HistoryPanel
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreHistory}
          onShare={(item) => { setShowHistory(false); setShareItem(item); }}
        />
      )}

      {/* Share modal */}
      {shareItem && (
        <ShareModal
          item={shareItem}
          onClose={() => setShareItem(null)}
          onTokenGenerated={(id, token) => {
            setShareItem(prev => prev ? { ...prev, share_token: token } : null);
          }}
        />
      )}
    </div>
  );
}

// ── Main Hub Page ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'customers', label: '客户', icon: 'building' },
  { id: 'ai-finder', label: 'AI 智搜', icon: 'robot' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function CustomerHubPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tenant } = useParams<{ tenant: string }>();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get('tab');
    return (TABS.find(x => x.id === t)?.id ?? 'customers') as TabId;
  });

  function switchTab(id: TabId) {
    setActiveTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    router.replace(url.pathname + url.search);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--notion-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 32px 0', background: 'var(--notion-card, white)', borderBottom: '1px solid var(--notion-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #4338ca, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><HandIcon name="building" size={18} /></div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--notion-text)', margin: 0 }}>客户中心</h1>
            <p style={{ fontSize: 13, color: 'var(--notion-text-muted)', margin: 0 }}>客户管理 · AI 智搜</p>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => router.push(`/${tenant}/crm`)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--notion-border)', background: 'none', cursor: 'pointer', color: 'var(--notion-text-muted)' }}>
            ← 返回线索管理
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 20px', fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 400,
                color: activeTab === tab.id ? '#7c3aed' : 'var(--notion-text-muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === tab.id ? '#7c3aed' : 'transparent'}`,
                marginBottom: -1, transition: 'all 0.15s',
              }}
            >
              <HandIcon name={tab.icon} size={14} />{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'customers' && <CustomersTab />}
      {activeTab === 'ai-finder' && <AIFinderTab />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(124,58,237,0.5); }
          70% { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
          100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
        }
      `}</style>
    </div>
  );
}
