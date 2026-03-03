'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

type FlowOrder = {
  id: string;
  contract_no: string;
  customer_name?: string;
  sale_amount_usd: number;
  sale_amount_cny: number;
  payment_method?: string;
  destination_type: 'port' | 'other_warehouse';
  shipping_conditions_met: boolean;
  outstanding_receivable_usd: number;
  outstanding_receivable_cny: number;
  tail_payment_date?: string;
  delivery_notice_date?: string;
  godad_billing_date?: string;
  stage: string;
  created_at: string;
};

type FlowTask = {
  id: string;
  title: string;
  owner_role: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'done';
};

type RiskResult = {
  action: string;
  is_blocked: boolean;
  approval_status: string | null;
  approval_required: boolean;
  risk_items: Array<{ rule: string; level: string; required_approver: string; reason: string }>;
};

type Approval = {
  id: string;
  action: 'delivery_notice' | 'ship_customs' | 'release_goods';
  required_approver: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
};

type FlowLink = {
  id: string;
  task_code: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
};

type GodadCheck = {
  is_pass: boolean;
  issues: string[];
  guidance: string[];
};

export default function OperationsPage() {
  const t = useTranslation();
  const [orders, setOrders] = useState<FlowOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<FlowOrder | null>(null);
  const [tasks, setTasks] = useState<FlowTask[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [links, setLinks] = useState<FlowLink[]>([]);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [godad, setGodad] = useState<GodadCheck | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [docForm, setDocForm] = useState({ doc_type: '', file_name: '', file_url: '', source: 'other', task_id: '' });

  const [form, setForm] = useState({
    contract_no: '',
    customer_name: '',
    sale_amount_usd: '',
    sale_amount_cny: '',
    payment_method: 'TT',
    incoterm: 'FOB',
    destination_type: 'port',
    shipping_conditions_met: false,
    outstanding_receivable_usd: '',
    outstanding_receivable_cny: '',
    tail_payment_date: '',
    delivery_notice_date: '',
    godad_billing_date: '',
    remarks: '',
  });

  const ACTIONS: Array<{ key: 'delivery_notice' | 'ship_customs' | 'release_goods'; label: string }> = [
    { key: 'delivery_notice', label: t.operations.deliveryNotice },
    { key: 'ship_customs', label: t.operations.shipCustoms },
    { key: 'release_goods', label: t.operations.releaseGoods },
  ];

  async function loadOrders() {
    const list = await api.get('/api/operations/orders').catch(() => []);
    const rows = Array.isArray(list) ? list : [];
    setOrders(rows);
    if (rows.length > 0 && !selectedOrder) setSelectedOrder(rows[0]);
  }

  async function loadOrderDetail(orderId: string) {
    const detail = await api.get(`/api/operations/orders/${orderId}`).catch(() => null);
    if (!detail) return;
    setTasks(Array.isArray(detail.tasks) ? detail.tasks : []);
    setApprovals(Array.isArray(detail.approvals) ? detail.approvals : []);
    setLinks(Array.isArray(detail.links) ? detail.links : []);
    setSelectedOrder((prev) => {
      const fromList = orders.find((o) => o.id === orderId);
      return { ...(fromList || prev || {}), ...detail } as FlowOrder;
    });
  }

  useEffect(() => {
    loadOrders().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedOrder?.id) return;
    loadOrderDetail(selectedOrder.id);
  }, [selectedOrder?.id]);

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/api/operations/orders', {
        ...form,
        sale_amount_usd: Number(form.sale_amount_usd || 0),
        sale_amount_cny: Number(form.sale_amount_cny || 0),
        outstanding_receivable_usd: Number(form.outstanding_receivable_usd || 0),
        outstanding_receivable_cny: Number(form.outstanding_receivable_cny || 0),
        tail_payment_date: form.tail_payment_date || null,
        delivery_notice_date: form.delivery_notice_date || null,
        godad_billing_date: form.godad_billing_date || null,
      });
      await loadOrders();
      setShowCreate(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function updateTask(task: FlowTask) {
    try {
      await api.patch(`/api/operations/tasks/${task.id}`, {
        status: task.status,
        owner_role: task.owner_role,
      });
      if (selectedOrder) await loadOrderDetail(selectedOrder.id);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function updateOrderDates() {
    if (!selectedOrder) return;
    try {
      await api.patch(`/api/operations/orders/${selectedOrder.id}`, {
        payment_method: selectedOrder.payment_method,
        tail_payment_date: selectedOrder.tail_payment_date || null,
        delivery_notice_date: selectedOrder.delivery_notice_date || null,
        godad_billing_date: selectedOrder.godad_billing_date || null,
      });
      await loadOrderDetail(selectedOrder.id);
      alert(t.operations.alertOrderDatesUpdated);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function runRisk(action: 'delivery_notice' | 'ship_customs' | 'release_goods') {
    if (!selectedOrder) return;
    const result = await api.post(`/api/operations/orders/${selectedOrder.id}/risk-check`, { action }).catch(() => null);
    if (result) setRisk(result);
  }

  async function requestApproval(action: 'delivery_notice' | 'ship_customs' | 'release_goods') {
    if (!selectedOrder) return;
    try {
      await api.post(`/api/operations/orders/${selectedOrder.id}/approvals/request`, { action });
      await loadOrderDetail(selectedOrder.id);
      alert(t.operations.alertApprovalSubmitted);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function decideApproval(approvalId: string, decision: 'approved' | 'rejected') {
    try {
      await api.post(`/api/operations/approvals/${approvalId}/decide`, { decision });
      if (selectedOrder) await loadOrderDetail(selectedOrder.id);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function runGodadCheck() {
    if (!selectedOrder) return;
    const result = await api.get(`/api/operations/orders/${selectedOrder.id}/godad-check`).catch(() => null);
    if (result) setGodad(result);
  }

  async function addDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await api.post(`/api/operations/orders/${selectedOrder.id}/documents`, {
        ...docForm,
        task_id: docForm.task_id || null,
      });
      alert(t.operations.alertDocRegistered);
      setDocForm({ doc_type: '', file_name: '', file_url: '', source: 'other', task_id: '' });
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading...</div>;
  }

  return (
    <div className="h-full flex">
      <div className="w-[360px] border-r px-5 py-6 overflow-y-auto" style={{ borderColor: 'var(--notion-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>{t.operations.pageTitle}</h1>
          <button className="px-3 py-1.5 rounded-md text-white text-sm" style={{ background: 'var(--notion-accent)' }} onClick={() => setShowCreate(true)}>
            {t.operations.newContract}
          </button>
        </div>
        <div className="space-y-2">
          {orders.map((o) => (
            <button
              key={o.id}
              className="w-full text-left rounded-lg border px-3 py-2 transition-colors"
              style={{
                borderColor: selectedOrder?.id === o.id ? 'var(--notion-accent)' : 'var(--notion-border)',
                background: selectedOrder?.id === o.id ? 'rgba(35,131,226,0.08)' : 'white',
              }}
              onClick={() => {
                setSelectedOrder(o);
                setRisk(null);
                setGodad(null);
              }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{o.contract_no}</p>
              <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{o.customer_name || t.operations.noCustomer} · {o.destination_type === 'port' ? t.operations.port : t.operations.otherWarehouse}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--notion-text-muted)' }}>
                USD {Number(o.sale_amount_usd || 0).toLocaleString()} / CNY {Number(o.sale_amount_cny || 0).toLocaleString()}
              </p>
            </button>
          ))}
          {orders.length === 0 && <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{t.operations.noContractsYet}</p>}
        </div>
      </div>

      <div className="flex-1 px-7 py-6 overflow-y-auto">
        {!selectedOrder ? (
          <div className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{t.operations.selectContract}</div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--notion-text)' }}>{selectedOrder.contract_no}</h2>

            <div className="rounded-lg border p-3 mb-4" style={{ borderColor: 'var(--notion-border)' }}>
              <p className="text-sm font-semibold mb-2">{t.operations.godadBillingConditions}</p>
              <div className="grid grid-cols-4 gap-2">
                <input
                  placeholder={t.operations.paymentMethodPlaceholder}
                  value={selectedOrder.payment_method || ''}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, payment_method: e.target.value })}
                  className="px-2 py-1.5 rounded border"
                  style={{ borderColor: 'var(--notion-border)' }}
                />
                <input
                  type="date"
                  value={selectedOrder.tail_payment_date?.slice(0, 10) || ''}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, tail_payment_date: e.target.value })}
                  className="px-2 py-1.5 rounded border"
                  style={{ borderColor: 'var(--notion-border)' }}
                />
                <input
                  type="date"
                  value={selectedOrder.delivery_notice_date?.slice(0, 10) || ''}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, delivery_notice_date: e.target.value })}
                  className="px-2 py-1.5 rounded border"
                  style={{ borderColor: 'var(--notion-border)' }}
                />
                <input
                  type="date"
                  value={selectedOrder.godad_billing_date?.slice(0, 10) || ''}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, godad_billing_date: e.target.value })}
                  className="px-2 py-1.5 rounded border"
                  style={{ borderColor: 'var(--notion-border)' }}
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={updateOrderDates} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--notion-border)' }}>{t.operations.saveDates}</button>
                <button onClick={runGodadCheck} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--notion-border)' }}>{t.operations.checkBillingRules}</button>
              </div>
              {godad && (
                <div className="mt-2 text-sm">
                  <p className="font-medium">{godad.is_pass ? t.operations.checkPass : t.operations.checkFail}</p>
                  {godad.issues.map((i, idx) => <p key={idx}>- {i}</p>)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-2">
              {ACTIONS.map((a) => (
                <div key={a.key} className="flex items-center gap-1">
                  <button onClick={() => runRisk(a.key)} className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)' }}>
                    {t.operations.riskCheck}: {a.label}
                  </button>
                  <button onClick={() => requestApproval(a.key)} className="px-2 py-1 rounded-md text-xs border" style={{ borderColor: 'var(--notion-border)' }}>
                    {t.operations.requestApproval}
                  </button>
                </div>
              ))}
            </div>

            {risk && (
              <div className="rounded-lg border p-3 mb-5" style={{ borderColor: risk.is_blocked ? '#fca5a5' : '#86efac', background: risk.is_blocked ? '#fef2f2' : '#f0fdf4' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                  {risk.is_blocked ? t.operations.actionBlocked : t.operations.actionCanProceed}
                </p>
                <p className="text-xs">{t.operations.approvalStatus}: {risk.approval_status || t.operations.approvalStatusNone}</p>
                {risk.risk_items.map((r) => (
                  <div key={r.rule} className="text-sm mt-2" style={{ color: 'var(--notion-text)' }}>
                    <p>{t.operations.rule}: {r.rule}</p>
                    <p>{t.operations.reason}: {r.reason}</p>
                    <p>{t.operations.approver}: {r.required_approver}</p>
                  </div>
                ))}
              </div>
            )}

            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>{t.operations.approvalRecords}</h2>
            <div className="rounded-lg border overflow-hidden mb-5" style={{ borderColor: 'var(--notion-border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--notion-sidebar)' }}>
                  <tr>
                    <th className="text-left px-3 py-2">{t.operations.thAction}</th>
                    <th className="text-left px-3 py-2">{t.operations.thApprover}</th>
                    <th className="text-left px-3 py-2">{t.operations.thStatus}</th>
                    <th className="text-left px-3 py-2">{t.operations.thTime}</th>
                    <th className="text-left px-3 py-2">{t.operations.thOperation}</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((a) => (
                    <tr key={a.id} className="border-t" style={{ borderColor: 'var(--notion-border)' }}>
                      <td className="px-3 py-2">{a.action}</td>
                      <td className="px-3 py-2">{a.required_approver}</td>
                      <td className="px-3 py-2">{a.status}</td>
                      <td className="px-3 py-2">{a.requested_at?.slice(0, 19)?.replace('T', ' ')}</td>
                      <td className="px-3 py-2">
                        {a.status === 'pending' && (
                          <div className="flex gap-1">
                            <button className="px-2 py-1 rounded border text-xs" style={{ borderColor: 'var(--notion-border)' }} onClick={() => decideApproval(a.id, 'approved')}>{t.operations.approve}</button>
                            <button className="px-2 py-1 rounded border text-xs" style={{ borderColor: 'var(--notion-border)' }} onClick={() => decideApproval(a.id, 'rejected')}>{t.operations.reject}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {approvals.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-sm" style={{ color: 'var(--notion-text-muted)' }}>{t.operations.noApprovalRecords}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>{t.operations.moduleLinkRecords}</h2>
            <div className="rounded-lg border overflow-hidden mb-5" style={{ borderColor: 'var(--notion-border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--notion-sidebar)' }}>
                  <tr>
                    <th className="text-left px-3 py-2">{t.operations.thFlowTask}</th>
                    <th className="text-left px-3 py-2">{t.operations.thModuleResource}</th>
                    <th className="text-left px-3 py-2">{t.operations.thResourceId}</th>
                    <th className="text-left px-3 py-2">{t.operations.thTime}</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id} className="border-t" style={{ borderColor: 'var(--notion-border)' }}>
                      <td className="px-3 py-2">{l.task_code}</td>
                      <td className="px-3 py-2">{l.resource_type}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.resource_id}</td>
                      <td className="px-3 py-2">{l.created_at?.slice(0, 19)?.replace('T', ' ')}</td>
                    </tr>
                  ))}
                  {links.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                        {t.operations.noLinkRecords}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>{t.operations.processTasks}</h2>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--notion-border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--notion-sidebar)' }}>
                  <tr>
                    <th className="text-left px-3 py-2">{t.operations.thTask}</th>
                    <th className="text-left px-3 py-2">{t.operations.thOwnerRole}</th>
                    <th className="text-left px-3 py-2">{t.operations.thStatus}</th>
                    <th className="text-left px-3 py-2">{t.operations.thOperation}</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t_) => (
                    <tr key={t_.id} className="border-t" style={{ borderColor: 'var(--notion-border)' }}>
                      <td className="px-3 py-2">{t_.title}</td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full px-2 py-1 rounded border"
                          style={{ borderColor: 'var(--notion-border)' }}
                          value={t_.owner_role || ''}
                          onChange={(e) => setTasks((prev) => prev.map((x) => (x.id === t_.id ? { ...x, owner_role: e.target.value } : x)))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="px-2 py-1 rounded border"
                          style={{ borderColor: 'var(--notion-border)' }}
                          value={t_.status}
                          onChange={(e) => setTasks((prev) => prev.map((x) => (x.id === t_.id ? { ...x, status: e.target.value as FlowTask['status'] } : x)))}
                        >
                          <option value="pending">pending</option>
                          <option value="in_progress">in_progress</option>
                          <option value="blocked">blocked</option>
                          <option value="done">done</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button className="px-2 py-1 rounded text-xs border" style={{ borderColor: 'var(--notion-border)' }} onClick={() => updateTask(t_)}>{t.operations.save}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-semibold mt-6 mb-2" style={{ color: 'var(--notion-text)' }}>{t.operations.documentArchive}</h3>
            <form onSubmit={addDoc} className="grid grid-cols-2 gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--notion-border)' }}>
              <input required placeholder={t.operations.docTypePlaceholder} value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <input required placeholder={t.operations.fileNamePlaceholder} value={docForm.file_name} onChange={(e) => setDocForm({ ...docForm, file_name: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <input required placeholder={t.operations.fileUrlPlaceholder} value={docForm.file_url} onChange={(e) => setDocForm({ ...docForm, file_url: e.target.value })} className="px-2 py-1.5 rounded border col-span-2" style={{ borderColor: 'var(--notion-border)' }} />
              <select value={docForm.source} onChange={(e) => setDocForm({ ...docForm, source: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }}>
                <option value="sales">{t.operations.sourceSales}</option>
                <option value="doc">{t.operations.sourceDoc}</option>
                <option value="finance">{t.operations.sourceFinance}</option>
                <option value="factory">{t.operations.sourceFactory}</option>
                <option value="forwarder">{t.operations.sourceForwarder}</option>
                <option value="other">{t.operations.sourceOther}</option>
              </select>
              <select value={docForm.task_id} onChange={(e) => setDocForm({ ...docForm, task_id: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }}>
                <option value="">{t.operations.linkTaskOptional}</option>
                {tasks.map((t_) => (
                  <option key={t_.id} value={t_.id}>{t_.title}</option>
                ))}
              </select>
              <button type="submit" className="col-span-2 px-3 py-2 rounded-md text-white text-sm" style={{ background: 'var(--notion-accent)' }}>{t.operations.registerDocument}</button>
            </form>
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-full max-w-xl">
            <h3 className="font-semibold text-base mb-3">{t.operations.newFulfillmentContract}</h3>
            <form onSubmit={createOrder} className="grid grid-cols-2 gap-2">
              <input required placeholder={t.operations.contractNoPlaceholder} value={form.contract_no} onChange={(e) => setForm({ ...form, contract_no: e.target.value })} className="px-2 py-1.5 rounded border col-span-2" style={{ borderColor: 'var(--notion-border)' }} />
              <input placeholder={t.operations.customerNamePlaceholder} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="px-2 py-1.5 rounded border col-span-2" style={{ borderColor: 'var(--notion-border)' }} />
              <input type="number" placeholder={t.operations.saleAmountUsd} value={form.sale_amount_usd} onChange={(e) => setForm({ ...form, sale_amount_usd: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <input type="number" placeholder={t.operations.saleAmountCny} value={form.sale_amount_cny} onChange={(e) => setForm({ ...form, sale_amount_cny: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <input type="number" placeholder={t.operations.outstandingUsd} value={form.outstanding_receivable_usd} onChange={(e) => setForm({ ...form, outstanding_receivable_usd: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <input type="number" placeholder={t.operations.outstandingCny} value={form.outstanding_receivable_cny} onChange={(e) => setForm({ ...form, outstanding_receivable_cny: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <select value={form.destination_type} onChange={(e) => setForm({ ...form, destination_type: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }}>
                <option value="port">{t.operations.portGoods}</option>
                <option value="other_warehouse">{t.operations.otherWarehouseGoods}</option>
              </select>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }}>
                <option value="PRE_TT">PRE_TT</option>
                <option value="TT">TT</option>
                <option value="LC">LC</option>
                <option value="DP">DP</option>
                <option value="DA">DA</option>
                <option value="OA">OA</option>
              </select>
              <input type="date" value={form.tail_payment_date} onChange={(e) => setForm({ ...form, tail_payment_date: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <input type="date" value={form.delivery_notice_date} onChange={(e) => setForm({ ...form, delivery_notice_date: e.target.value })} className="px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <input type="date" value={form.godad_billing_date} onChange={(e) => setForm({ ...form, godad_billing_date: e.target.value })} className="px-2 py-1.5 rounded border col-span-2" style={{ borderColor: 'var(--notion-border)' }} />
              <label className="col-span-2 text-sm flex items-center gap-2">
                <input type="checkbox" checked={form.shipping_conditions_met} onChange={(e) => setForm({ ...form, shipping_conditions_met: e.target.checked })} />
                {t.operations.shippingConditionsMet}
              </label>
              <textarea placeholder={t.operations.remarksPlaceholder} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="col-span-2 px-2 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              <div className="col-span-2 flex gap-2 mt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 rounded border text-sm" style={{ borderColor: 'var(--notion-border)' }}>
                  {t.operations.cancel}
                </button>
                <button type="submit" disabled={creating} className="flex-1 px-3 py-2 rounded text-sm text-white disabled:opacity-50" style={{ background: 'var(--notion-accent)' }}>
                  {creating ? t.operations.creatingEllipsis : t.operations.createAndInit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
