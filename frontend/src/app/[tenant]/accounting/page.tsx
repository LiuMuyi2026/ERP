'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import NotionTable, { Column } from '@/components/ui/NotionTable';
import SlideOver from '@/components/ui/SlideOver';

// ── Types ────────────────────────────────────────────────────────────────────

type Contract = {
  id: string; contract_no: string; account_id?: string; lead_id?: string;
  order_id?: string; contract_amount: number; currency: string;
  payment_method: string; incoterm?: string; sign_date?: string; eta?: string;
  status: string; risk_level: string; remarks?: string;
  account_name?: string; receivable_outstanding: number; payable_outstanding: number;
};
type CrmReceivable = {
  id: string; contract_id: string; contract_no: string; due_date?: string;
  amount: number; received_amount: number; currency: string; status: string;
  invoice_no?: string; lead_name?: string; assigned_name?: string; notes?: string;
};
type ReceivablePayment = {
  id: string; receivable_id: string; amount: number; payment_date?: string;
  payment_proof_url?: string; payment_proof_name?: string; notes?: string;
  created_by_name?: string; created_at?: string;
};
type CrmPayable = {
  id: string; contract_id: string; contract_no: string; due_date?: string;
  amount: number; paid_amount: number; currency: string; status: string;
  invoice_no?: string; supplier_name?: string; assigned_name?: string; notes?: string;
};
type PayablePayment = {
  id: string; payable_id: string; amount: number; payment_date?: string;
  payment_method?: string; reference_no?: string;
  payment_proof_url?: string; payment_proof_name?: string; notes?: string;
  created_by_name?: string; created_at?: string;
};

type TabKey = 'receivable' | 'payable' | 'profit';

type ProfitRow = {
  id: string; name: string; status?: string | null;
  total_revenue: number; total_cost: number; gross_profit: number;
  margin_pct: number; contract_count: number;
};
type ProfitDimension = 'lead' | 'customer' | 'salesperson' | 'product';
type ProfitSortKey = 'name' | 'total_revenue' | 'total_cost' | 'gross_profit' | 'margin_pct' | 'contract_count';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700', cancelled: 'bg-gray-100 text-gray-400',
  paid: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700',
  unpaid: 'bg-orange-100 text-orange-700', open: 'bg-orange-100 text-orange-700',
  overdue: 'bg-red-100 text-red-700', sent: 'bg-blue-100 text-blue-700',
};

function getStatusLabel(tAccounting: any): Record<string, string> {
  return {
    unpaid: tAccounting('statusUnpaid'), partial: tAccounting('statusPartial'), paid: tAccounting('statusPaid'), open: tAccounting('statusOpen'),
    draft: tAccounting('statusDraft'), active: tAccounting('statusActive'), completed: tAccounting('statusCompleted'), cancelled: tAccounting('statusCancelled'),
    sent: tAccounting('statusSent'), overdue: tAccounting('statusOverdue'),
  };
}

function getPayableStatusLabel(tAccounting: any): Record<string, string> {
  return {
    unpaid: tAccounting('payStatusUnpaid'), partial: tAccounting('payStatusPartial'), paid: tAccounting('payStatusPaid'), open: tAccounting('payStatusOpen'),
    draft: tAccounting('statusDraft'), active: tAccounting('statusActive'), completed: tAccounting('statusCompleted'), cancelled: tAccounting('statusCancelled'),
    overdue: tAccounting('statusOverdue'),
  };
}

