'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import AnomalyAlertBar from '@/components/ai/AnomalyAlertBar';
import { useTranslations } from 'next-intl';
// ── Types ──────────────────────────────────────────────────────────────────────

type Product = {
  id: string; sku: string; name: string; current_stock: number;
  cost_price: number; sell_price: number;
};

type PurchaseOrder = {
  id: string;
  po_number: string;
  vendor_company_id?: string;
  supplier_name?: string;
  supplier_rating?: string;
  supplier_contact?: string;
  product_id?: string;
  product_name?: string;
  specs?: string;
  quantity?: string;
  quantity_numeric?: number;
  unit_price?: number;
  total?: number;
  currency: string;
  status: string;
  payment_method?: string;
  expected_date?: string;
  contract_file_url?: string;
  contract_file_name?: string;
  notes?: string;
  lead_id?: string;
  created_at: string;
  linked_product_name?: string;
  linked_product_sku?: string;
};

type SalesOrder = {
  id: string;
  contract_no: string;
  account_name?: string;
  account_country?: string;
  contract_amount: number;
  currency: string;
  payment_method?: string;
  incoterm?: string;
  sign_date?: string;
  eta?: string;
  status: string;
  risk_level?: string;
  created_at: string;
};

type Supplier = { id: string; name: string; rating?: string; contact_person?: string };

// ── Constants ──────────────────────────────────────────────────────────────────

const PO_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  draft:     { bg: '#F7F6F3', color: '#9B9A97' },
  confirmed: { bg: '#eff6ff', color: '#1d4ed8' },
  fulfilled: { bg: '#f0fdf4', color: '#15803d' },
  closed:    { bg: '#fef2f2', color: '#b91c1c' },
};

const SO_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  draft:      { bg: '#F7F6F3', color: '#9B9A97' },
  active:     { bg: '#eff6ff', color: '#1d4ed8' },
  fulfilled:  { bg: '#f0fdf4', color: '#15803d' },
  closed:     { bg: '#e7e5e4', color: '#78716c' },
  cancelled:  { bg: '#fef2f2', color: '#b91c1c' },
};

function getPOStatusLabels(t: any): Record<string, string> {
  return {
    draft: t('statusDraft'),
    confirmed: t('statusConfirmed'),
    fulfilled: t('statusFulfilled'),
    closed: t('statusClosed'),
  };
}

function getSOStatusLabels(t: any): Record<string, string> {
  return {
    draft: t('statusDraft'),
    active: t('statusActive'),
    fulfilled: t('statusFulfilled'),
    closed: t('statusClosed'),
    cancelled: t('statusCancelled'),
  };
}

const PO_STATUS_OPTIONS = ['draft', 'confirmed', 'fulfilled', 'closed'];
const CURRENCIES = ['USD', 'CNY', 'EUR'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ status, styles, labels }: { status: string; styles: Record<string, { bg: string; color: string }>; labels: Record<string, string> }) {
  const s = styles[status] || { bg: '#F7F6F3', color: '#9B9A97' };
  const label = labels[status] || status;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: s.bg, color: s.color }}>{label}</span>
  );
}

