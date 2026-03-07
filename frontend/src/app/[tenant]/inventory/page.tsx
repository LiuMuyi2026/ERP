'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import NotionTable, { Column } from '@/components/ui/NotionTable';
import SlideOver from '@/components/ui/SlideOver';
import { HandIcon } from '@/components/ui/HandIcon';
import AnomalyAlertBar from '@/components/ai/AnomalyAlertBar';

type ScInquiry = {
  lead_id: string;
  full_name: string;
  company?: string;
  inquiry_level: string;
  product_name: string;
  specs: string;
  target_price: string;
  quantity: string;
  delivery: string;
  submitted_at: string;
  quotes: { supplier: string; price: string; note: string }[];
  sc_result?: { final_price: string; note: string; confirmed: boolean } | null;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  current_stock: number;
  reorder_point: number;
  cost_price: number;
  sell_price: number;
  unit: string;
  is_active: boolean;
};

type Warehouse = {
  id: string;
  name: string;
  is_active: boolean;
  address: string;
};

type Movement = {
  id: string;
  created_at: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  notes: string;
};

type Supplier = {
  id: string;
  name: string;
  rating: string;
  company_info: string;
  contact_person: string;
  contact_info: string;
  supplier_type: string;
  created_at: string;
};

type Quotation = {
  id: string;
  supplier_id: string;
  product_name: string;
  material: string;
  spec: string;
  quantity: number;
  unit_price: number;
  delivery_period: string;
  payment_method: string;
  special_requirements: string;
  created_at: string;
};

// ── Purchase Orders ────────────────────────────────────────────────────────────
type PurchaseOrder = {
  id: string; po_number: string; vendor_company_id?: string;
  supplier_name?: string; supplier_rating?: string; supplier_contact?: string;
  product_id?: string; product_name?: string; specs?: string; quantity?: string;
  quantity_numeric?: number;
  unit_price?: number; total?: number; currency: string; status: string;
  payment_method?: string; expected_date?: string;
  contract_file_url?: string; contract_file_name?: string;
  notes?: string; lead_id?: string; created_at: string;
  linked_product_name?: string; linked_product_sku?: string;
};

function getPOStatusConfig(tInventory: any): Record<string, { label: string; bg: string; color: string }> {
  return {
    draft:     { label: tInventory('poStatusDraft'),     bg: 'var(--notion-hover)', color: '#9B9A97' },
    confirmed: { label: tInventory('poStatusConfirmed'),  bg: '#eff6ff', color: '#1d4ed8' },
    fulfilled: { label: tInventory('poStatusFulfilled'),  bg: '#f0fdf4', color: '#15803d' },
    closed:    { label: tInventory('poStatusClosed'),     bg: '#fef2f2', color: '#b91c1c' },
  };
}
const PO_STATUS_OPTIONS = ['draft', 'confirmed', 'fulfilled', 'closed'];
const CURRENCIES = ['USD', 'CNY', 'EUR'];