const FMT = (n: number, currency?: string) => {
  const prefix = currency || '$';
  return `${prefix === '$' || prefix === 'USD' ? '$' : prefix + ' '}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

// ── PaymentCard (per-payment record with proof upload) ───────────────────────

function PaymentCard({ payment, currency, onProofUploaded }: {
  payment: ReceivablePayment | PayablePayment; currency: string;
  onProofUploaded: (url: string, name: string) => void;
}) {
  const tAccounting = useTranslations('accounting');
  const tCommon = useTranslations('common');
  const [uploading, setUploading] = useState(false);

  async function uploadProof(file: File) {
    setUploading(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file);
      onProofUploaded(result.url, result.name);
    } catch { alert(tAccounting('uploadFailed')); }
    finally { setUploading(false); }
  }

  return (
    <div className="rounded-lg px-3 py-2.5 border" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{FMT(payment.amount, currency)}</span>
        <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{payment.payment_date || payment.created_at?.slice(0, 10)}</span>
      </div>
      {payment.created_by_name && <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('operatorLabel')}: {payment.created_by_name}</p>}
      {'payment_method' in payment && payment.payment_method && <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('methodLabel')}: {payment.payment_method}</p>}
      {'reference_no' in payment && payment.reference_no && <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('referenceLabel')}: {payment.reference_no}</p>}
      {payment.notes && <p className="text-[10px] mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>{payment.notes}</p>}
      {/* Proof area */}
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        {payment.payment_proof_url ? (
          <a href={payment.payment_proof_url} target="_blank" rel="noreferrer"
            className="text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-accent)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {payment.payment_proof_name || tAccounting('viewProof')}
          </a>
        ) : (
          <label className="text-[10px] px-2 py-0.5 rounded border cursor-pointer inline-flex items-center gap-1"
            style={{ borderColor: 'var(--notion-border)', color: uploading ? '#9ca3af' : 'var(--notion-text-muted)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {uploading ? tAccounting('uploadingText') : tAccounting('uploadProofBtn')}
            <input type="file" className="hidden" disabled={uploading} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={async e => { const f = e.target.files?.[0]; if (f) await uploadProof(f); e.target.value = ''; }} />
          </label>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const tAccounting = useTranslations('accounting');
  const tCommon = useTranslations('common');
  const [tab, setTab] = useState<TabKey>('receivable');

  // Summary stats
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [receivables, setReceivables] = useState<CrmReceivable[]>([]);
  const [payables, setPayables] = useState<CrmPayable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/crm/contracts').catch(() => []),
      api.get('/api/crm/receivables').catch(() => []),
      api.get('/api/crm/payables').catch(() => []),
    ]).then(([c, r, p]) => {
      setContracts(Array.isArray(c) ? c : []);
      setReceivables(Array.isArray(r) ? r : []);
      setPayables(Array.isArray(p) ? p : []);
    }).finally(() => setLoading(false));
  }, []);

  const totalReceivable = receivables.filter(r => r.status !== 'paid').reduce((s, r) => s + (r.amount - r.received_amount), 0);
  const totalContractValue = contracts.filter(c => c.status === 'active').reduce((s, c) => s + c.contract_amount, 0);
  const totalPayable = payables.filter(p => p.status !== 'paid').reduce((s, p) => s + (p.amount - (p.paid_amount || 0)), 0);
  const overduePayable = payables.filter(p => p.status !== 'paid' && p.due_date && new Date(p.due_date) < new Date()).length;

  if (loading) return <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</div>;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--notion-text)' }}>{tAccounting('financeTitle')}</h1>
        <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('financeSubtitle')}</p>
      </div>

      {/* KPI cards */}
      <div className="px-8 pb-4 grid grid-cols-4 gap-3">
        {[
          { label: tAccounting('kpiReceivableOutstanding'), value: FMT(totalReceivable), color: '#c2410c', bg: '#fff7ed' },
          { label: tAccounting('kpiContractValueActive'), value: FMT(totalContractValue), color: '#16a34a', bg: '#f0fdf4' },
          { label: tAccounting('kpiPayableOutstanding'), value: FMT(totalPayable), color: '#dc2626', bg: '#fef2f2' },
          { label: tAccounting('kpiPayableOverdue'), value: String(overduePayable), color: '#7c3aed', bg: '#f5f3ff' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-lg px-4 py-3" style={{ background: bg }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color }}>{label}</p>
            <p className="text-lg font-bold" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="px-8 pb-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--notion-active)' }}>
          {([
            { key: 'receivable' as const, label: tAccounting('tabReceivableMgmt') },
            { key: 'payable' as const, label: tAccounting('tabPayableMgmt') },
            { key: 'profit' as const, label: tAccounting('profitAnalysis') },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-4 py-1.5 rounded text-sm font-medium transition-colors"
              style={{
                background: tab === key ? 'white' : 'transparent',
                color: tab === key ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto px-8 py-4">
        {tab === 'receivable' && (
          <ReceivableTab
            contracts={contracts} setContracts={setContracts}
            receivables={receivables} setReceivables={setReceivables}
          />
        )}
        {tab === 'payable' && (
          <PayableTab
            contracts={contracts} setContracts={setContracts}
            payables={payables} setPayables={setPayables}
          />
        )}
        {tab === 'profit' && <ProfitAnalysisTab />}
      </div>
    </div>
  );
}

// ── Receivable Tab ─────────────────────────────────────────────────────────────

function ReceivableTab({
  contracts, setContracts, receivables, setReceivables,
}: {
  contracts: Contract[]; setContracts: React.Dispatch<React.SetStateAction<Contract[]>>;
  receivables: CrmReceivable[]; setReceivables: React.Dispatch<React.SetStateAction<CrmReceivable[]>>;
}) {
  const tAccounting = useTranslations('accounting');
  const tCommon = useTranslations('common');
  const STATUS_LABEL = getStatusLabel(tAccounting);
  const [segment, setSegment] = useState<'contract' | 'receivable'>('contract');

  // Payment panel
  const [paymentTarget, setPaymentTarget] = useState<CrmReceivable | null>(null);
  const [payments, setPayments] = useState<ReceivablePayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: '', notes: '', payment_proof_url: '', payment_proof_name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Create receivable form
  const [showCreateReceivable, setShowCreateReceivable] = useState(false);
  const [createForm, setCreateForm] = useState({ contract_id: '', amount: '', due_date: '', currency: 'USD', invoice_no: '', notes: '' });
  const [creating, setCreating] = useState(false);

  // Contract detail
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [contractReceivables, setContractReceivables] = useState<CrmReceivable[]>([]);
  const [loadingContractDetail, setLoadingContractDetail] = useState(false);

  async function openContractDetail(contract: Contract) {
    setSelectedContract(contract);
    setLoadingContractDetail(true);
    try {
      const detail = await api.get(`/api/crm/contracts/${contract.id}`);
      setContractReceivables(Array.isArray(detail.receivables) ? detail.receivables : []);
    } catch {
      setContractReceivables(receivables.filter(r => r.contract_id === contract.id));
    }
    finally { setLoadingContractDetail(false); }
  }

  async function openPaymentPanel(rec: CrmReceivable) {
    setPaymentTarget(rec);
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
    if (!paymentTarget || !paymentForm.amount) return;
    setSubmitting(true);
    try {
      const result: any = await api.post(`/api/crm/receivables/${paymentTarget.id}/payments`, {
        amount: Number(paymentForm.amount),
        payment_date: paymentForm.payment_date || null,
        payment_proof_url: paymentForm.payment_proof_url || null,
        payment_proof_name: paymentForm.payment_proof_name || null,
        notes: paymentForm.notes || null,
      });
      const data = await api.get(`/api/crm/receivables/${paymentTarget.id}/payments`);
      setPayments(Array.isArray(data) ? data : []);
      setReceivables(prev => prev.map(r => r.id === paymentTarget.id
        ? { ...r, received_amount: result.new_received_amount, status: result.new_status } : r));
      setPaymentTarget(prev => prev ? { ...prev, received_amount: result.new_received_amount, status: result.new_status } : null);
      setPaymentForm({ amount: '', payment_date: '', notes: '', payment_proof_url: '', payment_proof_name: '' });
    } catch (err: any) { alert(err.message || tAccounting('submitFailedText')); }
    finally { setSubmitting(false); }
  }

  async function handleProofUpload(file: File) {
    setUploadingProof(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file);
      setPaymentForm(prev => ({ ...prev, payment_proof_url: result.url, payment_proof_name: result.name }));
    } catch (err: any) { alert(tAccounting('uploadFailed') + ': ' + (err.message || '')); }
    finally { setUploadingProof(false); }
  }

  async function createReceivable(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.contract_id || !createForm.amount) return;
    setCreating(true);
    try {
      const result: any = await api.post('/api/crm/receivables', {
        contract_id: createForm.contract_id,
        amount: Number(createForm.amount),
        due_date: createForm.due_date || null,
        currency: createForm.currency,
        invoice_no: createForm.invoice_no || null,
        notes: createForm.notes || null,
        received_amount: 0,
        status: 'unpaid',
      });
      // Refresh receivables
      const fresh = await api.get('/api/crm/receivables');
      setReceivables(Array.isArray(fresh) ? fresh : []);
      setShowCreateReceivable(false);
      setCreateForm({ contract_id: '', amount: '', due_date: '', currency: 'USD', invoice_no: '', notes: '' });
    } catch (err: any) { alert(err.message || tAccounting('createFailedText')); }
    finally { setCreating(false); }
  }

  // ── Contract columns ──
  const contractCols: Column<Contract>[] = [
    { key: 'contract_no', label: tAccounting('colContractNo'), type: 'mono' },
    { key: 'account_name', label: tAccounting('colClient'), render: v => v || '—' },
    { key: 'contract_amount', label: tAccounting('colContractAmount'), render: (v, r) => FMT(v, r.currency) },
    { key: 'payment_method', label: tAccounting('colPayMethod'), render: v => v || '—' },
    { key: 'sign_date', label: tAccounting('colSignDate'), type: 'date' },
    { key: 'receivable_outstanding', label: tAccounting('colOutstandingReceivable'), render: (v, r) => v > 0 ? <span style={{ color: '#c2410c', fontWeight: 600 }}>{FMT(v, r.currency)}</span> : <span style={{ color: 'var(--notion-text-muted)' }}>—</span> },
    { key: 'status', label: tAccounting('colStatusLabel'), render: v => <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[v] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[v] || v}</span> },
  ];

  // ── Receivable columns ──
  const receivableCols: Column<CrmReceivable>[] = [
    { key: 'contract_no', label: tAccounting('colContractNo'), type: 'mono' },
    { key: 'invoice_no', label: tAccounting('colInvoiceNo'), render: v => v || '—' },
    { key: 'due_date', label: tAccounting('colDueDateLabel'), type: 'date' },
    { key: 'amount', label: tAccounting('colReceivableAmt'), render: (v, r) => FMT(v, r.currency) },
    { key: 'received_amount', label: tAccounting('colReceivedAmt'), render: (v, r) => FMT(v, r.currency) },
    { key: 'status', label: tAccounting('colStatusLabel'), render: v => <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[v] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[v] || v}</span> },
    { key: 'lead_name', label: tAccounting('colLeadName'), render: v => v || '—' },
    { key: 'assigned_name', label: tAccounting('colAssignedName'), render: v => v || '—' },
  ];

  return (
    <div className="space-y-4">
      {/* Segment control + Create */}
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--notion-active)' }}>
          {([
            { key: 'contract' as const, label: tAccounting('contractOverview') },
            { key: 'receivable' as const, label: tAccounting('receivableDetail') },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setSegment(key)}
              className="px-3 py-1 rounded text-sm font-medium transition-colors"
              style={{
                background: segment === key ? 'white' : 'transparent',
                color: segment === key ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                boxShadow: segment === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>
        {segment === 'receivable' && (
          <div className="ml-auto">
            <button onClick={() => setShowCreateReceivable(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
              style={{ background: 'var(--notion-accent)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {tAccounting('newReceivableBtn')}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {segment === 'contract' ? (
        <NotionTable
          columns={contractCols}
          data={contracts}
          statusColors={STATUS_COLORS}
          onRowClick={openContractDetail}
          emptyMessage={tAccounting('noContracts')}
        />
      ) : (
        <NotionTable
          columns={receivableCols}
          data={receivables}
          statusColors={STATUS_COLORS}
          emptyMessage={tAccounting('noReceivableRecords')}
          rowActions={row => row.status !== 'paid' ? (
            <button className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
              style={{ color: '#16a34a', background: '#f0fdf4' }}
              onClick={e => { e.stopPropagation(); openPaymentPanel(row); }}>
              {tAccounting('registerPayment')}
            </button>
          ) : null}
        />
      )}

      {/* Contract Detail SlideOver */}
      <SlideOver open={!!selectedContract} onClose={() => setSelectedContract(null)}
        title={tAccounting('contractDetailTitle', { no: selectedContract?.contract_no || '' })} width="w-[560px]">
        {selectedContract && (
          <div className="px-6 py-4 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: tAccounting('contractFieldClient'), value: selectedContract.account_name || '—' },
                { label: tAccounting('contractFieldAmount'), value: FMT(selectedContract.contract_amount, selectedContract.currency) },
                { label: tAccounting('contractFieldPaymentMethod'), value: selectedContract.payment_method || '—' },
                { label: tAccounting('contractFieldTradeTerms'), value: selectedContract.incoterm || '—' },
                { label: tAccounting('contractFieldSignDate'), value: selectedContract.sign_date ? new Date(selectedContract.sign_date).toLocaleDateString() : '—' },
                { label: tAccounting('contractFieldETA'), value: selectedContract.eta ? new Date(selectedContract.eta).toLocaleDateString() : '—' },
                { label: tAccounting('contractFieldStatus'), value: STATUS_LABEL[selectedContract.status] || selectedContract.status },
                { label: tAccounting('contractFieldOutstanding'), value: FMT(selectedContract.receivable_outstanding, selectedContract.currency) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--notion-text-muted)' }}>{label}</dt>
                  <dd className="text-sm" style={{ color: 'var(--notion-text)' }}>{value}</dd>
                </div>
              ))}
            </div>
            {selectedContract.remarks && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('contractFieldRemarks')}</dt>
                <dd className="text-sm" style={{ color: 'var(--notion-text)' }}>{selectedContract.remarks}</dd>
              </div>
            )}

            {/* Contract receivables */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{tAccounting('receivableItems')}</p>
                <button onClick={() => { setShowCreateReceivable(true); setCreateForm(prev => ({ ...prev, contract_id: selectedContract.id, currency: selectedContract.currency })); }}
                  className="text-xs font-medium" style={{ color: 'var(--notion-accent)' }}>{tAccounting('newReceivableSmall')}</button>
              </div>
              {loadingContractDetail ? (
                <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</p>
              ) : contractReceivables.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('noReceivableForContract')}</p>
              ) : (
                <div className="space-y-2">
                  {contractReceivables.map((rec: any) => (
                    <div key={rec.id} className="rounded-lg px-3 py-2.5 border" style={{ borderColor: 'var(--notion-border)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                            {FMT(rec.amount, rec.currency)}
                          </span>
                          {rec.invoice_no && <span className="ml-2 text-[10px] font-mono" style={{ color: 'var(--notion-text-muted)' }}>{rec.invoice_no}</span>}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[rec.status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[rec.status] || rec.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>
                          {tAccounting('receivedLabel')} {FMT(rec.received_amount, rec.currency)}{rec.due_date ? ` · ${tAccounting('dueLabel')} ${new Date(rec.due_date).toLocaleDateString()}` : ''}
                        </span>
                        {rec.status !== 'paid' && (
                          <button onClick={() => { setSelectedContract(null); openPaymentPanel(rec); }}
                            className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ color: '#16a34a', background: '#f0fdf4' }}>
                            {tAccounting('registerPaymentSmall')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* Payment SlideOver */}
      <SlideOver open={!!paymentTarget} onClose={() => setPaymentTarget(null)}
        title={tAccounting('paymentMgmtTitle', { no: paymentTarget?.contract_no || '' })} width="w-[520px]">
        {paymentTarget && (() => {
          const totalAmt = paymentTarget.amount || 0;
          const receivedAmt = paymentTarget.received_amount || 0;
          const remaining = totalAmt - receivedAmt;
          const pct = totalAmt > 0 ? Math.min(receivedAmt / totalAmt, 1) : 0;
          const isFullyPaid = pct >= 1;
          const canComplete = isFullyPaid && paymentTarget.status !== 'paid';

          return (
            <div className="px-6 py-4 space-y-5">
              {/* Progress header */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{tAccounting('paymentProgress')}</span>
                  <span className="text-sm font-bold" style={{ color: isFullyPaid ? '#16a34a' : '#c2410c' }}>{Math.round(pct * 100)}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--notion-active)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct * 100}%`, background: isFullyPaid ? '#16a34a' : pct > 0.5 ? '#eab308' : '#c2410c' }} />
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4' }}>
                  <p className="text-[10px] font-semibold" style={{ color: '#16a34a' }}>{tAccounting('receivableAmountLabel')}</p>
                  <p className="text-sm font-bold" style={{ color: '#16a34a' }}>{FMT(totalAmt, paymentTarget.currency)}</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: '#eff6ff' }}>
                  <p className="text-[10px] font-semibold" style={{ color: '#2563eb' }}>{tAccounting('receivedAmountLabel')}</p>
                  <p className="text-sm font-bold" style={{ color: '#2563eb' }}>{FMT(receivedAmt, paymentTarget.currency)}</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: remaining > 0 ? '#fff7ed' : '#f0fdf4' }}>
                  <p className="text-[10px] font-semibold" style={{ color: remaining > 0 ? '#c2410c' : '#16a34a' }}>{remaining > 0 ? tAccounting('remainingBalance') : tAccounting('fullyCollected')}</p>
                  <p className="text-sm font-bold" style={{ color: remaining > 0 ? '#c2410c' : '#16a34a' }}>{FMT(Math.max(remaining, 0), paymentTarget.currency)}</p>
                </div>
              </div>

              {/* Complete button — only when 100% received */}
              {canComplete && (
                <button
                  onClick={async () => {
                    try {
                      await api.patch(`/api/crm/receivables/${paymentTarget.id}`, { status: 'paid' });
                      setReceivables(prev => prev.map(r => r.id === paymentTarget.id ? { ...r, status: 'paid' } : r));
                      setPaymentTarget(prev => prev ? { ...prev, status: 'paid' } : null);
                    } catch (err: any) { alert(err.message || tAccounting('operationFailed')); }
                  }}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#16a34a' }}>
                  {tAccounting('confirmFullCollection')}
                </button>
              )}
              {paymentTarget.status === 'paid' && (
                <div className="w-full py-2.5 rounded-lg text-sm font-semibold text-center" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  {tAccounting('fullCollectionDone')}
                </div>
              )}

              {/* Payment history */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>
                  {tAccounting('paymentRecords')} {payments.length > 0 && <span style={{ color: 'var(--notion-text-muted)', fontWeight: 400 }}>{tAccounting('paymentRecordsCount', { n: payments.length })}</span>}
                </p>
                {loadingPayments ? (
                  <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</p>
                ) : payments.length === 0 ? (
                  <p className="text-sm py-3 text-center" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('noPaymentRecords')}</p>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-auto">
                    {payments.map(p => (
                      <PaymentCard key={p.id} payment={p} currency={paymentTarget.currency}
                        onProofUploaded={async (url, name) => {
                          try {
                            await api.patch(`/api/crm/receivable-payments/${p.id}/proof`, {
                              payment_proof_url: url,
                              payment_proof_name: name,
                            });
                            const data = await api.get(`/api/crm/receivables/${paymentTarget.id}/payments`);
                            setPayments(Array.isArray(data) ? data : []);
                          } catch { }
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Add payment form — always visible unless status is 'paid' */}
              {paymentTarget.status !== 'paid' && (
                <div className="border-t pt-4" style={{ borderColor: 'var(--notion-border)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>{tAccounting('newPaymentEntry')}</p>
                  <form onSubmit={submitPayment} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" step="0.01" required placeholder={tAccounting('paymentAmountReq')} value={paymentForm.amount}
                        onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                        style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                      <input type="date" value={paymentForm.payment_date}
                        onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                        style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>
                    <input placeholder={tAccounting('notesBankInfo')} value={paymentForm.notes}
                      onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                      style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                    {/* Proof upload for this payment */}
                    <div className="flex items-center gap-2">
                      {paymentForm.payment_proof_url ? (
                        <span className="text-[10px] px-2 py-1 rounded-full border flex items-center gap-1" style={{ borderColor: 'var(--notion-border)' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          {paymentForm.payment_proof_name || tAccounting('proofUploaded')}
                          <button type="button" onClick={() => setPaymentForm(prev => ({ ...prev, payment_proof_url: '', payment_proof_name: '' }))} className="ml-0.5" style={{ color: '#9B9A97' }}>✕</button>
                        </span>
                      ) : (
                        <label className="text-[10px] px-2.5 py-1 rounded-lg cursor-pointer border flex items-center gap-1" style={{ borderColor: 'var(--notion-border)', color: uploadingProof ? '#9ca3af' : 'var(--notion-text)' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          {uploadingProof ? tAccounting('uploadingText') : tAccounting('uploadProofReceipt')}
                          <input type="file" className="hidden" disabled={uploadingProof} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            onChange={async e => { const f = e.target.files?.[0]; if (f) await handleProofUpload(f); e.target.value = ''; }} />
                        </label>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setPaymentTarget(null)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--notion-border)' }}>{tAccounting('closeBtn')}</button>
                      <button type="submit" disabled={submitting || !paymentForm.amount} className="px-3 py-1.5 rounded text-white text-sm disabled:opacity-40" style={{ background: 'var(--notion-accent)' }}>
                        {submitting ? tAccounting('submitFailedText') : tAccounting('confirmPaymentBtn')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          );
        })()}
      </SlideOver>

      {/* Create Receivable Modal */}
      {showCreateReceivable && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tAccounting('newReceivableTitle')}</h3>
            <form onSubmit={createReceivable} className="space-y-3">
              <select required value={createForm.contract_id}
                onChange={e => setCreateForm({ ...createForm, contract_id: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                <option value="">{tAccounting('selectContractReq')}</option>
                {contracts.map(c => (
                  <option key={c.id} value={c.id}>{c.contract_no} — {c.account_name || tAccounting('unnamedClient')} ({FMT(c.contract_amount, c.currency)})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" required placeholder={tAccounting('receivableAmountReq')} value={createForm.amount}
                  onChange={e => setCreateForm({ ...createForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                <input placeholder={tAccounting('currencyField')} value={createForm.currency}
                  onChange={e => setCreateForm({ ...createForm, currency: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" placeholder={tAccounting('dueDateField')} value={createForm.due_date}
                  onChange={e => setCreateForm({ ...createForm, due_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                <input placeholder={tAccounting('invoiceNoOptional')} value={createForm.invoice_no}
                  onChange={e => setCreateForm({ ...createForm, invoice_no: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <input placeholder={tAccounting('notesField')} value={createForm.notes}
                onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateReceivable(false)} className="flex-1 py-2 rounded-md text-sm border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>{tCommon('cancel')}</button>
                <button type="submit" disabled={creating} className="flex-1 py-2 rounded-md text-sm text-white disabled:opacity-50"
                  style={{ background: 'var(--notion-accent)' }}>{creating ? tCommon('creating') : tCommon('create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Payable Tab ─────────────────────────────────────────────────────────────

function PayableTab({
  contracts, setContracts, payables, setPayables,
}: {
  contracts: Contract[]; setContracts: React.Dispatch<React.SetStateAction<Contract[]>>;
  payables: CrmPayable[]; setPayables: React.Dispatch<React.SetStateAction<CrmPayable[]>>;
}) {
  const tAccounting = useTranslations('accounting');
  const tCommon = useTranslations('common');
  const STATUS_LABEL = getStatusLabel(tAccounting);
  const PAYABLE_STATUS_LABEL = getPayableStatusLabel(tAccounting);
  const [segment, setSegment] = useState<'contract' | 'payable'>('contract');

  // Payment panel
  const [paymentTarget, setPaymentTarget] = useState<CrmPayable | null>(null);
  const [payments, setPayments] = useState<PayablePayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: '', payment_method: '', reference_no: '', notes: '', payment_proof_url: '', payment_proof_name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Create payable form
  const [showCreatePayable, setShowCreatePayable] = useState(false);
  const [createForm, setCreateForm] = useState({ contract_id: '', amount: '', due_date: '', currency: 'USD', invoice_no: '', supplier_name: '', notes: '' });
  const [creating, setCreating] = useState(false);

  // Contract detail
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [contractPayables, setContractPayables] = useState<CrmPayable[]>([]);
  const [loadingContractDetail, setLoadingContractDetail] = useState(false);

  async function openContractDetail(contract: Contract) {
    setSelectedContract(contract);
    setLoadingContractDetail(true);
    try {
      const detail = await api.get(`/api/crm/contracts/${contract.id}/timeline`);
      setContractPayables(Array.isArray(detail.payables) ? detail.payables : []);
    } catch {
      setContractPayables(payables.filter(p => p.contract_id === contract.id));
    }
    finally { setLoadingContractDetail(false); }
  }

  async function openPaymentPanel(rec: CrmPayable) {
    setPaymentTarget(rec);
    setPaymentForm({ amount: '', payment_date: '', payment_method: '', reference_no: '', notes: '', payment_proof_url: '', payment_proof_name: '' });
    setLoadingPayments(true);
    try {
      const data = await api.get(`/api/crm/payables/${rec.id}/payments`);
      setPayments(Array.isArray(data) ? data : []);
    } catch { setPayments([]); }
    finally { setLoadingPayments(false); }
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentTarget || !paymentForm.amount) return;
    setSubmitting(true);
    try {
      const result: any = await api.post(`/api/crm/payables/${paymentTarget.id}/payments`, {
        amount: Number(paymentForm.amount),
        payment_date: paymentForm.payment_date || null,
        payment_method: paymentForm.payment_method || null,
        reference_no: paymentForm.reference_no || null,
        payment_proof_url: paymentForm.payment_proof_url || null,
        payment_proof_name: paymentForm.payment_proof_name || null,
        notes: paymentForm.notes || null,
      });
      const data = await api.get(`/api/crm/payables/${paymentTarget.id}/payments`);
      setPayments(Array.isArray(data) ? data : []);
      setPayables(prev => prev.map(p => p.id === paymentTarget.id
        ? { ...p, paid_amount: result.new_paid_amount, status: result.new_status } : p));
      setPaymentTarget(prev => prev ? { ...prev, paid_amount: result.new_paid_amount, status: result.new_status } : null);
      setPaymentForm({ amount: '', payment_date: '', payment_method: '', reference_no: '', notes: '', payment_proof_url: '', payment_proof_name: '' });
    } catch (err: any) { alert(err.message || tAccounting('submitFailedText')); }
    finally { setSubmitting(false); }
  }

  async function handleProofUpload(file: File) {
    setUploadingProof(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file);
      setPaymentForm(prev => ({ ...prev, payment_proof_url: result.url, payment_proof_name: result.name }));
    } catch (err: any) { alert(tAccounting('uploadFailed') + ': ' + (err.message || '')); }
    finally { setUploadingProof(false); }
  }

  async function createPayable(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.contract_id || !createForm.amount) return;
    setCreating(true);
    try {
      await api.post('/api/crm/payables', {
        contract_id: createForm.contract_id,
        amount: Number(createForm.amount),
        due_date: createForm.due_date || null,
        currency: createForm.currency,
        invoice_no: createForm.invoice_no || null,
        supplier_name: createForm.supplier_name || null,
        notes: createForm.notes || null,
        paid_amount: 0,
        status: 'unpaid',
      });
      const fresh = await api.get('/api/crm/payables');
      setPayables(Array.isArray(fresh) ? fresh : []);
      setShowCreatePayable(false);
      setCreateForm({ contract_id: '', amount: '', due_date: '', currency: 'USD', invoice_no: '', supplier_name: '', notes: '' });
    } catch (err: any) { alert(err.message || tAccounting('createFailedText')); }
    finally { setCreating(false); }
  }

  // ── Contract columns ──
  const contractCols: Column<Contract>[] = [
    { key: 'contract_no', label: tAccounting('colContractNo'), type: 'mono' },
    { key: 'account_name', label: tAccounting('colClient'), render: v => v || '—' },
    { key: 'contract_amount', label: tAccounting('colContractAmount'), render: (v, r) => FMT(v, r.currency) },
    { key: 'payment_method', label: tAccounting('colPayMethod'), render: v => v || '—' },
    { key: 'sign_date', label: tAccounting('colSignDate'), type: 'date' },
    { key: 'payable_outstanding', label: tAccounting('colOutstandingPayable'), render: (v, r) => v > 0 ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{FMT(v, r.currency)}</span> : <span style={{ color: 'var(--notion-text-muted)' }}>—</span> },
    { key: 'status', label: tAccounting('colStatusLabel'), render: v => <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[v] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[v] || v}</span> },
  ];

  // ── Payable columns ──
  const payableCols: Column<CrmPayable>[] = [
    { key: 'contract_no', label: tAccounting('colContractNo'), type: 'mono' },
    { key: 'invoice_no', label: tAccounting('colInvoiceNo'), render: v => v || '—' },
    { key: 'supplier_name', label: tAccounting('colSupplierName'), render: v => v || '—' },
    { key: 'due_date', label: tAccounting('colDueDateLabel'), type: 'date' },
    { key: 'amount', label: tAccounting('colPayableAmt'), render: (v, r) => FMT(v, r.currency) },
    { key: 'paid_amount', label: tAccounting('colPaidAmt'), render: (v, r) => FMT(v, r.currency) },
    { key: 'status', label: tAccounting('colStatusLabel'), render: v => <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[v] || 'bg-gray-100 text-gray-600'}`}>{PAYABLE_STATUS_LABEL[v] || v}</span> },
    { key: 'assigned_name', label: tAccounting('colAssignedName'), render: v => v || '—' },
  ];

  return (
    <div className="space-y-4">
      {/* Segment control + Create */}
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--notion-active)' }}>
          {([
            { key: 'contract' as const, label: tAccounting('contractOverview') },
            { key: 'payable' as const, label: tAccounting('payableDetail') },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setSegment(key)}
              className="px-3 py-1 rounded text-sm font-medium transition-colors"
              style={{
                background: segment === key ? 'white' : 'transparent',
                color: segment === key ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                boxShadow: segment === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>
        {segment === 'payable' && (
          <div className="ml-auto">
            <button onClick={() => setShowCreatePayable(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
              style={{ background: 'var(--notion-accent)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {tAccounting('newPayableBtn')}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {segment === 'contract' ? (
        <NotionTable
          columns={contractCols}
          data={contracts}
          statusColors={STATUS_COLORS}
          onRowClick={openContractDetail}
          emptyMessage={tAccounting('noContracts')}
        />
      ) : (
        <NotionTable
          columns={payableCols}
          data={payables}
          statusColors={STATUS_COLORS}
          emptyMessage={tAccounting('noPayableRecords')}
          rowActions={row => row.status !== 'paid' ? (
            <button className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
              style={{ color: '#2563eb', background: '#eff6ff' }}
              onClick={e => { e.stopPropagation(); openPaymentPanel(row); }}>
              {tAccounting('registerPaymentPayable')}
            </button>
          ) : null}
        />
      )}

      {/* Contract Detail SlideOver */}
      <SlideOver open={!!selectedContract} onClose={() => setSelectedContract(null)}
        title={tAccounting('contractDetailTitle', { no: selectedContract?.contract_no || '' })} width="w-[560px]">
        {selectedContract && (
          <div className="px-6 py-4 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: tAccounting('contractFieldClient'), value: selectedContract.account_name || '—' },
                { label: tAccounting('contractFieldAmount'), value: FMT(selectedContract.contract_amount, selectedContract.currency) },
                { label: tAccounting('contractFieldPaymentMethod'), value: selectedContract.payment_method || '—' },
                { label: tAccounting('contractFieldTradeTerms'), value: selectedContract.incoterm || '—' },
                { label: tAccounting('contractFieldSignDate'), value: selectedContract.sign_date ? new Date(selectedContract.sign_date).toLocaleDateString() : '—' },
                { label: tAccounting('contractFieldETA'), value: selectedContract.eta ? new Date(selectedContract.eta).toLocaleDateString() : '—' },
                { label: tAccounting('contractFieldStatus'), value: STATUS_LABEL[selectedContract.status] || selectedContract.status },
                { label: tAccounting('contractFieldOutstandingPayable'), value: FMT(selectedContract.payable_outstanding, selectedContract.currency) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--notion-text-muted)' }}>{label}</dt>
                  <dd className="text-sm" style={{ color: 'var(--notion-text)' }}>{value}</dd>
                </div>
              ))}
            </div>
            {selectedContract.remarks && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('contractFieldRemarks')}</dt>
                <dd className="text-sm" style={{ color: 'var(--notion-text)' }}>{selectedContract.remarks}</dd>
              </div>
            )}

            {/* Contract payables */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{tAccounting('payableItems')}</p>
                <button onClick={() => { setShowCreatePayable(true); setCreateForm(prev => ({ ...prev, contract_id: selectedContract.id, currency: selectedContract.currency })); }}
                  className="text-xs font-medium" style={{ color: 'var(--notion-accent)' }}>{tAccounting('newPayableSmall')}</button>
              </div>
              {loadingContractDetail ? (
                <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</p>
              ) : contractPayables.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('noPayableForContract')}</p>
              ) : (
                <div className="space-y-2">
                  {contractPayables.map((rec: any) => (
                    <div key={rec.id} className="rounded-lg px-3 py-2.5 border" style={{ borderColor: 'var(--notion-border)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                            {FMT(rec.amount, rec.currency)}
                          </span>
                          {rec.invoice_no && <span className="ml-2 text-[10px] font-mono" style={{ color: 'var(--notion-text-muted)' }}>{rec.invoice_no}</span>}
                          {rec.supplier_name && <span className="ml-2 text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{rec.supplier_name}</span>}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[rec.status] || 'bg-gray-100 text-gray-600'}`}>
                          {PAYABLE_STATUS_LABEL[rec.status] || rec.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>
                          {tAccounting('paidLabel')} {FMT(rec.paid_amount, rec.currency)}{rec.due_date ? ` · ${tAccounting('dueLabel')} ${new Date(rec.due_date).toLocaleDateString()}` : ''}
                        </span>
                        {rec.status !== 'paid' && (
                          <button onClick={() => { setSelectedContract(null); openPaymentPanel(rec); }}
                            className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ color: '#2563eb', background: '#eff6ff' }}>
                            {tAccounting('registerPaymentPayable')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* Payment SlideOver */}
      <SlideOver open={!!paymentTarget} onClose={() => setPaymentTarget(null)}
        title={tAccounting('paymentMgmtPayableTitle', { no: paymentTarget?.contract_no || '' })} width="w-[520px]">
        {paymentTarget && (() => {
          const totalAmt = paymentTarget.amount || 0;
          const paidAmt = paymentTarget.paid_amount || 0;
          const remaining = totalAmt - paidAmt;
          const pct = totalAmt > 0 ? Math.min(paidAmt / totalAmt, 1) : 0;
          const isFullyPaid = pct >= 1;
          const canComplete = isFullyPaid && paymentTarget.status !== 'paid';

          return (
            <div className="px-6 py-4 space-y-5">
              {/* Progress header */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{tAccounting('paymentProgressPayable')}</span>
                  <span className="text-sm font-bold" style={{ color: isFullyPaid ? '#16a34a' : '#dc2626' }}>{Math.round(pct * 100)}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--notion-active)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct * 100}%`, background: isFullyPaid ? '#16a34a' : pct > 0.5 ? '#eab308' : '#dc2626' }} />
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg px-3 py-2" style={{ background: '#fef2f2' }}>
                  <p className="text-[10px] font-semibold" style={{ color: '#dc2626' }}>{tAccounting('payableAmountLabel')}</p>
                  <p className="text-sm font-bold" style={{ color: '#dc2626' }}>{FMT(totalAmt, paymentTarget.currency)}</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: '#eff6ff' }}>
                  <p className="text-[10px] font-semibold" style={{ color: '#2563eb' }}>{tAccounting('paidAmountLabel')}</p>
                  <p className="text-sm font-bold" style={{ color: '#2563eb' }}>{FMT(paidAmt, paymentTarget.currency)}</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: remaining > 0 ? '#fff7ed' : '#f0fdf4' }}>
                  <p className="text-[10px] font-semibold" style={{ color: remaining > 0 ? '#c2410c' : '#16a34a' }}>{remaining > 0 ? tAccounting('remainingPayable') : tAccounting('fullyPaid')}</p>
                  <p className="text-sm font-bold" style={{ color: remaining > 0 ? '#c2410c' : '#16a34a' }}>{FMT(Math.max(remaining, 0), paymentTarget.currency)}</p>
                </div>
              </div>

              {/* Complete button */}
              {canComplete && (
                <button
                  onClick={async () => {
                    try {
                      await api.patch(`/api/crm/payables/${paymentTarget.id}`, { status: 'paid' });
                      setPayables(prev => prev.map(p => p.id === paymentTarget.id ? { ...p, status: 'paid' } : p));
                      setPaymentTarget(prev => prev ? { ...prev, status: 'paid' } : null);
                    } catch (err: any) { alert(err.message || tAccounting('operationFailed')); }
                  }}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#16a34a' }}>
                  {tAccounting('confirmFullPayment')}
                </button>
              )}
              {paymentTarget.status === 'paid' && (
                <div className="w-full py-2.5 rounded-lg text-sm font-semibold text-center" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  {tAccounting('fullPaymentDone')}
                </div>
              )}

              {/* Payment history */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>
                  {tAccounting('paymentRecordsPayable')} {payments.length > 0 && <span style={{ color: 'var(--notion-text-muted)', fontWeight: 400 }}>{tAccounting('paymentRecordsCount', { n: payments.length })}</span>}
                </p>
                {loadingPayments ? (
                  <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</p>
                ) : payments.length === 0 ? (
                  <p className="text-sm py-3 text-center" style={{ color: 'var(--notion-text-muted)' }}>{tAccounting('noPaymentRecordsPayable')}</p>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-auto">
                    {payments.map(p => (
                      <PaymentCard key={p.id} payment={p} currency={paymentTarget.currency}
                        onProofUploaded={async (url, name) => {
                          try {
                            await api.patch(`/api/crm/payable-payments/${p.id}/proof`, {
                              payment_proof_url: url,
                              payment_proof_name: name,
                            });
                            const data = await api.get(`/api/crm/payables/${paymentTarget.id}/payments`);
                            setPayments(Array.isArray(data) ? data : []);
                          } catch { }
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Add payment form */}
              {paymentTarget.status !== 'paid' && (
                <div className="border-t pt-4" style={{ borderColor: 'var(--notion-border)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>{tAccounting('newPaymentPayable')}</p>
                  <form onSubmit={submitPayment} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" step="0.01" required placeholder={tAccounting('paymentAmountPayableReq')} value={paymentForm.amount}
                        onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                        style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                      <input type="date" value={paymentForm.payment_date}
                        onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                        style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={paymentForm.payment_method}
                        onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                        className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                        style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                        <option value="">{tAccounting('paymentMethodSelect')}</option>
                        <option value="TT">{tAccounting('payMethodTT')}</option>
                        <option value="LC">{tAccounting('payMethodLC')}</option>
                        <option value="DP">{tAccounting('payMethodDP')}</option>
                        <option value="cash">{tAccounting('payMethodCash')}</option>
                        <option value="check">{tAccounting('payMethodCheck')}</option>
                        <option value="other">{tAccounting('payMethodOther')}</option>
                      </select>
                      <input placeholder={tAccounting('referenceNoPlaceholder')} value={paymentForm.reference_no}
                        onChange={e => setPaymentForm({ ...paymentForm, reference_no: e.target.value })}
                        className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                        style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                    </div>
                    <input placeholder={tAccounting('notesBankInfoPayable')} value={paymentForm.notes}
                      onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                      style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                    {/* Proof upload */}
                    <div className="flex items-center gap-2">
                      {paymentForm.payment_proof_url ? (
                        <span className="text-[10px] px-2 py-1 rounded-full border flex items-center gap-1" style={{ borderColor: 'var(--notion-border)' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          {paymentForm.payment_proof_name || tAccounting('proofUploaded')}
                          <button type="button" onClick={() => setPaymentForm(prev => ({ ...prev, payment_proof_url: '', payment_proof_name: '' }))} className="ml-0.5" style={{ color: '#9B9A97' }}>✕</button>
                        </span>
                      ) : (
                        <label className="text-[10px] px-2.5 py-1 rounded-lg cursor-pointer border flex items-center gap-1" style={{ borderColor: 'var(--notion-border)', color: uploadingProof ? '#9ca3af' : 'var(--notion-text)' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          {uploadingProof ? tAccounting('uploadingText') : tAccounting('uploadProofReceipt')}
                          <input type="file" className="hidden" disabled={uploadingProof} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            onChange={async e => { const f = e.target.files?.[0]; if (f) await handleProofUpload(f); e.target.value = ''; }} />
                        </label>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setPaymentTarget(null)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--notion-border)' }}>{tAccounting('closeBtn')}</button>
                      <button type="submit" disabled={submitting || !paymentForm.amount} className="px-3 py-1.5 rounded text-white text-sm disabled:opacity-40" style={{ background: 'var(--notion-accent)' }}>
                        {submitting ? tAccounting('submittingPayableText') : tAccounting('confirmPaymentPayable')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          );
        })()}
      </SlideOver>

      {/* Create Payable Modal */}
      {showCreatePayable && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tAccounting('newPayableTitle')}</h3>
            <form onSubmit={createPayable} className="space-y-3">
              <select required value={createForm.contract_id}
                onChange={e => setCreateForm({ ...createForm, contract_id: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                <option value="">{tAccounting('selectContractReq')}</option>
                {contracts.map(c => (
                  <option key={c.id} value={c.id}>{c.contract_no} — {c.account_name || tAccounting('unnamedClient')} ({FMT(c.contract_amount, c.currency)})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" required placeholder={tAccounting('payableAmountReq')} value={createForm.amount}
                  onChange={e => setCreateForm({ ...createForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                <input placeholder={tAccounting('currencyField')} value={createForm.currency}
                  onChange={e => setCreateForm({ ...createForm, currency: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" placeholder={tAccounting('dueDateField')} value={createForm.due_date}
                  onChange={e => setCreateForm({ ...createForm, due_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                <input placeholder={tAccounting('invoiceNoOptional')} value={createForm.invoice_no}
                  onChange={e => setCreateForm({ ...createForm, invoice_no: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <input placeholder={tAccounting('supplierNameOptional')} value={createForm.supplier_name}
                onChange={e => setCreateForm({ ...createForm, supplier_name: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              <input placeholder={tAccounting('notesField')} value={createForm.notes}
                onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreatePayable(false)} className="flex-1 py-2 rounded-md text-sm border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>{tCommon('cancel')}</button>
                <button type="submit" disabled={creating} className="flex-1 py-2 rounded-md text-sm text-white disabled:opacity-50"
                  style={{ background: 'var(--notion-accent)' }}>{creating ? tCommon('creating') : tCommon('create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Profit Analysis Tab ──────────────────────────────────────────────────────

function getMarginColor(pct: number): { color: string; bg: string } {
  if (pct >= 30) return { color: '#15803d', bg: '#dcfce7' };
  if (pct >= 10) return { color: '#a16207', bg: '#fef9c3' };
  if (pct >= 0) return { color: '#c2410c', bg: '#fff7ed' };
  return { color: '#dc2626', bg: '#fef2f2' };
}

function ProfitAnalysisTab() {
  const t = useTranslations('accounting');
  const tCommon = useTranslations('common');

  const [dimension, setDimension] = useState<ProfitDimension>('lead');
  const [data, setData] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ProfitSortKey>('total_revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterSalesperson, setFilterSalesperson] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dimension });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (filterSalesperson) params.set('salesperson_id', filterSalesperson);
      if (filterStatus) params.set('status', filterStatus);
      const result = await api.get(`/api/accounting/profit-analysis?${params}`);
      setData(Array.isArray(result) ? result : []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [dimension, dateFrom, dateTo, filterSalesperson, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load salesperson list for filter
  useEffect(() => {
    api.get('/api/workspace/users').then((u: any) => {
      setSalespersons(Array.isArray(u) ? u.map((x: any) => ({ id: x.id, name: x.display_name || x.email })) : []);
    }).catch(() => {});
  }, []);

  // Filtered & sorted data
  const processed = useMemo(() => {
    let rows = data;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.name?.toLowerCase().includes(q));
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [data, search, sortKey, sortDir]);

  // KPI summaries
  const kpi = useMemo(() => {
    const totalRevenue = data.reduce((s, r) => s + r.total_revenue, 0);
    const totalCost = data.reduce((s, r) => s + r.total_cost, 0);
    const grossProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    return { totalRevenue, totalCost, grossProfit, avgMargin };
  }, [data]);

  const toggleSort = (key: ProfitSortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortArrow = (key: ProfitSortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="space-y-4">
      {/* Dimension tabs */}
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--notion-active)' }}>
          {([
            { key: 'lead' as const, label: t('byLead') },
            { key: 'customer' as const, label: t('byCustomer') },
            { key: 'salesperson' as const, label: t('bySalesperson') },
            { key: 'product' as const, label: t('byProduct') },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setDimension(key)}
              className="px-3 py-1 rounded text-sm font-medium transition-colors"
              style={{
                background: dimension === key ? 'white' : 'transparent',
                color: dimension === key ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                boxShadow: dimension === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t('totalRevenue'), value: FMT(kpi.totalRevenue), color: '#16a34a', bg: '#f0fdf4' },
          { label: t('totalCost'), value: FMT(kpi.totalCost), color: '#dc2626', bg: '#fef2f2' },
          { label: t('grossProfit'), value: FMT(kpi.grossProfit), color: kpi.grossProfit >= 0 ? '#15803d' : '#dc2626', bg: kpi.grossProfit >= 0 ? '#dcfce7' : '#fef2f2' },
          { label: t('avgMargin'), value: `${kpi.avgMargin.toFixed(1)}%`, color: kpi.avgMargin >= 30 ? '#15803d' : kpi.avgMargin >= 0 ? '#a16207' : '#dc2626', bg: kpi.avgMargin >= 30 ? '#dcfce7' : kpi.avgMargin >= 0 ? '#fef9c3' : '#fef2f2' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-lg px-4 py-3" style={{ background: bg }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color }}>{label}</p>
            <p className="text-lg font-bold" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar: search, dates, filters, sort, view */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          placeholder={t('searchByName')}
          value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-md text-sm outline-none border w-48"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}
        />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-2 py-1.5 rounded-md text-sm outline-none border"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}
          title={t('dateFrom')}
        />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-2 py-1.5 rounded-md text-sm outline-none border"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}
          title={t('dateTo')}
        />
        {dimension !== 'salesperson' && (
          <select value={filterSalesperson} onChange={e => setFilterSalesperson(e.target.value)}
            className="px-2 py-1.5 rounded-md text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
            <option value="">{t('allSalespersons')}</option>
            {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-2 py-1.5 rounded-md text-sm outline-none border"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
          <option value="">{t('allStatuses')}</option>
          <option value="active">{t('statusActive') || 'Active'}</option>
          <option value="completed">{t('statusCompleted') || 'Completed'}</option>
          <option value="draft">{t('statusDraft') || 'Draft'}</option>
        </select>
        <div className="ml-auto flex gap-1">
          {(['table', 'card'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              style={{
                background: viewMode === mode ? 'var(--notion-accent)' : 'transparent',
                color: viewMode === mode ? 'white' : 'var(--notion-text-muted)',
              }}>
              {mode === 'table' ? t('viewTable') : t('viewCard')}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</div>
      ) : processed.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--notion-text-muted)' }}>{t('noData')}</div>
      ) : viewMode === 'table' ? (
        /* ── Table View ── */
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--notion-active)' }}>
                {[
                  { key: 'name' as const, label: dimension === 'lead' ? t('byLead') : dimension === 'customer' ? t('byCustomer') : dimension === 'product' ? t('byProduct') : t('bySalesperson') },
                  { key: 'total_revenue' as const, label: t('totalRevenue') },
                  { key: 'total_cost' as const, label: t('totalCost') },
                  { key: 'gross_profit' as const, label: t('grossProfit') },
                  { key: 'margin_pct' as const, label: t('marginPct') },
                  { key: 'contract_count' as const, label: t('contractCount') },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none"
                    style={{ color: 'var(--notion-text-muted)' }}>
                    {col.label}{sortArrow(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processed.map(row => {
                const mc = getMarginColor(row.margin_pct);
                return (
                  <tr key={row.id} className="border-t hover:bg-[var(--notion-hover)]" style={{ borderColor: 'var(--notion-border)' }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--notion-text)' }}>
                      {row.name || '—'}
                      {dimension === 'lead' && row.status && (
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-600'}`}>{row.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--notion-text)' }}>{FMT(row.total_revenue)}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--notion-text)' }}>{FMT(row.total_cost)}</td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: row.gross_profit >= 0 ? '#15803d' : '#dc2626' }}>{FMT(row.gross_profit)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ color: mc.color, background: mc.bg }}>
                        {row.margin_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--notion-text-muted)' }}>{row.contract_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Card View ── */
        <div className="grid grid-cols-3 gap-3">
          {processed.map(row => {
            const mc = getMarginColor(row.margin_pct);
            const barWidth = Math.min(Math.max(row.margin_pct, 0), 100);
            return (
              <div key={row.id} className="rounded-lg border p-4 space-y-2" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{row.name || '—'}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2" style={{ color: mc.color, background: mc.bg }}>
                    {row.margin_pct.toFixed(1)}%
                  </span>
                </div>
                {dimension === 'lead' && row.status && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-600'}`}>{row.status}</span>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div>
                    <span style={{ color: 'var(--notion-text-muted)' }}>{t('totalRevenue')}</span>
                    <p className="font-semibold" style={{ color: 'var(--notion-text)' }}>{FMT(row.total_revenue)}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--notion-text-muted)' }}>{t('totalCost')}</span>
                    <p className="font-semibold" style={{ color: 'var(--notion-text)' }}>{FMT(row.total_cost)}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--notion-text-muted)' }}>{t('grossProfit')}</span>
                    <p className="font-semibold" style={{ color: row.gross_profit >= 0 ? '#15803d' : '#dc2626' }}>{FMT(row.gross_profit)}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--notion-text-muted)' }}>{t('contractCount')}</span>
                    <p className="font-semibold" style={{ color: 'var(--notion-text)' }}>{row.contract_count}</p>
                  </div>
                </div>
                {/* Margin bar */}
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--notion-active)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barWidth}%`, background: mc.color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
