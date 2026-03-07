'use client';

import { useWorkflowStep } from '../WorkflowStepContext';
import SecureFileLink from '@/components/ui/SecureFileLink';
import { HandIcon } from '@/components/ui/HandIcon';

// ── Cost Confirm ────────────────────────────────────────────────────────────

export function CostConfirmStep() {
  const {
    activeStage, isDone, myId,
    getStepData, patchStepData, toggleStep, tw,
  } = useWorkflowStep();

  const cc = getStepData<Record<string, any>>(activeStage, 'cost_confirm');

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('costConfirmed')}</p>
          {cc.confirmed_at && <p className="text-[10px] mt-0.5" style={{ color: '#6b7280' }}>{new Date(cc.confirmed_at).toLocaleString()}</p>}
        </div>
      </div>
    );
  }

  if (cc.inconsistency_note && !cc.costs_consistent) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#92400e' }}>{tw('inconsistencyReported')}</p>
          <p className="text-[10px] mt-1" style={{ color: '#78350f' }}>{cc.inconsistency_note}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-[10px] font-medium" style={{ color: '#9B9A97' }}>{tw('costConfirmation')}</p>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => {
          patchStepData(activeStage, 'cost_confirm', {
            costs_consistent: true,
            confirmed_by: myId,
            confirmed_at: new Date().toISOString(),
          });
          toggleStep(activeStage, 'cost_confirm');
        }}
          className="py-3 rounded-lg text-[11px] font-semibold border-2 transition-all"
          style={{ borderColor: '#bbf7d0', color: '#15803d', background: '#f0fdf4' }}>
          ✓ {tw('confirmCostsConsistent')}
        </button>
        <button onClick={() => {
          const note = prompt(tw('inconsistencyNote'));
          if (note !== null) {
            patchStepData(activeStage, 'cost_confirm', {
              costs_consistent: false,
              inconsistency_note: note || tw('costsInconsistent'),
              confirmed_by: myId,
              confirmed_at: new Date().toISOString(),
            });
          }
        }}
          className="py-3 rounded-lg text-[11px] font-semibold border-2 transition-all"
          style={{ borderColor: '#fde68a', color: '#92400e', background: '#fffbeb' }}>
          {tw('costsInconsistent')}
        </button>
      </div>
    </div>
  );
}

// ── Packing Details ─────────────────────────────────────────────────────────