function fmt(n?: number, currency = 'USD') {
  if (!n) return '—';
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const t = useTranslations('orders');
  const poLabels = getPOStatusLabels(t);
  const soLabels = getSOStatusLabels(t);

  const [tab, setTab] = useState<'purchase' | 'sales'>('purchase');
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'card'>('table');
  const [isMobile, setIsMobile] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Detail / create panel
  const [panelMode, setPanelMode] = useState<'none' | 'detail' | 'create'>('none');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);

  // New PO form
  const [newPO, setNewPO] = useState({
    po_number: '', vendor_company_id: '', product_id: '', product_name: '', specs: '',
    quantity: '', quantity_numeric: '', unit_price: '', total: '', currency: 'USD',
    expected_date: '', payment_method: '', notes: '', status: 'draft',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pos, sos, sups, prods] = await Promise.all([
        api.get('/api/orders/purchase').catch(() => []),
        api.get('/api/orders/sales').catch(() => []),
        api.get('/api/inventory/suppliers').catch(() => []),
        api.get('/api/inventory/products').catch(() => []),
      ]);
      setPurchaseOrders(Array.isArray(pos) ? pos : []);
      setSalesOrders(Array.isArray(sos) ? sos : []);
      setSuppliers(Array.isArray(sups) ? sups : []);
      setProducts(Array.isArray(prods) ? prods : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (isMobile && viewMode === 'table') setViewMode('card');
  }, [isMobile, viewMode]);

  // Filtered lists
  const filteredPO = purchaseOrders.filter(p => {
    const matchSearch = !search || p.po_number.toLowerCase().includes(search.toLowerCase())
      || (p.supplier_name || '').toLowerCase().includes(search.toLowerCase())
      || (p.product_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredSO = salesOrders.filter(s => {
    const matchSearch = !search || s.contract_no.toLowerCase().includes(search.toLowerCase())
      || (s.account_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function createPO() {
    if (!newPO.po_number.trim()) { alert(t('enterPONumber')); return; }
    setCreating(true);
    try {
      await api.post('/api/orders/purchase', {
        po_number: newPO.po_number,
        vendor_company_id: newPO.vendor_company_id || undefined,
        product_id: newPO.product_id || undefined,
        product_name: newPO.product_name || undefined,
        specs: newPO.specs || undefined,
        quantity: newPO.quantity || undefined,
        quantity_numeric: newPO.quantity_numeric ? parseFloat(newPO.quantity_numeric) : undefined,
        unit_price: newPO.unit_price ? parseFloat(newPO.unit_price) : undefined,
        total: newPO.total ? parseFloat(newPO.total) : undefined,
        currency: newPO.currency,
        expected_date: newPO.expected_date || undefined,
        payment_method: newPO.payment_method || undefined,
        notes: newPO.notes || undefined,
        status: newPO.status,
      });
      setNewPO({ po_number: '', vendor_company_id: '', product_id: '', product_name: '', specs: '', quantity: '', quantity_numeric: '', unit_price: '', total: '', currency: 'USD', expected_date: '', payment_method: '', notes: '', status: 'draft' });
      setPanelMode('none');
      await loadData();
    } catch (e: any) {
      alert(t('createFailed') + ': ' + (e.message || ''));
    } finally {
      setCreating(false);
    }
  }

  async function updatePOStatus(id: string, status: string) {
    setSaving(true);
    try {
      await api.patch(`/api/orders/purchase/${id}`, { status });
      setPurchaseOrders(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      if (selectedPO?.id === id) setSelectedPO(prev => prev ? { ...prev, status } : prev);
    } finally {
      setSaving(false);
    }
  }

  async function deletePO(id: string) {
    if (!confirm(t('confirmDeletePO'))) return;
    await api.patch(`/api/orders/purchase/${id}`, {});
    // Use delete
    await fetch(`/api/orders/purchase/${id}`, { method: 'DELETE' });
    setPurchaseOrders(prev => prev.filter(p => p.id !== id));
    if (selectedPO?.id === id) { setPanelMode('none'); setSelectedPO(null); }
    await loadData();
  }

  const inputStyle: React.CSSProperties = {
    background: '#F7F6F3', border: '1px solid var(--notion-border)',
    color: 'var(--notion-text)', borderRadius: 8, padding: '5px 10px',
    fontSize: 12, outline: 'none', width: '100%',
  };

  const panelOpen = panelMode !== 'none';

  function renderPurchaseKanban() {
    const statusOrder = ['draft', 'confirmed', 'fulfilled', 'closed'];
    const byStatus: Record<string, PurchaseOrder[]> = {};
    for (const s of statusOrder) byStatus[s] = [];
    for (const po of filteredPO) {
      (byStatus[po.status] ??= []).push(po);
    }
    return (
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 480 }}>
        {statusOrder.map(status => {
          const cards = byStatus[status] ?? [];
          const style = PO_STATUS_STYLES[status] ?? { bg: '#f3f4f6', color: '#6b7280' };
          return (
            <div key={status} className="flex-shrink-0 flex flex-col rounded-xl overflow-hidden"
              style={{ width: 260, border: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
              <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--notion-border)', background: style.bg }}>
                <span className="text-xs font-semibold" style={{ color: style.color }}>{poLabels[status] ?? status}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: style.color + '22', color: style.color }}>
                  {cards.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {cards.map(po => (
                  <div key={po.id}
                    className="bg-white rounded-lg p-3 cursor-pointer shadow-sm transition-all"
                    style={{ border: '1px solid var(--notion-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
                    onClick={() => { setSelectedPO(po); setPanelMode('detail'); }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold font-mono" style={{ color: 'var(--notion-text)' }}>{po.po_number}</span>
                      {po.currency && po.total != null && (
                        <span className="text-xs font-semibold" style={{ color: '#c2410c' }}>
                          {po.currency} {Number(po.total).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {po.supplier_name && <p className="text-[11px] truncate mb-1" style={{ color: '#888' }}>{po.supplier_name}</p>}
                    {po.product_name && <p className="text-[11px] truncate mb-1" style={{ color: '#aaa' }}>{po.product_name}</p>}
                    <div className="flex items-center justify-between mt-2">
                      {po.expected_date && (
                        <span className="text-[10px]" style={{ color: '#9B9A97' }}>
                          {new Date(po.expected_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: style.bg, color: style.color }}>
                        {poLabels[po.status] ?? po.status}
                      </span>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="text-[11px] text-center py-4" style={{ color: '#ccc', fontStyle: 'italic' }}>{'暂无'}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderSalesKanban() {
    const statusOrder = ['draft', 'active', 'fulfilled', 'closed', 'cancelled'];
    const byStatus: Record<string, SalesOrder[]> = {};
    for (const s of statusOrder) byStatus[s] = [];
    for (const so of filteredSO) {
      (byStatus[so.status] ??= []).push(so);
    }
    return (
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 480 }}>
        {statusOrder.map(status => {
          const cards = byStatus[status] ?? [];
          const style = SO_STATUS_STYLES[status] ?? { bg: '#f3f4f6', color: '#6b7280' };
          return (
            <div key={status} className="flex-shrink-0 flex flex-col rounded-xl overflow-hidden"
              style={{ width: 260, border: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
              <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--notion-border)', background: style.bg }}>
                <span className="text-xs font-semibold" style={{ color: style.color }}>{soLabels[status] ?? status}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: style.color + '22', color: style.color }}>
                  {cards.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {cards.map(so => (
                  <div key={so.id}
                    className="bg-white rounded-lg p-3 cursor-pointer shadow-sm transition-all"
                    style={{ border: '1px solid var(--notion-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold font-mono" style={{ color: 'var(--notion-text)' }}>{so.contract_no}</span>
                      <span className="text-xs font-semibold" style={{ color: '#059669' }}>
                        {so.currency} {Number(so.contract_amount).toLocaleString()}
                      </span>
                    </div>
                    {so.account_name && <p className="text-[11px] truncate mb-1" style={{ color: '#888' }}>{so.account_name}</p>}
                    <div className="flex items-center justify-between mt-2">
                      {so.eta && (
                        <span className="text-[10px]" style={{ color: '#9B9A97' }}>
                          ETA: {new Date(so.eta).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {so.risk_level && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: so.risk_level === 'high' ? '#fef2f2' : so.risk_level === 'medium' ? '#fef3c7' : '#f0fdf4', color: so.risk_level === 'high' ? '#b91c1c' : so.risk_level === 'medium' ? '#92400e' : '#15803d' }}>
                          {so.risk_level}
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: style.bg, color: style.color }}>
                        {soLabels[so.status] ?? so.status}
                      </span>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="text-[11px] text-center py-4" style={{ color: '#ccc', fontStyle: 'italic' }}>{'暂无'}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderPurchaseCards() {
    return (
      <div className="space-y-3">
        {filteredPO.map((po) => (
          <div
            key={po.id}
            className="rounded-xl p-3"
            style={{ background: 'var(--notion-card)', border: '1px solid var(--notion-border)' }}
            onClick={() => { setSelectedPO(po); setPanelMode('detail'); }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-sm font-semibold" style={{ color: '#c2410c' }}>{po.po_number}</span>
              <StatusBadge status={po.status} styles={PO_STATUS_STYLES} labels={poLabels} />
            </div>
            <div className="text-xs space-y-1" style={{ color: 'var(--notion-text-muted)' }}>
              <div>{po.supplier_name || '—'} · {po.product_name || '—'}</div>
              <div>{fmt(po.total, po.currency)} · {fmtDate(po.expected_date)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderSalesCards() {
    return (
      <div className="space-y-3">
        {filteredSO.map((so) => (
          <div
            key={so.id}
            className="rounded-xl p-3"
            style={{ background: 'var(--notion-card)', border: '1px solid var(--notion-border)' }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-sm font-semibold" style={{ color: '#0284c7' }}>{so.contract_no}</span>
              <StatusBadge status={so.status} styles={SO_STATUS_STYLES} labels={soLabels} />
            </div>
            <div className="text-xs space-y-1" style={{ color: 'var(--notion-text-muted)' }}>
              <div>{so.account_name || '—'} · {so.account_country || '—'}</div>
              <div>{fmt(so.contract_amount, so.currency)} · ETA {fmtDate(so.eta)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--notion-bg)', color: 'var(--notion-text)' }}>
      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
        {/* Header */}
        <div className={isMobile ? 'px-4 pt-4 pb-3' : 'px-8 pt-8 pb-4'}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold flex items-center gap-2`} style={{ color: 'var(--notion-text)' }}><HandIcon name="package" size={isMobile ? 20 : 24} /> {t('title')}</h1>
              <p className="text-sm mt-0.5" style={{ color: '#9B9A97' }}>{t('subtitle')}</p>
            </div>
            {tab === 'purchase' && (
              <button
                onClick={() => { setPanelMode('create'); setSelectedPO(null); }}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold text-white"
                style={{ background: '#c2410c' }}>
                {t('newPurchaseOrder')}
              </button>
            )}
          </div>

          <AnomalyAlertBar module="orders" />

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4 p-1 rounded-xl w-fit"
            style={{ background: 'var(--notion-active)', border: '1px solid var(--notion-border)' }}>
            {([['purchase', 'factory', t('tabPurchase'), purchaseOrders.length], ['sales', 'clipboard', t('tabSales'), salesOrders.length]] as [string, string, string, number][]).map(([k, iconName, label, cnt]) => (
              <button key={k} onClick={() => { setTab(k as 'purchase' | 'sales'); setSearch(''); setStatusFilter(''); }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: tab === k ? 'white' : 'transparent',
                  color: tab === k ? 'var(--notion-text)' : '#9B9A97',
                  boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                <HandIcon name={iconName} size={14} /> {label}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: tab === k ? '#F7F6F3' : 'transparent', color: '#9B9A97' }}>{cnt}</span>
              </button>
            ))}
          </div>

          {/* Search + filter bar */}
          <div className={`flex gap-2 ${isMobile ? 'flex-col items-stretch' : 'items-center'}`}>
            <div className={`relative flex-1 ${isMobile ? '' : 'max-w-xs'}`}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={tab === 'purchase' ? t('searchPO') : t('searchSO')}
                style={{ ...inputStyle, paddingLeft: 32 }} />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#9B9A97' }}><HandIcon name="magnifier" size={14} /></span>
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: isMobile ? '100%' : 'auto' }}>
              <option value="">{t('allStatus')}</option>
              {(tab === 'purchase' ? PO_STATUS_OPTIONS : Object.keys(SO_STATUS_STYLES)).map(s => (
                <option key={s} value={s}>
                  {tab === 'purchase' ? poLabels[s] : soLabels[s]}
                </option>
              ))}
            </select>
            {(search || statusFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter(''); }}
                className="text-xs px-2 py-1 rounded-lg" style={{ color: '#9B9A97', background: 'var(--notion-active)' }}>
                {t('clearFilter')}
              </button>
            )}

            {/* View mode toggle */}
            <div className={`flex items-center gap-0.5 p-0.5 rounded-lg ${isMobile ? '' : 'ml-auto'}`} style={{ background: 'var(--notion-active)' }}>
              {([
                { mode: 'table' as const, icon: '☰', label: '表格' },
                { mode: 'kanban' as const, icon: '⊞', label: '看板' },
                { mode: 'card' as const, icon: '▦', label: '卡片' },
              ]).map(item => {
                if (isMobile && item.mode === 'table') return null;
                const active = viewMode === item.mode;
                return (
                  <button key={item.mode} onClick={() => setViewMode(item.mode)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                    style={{
                      background: active ? 'white' : 'transparent',
                      color: active ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    <span style={{ fontSize: 14 }}>{item.icon}</span> {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className={isMobile ? 'flex-1 overflow-auto px-4 pb-6' : 'flex-1 overflow-auto px-8 pb-8'}>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#c2410c', borderTopColor: 'transparent' }} />
            </div>
          ) : viewMode === 'kanban' ? (
            tab === 'purchase' ? renderPurchaseKanban() : renderSalesKanban()
          ) : viewMode === 'card' ? (
            tab === 'purchase' ? renderPurchaseCards() : renderSalesCards()
          ) : tab === 'purchase' ? (
            /* ── Purchase Orders Table ── */
            filteredPO.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2">
                <HandIcon name="package" size={32} />
                <p className="text-sm" style={{ color: '#9B9A97' }}>{t('noPurchaseOrders')}{search ? ` · ${t('adjustSearch')}` : ''}</p>
                <button onClick={() => setPanelMode('create')}
                  className="text-sm px-4 py-2 rounded-lg font-medium text-white mt-2"
                  style={{ background: '#c2410c' }}>
                  {t('createFirst')}
                </button>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--notion-border)' }}>
                    {[t('colPONumber'), t('colSupplier'), t('colProductSpec'), t('colAmount'), t('colDeliveryDate'), t('colPaymentMethod'), t('colStatus'), t('colCreatedAt'), t('colActions')].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPO.map((po, i) => (
                    <tr key={po.id}
                      onClick={() => { setSelectedPO(po); setPanelMode('detail'); }}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom: '1px solid var(--notion-border)',
                        background: selectedPO?.id === po.id ? 'var(--notion-active)' : i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--notion-active)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selectedPO?.id === po.id ? 'var(--notion-active)' : i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)'; }}>
                      <td className="py-2.5 px-3 font-semibold" style={{ color: '#c2410c', whiteSpace: 'nowrap' }}>
                        {po.po_number}
                        {po.contract_file_url && <span className="ml-1.5 text-[9px]" style={{ color: '#9B9A97' }}><HandIcon name="document" size={9} /></span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span>{po.supplier_name || <span style={{ color: '#C9C8C5' }}>—</span>}</span>
                          {po.supplier_rating && (
                            <span className="text-[9px] px-1 rounded-full" style={{ background: '#f0fdf4', color: '#15803d' }}>{po.supplier_rating}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3" style={{ maxWidth: 160 }}>
                        <p className="truncate">{po.product_name || '—'}</p>
                        {po.specs && <p className="text-[10px] truncate" style={{ color: '#9B9A97' }}>{po.specs}</p>}
                      </td>
                      <td className="py-2.5 px-3 font-medium" style={{ whiteSpace: 'nowrap' }}>
                        {po.total ? fmt(po.total, po.currency) : po.unit_price ? t('perUnit', { price: fmt(po.unit_price, po.currency) }) : '—'}
                      </td>
                      <td className="py-2.5 px-3" style={{ whiteSpace: 'nowrap', color: '#9B9A97' }}>
                        {fmtDate(po.expected_date)}
                      </td>
                      <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97' }}>
                        {po.payment_method || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={po.status} styles={PO_STATUS_STYLES} labels={poLabels} />
                      </td>
                      <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>
                        {fmtDate(po.created_at)}
                      </td>
                      <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {po.status !== 'fulfilled' && po.status !== 'closed' && (
                            <button onClick={() => updatePOStatus(po.id, po.status === 'draft' ? 'confirmed' : 'fulfilled')}
                              className="text-[10px] px-2 py-0.5 rounded-lg font-medium"
                              style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                              {po.status === 'draft' ? `→ ${t('toConfirm')}` : `→ ${t('toFulfill')}`}
                            </button>
                          )}
                          {po.lead_id && (
                            <button onClick={() => router.push(`/${tenant}/crm/customer-360/${po.lead_id}`)}
                              className="text-[10px] px-2 py-0.5 rounded-lg"
                              style={{ background: '#F7F6F3', color: '#9B9A97' }}>
                              {t('goToCRM')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            /* ── Sales Orders Table ── */
            filteredSO.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2">
                <HandIcon name="clipboard" size={32} />
                <p className="text-sm" style={{ color: '#9B9A97' }}>{t('noSalesContracts')}{search ? ` · ${t('adjustSearch')}` : ''}</p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--notion-border)' }}>
                    {[t('colContractNo'), t('colClient'), t('colCountry'), t('colAmount'), t('colPaymentMethod'), t('colIncoterm'), t('colSignDate'), 'ETA', t('colStatus'), t('colRisk')].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSO.map((so, i) => (
                    <tr key={so.id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--notion-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--notion-active)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)'; }}>
                      <td className="py-2.5 px-3 font-semibold" style={{ color: '#0284c7', whiteSpace: 'nowrap' }}>{so.contract_no}</td>
                      <td className="py-2.5 px-3">{so.account_name || '—'}</td>
                      <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97' }}>{so.account_country || '—'}</td>
                      <td className="py-2.5 px-3 font-medium" style={{ whiteSpace: 'nowrap' }}>{fmt(so.contract_amount, so.currency)}</td>
                      <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97' }}>{so.payment_method || '—'}</td>
                      <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97' }}>{so.incoterm || '—'}</td>
                      <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>{fmtDate(so.sign_date)}</td>
                      <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>{fmtDate(so.eta)}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={so.status} styles={SO_STATUS_STYLES} labels={soLabels} />
                      </td>
                      <td className="py-2.5 px-3">
                        {so.risk_level && so.risk_level !== 'normal' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: '#fef2f2', color: '#dc2626' }}>
                            <HandIcon name="warning" size={10} /> {so.risk_level}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>

      {/* ── Right panel: Detail or Create ── */}
      {panelOpen && (
        <div
          className={`border-l flex flex-col overflow-hidden ${isMobile ? 'fixed inset-0 z-[120]' : 'flex-shrink-0'}`}
          style={{
            width: isMobile ? '100%' : 420,
            borderColor: 'var(--notion-border)',
            background: 'var(--notion-card, white)',
            paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : undefined,
          }}
        >

          {/* Panel header */}
          <div className={`${isMobile ? 'px-4' : 'px-5'} flex items-center justify-between py-4 border-b`} style={{ borderColor: 'var(--notion-border)' }}>
            <h2 className="text-base font-bold" style={{ color: 'var(--notion-text)' }}>
              {panelMode === 'create' ? <><HandIcon name="sparkle-new" size={16} /> {t('createPOTitle')}</> : <><HandIcon name="package" size={16} /> {t('poDetailTitle')}</>}
            </h2>
            <button onClick={() => { setPanelMode('none'); setSelectedPO(null); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sm"
              style={{ color: '#9B9A97', background: 'var(--notion-active)' }}>✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {panelMode === 'create' && (
              <>
                {/* Create form */}
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('poNumberReq')}</label>
                    <input placeholder="PO-2025-001" value={newPO.po_number}
                      onChange={e => setNewPO(p => ({ ...p, po_number: e.target.value }))}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('supplier')}</label>
                    <select value={newPO.vendor_company_id}
                      onChange={e => setNewPO(p => ({ ...p, vendor_company_id: e.target.value }))}
                      style={inputStyle}>
                      <option value="">{t('selectSupplier')}</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}{s.rating ? ` · ${s.rating}${t('ratingLevel')}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>关联产品（库存）</label>
                    <select value={newPO.product_id}
                      onChange={e => {
                        const pid = e.target.value;
                        const prod = products.find(p => p.id === pid);
                        setNewPO(p => ({ ...p, product_id: pid, product_name: prod ? prod.name : p.product_name }));
                      }}
                      style={inputStyle}>
                      <option value="">不关联产品</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.sku} - {p.name} (库存: {p.current_stock})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('productName')}</label>
                      <input placeholder={t('productPlaceholder')} value={newPO.product_name}
                        onChange={e => setNewPO(p => ({ ...p, product_name: e.target.value }))}
                        style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('quantity')}</label>
                      <input placeholder={t('quantityPlaceholder')} type="number" value={newPO.quantity_numeric || newPO.quantity}
                        onChange={e => setNewPO(p => ({ ...p, quantity: e.target.value, quantity_numeric: e.target.value }))}
                        style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('specs')}</label>
                    <input placeholder={t('specsPlaceholder')} value={newPO.specs}
                      onChange={e => setNewPO(p => ({ ...p, specs: e.target.value }))}
                      style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('totalAmount')}</label>
                      <input placeholder="0" type="number" value={newPO.total}
                        onChange={e => setNewPO(p => ({ ...p, total: e.target.value }))}
                        style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('currencyLabel')}</label>
                      <select value={newPO.currency}
                        onChange={e => setNewPO(p => ({ ...p, currency: e.target.value }))}
                        style={inputStyle}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('paymentMethodLabel')}</label>
                      <input placeholder={t('paymentPlaceholder')} value={newPO.payment_method}
                        onChange={e => setNewPO(p => ({ ...p, payment_method: e.target.value }))}
                        style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('expectedDelivery')}</label>
                      <input type="date" value={newPO.expected_date}
                        onChange={e => setNewPO(p => ({ ...p, expected_date: e.target.value }))}
                        style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('statusLabel')}</label>
                    <select value={newPO.status}
                      onChange={e => setNewPO(p => ({ ...p, status: e.target.value }))}
                      style={inputStyle}>
                      {PO_STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{poLabels[s] || s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{t('notesLabel')}</label>
                    <textarea value={newPO.notes} rows={3}
                      onChange={e => setNewPO(p => ({ ...p, notes: e.target.value }))}
                      placeholder={t('notesPlaceholder')}
                      style={{ ...inputStyle, resize: 'none', lineHeight: '1.6' }} />
                  </div>
                </div>
                <button onClick={createPO} disabled={creating || !newPO.po_number.trim()}
                  className="w-full py-2.5 rounded-xl font-semibold text-white text-sm disabled:opacity-40"
                  style={{ background: '#c2410c' }}>
                  {creating ? t('creatingText') : t('createPO')}
                </button>
              </>
            )}

            {panelMode === 'detail' && selectedPO && (
              <>
                {/* PO number + status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold" style={{ color: '#c2410c' }}>{selectedPO.po_number}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#9B9A97' }}>{t('createdOn', { date: fmtDate(selectedPO.created_at) })}</p>
                  </div>
                  <StatusBadge status={selectedPO.status} styles={PO_STATUS_STYLES} labels={poLabels} />
                </div>

                {/* Supplier */}
                {selectedPO.supplier_name && (
                  <div className="rounded-xl p-3" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#c2410c' }}>{t('supplierSection')}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: 'var(--notion-text)' }}><HandIcon name="factory" size={14} /> {selectedPO.supplier_name}</span>
                      {selectedPO.supplier_rating && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#f0fdf4', color: '#15803d' }}>
                          {selectedPO.supplier_rating}{t('ratingLevel')}
                        </span>
                      )}
                    </div>
                    {selectedPO.supplier_contact && (
                      <p className="text-[11px] mt-1" style={{ color: '#9B9A97' }}>{t('contactPerson')}: {selectedPO.supplier_contact}</p>
                    )}
                  </div>
                )}

                {/* Product info */}
                {(selectedPO.product_name || selectedPO.specs) && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>{t('productInfo')}</p>
                    <div className="rounded-xl p-3 space-y-1" style={{ background: 'var(--notion-active)', border: '1px solid var(--notion-border)' }}>
                      {[
                        { label: t('fieldProductName'), value: selectedPO.product_name },
                        { label: t('fieldSpecs'), value: selectedPO.specs },
                        { label: t('fieldQuantity'), value: selectedPO.quantity },
                        { label: t('fieldUnitPrice'), value: selectedPO.unit_price ? fmt(selectedPO.unit_price, selectedPO.currency) : undefined },
                        { label: t('fieldTotalAmount'), value: selectedPO.total ? fmt(selectedPO.total, selectedPO.currency) : undefined },
                        { label: t('fieldPaymentMethod'), value: selectedPO.payment_method },
                        { label: t('fieldExpectedDelivery'), value: fmtDate(selectedPO.expected_date) },
                      ].filter(r => r.value && r.value !== '—').map(r => (
                        <div key={r.label} className="flex items-center gap-2">
                          <span className="text-[10px] w-16 flex-shrink-0" style={{ color: '#9B9A97' }}>{r.label}</span>
                          <span className="text-[12px]" style={{ color: 'var(--notion-text)' }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contract file */}
                {selectedPO.contract_file_url && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9B9A97' }}>{t('purchaseContract')}</p>
                    <a href={selectedPO.contract_file_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                      style={{ background: '#eff6ff', color: '#0284c7', border: '1px solid #bae6fd', textDecoration: 'none' }}>
                      <HandIcon name="document" size={14} /> {selectedPO.contract_file_name || t('contractFile')}
                    </a>
                  </div>
                )}

                {/* Notes */}
                {selectedPO.notes && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9B9A97' }}>{t('notesLabel')}</p>
                    <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--notion-active)', color: 'var(--notion-text)' }}>
                      {selectedPO.notes}
                    </p>
                  </div>
                )}

                {/* Status actions */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#9B9A97' }}>{t('updateStatus')}</p>
                  <div className="flex flex-wrap gap-2">
                    {PO_STATUS_OPTIONS.filter(s => s !== selectedPO.status).map(s => (
                      <button key={s} onClick={() => updatePOStatus(selectedPO.id, s)}
                        disabled={saving}
                        className="text-[11px] px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: PO_STATUS_STYLES[s]?.bg, color: PO_STATUS_STYLES[s]?.color, border: `1px solid ${PO_STATUS_STYLES[s]?.color}33` }}>
                        → {poLabels[s]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CRM link */}
                {selectedPO.lead_id && (
                  <button onClick={() => router.push(`/${tenant}/crm/customer-360/${selectedPO.lead_id}`)}
                    className="w-full text-sm py-2 rounded-xl font-medium"
                    style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                    {t('goToCRMDetail')}
                  </button>
                )}

                {/* Delete */}
                <button onClick={() => deletePO(selectedPO.id)}
                  className="w-full text-xs py-1.5 rounded-xl"
                  style={{ color: '#9B9A97', background: 'transparent', border: '1px solid var(--notion-border)' }}>
                  {t('deleteOrder')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
