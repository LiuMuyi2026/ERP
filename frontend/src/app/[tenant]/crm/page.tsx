'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import NotionTable, { Column } from '@/components/ui/NotionTable';
import SlideOver from '@/components/ui/SlideOver';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import LeadFilesTab from './components/LeadFilesTab';
// ── Types ─────────────────────────────────────────────────────────────────────
type Lead = {
  id: string; full_name: string; company?: string; email?: string;
  phone?: string; whatsapp?: string; status: string; source?: string;
  follow_up_status?: string; ai_summary?: string; assigned_to?: string;
  created_by?: string; created_at?: string; updated_at?: string; last_contacted_at?: string;
  is_cold?: boolean; cold_lead_reason?: string;
  custom_fields?: Record<string, any>;
};
type Contract = {
  id: string; contract_no: string; account_name?: string; status: string;
  payment_method?: string; contract_amount: number; currency: string;
  task_total: number; task_done: number; approvals_pending: number;
  receivable_outstanding: number; payable_outstanding: number;
};
type Receivable = {
  id: string; contract_id: string; contract_no: string; due_date?: string;
  amount: number; received_amount: number; currency: string; status: string;
  invoice_no?: string; lead_name?: string; assigned_name?: string;
  lead_id?: string; assigned_to?: string;
};
type ReceivablePayment = {
  id: string; receivable_id: string; amount: number; payment_date?: string;
  payment_proof_url?: string; payment_proof_name?: string; notes?: string;
  created_by_name?: string; created_at?: string;
};
type PendingApproval = {
  id: string; contract_no: string; action: string;
  required_approver: string; reason: string; requested_at: string;
};
type Overview = {
  leads_open: number; accounts_active: number; contracts_total: number;
  orders_running: number; approvals_pending: number; receivable_outstanding: number;
  payable_outstanding: number;
};
type TenantUser = { id: string; email: string; full_name: string | null; role: string; position_name?: string | null };
type TrendPoint = { period: string; count: number };
type ViewScope = { type: 'all' } | { type: 'user'; userId: string; userName: string };
type KpiPanelType = 'leads_open' | 'accounts_active' | 'contracts_total'
  | 'orders_running' | 'approvals_pending' | 'receivable_outstanding' | 'payable_outstanding';
type Payable = {
  id: string; contract_id: string; contract_no: string; due_date?: string;
  amount: number; paid_amount: number; currency: string; status: string;
  invoice_no?: string; supplier_name?: string; assigned_name?: string;
};

// ── Funnel stages (6-stage workflow) ──────────────────────────────────────
type FunnelStage = { key: string; labelKey: string; icon: string; color: string; bg: string };
const FUNNEL_STAGE_DEFS: FunnelStage[] = [
  { key: 'sales',       labelKey: 'stageSales',       icon: 'briefcase', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'contract',    labelKey: 'stageContract',    icon: 'document-pen', color: '#0284c7', bg: '#e0f2fe' },
  { key: 'procurement', labelKey: 'stageProcurement', icon: 'factory', color: '#c2410c', bg: '#fff7ed' },
  { key: 'booking',     labelKey: 'stageBooking',     icon: 'ship', color: '#15803d', bg: '#f0fdf4' },
  { key: 'shipping',    labelKey: 'stageShipping',    icon: 'package', color: '#d97706', bg: '#fffbeb' },
  { key: 'collection',  labelKey: 'stageCollection',  icon: 'money-bag', color: '#059669', bg: '#d1fae5' },
];

type ResolvedFunnelStage = { key: string; label: string; icon: string; color: string; bg: string };

function getFunnelStages(tCrm: any): ResolvedFunnelStage[] {
  return FUNNEL_STAGE_DEFS.map(s => ({
    ...s,
    label: tCrm(s.labelKey as any) ?? s.labelKey,
  }));
}

// Module-level reference for non-i18n uses (STATUS_TO_FUNNEL mapping etc.)
const FUNNEL_STAGES = FUNNEL_STAGE_DEFS;

// Map all lead statuses → funnel stage key
const STATUS_TO_FUNNEL: Record<string, string> = {
  // 销售洽谈
  inquiry: 'sales', new: 'sales', replied: 'sales',
  engaged: 'sales', qualified: 'sales', contacted: 'sales',
  // 签定合同
  quoted: 'contract', negotiating: 'contract',
  // 采购流程
  procuring: 'procurement',
  // 订舱流程
  booking: 'booking',
  // 发货流程
  fulfillment: 'shipping',
  // 回款结算
  payment: 'collection', converted: 'collection',
};

function getLeadStatusOptions(tCrm: any) {
  return [
    // Stage 1
    { value: 'inquiry',     label: tCrm('statusInquiry'),     group: tCrm('groupSales') },
    { value: 'replied',     label: tCrm('statusReplied'),     group: tCrm('groupSales') },
    { value: 'qualified',   label: tCrm('statusQualified'),   group: tCrm('groupSales') },
    // Stage 2
    { value: 'quoted',      label: tCrm('statusQuoted'),      group: tCrm('groupContract') },
    { value: 'negotiating', label: tCrm('statusNegotiating'), group: tCrm('groupContract') },
    // Stage 3
    { value: 'procuring',   label: tCrm('statusProcuring'),   group: tCrm('groupProcurement') },
    // Stage 4
    { value: 'booking',     label: tCrm('statusBooking'),     group: tCrm('groupBooking') },
    // Stage 5
    { value: 'fulfillment', label: tCrm('statusFulfillment'), group: tCrm('groupShipping') },
    // Stage 6
    { value: 'payment',     label: tCrm('statusPayment'),     group: tCrm('groupCollection') },
    { value: 'converted',   label: tCrm('statusConverted'),   group: tCrm('groupCollection') },
    // Other
    { value: 'cold',        label: tCrm('statusCold'),        group: tCrm('groupOther') },
    { value: 'lost',        label: tCrm('statusLost'),        group: tCrm('groupOther') },
  ];
}