function POStatusBadge({ status }: { status: string }) {
  const tInventory = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const tCustomer360 = useTranslations('customer360');
  const PO_STATUS_CONFIG = getPOStatusConfig(tInventory);
  const s = PO_STATUS_CONFIG[status] || { label: status, bg: 'var(--notion-hover)', color: '#9B9A97' };
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}
function fmtMoney(n?: number, currency = 'USD') {
  if (!n) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const RATING_OPTIONS = ['A', 'B', 'C', 'D', 'S'];
const DEFAULT_SUPPLIER_TYPES = ['freight', 'processing', 'equipment'];
const RATING_COLORS: Record<string, { bg: string; color: string }> = {
  S: { bg: '#fdf4ff', color: '#7e22ce' },
  A: { bg: '#f0fdf4', color: '#15803d' },
  B: { bg: '#eff6ff', color: '#1d4ed8' },
  C: { bg: '#fffbeb', color: '#b45309' },
  D: { bg: '#fef2f2', color: '#b91c1c' },
};

// ── SC Inquiry Card ────────────────────────────────────────────────────────────
function ScInquiryRow({
  inq, tenant, router, onUpdate, suppliers, onSupplierCreated, isExpanded, onToggle,
}: {
  inq: ScInquiry;
  tenant: string;
  router: ReturnType<typeof useRouter>;
  onUpdate: (leadId: string, payload: Record<string, any>) => Promise<void>;
  suppliers: Supplier[];
  onSupplierCreated: (sup: Supplier) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const needThree = inq.inquiry_level.startsWith('A') || inq.inquiry_level.startsWith('B');
  const maxQuotes = needThree ? 3 : 1;
  const quotes = inq.quotes || [];
  const isDone = !!inq.sc_result?.confirmed;
  const tInventory = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const [quoteForm, setQuoteForm] = useState({ supplier: '', price: '', note: '' });
  const [finalPrice, setFinalPrice] = useState('');
  const [finalNote, setFinalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupContact, setNewSupContact] = useState('');
  const [creatingSup, setCreatingSup] = useState(false);

  const levelColor = inq.inquiry_level.startsWith('A') ? '#dc2626'
    : inq.inquiry_level.startsWith('B') ? '#d97706' : '#2563eb';

  async function addQuote() {
    if (!quoteForm.supplier || !quoteForm.price) return;
    setSubmitting(true);
    try {
      await onUpdate(inq.lead_id, { quotes: [...quotes, { ...quoteForm }] });
      setQuoteForm({ supplier: '', price: '', note: '' });
    } finally { setSubmitting(false); }
  }

  async function submitFinal() {
    if (!finalPrice) return;
    setSubmitting(true);
    try { await onUpdate(inq.lead_id, { final_price: finalPrice, note: finalNote }); }
    finally { setSubmitting(false); }
  }

  return (
    <>
      {/* Table row */}
      <tr onClick={onToggle} className="cursor-pointer transition-colors"
        style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--notion-border)' }}
        onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--notion-active)'; }}
        onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
        <td className="py-2.5 px-3">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white"
            style={{ background: levelColor }}>{inq.inquiry_level.charAt(0)}</span>
        </td>
        <td className="py-2.5 px-3">
          <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{inq.full_name}</p>
          {inq.company && <p className="text-[10px]" style={{ color: '#9B9A97' }}>{inq.company}</p>}
        </td>
        <td className="py-2.5 px-3 text-sm" style={{ color: 'var(--notion-text)' }}>{inq.product_name || '—'}</td>
        <td className="py-2.5 px-3 text-sm" style={{ color: 'var(--notion-text)' }}>{inq.quantity || '—'}</td>
        <td className="py-2.5 px-3 text-sm font-medium" style={{ color: '#c2410c' }}>{inq.target_price || '—'}</td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            {quotes.map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full" style={{ background: '#c2410c' }} />
            ))}
            {Array.from({ length: maxQuotes - quotes.length }).map((_, i) => (
              <div key={`e${i}`} className="w-2 h-2 rounded-full" style={{ background: 'var(--notion-border)' }} />
            ))}
            <span className="text-[10px] ml-1" style={{ color: '#9B9A97' }}>{quotes.length}/{maxQuotes}</span>
          </div>
        </td>
        <td className="py-2.5 px-3">
          {isDone ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#15803d' }}>
              {tInventory('scCompleted')}
            </span>
          ) : quotes.length >= maxQuotes ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fffbeb', color: '#b45309' }}>
              {tInventory('scWaitingConfirm')}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
              {tInventory('scQuoting')}
            </span>
          )}
        </td>
        <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>
          {inq.submitted_at ? new Date(inq.submitted_at).toLocaleDateString() : '—'}
        </td>
        <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>
          <button onClick={() => router.push(`/${tenant}/crm/customer-360/${inq.lead_id}?tab=workflow`)}
            className="text-[10px] px-2 py-0.5 rounded-lg font-medium"
            style={{ background: '#ede9fe', color: '#7c3aed' }}>
            CRM
          </button>
        </td>
      </tr>

      {/* Expanded detail panel */}
      {isExpanded && (
        <tr style={{ background: 'var(--notion-active)' }}>
          <td colSpan={9} className="px-4 py-4" style={{ borderBottom: '2px solid var(--notion-border)' }}>
            <div className="flex gap-6">
              {/* Left: product info + specs */}
              <div className="flex-shrink-0" style={{ width: 240 }}>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#9B9A97' }}>{tInventory('scProductName')}</p>
                <div className="space-y-1.5">
                  {[
                    { label: tInventory('scSpecs'), value: inq.specs },
                    { label: tInventory('scTargetPrice'), value: inq.target_price },
                    { label: tInventory('scQuantity'), value: inq.quantity },
                    { label: tInventory('scDelivery'), value: inq.delivery },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-2">
                      <span className="text-[10px] w-16 flex-shrink-0" style={{ color: '#9B9A97' }}>{f.label}</span>
                      <span className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{f.value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Middle: quote records */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#9B9A97' }}>
                  {tInventory('scQuoteRecords')} ({quotes.length}/{maxQuotes})
                </p>

                {quotes.length > 0 && (
                  <div className="mb-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--notion-hover)' }}>
                          <th className="text-left py-1.5 px-3 text-[9px] font-bold uppercase" style={{ color: '#9B9A97' }}>#</th>
                          <th className="text-left py-1.5 px-3 text-[9px] font-bold uppercase" style={{ color: '#9B9A97' }}>{tInventory('scSupplier')}</th>
                          <th className="text-left py-1.5 px-3 text-[9px] font-bold uppercase" style={{ color: '#9B9A97' }}>{tInventory('scPrice')}</th>
                          <th className="text-left py-1.5 px-3 text-[9px] font-bold uppercase" style={{ color: '#9B9A97' }}>{tInventory('scNote')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotes.map((q, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                            <td className="py-1.5 px-3 font-bold" style={{ color: '#9B9A97' }}>{i + 1}</td>
                            <td className="py-1.5 px-3 font-medium" style={{ color: 'var(--notion-text)' }}>{q.supplier}</td>
                            <td className="py-1.5 px-3 font-bold" style={{ color: '#c2410c' }}>{q.price}</td>
                            <td className="py-1.5 px-3" style={{ color: '#9B9A97' }}>{q.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add quote form */}
                {!isDone && quotes.length < maxQuotes && (
                  <div className="rounded-lg p-3" style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-[9px] font-medium block mb-0.5" style={{ color: '#9B9A97' }}>{tInventory('scSupplier')}</label>
                        <select value={quoteForm.supplier}
                          onChange={e => {
                            if (e.target.value === '__new__') { setShowNewSupplier(true); return; }
                            setQuoteForm(p => ({ ...p, supplier: e.target.value }));
                          }}
                          className="w-full text-xs px-2 py-1.5 rounded outline-none"
                          style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                          <option value="">{tInventory('scSelectSupplier')}</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.name}>{s.name}{s.rating ? ` (${s.rating})` : ''}</option>
                          ))}
                          <option value="__new__">+ {tInventory('scNewSupplierOption')}</option>
                        </select>
                      </div>
                      <div style={{ width: 120 }}>
                        <label className="text-[9px] font-medium block mb-0.5" style={{ color: '#9B9A97' }}>{tInventory('scPrice')}</label>
                        <input value={quoteForm.price} placeholder="0.00"
                          onChange={e => setQuoteForm(p => ({ ...p, price: e.target.value }))}
                          className="w-full text-xs px-2 py-1.5 rounded outline-none"
                          style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[9px] font-medium block mb-0.5" style={{ color: '#9B9A97' }}>{tInventory('scNote')}</label>
                        <input value={quoteForm.note} placeholder={tInventory('scNotePlaceholder')}
                          onChange={e => setQuoteForm(p => ({ ...p, note: e.target.value }))}
                          className="w-full text-xs px-2 py-1.5 rounded outline-none"
                          style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                      </div>
                      <button disabled={submitting || !quoteForm.supplier || !quoteForm.price} onClick={addQuote}
                        className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-40 flex-shrink-0"
                        style={{ background: '#c2410c' }}>
                        {tInventory('scRecordQuote')}
                      </button>
                    </div>

                    {/* Inline new supplier */}
                    {showNewSupplier && (
                      <div className="mt-2 rounded p-2.5 flex items-end gap-2" style={{ background: 'var(--notion-hover)', border: '1px dashed #c2410c66' }}>
                        <div className="flex-1">
                          <label className="text-[9px] font-medium block mb-0.5" style={{ color: '#c2410c' }}>{tInventory('supplierNameReq')}</label>
                          <input value={newSupName} onChange={e => setNewSupName(e.target.value)}
                            className="w-full text-xs px-2 py-1.5 rounded outline-none"
                            style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] font-medium block mb-0.5" style={{ color: '#c2410c' }}>{tInventory('supplierContactPersonPlaceholder')}</label>
                          <input value={newSupContact} onChange={e => setNewSupContact(e.target.value)}
                            className="w-full text-xs px-2 py-1.5 rounded outline-none"
                            style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                        </div>
                        <button disabled={creatingSup || !newSupName.trim()} onClick={async () => {
                          setCreatingSup(true);
                          try {
                            const sup = await api.post('/api/inventory/suppliers', { name: newSupName, contact_person: newSupContact || undefined });
                            const newSup: Supplier = { id: sup.id, name: newSupName, rating: '', company_info: '', contact_person: newSupContact, contact_info: '', supplier_type: '', created_at: new Date().toISOString() };
                            onSupplierCreated(newSup);
                            setQuoteForm(p => ({ ...p, supplier: newSupName }));
                            setShowNewSupplier(false); setNewSupName(''); setNewSupContact('');
                          } catch (err: any) { alert(err.message); }
                          finally { setCreatingSup(false); }
                        }}
                          className="px-3 py-1.5 rounded text-[10px] font-semibold text-white disabled:opacity-40 flex-shrink-0"
                          style={{ background: '#c2410c' }}>
                          {creatingSup ? '...' : tInventory('scCreateAndSelect')}
                        </button>
                        <button onClick={() => { setShowNewSupplier(false); setNewSupName(''); setNewSupContact(''); }}
                          className="px-2 py-1.5 rounded text-[10px] flex-shrink-0"
                          style={{ color: '#9B9A97', border: '1px solid var(--notion-border)' }}>
                          {tCommon('cancel')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Final price submission */}
                {!isDone && quotes.length >= maxQuotes && (
                  <div className="mt-3 rounded-lg p-3 flex items-end gap-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <div className="flex-1">
                      <label className="text-[9px] font-bold uppercase block mb-0.5" style={{ color: '#92400e' }}>{tInventory('scFinalPricePlaceholder')}</label>
                      <input value={finalPrice} onChange={e => setFinalPrice(e.target.value)} placeholder="0.00"
                        className="w-full text-xs px-2 py-1.5 rounded outline-none"
                        style={{ background: 'white', border: '1px solid #fde68a', color: 'var(--notion-text)' }} />
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] font-bold uppercase block mb-0.5" style={{ color: '#92400e' }}>{tInventory('scNote')}</label>
                      <input value={finalNote} onChange={e => setFinalNote(e.target.value)} placeholder={tInventory('scNotePlaceholder')}
                        className="w-full text-xs px-2 py-1.5 rounded outline-none"
                        style={{ background: 'white', border: '1px solid #fde68a', color: 'var(--notion-text)' }} />
                    </div>
                    <button disabled={!finalPrice || submitting} onClick={submitFinal}
                      className="px-4 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-40 flex-shrink-0"
                      style={{ background: '#d97706' }}>
                      {submitting ? '...' : tInventory('scConfirmFinalPrice')}
                    </button>
                  </div>
                )}

                {/* Done result */}
                {isDone && inq.sc_result && (
                  <div className="mt-3 rounded-lg px-4 py-2.5 flex items-center gap-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <HandIcon name="checkmark" size={16} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#15803d' }}>{tInventory('scFinalPrice', { price: inq.sc_result.final_price })}</p>
                      {inq.sc_result.note && <p className="text-[11px]" style={{ color: '#166534' }}>{inq.sc_result.note}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function InventoryPage() {
  const tInventory = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const tCustomer360 = useTranslations('customer360');
  const router = useRouter();
  const { tenant } = useParams<{ tenant: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'inventory' | 'procurement'>('procurement');
  const [inventorySubTab, setInventorySubTab] = useState<'products' | 'warehouses' | 'movements'>('products');
  const [procurementSubTab, setProcurementSubTab] = useState<'purchase_orders' | 'suppliers' | 'sc_inquiries'>('suppliers');
  const [scInquiries, setScInquiries] = useState<ScInquiry[]>([]);
  const [scLoading, setScLoading] = useState(false);
  const [scError, setScError] = useState(false);
  const [search, setSearch] = useState('');
  const [productViewMode, setProductViewMode] = useState<'table' | 'card'>('table');
  const [supplierViewMode, setSupplierViewMode] = useState<'table' | 'card'>('table');
  const [productGroupBy, setProductGroupBy] = useState<'none' | 'category' | 'stock_status'>('none');
  const [supplierGroupBy, setSupplierGroupBy] = useState<'none' | 'rating' | 'supplier_type'>('none');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Warehouse CRUD state
  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', address: '' });
  const [warehouseCreating, setWarehouseCreating] = useState(false);

  // Movement filter state
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [movementSearch, setMovementSearch] = useState('');

  // SC inquiry expanded row
  const [expandedInquiry, setExpandedInquiry] = useState<string | null>(null);

  // Supplier state
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierTypeFilter, setSupplierTypeFilter] = useState('');
  const [supplierTypes, setSupplierTypes] = useState<string[]>([]);
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [quotationsLoading, setQuotationsLoading] = useState(false);
  const [showCreateQuotation, setShowCreateQuotation] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierCreating, setSupplierCreating] = useState(false);

  // ── Purchase Orders state ───────────────────────────────────────────────────
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [poSearch, setPoSearch] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [poPanelMode, setPoPanelMode] = useState<'none' | 'detail' | 'create'>('none');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poCreating, setPoCreating] = useState(false);
  const [poSaving, setPoSaving] = useState(false);
  const [newPO, setNewPO] = useState({
    po_number: '', vendor_company_id: '', product_id: '', product_name: '', specs: '',
    quantity: '', quantity_numeric: '', unit_price: '', total: '', currency: 'USD',
    expected_date: '', payment_method: '', notes: '', status: 'draft',
  });

  const [supplierForm, setSupplierForm] = useState({
    name: '', rating: 'A', company_info: '', contact_person: '', contact_info: '', supplier_type: '',
  });
  const [quotationForm, setQuotationForm] = useState({
    product_name: '', material: '', spec: '', quantity: '',
    unit_price: '', delivery_period: '', payment_method: '', special_requirements: '',
  });

  const [form, setForm] = useState({
    sku: '', name: '', description: '', category: '', unit: 'each',
    cost_price: '', sell_price: '', reorder_point: '', warehouse_id: '',
  });
  const [adjustForm, setAdjustForm] = useState({ quantity: '', movement_type: 'adjustment', notes: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/inventory/products').catch(() => []),
      api.get('/api/inventory/warehouses').catch(() => []),
      api.get('/api/inventory/stock-movements').catch(() => []),
      api.get('/api/inventory/suppliers').catch(() => []),
      api.get<string[]>('/api/inventory/supplier-types').catch(() => []),
    ]).then(([prods, whs, mvs, sups, types]) => {
      setProducts(Array.isArray(prods) ? prods : []);
      setWarehouses(Array.isArray(whs) ? whs : []);
      setMovements(Array.isArray(mvs) ? mvs : []);
      setSuppliers(Array.isArray(sups) ? sups : []);
      setSupplierTypes(Array.isArray(types) ? types : []);
    }).finally(() => setLoading(false));
  }, []);

  async function loadScInquiries() {
    setScLoading(true);
    setScError(false);
    try {
      const data = await api.get<ScInquiry[]>('/api/crm/supply-chain/inquiries');
      setScInquiries(Array.isArray(data) ? data : []);
    } catch { setScError(true); setScInquiries([]); }
    finally { setScLoading(false); }
  }

  async function loadPurchaseOrders() {
    try {
      const data = await api.get<PurchaseOrder[]>('/api/orders/purchase').catch(() => []);
      setPurchaseOrders(Array.isArray(data) ? data : []);
    } catch { setPurchaseOrders([]); }
  }

  useEffect(() => {
    if (tab === 'procurement' && procurementSubTab === 'sc_inquiries') loadScInquiries();
    if (tab === 'procurement' && procurementSubTab === 'purchase_orders') loadPurchaseOrders();
  }, [tab, procurementSubTab]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase());
    const matchesLowStock = !showLowStock || (p.current_stock <= p.reorder_point);
    return matchesSearch && matchesLowStock;
  });

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = !supplierSearch ||
      s.name?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.contact_person?.toLowerCase().includes(supplierSearch.toLowerCase());
    const matchesType = !supplierTypeFilter || s.supplier_type === supplierTypeFilter;
    return matchesSearch && matchesType;
  });

  const lowStockCount = products.filter(p => p.current_stock <= p.reorder_point && p.reorder_point > 0).length;
  const totalValue = products.reduce((sum, p) => sum + (p.current_stock * p.sell_price), 0);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const prod = await api.post('/api/inventory/products', {
        ...form,
        cost_price: parseFloat(form.cost_price) || 0,
        sell_price: parseFloat(form.sell_price) || 0,
        reorder_point: parseFloat(form.reorder_point) || 0,
        warehouse_id: form.warehouse_id || null,
      });
      setProducts(prev => [{ ...form, id: prod.id, current_stock: 0, is_active: true } as any, ...prev]);
      setShowCreate(false);
      setForm({ sku: '', name: '', description: '', category: '', unit: 'each', cost_price: '', sell_price: '', reorder_point: '', warehouse_id: '' });
    } catch (err: any) { alert(err.message); }
    finally { setCreating(false); }
  }

  async function adjustStock(productId: string) {
    try {
      await api.post(`/api/inventory/products/${productId}/adjust-stock`, {
        product_id: productId,
        quantity: parseFloat(adjustForm.quantity) || 0,
        movement_type: adjustForm.movement_type,
        notes: adjustForm.notes,
      });
      const qty = parseFloat(adjustForm.quantity) || 0;
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, current_stock: (p.current_stock || 0) + qty } : p));
      setShowAdjust(null);
      setAdjustForm({ quantity: '', movement_type: 'adjustment', notes: '' });
    } catch (err: any) { alert(err.message); }
  }

  async function openSupplier(sup: Supplier) {
    setSelectedSupplier(sup);
    setQuotationsLoading(true);
    try {
      const data = await api.get(`/api/inventory/suppliers/${sup.id}/quotations`);
      setQuotations(Array.isArray(data) ? data : []);
    } catch { setQuotations([]); }
    finally { setQuotationsLoading(false); }
  }

  async function createSupplier(e: React.FormEvent) {
    e.preventDefault();
    setSupplierCreating(true);
    try {
      const sup = await api.post('/api/inventory/suppliers', supplierForm);
      setSuppliers(prev => [{ ...supplierForm, id: sup.id, created_at: new Date().toISOString() } as any, ...prev]);
      setShowCreateSupplier(false);
      setSupplierForm({ name: '', rating: 'A', company_info: '', contact_person: '', contact_info: '', supplier_type: '' });
      if (supplierForm.supplier_type && !supplierTypes.includes(supplierForm.supplier_type)) {
        setSupplierTypes(prev => [...prev, supplierForm.supplier_type]);
      }
    } catch (err: any) { alert(err.message); }
    finally { setSupplierCreating(false); }
  }

  async function saveEditSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSupplier) return;
    try {
      await api.patch(`/api/inventory/suppliers/${editingSupplier.id}`, {
        name: editingSupplier.name,
        rating: editingSupplier.rating,
        company_info: editingSupplier.company_info,
        contact_person: editingSupplier.contact_person,
        contact_info: editingSupplier.contact_info,
        supplier_type: editingSupplier.supplier_type,
      });
      setSuppliers(prev => prev.map(s => s.id === editingSupplier.id ? editingSupplier : s));
      if (selectedSupplier?.id === editingSupplier.id) setSelectedSupplier(editingSupplier);
      setEditingSupplier(null);
    } catch (err: any) { alert(err.message); }
  }

  async function deleteSupplier(supId: string) {
    if (!confirm(tInventory('supplierConfirmDelete'))) return;
    try {
      await api.delete(`/api/inventory/suppliers/${supId}`);
      setSuppliers(prev => prev.filter(s => s.id !== supId));
      if (selectedSupplier?.id === supId) setSelectedSupplier(null);
    } catch (err: any) { alert(err.message); }
  }

  async function createQuotation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSupplier) return;
    try {
      const q = await api.post(`/api/inventory/suppliers/${selectedSupplier.id}/quotations`, {
        ...quotationForm,
        quantity: parseFloat(quotationForm.quantity) || null,
        unit_price: parseFloat(quotationForm.unit_price) || null,
      });
      setQuotations(prev => [{ ...quotationForm, id: q.id, supplier_id: selectedSupplier.id, created_at: new Date().toISOString() } as any, ...prev]);
      setShowCreateQuotation(false);
      setQuotationForm({ product_name: '', material: '', spec: '', quantity: '', unit_price: '', delivery_period: '', payment_method: '', special_requirements: '' });
    } catch (err: any) { alert(err.message); }
  }

  async function deleteQuotation(qId: string) {
    if (!selectedSupplier) return;
    try {
      await api.delete(`/api/inventory/suppliers/${selectedSupplier.id}/quotations/${qId}`);
      setQuotations(prev => prev.filter(q => q.id !== qId));
    } catch (err: any) { alert(err.message); }
  }

  // ── Warehouse CRUD ─────────────────────────────────────────────────────────
  async function createWarehouse(e: React.FormEvent) {
    e.preventDefault();
    setWarehouseCreating(true);
    try {
      const wh = await api.post('/api/inventory/warehouses', { ...warehouseForm, is_active: true });
      setWarehouses(prev => [{ ...warehouseForm, id: wh.id, is_active: true } as Warehouse, ...prev]);
      setShowCreateWarehouse(false);
      setWarehouseForm({ name: '', address: '' });
    } catch (err: any) { alert(err.message); }
    finally { setWarehouseCreating(false); }
  }

  async function saveEditWarehouse(e: React.FormEvent) {
    e.preventDefault();
    if (!editingWarehouse) return;
    try {
      await api.patch(`/api/inventory/warehouses/${editingWarehouse.id}`, {
        name: editingWarehouse.name, address: editingWarehouse.address, is_active: editingWarehouse.is_active,
      });
      setWarehouses(prev => prev.map(w => w.id === editingWarehouse.id ? editingWarehouse : w));
      setEditingWarehouse(null);
    } catch (err: any) { alert(err.message); }
  }

  async function deleteWarehouse(whId: string) {
    if (!confirm(tInventory('warehouseConfirmDelete'))) return;
    try {
      await api.delete(`/api/inventory/warehouses/${whId}`);
      setWarehouses(prev => prev.filter(w => w.id !== whId));
    } catch (err: any) { alert(err.message); }
  }

  async function toggleWarehouseActive(wh: Warehouse) {
    try {
      await api.patch(`/api/inventory/warehouses/${wh.id}`, { is_active: !wh.is_active });
      setWarehouses(prev => prev.map(w => w.id === wh.id ? { ...w, is_active: !w.is_active } : w));
    } catch (err: any) { alert(err.message); }
  }

  const filteredMovements = movements.filter(m => {
    const matchType = !movementTypeFilter || m.movement_type === movementTypeFilter;
    const matchSearch = !movementSearch || m.notes?.toLowerCase().includes(movementSearch.toLowerCase());
    return matchType && matchSearch;
  });

  const movementTypes = Array.from(new Set(movements.map(m => m.movement_type)));

  // ── Purchase Order CRUD ──────────────────────────────────────────────────────
  async function createPO() {
    if (!newPO.po_number.trim()) { alert(tInventory('poEnterNumber')); return; }
    setPoCreating(true);
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
      setPoPanelMode('none');
      await loadPurchaseOrders();
    } catch (e: any) {
      alert(tInventory('poCreateFailed') + ': ' + (e.message || ''));
    } finally {
      setPoCreating(false);
    }
  }

  async function updatePOStatus(id: string, status: string) {
    setPoSaving(true);
    try {
      await api.patch(`/api/orders/purchase/${id}`, { status });
      setPurchaseOrders(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      if (selectedPO?.id === id) setSelectedPO(prev => prev ? { ...prev, status } : prev);
    } finally {
      setPoSaving(false);
    }
  }

  async function deletePO(id: string) {
    if (!confirm(tInventory('poConfirmDelete'))) return;
    try {
      await api.delete(`/api/orders/purchase/${id}`);
    } catch { /* ignore */ }
    setPurchaseOrders(prev => prev.filter(p => p.id !== id));
    if (selectedPO?.id === id) { setPoPanelMode('none'); setSelectedPO(null); }
  }

  const TAB_LABELS: Record<string, string> = {
    inventory: tInventory('tabInventory'),
    procurement: tInventory('tabProcurement'),
  };

  const INVENTORY_SUB_LABELS: Record<string, string> = {
    products: tInventory('tabProducts'),
    warehouses: tInventory('tabWarehouses'),
    movements: tInventory('tabMovements'),
  };

  const PROCUREMENT_SUB_LABELS: Record<string, string> = {
    purchase_orders: tInventory('tabPO'),
    suppliers: tInventory('tabSuppliers'),
    sc_inquiries: tInventory('tabScInquiries'),
  };

  const productCols: Column<Product>[] = [
    { key: 'sku', label: tInventory('colSku'), type: 'mono' },
    { key: 'name', label: tCommon('name') },
    { key: 'category', label: tInventory('colCategory') },
    { key: 'current_stock', label: tInventory('colStock'), render: (v, row) => {
      const isLow = row.current_stock <= row.reorder_point && row.reorder_point > 0;
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {v} {row.unit}
          {isLow && <HandIcon name="warning" size={12} />}
        </span>
      );
    }},
    { key: 'cost_price', label: tInventory('colCost'), render: v => `$${Number(v || 0).toFixed(2)}` },
    { key: 'sell_price', label: tInventory('colPrice'), render: v => `$${Number(v || 0).toFixed(2)}` },
    { key: 'current_stock', label: tInventory('colValue'), render: (v, row) => `$${(row.current_stock * row.sell_price).toLocaleString()}` },
  ];

  const warehouseCols: Column<Warehouse>[] = [
    { key: 'name', label: tCommon('name') },
    { key: 'is_active', label: tCommon('status'), render: v => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${v ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
        {v ? tCommon('active') : tCommon('inactive')}
      </span>
    )},
    { key: 'address', label: tInventory('colAddress') },
  ];

  const movementCols: Column<Movement>[] = [
    { key: 'created_at', label: tCommon('date'), render: v => new Date(v).toLocaleDateString() },
    { key: 'product_id', label: tInventory('colSku'), render: v => `${String(v).slice(0, 8)}...` },
    { key: 'movement_type', label: tCommon('type'), render: v => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
        v === 'in' ? 'bg-green-100 text-green-700' :
        v === 'out' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
      }`}>{v}</span>
    )},
    { key: 'quantity', label: tInventory('colStock'), render: v => (
      <span className={Number(v) >= 0 ? 'text-green-600' : 'text-red-600'}>
        {Number(v) >= 0 ? '+' : ''}{v}
      </span>
    )},
    { key: 'notes', label: tCommon('notes') },
  ];

  const inputCls = "w-full px-3 py-2 rounded-md text-sm outline-none";
  const inputStyle = { border: '1px solid var(--notion-border)', color: 'var(--notion-text)' };

  if (loading) return <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</div>;

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="px-8 pt-8 pb-4">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--notion-text)' }}>{tInventory('supplyChainTitle')}</h1>
        <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>
          {tab === 'procurement' && procurementSubTab === 'suppliers' ? tInventory('supplierCount', { n: suppliers.length })
            : tab === 'procurement' && procurementSubTab === 'purchase_orders' ? tInventory('poCount', { n: purchaseOrders.length })
            : tab === 'procurement' && procurementSubTab === 'sc_inquiries' ? tInventory('scCount', { n: scInquiries.length })
            : tab === 'inventory' && inventorySubTab === 'warehouses' ? tInventory('warehouseCount', { n: warehouses.length })
            : tab === 'inventory' && inventorySubTab === 'movements' ? tInventory('movementCount', { n: movements.length })
            : tInventory('productsCount', { n: products.length })}
        </p>
      </div>

      <div className="px-8"><AnomalyAlertBar module="inventory" /></div>

      {/* Summary cards — for inventory tab */}
      {tab === 'inventory' && (
        <div className="px-8 pb-4 grid grid-cols-3 gap-3">
          {(inventorySubTab === 'warehouses' ? [
            { label: tInventory('cardTotalWarehouses'), value: warehouses.length, color: '#4338ca', bg: '#eef2ff' },
            { label: tInventory('cardActiveWarehouses'), value: warehouses.filter(w => w.is_active).length, color: '#15803d', bg: '#f0fdf4' },
            { label: tInventory('cardInactiveWarehouses'), value: warehouses.filter(w => !w.is_active).length, color: '#9B9A97', bg: '#f3f4f6' },
          ] : inventorySubTab === 'movements' ? [
            { label: tInventory('cardTotalMovements'), value: movements.length, color: '#4338ca', bg: '#eef2ff' },
            { label: tInventory('cardInbound'), value: movements.filter(m => m.movement_type === 'in').length, color: '#15803d', bg: '#f0fdf4' },
            { label: tInventory('cardOutbound'), value: movements.filter(m => m.movement_type === 'out').length, color: '#dc2626', bg: '#fef2f2' },
          ] : [
            { label: tInventory('cardTotalProducts'), value: products.length, color: '#4338ca', bg: '#eef2ff' },
            { label: tInventory('cardLowStock'), value: lowStockCount, color: lowStockCount > 0 ? '#dc2626' : '#16a34a', bg: lowStockCount > 0 ? '#fef2f2' : '#f0fdf4' },
            { label: tInventory('cardTotalValue'), value: `$${totalValue.toLocaleString()}`, color: '#065f46', bg: '#ecfdf5' },
          ]).map(({ label, value, color, bg }) => (
            <div key={label} className="rounded-lg px-4 py-3" style={{ background: bg }}>
              <p className="text-xs font-medium mb-0.5" style={{ color }}>{label}</p>
              <p className="text-xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Procurement summary cards */}
      {tab === 'procurement' && (
        <div className="px-8 pb-4 grid grid-cols-3 gap-3">
          {(procurementSubTab === 'suppliers' ? [
            { label: tInventory('totalSuppliers'), value: suppliers.length, color: '#4338ca', bg: '#eef2ff' },
            { label: tInventory('saRatedSuppliers'), value: suppliers.filter(s => s.rating === 'S' || s.rating === 'A').length, color: '#15803d', bg: '#f0fdf4' },
            { label: tInventory('cdRatedSuppliers'), value: suppliers.filter(s => s.rating === 'C' || s.rating === 'D').length, color: '#b91c1c', bg: '#fef2f2' },
          ] : procurementSubTab === 'purchase_orders' ? [
            { label: tInventory('cardTotalPO'), value: purchaseOrders.length, color: '#4338ca', bg: '#eef2ff' },
            { label: tInventory('cardPODraft'), value: purchaseOrders.filter(p => p.status === 'draft').length, color: '#9B9A97', bg: '#f3f4f6' },
            { label: tInventory('cardPOConfirmed'), value: purchaseOrders.filter(p => p.status === 'confirmed').length, color: '#1d4ed8', bg: '#eff6ff' },
          ] : [
            { label: tInventory('scTotalLabel'), value: scInquiries.length, color: '#4338ca', bg: '#eef2ff' },
            { label: tInventory('scCompletedLabel'), value: scInquiries.filter(i => i.sc_result?.confirmed).length, color: '#15803d', bg: '#f0fdf4' },
            { label: tInventory('scPendingLabel'), value: scInquiries.filter(i => !i.sc_result?.confirmed).length, color: '#b45309', bg: '#fffbeb' },
          ]).map(({ label, value, color, bg }) => (
            <div key={label} className="rounded-lg px-4 py-3" style={{ background: bg }}>
              <p className="text-xs font-medium mb-0.5" style={{ color }}>{label}</p>
              <p className="text-xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="px-8 pb-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--notion-active)' }}>
          {(['procurement', 'inventory'] as const).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              className="px-3 py-1 rounded text-sm font-medium transition-colors"
              style={{
                background: tab === tabKey ? 'white' : 'transparent',
                color: tab === tabKey ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                boxShadow: tab === tabKey ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {TAB_LABELS[tabKey]}
            </button>
          ))}
        </div>

        {/* Inventory sub-tabs */}
        {tab === 'inventory' && (
          <div className="flex gap-0.5 rounded-md p-0.5 ml-1" style={{ background: 'var(--notion-hover)' }}>
            {(['products', 'warehouses', 'movements'] as const).map(subKey => (
              <button key={subKey} onClick={() => setInventorySubTab(subKey)}
                className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background: inventorySubTab === subKey ? 'var(--notion-card, white)' : 'transparent',
                  color: inventorySubTab === subKey ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                  boxShadow: inventorySubTab === subKey ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}>
                {INVENTORY_SUB_LABELS[subKey]}
              </button>
            ))}
          </div>
        )}

        {/* Procurement sub-tabs */}
        {tab === 'procurement' && (
          <div className="flex gap-0.5 rounded-md p-0.5 ml-1" style={{ background: 'var(--notion-hover)' }}>
            {(['purchase_orders', 'suppliers', 'sc_inquiries'] as const).map(subKey => (
              <button key={subKey} onClick={() => setProcurementSubTab(subKey)}
                className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background: procurementSubTab === subKey ? 'var(--notion-card, white)' : 'transparent',
                  color: procurementSubTab === subKey ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                  boxShadow: procurementSubTab === subKey ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}>
                {PROCUREMENT_SUB_LABELS[subKey]}
              </button>
            ))}
          </div>
        )}

        {tab === 'inventory' && inventorySubTab === 'products' && (
          <>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--notion-text-muted)' }}>
              <input type="checkbox" checked={showLowStock} onChange={e => setShowLowStock(e.target.checked)} className="rounded" />
              {tInventory('lowStockOnly')}
            </label>
            <input placeholder={tInventory('searchProducts')} value={search} onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 rounded-md text-sm outline-none"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', width: 200 }} />
            <div className="ml-auto">
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white transition-opacity"
                style={{ background: 'var(--notion-accent)' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                {tInventory('newProduct')}
              </button>
            </div>
            {/* Product View Toggle */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--notion-active)' }}>
              {([
                { mode: 'table' as const, icon: '☰', label: '表格' },
                { mode: 'card' as const, icon: '▦', label: '卡片' },
              ]).map(item => {
                const active = productViewMode === item.mode;
                return (
                  <button key={item.mode} onClick={() => setProductViewMode(item.mode)}
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
          </>
        )}
        {tab === 'inventory' && inventorySubTab === 'warehouses' && (
          <div className="ml-auto">
            <button onClick={() => setShowCreateWarehouse(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white transition-opacity"
              style={{ background: 'var(--notion-accent)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {tInventory('newWarehouse')}
            </button>
          </div>
        )}
        {tab === 'inventory' && inventorySubTab === 'movements' && (
          <>
            <input placeholder={tInventory('searchMovements')} value={movementSearch} onChange={e => setMovementSearch(e.target.value)}
              className="px-3 py-1.5 rounded-md text-sm outline-none"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', width: 200 }} />
            {movementTypes.length > 0 && (
              <select value={movementTypeFilter} onChange={e => setMovementTypeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-md text-sm outline-none bg-white"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                <option value="">{tInventory('allMovementTypes')}</option>
                {movementTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {(movementSearch || movementTypeFilter) && (
              <button onClick={() => { setMovementSearch(''); setMovementTypeFilter(''); }}
                className="text-xs px-2 py-1 rounded-lg" style={{ color: '#9B9A97', background: 'var(--notion-active)' }}>
                {tInventory('clearFilter')}
              </button>
            )}
          </>
        )}
        {tab === 'procurement' && procurementSubTab === 'suppliers' && (
          <>
            <input placeholder={tInventory('searchSuppliers')} value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)}
              className="px-3 py-1.5 rounded-md text-sm outline-none"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', width: 200 }} />
            <select value={supplierTypeFilter} onChange={e => setSupplierTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-md text-sm outline-none bg-white"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
              <option value="">{tInventory('supplierTypeAll')}</option>
              {Array.from(new Set([...supplierTypes, ...suppliers.map(s => s.supplier_type).filter(Boolean)])).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {(supplierSearch || supplierTypeFilter) && (
              <button onClick={() => { setSupplierSearch(''); setSupplierTypeFilter(''); }}
                className="text-xs px-2 py-1 rounded-lg" style={{ color: '#9B9A97', background: 'var(--notion-active)' }}>
                {tInventory('clearFilter')}
              </button>
            )}
            <div className="ml-auto">
              <button onClick={() => setShowCreateSupplier(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white transition-opacity"
                style={{ background: 'var(--notion-accent)' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                {tInventory('newSupplier')}
              </button>
            </div>
            {/* Supplier View Toggle */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--notion-active)' }}>
              {([
                { mode: 'table' as const, icon: '☰', label: '列表' },
                { mode: 'card' as const, icon: '▦', label: '卡片' },
              ]).map(item => {
                const active = supplierViewMode === item.mode;
                return (
                  <button key={item.mode} onClick={() => setSupplierViewMode(item.mode)}
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
          </>
        )}
        {tab === 'procurement' && procurementSubTab === 'sc_inquiries' && (
          <div className="ml-auto">
            <button onClick={loadScInquiries} disabled={scLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--notion-active)', border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              {scLoading ? tInventory('scRefreshing') : tInventory('scRefresh')}
            </button>
          </div>
        )}
        {tab === 'procurement' && procurementSubTab === 'purchase_orders' && (
          <>
            <input placeholder={tInventory('searchPO')} value={poSearch} onChange={e => setPoSearch(e.target.value)}
              className="px-3 py-1.5 rounded-md text-sm outline-none"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', width: 240 }} />
            <select value={poStatusFilter} onChange={e => setPoStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-md text-sm outline-none bg-white"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
              <option value="">{tInventory('allStatus')}</option>
              {PO_STATUS_OPTIONS.map(s => <option key={s} value={s}>{getPOStatusConfig(tInventory)[s]?.label || s}</option>)}
            </select>
            {(poSearch || poStatusFilter) && (
              <button onClick={() => { setPoSearch(''); setPoStatusFilter(''); }}
                className="text-xs px-2 py-1 rounded-lg" style={{ color: '#9B9A97', background: 'var(--notion-active)' }}>
                {tInventory('clearFilter')}
              </button>
            )}
            <div className="ml-auto">
              <button onClick={() => { setPoPanelMode('create'); setSelectedPO(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
                style={{ background: '#c2410c' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                {tInventory('newPurchaseOrder')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className={(tab === 'procurement' && procurementSubTab === 'purchase_orders') ? 'flex-1 flex overflow-hidden' : 'flex-1 overflow-auto px-8 py-4'}>
        {tab === 'inventory' && inventorySubTab === 'products' && (
          productViewMode === 'card' ? (
            filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                <p className="mb-3"><HandIcon name="package" size={32} /></p>
                <p>{search || showLowStock ? tInventory('emptyFiltered') : tInventory('emptyProducts')}</p>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {filteredProducts.map(p => {
                  const isLow = p.current_stock <= p.reorder_point && p.reorder_point > 0;
                  const stockPct = p.reorder_point > 0 ? Math.min(100, (p.current_stock / (p.reorder_point * 3)) * 100) : 100;
                  const stockColor = isLow ? '#ef4444' : stockPct > 60 ? '#10b981' : '#f59e0b';
                  return (
                    <div key={p.id}
                      className="rounded-xl overflow-hidden cursor-pointer transition-all"
                      style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                      onClick={() => setSelectedProduct(p)}>
                      <div style={{ height: 4, background: stockColor }} />
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'var(--notion-hover)', color: 'var(--notion-text-muted)' }}>{p.sku}</span>
                          {p.category && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#7c3aed' }}>{p.category}</span>}
                        </div>
                        <p className="font-semibold text-sm mb-3" style={{ color: 'var(--notion-text)' }}>{p.name}</p>
                        {/* Stock level bar */}
                        <div className="mb-2">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span style={{ color: 'var(--notion-text-muted)' }}>{tInventory('colStock')}</span>
                            <span style={{ color: stockColor, fontWeight: 600 }}>{p.current_stock} {p.unit}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 99, background: '#e5e7eb', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${stockPct}%`, background: stockColor, borderRadius: 99, transition: 'width 0.5s ease' }} />
                          </div>
                          {isLow && (
                            <div className="flex items-center gap-1 mt-1">
                              <HandIcon name="warning" size={10} />
                              <span className="text-[10px] font-medium" style={{ color: '#ef4444' }}>{tInventory('lowStockOnly')}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                          <span>{tInventory('colCost')}: ${Number(p.cost_price || 0).toFixed(2)}</span>
                          <span>{tInventory('colPrice')}: ${Number(p.sell_price || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <NotionTable
              columns={productCols}
              data={filteredProducts}
              onRowClick={setSelectedProduct}
              onCreate={() => setShowCreate(true)}
              createLabel={tInventory('createProductLabel')}
              emptyMessage={search || showLowStock ? tInventory('emptyFiltered') : tInventory('emptyProducts')}
              rowActions={row => (
                <button
                  onClick={e => { e.stopPropagation(); setShowAdjust(row.id); }}
                  className="px-2 py-1 rounded text-xs transition-colors"
                  style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-active)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--notion-active)')}
                >
                  {tInventory('adjust')}
                </button>
              )}
            />
          )
        )}
        {tab === 'inventory' && inventorySubTab === 'warehouses' && (
          <div>
            {warehouses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                <p className="mb-3"><HandIcon name="building" size={32} /></p>
                <p>{tInventory('emptyWarehouses')}</p>
                <button onClick={() => setShowCreateWarehouse(true)}
                  className="mt-3 text-sm px-4 py-2 rounded-lg font-medium text-white"
                  style={{ background: 'var(--notion-accent)' }}>
                  {tInventory('createFirstWarehouse')}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {warehouses.map(wh => (
                  <div key={wh.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg border group transition-all"
                    style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: wh.is_active ? '#f0fdf4' : '#f3f4f6', color: wh.is_active ? '#15803d' : '#9ca3af' }}>
                      <HandIcon name="building" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm" style={{ color: 'var(--notion-text)' }}>{wh.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${wh.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {wh.is_active ? tCommon('active') : tCommon('inactive')}
                        </span>
                      </div>
                      {wh.address && (
                        <p className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>
                          <HandIcon name="pin" size={11} /> {wh.address}
                        </p>
                      )}
                    </div>
                    <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => toggleWarehouseActive(wh)}
                        className="px-2 py-1 rounded text-xs transition-colors"
                        style={{ color: wh.is_active ? '#b91c1c' : '#15803d', background: wh.is_active ? '#fef2f2' : '#f0fdf4' }}>
                        {wh.is_active ? tInventory('warehouseDeactivate') : tInventory('warehouseActivate')}
                      </button>
                      <button onClick={() => setEditingWarehouse({ ...wh })}
                        className="px-2 py-1 rounded text-xs transition-colors"
                        style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-active)' }}>
                        {tCustomer360('editBtn')}
                      </button>
                      <button onClick={() => deleteWarehouse(wh.id)}
                        className="px-2 py-1 rounded text-xs transition-colors"
                        style={{ color: '#ef4444', background: '#fef2f2' }}>
                        {tCommon('delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'procurement' && procurementSubTab === 'purchase_orders' && (() => {
          const poInputStyle: React.CSSProperties = {
            background: 'var(--notion-hover)', border: '1px solid var(--notion-border)',
            color: 'var(--notion-text)', borderRadius: 8, padding: '5px 10px',
            fontSize: 12, outline: 'none', width: '100%',
          };
          const filteredPO = purchaseOrders.filter(p => {
            const matchSearch = !poSearch
              || p.po_number.toLowerCase().includes(poSearch.toLowerCase())
              || (p.supplier_name || '').toLowerCase().includes(poSearch.toLowerCase())
              || (p.product_name || '').toLowerCase().includes(poSearch.toLowerCase());
            const matchStatus = !poStatusFilter || p.status === poStatusFilter;
            return matchSearch && matchStatus;
          });
          return (
            <>
              {/* PO Table area */}
              <div className="flex-1 overflow-auto px-8 py-4">
                {filteredPO.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <HandIcon name="package" size={32} />
                    <p className="text-sm" style={{ color: '#9B9A97' }}>
                      {tInventory('noPurchaseOrders')}{poSearch || poStatusFilter ? tInventory('adjustSearchHint') : ''}
                    </p>
                    {!poSearch && !poStatusFilter && (
                      <button onClick={() => setPoPanelMode('create')}
                        className="text-sm px-4 py-2 rounded-lg font-medium text-white mt-2"
                        style={{ background: '#c2410c' }}>
                        {tInventory('createFirstPO')}
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--notion-border)' }}>
                        {[tInventory('poColNumber'), tInventory('poColSupplier'), tInventory('poColProductSpec'), tInventory('poColAmount'), tInventory('poColDelivery'), tInventory('poColPayment'), tInventory('poColStatus'), tInventory('poColCreated'), tInventory('poColActions')].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-[11px] font-bold uppercase tracking-wide"
                            style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPO.map((po, i) => (
                        <tr key={po.id}
                          onClick={() => { setSelectedPO(po); setPoPanelMode('detail'); }}
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
                            {po.total ? fmtMoney(po.total, po.currency) : po.unit_price ? `${fmtMoney(po.unit_price, po.currency)}/${tInventory('poPerUnit')}` : '—'}
                          </td>
                          <td className="py-2.5 px-3" style={{ whiteSpace: 'nowrap', color: '#9B9A97' }}>
                            {fmtDate(po.expected_date)}
                          </td>
                          <td className="py-2.5 px-3 text-[11px]" style={{ color: '#9B9A97' }}>
                            {po.payment_method || '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <POStatusBadge status={po.status} />
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
                                  {po.status === 'draft' ? tInventory('poToConfirm') : tInventory('poToFulfill')}
                                </button>
                              )}
                              {po.lead_id && (
                                <button onClick={() => router.push(`/${tenant}/crm/customer-360/${po.lead_id}`)}
                                  className="text-[10px] px-2 py-0.5 rounded-lg"
                                  style={{ background: 'var(--notion-hover)', color: '#9B9A97' }}>
                                  {tInventory('poGoToCRM')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* PO Right Panel */}
              {poPanelMode !== 'none' && (
                <div className="flex-shrink-0 border-l flex flex-col overflow-hidden"
                  style={{ width: 420, borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
                  <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
                    <h2 className="text-base font-bold" style={{ color: 'var(--notion-text)' }}>
                      {poPanelMode === 'create' ? <><HandIcon name="sparkle-new" size={16} /> {tInventory('poCreateTitle')}</> : <><HandIcon name="package" size={16} /> {tInventory('poDetailTitle')}</>}
                    </h2>
                    <button onClick={() => { setPoPanelMode('none'); setSelectedPO(null); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-sm"
                      style={{ color: '#9B9A97', background: 'var(--notion-active)' }}>✕</button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {poPanelMode === 'create' && (
                      <>
                        <div className="space-y-3">
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poNumberReq')}</label>
                            <input placeholder="PO-2025-001" value={newPO.po_number}
                              onChange={e => setNewPO(p => ({ ...p, po_number: e.target.value }))}
                              style={poInputStyle} />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poColSupplier')}</label>
                            <select value={newPO.vendor_company_id}
                              onChange={e => setNewPO(p => ({ ...p, vendor_company_id: e.target.value }))}
                              style={{ ...poInputStyle, background: 'var(--notion-card, white)' }}>
                              <option value="">{tInventory('poSelectSupplier')}</option>
                              {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}{s.rating ? ` · ${tInventory('poRatingLevel', { r: s.rating })}` : ''}</option>
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
                              style={{ ...poInputStyle, background: 'var(--notion-card, white)' }}>
                              <option value="">不关联产品</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.sku} - {p.name} (库存: {p.current_stock})</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poProductName')}</label>
                              <input placeholder={tInventory('poProductPlaceholder')} value={newPO.product_name}
                                onChange={e => setNewPO(p => ({ ...p, product_name: e.target.value }))}
                                style={poInputStyle} />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poQuantity')}</label>
                              <input placeholder={tInventory('poQuantityPlaceholder')} type="number" value={newPO.quantity_numeric || newPO.quantity}
                                onChange={e => setNewPO(p => ({ ...p, quantity: e.target.value, quantity_numeric: e.target.value }))}
                                style={poInputStyle} />
                            </div>
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poSpecs')}</label>
                            <input placeholder={tInventory('poSpecsPlaceholder')} value={newPO.specs}
                              onChange={e => setNewPO(p => ({ ...p, specs: e.target.value }))}
                              style={poInputStyle} />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poTotalAmount')}</label>
                              <input placeholder="0" type="number" value={newPO.total}
                                onChange={e => setNewPO(p => ({ ...p, total: e.target.value }))}
                                style={poInputStyle} />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poCurrency')}</label>
                              <select value={newPO.currency}
                                onChange={e => setNewPO(p => ({ ...p, currency: e.target.value }))}
                                style={{ ...poInputStyle, background: 'var(--notion-card, white)' }}>
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poPaymentMethod')}</label>
                              <input placeholder={tInventory('poPaymentPlaceholder')} value={newPO.payment_method}
                                onChange={e => setNewPO(p => ({ ...p, payment_method: e.target.value }))}
                                style={poInputStyle} />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poExpectedDelivery')}</label>
                              <input type="date" value={newPO.expected_date}
                                onChange={e => setNewPO(p => ({ ...p, expected_date: e.target.value }))}
                                style={poInputStyle} />
                            </div>
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poStatus')}</label>
                            <select value={newPO.status}
                              onChange={e => setNewPO(p => ({ ...p, status: e.target.value }))}
                              style={{ ...poInputStyle, background: 'var(--notion-card, white)' }}>
                              {PO_STATUS_OPTIONS.map(s => (
                                <option key={s} value={s}>{getPOStatusConfig(tInventory)[s]?.label || s}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{tInventory('poNotes')}</label>
                            <textarea value={newPO.notes} rows={3}
                              onChange={e => setNewPO(p => ({ ...p, notes: e.target.value }))}
                              placeholder={tInventory('poNotesPlaceholder')}
                              style={{ ...poInputStyle, resize: 'none', lineHeight: '1.6' }} />
                          </div>
                        </div>
                        <button onClick={createPO} disabled={poCreating || !newPO.po_number.trim()}
                          className="w-full py-2.5 rounded-xl font-semibold text-white text-sm disabled:opacity-40"
                          style={{ background: '#c2410c' }}>
                          {poCreating ? tInventory('poCreating') : tInventory('poCreateBtn')}
                        </button>
                      </>
                    )}

                    {poPanelMode === 'detail' && selectedPO && (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-bold" style={{ color: '#c2410c' }}>{selectedPO.po_number}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: '#9B9A97' }}>{tInventory('poCreatedOn', { date: fmtDate(selectedPO.created_at) })}</p>
                          </div>
                          <POStatusBadge status={selectedPO.status} />
                        </div>

                        {selectedPO.supplier_name && (
                          <div className="rounded-xl p-3" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                            <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#c2410c' }}>{tInventory('poSupplierSection')}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: 'var(--notion-text)' }}><HandIcon name="factory" size={14} /> {selectedPO.supplier_name}</span>
                              {selectedPO.supplier_rating && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#f0fdf4', color: '#15803d' }}>
                                  {tInventory('poRatingLevel', { r: selectedPO.supplier_rating })}
                                </span>
                              )}
                            </div>
                            {selectedPO.supplier_contact && (
                              <p className="text-[11px] mt-1" style={{ color: '#9B9A97' }}>{tInventory('poContactPerson')}: {selectedPO.supplier_contact}</p>
                            )}
                          </div>
                        )}

                        {(selectedPO.product_name || selectedPO.specs) && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>{tInventory('poProductInfo')}</p>
                            <div className="rounded-xl p-3 space-y-1" style={{ background: 'var(--notion-active)', border: '1px solid var(--notion-border)' }}>
                              {[
                                { label: tInventory('poFieldProductName'), value: selectedPO.product_name },
                                { label: tInventory('poFieldSpecs'), value: selectedPO.specs },
                                { label: tInventory('poFieldQuantity'), value: selectedPO.quantity },
                                { label: tInventory('poFieldUnitPrice'), value: selectedPO.unit_price ? fmtMoney(selectedPO.unit_price, selectedPO.currency) : undefined },
                                { label: tInventory('poFieldTotalAmount'), value: selectedPO.total ? fmtMoney(selectedPO.total, selectedPO.currency) : undefined },
                                { label: tInventory('poFieldPaymentMethod'), value: selectedPO.payment_method },
                                { label: tInventory('poFieldExpectedDelivery'), value: fmtDate(selectedPO.expected_date) },
                              ].filter(r => r.value && r.value !== '—').map(r => (
                                <div key={r.label} className="flex items-center gap-2">
                                  <span className="text-[10px] w-16 flex-shrink-0" style={{ color: '#9B9A97' }}>{r.label}</span>
                                  <span className="text-[12px]" style={{ color: 'var(--notion-text)' }}>{r.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedPO.contract_file_url && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9B9A97' }}>{tInventory('poPurchaseContract')}</p>
                            <a href={selectedPO.contract_file_url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                              style={{ background: '#eff6ff', color: '#0284c7', border: '1px solid #bae6fd', textDecoration: 'none' }}>
                              <HandIcon name="document" size={14} /> {selectedPO.contract_file_name || tInventory('poContractFile')}
                            </a>
                          </div>
                        )}

                        {selectedPO.notes && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9B9A97' }}>{tInventory('poNotes')}</p>
                            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--notion-active)', color: 'var(--notion-text)' }}>
                              {selectedPO.notes}
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#9B9A97' }}>{tInventory('poUpdateStatus')}</p>
                          <div className="flex flex-wrap gap-2">
                            {PO_STATUS_OPTIONS.filter(s => s !== selectedPO.status).map(s => {
                              const cfg = getPOStatusConfig(tInventory)[s];
                              return (
                              <button key={s} onClick={() => updatePOStatus(selectedPO.id, s)}
                                disabled={poSaving}
                                className="text-[11px] px-3 py-1.5 rounded-lg font-medium"
                                style={{ background: cfg?.bg, color: cfg?.color, border: `1px solid ${cfg?.color}33` }}>
                                {cfg?.label}
                              </button>
                              );
                            })}
                          </div>
                        </div>

                        {selectedPO.lead_id && (
                          <button onClick={() => router.push(`/${tenant}/crm/customer-360/${selectedPO.lead_id}`)}
                            className="w-full text-sm py-2 rounded-xl font-medium"
                            style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                            {tInventory('poGoToCRMDetail')}
                          </button>
                        )}

                        <button onClick={() => deletePO(selectedPO.id)}
                          className="w-full text-xs py-1.5 rounded-xl"
                          style={{ color: '#9B9A97', background: 'transparent', border: '1px solid var(--notion-border)' }}>
                          {tInventory('poDeleteOrder')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          );
        })()}
        {tab === 'inventory' && inventorySubTab === 'movements' && (
          <div>
            {filteredMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                <p className="mb-3"><HandIcon name="package" size={32} /></p>
                <p>{movementSearch || movementTypeFilter ? tInventory('emptyFiltered') : tInventory('emptyMovements')}</p>
              </div>
            ) : (
              <NotionTable columns={movementCols} data={filteredMovements} emptyMessage={tInventory('emptyMovements')} />
            )}
          </div>
        )}

        {/* ── Procurement Inquiries tab ── */}
        {tab === 'procurement' && procurementSubTab === 'sc_inquiries' && (
          <div>
            {scLoading ? (
              <div className="py-16 text-center text-sm" style={{ color: '#9B9A97' }}>{tInventory('scLoadingText')}</div>
            ) : scError ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: '#9B9A97' }}>
                <p className="mb-3"><HandIcon name="warning" size={32} /></p>
                <p style={{ color: '#b91c1c' }}>{tInventory('scLoadFailed')}</p>
                <button onClick={loadScInquiries} className="mt-3 text-xs px-4 py-1.5 rounded-lg font-medium text-white"
                  style={{ background: '#c2410c' }}>
                  {tInventory('scRetry')}
                </button>
              </div>
            ) : scInquiries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: '#9B9A97' }}>
                <p className="mb-3"><HandIcon name="factory" size={32} /></p>
                <p>{tInventory('scNoInquiries')}</p>
                <p className="text-xs mt-1">{tInventory('scAfterSubmit')}</p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--notion-border)' }}>
                    {[tInventory('scColLevel'), tInventory('scColCustomer'), tInventory('scProductName'), tInventory('scQuantity'), tInventory('scTargetPrice'), tInventory('scColQuotes'), tCommon('status'), tCommon('date'), ''].map(h => (
                      <th key={h || 'action'} className="text-left py-2 px-3 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scInquiries.map(inq => (
                    <ScInquiryRow
                      key={inq.lead_id}
                      inq={inq}
                      tenant={tenant}
                      router={router}
                      suppliers={suppliers}
                      onSupplierCreated={(sup) => setSuppliers(prev => [sup, ...prev])}
                      isExpanded={expandedInquiry === inq.lead_id}
                      onToggle={() => setExpandedInquiry(prev => prev === inq.lead_id ? null : inq.lead_id)}
                      onUpdate={async (leadId, payload) => {
                        await api.patch(`/api/crm/supply-chain/inquiries/${leadId}`, payload);
                        await loadScInquiries();
                      }}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Suppliers tab */}
        {tab === 'procurement' && procurementSubTab === 'suppliers' && (
          supplierViewMode === 'card' ? (
            filteredSuppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                <p className="mb-3"><HandIcon name="factory" size={32} /></p>
                <p>{supplierSearch ? tInventory('supplierNoMatch') : tInventory('supplierEmptyHint')}</p>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {filteredSuppliers.map(sup => {
                  const rc = RATING_COLORS[sup.rating] ?? { bg: '#f3f4f6', color: '#6b7280' };
                  return (
                    <div key={sup.id}
                      className="rounded-xl overflow-hidden cursor-pointer transition-all"
                      style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                      onClick={() => openSupplier(sup)}>
                      <div className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                            style={{ background: rc.bg, color: rc.color }}>
                            {sup.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate" style={{ color: 'var(--notion-text)' }}>{sup.name}</p>
                            {sup.company_info && <p className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>{sup.company_info}</p>}
                          </div>
                          {sup.rating && (
                            <span className="text-lg font-bold px-2 py-0.5 rounded-lg flex-shrink-0"
                              style={{ background: rc.bg, color: rc.color }}>
                              {sup.rating}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {sup.supplier_type && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                              {sup.supplier_type}
                            </span>
                          )}
                          {sup.contact_person && (
                            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--notion-text-muted)' }}>
                              <HandIcon name="person" size={10} /> {sup.contact_person}
                            </span>
                          )}
                          {sup.contact_info && (
                            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--notion-text-muted)' }}>
                              <HandIcon name="phone" size={10} /> {sup.contact_info}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div>
              {filteredSuppliers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                  <p className="mb-3"><HandIcon name="factory" size={32} /></p>
                  <p>{supplierSearch ? tInventory('supplierNoMatch') : tInventory('supplierEmptyHint')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSuppliers.map(sup => {
                    const rc = RATING_COLORS[sup.rating] ?? { bg: '#f3f4f6', color: '#6b7280' };
                    return (
                      <div
                        key={sup.id}
                        className="flex items-center gap-4 px-4 py-3 rounded-lg border cursor-pointer group transition-all"
                        style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = '#d1d5db'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
                        onClick={() => openSupplier(sup)}
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
                          style={{ background: rc.bg, color: rc.color }}>
                          {sup.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm truncate" style={{ color: 'var(--notion-text)' }}>{sup.name}</span>
                            {sup.rating && (
                              <span className="px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0" style={{ background: rc.bg, color: rc.color }}>
                                {sup.rating} {tInventory('supplierRated')}
                              </span>
                            )}
                            {sup.supplier_type && (
                              <span className="px-1.5 py-0.5 rounded text-xs flex-shrink-0" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                                {sup.supplier_type}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                            {sup.contact_person && <span className="inline-flex items-center gap-1"><HandIcon name="person" size={12} /> {sup.contact_person}</span>}
                            {sup.contact_info && <span className="inline-flex items-center gap-1"><HandIcon name="phone" size={12} /> {sup.contact_info}</span>}
                            {sup.company_info && <span className="truncate max-w-xs inline-flex items-center gap-1"><HandIcon name="building" size={12} /> {sup.company_info}</span>}
                          </div>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); setEditingSupplier({ ...sup }); }}
                            className="px-2 py-1 rounded text-xs transition-colors"
                            style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-active)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--notion-active)')}
                          >
                            {tCustomer360('editBtn')}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteSupplier(sup.id); }}
                            className="px-2 py-1 rounded text-xs transition-colors"
                            style={{ color: '#ef4444', background: '#fef2f2' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
                          >
                            {tCommon('delete')}
                          </button>
                        </div>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--notion-text-muted)' }}>{tInventory('supplierViewQuotations')}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Product detail SlideOver */}
      <SlideOver open={!!selectedProduct} onClose={() => setSelectedProduct(null)} title={selectedProduct?.name}>
        {selectedProduct && (
          <div className="px-6 py-4 space-y-4">
            {[
              { label: tInventory('colSku'), value: selectedProduct.sku },
              { label: tInventory('colCategory'), value: selectedProduct.category },
              { label: tInventory('colCurrentStock'), value: `${selectedProduct.current_stock} ${selectedProduct.unit}` },
              { label: tInventory('colReorderPoint'), value: selectedProduct.reorder_point },
              { label: tInventory('colCostPrice'), value: `$${Number(selectedProduct.cost_price || 0).toFixed(2)}` },
              { label: tInventory('colSellPrice'), value: `$${Number(selectedProduct.sell_price || 0).toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--notion-text-muted)' }}>{label}</dt>
                <dd className="text-sm" style={{ color: 'var(--notion-text)' }}>{value || '—'}</dd>
              </div>
            ))}
            <div className="pt-2">
              <button
                onClick={() => { setShowAdjust(selectedProduct.id); setSelectedProduct(null); }}
                className="px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity"
                style={{ background: 'var(--notion-accent)' }}
              >
                {tInventory('adjustStockBtn')}
              </button>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Supplier Quotation SlideOver */}
      <SlideOver
        open={!!selectedSupplier}
        onClose={() => { setSelectedSupplier(null); setShowCreateQuotation(false); }}
        title={selectedSupplier ? tInventory('supplierQuotationList', { name: selectedSupplier.name }) : ''}
      >
        {selectedSupplier && (
          <div className="flex flex-col h-full">
            {/* Supplier meta */}
            <div className="px-6 pt-4 pb-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  { label: tInventory('supplierRating'), value: selectedSupplier.rating ? `${selectedSupplier.rating} ${tInventory('supplierRated')}` : '—' },
                  { label: tInventory('supplierType'), value: selectedSupplier.supplier_type || '—' },
                  { label: tInventory('supplierContactPerson'), value: selectedSupplier.contact_person || '—' },
                  { label: tInventory('supplierContactInfo'), value: selectedSupplier.contact_info || '—' },
                  { label: tInventory('supplierCompanyInfo'), value: selectedSupplier.company_info || '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--notion-text-muted)' }}>{label}</dt>
                    <dd style={{ color: 'var(--notion-text)' }}>{value}</dd>
                  </div>
                ))}
              </div>
            </div>

            {/* Quotation list */}
            <div className="flex-1 overflow-auto px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{tInventory('supplierQuotations')}</h4>
                <button
                  onClick={() => setShowCreateQuotation(v => !v)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white"
                  style={{ background: 'var(--notion-accent)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {tInventory('supplierNewQuotation')}
                </button>
              </div>

              {/* Inline create quotation form */}
              {showCreateQuotation && (
                <form onSubmit={createQuotation} className="mb-4 p-4 rounded-lg border space-y-2" style={{ borderColor: 'var(--notion-border)', background: '#fafafa' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>{tInventory('supplierNewQuotation')}</p>
                  <input required placeholder={tInventory('supplierProductNameReq')} value={quotationForm.product_name} onChange={e => setQuotationForm({ ...quotationForm, product_name: e.target.value })}
                    className={inputCls} style={inputStyle} />
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder={tInventory('supplierMaterial')} value={quotationForm.material} onChange={e => setQuotationForm({ ...quotationForm, material: e.target.value })}
                      className={inputCls} style={inputStyle} />
                    <input placeholder={tInventory('supplierSpec')} value={quotationForm.spec} onChange={e => setQuotationForm({ ...quotationForm, spec: e.target.value })}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" step="any" placeholder={tInventory('supplierQuantity')} value={quotationForm.quantity} onChange={e => setQuotationForm({ ...quotationForm, quantity: e.target.value })}
                      className={inputCls} style={inputStyle} />
                    <input type="number" step="any" placeholder={tInventory('supplierUnitPrice')} value={quotationForm.unit_price} onChange={e => setQuotationForm({ ...quotationForm, unit_price: e.target.value })}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <input placeholder={tInventory('supplierDeliveryPeriod')} value={quotationForm.delivery_period} onChange={e => setQuotationForm({ ...quotationForm, delivery_period: e.target.value })}
                    className={inputCls} style={inputStyle} />
                  <input placeholder={tInventory('supplierPaymentMethod')} value={quotationForm.payment_method} onChange={e => setQuotationForm({ ...quotationForm, payment_method: e.target.value })}
                    className={inputCls} style={inputStyle} />
                  <textarea placeholder={tInventory('supplierSpecialRequirements')} value={quotationForm.special_requirements} onChange={e => setQuotationForm({ ...quotationForm, special_requirements: e.target.value })}
                    rows={2} className={`${inputCls} resize-none`} style={inputStyle} />
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setShowCreateQuotation(false)}
                      className="flex-1 py-1.5 rounded-md text-xs border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                      {tCommon('cancel')}
                    </button>
                    <button type="submit"
                      className="flex-1 py-1.5 rounded-md text-xs text-white" style={{ background: 'var(--notion-accent)' }}>
                      {tInventory('supplierSaveQuotation')}
                    </button>
                  </div>
                </form>
              )}

              {quotationsLoading ? (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</div>
              ) : quotations.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                  <p className="mb-2"><HandIcon name="document" size={24} /></p>
                  <p>{tInventory('supplierNoQuotations')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {quotations.map(q => (
                    <div key={q.id} className="rounded-lg border p-4 group relative" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="font-semibold text-sm" style={{ color: 'var(--notion-text)' }}>{q.product_name}</span>
                          {(q.material || q.spec) && (
                            <span className="ml-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                              {[q.material, q.spec].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => deleteQuotation(q.id)}
                          className="hidden group-hover:flex items-center text-xs px-2 py-0.5 rounded transition-colors"
                          style={{ color: '#ef4444', background: '#fef2f2' }}
                        >
                          {tCommon('delete')}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                        {q.quantity != null && <div><span className="font-medium">{tInventory('supplierQtyLabel')}</span>{q.quantity}</div>}
                        {q.unit_price != null && <div><span className="font-medium">{tInventory('supplierPriceLabel')}</span>¥{q.unit_price}</div>}
                        {q.delivery_period && <div><span className="font-medium">{tInventory('supplierDeliveryLabel')}</span>{q.delivery_period}</div>}
                        {q.payment_method && <div><span className="font-medium">{tInventory('supplierPaymentLabel')}</span>{q.payment_method}</div>}
                        {q.special_requirements && (
                          <div className="col-span-2"><span className="font-medium">{tInventory('supplierSpecialLabel')}</span>{q.special_requirements}</div>
                        )}
                      </div>
                      <div className="mt-2 text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>
                        {new Date(q.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* Create Product Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tInventory('productModalTitle')}</h3>
            <form onSubmit={createProduct} className="space-y-3">
              <input required placeholder={tInventory('skuReq')} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <input required placeholder={tInventory('productNameReq')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <input placeholder={tInventory('description')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder={tInventory('colCategory')} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm bg-white" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                  {['each', 'kg', 'lb', 'box', 'pallet', 'case', 'pair', 'set'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" placeholder={tInventory('costPrice')} value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                <input type="number" step="0.01" placeholder={tInventory('sellPrice')} value={form.sell_price} onChange={e => setForm({ ...form, sell_price: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <input type="number" step="0.01" placeholder={tInventory('reorderPoint')} value={form.reorder_point} onChange={e => setForm({ ...form, reorder_point: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <select value={form.warehouse_id} onChange={e => setForm({ ...form, warehouse_id: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm bg-white" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                <option value="">{tCommon('noWarehouse')}</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 py-2 rounded-md text-sm text-white disabled:opacity-50" style={{ background: 'var(--notion-accent)' }}>
                  {creating ? tCommon('creating') : tInventory('addProduct')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Warehouse Modal */}
      {showCreateWarehouse && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tInventory('warehouseCreateTitle')}</h3>
            <form onSubmit={createWarehouse} className="space-y-3">
              <input required placeholder={tInventory('warehouseNameReq')} value={warehouseForm.name}
                onChange={e => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                className={inputCls} style={inputStyle} />
              <textarea placeholder={tInventory('warehouseAddressPlaceholder')} value={warehouseForm.address}
                onChange={e => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
                rows={2} className={`${inputCls} resize-none`} style={inputStyle} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateWarehouse(false)}
                  className="flex-1 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" disabled={warehouseCreating}
                  className="flex-1 py-2 rounded-md text-sm text-white disabled:opacity-50" style={{ background: 'var(--notion-accent)' }}>
                  {warehouseCreating ? tCommon('creating') : tInventory('warehouseCreateBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Warehouse Modal */}
      {editingWarehouse && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tInventory('warehouseEditTitle')}</h3>
            <form onSubmit={saveEditWarehouse} className="space-y-3">
              <input required placeholder={tInventory('warehouseNameReq')} value={editingWarehouse.name}
                onChange={e => setEditingWarehouse({ ...editingWarehouse, name: e.target.value })}
                className={inputCls} style={inputStyle} />
              <textarea placeholder={tInventory('warehouseAddressPlaceholder')} value={editingWarehouse.address || ''}
                onChange={e => setEditingWarehouse({ ...editingWarehouse, address: e.target.value })}
                rows={2} className={`${inputCls} resize-none`} style={inputStyle} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingWarehouse(null)}
                  className="flex-1 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {tCommon('cancel')}
                </button>
                <button type="submit"
                  className="flex-1 py-2 rounded-md text-sm text-white" style={{ background: 'var(--notion-accent)' }}>
                  {tCommon('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Supplier Modal */}
      {showCreateSupplier && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tInventory('supplierCreateTitle')}</h3>
            <form onSubmit={createSupplier} className="space-y-3">
              <input required placeholder={tInventory('supplierNameReq')} value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                className={`w-full ${inputCls}`} style={inputStyle} />
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--notion-text-muted)' }}>{tInventory('supplierType')}</label>
                <input list="supplier-type-options" placeholder={tInventory('supplierTypeCustom')} value={supplierForm.supplier_type} onChange={e => setSupplierForm({ ...supplierForm, supplier_type: e.target.value })}
                  className={`w-full ${inputCls}`} style={inputStyle} />
                <datalist id="supplier-type-options">
                  {[tInventory('supplierTypeFreight'), tInventory('supplierTypeProcessing'), tInventory('supplierTypeEquipment'),
                    ...supplierTypes.filter(t => ![tInventory('supplierTypeFreight'), tInventory('supplierTypeProcessing'), tInventory('supplierTypeEquipment')].includes(t))
                  ].map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--notion-text-muted)' }}>{tInventory('supplierOurRating')}</label>
                <div className="flex gap-2">
                  {RATING_OPTIONS.map(r => {
                    const rc = RATING_COLORS[r] ?? { bg: '#f3f4f6', color: '#6b7280' };
                    return (
                      <button key={r} type="button" onClick={() => setSupplierForm({ ...supplierForm, rating: r })}
                        className="flex-1 py-1.5 rounded-md text-sm font-bold border-2 transition-all"
                        style={{
                          background: supplierForm.rating === r ? rc.bg : 'white',
                          color: supplierForm.rating === r ? rc.color : '#9ca3af',
                          borderColor: supplierForm.rating === r ? rc.color : 'var(--notion-border)',
                        }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <textarea placeholder={tInventory('supplierCompanyInfoPlaceholder')} value={supplierForm.company_info} onChange={e => setSupplierForm({ ...supplierForm, company_info: e.target.value })}
                rows={2} className={`w-full ${inputCls} resize-none`} style={inputStyle} />
              <input placeholder={tInventory('supplierContactPersonPlaceholder')} value={supplierForm.contact_person} onChange={e => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                className={`w-full ${inputCls}`} style={inputStyle} />
              <input placeholder={tInventory('supplierContactInfoPlaceholder')} value={supplierForm.contact_info} onChange={e => setSupplierForm({ ...supplierForm, contact_info: e.target.value })}
                className={`w-full ${inputCls}`} style={inputStyle} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateSupplier(false)}
                  className="flex-1 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" disabled={supplierCreating}
                  className="flex-1 py-2 rounded-md text-sm text-white disabled:opacity-50" style={{ background: 'var(--notion-accent)' }}>
                  {supplierCreating ? tCommon('creating') : tInventory('supplierCreateBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Supplier Modal */}
      {editingSupplier && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-md shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tInventory('supplierEditTitle')}</h3>
            <form onSubmit={saveEditSupplier} className="space-y-3">
              <input required placeholder={tInventory('supplierNameReq')} value={editingSupplier.name} onChange={e => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                className={`w-full ${inputCls}`} style={inputStyle} />
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--notion-text-muted)' }}>{tInventory('supplierType')}</label>
                <input list="supplier-type-options-edit" placeholder={tInventory('supplierTypeCustom')} value={editingSupplier.supplier_type || ''} onChange={e => setEditingSupplier({ ...editingSupplier, supplier_type: e.target.value })}
                  className={`w-full ${inputCls}`} style={inputStyle} />
                <datalist id="supplier-type-options-edit">
                  {[tInventory('supplierTypeFreight'), tInventory('supplierTypeProcessing'), tInventory('supplierTypeEquipment'),
                    ...supplierTypes.filter(t => ![tInventory('supplierTypeFreight'), tInventory('supplierTypeProcessing'), tInventory('supplierTypeEquipment')].includes(t))
                  ].map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--notion-text-muted)' }}>{tInventory('supplierOurRating')}</label>
                <div className="flex gap-2">
                  {RATING_OPTIONS.map(r => {
                    const rc = RATING_COLORS[r] ?? { bg: '#f3f4f6', color: '#6b7280' };
                    return (
                      <button key={r} type="button" onClick={() => setEditingSupplier({ ...editingSupplier, rating: r })}
                        className="flex-1 py-1.5 rounded-md text-sm font-bold border-2 transition-all"
                        style={{
                          background: editingSupplier.rating === r ? rc.bg : 'white',
                          color: editingSupplier.rating === r ? rc.color : '#9ca3af',
                          borderColor: editingSupplier.rating === r ? rc.color : 'var(--notion-border)',
                        }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <textarea placeholder={tInventory('supplierCompanyInfoPlaceholder')} value={editingSupplier.company_info || ''} onChange={e => setEditingSupplier({ ...editingSupplier, company_info: e.target.value })}
                rows={2} className={`w-full ${inputCls} resize-none`} style={inputStyle} />
              <input placeholder={tInventory('supplierContactPersonPlaceholder')} value={editingSupplier.contact_person || ''} onChange={e => setEditingSupplier({ ...editingSupplier, contact_person: e.target.value })}
                className={`w-full ${inputCls}`} style={inputStyle} />
              <input placeholder={tInventory('supplierContactInfoPlaceholder')} value={editingSupplier.contact_info || ''} onChange={e => setEditingSupplier({ ...editingSupplier, contact_info: e.target.value })}
                className={`w-full ${inputCls}`} style={inputStyle} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingSupplier(null)}
                  className="flex-1 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {tCommon('cancel')}
                </button>
                <button type="submit"
                  className="flex-1 py-2 rounded-md text-sm text-white" style={{ background: 'var(--notion-accent)' }}>
                  {tCommon('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjust && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-sm shadow-xl border" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-4 text-base" style={{ color: 'var(--notion-text)' }}>{tInventory('adjustModalTitle')}</h3>
            <div className="space-y-3">
              <input type="number" required placeholder={tInventory('quantityHint')} value={adjustForm.quantity}
                onChange={e => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <select value={adjustForm.movement_type} onChange={e => setAdjustForm({ ...adjustForm, movement_type: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm bg-white" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                {['adjustment', 'in', 'out', 'return', 'damaged', 'transfer'].map(tp => <option key={tp} value={tp}>{tp}</option>)}
              </select>
              <input placeholder={tCommon('notes')} value={adjustForm.notes} onChange={e => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowAdjust(null); setAdjustForm({ quantity: '', movement_type: 'adjustment', notes: '' }); }}
                  className="flex-1 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {tCommon('cancel')}
                </button>
                <button onClick={() => adjustStock(showAdjust)}
                  className="flex-1 py-2 rounded-md text-sm text-white" style={{ background: 'var(--notion-accent)' }}>
                  {tCommon('apply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