export function PackingDetailsStep() {
  const {
    activeStage, stage, isDone, myId, users, uploadingFile,
    getStepData, resolvedAssignees, patchStepData, userCanFillRole, userIsFinance,
    toggleStep, handlePackingFileUpload, renderUploadMeta, tw,
  } = useWorkflowStep();

  const pd = getStepData<Record<string, any>>(activeStage, 'packing_details');
  const effAssignees = resolvedAssignees(activeStage);
  const me = users.find(u => u.id === myId);
  const isSP = !!(me && userCanFillRole(me, 'salesperson') && myId === effAssignees['salesperson']);
  const isClerk = !!(me && userCanFillRole(me, 'doc_clerk') && myId === effAssignees['doc_clerk']);
  const isCashier = !!(me && (userCanFillRole(me, 'cashier') || userIsFinance(me)));

  const hasCargo = (pd.cargo_files || []).length > 0;
  const hasPacking = (pd.packing_files || []).length > 0;
  const sentToFwd = pd.sent_to_forwarder;
  const hasVat = (pd.vat_files || []).length > 0;
  const cashierOk = pd.cashier_confirmed;

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('packingDetailsComplete')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* ① Salesperson uploads cargo details */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: hasCargo ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasCargo ? '#bbf7d0' : '#e5e7eb'}` }}>
        <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>① {tw('cargoDetails')}</p>
        {(pd.cargo_files || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(pd.cargo_files || []).map((f: any, fi: number) => (
              <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg truncate max-w-[200px]"
                style={{ background: '#e0f2fe', color: '#0284c7' }} />
            ))}
          </div>
        )}
        {hasCargo && renderUploadMeta(pd.cargo_uploaded_by, pd.cargo_uploaded_at)}
        {isSP && !hasCargo && (
          <label className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer font-medium"
            style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
            <HandIcon name="paperclip" size={12} />
            {uploadingFile ? '...' : tw('uploadCargoDetails')}
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              onChange={async e => { const f = e.target.files?.[0]; if (f) await handlePackingFileUpload(activeStage, 'cargo_files', f); e.target.value = ''; }} />
          </label>
        )}
        {!isSP && !hasCargo && <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingCargoUpload')}</p>}
      </div>

      {/* ② Doc clerk uploads packing list + confirms sent to forwarder */}
      {hasCargo && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: sentToFwd ? '#f0fdf4' : '#fafafa', border: `1px solid ${sentToFwd ? '#bbf7d0' : '#e5e7eb'}` }}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>② {tw('packingList')}</p>
          {(pd.packing_files || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(pd.packing_files || []).map((f: any, fi: number) => (
                <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg truncate max-w-[200px]"
                  style={{ background: '#e0f2fe', color: '#0284c7' }} />
              ))}
            </div>
          )}
          {hasPacking && renderUploadMeta(pd.packing_uploaded_by, pd.packing_uploaded_at)}
          {isClerk && !hasPacking && (
            <label className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer font-medium"
              style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
              <HandIcon name="paperclip" size={12} />
              {uploadingFile ? '...' : tw('uploadPackingList')}
              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                onChange={async e => { const f = e.target.files?.[0]; if (f) await handlePackingFileUpload(activeStage, 'packing_files', f); e.target.value = ''; }} />
            </label>
          )}
          {!isClerk && !hasPacking && <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingPackingUpload')}</p>}
          {hasPacking && !sentToFwd && isClerk && (
            <button onClick={() => patchStepData(activeStage, 'packing_details', { sent_to_forwarder: true, sent_to_forwarder_at: new Date().toISOString() })}
              className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white"
              style={{ background: stage.color }}>
              {tw('confirmSentToForwarder')} ✓
            </button>
          )}
          {sentToFwd && <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('sentToForwarder')}</p>}
        </div>
      )}

      {/* ③ Doc clerk uploads VAT invoice */}
      {sentToFwd && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: hasVat ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasVat ? '#bbf7d0' : '#e5e7eb'}` }}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>③ {tw('vatInvoice')}</p>
          {(pd.vat_files || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(pd.vat_files || []).map((f: any, fi: number) => (
                <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg truncate max-w-[200px]"
                  style={{ background: '#e0f2fe', color: '#0284c7' }} />
              ))}
            </div>
          )}
          {hasVat && renderUploadMeta(pd.vat_uploaded_by, pd.vat_uploaded_at)}
          {isClerk && !hasVat && (
            <label className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer font-medium"
              style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
              <HandIcon name="paperclip" size={12} />
              {uploadingFile ? '...' : tw('uploadVatInvoice')}
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                onChange={async e => { const f = e.target.files?.[0]; if (f) await handlePackingFileUpload(activeStage, 'vat_files', f); e.target.value = ''; }} />
            </label>
          )}
          {!isClerk && !hasVat && <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingVatUpload')}</p>}
        </div>
      )}

      {/* ④ Cashier confirms */}
      {hasVat && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: cashierOk ? '#f0fdf4' : '#fafafa', border: `1px solid ${cashierOk ? '#bbf7d0' : '#e5e7eb'}` }}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>④ {tw('cashierConfirm')}</p>
          {cashierOk ? (
            <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('cashierConfirmed')}</p>
          ) : isCashier ? (
            <button onClick={() => {
              patchStepData(activeStage, 'packing_details', { cashier_confirmed: true, cashier_confirmed_at: new Date().toISOString() });
              toggleStep(activeStage, 'packing_details');
            }}
              className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white"
              style={{ background: stage.color }}>
              {tw('cashierConfirm')} ✓
            </button>
          ) : (
            <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingCashierConfirm')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Warehouse Entry ─────────────────────────────────────────────────────────

export function WarehouseEntryStep() {
  const {
    activeStage, stage, isDone, products,
    getStepData, patchStepData, actionInventoryAdjust, tw,
  } = useWorkflowStep();

  const we = getStepData<Record<string, any>>(activeStage, 'warehouse_entry');
  const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none' as const, width: '100%' };

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('inboundConfirmed')}</p>
          {we.product_name && <p className="text-[10px]" style={{ color: '#166534' }}>{we.product_name} — {tw('inboundQty', { qty: we.quantity || '' })}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="space-y-2">
        <div>
          <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#9B9A97' }}>{tw('productLabel')}</label>
          <select value={we.product_id || ''} onChange={e => {
            const p = products.find(pr => pr.id === e.target.value);
            patchStepData(activeStage, 'warehouse_entry', { product_id: e.target.value, product_name: p?.name || '' });
          }} style={fieldStyle}>
            <option value="">— {tw('selectProduct')} —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
          {products.length === 0 && <p className="text-[9px]" style={{ color: '#9B9A97' }}>{tw('noProducts')}</p>}
        </div>
        <div>
          <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#9B9A97' }}>{tw('quantityLabel')}</label>
          <input type="number" value={we.quantity || ''} onChange={e => patchStepData(activeStage, 'warehouse_entry', { quantity: e.target.value })} style={fieldStyle} />
        </div>
        <button disabled={!we.product_id || !we.quantity || Number(we.quantity) <= 0}
          onClick={() => actionInventoryAdjust(activeStage, 'warehouse_entry', we.product_id!, Number(we.quantity), 'inbound')}
          className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
          style={{ background: stage.color }}>
          {tw('confirmInbound')} ✓
        </button>
      </div>
    </div>
  );
}