const LEAD_STATUS_COLORS: Record<string, string> = {
  inquiry:     'bg-indigo-100 text-indigo-700',
  new:         'bg-indigo-100 text-indigo-700',
  replied:     'bg-teal-100 text-teal-700',
  engaged:     'bg-teal-100 text-teal-700',
  qualified:   'bg-purple-100 text-purple-700',
  contacted:   'bg-teal-100 text-teal-700',
  quoted:      'bg-sky-100 text-sky-700',
  negotiating: 'bg-blue-100 text-blue-700',
  procuring:   'bg-orange-100 text-orange-700',
  booking:     'bg-green-100 text-green-700',
  fulfillment: 'bg-amber-100 text-amber-700',
  payment:     'bg-emerald-100 text-emerald-700',
  converted:   'bg-green-100 text-green-800',
  cold:        'bg-gray-100 text-gray-500',
  lost:        'bg-gray-100 text-gray-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(period: string, granularity: string): string {
  try {
    const d = new Date(period);
    if (granularity === 'month') return d.toLocaleDateString('zh-CN', { year: '2-digit', month: 'short' });
    if (granularity === 'week') return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch { return period; }
}

// ── SimpleBarChart ────────────────────────────────────────────────────────────
function SimpleBarChart({ data, color, granularity, noDataText }: {
  data: TrendPoint[]; color: string; granularity: string; noDataText?: string;
}) {
  if (!data.length) return (
    <div className="h-28 flex items-center justify-center text-sm" style={{ color: '#C2C0BC' }}>{noDataText ?? 'No data'}</div>
  );
  const max = Math.max(...data.map(d => d.count), 1);
  const show = data.slice(-30);
  return (
    <div className="flex items-end gap-0.5 h-28 px-1">
      {show.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1 min-w-0 group">
          {d.count > 0 && (
            <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color }}>
              {d.count}
            </span>
          )}
          <div className="w-full rounded-t-sm transition-all" title={`${fmt(d.period, granularity)}: ${d.count}`}
            style={{ height: `${Math.max(2, (d.count / max) * 76)}px`, background: d.count > 0 ? color : '#E3E2E0', opacity: d.count > 0 ? 1 : 0.4 }} />
          {(show.length <= 14 || i % Math.ceil(show.length / 8) === 0) && (
            <span className="text-[8px] truncate w-full text-center" style={{ color: '#9B9A97' }}>
              {fmt(d.period, granularity)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── FunnelChart ───────────────────────────────────────────────────────────────
function FunnelChart({ statusCounts, onStageClick, resolvedStages, filterTitle, viewText }: {
  statusCounts: Record<string, number>;
  onStageClick?: (key: string) => void;
  resolvedStages: ResolvedFunnelStage[];
  filterTitle?: (stage: string, count: number) => string;
  viewText?: string;
}) {
  // Aggregate statuses into the 6 funnel stage keys
  const aggregated: Record<string, number> = {};
  for (const [status, count] of Object.entries(statusCounts)) {
    const key = STATUS_TO_FUNNEL[status] ?? status;
    aggregated[key] = (aggregated[key] ?? 0) + count;
  }

  const stages = resolvedStages.map(s => ({ ...s, count: aggregated[s.key] ?? 0 }));
  const top = Math.max(...stages.map(s => s.count), 1);
  const totalAll = stages.reduce((s, st) => s + st.count, 0);

  return (
    <div className="space-y-2 py-2">
      {stages.map((stage, i) => {
        const widthPct = Math.max(10, (stage.count / top) * 100);
        const pct = totalAll > 0 ? ((stage.count / totalAll) * 100).toFixed(0) : '0';
        return (
          <div key={stage.key} className="flex items-center gap-3 group/row">
            {/* Stage icon + label */}
            <div className="flex items-center gap-1.5 flex-shrink-0 w-28">
              <HandIcon name={stage.icon} size={14} style={{ color: '#5F5E5B' }} />
              <span className="text-xs font-medium" style={{ color: '#5F5E5B' }}>{stage.label}</span>
            </div>
            {/* Bar */}
            <div className="flex-1 flex items-center gap-2">
              <div
                className="rounded-md h-8 flex items-center px-3 transition-all duration-500 cursor-pointer"
                style={{
                  width: `${widthPct}%`,
                  background: stage.count === 0 ? '#E3E2E0' : stage.color,
                  minWidth: 44,
                  opacity: stage.count === 0 ? 0.45 : 1,
                }}
                onClick={() => stage.count > 0 && onStageClick?.(stage.key)}
                title={onStageClick && stage.count > 0 ? (filterTitle?.(stage.label, stage.count) ?? `${stage.label}: ${stage.count}`) : undefined}
              >
                <span className="text-xs font-bold text-white">{stage.count}</span>
                {onStageClick && stage.count > 0 && (
                  <span className="ml-1.5 text-[9px] text-white/70 opacity-0 group-hover/row:opacity-100 transition-opacity">→ {viewText ?? 'View'}</span>
                )}
              </div>
              <span className="text-[10px] flex-shrink-0 w-8 text-right" style={{ color: '#9B9A97' }}>{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── KPI Detail Panel (right-side drawer) ──────────────────────────────────────
const KPI_META: Record<KpiPanelType, { title: string; accent: string }> = {
  leads_open: { title: '线索池', accent: '#7c3aed' },
  accounts_active: { title: '活跃客户', accent: '#0284c7' },
  contracts_total: { title: '合同列表', accent: '#059669' },
  orders_running: { title: '履约进行中', accent: '#d97706' },
  approvals_pending: { title: '待审批', accent: '#dc2626' },
  receivable_outstanding: { title: '待收款', accent: '#c2410c' },
  payable_outstanding: { title: '待付款', accent: '#15803d' },
};

function KpiDetailPanel({ type, onClose, viewScope }: {
  type: KpiPanelType;
  onClose: () => void;
  viewScope: ViewScope;
}) {
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const meta = KPI_META[type];
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);

  useEffect(() => {
    const qs = viewScope.type === 'user' ? `?user_id=${viewScope.userId}` : '';
    const amp = viewScope.type === 'user' ? `&user_id=${viewScope.userId}` : '';
    setLoading(true);
    (async () => {
      try {
        if (type === 'leads_open' || type === 'accounts_active') {
          const d = await api.get(`/api/crm/leads${qs ? qs + '&' : '?'}limit=500`);
          setLeads(Array.isArray(d) ? d : []);
        } else if (type === 'contracts_total' || type === 'orders_running') {
          const d = await api.get(`/api/crm/contracts${qs ? qs + '&' : '?'}limit=200`);
          setContracts(Array.isArray(d) ? d : []);
        } else if (type === 'approvals_pending') {
          const d = await api.get('/api/crm/risks/pending-approvals');
          setApprovals(Array.isArray(d) ? d : []);
        } else if (type === 'receivable_outstanding') {
          const d = await api.get(`/api/crm/receivables${qs}`);
          setReceivables(Array.isArray(d) ? d : []);
        } else if (type === 'payable_outstanding') {
          const d = await api.get(`/api/crm/payables${qs}`);
          setPayables(Array.isArray(d) ? d : []);
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [type, viewScope]);

  function goToLead(id: string) {
    router.push(`/${params.tenant}/crm/customer-360/${id}`);
  }

  function renderContent() {
    if (loading) return <div className="h-40 flex items-center justify-center text-sm" style={{ color: '#9B9A97' }}>加载中...</div>;

    switch (type) {
      case 'leads_open': {
        const filtered = leads.filter(l =>
          !['converted', 'lost'].includes(l.status) && !l.is_cold &&
          (!search || l.full_name?.toLowerCase().includes(search.toLowerCase()) || l.company?.toLowerCase().includes(search.toLowerCase()))
        );
        return (
          <div className="space-y-1">
            {filtered.map(lead => (
              <div key={lead.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = '#e9d5ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                onClick={() => goToLead(lead.id)}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: meta.accent }}>
                  {(lead.full_name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{lead.full_name}</span>
                    {lead.company && <span className="text-xs truncate" style={{ color: '#9B9A97' }}>· {lead.company}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${LEAD_STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {lead.status}
                    </span>
                    <span className="text-[10px]" style={{ color: '#C2C0BC' }}>
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : ''}
                    </span>
                  </div>
                </div>
                <svg className="opacity-0 group-hover:opacity-100 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-sm text-center py-8" style={{ color: '#9B9A97' }}>暂无数据</div>}
          </div>
        );
      }
      case 'accounts_active': {
        const filtered = leads.filter(l =>
          l.last_contacted_at && new Date(l.last_contacted_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) &&
          (!search || l.full_name?.toLowerCase().includes(search.toLowerCase()) || l.company?.toLowerCase().includes(search.toLowerCase()))
        ).sort((a, b) => new Date(b.last_contacted_at!).getTime() - new Date(a.last_contacted_at!).getTime());
        return (
          <div className="space-y-1">
            {filtered.map(lead => (
              <div key={lead.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f0f9ff'; e.currentTarget.style.borderColor = '#bae6fd'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                onClick={() => goToLead(lead.id)}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: meta.accent }}>
                  {(lead.full_name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block" style={{ color: 'var(--notion-text)' }}>{lead.full_name}</span>
                  <span className="text-[10px]" style={{ color: '#9B9A97' }}>
                    最近联系: {new Date(lead.last_contacted_at!).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    {lead.company ? ` · ${lead.company}` : ''}
                  </span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-sm text-center py-8" style={{ color: '#9B9A97' }}>暂无活跃客户</div>}
          </div>
        );
      }
      case 'contracts_total': {
        const filtered = contracts.filter(c =>
          !search || c.contract_no?.toLowerCase().includes(search.toLowerCase()) || c.account_name?.toLowerCase().includes(search.toLowerCase())
        );
        return (
          <div className="space-y-1">
            {filtered.map(c => (
              <div key={c.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.borderColor = '#bbf7d0'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: meta.accent }}>
                  {c.contract_no?.[0] ?? '#'}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block font-mono" style={{ color: 'var(--notion-text)' }}>{c.contract_no}</span>
                  <span className="text-[10px]" style={{ color: '#9B9A97' }}>
                    {c.account_name ?? '—'} · {c.currency} {Number(c.contract_amount).toLocaleString()}
                  </span>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  c.status === 'active' ? 'bg-green-100 text-green-700' : c.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'
                }`}>{c.status}</span>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-sm text-center py-8" style={{ color: '#9B9A97' }}>暂无合同</div>}
          </div>
        );
      }
      case 'orders_running': {
        const running = contracts.filter(c =>
          c.task_total > 0 && c.task_done < c.task_total &&
          (!search || c.contract_no?.toLowerCase().includes(search.toLowerCase()))
        );
        return (
          <div className="space-y-1">
            {running.map(c => {
              const pct = c.task_total > 0 ? Math.round((c.task_done / c.task_total) * 100) : 0;
              return (
                <div key={c.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                  style={{ border: '1px solid transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fffbeb'; e.currentTarget.style.borderColor = '#fde68a'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: meta.accent }}>
                    {pct}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold truncate block font-mono" style={{ color: 'var(--notion-text)' }}>{c.contract_no}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: '#e5e7eb' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.accent }} />
                      </div>
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#9B9A97' }}>{c.task_done}/{c.task_total}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {running.length === 0 && <div className="text-sm text-center py-8" style={{ color: '#9B9A97' }}>暂无进行中的履约</div>}
          </div>
        );
      }
      case 'approvals_pending': {
        return (
          <div className="space-y-1">
            {approvals.map(a => (
              <div key={a.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: meta.accent }}>!</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block font-mono" style={{ color: 'var(--notion-text)' }}>{a.contract_no}</span>
                  <span className="text-[10px]" style={{ color: '#9B9A97' }}>
                    {a.action} · 审批人: {a.required_approver}
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: '#C2C0BC' }}>
                  {a.requested_at ? new Date(a.requested_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
            {approvals.length === 0 && <div className="text-sm text-center py-8" style={{ color: '#9B9A97' }}>暂无待审批</div>}
          </div>
        );
      }
      case 'receivable_outstanding': {
        const open = receivables.filter(r =>
          r.status !== 'closed' && r.status !== 'paid' &&
          (!search || r.contract_no?.toLowerCase().includes(search.toLowerCase()) || r.invoice_no?.toLowerCase().includes(search.toLowerCase()))
        );
        return (
          <div className="space-y-1">
            {open.map(r => {
              const outstanding = Number(r.amount) - Number(r.received_amount);
              return (
                <div key={r.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                  style={{ border: '1px solid transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.borderColor = '#fed7aa'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: meta.accent }}>$</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate font-mono" style={{ color: 'var(--notion-text)' }}>{r.contract_no}</span>
                      {r.invoice_no && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100" style={{ color: '#9B9A97' }}>{r.invoice_no}</span>}
                    </div>
                    <span className="text-[10px]" style={{ color: '#9B9A97' }}>
                      应收 {r.currency} {Number(r.amount).toLocaleString()} · 已收 {Number(r.received_amount).toLocaleString()} · <b style={{ color: meta.accent }}>欠款 {outstanding.toLocaleString()}</b>
                    </span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    r.status === 'overdue' ? 'bg-red-100 text-red-700' : r.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
                  }`}>{r.status}</span>
                </div>
              );
            })}
            {open.length === 0 && <div className="text-sm text-center py-8" style={{ color: '#9B9A97' }}>暂无待收款</div>}
          </div>
        );
      }
      case 'payable_outstanding': {
        const open = payables.filter(p =>
          p.status !== 'paid' &&
          (!search || p.contract_no?.toLowerCase().includes(search.toLowerCase()) || p.supplier_name?.toLowerCase().includes(search.toLowerCase()))
        );
        return (
          <div className="space-y-1">
            {open.map(p => {
              const outstanding = Number(p.amount) - Number(p.paid_amount);
              return (
                <div key={p.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                  style={{ border: '1px solid transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.borderColor = '#bbf7d0'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: meta.accent }}>$</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate font-mono" style={{ color: 'var(--notion-text)' }}>{p.contract_no}</span>
                      {p.supplier_name && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100" style={{ color: '#9B9A97' }}>{p.supplier_name}</span>}
                    </div>
                    <span className="text-[10px]" style={{ color: '#9B9A97' }}>
                      应付 {p.currency} {Number(p.amount).toLocaleString()} · 已付 {Number(p.paid_amount).toLocaleString()} · <b style={{ color: meta.accent }}>欠款 {outstanding.toLocaleString()}</b>
                    </span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    p.status === 'overdue' ? 'bg-red-100 text-red-700' : p.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
                  }`}>{p.status}</span>
                </div>
              );
            })}
            {open.length === 0 && <div className="text-sm text-center py-8" style={{ color: '#9B9A97' }}>暂无待付款</div>}
          </div>
        );
      }
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full z-[90] flex flex-col"
        style={{ width: 640, background: 'var(--notion-card, white)', borderLeft: '1px solid var(--notion-border)', boxShadow: '-6px 0 32px rgba(0,0,0,0.10)' }}>
        {/* Accent bar + Header */}
        <div className="flex-shrink-0" style={{ height: 3, background: meta.accent }} />
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
          <span className="font-bold text-base flex-1" style={{ color: 'var(--notion-text)' }}>{meta.title}</span>
          {viewScope.type === 'user' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              {viewScope.userName}
            </span>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: '#9B9A97' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#37352F'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {/* Search */}
        {['leads_open', 'accounts_active', 'contracts_total', 'receivable_outstanding', 'payable_outstanding'].includes(type) && (
          <div className="px-5 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--notion-border)' }}>
            <input
              type="text"
              placeholder="搜索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
            />
          </div>
        )}
        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {renderContent()}
        </div>
      </div>
    </>
  );
}

// ── CRM Dashboard Tab ─────────────────────────────────────────────────────────
type Scope = 'all' | 'mine';
type TrendPeriod = 'day' | 'week' | 'month';
type FunnelPeriod = 'all' | 'week' | 'month' | 'year';

function ScopePicker({ value, onChange, labels }: { value: Scope; onChange: (v: Scope) => void; labels: [string, string] }) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-md" style={{ background: 'var(--notion-active)' }}>
      {([['all', labels[0]], ['mine', labels[1]]] as [Scope, string][]).map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className="px-2.5 py-1 rounded text-xs font-medium transition-all"
          style={{
            background: value === v ? 'white' : 'transparent',
            color: value === v ? 'var(--notion-text)' : 'var(--notion-text-muted)',
            boxShadow: value === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>
          {l}
        </button>
      ))}
    </div>
  );
}

function PeriodPicker<T extends string>({ value, options, onChange }: {
  value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-md" style={{ background: 'var(--notion-active)' }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className="px-2.5 py-1 rounded text-xs font-medium transition-all"
          style={{
            background: value === v ? 'white' : 'transparent',
            color: value === v ? 'var(--notion-text)' : 'var(--notion-text-muted)',
            boxShadow: value === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>
          {l}
        </button>
      ))}
    </div>
  );
}

function DashboardCard({ title, children, right, onViewList, accentColor, viewListText, clickDetailsText }: {
  title: string; children: React.ReactNode; right?: React.ReactNode;
  onViewList?: () => void; accentColor?: string; viewListText?: string; clickDetailsText?: string;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{title}</span>
        <div className="flex items-center gap-2">
          {right}
          {onViewList && (
            <button onClick={onViewList}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md transition-all"
              style={{ color: accentColor ?? '#7c3aed', background: `${accentColor ?? '#7c3aed'}14` }}
              onMouseEnter={e => (e.currentTarget.style.background = `${accentColor ?? '#7c3aed'}24`)}
              onMouseLeave={e => (e.currentTarget.style.background = `${accentColor ?? '#7c3aed'}14`)}>
              {viewListText ?? 'View List'}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}
        </div>
      </div>
      <div
        className={onViewList ? 'relative group/chart cursor-pointer' : ''}
        onClick={onViewList}
      >
        <div className="px-5 py-4">{children}</div>
        {onViewList && (
          <div className="absolute inset-0 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.55)' }}>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full text-white shadow"
              style={{ background: accentColor ?? '#7c3aed' }}>
              {clickDetailsText ?? 'Click for details'} →
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── InquiryPanel (right-side drawer) ─────────────────────────────────────────
type InquiryPanelView = 'list' | 'card' | 'kanban' | 'table';

function InquiryPanel({ type, leads, loading, view, onViewChange, onClose }: {
  type: 'new' | 'unfollowed';
  leads: Lead[]; loading: boolean;
  view: InquiryPanelView; onViewChange: (v: InquiryPanelView) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const LEAD_STATUS_OPTIONS = getLeadStatusOptions(tCrm);
  const FUNNEL_STAGES_RESOLVED = getFunnelStages(tCrm);
  const title = type === 'new' ? tCrm('newInquiry') : tCrm('pendingInquiry');
  const accent = type === 'new' ? '#60a5fa' : '#f97316';

  const VIEWS: [InquiryPanelView, string, string][] = [
    ['list',   '☰', tCrm('listView')],
    ['card',   '⊞', tCrm('cardView')],
    ['kanban', '⋮⋮', tCrm('kanbanView')],
    ['table',  '▤',  tCrm('tableView')],
  ];

  function goTo(id: string) {
    router.push(`/${params.tenant}/crm/customer-360/${id}`);
  }

  function statusBadge(status: string) {
    const opt = LEAD_STATUS_OPTIONS.find(o => o.value === status);
    const cls = LEAD_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
        {opt?.label ?? status}
      </span>
    );
  }

  function renderList() {
    return (
      <div className="space-y-1">
        {leads.map(lead => {
          const fStage = FUNNEL_STAGES_RESOLVED.find(s => s.key === (STATUS_TO_FUNNEL[lead.status] ?? lead.status));
          const updatedAt = lead.updated_at ? new Date(lead.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
          return (
            <div key={lead.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group"
              style={{ border: '1px solid transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f7f6f3'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
              onClick={() => goTo(lead.id)}>
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ background: fStage?.color ?? '#9B9A97' }}>
                {(lead.full_name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{lead.full_name}</span>
                  {lead.company && <span className="text-xs truncate" style={{ color: '#9B9A97' }}>· {lead.company}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {statusBadge(lead.status)}
                  <span className="text-[10px]" style={{ color: '#C2C0BC' }}>{updatedAt}</span>
                </div>
              </div>
              <svg className="opacity-0 group-hover:opacity-100 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          );
        })}
      </div>
    );
  }

  function renderCard() {
    return (
      <div className="grid grid-cols-2 gap-3">
        {leads.map(lead => {
          const fStage = FUNNEL_STAGES_RESOLVED.find(s => s.key === (STATUS_TO_FUNNEL[lead.status] ?? lead.status));
          const updatedAt = lead.updated_at ? new Date(lead.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
          return (
            <div key={lead.id}
              className="rounded-xl p-4 cursor-pointer transition-all"
              style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = fStage?.color ?? accent; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
              onClick={() => goTo(lead.id)}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: fStage?.color ?? '#9B9A97' }}>
                  {(lead.full_name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{lead.full_name}</p>
                  {lead.company && <p className="text-[11px] truncate" style={{ color: '#9B9A97' }}>{lead.company}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between">
                {statusBadge(lead.status)}
                {updatedAt && <span className="text-[10px]" style={{ color: '#C2C0BC' }}>{updatedAt}</span>}
              </div>
              {lead.source && (
                <p className="text-[10px] mt-2 truncate" style={{ color: '#9B9A97' }}>{tCrm('sourceLabel')}: {lead.source}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderKanban() {
    // Group only the inquiry-relevant stages
    const relevantStages = FUNNEL_STAGES_RESOLVED.slice(0, 4); // sales, contract, procurement, booking
    const byStage: Record<string, Lead[]> = {};
    for (const s of relevantStages) byStage[s.key] = [];
    for (const l of leads) {
      const key = STATUS_TO_FUNNEL[l.status] ?? l.status;
      if (byStage[key]) byStage[key].push(l);
      else (byStage['sales'] ??= []).push(l);
    }
    return (
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 400 }}>
        {relevantStages.map(stage => {
          const cards = byStage[stage.key] ?? [];
          return (
            <div key={stage.key} className="flex-shrink-0 flex flex-col rounded-xl overflow-hidden"
              style={{ width: 200, border: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ background: stage.bg, borderBottom: `1px solid ${stage.color}22` }}>
                <div className="flex items-center gap-1.5">
                  <HandIcon name={stage.icon} size={14} style={{ color: stage.color }} />
                  <span className="text-xs font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                </div>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${stage.color}22`, color: stage.color }}>{cards.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {cards.map(lead => (
                  <div key={lead.id}
                    className="bg-white rounded-lg px-3 py-2.5 cursor-pointer transition-all"
                    style={{ border: '1px solid var(--notion-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                    onClick={() => goTo(lead.id)}>
                    <p className="text-xs font-semibold mb-1 truncate" style={{ color: 'var(--notion-text)' }}>{lead.full_name}</p>
                    {lead.company && <p className="text-[10px] truncate mb-1" style={{ color: '#9B9A97' }}>{lead.company}</p>}
                    {statusBadge(lead.status)}
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="text-[11px] text-center py-4" style={{ color: '#C2C0BC' }}>{tCrm('noItems')}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderTable() {
    return (
      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--notion-border)' }}>
        <table className="w-full text-xs border-collapse min-w-[560px]">
          <thead>
            <tr style={{ background: 'var(--notion-hover)', borderBottom: '1px solid var(--notion-border)' }}>
              {[tCrm('contact'), tCrm('company'), tCrm('businessStage'), tCrm('sourceCol'), tCrm('followUpCol'), tCrm('updateTime')].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: '#5F5E5B' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => {
              const updatedAt = lead.updated_at ? new Date(lead.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
              const fStage = FUNNEL_STAGES_RESOLVED.find(s => s.key === (STATUS_TO_FUNNEL[lead.status] ?? lead.status));
              return (
                <tr key={lead.id}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid var(--notion-border)', background: i % 2 === 0 ? 'white' : 'var(--notion-hover)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F3F2EF')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'white' : 'var(--notion-hover)')}
                  onClick={() => goTo(lead.id)}>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: '#7c3aed' }}>{lead.full_name}</td>
                  <td className="px-4 py-2.5" style={{ color: '#5F5E5B' }}>{lead.company || <span style={{ color: '#C2C0BC' }}>—</span>}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {fStage && <HandIcon name={fStage.icon} size={14} />}
                      {statusBadge(lead.status)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: '#5F5E5B' }}>{lead.source || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${lead.follow_up_status === 'done' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {lead.follow_up_status === 'done' ? tCrm('followed') : tCrm('pendingStatus')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: '#9B9A97' }}>{updatedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[80] bg-black/20" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full z-[90] flex flex-col"
        style={{ width: 640, background: 'var(--notion-card, white)', borderLeft: '1px solid var(--notion-border)', boxShadow: '-6px 0 32px rgba(0,0,0,0.10)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: accent }} />
          <span className="font-bold text-base flex-1" style={{ color: 'var(--notion-text)' }}>{title}</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: accent }}>{tCrm('items', { n: leads.length })}</span>
          {/* View mode switcher */}
          <div className="flex gap-0.5 p-0.5 rounded-md" style={{ background: 'var(--notion-active)' }}>
            {VIEWS.map(([v, icon, label]) => (
              <button key={v} onClick={() => onViewChange(v)}
                className="px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1"
                style={{
                  background: view === v ? 'white' : 'transparent',
                  color: view === v ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                  boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: '#9B9A97' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#37352F'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-sm" style={{ color: '#9B9A97' }}>{tCrm('loadingText')}</div>
          ) : leads.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2">
              <span className="text-3xl">{type === 'new' ? <HandIcon name="mailbox" size={32} /> : <HandIcon name="checkmark" size={32} />}</span>
              <span className="text-sm" style={{ color: '#9B9A97' }}>{type === 'new' ? tCrm('noNewInquiry') : tCrm('noPendingInquiry')}</span>
            </div>
          ) : view === 'list' ? renderList()
            : view === 'card' ? renderCard()
            : view === 'kanban' ? renderKanban()
            : renderTable()}
        </div>
      </div>
    </>
  );
}

function CRMDashboardTab({ onStageClick, globalScope }: { onStageClick?: (key: string) => void; globalScope?: ViewScope }) {
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const FUNNEL_STAGES_RESOLVED = getFunnelStages(tCrm);
  const [scope, setScope] = useState<Scope>('all');
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('day');
  const [unfPeriod, setUnfPeriod] = useState<TrendPeriod>('day');
  const [funnelPeriod, setFunnelPeriod] = useState<FunnelPeriod>('month');

  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [unf, setUnf] = useState<TrendPoint[]>([]);
  const [funnel, setFunnel] = useState<Record<string, number>>({});

  const [trendLoading, setTrendLoading] = useState(false);
  const [unfLoading, setUnfLoading] = useState(false);
  const [funnelLoading, setFunnelLoading] = useState(false);

  // Build scope query param from globalScope
  const scopeQs = globalScope?.type === 'user' ? `&user_id=${globalScope.userId}` : '';

  // Todo state
  type TodoItem = { lead_id: string; full_name: string; company?: string; status: string; type: string; days_since?: number };
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const router = useRouter();
  const params = useParams<{ tenant: string }>();

  useEffect(() => {
    setTodosLoading(true);
    api.get('/api/crm/todos')
      .then(d => setTodos(d?.todos ?? []))
      .catch(() => setTodos([]))
      .finally(() => setTodosLoading(false));
  }, []);

  // Inquiry panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelType, setPanelType] = useState<'new' | 'unfollowed'>('new');
  const [panelLeads, setPanelLeads] = useState<Lead[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelView, setPanelView] = useState<InquiryPanelView>('list');

  async function openPanel(type: 'new' | 'unfollowed') {
    setPanelType(type);
    setPanelOpen(true);
    setPanelLoading(true);
    try {
      const qs = globalScope?.type === 'user' ? `?user_id=${globalScope.userId}` : '';
      const allLeads: Lead[] = await api.get(`/api/crm/leads${qs}`);
      if (type === 'new') {
        setPanelLeads([...allLeads].sort((a, b) =>
          new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
        ));
      } else {
        setPanelLeads(allLeads.filter(l => l.follow_up_status !== 'done'));
      }
    } catch { setPanelLeads([]); }
    finally { setPanelLoading(false); }
  }

  const granMap: Record<TrendPeriod, string> = { day: 'day', week: 'week', month: 'month' };

  // Effective scope: if globalScope specifies a user, use user_id; otherwise fall back to internal scope picker
  const effectiveScope = globalScope?.type === 'user' ? 'all' : scope;

  useEffect(() => {
    setTrendLoading(true);
    api.get(`/api/crm/analytics/leads-trend?period=${trendPeriod}&scope=${effectiveScope}${scopeQs}`)
      .then(d => setTrend(Array.isArray(d) ? d : []))
      .finally(() => setTrendLoading(false));
  }, [trendPeriod, effectiveScope, scopeQs]);

  useEffect(() => {
    setUnfLoading(true);
    api.get(`/api/crm/analytics/unfollowed?period=${unfPeriod}&scope=${effectiveScope}${scopeQs}`)
      .then(d => setUnf(Array.isArray(d) ? d : []))
      .finally(() => setUnfLoading(false));
  }, [unfPeriod, effectiveScope, scopeQs]);

  useEffect(() => {
    setFunnelLoading(true);
    api.get(`/api/crm/analytics/funnel?period=${funnelPeriod}&scope=${effectiveScope}${scopeQs}`)
      .then(d => setFunnel(d?.leads ?? {}))
      .finally(() => setFunnelLoading(false));
  }, [funnelPeriod, effectiveScope, scopeQs]);

  const totalNew = trend.reduce((s, d) => s + d.count, 0);
  const totalUnf = unf.reduce((s, d) => s + d.count, 0);
  const totalFunnel = Object.values(funnel).reduce((s, v) => s + v, 0);
  const converted = funnel['converted'] ?? 0;
  const convRate = totalFunnel > 0 ? ((converted / totalFunnel) * 100).toFixed(1) : '0.0';

  const TREND_OPTS: [TrendPeriod, string][] = [['day', tCrm('day')], ['week', tCrm('week')], ['month', tCrm('month')]];
  const FUNNEL_OPTS: [FunnelPeriod, string][] = [['week', tCrm('week')], ['month', tCrm('month')], ['year', tCrm('year')], ['all', tCrm('all')]];

  return (
    <div className="space-y-5">
      {/* Global scope - hidden when parent provides a user-specific scope */}
      {(!globalScope || globalScope.type === 'all') && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: '#9B9A97' }}>{tCrm('dataScope')}</span>
          <ScopePicker value={scope} onChange={setScope} labels={[tCrm('allData'), tCrm('myData')]} />
        </div>
      )}

      {/* Todo section */}
      {todos.length > 0 && (
        <DashboardCard
          title={tCrm('todoTitle')}
          accentColor="#ef4444"
          right={<span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#ef4444' }}>{todos.length}</span>}
        >
          <div className="space-y-1 max-h-[280px] overflow-y-auto">
            {todos.map(todo => {
              const fStage = FUNNEL_STAGES_RESOLVED.find(s => s.key === (STATUS_TO_FUNNEL[todo.status] ?? todo.status));
              const statusOpt = getLeadStatusOptions(tCrm).find(o => o.value === todo.status);
              const cls = LEAD_STATUS_COLORS[todo.status] ?? 'bg-gray-100 text-gray-500';
              return (
                <div key={todo.lead_id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group"
                  style={{ border: '1px solid transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                  onClick={() => router.push(`/${params.tenant}/crm/customer-360/${todo.lead_id}`)}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: fStage?.color ?? '#ef4444' }}>
                    {(todo.full_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{todo.full_name}</span>
                      {todo.company && <span className="text-xs truncate" style={{ color: '#9B9A97' }}>· {todo.company}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
                        {statusOpt?.label ?? todo.status}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600">
                        {todo.type === 'pending_followup'
                          ? tCrm('todoPendingFollowup')
                          : todo.days_since != null
                            ? tCrm('todoNoContact', { days: todo.days_since })
                            : tCrm('todoNoContactShort')}
                      </span>
                    </div>
                  </div>
                  <svg className="opacity-0 group-hover:opacity-100 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              );
            })}
          </div>
        </DashboardCard>
      )}

      {/* Row 1: New inquiries + Unfollowed */}
      <div className="grid grid-cols-2 gap-4">
        <DashboardCard
          title={tCrm('newInquiries')}
          accentColor="#60a5fa"
          onViewList={() => openPanel('new')}
          viewListText={tCrm('viewList')}
          clickDetailsText={tCrm('clickDetails')}
          right={
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: '#60a5fa' }}>{tCrm('items', { n: totalNew })}</span>
              <PeriodPicker value={trendPeriod} options={TREND_OPTS} onChange={setTrendPeriod} />
            </div>
          }
        >
          {trendLoading
            ? <div className="h-28 flex items-center justify-center text-xs" style={{ color: '#9B9A97' }}>{tCrm('loadingText')}</div>
            : <SimpleBarChart data={trend} color="#60a5fa" granularity={granMap[trendPeriod]} noDataText={tCrm('noDataYet')} />}
        </DashboardCard>

        <DashboardCard
          title={tCrm('unfollowedInquiries')}
          accentColor="#f97316"
          onViewList={() => openPanel('unfollowed')}
          viewListText={tCrm('viewList')}
          clickDetailsText={tCrm('clickDetails')}
          right={
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: '#f97316' }}>{tCrm('items', { n: totalUnf })}</span>
              <PeriodPicker value={unfPeriod} options={TREND_OPTS} onChange={setUnfPeriod} />
            </div>
          }
        >
          {unfLoading
            ? <div className="h-28 flex items-center justify-center text-xs" style={{ color: '#9B9A97' }}>{tCrm('loadingText')}</div>
            : <SimpleBarChart data={unf} color="#f97316" granularity={granMap[unfPeriod]} noDataText={tCrm('noDataYet')} />}
        </DashboardCard>
      </div>

      {/* Funnel */}
      <DashboardCard
        title={tCrm('businessFunnel')}
        right={
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: '#9B9A97' }}>
              {tCrm('total')} <b style={{ color: 'var(--notion-text)' }}>{totalFunnel}</b> · {tCrm('conversionRate')}
              <b style={{ color: '#0f9d58' }}> {convRate}%</b>
            </span>
            <PeriodPicker value={funnelPeriod} options={FUNNEL_OPTS} onChange={setFunnelPeriod} />
          </div>
        }
      >
        {funnelLoading
          ? <div className="h-40 flex items-center justify-center text-xs" style={{ color: '#9B9A97' }}>{tCrm('loadingText')}</div>
          : <FunnelChart statusCounts={funnel} onStageClick={onStageClick} resolvedStages={FUNNEL_STAGES_RESOLVED} filterTitle={(stage, count) => tCrm('filterStageLeads', { stage, count })} viewText={tCrm('viewLeads')} />}
      </DashboardCard>

      {/* Inquiry panel */}
      {panelOpen && (
        <InquiryPanel
          type={panelType}
          leads={panelLeads}
          loading={panelLoading}
          view={panelView}
          onViewChange={setPanelView}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

// ── Lead Modal (comprehensive) ────────────────────────────────────────────────
const EMPTY_LEAD = {
  // core
  full_name: '', first_name: '', last_name: '', email: '', phone: '', whatsapp: '',
  company: '', title: '', status: 'inquiry', source: 'Direct', source_channel: '',
  follow_up_status: 'pending', assigned_to: '',
  // contact info
  gender: '', country: '', city: '', region_province: '', instagram: '',
  social_platform: '', religion: '',
  // company info
  company_website: '', main_products: '', position: '', industry: '',
  // biz info
  customer_type: '', customer_grade: '',
  grade: '', product_category: '', required_products: '', end_usage: '',
  // commercial
  downstream_payment: '', competitor: '', annual_purchase: '', about_company: '',
  // CEO info
  ceo_name: '', ceo_hobbies: '', ceo_beliefs: '', ceo_personality: '', ceo_political_views: '',
  // usage & quality
  monthly_usage: '', quarterly_usage: '', industry_product_quality: '',
  // notes
  attack_notes: '', requirements_notes: '', contact_address: '', contact_notes: '',
  // mgmt
  tags: '',
};

type LeadFormState = typeof EMPTY_LEAD;

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

type DupCheck = { matches: { id: string; full_name: string; email?: string; status: string }[]; has_active: boolean };

function LeadModal({ users, onClose, onSave }: {
  users: TenantUser[];
  onClose: () => void;
  onSave: () => void;
}) {
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const LEAD_STATUS_OPTIONS = getLeadStatusOptions(tCrm);
  const SOURCE_CHANNELS = getSourceChannels(tCrm);
  const CUSTOMER_TYPES = getCustomerTypes(tCrm);
  const [form, setForm] = useState<LeadFormState>(() => {
    const me = getCurrentUser();
    return { ...EMPTY_LEAD, assigned_to: me?.sub || '' };
  });
  const [saving, setSaving] = useState(false);
  const [dupCheck, setDupCheck] = useState<DupCheck | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  const p = (k: Partial<LeadFormState>) => setForm(f => ({ ...f, ...k }));

  async function checkDuplicate() {
    const { full_name, email, whatsapp } = form;
    if (!full_name.trim() && !email.trim() && !whatsapp.trim()) return;
    setDupChecking(true);
    try {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) { alert(tCrm('pleaseEnterName')); return; }
    setSaving(true);
    try {
      const { full_name, email, phone, whatsapp, company, title, status, source,
              follow_up_status, assigned_to, ...rest } = form;
      const custom_fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v) custom_fields[k] = v;
      }
      await api.post('/api/crm/leads', {
        full_name, email: email || null, phone: phone || null,
        whatsapp: whatsapp || null, company: company || null,
        title: title || null, status, source, follow_up_status,
        assigned_to: assigned_to || null,
        custom_fields: Object.keys(custom_fields).length ? custom_fields : null,
      });
      onSave();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}>
      <div className="ml-auto h-full flex flex-col bg-white overflow-hidden" style={{ width: 680, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--notion-border)' }}>
          <span className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>{tCrm('modalTitle')}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: '#9B9A97' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-1">

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

          {/* ── Duplicate warning ── */}
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
                onBlur={checkDuplicate} />
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
          <button disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: '#7c3aed' }}
            onClick={async (e) => {
              e.preventDefault();
              if (!form.full_name.trim()) { alert(tCrm('pleaseEnterName')); return; }
              setSaving(true);
              try {
                const { full_name, email, phone, whatsapp, company, title, status, source,
                        follow_up_status, assigned_to, ...rest } = form;
                const custom_fields: Record<string, any> = {};
                for (const [k, v] of Object.entries(rest)) { if (v) custom_fields[k] = v; }
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
            {saving ? tCrm('savingText') : tCrm('createLeadBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grade & Channel color maps ────────────────────────────────────────────────
const GRADE_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#fef3c7', text: '#d97706' },
  B: { bg: '#dbeafe', text: '#1d4ed8' },
  C: { bg: '#f3f4f6', text: '#374151' },
  D: { bg: '#fce7f3', text: '#9d174d' },
  S: { bg: '#f0fdf4', text: '#166534' },
};

type ViewMode = 'table' | 'kanban' | 'card';
type GroupBy = 'none' | 'funnel_stage' | 'company' | 'assigned_to' | 'source_channel' | 'grade';
type SortOption = {
  key: string;
  label: string;
  fn: (a: Lead, b: Lead, userMap: Record<string, string>) => number;
};

const SORT_FNS: Record<string, (a: Lead, b: Lead, userMap: Record<string, string>) => number> = {
  newest:   (a, b) => b.id.localeCompare(a.id),
  oldest:   (a, b) => a.id.localeCompare(b.id),
  name_az:  (a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''),
  name_za:  (a, b) => (b.full_name ?? '').localeCompare(a.full_name ?? ''),
  company:  (a, b) => (a.company ?? '').localeCompare(b.company ?? ''),
  grade_hi: (a, b) => {
    const order = ['S','A','B','C','D',''];
    return order.indexOf(a.custom_fields?.lead_grade ?? '') - order.indexOf(b.custom_fields?.lead_grade ?? '');
  },
  grade_lo: (a, b) => {
    const order = ['S','A','B','C','D',''];
    return order.indexOf(b.custom_fields?.lead_grade ?? '') - order.indexOf(a.custom_fields?.lead_grade ?? '');
  },
  creator:  (a, b, m) => (m[a.created_by ?? ''] ?? '').localeCompare(m[b.created_by ?? ''] ?? ''),
};

function getSortOptions(tCrm: any): SortOption[] {
  return [
    { key: 'newest',   label: tCrm('sortNewest'),    fn: SORT_FNS.newest },
    { key: 'oldest',   label: tCrm('sortOldest'),    fn: SORT_FNS.oldest },
    { key: 'name_az',  label: tCrm('sortNameAZ'),    fn: SORT_FNS.name_az },
    { key: 'name_za',  label: tCrm('sortNameZA'),    fn: SORT_FNS.name_za },
    { key: 'company',  label: tCrm('sortCompanyAZ'), fn: SORT_FNS.company },
    { key: 'grade_hi', label: tCrm('sortGradeHigh'), fn: SORT_FNS.grade_hi },
    { key: 'grade_lo', label: tCrm('sortGradeLow'),  fn: SORT_FNS.grade_lo },
    { key: 'creator',  label: tCrm('sortCreatorAZ'), fn: SORT_FNS.creator },
  ];
}

function getSourceChannels(tCrm: any) {
  return ['LinkedIn', 'WhatsApp', tCrm('channelExhibition'), tCrm('channelWebsite'), tCrm('channelReferral'), tCrm('channelAd'), tCrm('channelColdCall'), tCrm('channelOther')];
}

function getCustomerTypes(tCrm: any) {
  return [tCrm('typeTrader'), tCrm('typeEndUser'), tCrm('typeManufacturer'), tCrm('typeDistributor'), tCrm('typeGovernment'), tCrm('typeOther')];
}

// ── Leads Tab ─────────────────────────────────────────────────────────────────
function LeadsTab({ leads, users, onCreateLead, defaultStatusFilter }: {
  leads: Lead[];
  users: TenantUser[];
  onCreateLead: () => void;
  defaultStatusFilter?: string;
}) {
  const params = useParams<{ tenant: string }>();
  const router = useRouter();
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const LEAD_STATUS_OPTIONS = useMemo(() => getLeadStatusOptions(tCrm), [tCrm]);
  const FUNNEL_STAGES_RESOLVED = useMemo(() => getFunnelStages(tCrm), [tCrm]);
  const SORT_OPTIONS = useMemo(() => getSortOptions(tCrm), [tCrm]);
  const SOURCE_CHANNELS = useMemo(() => getSourceChannels(tCrm), [tCrm]);
  const CUSTOMER_TYPES = useMemo(() => getCustomerTypes(tCrm), [tCrm]);

  // ── View & Sort ──
  const [viewMode, setViewMode]   = useState<ViewMode>('table');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [showGroupByMenu, setShowGroupByMenu] = useState(false);
  const groupByRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey]     = useState('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // ── Filters ──
  const [search,          setSearch]          = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // funnelStage: set by 业务漏斗 click (stage key like 'sales'); separate from individual status filter
  const [funnelStage,  setFunnelStage]  = useState<string>(defaultStatusFilter ?? '');
  // individual filter values
  const [fStatus,      setFStatus]      = useState<string[]>([]);
  const [fGrade,       setFGrade]       = useState<string[]>([]);
  const [fChannel,     setFChannel]     = useState<string[]>([]);
  const [fCustomerType,setFCustomerType]= useState<string[]>([]);
  const [fAssignedTo,  setFAssignedTo]  = useState<string[]>([]);
  const [fCreatedBy,   setFCreatedBy]   = useState<string[]>([]);
  const [fDateFrom,    setFDateFrom]    = useState('');
  const [fDateTo,      setFDateTo]      = useState('');

  useEffect(() => {
    setFunnelStage(defaultStatusFilter ?? '');
  }, [defaultStatusFilter]);

  // close menus on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setShowSortMenu(false);
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) setShowFilterPanel(false);
      if (groupByRef.current && !groupByRef.current.contains(e.target as Node)) setShowGroupByMenu(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const userMap = useMemo(
    () => Object.fromEntries(users.map(u => [u.id, (u.full_name || u.email) + (u.position_name ? ` (${u.position_name})` : '')])),
    [users],
  );

  const sortFn = useMemo(
    () => SORT_OPTIONS.find(o => o.key === sortKey)?.fn ?? SORT_OPTIONS[0].fn,
    [sortKey, SORT_OPTIONS],
  );

  const filtered = useMemo(() => {
    let data = leads.filter(l => {
      const q = search.toLowerCase();
      if (q && !l.full_name?.toLowerCase().includes(q) &&
               !l.company?.toLowerCase().includes(q) &&
               !l.email?.toLowerCase().includes(q)) return false;
      // 业务漏斗筛选：按阶段匹配（通过 STATUS_TO_FUNNEL 映射）
      if (funnelStage && STATUS_TO_FUNNEL[l.status] !== funnelStage)              return false;
      if (fStatus.length      && !fStatus.includes(l.status))                     return false;
      if (fGrade.length       && !fGrade.includes(l.custom_fields?.lead_grade))         return false;
      if (fChannel.length     && !fChannel.includes(l.custom_fields?.source_channel))   return false;
      if (fCustomerType.length && !fCustomerType.includes(l.custom_fields?.customer_type)) return false;
      if (fAssignedTo.length  && !fAssignedTo.includes(l.assigned_to ?? ''))           return false;
      if (fCreatedBy.length   && !fCreatedBy.includes(l.created_by ?? ''))             return false;
      return true;
    });
    return [...data].sort((a, b) => sortFn(a, b, userMap));
  }, [leads, search, funnelStage, fStatus, fGrade, fChannel, fCustomerType, fAssignedTo, fCreatedBy, sortFn, userMap]);

  function clearFilters() {
    setSearch(''); setFunnelStage(''); setFStatus([]); setFGrade([]); setFChannel([]);
    setFCustomerType([]); setFAssignedTo([]); setFCreatedBy([]);
    setFDateFrom(''); setFDateTo('');
  }

  const activeFilterCount = [
    funnelStage ? 1 : 0,
    fStatus.length, fGrade.length, fChannel.length, fCustomerType.length,
    fAssignedTo.length, fCreatedBy.length, fDateFrom ? 1 : 0, fDateTo ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const hasFilters = !!(search || activeFilterCount);

  // toggle helpers
  function toggleArr<T>(arr: T[], val: T, set: (v: T[]) => void) {
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  }

  const currentSortLabel = SORT_OPTIONS.find(o => o.key === sortKey)?.label ?? tCrm('sortDefault');

  // ── Active filter chips ──
  type Chip = { label: string; onRemove: () => void };
  const chips: Chip[] = [
    ...(funnelStage ? [{ label: tCrm('funnelChip', { name: FUNNEL_STAGES_RESOLVED.find(s => s.key === funnelStage)?.label ?? funnelStage }), onRemove: () => setFunnelStage('') }] : []),
    ...fStatus.map(v => ({ label: LEAD_STATUS_OPTIONS.find(o => o.value === v)?.label ?? v, onRemove: () => setFStatus(fStatus.filter(x => x !== v)) })),
    ...fGrade.map(v => ({ label: `${v} ${tCrm('gradeLevel')}`, onRemove: () => setFGrade(fGrade.filter(x => x !== v)) })),
    ...fChannel.map(v => ({ label: v, onRemove: () => setFChannel(fChannel.filter(x => x !== v)) })),
    ...fCustomerType.map(v => ({ label: v, onRemove: () => setFCustomerType(fCustomerType.filter(x => x !== v)) })),
    ...fAssignedTo.map(v => ({ label: tCrm('assignedChip', { name: userMap[v] ?? v }), onRemove: () => setFAssignedTo(fAssignedTo.filter(x => x !== v)) })),
    ...fCreatedBy.map(v => ({ label: tCrm('createdByChip', { name: userMap[v] ?? v }), onRemove: () => setFCreatedBy(fCreatedBy.filter(x => x !== v)) })),
  ];

  // ── Sub-renderers ──
  function renderTable() {
    const COLS = [
      { col: 'company',         label: tCrm('colCompanyName') },
      { col: 'full_name',       label: tCrm('colContactPerson') },
      { col: 'status',          label: tCrm('colBusinessStage') },
      { col: 'lead_grade',      label: tCrm('colGrade') },
      { col: 'source_channel',  label: tCrm('colSourceChannel') },
      { col: 'customer_type',   label: tCrm('colCustomerType') },
      { col: 'created_by_name', label: tCrm('colAssignedTo') },
      { col: 'actions',         label: '' },
    ];
    return (
      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--notion-border)' }}>
        <table className="w-full text-sm border-collapse min-w-[860px]">
          <thead>
            <tr style={{ background: 'var(--notion-hover)', borderBottom: '1px solid var(--notion-border)' }}>
              {COLS.map(({ col, label }) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: '#5F5E5B' }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: '#9B9A97' }}>
                {hasFilters ? tCrm('noMatchingLeads') : tCrm('noLeads')}
                {!hasFilters && <button onClick={onCreateLead} className="ml-3 text-xs px-3 py-1 rounded-md text-white" style={{ background: '#7c3aed' }}>{tCrm('newLeadBtn')}</button>}
              </td></tr>
            ) : filtered.map((lead, i) => {
              const grade = lead.custom_fields?.lead_grade as string | undefined;
              const channel = lead.custom_fields?.source_channel as string | undefined;
              const custType = lead.custom_fields?.customer_type as string | undefined;
              const statusLabel = LEAD_STATUS_OPTIONS.find(o => o.value === lead.status)?.label ?? lead.status;
              const statusCls = LEAD_STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500';
              const gradeStyle = grade ? GRADE_COLORS[grade] : null;
              const creatorName = userMap[lead.created_by ?? ''] ?? userMap[lead.assigned_to ?? ''] ?? '—';
              const funnelStageItem = FUNNEL_STAGES_RESOLVED.find(s => s.key === (STATUS_TO_FUNNEL[lead.status] ?? lead.status));
              const active7d = (() => {
                const ts = lead.updated_at || lead.last_contacted_at;
                if (!ts) return false;
                return Date.now() - new Date(ts).getTime() < 7 * 24 * 60 * 60 * 1000;
              })();
              const isConverted = lead.status === 'converted';
              return (
                <tr key={lead.id} className="transition-colors group"
                  style={{ borderBottom: '1px solid var(--notion-border)', background: i % 2 === 0 ? 'white' : 'var(--notion-hover)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F3F2EF')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'white' : 'var(--notion-hover)')}>
                  <td className="px-4 py-2.5" style={{ minWidth: 140 }}>
                    {lead.company ? (
                      <div className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3"/>
                        </svg>
                        <span className="text-xs font-bold" style={{ color: 'var(--notion-text)' }}>{lead.company}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-medium" style={{ color: '#ef4444' }}>未填写</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {active7d && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#10b981' }} title={tCrm('active7d')} />
                      )}
                      <button onClick={() => router.push(`/${params.tenant}/crm/customer-360/${lead.id}`)}
                        className="text-xs font-semibold hover:underline" style={{ color: '#7c3aed' }}>
                        {lead.full_name}
                      </button>
                      {custType && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: '#ede9fe', color: '#6d28d9' }}>{custType}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {funnelStageItem && <HandIcon name={funnelStageItem.icon} size={12} />}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {gradeStyle
                      ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold" style={{ background: gradeStyle.bg, color: gradeStyle.text }}>{grade}</span>
                      : <span className="text-xs" style={{ color: '#C2C0BC' }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: '#5F5E5B' }}>{channel || <span style={{ color: '#C2C0BC' }}>—</span>}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: '#5F5E5B' }}>{custType || <span style={{ color: '#C2C0BC' }}>—</span>}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: '#5F5E5B' }}>{creatorName}</td>
                  {/* Actions */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/${params.tenant}/crm/customer-360/${lead.id}?tab=workflow`); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white whitespace-nowrap"
                        style={{ background: funnelStageItem?.color ?? '#7c3aed' }}
                        title={tCrm('enterWorkflowFull')}>
                        {tCrm('enterWorkflowArrow')}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/${params.tenant}/crm/customer-360/${lead.id}`); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap"
                        style={{ color: '#7c3aed', background: '#ede9fe' }}>
                        详情
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderKanban() {
    // For kanban, default to funnel_stage if groupBy is 'none'
    const kanbanGroupBy = groupBy === 'none' ? 'funnel_stage' : groupBy;

    if (kanbanGroupBy === 'funnel_stage') {
      // Original funnel stage kanban
      const byStage: Record<string, Lead[]> = {};
      for (const s of FUNNEL_STAGES_RESOLVED) byStage[s.key] = [];
      for (const l of filtered) {
        const key = STATUS_TO_FUNNEL[l.status] ?? l.status;
        (byStage[key] ??= []).push(l);
      }
      return (
        <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 480 }}>
          {FUNNEL_STAGES_RESOLVED.map(stage => {
            const cards = byStage[stage.key] ?? [];
            return (
              <div key={stage.key} className="flex-shrink-0 flex flex-col rounded-xl overflow-hidden"
                style={{ width: 220, border: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
                <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--notion-border)', background: stage.bg }}>
                  <div className="flex items-center gap-1.5">
                    <HandIcon name={stage.icon} size={14} style={{ color: stage.color }} />
                    <span className="text-xs font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                  </div>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: stage.color + '22', color: stage.color }}>
                    {cards.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {cards.map(lead => renderKanbanCard(lead, stage.color))}
                  {cards.length === 0 && (
                    <p className="text-[11px] text-center py-4" style={{ color: '#ccc', fontStyle: 'italic' }}>{tCrm('kanbanEmpty')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Generic kanban grouping
    const groups: Record<string, Lead[]> = {};
    for (const l of filtered) {
      let key: string;
      switch (kanbanGroupBy) {
        case 'company': key = l.company?.trim() || '未分类'; break;
        case 'assigned_to': key = userMap[l.assigned_to ?? ''] || userMap[l.created_by ?? ''] || '未分配'; break;
        case 'source_channel': key = l.custom_fields?.source_channel || '未知来源'; break;
        case 'grade': key = l.custom_fields?.lead_grade || l.custom_fields?.customer_grade || '未评级'; break;
        default: key = '其他'; break;
      }
      (groups[key] ??= []).push(l);
    }
    const sortedGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    const colors = ['#7c3aed', '#0284c7', '#c2410c', '#15803d', '#d97706', '#059669', '#dc2626', '#4338ca'];

    return (
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 480 }}>
        {sortedGroups.map(([groupName, leads], idx) => {
          const color = colors[idx % colors.length];
          return (
            <div key={groupName} className="flex-shrink-0 flex flex-col rounded-xl overflow-hidden"
              style={{ width: 220, border: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
              <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--notion-border)', background: color + '11' }}>
                <span className="text-xs font-semibold truncate" style={{ color }}>{groupName}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: color + '22', color }}>
                  {leads.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {leads.map(lead => renderKanbanCard(lead, color))}
                {leads.length === 0 && (
                  <p className="text-[11px] text-center py-4" style={{ color: '#ccc', fontStyle: 'italic' }}>{tCrm('kanbanEmpty')}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderKanbanCard(lead: Lead, accentColor: string) {
    const grade = lead.custom_fields?.lead_grade as string | undefined;
    const gs = grade ? GRADE_COLORS[grade] : null;
    const active7d = (() => {
      const ts = lead.updated_at || lead.last_contacted_at;
      return ts && Date.now() - new Date(ts).getTime() < 7 * 24 * 60 * 60 * 1000;
    })();
    return (
      <div key={lead.id}
        className="bg-white rounded-lg p-3 cursor-pointer shadow-sm transition-all group/card"
        style={{ border: '1px solid var(--notion-border)' }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
        onClick={() => router.push(`/${params.tenant}/crm/customer-360/${lead.id}`)}>
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {active7d && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#10b981' }} />}
            <span className="text-xs font-semibold leading-snug truncate" style={{ color: '#1a1a1a' }}>{lead.full_name}</span>
          </div>
          {gs && <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full text-[10px] font-bold" style={{ background: gs.bg, color: gs.text }}>{grade}</span>}
        </div>
        {lead.company && <p className="text-[11px] truncate mb-1.5" style={{ color: '#888' }}>{lead.company}</p>}
        <div className="flex items-center justify-between mt-1">
          {lead.custom_fields?.source_channel && (
            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#f0f0f0', color: '#666' }}>
              {lead.custom_fields.source_channel}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); router.push(`/${params.tenant}/crm/customer-360/${lead.id}?tab=workflow`); }}
            className="ml-auto opacity-0 group-hover/card:opacity-100 transition-all text-[10px] px-2 py-0.5 rounded-md font-semibold text-white"
            style={{ background: accentColor }}
            title={tCrm('enterWorkflowFull')}>
            {tCrm('enterWorkflow')}
          </button>
        </div>
      </div>
    );
  }

  function renderCards() {
    if (filtered.length === 0) return (
      <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: '#9B9A97' }}>
        <p className="mb-2"><HandIcon name="magnifier" size={32} /></p>
        <p>{hasFilters ? tCrm('noMatchingLeads') : tCrm('noLeads')}</p>
        {!hasFilters && <button onClick={onCreateLead} className="mt-3 text-xs px-4 py-1.5 rounded-lg text-white" style={{ background: '#7c3aed' }}>{tCrm('newLeadBtn')}</button>}
      </div>
    );
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {filtered.map(lead => {
          const grade = lead.custom_fields?.lead_grade as string | undefined;
          const gs = grade ? GRADE_COLORS[grade] : null;
          const statusLabel = LEAD_STATUS_OPTIONS.find(o => o.value === lead.status)?.label ?? lead.status;
          const statusCls = LEAD_STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500';
          const stage = FUNNEL_STAGES_RESOLVED.find(s => s.key === (STATUS_TO_FUNNEL[lead.status] ?? lead.status));
          return (
            <div key={lead.id}
              className="bg-white rounded-xl overflow-hidden cursor-pointer transition-all"
              style={{ border: '1px solid var(--notion-border)' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              onClick={() => router.push(`/${params.tenant}/crm/customer-360/${lead.id}`)}>
              {/* Color bar */}
              <div style={{ height: 4, background: stage?.color ?? '#e5e7eb' }} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: stage ? stage.color + '22' : '#f0f0f0', color: stage?.color ?? '#888' }}>
                    {lead.full_name?.[0]?.toUpperCase()}
                  </div>
                  {gs && <span className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold" style={{ background: gs.bg, color: gs.text }}>{grade}</span>}
                </div>
                <p className="font-semibold text-sm mb-0.5" style={{ color: '#1a1a1a' }}>{lead.full_name}</p>
                {lead.company && <p className="text-xs mb-2 truncate" style={{ color: '#888' }}>{lead.company}</p>}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    {stage && <HandIcon name={stage.icon} size={12} />}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}>{statusLabel}</span>
                  </div>
                  {lead.custom_fields?.source_channel && (
                    <span className="text-[11px]" style={{ color: '#aaa' }}>{lead.custom_fields.source_channel}</span>
                  )}
                </div>
                {/* Enter Workflow button */}
                <button
                  onClick={e => { e.stopPropagation(); router.push(`/${params.tenant}/crm/customer-360/${lead.id}?tab=workflow`); }}
                  className="mt-2.5 w-full text-xs py-1.5 rounded-lg font-semibold text-white transition-all"
                  style={{ background: stage?.color ?? '#7c3aed' }}>
                  {tCrm('enterWorkflowFullArrow')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── GroupBy helpers ──
  const GROUP_BY_OPTIONS: { key: GroupBy; label: string }[] = [
    { key: 'none', label: '不分组' },
    { key: 'funnel_stage', label: '按阶段' },
    { key: 'company', label: '按公司' },
    { key: 'assigned_to', label: '按负责人' },
    { key: 'source_channel', label: '按来源' },
    { key: 'grade', label: '按等级' },
  ];

  function getGroupKey(lead: Lead): string {
    switch (groupBy) {
      case 'funnel_stage': return STATUS_TO_FUNNEL[lead.status] ?? lead.status;
      case 'company': return lead.company?.trim() || '未分类';
      case 'assigned_to': return userMap[lead.assigned_to ?? ''] || userMap[lead.created_by ?? ''] || '未分配';
      case 'source_channel': return lead.custom_fields?.source_channel || '未知来源';
      case 'grade': return lead.custom_fields?.lead_grade || lead.custom_fields?.customer_grade || '未评级';
      default: return '';
    }
  }

  function getGroupLabel(key: string): string {
    if (groupBy === 'funnel_stage') {
      return FUNNEL_STAGES_RESOLVED.find(s => s.key === key)?.label ?? key;
    }
    return key;
  }

  function getGroupedData(): [string, Lead[]][] {
    if (groupBy === 'none') return [];
    const groups: Record<string, Lead[]> = {};
    for (const lead of filtered) {
      const key = getGroupKey(lead);
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    }
    return Object.entries(groups).sort((a, b) => {
      if (a[0] === '未分类' || a[0] === '未分配' || a[0] === '未知来源' || a[0] === '未评级') return 1;
      if (b[0] === '未分类' || b[0] === '未分配' || b[0] === '未知来源' || b[0] === '未评级') return -1;
      return b[1].length - a[1].length;
    });
  }

  function renderGroupedTable() {
    const groups = getGroupedData();
    if (groups.length === 0) return renderTable();
    return (
      <div className="space-y-3">
        {groups.map(([groupName, groupLeads]) => (
          <details key={groupName} open className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
              style={{ background: 'var(--notion-hover)' }}>
              <span className="text-sm font-bold flex-1" style={{ color: 'var(--notion-text)' }}>
                {getGroupLabel(groupName)}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                {groupLeads.length}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" className="flex-shrink-0 transition-transform">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </summary>
            <div className="divide-y" style={{ borderColor: 'var(--notion-border)' }}>
              {groupLeads.map(lead => {
                const grade = lead.custom_fields?.lead_grade as string | undefined;
                const gs = grade ? GRADE_COLORS[grade] : null;
                const statusLabel = LEAD_STATUS_OPTIONS.find(o => o.value === lead.status)?.label ?? lead.status;
                const statusCls = LEAD_STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500';
                const funnelStageItem = FUNNEL_STAGES_RESOLVED.find(s => s.key === (STATUS_TO_FUNNEL[lead.status] ?? lead.status));
                return (
                  <div key={lead.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer"
                    onClick={() => router.push(`/${params.tenant}/crm/customer-360/${lead.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span className="text-sm font-medium flex-shrink-0" style={{ color: '#7c3aed', minWidth: 80 }}>{lead.full_name}</span>
                    {lead.company && <span className="text-xs truncate" style={{ color: '#888' }}>{lead.company}</span>}
                    <span className="flex-1" />
                    {funnelStageItem && <HandIcon name={funnelStageItem.icon} size={12} />}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}>{statusLabel}</span>
                    {gs && <span className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0" style={{ background: gs.bg, color: gs.text }}>{grade}</span>}
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/${params.tenant}/crm/customer-360/${lead.id}`); }}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                      style={{ color: '#7c3aed', background: '#ede9fe' }}>
                      详情
                    </button>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    );
  }

  function renderGroupedCards() {
    const groups = getGroupedData();
    if (groups.length === 0) return renderCards();
    return (
      <div className="space-y-6">
        {groups.map(([groupName, groupLeads]) => (
          <div key={groupName}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold" style={{ color: 'var(--notion-text)' }}>{getGroupLabel(groupName)}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#ede9fe', color: '#7c3aed' }}>{groupLeads.length}</span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {groupLeads.map(lead => {
                const grade = lead.custom_fields?.lead_grade as string | undefined;
                const gs = grade ? GRADE_COLORS[grade] : null;
                const statusLabel = LEAD_STATUS_OPTIONS.find(o => o.value === lead.status)?.label ?? lead.status;
                const statusCls = LEAD_STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500';
                const stage = FUNNEL_STAGES_RESOLVED.find(s => s.key === (STATUS_TO_FUNNEL[lead.status] ?? lead.status));
                return (
                  <div key={lead.id}
                    className="bg-white rounded-xl overflow-hidden cursor-pointer transition-all"
                    style={{ border: '1px solid var(--notion-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                    onClick={() => router.push(`/${params.tenant}/crm/customer-360/${lead.id}`)}>
                    <div style={{ height: 4, background: stage?.color ?? '#e5e7eb' }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{ background: stage ? stage.color + '22' : '#f0f0f0', color: stage?.color ?? '#888' }}>
                          {lead.full_name?.[0]?.toUpperCase()}
                        </div>
                        {gs && <span className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold" style={{ background: gs.bg, color: gs.text }}>{grade}</span>}
                      </div>
                      <p className="font-semibold text-sm mb-0.5" style={{ color: '#1a1a1a' }}>{lead.full_name}</p>
                      {lead.company && <p className="text-xs mb-2 truncate" style={{ color: '#888' }}>{lead.company}</p>}
                      <div className="flex items-center gap-1">
                        {stage && <HandIcon name={stage.icon} size={12} />}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}>{statusLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Filter panel sections helper ──
  function FSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9B9A97' }}>{title}</p>
        {children}
      </div>
    );
  }
  function CheckGroup({ options, selected, onToggle }: {
    options: { value: string; label: string }[];
    selected: string[];
    onToggle: (v: string) => void;
  }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = selected.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => onToggle(o.value)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
              style={{
                background: on ? '#7c3aed' : 'white',
                color: on ? 'white' : '#555',
                borderColor: on ? '#7c3aed' : '#ddd',
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative" style={{ minWidth: 200 }}>
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="13" height="13"
            viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none border"
            style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)', color: 'var(--notion-text)' }}
            placeholder={tCrm('searchPlaceholder')}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Filter button */}
        <div className="relative" ref={filterPanelRef}>
          <button
            onClick={() => setShowFilterPanel(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
            style={{
              borderColor: activeFilterCount ? '#7c3aed' : 'var(--notion-border)',
              color: activeFilterCount ? '#7c3aed' : '#555',
              background: activeFilterCount ? '#f5f3ff' : 'white',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            {tCrm('filter')}
            {activeFilterCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#7c3aed', minWidth: 18, textAlign: 'center' }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Filter Panel */}
          {showFilterPanel && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl p-4 space-y-4"
              style={{ width: 380, border: '1px solid var(--notion-border)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>{tCrm('filterConditions')}</span>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs px-2.5 py-1 rounded-lg" style={{ color: '#7c3aed', background: '#f5f3ff' }}>
                    {tCrm('clearAll')}
                  </button>
                )}
              </div>

              <FSection title={tCrm('processingStage')}>
                <CheckGroup
                  options={LEAD_STATUS_OPTIONS}
                  selected={fStatus}
                  onToggle={v => toggleArr(fStatus, v, setFStatus)}
                />
              </FSection>

              <FSection title={tCrm('leadGrade')}>
                <CheckGroup
                  options={['A','B','C','D'].map(g => ({ value: g, label: `${g} ${tCrm('gradeLevel')}` }))}
                  selected={fGrade}
                  onToggle={v => toggleArr(fGrade, v, setFGrade)}
                />
              </FSection>

              <FSection title={tCrm('sourceChannelFilter')}>
                <CheckGroup
                  options={SOURCE_CHANNELS.map(c => ({ value: c, label: c }))}
                  selected={fChannel}
                  onToggle={v => toggleArr(fChannel, v, setFChannel)}
                />
              </FSection>

              <FSection title={tCrm('customerTypeFilter')}>
                <CheckGroup
                  options={CUSTOMER_TYPES.map(t => ({ value: t, label: t }))}
                  selected={fCustomerType}
                  onToggle={v => toggleArr(fCustomerType, v, setFCustomerType)}
                />
              </FSection>

              <FSection title={tCrm('assignedToFilter')}>
                <CheckGroup
                  options={users.map(u => ({ value: u.id, label: (u.full_name || u.email) + (u.position_name ? ` (${u.position_name})` : '') }))}
                  selected={fAssignedTo}
                  onToggle={v => toggleArr(fAssignedTo, v, setFAssignedTo)}
                />
              </FSection>

              <FSection title={tCrm('createdByFilter')}>
                <CheckGroup
                  options={users.map(u => ({ value: u.id, label: (u.full_name || u.email) + (u.position_name ? ` (${u.position_name})` : '') }))}
                  selected={fCreatedBy}
                  onToggle={v => toggleArr(fCreatedBy, v, setFCreatedBy)}
                />
              </FSection>
            </div>
          )}
        </div>

        {/* Sort dropdown */}
        <div className="relative" ref={sortMenuRef}>
          <button
            onClick={() => setShowSortMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
            style={{ borderColor: 'var(--notion-border)', color: '#555', background: 'var(--notion-card, white)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
            </svg>
            {currentSortLabel}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {showSortMenu && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-xl py-1.5 overflow-hidden"
              style={{ minWidth: 180, border: '1px solid var(--notion-border)' }}>
              {SORT_OPTIONS.map(o => (
                <button key={o.key} onClick={() => { setSortKey(o.key); setShowSortMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between"
                  style={{ background: sortKey === o.key ? '#f5f3ff' : 'transparent', color: sortKey === o.key ? '#7c3aed' : '#333' }}
                  onMouseEnter={e => { if (sortKey !== o.key) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { if (sortKey !== o.key) e.currentTarget.style.background = 'transparent'; }}>
                  {o.label}
                  {sortKey === o.key && <HandIcon name="checkmark" size={11} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GroupBy selector */}
        <div className="relative" ref={groupByRef}>
          <button
            onClick={() => setShowGroupByMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
            style={{
              borderColor: groupBy !== 'none' ? '#7c3aed' : 'var(--notion-border)',
              color: groupBy !== 'none' ? '#7c3aed' : '#555',
              background: groupBy !== 'none' ? '#f5f3ff' : 'var(--notion-card, white)',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
            {GROUP_BY_OPTIONS.find(o => o.key === groupBy)?.label ?? '分组'}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {showGroupByMenu && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-xl py-1.5 overflow-hidden"
              style={{ minWidth: 150, border: '1px solid var(--notion-border)' }}>
              {GROUP_BY_OPTIONS.map(o => (
                <button key={o.key} onClick={() => { setGroupBy(o.key); setShowGroupByMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between"
                  style={{ background: groupBy === o.key ? '#f5f3ff' : 'transparent', color: groupBy === o.key ? '#7c3aed' : '#333' }}
                  onMouseEnter={e => { if (groupBy !== o.key) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { if (groupBy !== o.key) e.currentTarget.style.background = 'transparent'; }}>
                  {o.label}
                  {groupBy === o.key && <HandIcon name="checkmark" size={11} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: '#F0EFec', marginLeft: 4 }}>
          {([
            ['table',  '☰', tCrm('tableMode')],
            ['kanban', '⊞', tCrm('kanbanMode')],
            ['card',   '▦', tCrm('cardMode')],
          ] as [ViewMode, string, string][]).map(([mode, icon, label]) => {
            const active = viewMode === mode;
            return (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: active ? 'white' : 'transparent',
                  color: active ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                <span style={{ fontSize: 14 }}>{icon}</span> {label}
              </button>
            );
          })}
        </div>

        {/* Clear filters shortcut */}
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs px-2.5 py-1.5 rounded-lg"
            style={{ color: '#7c3aed', background: '#f5f3ff' }}>
            {tCrm('clearFilter')}
          </button>
        )}

        {/* Count */}
        <span className="ml-auto text-xs font-medium" style={{ color: '#9B9A97' }}>
          {tCrm('leadsCountLabel', { filtered: filtered.length, total: leads.length })}
        </span>
      </div>

      {/* ── Active filter chips ── */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              {chip.label}
              <button onClick={chip.onRemove} className="ml-0.5 rounded-full hover:bg-purple-200 flex items-center"
                style={{ lineHeight: 1 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Content by view mode ── */}
      {viewMode === 'table'   && (groupBy !== 'none' ? renderGroupedTable() : renderTable())}
      {viewMode === 'kanban'  && renderKanban()}
      {viewMode === 'card'    && (groupBy !== 'none' ? renderGroupedCards() : renderCards())}
    </div>
  );
}

// ── Public Pool Tab ──────────────────────────────────────────────────────────
function PublicPoolTab({ leads, users, onRestore }: { leads: Lead[]; users: TenantUser[]; onRestore?: (id: string) => void }) {
  const params = useParams<{ tenant: string }>();
  const router = useRouter();
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleRestore(e: React.MouseEvent, leadId: string) {
    e.stopPropagation();
    if (!confirm(tCrm('restoreConfirm'))) return;
    setRestoringId(leadId);
    try {
      await api.patch(`/api/crm/leads/${leadId}/restore`, {});
      onRestore?.(leadId);
    } catch { /* ignore */ }
    finally { setRestoringId(null); }
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    if (!q) return true;
    return l.full_name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q);
  });

  const userMap = Object.fromEntries(users.map(u => [u.id, (u.full_name || u.email) + (u.position_name ? ` (${u.position_name})` : '')]));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#6b7280' }}>
          <HandIcon name="ice-cube" size={14} /> {tCrm('publicPool')}
          <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#f3f4f6', color: '#6b7280' }}>
            {tCrm('coldLeadsCount', { n: leads.length })}
          </span>
        </div>
        <div className="relative ml-auto" style={{ minWidth: 200 }}>
          <input className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none border"
            style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)', color: 'var(--notion-text)' }}
            placeholder={tCrm('searchEllipsis')}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
        <div className="px-4 py-3 text-xs" style={{ background: '#f9fafb', borderBottom: '1px solid var(--notion-border)', color: '#9B9A97' }}>
          {tCrm('publicPoolDesc')}
        </div>
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: '#9B9A97', background: 'var(--notion-card, white)' }}>
            <HandIcon name="ice-cube" size={30} className="mb-2 mx-auto" />
            <p>{tCrm('noColdLeads')}</p>
          </div>
        ) : (
          <div className="divide-y bg-white" style={{ borderColor: 'var(--notion-border)' }}>
            {filtered.map(lead => {
              const grade = lead.custom_fields?.lead_grade as string | undefined;
              const gs = grade ? GRADE_COLORS[grade] : null;
              const assignedName = userMap[lead.assigned_to ?? ''] ?? '—';
              return (
                <div key={lead.id} className="flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors"
                  style={{ background: 'var(--notion-card, white)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  onClick={() => router.push(`/${params.tenant}/crm/customer-360/${lead.id}`)}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: 'var(--notion-hover)', color: '#9B9A97' }}>
                    <HandIcon name="ice-cube" size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{lead.full_name}</p>
                    {lead.company && <p className="text-xs truncate" style={{ color: '#9B9A97' }}>{lead.company}</p>}
                  </div>
                  {lead.cold_lead_reason && (
                    <div className="flex-1 min-w-0 max-w-xs">
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: '#6b7280' }}>
                        {lead.cold_lead_reason}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {gs && <span className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold" style={{ background: gs.bg, color: gs.text }}>{grade}</span>}
                    <span className="text-xs" style={{ color: '#9B9A97' }}>{assignedName}</span>
                    <button
                      onClick={e => handleRestore(e, lead.id)}
                      disabled={restoringId === lead.id}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
                      style={{ color: '#059669', background: '#d1fae5' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#a7f3d0'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#d1fae5'; }}
                    >
                      {restoringId === lead.id ? '...' : tCrm('restoreLead')}
                    </button>
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

// ── Main CRM Page ─────────────────────────────────────────────────────────────
type TabKey = 'dashboard' | 'leads' | 'pool' | 'receivables' | 'files' | 'risks';

export default function CRMPage() {
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const me = getCurrentUser();
  const meIsAdmin = me?.role === 'tenant_admin' || me?.role === 'platform_admin';
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [poolLeads, setPoolLeads] = useState<Lead[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [approvalDeciding, setApprovalDeciding] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [leadsFunnelFilter, setLeadsFunnelFilter] = useState('');

  // View scope: admin can switch between all data and per-user view
  const [viewScope, setViewScope] = useState<ViewScope>(
    meIsAdmin ? { type: 'all' } : { type: 'user', userId: me?.sub ?? '', userName: me?.full_name || me?.name || me?.email || '' }
  );

  // KPI detail panel
  const [kpiPanel, setKpiPanel] = useState<KpiPanelType | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showReceivableModal, setShowReceivableModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [timeline, setTimeline] = useState<any>(null);

  type InventoryProduct = { id: string; sku: string; name: string; current_stock: number; cost_price: number; sell_price: number };
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>([]);

  type LineItem = { product_id: string; product_name: string; quantity: string; unit_price: string };
  const [contractLineItems, setContractLineItems] = useState<LineItem[]>([]);

  const [contractForm, setContractForm] = useState({
    contract_no: '', account_name: '', contract_amount: '', currency: 'USD',
    payment_method: 'TT', incoterm: 'FOB', sign_date: '', eta: '',
    status: 'draft', risk_level: 'normal', create_operation_order: true, remarks: '',
  });
  const [receivableForm, setReceivableForm] = useState({
    contract_id: '', due_date: '', amount: '', currency: 'USD',
    received_amount: '0', status: 'open', notes: '',
  });

  // Payment panel state
  const [paymentReceivable, setPaymentReceivable] = useState<Receivable | null>(null);
  const [payments, setPayments] = useState<ReceivablePayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: '', notes: '', payment_proof_url: '', payment_proof_name: '' });
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);

  async function openPaymentPanel(rec: Receivable) {
    setPaymentReceivable(rec);
    setPaymentForm({ amount: '', payment_date: '', notes: '', payment_proof_url: '', payment_proof_name: '' });
    setLoadingPayments(true);
    try {
      const data = await api.get(`/api/crm/receivables/${rec.id}/payments`);
      setPayments(Array.isArray(data) ? data : []);
    } catch { setPayments([]); }
    finally { setLoadingPayments(false); }
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentReceivable || !paymentForm.amount) return;
    setSubmittingPayment(true);
    try {
      const result: any = await api.post(`/api/crm/receivables/${paymentReceivable.id}/payments`, {
        amount: Number(paymentForm.amount),
        payment_date: paymentForm.payment_date || null,
        payment_proof_url: paymentForm.payment_proof_url || null,
        payment_proof_name: paymentForm.payment_proof_name || null,
        notes: paymentForm.notes || null,
      });
      // Refresh payments list
      const data = await api.get(`/api/crm/receivables/${paymentReceivable.id}/payments`);
      setPayments(Array.isArray(data) ? data : []);
      // Update local receivable state
      setReceivables(prev => prev.map(r => r.id === paymentReceivable.id
        ? { ...r, received_amount: result.new_received_amount, status: result.new_status }
        : r
      ));
      setPaymentReceivable(prev => prev ? { ...prev, received_amount: result.new_received_amount, status: result.new_status } : null);
      setPaymentForm({ amount: '', payment_date: '', notes: '', payment_proof_url: '', payment_proof_name: '' });
    } catch (err: any) { alert(err.message || tCrm('submitFailed')); }
    finally { setSubmittingPayment(false); }
  }

  async function handleProofUpload(file: File) {
    setUploadingProof(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file);
      setPaymentForm(prev => ({ ...prev, payment_proof_url: result.url, payment_proof_name: result.name }));
    } catch (err: any) { alert(tCrm('uploadFailed') + ': ' + (err.message || '')); }
    finally { setUploadingProof(false); }
  }

  async function decideApproval() {
    if (!approvalDeciding) return;
    try {
      await api.post(`/api/crm/risks/approvals/${approvalDeciding.id}/decide`, {
        decision: approvalDeciding.decision,
        decision_notes: decisionNotes || null,
      });
      setPendingApprovals(prev => prev.filter(a => a.id !== approvalDeciding.id));
      setApprovalDeciding(null);
      setDecisionNotes('');
    } catch (err: any) { alert(err.message || 'Failed'); }
  }

  async function loadAll() {
    setLoading(true);
    const qs = viewScope.type === 'user' ? `?user_id=${viewScope.userId}` : '';
    const amp = viewScope.type === 'user' ? `&user_id=${viewScope.userId}` : '';
    const [ov, ld, pl, ct, rc, py, ap, users, prods] = await Promise.all([
      api.get(`/api/crm/overview${qs}`).catch(() => null),
      api.get(`/api/crm/leads${qs}`).catch(() => []),
      api.get(`/api/crm/leads?pool=public${amp}`).catch(() => []),
      api.get(`/api/crm/contracts${qs}`).catch(() => []),
      api.get(`/api/crm/receivables${qs}`).catch(() => []),
      api.get(`/api/crm/payables${qs}`).catch(() => []),
      api.get('/api/crm/risks/pending-approvals').catch(() => []),
      api.get('/api/admin/users').catch(() => []),
      api.get('/api/inventory/products').catch(() => []),
    ]);
    setOverview(ov);
    setLeads(Array.isArray(ld) ? ld : []);
    setPoolLeads(Array.isArray(pl) ? pl : []);
    setContracts(Array.isArray(ct) ? ct : []);
    setReceivables(Array.isArray(rc) ? rc : []);
    setPayables(Array.isArray(py) ? py : []);
    setPendingApprovals(Array.isArray(ap) ? ap : []);
    setTenantUsers(Array.isArray(users) ? users : []);
    setInventoryProducts(Array.isArray(prods) ? prods : []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [viewScope]);

  // Auto-refresh when user navigates back to this page (e.g., from customer-360)
  useEffect(() => {
    function onFocus() { loadAll(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [viewScope]);

  const contractOptions = useMemo(() => contracts.map(c => ({ id: c.id, label: c.contract_no })), [contracts]);

  async function analyzeLead(leadId: string) {
    try {
      const res = await api.post(`/api/crm/leads/${leadId}/ai-analyze`, {});
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ai_summary: res.analysis } : l));
    } catch (e: any) { alert(e.message); }
  }

  async function createContract(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api.post('/api/crm/contracts', {
        ...contractForm,
        contract_amount: Number(contractForm.contract_amount || 0),
        sign_date: contractForm.sign_date || null,
        eta: contractForm.eta || null,
      });
      // Create line items if any
      const contractId = (res as any)?.id;
      if (contractId && contractLineItems.length > 0) {
        for (const li of contractLineItems) {
          if (!li.product_name && !li.product_id) continue;
          await api.post(`/api/crm/contracts/${contractId}/line-items`, {
            product_id: li.product_id || undefined,
            product_name: li.product_name,
            quantity: parseFloat(li.quantity) || 0,
            unit_price: parseFloat(li.unit_price) || 0,
          });
        }
      }
      setShowContractModal(false);
      setContractLineItems([]);
      await loadAll();
    } catch (err: any) { alert(err.message); }
  }

  async function createReceivable(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/crm/receivables', {
        ...receivableForm,
        amount: Number(receivableForm.amount || 0),
        received_amount: Number(receivableForm.received_amount || 0),
        due_date: receivableForm.due_date || null,
      });
      setShowReceivableModal(false);
      await loadAll();
    } catch (err: any) { alert(err.message); }
  }

  async function openTimeline(contract: Contract) {
    setSelectedContract(contract);
    const data = await api.get(`/api/crm/contracts/${contract.id}/timeline`).catch(() => null);
    setTimeline(data);
  }

  const contractCols: Column<Contract>[] = [
    { key: 'contract_no', label: tCrm('colContractNo'), type: 'mono' },
    { key: 'account_name', label: tCrm('colClient') },
    { key: 'payment_method', label: tCrm('colPaymentMethod') },
    { key: 'contract_amount', label: tCrm('colAmount'), render: (v, r) => `${r.currency} ${Number(v || 0).toLocaleString()}` },
    { key: 'task_done', label: tCrm('colFulfillProgress'), render: (_v, r) => `${r.task_done}/${r.task_total}` },
    { key: 'approvals_pending', label: tCrm('colPendingApproval') },
    { key: 'receivable_outstanding', label: tCrm('colOutstanding'), render: (_v, r) => (
      <div className="text-xs leading-snug">
        <div style={{ color: '#15803d' }}>应收: {r.currency} {Number(r.receivable_outstanding || 0).toLocaleString()}</div>
        <div style={{ color: '#dc2626' }}>应付: {r.currency} {Number(r.payable_outstanding || 0).toLocaleString()}</div>
      </div>
    ) },
    { key: 'status', label: tCrm('colStatus'), type: 'status' },
  ];

  const receivableCols: Column<Receivable>[] = [
    { key: 'contract_no', label: tCrm('colContractNo'), type: 'mono' },
    { key: 'invoice_no', label: tCrm('colInvoiceNo') },
    { key: 'due_date', label: tCrm('colDueDate'), type: 'date' },
    { key: 'amount', label: tCrm('colReceivableAmount'), render: (v, r) => `${r.currency} ${Number(v || 0).toLocaleString()}` },
    { key: 'received_amount', label: tCrm('colReceivedAmount'), render: (v, r) => `${r.currency} ${Number(v || 0).toLocaleString()}` },
    { key: 'status', label: tCrm('colStatus'), type: 'status' },
    { key: 'lead_name', label: tCrm('colLead') },
    { key: 'assigned_name', label: tCrm('colAssignedName') },
  ];

  const riskCols: Column<PendingApproval>[] = [
    { key: 'contract_no', label: tCrm('colContractNo'), type: 'mono' },
    { key: 'action', label: tCrm('colAction') },
    { key: 'required_approver', label: tCrm('colApprover') },
    { key: 'reason', label: tCrm('colReason') },
    { key: 'requested_at', label: tCrm('colRequestTime'), type: 'date' },
  ];

  const TABS: [TabKey, string][] = [
    ['dashboard', tCrm('tabDashboard')],
    ['leads', tCrm('tabLeadPool')],
    ['pool', tCrm('tabPublicPool', { n: poolLeads.length })],
    ['receivables', tCrm('tabReceivables')],
    ['files', tCrm('tabFiles')],
    ['risks', tCrm('tabRisks')],
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading CRM...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--notion-text)' }}>{tCrm('crmHub')}</h1>
        {/* View scope switcher */}
        {meIsAdmin ? (
          <div className="relative">
            <select
              value={viewScope.type === 'all' ? '__all__' : viewScope.userId}
              onChange={e => {
                const v = e.target.value;
                if (v === '__all__') {
                  setViewScope({ type: 'all' });
                } else {
                  const u = tenantUsers.find(u => u.id === v);
                  setViewScope({ type: 'user', userId: v, userName: u?.full_name || u?.email || v });
                }
              }}
              className="pl-7 pr-3 py-1.5 rounded-lg text-xs font-medium outline-none cursor-pointer appearance-none"
              style={{
                background: viewScope.type === 'user' ? '#f5f3ff' : 'var(--notion-hover)',
                border: viewScope.type === 'user' ? '2px solid #7c3aed' : '1px solid var(--notion-border)',
                color: viewScope.type === 'user' ? '#7c3aed' : 'var(--notion-text)',
                minWidth: 160,
              }}
            >
              <option value="__all__">全部数据（管理员）</option>
              {tenantUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}{u.position_name ? ` · ${u.position_name}` : ''}</option>
              ))}
            </select>
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={viewScope.type === 'user' ? '#7c3aed' : '#9B9A97'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
        ) : (
          <span className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: 'var(--notion-hover)', color: '#9B9A97', border: '1px solid var(--notion-border)' }}>
            我的数据
          </span>
        )}
      </div>

      {/* KPI row */}
      <div className="px-8 pb-4 grid grid-cols-7 gap-3">
        {([
          { label: tCrm('kpiLeadPool'), value: overview?.leads_open ?? 0, kpiType: 'leads_open' as KpiPanelType, accent: '#7c3aed' },
          { label: tCrm('kpiActiveCustomers'), value: overview?.accounts_active ?? 0, kpiType: 'accounts_active' as KpiPanelType, accent: '#0284c7' },
          { label: tCrm('kpiContractsTotal'), value: overview?.contracts_total ?? 0, kpiType: 'contracts_total' as KpiPanelType, accent: '#059669' },
          { label: tCrm('kpiFulfilling'), value: overview?.orders_running ?? 0, kpiType: 'orders_running' as KpiPanelType, accent: '#d97706' },
          { label: tCrm('kpiPendingApproval'), value: overview?.approvals_pending ?? 0, kpiType: 'approvals_pending' as KpiPanelType, accent: '#dc2626' },
          { label: tCrm('kpiOutstandingReceivable'), value: Number(overview?.receivable_outstanding || 0).toLocaleString(), kpiType: 'receivable_outstanding' as KpiPanelType, accent: '#c2410c' },
          { label: '应付未付', value: Number(overview?.payable_outstanding || 0).toLocaleString(), kpiType: 'payable_outstanding' as KpiPanelType, accent: '#15803d' },
        ]).map(k => {
          const isActive = kpiPanel === k.kpiType;
          return (
            <div key={k.label}
              onClick={() => setKpiPanel(isActive ? null : k.kpiType)}
              className="rounded-xl px-4 py-3 cursor-pointer transition-all group/kpi"
              style={{
                background: isActive ? `${k.accent}10` : '#f7f6f3',
                border: isActive ? `2px solid ${k.accent}` : '1px solid var(--notion-border)',
              }}>
              <p className="text-xs font-medium" style={{ color: isActive ? k.accent : 'var(--notion-text-muted)' }}>{k.label}</p>
              <p className="text-xl font-bold" style={{ color: isActive ? k.accent : 'var(--notion-text)' }}>{k.value}</p>
              <p className="text-[10px] mt-0.5 transition-opacity opacity-0 group-hover/kpi:opacity-100" style={{ color: k.accent }}>
                点击查看详情 →
              </p>
            </div>
          );
        })}
      </div>

      {/* KPI Detail Panel */}
      {kpiPanel && (
        <KpiDetailPanel
          type={kpiPanel}
          onClose={() => setKpiPanel(null)}
          viewScope={viewScope}
        />
      )}

      {/* Toolbar */}
      <div className="px-8 pb-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--notion-active)' }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-1.5"
              style={{
                background: tab === key ? 'white' : 'transparent',
                color: tab === key ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowLeadModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ background: '#7c3aed' }}>
            {tCrm('newLeadAction')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-4">
        {tab === 'dashboard' && (
          <CRMDashboardTab onStageClick={(key) => { setTab('leads'); setLeadsFunnelFilter(key); }} globalScope={viewScope} />
        )}
        {tab === 'leads' && (
          <LeadsTab
            leads={leads}
            users={tenantUsers}
            onCreateLead={() => setShowLeadModal(true)}
            defaultStatusFilter={leadsFunnelFilter}
          />
        )}
        {tab === 'pool' && (
          <PublicPoolTab leads={poolLeads} users={tenantUsers} onRestore={(id) => {
            setPoolLeads(prev => prev.filter(l => l.id !== id));
            loadAll();
          }} />
        )}
        {tab === 'receivables' && (
          <NotionTable columns={receivableCols} data={receivables}
            statusColors={{ unpaid: 'bg-orange-100 text-orange-700', open: 'bg-orange-100 text-orange-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', closed: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700' }}
            emptyMessage={tCrm('noReceivables')}
            rowActions={r => (
              <button className="px-2 py-1 rounded text-xs border whitespace-nowrap" style={{ borderColor: 'var(--notion-border)' }}
                onClick={e => { e.stopPropagation(); openPaymentPanel(r); }}>
                {tCrm('collectPayment')}
              </button>
            )} />
        )}
        {tab === 'files' && (
          <LeadFilesTab users={tenantUsers} leads={leads} />
        )}
        {tab === 'risks' && (
          <NotionTable columns={riskCols} data={pendingApprovals} emptyMessage={tCrm('noRiskApprovals')}
            rowActions={meIsAdmin ? (row) => (
              <div className="flex gap-1">
                <button className="px-2 py-1 rounded text-xs text-white whitespace-nowrap" style={{ background: '#16a34a' }}
                  onClick={e => { e.stopPropagation(); setApprovalDeciding({ id: row.id, decision: 'approved' }); setDecisionNotes(''); }}>
                  {tCrm('riskApprove')}
                </button>
                <button className="px-2 py-1 rounded text-xs text-white whitespace-nowrap" style={{ background: '#dc2626' }}
                  onClick={e => { e.stopPropagation(); setApprovalDeciding({ id: row.id, decision: 'rejected' }); setDecisionNotes(''); }}>
                  {tCrm('riskReject')}
                </button>
              </div>
            ) : undefined} />
        )}

        {/* Risk approval decision modal */}
        {approvalDeciding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="rounded-xl shadow-xl p-6 w-full max-w-md" style={{ background: 'var(--notion-bg)' }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--notion-text)' }}>
                {approvalDeciding.decision === 'approved' ? tCrm('confirmApproveRisk') : tCrm('confirmRejectRisk')}
              </h3>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm mb-4"
                style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }}
                rows={3}
                placeholder={tCrm('decisionNotesPlaceholder')}
                value={decisionNotes}
                onChange={e => setDecisionNotes(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}
                  onClick={() => { setApprovalDeciding(null); setDecisionNotes(''); }}>
                  {tCommon('cancel')}
                </button>
                <button className="px-4 py-2 rounded-md text-sm text-white"
                  style={{ background: approvalDeciding.decision === 'approved' ? '#16a34a' : '#dc2626' }}
                  onClick={decideApproval}>
                  {tCommon('confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contract timeline SlideOver */}
      <SlideOver open={!!selectedContract} onClose={() => { setSelectedContract(null); setTimeline(null); }}
        title={tCrm('contractTimeline', { no: selectedContract?.contract_no || '' })}>
        {!timeline ? (
          <div className="px-6 py-4 text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading...</div>
        ) : (
          <div className="px-6 py-4 space-y-4">
            <div>
              <p className="text-xs uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fulfillmentTasks')}</p>
              <p className="text-sm">{timeline.tasks?.filter((t: any) => t.status === 'done').length || 0}/{timeline.tasks?.length || 0}</p>
            </div>
            <div>
              <p className="text-xs uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('receivableRecords')}</p>
              {(timeline.receivables || []).map((r: any) => (
                <p key={r.id} className="text-sm">
                  {r.currency} {Number(r.amount || 0).toLocaleString()} / {tCrm('received')} {Number(r.received_amount || 0).toLocaleString()} ({r.status})
                </p>
              ))}
              {!(timeline.receivables?.length) && <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('noRecords')}</p>}
            </div>
          </div>
        )}
      </SlideOver>

      {/* Payment panel SlideOver */}
      <SlideOver open={!!paymentReceivable} onClose={() => setPaymentReceivable(null)}
        title={tCrm('paymentMgmt', { no: paymentReceivable?.contract_no || '' })}>
        {paymentReceivable && (
          <div className="px-6 py-4 space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('receivableAmount')}</p>
                <p className="text-sm font-semibold">{paymentReceivable.currency} {Number(paymentReceivable.amount || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('receivedAmount')}</p>
                <p className="text-sm font-semibold">{paymentReceivable.currency} {Number(paymentReceivable.received_amount || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('statusLabel')}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${paymentReceivable.status === 'paid' ? 'bg-green-100 text-green-700' : paymentReceivable.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'}`}>
                  {paymentReceivable.status === 'paid' ? tCrm('fullyReceived') : paymentReceivable.status === 'partial' ? tCrm('partiallyReceived') : tCrm('notReceived')}
                </span>
              </div>
            </div>

            {/* Payment history */}
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>{tCrm('paymentHistory')}</p>
              {loadingPayments ? (
                <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('loadingText')}</p>
              ) : payments.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('noPaymentRecords')}</p>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-auto">
                  {payments.map(p => (
                    <div key={p.id} className="rounded-lg px-3 py-2 border" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{paymentReceivable.currency} {Number(p.amount).toLocaleString()}</span>
                        <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{p.payment_date || p.created_at?.slice(0, 10)}</span>
                      </div>
                      {p.created_by_name && <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('operator')}: {p.created_by_name}</p>}
                      {p.notes && <p className="text-[10px] mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>{p.notes}</p>}
                      {p.payment_proof_url && (
                        <a href={p.payment_proof_url} target="_blank" rel="noreferrer" className="text-[10px] underline" style={{ color: 'var(--notion-accent)' }}>
                          {p.payment_proof_name || tCrm('viewProof')}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add payment form */}
            {paymentReceivable.status !== 'paid' && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>{tCrm('addPayment')}</p>
                <form onSubmit={submitPayment} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Inp type="number" required placeholder={tCrm('paymentAmountReq')} value={paymentForm.amount} onChange={v => setPaymentForm({ ...paymentForm, amount: v })} />
                    <Inp type="date" placeholder={tCrm('paymentDate')} value={paymentForm.payment_date} onChange={v => setPaymentForm({ ...paymentForm, payment_date: v })} />
                  </div>
                  <Inp placeholder={tCrm('notesLabel')} value={paymentForm.notes} onChange={v => setPaymentForm({ ...paymentForm, notes: v })} />
                  <div className="flex items-center gap-2">
                    {paymentForm.payment_proof_url ? (
                      <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'var(--notion-border)' }}>
                        {paymentForm.payment_proof_name || tCrm('proofUploaded')} <button type="button" onClick={() => setPaymentForm(prev => ({ ...prev, payment_proof_url: '', payment_proof_name: '' }))} className="ml-1" style={{ color: '#9B9A97' }}>✕</button>
                      </span>
                    ) : (
                      <label className="text-[10px] px-2.5 py-1 rounded-lg cursor-pointer border" style={{ borderColor: 'var(--notion-border)', color: uploadingProof ? '#9ca3af' : 'var(--notion-text)' }}>
                        {uploadingProof ? tCrm('uploadingProof') : tCrm('uploadProof')}
                        <input type="file" className="hidden" disabled={uploadingProof} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={async e => { const f = e.target.files?.[0]; if (f) await handleProofUpload(f); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setPaymentReceivable(null)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--notion-border)' }}>{tCrm('closeBtn')}</button>
                    <button type="submit" disabled={submittingPayment || !paymentForm.amount} className="px-3 py-1.5 rounded text-white text-sm disabled:opacity-40" style={{ background: 'var(--notion-accent)' }}>
                      {submittingPayment ? tCrm('submittingText') : tCrm('confirmPayment')}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </SlideOver>

      {/* Lead modal */}
      {showLeadModal && (
        <LeadModal
          users={tenantUsers}
          onClose={() => setShowLeadModal(false)}
          onSave={async () => { setShowLeadModal(false); await loadAll(); }}
        />
      )}

      {/* Contract modal */}
      {showContractModal && (
        <Modal title={tCrm('newContractTitle')} onClose={() => setShowContractModal(false)}>
          <form onSubmit={createContract} className="space-y-2">
            <Inp required placeholder={tCrm('contractNoReq')} value={contractForm.contract_no} onChange={v => setContractForm({ ...contractForm, contract_no: v })} />
            <Inp placeholder={tCrm('clientName')} value={contractForm.account_name} onChange={v => setContractForm({ ...contractForm, account_name: v })} />
            <div className="grid grid-cols-2 gap-2">
              <Inp type="number" placeholder={tCrm('contractAmount')} value={contractForm.contract_amount} onChange={v => setContractForm({ ...contractForm, contract_amount: v })} />
              <Inp placeholder={tCrm('currency')} value={contractForm.currency} onChange={v => setContractForm({ ...contractForm, currency: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Inp placeholder={tCrm('paymentMethod')} value={contractForm.payment_method} onChange={v => setContractForm({ ...contractForm, payment_method: v })} />
              <Inp placeholder={tCrm('tradeTerms')} value={contractForm.incoterm} onChange={v => setContractForm({ ...contractForm, incoterm: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Inp type="date" placeholder={tCrm('signDate')} value={contractForm.sign_date} onChange={v => setContractForm({ ...contractForm, sign_date: v })} />
              <Inp type="date" placeholder={tCrm('eta')} value={contractForm.eta} onChange={v => setContractForm({ ...contractForm, eta: v })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={contractForm.create_operation_order} onChange={e => setContractForm({ ...contractForm, create_operation_order: e.target.checked })} />
              {tCrm('autoCreateOrder')}
            </label>

            {/* Line items section */}
            <div className="border rounded-lg p-3 mt-2" style={{ borderColor: 'var(--notion-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: '#9B9A97' }}>产品明细</span>
                <button type="button" onClick={() => setContractLineItems(prev => [...prev, { product_id: '', product_name: '', quantity: '', unit_price: '' }])}
                  className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--notion-hover)', color: 'var(--notion-text)' }}>+ 添加产品</button>
              </div>
              {contractLineItems.map((li, idx) => {
                const liTotal = (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-1 mb-1 items-center">
                    <div className="col-span-4">
                      <select value={li.product_id} className="w-full text-xs px-1 py-1 rounded border" style={{ borderColor: 'var(--notion-border)' }}
                        onChange={e => {
                          const pid = e.target.value;
                          const prod = inventoryProducts.find(p => p.id === pid);
                          setContractLineItems(prev => prev.map((x, i) => i === idx ? { ...x, product_id: pid, product_name: prod?.name || x.product_name, unit_price: prod?.sell_price?.toString() || x.unit_price } : x));
                        }}>
                        <option value="">选择产品</option>
                        {inventoryProducts.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input placeholder="数量" type="number" value={li.quantity} className="w-full text-xs px-1 py-1 rounded border" style={{ borderColor: 'var(--notion-border)' }}
                        onChange={e => setContractLineItems(prev => prev.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
                    </div>
                    <div className="col-span-3">
                      <input placeholder="单价" type="number" value={li.unit_price} className="w-full text-xs px-1 py-1 rounded border" style={{ borderColor: 'var(--notion-border)' }}
                        onChange={e => setContractLineItems(prev => prev.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))} />
                    </div>
                    <div className="col-span-1 text-right text-[10px]" style={{ color: '#9B9A97' }}>{liTotal > 0 ? liTotal.toLocaleString() : ''}</div>
                    <div className="col-span-1 text-center">
                      <button type="button" onClick={() => setContractLineItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs" style={{ color: '#dc2626' }}>✕</button>
                    </div>
                  </div>
                );
              })}
              {contractLineItems.length > 0 && (
                <div className="text-right text-xs font-semibold mt-1" style={{ color: '#374151' }}>
                  合计: {contractLineItems.reduce((s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0), 0).toLocaleString()}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setShowContractModal(false); setContractLineItems([]); }} className="px-3 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }}>{tCrm('cancelBtn')}</button>
              <button type="submit" className="px-3 py-1.5 rounded text-white" style={{ background: 'var(--notion-accent)' }}>{tCommon('save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Receivable modal */}
      {showReceivableModal && (
        <Modal title={tCrm('newReceivableTitle')} onClose={() => setShowReceivableModal(false)}>
          <form onSubmit={createReceivable} className="space-y-2">
            <select required className="w-full px-3 py-2 rounded-md text-sm bg-white border" style={{ borderColor: 'var(--notion-border)' }}
              value={receivableForm.contract_id} onChange={e => setReceivableForm({ ...receivableForm, contract_id: e.target.value })}>
              <option value="">{tCrm('selectContract')}</option>
              {contractOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Inp type="date" placeholder={tCrm('dueDate')} value={receivableForm.due_date} onChange={v => setReceivableForm({ ...receivableForm, due_date: v })} />
              <Inp type="number" placeholder={tCrm('receivableAmountLabel')} value={receivableForm.amount} onChange={v => setReceivableForm({ ...receivableForm, amount: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Inp placeholder={tCrm('currencyLabel')} value={receivableForm.currency} onChange={v => setReceivableForm({ ...receivableForm, currency: v })} />
              <Inp type="number" placeholder={tCrm('receivedAmountLabel')} value={receivableForm.received_amount} onChange={v => setReceivableForm({ ...receivableForm, received_amount: v })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowReceivableModal(false)} className="px-3 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }}>{tCrm('cancelBtn')}</button>
              <button type="submit" className="px-3 py-1.5 rounded text-white" style={{ background: 'var(--notion-accent)' }}>{tCommon('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base" style={{ color: 'var(--notion-text)' }}>{title}</h3>
          <button onClick={onClose} style={{ color: '#9B9A97' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Inp({ value, onChange, placeholder, required, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder: string; required?: boolean; type?: string;
}) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      required={required} type={type}
      className="w-full px-3 py-2 rounded-md text-sm outline-none border"
      style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
  );
}
