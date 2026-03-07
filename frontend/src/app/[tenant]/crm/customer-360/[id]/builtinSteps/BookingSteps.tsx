'use client';

import { useWorkflowStep } from '../WorkflowStepContext';
import SecureFileLink from '@/components/ui/SecureFileLink';
import { HandIcon } from '@/components/ui/HandIcon';

// ── Freight Inquiry ─────────────────────────────────────────────────────────

export function FreightInquiryStep() {
  const {
    activeStage, stage, isDone, suppliers,
    freightOnlyMode, setFreightOnlyMode,
    getStepData, patchStepData, toggleStep, tw,
  } = useWorkflowStep();

  const fiq = getStepData<Record<string, any>>(activeStage, 'freight_inquiry');
  const isSubmitted = fiq.submitted === true;
  const forwarders = fiq.forwarders || [
    { name: '', supplier_id: '', freight_rate: '', port_charges: '', packing_fee: '', total: '', notes: '' },
    { name: '', supplier_id: '', freight_rate: '', port_charges: '', packing_fee: '', total: '', notes: '' },
  ];
  const fieldStyle = {
    background: '#f9fafb', border: '1px solid #e5e7eb',
    color: '#374151', borderRadius: 8, padding: '5px 10px',
    fontSize: '12px', outline: 'none', width: '100%',
  };

  const updateForwarder = (idx: number, patch: Record<string, string>) => {
    const next = [...forwarders];
    next[idx] = { ...next[idx], ...patch };
    const fr = parseFloat(next[idx].freight_rate) || 0;
    const pc = parseFloat(next[idx].port_charges) || 0;
    const pf = parseFloat(next[idx].packing_fee) || 0;
    next[idx].total = (fr + pc + pf).toFixed(2);
    patchStepData(activeStage, 'freight_inquiry', { forwarders: next });
  };

  const addForwarder = () => {
    const next = [...forwarders, { name: '', supplier_id: '', freight_rate: '', port_charges: '', packing_fee: '', total: '', notes: '' }];
    patchStepData(activeStage, 'freight_inquiry', { forwarders: next });
  };

  const removeForwarder = (idx: number) => {
    if (forwarders.length <= 2) return;
    const next = forwarders.filter((_: any, i: number) => i !== idx);
    patchStepData(activeStage, 'freight_inquiry', { forwarders: next });
  };

  const canSubmit = forwarders.length >= 2
    && forwarders.filter((f: any) => f.name && f.freight_rate).length >= 2
    && !!fiq.selected_forwarder;

  const submitInquiry = () => {
    patchStepData(activeStage, 'freight_inquiry', {
      submitted: true,
      submitted_at: new Date().toISOString(),
    });
  };

  const filteredSups = freightOnlyMode
    ? suppliers.filter(s => s.supplier_type && ['freight', '货运', 'Freight'].some(k => s.supplier_type!.toLowerCase().includes(k.toLowerCase())))
    : suppliers;

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[11px] font-semibold mb-1" style={{ color: '#15803d' }}>✓ {tw('inquirySubmitted')}</p>
          {fiq.selected_forwarder && <p className="text-[10px]" style={{ color: '#166534' }}>{tw('selectedForwarder')}: {fiq.selected_forwarder}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {!isSubmitted ? (
        <>
          <p className="text-[10px] font-medium" style={{ color: '#9B9A97' }}>{tw('freightCompareHint')}</p>
          {forwarders.map((fw: any, idx: number) => (
            <div key={idx} className="rounded-lg p-3 space-y-2" style={{ background: '#fafafa', border: '1px solid #e5e7eb' }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold" style={{ color: '#6b7280' }}>#{idx + 1}</span>
                {forwarders.length > 2 && (
                  <button onClick={() => removeForwarder(idx)}
                    className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: '#ef4444', background: '#fef2f2' }}>
                    {tw('removeForwarder')}
                  </button>
                )}
              </div>
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>{tw('forwarderName')}</label>
                <input list={`fwd-sups-${idx}`} value={fw.name}
                  onChange={e => {
                    const sup = filteredSups.find(s => s.name === e.target.value);
                    updateForwarder(idx, { name: e.target.value, supplier_id: sup?.id || '' });
                  }}
                  style={fieldStyle} />
                <datalist id={`fwd-sups-${idx}`}>
                  {filteredSups.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>{tw('freightRate')}</label>
                  <input value={fw.freight_rate} onChange={e => updateForwarder(idx, { freight_rate: e.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>{tw('portCharges')}</label>
                  <input value={fw.port_charges} onChange={e => updateForwarder(idx, { port_charges: e.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>{tw('packingFee')}</label>
                  <input value={fw.packing_fee} onChange={e => updateForwarder(idx, { packing_fee: e.target.value })} style={fieldStyle} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>{tw('totalCost')}</label>
                  <div className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                    {fw.total || '0.00'}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>&nbsp;</label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="selected_forwarder" checked={fiq.selected_forwarder === fw.name && !!fw.name}
                      onChange={() => fw.name && patchStepData(activeStage, 'freight_inquiry', { selected_forwarder: fw.name })} />
                    <span className="text-[10px]" style={{ color: '#374151' }}>{tw('selectedForwarder')}</span>
                  </label>
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={addForwarder} className="text-[10px] font-medium" style={{ color: '#7c3aed', cursor: 'pointer' }}>
              {tw('addForwarder')}
            </button>
            <button onClick={() => setFreightOnlyMode(v => !v)} className="text-[9px]" style={{ color: '#9B9A97', cursor: 'pointer' }}>
              {freightOnlyMode ? tw('showAllSuppliers') : tw('showFreightOnly')}
            </button>
          </div>
          {forwarders.length < 2 && (
            <p className="text-[10px]" style={{ color: '#b45309' }}>{tw('minTwoForwarders')}</p>
          )}
          <button disabled={!canSubmit} onClick={submitInquiry}
            className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
            style={{ background: stage.color }}>
            {tw('submitInquiryResult')}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: '#15803d' }}>✓ {tw('inquirySubmitted')}</p>
            {fiq.submitted_at && <p className="text-[9px]" style={{ color: '#166534' }}>{new Date(fiq.submitted_at).toLocaleString()}</p>}
          </div>
          {forwarders.map((fw: any, idx: number) => (
            <div key={idx} className="rounded-lg px-3 py-2 text-[11px]"
              style={{
                background: fiq.selected_forwarder === fw.name ? '#f0fdf4' : '#f9fafb',
                border: `1px solid ${fiq.selected_forwarder === fw.name ? '#bbf7d0' : '#e5e7eb'}`,
              }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold" style={{ color: fiq.selected_forwarder === fw.name ? '#15803d' : '#374151' }}>
                  {fiq.selected_forwarder === fw.name && '★ '}{fw.name || `#${idx + 1}`}
                </span>
                <span className="font-bold" style={{ color: '#1d4ed8' }}>{fw.total || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]" style={{ color: '#6b7280' }}>
                <span>{tw('freightRate')}: {fw.freight_rate || '—'}</span>
                <span>{tw('portCharges')}: {fw.port_charges || '—'}</span>
                <span>{tw('packingFee')}: {fw.packing_fee || '—'}</span>
              </div>
            </div>
          ))}
          <button onClick={() => toggleStep(activeStage, 'freight_inquiry')}
            className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white"
            style={{ background: stage.color }}>
            确认此步骤已完成 ✓
          </button>
        </>
      )}
    </div>
  );
}

// ── Booking ─────────────────────────────────────────────────────────────────

export function BookingStep() {
  const {
    activeStage, stage, isDone, myId, users, suppliers, uploadingFile,
    getStepData, resolvedAssignees, patchStepData, userCanFillRole,
    toggleStep, handleBookingFileUpload, actionApproveRiskBooking,
    resolveUserName, renderUploadMeta, tw,
  } = useWorkflowStep();

  const bk = getStepData<Record<string, any>>(activeStage, 'booking');
  const effAssignees = resolvedAssignees(activeStage);
  const me = users.find(u => u.id === myId);
  const isSP = !!(me && userCanFillRole(me, 'salesperson') && myId === effAssignees['salesperson']);
  const isClerk = !!(me && userCanFillRole(me, 'doc_clerk') && myId === effAssignees['doc_clerk']);
  const isSupervisor = !!(me && userCanFillRole(me, 'sales_supervisor') && myId === effAssignees['sales_supervisor']);
  const isManager = !!(me && userCanFillRole(me, 'sales_manager') && myId === effAssignees['sales_manager']);
  const isRiskMgr = !!(me && userCanFillRole(me, 'risk_manager') && myId === effAssignees['risk_manager']);
  const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none' as const, width: '100%' };

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('bookingComplete')}</p>
          {bk.cargo_type && <p className="text-[10px] mt-0.5" style={{ color: '#166534' }}>{bk.cargo_type === 'bulk' ? tw('bulkCargo') : tw('containerCargo')}</p>}
          {bk.designated_supplier_name && <p className="text-[10px]" style={{ color: '#166534' }}>{tw('designatedSupplier')}: {bk.designated_supplier_name}</p>}
          {bk.confirmed_price && <p className="text-[10px]" style={{ color: '#166534' }}>{tw('confirmedPrice')}: {bk.confirmed_price}</p>}
        </div>
      </div>
    );
  }

  // Phase 0: cargo type selection
  if (!bk.cargo_type) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-[10px] font-medium" style={{ color: '#9B9A97' }}>{tw('selectCargoType')}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => patchStepData(activeStage, 'booking', { cargo_type: 'bulk' })}
            className="py-4 rounded-lg text-sm font-semibold border-2 transition-all"
            style={{ borderColor: '#e5e7eb', color: '#374151', background: '#fafafa' }}>
            {tw('bulkCargo')}
          </button>
          <button onClick={() => patchStepData(activeStage, 'booking', { cargo_type: 'container' })}
            className="py-4 rounded-lg text-sm font-semibold border-2 transition-all"
            style={{ borderColor: '#e5e7eb', color: '#374151', background: '#fafafa' }}>
            {tw('containerCargo')}
          </button>
        </div>
      </div>
    );
  }

  // ══════ BULK CARGO FLOW ══════
  if (bk.cargo_type === 'bulk') {
    const hasSaved = bk.salesperson_saved;
    const hasDraft = (bk.draft_files || []).length > 0;
    const hasConfirm = bk.supervisor_confirmed;
    const hasSigned = (bk.signed_files || []).length > 0;

    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#eff6ff', color: '#1d4ed8' }}>{tw('bulkCargo')}</span>
          <button onClick={() => patchStepData(activeStage, 'booking', { cargo_type: undefined, salesperson_saved: undefined, port: undefined, bulk_freight_rate: undefined, laycan: undefined, draft_files: undefined, supervisor_confirmed: undefined, signed_files: undefined })}
            className="text-[9px]" style={{ color: '#9B9A97', cursor: 'pointer' }}>← {tw('selectCargoType')}</button>
        </div>

        {/* Phase 1: SP inputs port/freight/laycan */}
        <div className="rounded-lg p-3 space-y-2" style={{ background: hasSaved ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasSaved ? '#bbf7d0' : '#e5e7eb'}` }}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>① {tw('roleSalesperson')}</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#9B9A97' }}>{tw('port')}</label>
              <input value={bk.port || ''} disabled={hasSaved} onChange={e => patchStepData(activeStage, 'booking', { port: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#9B9A97' }}>{tw('freightRate')}</label>
              <input value={bk.bulk_freight_rate || ''} disabled={hasSaved} onChange={e => patchStepData(activeStage, 'booking', { bulk_freight_rate: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#9B9A97' }}>{tw('laycan')}</label>
              <input value={bk.laycan || ''} disabled={hasSaved} onChange={e => patchStepData(activeStage, 'booking', { laycan: e.target.value })} style={fieldStyle} />
            </div>
          </div>
          {!hasSaved && (
            <button disabled={!bk.port || !bk.bulk_freight_rate}
              onClick={() => patchStepData(activeStage, 'booking', { salesperson_saved: true })}
              className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
              style={{ background: stage.color }}>
              {tw('saveBookingInfo')}
            </button>
          )}
          {hasSaved && <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('bookingInfoSaved')}</p>}
        </div>

        {/* Phase 2: Clerk uploads draft agreement */}
        {hasSaved && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: hasDraft ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasDraft ? '#bbf7d0' : '#e5e7eb'}` }}>
            <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>② {tw('draftAgreement')}</p>
            {(bk.draft_files || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(bk.draft_files || []).map((f: any, fi: number) => (
                  <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg truncate max-w-[200px]"
                    style={{ background: '#e0f2fe', color: '#0284c7' }} />
                ))}
              </div>
            )}
            {hasDraft && renderUploadMeta(bk.draft_uploaded_by, bk.draft_uploaded_at)}
            {isClerk && !hasDraft && (
              <label className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer font-medium"
                style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
                <HandIcon name="paperclip" size={12} />
                {uploadingFile ? '...' : tw('uploadDraftAgreement')}
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={async e => { const f = e.target.files?.[0]; if (f) await handleBookingFileUpload(activeStage, 'draft_files', f); e.target.value = ''; }} />
              </label>
            )}
            {!isClerk && !hasDraft && <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingDraftUpload')}</p>}
          </div>
        )}

        {/* Phase 3: Supervisor/Manager confirms */}
        {hasDraft && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: hasConfirm ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasConfirm ? '#bbf7d0' : '#e5e7eb'}` }}>
            <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>③ {tw('supervisorConfirmBooking')}</p>
            {hasConfirm ? (
              <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('confirmBooking')} — {resolveUserName(bk.supervisor_confirmed_by)}</p>
            ) : (isSupervisor || isManager) ? (
              <button onClick={() => patchStepData(activeStage, 'booking', { supervisor_confirmed: true, supervisor_confirmed_at: new Date().toISOString(), supervisor_confirmed_by: myId })}
                className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white"
                style={{ background: stage.color }}>
                {tw('confirmBooking')} ✓
              </button>
            ) : (
              <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingSupervisorConfirmBooking')}</p>
            )}
          </div>
        )}

        {/* Phase 4: Clerk uploads counter-signed agreement → complete */}
        {hasConfirm && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: hasSigned ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasSigned ? '#bbf7d0' : '#e5e7eb'}` }}>
            <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>④ {tw('counterSignedAgreement')}</p>
            {(bk.signed_files || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(bk.signed_files || []).map((f: any, fi: number) => (
                  <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg truncate max-w-[200px]"
                    style={{ background: '#e0f2fe', color: '#0284c7' }} />
                ))}
              </div>
            )}
            {hasSigned && renderUploadMeta(bk.signed_uploaded_by, bk.signed_uploaded_at)}
            {isClerk && !hasSigned && (
              <label className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer font-medium"
                style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
                <HandIcon name="paperclip" size={12} />
                {uploadingFile ? '...' : tw('uploadCounterSigned')}
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={async e => { const f = e.target.files?.[0]; if (f) await handleBookingFileUpload(activeStage, 'signed_files', f); e.target.value = ''; }} />
              </label>
            )}
            {!isClerk && !hasSigned && <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingCounterSigned')}</p>}
            {hasSigned && (
              <button onClick={() => toggleStep(activeStage, 'booking')}
                className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white"
                style={{ background: stage.color }}>
                确认此步骤已完成 ✓
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ══════ CONTAINER FLOW ══════
  const conditionsOk = (bk.conditions_path === 'normal' && bk.salesperson_conditions_ok && bk.clerk_conditions_ok)
    || (bk.conditions_path === 'risk' && bk.risk_supervisor_ok && bk.risk_manager_ok && bk.risk_risk_manager_ok);
  const detailsSaved = bk.details_saved;
  const hasDesignation = !!bk.designated_supplier_name;
  const hasBookingForm = (bk.booking_form_files || []).length > 0;
  const hasFinalPrice = !!bk.confirmed_price_at;
  const comparison = bk.freight_comparison || [{ supplier_name: '', price: '' }];

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>{tw('containerCargo')}</span>
        <button onClick={() => patchStepData(activeStage, 'booking', { cargo_type: undefined, conditions_path: undefined, salesperson_conditions_ok: undefined, clerk_conditions_ok: undefined, risk_supervisor_ok: undefined, risk_manager_ok: undefined, risk_risk_manager_ok: undefined })}
          className="text-[9px]" style={{ color: '#9B9A97', cursor: 'pointer' }}>← {tw('selectCargoType')}</button>
      </div>

      {/* Phase 1: Conditions check */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: conditionsOk ? '#f0fdf4' : '#fafafa', border: `1px solid ${conditionsOk ? '#bbf7d0' : '#e5e7eb'}` }}>
        <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>① {tw('bookingConditions')}</p>
        <p className="text-[10px]" style={{ color: '#6b7280' }}>{tw('conditionsHint')}</p>

        {conditionsOk ? (
          <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('conditionsCleared')}</p>
        ) : !bk.conditions_path ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => patchStepData(activeStage, 'booking', { conditions_path: 'normal' })}
              className="py-2 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ borderColor: '#bbf7d0', color: '#15803d', background: '#f0fdf4' }}>
              {tw('conditionsMet')}
            </button>
            <button onClick={() => patchStepData(activeStage, 'booking', { conditions_path: 'risk' })}
              className="py-2 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ borderColor: '#fde68a', color: '#92400e', background: '#fffbeb' }}>
              {tw('riskBooking')}
            </button>
          </div>
        ) : bk.conditions_path === 'normal' ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {bk.salesperson_conditions_ok
                ? <span className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('salespersonConfirmed')}</span>
                : isSP
                  ? <button onClick={() => patchStepData(activeStage, 'booking', { salesperson_conditions_ok: true })}
                      className="text-[10px] px-3 py-1 rounded-lg font-semibold text-white" style={{ background: stage.color }}>
                      {tw('conditionsConfirm')}
                    </button>
                  : <span className="text-[10px]" style={{ color: '#9B9A97' }}>⏳ {tw('salespersonConfirmed').replace('已', '待')}</span>
              }
            </div>
            <div className="flex items-center gap-2">
              {bk.clerk_conditions_ok
                ? <span className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('clerkConfirmed')}</span>
                : isClerk
                  ? <button onClick={() => patchStepData(activeStage, 'booking', { clerk_conditions_ok: true })}
                      className="text-[10px] px-3 py-1 rounded-lg font-semibold text-white" style={{ background: stage.color }}>
                      {tw('conditionsConfirm')}
                    </button>
                  : <span className="text-[10px]" style={{ color: '#9B9A97' }}>⏳ {tw('clerkConfirmed').replace('已', '待')}</span>
              }
            </div>
          </div>
        ) : (
          /* Risk booking path */
          <div className="space-y-1.5">
            <p className="text-[10px]" style={{ color: '#92400e' }}>{tw('riskBookingHint')}</p>
            {([
              { ok: bk.risk_supervisor_ok, label: tw('supervisorApproved'), canApprove: isSupervisor, role: 'supervisor' as const },
              { ok: bk.risk_manager_ok, label: tw('managerApproved'), canApprove: isManager, role: 'manager' as const },
              { ok: bk.risk_risk_manager_ok, label: tw('riskManagerApproved'), canApprove: isRiskMgr, role: 'risk_manager' as const },
            ]).map(item => (
              <div key={item.role} className="flex items-center gap-2">
                {item.ok
                  ? <span className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {item.label}</span>
                  : item.canApprove
                    ? <button onClick={() => actionApproveRiskBooking(activeStage, item.role)}
                        className="text-[10px] px-3 py-1 rounded-lg font-semibold text-white" style={{ background: '#f59e0b' }}>
                        {tw('approveRiskBooking')}
                      </button>
                    : <span className="text-[10px]" style={{ color: '#9B9A97' }}>⏳ {item.label.replace('已', '待')}</span>
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Phase 2: SP fills booking details */}
      {conditionsOk && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: detailsSaved ? '#f0fdf4' : '#fafafa', border: `1px solid ${detailsSaved ? '#bbf7d0' : '#e5e7eb'}` }}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>② {tw('roleSalesperson')}</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'booking_contract_no', label: tw('bookingContractNo') },
              { key: 'shipping_line', label: tw('shippingLine') },
              { key: 'sailing_schedule', label: tw('sailingSchedule') },
              { key: 'container_type', label: tw('containerType') },
              { key: 'container_qty', label: tw('containerQty') },
              { key: 'applied_freight', label: tw('appliedFreight') },
            ] as const).map(f => (
              <div key={f.key}>
                <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#9B9A97' }}>{f.label}</label>
                <input value={(bk as any)[f.key] || ''} disabled={!!detailsSaved}
                  onChange={e => patchStepData(activeStage, 'booking', { [f.key]: e.target.value })}
                  style={fieldStyle} />
              </div>
            ))}
          </div>
          {/* Price comparison */}
          <div>
            <label className="text-[9px] font-semibold block mb-1" style={{ color: '#9B9A97' }}>{tw('freightComparison')}</label>
            {comparison.map((c: any, ci: number) => (
              <div key={ci} className="flex gap-2 mb-1">
                <input placeholder={tw('comparisonSupplier')} value={c.supplier_name}
                  disabled={!!detailsSaved}
                  onChange={e => { const next = [...comparison]; next[ci] = { ...c, supplier_name: e.target.value }; patchStepData(activeStage, 'booking', { freight_comparison: next }); }}
                  className="flex-1" style={fieldStyle} />
                <input placeholder={tw('comparisonPrice')} value={c.price}
                  disabled={!!detailsSaved}
                  onChange={e => { const next = [...comparison]; next[ci] = { ...c, price: e.target.value }; patchStepData(activeStage, 'booking', { freight_comparison: next }); }}
                  className="w-24" style={fieldStyle} />
                {comparison.length > 1 && !detailsSaved && (
                  <button onClick={() => { const next = comparison.filter((_: any, i: number) => i !== ci); patchStepData(activeStage, 'booking', { freight_comparison: next }); }}
                    className="text-[9px] px-1" style={{ color: '#ef4444' }}>×</button>
                )}
              </div>
            ))}
            {!detailsSaved && (
              <button onClick={() => patchStepData(activeStage, 'booking', { freight_comparison: [...comparison, { supplier_name: '', price: '' }] })}
                className="text-[9px] font-medium" style={{ color: '#7c3aed', cursor: 'pointer' }}>
                {tw('addComparisonRow')}
              </button>
            )}
          </div>
          {detailsSaved && <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('bookingDetailsSaved')}</p>}
          {!detailsSaved && (
            <button disabled={!bk.booking_contract_no || !bk.shipping_line || !bk.container_type || !bk.container_qty}
              onClick={() => patchStepData(activeStage, 'booking', { details_saved: true })}
              className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
              style={{ background: stage.color }}>
              {tw('saveBookingDetails')}
            </button>
          )}
        </div>
      )}

      {/* Phase 3: Supervisor designates supplier */}
      {detailsSaved && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: hasDesignation ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasDesignation ? '#bbf7d0' : '#e5e7eb'}` }}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>③ {tw('designateSupplier')}</p>
          <p className="text-[9px]" style={{ color: '#6b7280' }}>{tw('designateHint')}</p>
          {hasDesignation ? (
            <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}>✓ {tw('designatedSupplier')}: {bk.designated_supplier_name} — {resolveUserName(bk.designated_by)}</p>
          ) : (isSupervisor || isManager) ? (
            <div className="space-y-1.5">
              <select value={bk.designated_supplier_id || ''} onChange={e => {
                const sup = suppliers.find(s => s.id === e.target.value);
                patchStepData(activeStage, 'booking', { designated_supplier_id: e.target.value, designated_supplier_name: sup?.name || '' });
              }} style={fieldStyle}>
                <option value="">— {tw('designateSupplier')} —</option>
                {suppliers.filter(s => s.supplier_type && ['freight', '货运', 'Freight'].some(k => (s.supplier_type || '').toLowerCase().includes(k.toLowerCase()))).map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.rating ? ` (${s.rating})` : ''}</option>
                ))}
                <optgroup label="──────────">
                  {suppliers.filter(s => !s.supplier_type || !['freight', '货运', 'Freight'].some(k => (s.supplier_type || '').toLowerCase().includes(k.toLowerCase()))).map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.rating ? ` (${s.rating})` : ''}</option>
                  ))}
                </optgroup>
              </select>
              <button disabled={!bk.designated_supplier_id}
                onClick={() => patchStepData(activeStage, 'booking', { designated_by: myId, designated_at: new Date().toISOString() })}
                className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
                style={{ background: stage.color }}>
                {tw('designateSupplier')} ✓
              </button>
            </div>
          ) : (
            <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingSupervisorConfirmBooking')}</p>
          )}
        </div>
      )}

      {/* Phase 4: Clerk uploads booking form */}
      {hasDesignation && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: hasBookingForm ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasBookingForm ? '#bbf7d0' : '#e5e7eb'}` }}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>④ {tw('bookingForm')}</p>
          {(bk.booking_form_files || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(bk.booking_form_files || []).map((f: any, fi: number) => (
                <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg truncate max-w-[200px]"
                  style={{ background: '#e0f2fe', color: '#0284c7' }} />
              ))}
            </div>
          )}
          {hasBookingForm && renderUploadMeta(bk.booking_form_uploaded_by, bk.booking_form_uploaded_at)}
          {isClerk && !hasBookingForm && (
            <label className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer font-medium"
              style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
              <HandIcon name="paperclip" size={12} />
              {uploadingFile ? '...' : tw('uploadBookingForm')}
              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={async e => { const f = e.target.files?.[0]; if (f) await handleBookingFileUpload(activeStage, 'booking_form_files', f); e.target.value = ''; }} />
            </label>
          )}
          {!isClerk && !hasBookingForm && <p className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('waitingBookingForm')}</p>}
        </div>
      )}

      {/* Phase 5: SP fills confirmed price → complete */}
      {hasBookingForm && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: hasFinalPrice ? '#f0fdf4' : '#fafafa', border: `1px solid ${hasFinalPrice ? '#bbf7d0' : '#e5e7eb'}` }}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>⑤ {tw('confirmedPrice')}</p>
          <p className="text-[9px]" style={{ color: '#6b7280' }}>{tw('fillConfirmedPrice')}</p>
          <input value={bk.confirmed_price || ''} disabled={hasFinalPrice}
            onChange={e => patchStepData(activeStage, 'booking', { confirmed_price: e.target.value })}
            style={fieldStyle} />
          {hasFinalPrice ? (
            <button onClick={() => toggleStep(activeStage, 'booking')}
              className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white"
              style={{ background: stage.color }}>
              确认此步骤已完成 ✓
            </button>
          ) : (
            <button disabled={!bk.confirmed_price}
              onClick={() => patchStepData(activeStage, 'booking', { confirmed_price_at: new Date().toISOString() })}
              className="w-full text-[10px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
              style={{ background: stage.color }}>
              {tw('saveConfirmedPrice')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