// ── Godad Billing ───────────────────────────────────────────────────────────

export function GodadBillingStep() {
  const {
    activeStage, stage, isDone, products,
    getStepData, patchStepData, actionInventoryAdjust, tw,
  } = useWorkflowStep();

  const gb = getStepData<Record<string, any>>(activeStage, 'godad_billing');
  const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none' as const, width: '100%' };

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('outboundConfirmed')}</p>
          {gb.product_name && <p className="text-[10px]" style={{ color: '#166534' }}>{gb.product_name} — {tw('outboundQty', { qty: gb.quantity || '' })}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="space-y-2">
        <div>
          <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#9B9A97' }}>{tw('productLabel')}</label>
          <select value={gb.product_id || ''} onChange={e => {
            const p = products.find(pr => pr.id === e.target.value);
            patchStepData(activeStage, 'godad_billing', { product_id: e.target.value, product_name: p?.name || '' });
          }} style={fieldStyle}>
            <option value="">— {tw('selectProduct')} —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {p.current_stock}</option>)}
          </select>
          {products.length === 0 && <p className="text-[9px]" style={{ color: '#9B9A97' }}>{tw('noProducts')}</p>}
        </div>
        <div>
          <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#9B9A97' }}>{tw('quantityLabel')}</label>
          <input type="number" value={gb.quantity || ''} onChange={e => patchStepData(activeStage, 'godad_billing', { quantity: e.target.value })} style={fieldStyle} />
        </div>
        <button disabled={!gb.product_id || !gb.quantity || Number(gb.quantity) <= 0}
          onClick={() => actionInventoryAdjust(activeStage, 'godad_billing', gb.product_id!, -Math.abs(Number(gb.quantity)), 'outbound')}
          className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
          style={{ background: stage.color }}>
          {tw('confirmOutbound')} ✓
        </button>
      </div>
    </div>
  );
}

// ── Customs ─────────────────────────────────────────────────────────────────

export function CustomsStep() {
  const {
    activeStage, stage, isDone, myId, users, uploadingFile,
    getStepData, resolvedAssignees, userCanFillRole,
    handleFileUpload, toggleStep, renderUploadMeta, tw,
  } = useWorkflowStep();

  const cd = getStepData<Record<string, any>>(activeStage, 'customs');
  const effAssignees = resolvedAssignees(activeStage);
  const me = users.find(u => u.id === myId);
  const isClerk = !!(me && userCanFillRole(me, 'doc_clerk') && myId === effAssignees['doc_clerk']);
  const files = cd.files || [];

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('customsDocsUploaded')}</p>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {files.map((f: any, fi: number) => (
                <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg truncate max-w-[200px]"
                  style={{ background: '#e0f2fe', color: '#0284c7' }} />
              ))}
            </div>
          )}
          {files.length > 0 && renderUploadMeta(cd.uploaded_by, cd.uploaded_at)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-[10px] font-medium" style={{ color: '#9B9A97' }}>{tw('customsDocuments')}</p>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {files.map((f: any, fi: number) => (
            <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg truncate max-w-[200px]"
              style={{ background: stage.bg, color: stage.color }} />
          ))}
        </div>
      )}
      {files.length > 0 && renderUploadMeta(cd.uploaded_by, cd.uploaded_at)}
      {isClerk && (
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer font-medium"
            style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
            <HandIcon name="paperclip" size={12} />
            {uploadingFile ? '...' : tw('uploadCustomsDocs')}
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFileUpload(activeStage, 'customs', f); e.target.value = ''; }} />
          </label>
        </div>
      )}
      {!isClerk && files.length === 0 && <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingCustomsDocs')}</p>}
      {files.length > 0 && (
        <button onClick={() => toggleStep(activeStage, 'customs')}
          className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white"
          style={{ background: stage.color }}>
          确认此步骤已完成 ✓
        </button>
      )}
    </div>
  );
}
