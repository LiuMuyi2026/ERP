'use client';

import { useWorkflowStep } from '../WorkflowStepContext';
import SecureFileLink from '@/components/ui/SecureFileLink';
import { HandIcon } from '@/components/ui/HandIcon';
import { api } from '@/lib/api';

// ── Procurement Check ───────────────────────────────────────────────────────

export function ProcurementCheckStep() {
  const {
    activeStage, isDone, myId, users, uploadingFile, tenant,
    getStepData, resolvedAssignees, stageData, buildNext, save,
    userCanFillRole, userIsFinance, setUploadingFile, renderUploadMeta,
  } = useWorkflowStep();

  const pc = getStepData<Record<string, any>>(activeStage, 'procurement_check');
  const effAssignees = resolvedAssignees(activeStage);
  const me = users.find(u => u.id === myId);
  const canUpload = !!(me && (myId === effAssignees['salesperson'] || userIsFinance(me)));
  const canApprove = (roleKey: string) => !!(me && userCanFillRole(me, roleKey) && myId === effAssignees[roleKey]);

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-lg p-3" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
        <p className="text-[10px] font-semibold mb-2" style={{ color: '#374151' }}>路径A：上传付款凭证（到款/LC正本/签字合同）</p>
        {(pc.payment_files || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {(pc.payment_files || []).map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: '#f0fdf4', color: '#15803d' }} />)}
          </div>
        )}
        {(pc.payment_files || []).length > 0 && renderUploadMeta(pc.payment_uploaded_by, pc.payment_uploaded_at)}
        {canUpload && !isDone && (
          <label className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg cursor-pointer"
            style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: uploadingFile ? '#9ca3af' : '#374151', pointerEvents: uploadingFile ? 'none' as const : 'auto' as const }}>
            {uploadingFile ? '上传中…' : <><HandIcon name="paperclip" size={12} className="inline" /> 上传凭证</>}
            <input type="file" className="hidden" disabled={uploadingFile} accept=".pdf,.jpg,.png,.jpeg,.xlsx"
              onChange={async e => {
                const f = e.target.files?.[0]; if (!f) return;
                setUploadingFile(true);
                try {
                  const result: any = await api.upload('/api/workspace/upload', f, { tenantSlug: tenant });
                  const sd2 = stageData(activeStage);
                  const next = buildNext(activeStage, {
                    completed_steps: sd2.completed_steps.includes('procurement_check') ? sd2.completed_steps : [...sd2.completed_steps, 'procurement_check'],
                    steps_data: { ...(sd2.steps_data || {}), procurement_check: { ...(pc), payment_files: [...(pc.payment_files || []), { name: result.name, url: result.url }], payment_uploaded_by: myId || undefined, payment_uploaded_at: new Date().toISOString() } },
                  });
                  save(next, true);
                } catch (err: any) { alert('上传失败: ' + (err.message || '')); }
                finally { setUploadingFile(false); e.target.value = ''; }
              }} />
          </label>
        )}
      </div>
      {!isDone && (
        <div className="rounded-lg p-3" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <p className="text-[10px] font-semibold mb-2" style={{ color: '#c2410c' }}>路径B：风险采购 — 三方审批</p>
          {[
            { key: 'supervisor_approved', label: '业务主管', roleKey: 'sales_supervisor', dateKey: 'supervisor_approved_at' },
            { key: 'manager_approved', label: '业务经理', roleKey: 'sales_manager', dateKey: 'manager_approved_at' },
            { key: 'risk_approved', label: '风控经理', roleKey: 'risk_manager', dateKey: 'risk_approved_at' },
          ].map(approver => {
            const approved = !!(pc as any)[approver.key];
            const canApproveThis = canApprove(approver.roleKey);
            return (
              <div key={approver.key} className="flex items-center gap-2 mb-1.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={{ background: approved ? '#22c55e' : '#e5e7eb', color: approved ? 'white' : '#9ca3af' }}>{approved ? '✓' : '○'}</div>
                <span className="text-[10px] flex-1" style={{ color: '#374151' }}>{approver.label}</span>
                {approved && <span className="text-[9px]" style={{ color: '#9B9A97' }}>{(pc as any)[approver.dateKey] ? new Date((pc as any)[approver.dateKey]).toLocaleDateString('zh-CN') : ''}</span>}
                {!approved && canApproveThis && (
                  <button onClick={() => {
                    const updated = { ...pc, [approver.key]: true, [approver.dateKey]: new Date().toISOString() };
                    const allApproved = updated.supervisor_approved && updated.manager_approved && updated.risk_approved;
                    const sd2 = stageData(activeStage);
                    const next = buildNext(activeStage, {
                      completed_steps: allApproved && !sd2.completed_steps.includes('procurement_check') ? [...sd2.completed_steps, 'procurement_check'] : sd2.completed_steps,
                      steps_data: { ...(sd2.steps_data || {}), procurement_check: updated },
                    });
                    save(next, true);
                  }} className="text-[10px] px-2 py-0.5 rounded-lg font-medium text-white" style={{ background: '#c2410c' }}>批准</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {isDone && <div className="text-xs text-center py-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={14} className="inline" /> 采购条件已确认</div>}
    </div>
  );
}

// ── Confirm Supplier ────────────────────────────────────────────────────────

export function ConfirmSupplierStep() {
  const {
    activeStage, isDone, myId, users, suppliers,
    supplierSearch, supplierDropdownOpen, setSupplierSearch, setSupplierDropdownOpen,
    getStepData, resolvedAssignees, patchStepData, userCanFillRole,
    actionConfirmSupplier, tw,
  } = useWorkflowStep();

  const effAssignees = resolvedAssignees(activeStage);
  const me = users.find(u => u.id === myId);
  const isSupervisor = !!(me && userCanFillRole(me, 'sales_supervisor') && myId === effAssignees['sales_supervisor']);
  const cs = getStepData<Record<string, any>>(activeStage, 'confirm_supplier');
  const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none', width: '100%' };

  return (
    <div className="p-5 space-y-3">
      {isSupervisor && !isDone ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold" style={{ color: '#374151' }}>业务主管：从供应商名录中选择</p>
          {cs.supplier_id ? (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span className="text-[11px] flex-1" style={{ color: '#15803d' }}>✓ {cs.supplier_name}</span>
              <button onClick={() => patchStepData(activeStage, 'confirm_supplier', { supplier_id: undefined, supplier_name: undefined, confirmed: false })}
                className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#9B9A97' }}>× 更换</button>
            </div>
          ) : (
            <div className="relative">
              <input value={supplierSearch} onChange={e => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true); }}
                onFocus={() => setSupplierDropdownOpen(true)} onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 150)}
                placeholder="搜索供应商…" style={fieldStyle} />
              {supplierDropdownOpen && (
                <div className="absolute z-20 left-0 right-0 mt-0.5 rounded-lg shadow-lg"
                  style={{ background: 'var(--notion-card, white)', border: '1px solid #e5e7eb', maxHeight: 320, overflowY: 'auto' }}>
                  {suppliers.filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase())).map(s => (
                    <button key={s.id} className="w-full text-left px-3 py-2 text-[11px]"
                      style={{ color: '#374151', borderBottom: '1px solid #f3f4f6' }}
                      onMouseDown={() => { patchStepData(activeStage, 'confirm_supplier', { supplier_id: s.id, supplier_name: s.name, supplier_rating: s.rating, supplier_contact: s.contact_person }); setSupplierDropdownOpen(false); setSupplierSearch(''); }}>
                      {s.name}{s.rating && <span className="ml-1.5 text-[9px] px-1 rounded" style={{ background: '#f0fdf4', color: '#15803d' }}>{s.rating} {tw('level')}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {cs.supplier_id && (
            <button onClick={() => actionConfirmSupplier(activeStage)} className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white" style={{ background: '#c2410c' }}>
              确认选用此供应商 ✓
            </button>
          )}
        </div>
      ) : cs.confirmed ? (
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[10px] font-semibold mb-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={12} className="inline" /> 已确认供应商</p>
          <p className="text-sm font-bold" style={{ color: '#15803d' }}>{cs.supplier_name}</p>
          {cs.supplier_rating && <p className="text-[9px]" style={{ color: '#9B9A97' }}>评级：{cs.supplier_rating}</p>}
          {cs.confirmed_at && <p className="text-[9px]" style={{ color: '#9B9A97' }}>确认于 {new Date(cs.confirmed_at).toLocaleDateString('zh-CN')}</p>}
        </div>
      ) : (
        <p className="text-[10px]" style={{ color: '#9B9A97' }}>等待业务主管选择并确认供应商…</p>
      )}
    </div>
  );
}

// ── Sign Purchase ───────────────────────────────────────────────────────────

export function SignPurchaseStep() {
  const {
    activeStage, stage, isDone, myId, users, uploadingFile,
    getStepData, resolvedAssignees, patchStepData, userCanFillRole,
    handlePurchaseContractUpload, actionSignPurchase, renderUploadMeta,
  } = useWorkflowStep();

  const effAssignees = resolvedAssignees(activeStage);
  const me = users.find(u => u.id === myId);
  const isPurchasingMgr = !!(me && userCanFillRole(me, 'purchasing_manager') && myId === effAssignees['purchasing_manager']);
  const sp = getStepData<Record<string, any>>(activeStage, 'sign_purchase');
  const cs = getStepData<Record<string, any>>(activeStage, 'confirm_supplier');
  const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none', width: '100%' };

  return (
    <div className="p-4 space-y-3">
      {!cs.confirmed && <div className="text-[10px] px-3 py-2 rounded-lg" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}><HandIcon name="alert-triangle" size={14} className="inline" /> 请先完成&quot;确认供应商&quot;步骤</div>}
      {cs.confirmed && (
        isPurchasingMgr && !isDone ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold" style={{ color: '#374151' }}>采购经理：填写采购合同号并上传合同</p>
            <div>
              <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>采购合同号</label>
              <input value={sp.po_number || ''} onChange={e => patchStepData(activeStage, 'sign_purchase', { po_number: e.target.value })} placeholder="PO-2025-XXXX" style={fieldStyle} />
            </div>
            <div>
              <label className="text-[9px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>采购合同文件</label>
              {(sp.files || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {(sp.files || []).map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: stage.bg, color: stage.color }} />)}
                </div>
              )}
              {(sp.files || []).length > 0 && renderUploadMeta(sp.uploaded_by, sp.uploaded_at)}
              <label className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg cursor-pointer"
                style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: uploadingFile ? '#9ca3af' : '#374151', pointerEvents: uploadingFile ? 'none' as const : 'auto' as const }}>
                {uploadingFile ? '上传中…' : <><HandIcon name="paperclip" size={12} className="inline" /> 上传采购合同</>}
                <input type="file" className="hidden" disabled={uploadingFile} accept=".pdf,.doc,.docx"
                  onChange={async e => { const f = e.target.files?.[0]; if (f) await handlePurchaseContractUpload(activeStage, f); e.target.value = ''; }} />
              </label>
            </div>
            <button disabled={!sp.po_number?.trim() || !(sp.files || []).length} onClick={() => actionSignPurchase(activeStage)}
              className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40" style={{ background: '#c2410c' }}>
              确认签订并创建采购订单 ✓
            </button>
          </div>
        ) : isDone ? (
          <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={12} className="inline" /> 采购合同已签订</p>
            {sp.po_number && <p className="text-[11px]" style={{ color: '#15803d' }}>合同号：{sp.po_number}</p>}
            {(sp.files || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(sp.files || []).map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#15803d', border: '1px solid #bbf7d0' }} />)}
              </div>
            )}
            {(sp.files || []).length > 0 && renderUploadMeta(sp.uploaded_by, sp.uploaded_at)}
          </div>
        ) : (
          <p className="text-[10px]" style={{ color: '#9B9A97' }}>等待采购经理上传合同…</p>
        )
      )}
    </div>
  );
}

// ── Pay Deposit ─────────────────────────────────────────────────────────────

export function PayDepositStep() {
  const {
    activeStage, isDone, myId, users, uploadingFile,
    getStepData, resolvedAssignees, userCanFillRole, userIsFinance,
    stageData, buildNext, save,
    actionUploadDepositReceipt, renderUploadMeta,
  } = useWorkflowStep();

  const effAssignees = resolvedAssignees(activeStage);
  const me = users.find(u => u.id === myId);
  const pd = getStepData<Record<string, any>>(activeStage, 'pay_deposit');
  const isCashier          = !!(me && userCanFillRole(me, 'cashier')            && myId === effAssignees['cashier']);
  const isSalesperson      = !!(me && userCanFillRole(me, 'salesperson')        && myId === effAssignees['salesperson']);
  const isSupervisor       = !!(me && userCanFillRole(me, 'sales_supervisor')   && myId === effAssignees['sales_supervisor']);
  const isPurchasingMgr    = !!(me && userCanFillRole(me, 'purchasing_manager') && myId === effAssignees['purchasing_manager']);
  const isSalesMgr         = !!(me && userCanFillRole(me, 'sales_manager')      && myId === effAssignees['sales_manager']);
  const signers = [
    { key: 'salesperson_confirmed', label: '业务员', dateKey: 'salesperson_confirmed_at', can: isSalesperson },
    { key: 'supervisor_confirmed', label: '业务主管', dateKey: 'supervisor_confirmed_at', can: isSupervisor },
    { key: 'purchasing_manager_confirmed', label: '采购经理', dateKey: 'purchasing_manager_confirmed_at', can: isPurchasingMgr },
    { key: 'sales_manager_confirmed', label: '业务经理', dateKey: 'sales_manager_confirmed_at', can: isSalesMgr },
  ];
  const hasReceipt = (pd.receipt_files || []).length > 0;
  const allSigned = signers.every(s => !!(pd as any)[s.key]);

  return (
    <div className="p-4 space-y-2">
      <div className="rounded-lg p-3 mb-2" style={{ background: hasReceipt ? '#f0fdf4' : '#f9fafb', border: `1px solid ${hasReceipt ? '#bbf7d0' : '#e5e7eb'}` }}>
        <p className="text-[10px] font-semibold mb-2" style={{ color: hasReceipt ? '#15803d' : '#374151' }}>
          {hasReceipt ? '✓ 出纳已上传收款水单' : '出纳员：上传收款水单'}
        </p>
        {(pd.receipt_files || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(pd.receipt_files || []).map((f: any, fi: number) => (
              <SecureFileLink
                key={fi}
                url={f.url}
                name={f.name}
                icon="paperclip"
                className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg truncate max-w-[220px]"
                style={{ background: '#e0f2fe', color: '#0369a1' }}
              />
            ))}
          </div>
        )}
        {(pd.receipt_files || []).length > 0 && renderUploadMeta(pd.receipt_uploaded_by, pd.receipt_uploaded_at)}
        {isCashier && !isDone && (
          <label className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg cursor-pointer"
            style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: uploadingFile ? '#9ca3af' : '#374151', pointerEvents: uploadingFile ? 'none' as const : 'auto' as const }}>
            {uploadingFile ? '上传中…' : <><HandIcon name="paperclip" size={12} className="inline" /> 上传收款水单</>}
            <input
              type="file"
              className="hidden"
              disabled={uploadingFile}
              accept=".pdf,.jpg,.png,.jpeg,.xlsx"
              onChange={async e => { const f = e.target.files?.[0]; if (f) await actionUploadDepositReceipt(activeStage, f); e.target.value = ''; }}
            />
          </label>
        )}
        {!hasReceipt && !isCashier && (
          <p className="text-[10px]" style={{ color: '#9B9A97' }}>等待出纳员上传收款水单…</p>
        )}
      </div>
      <p className="text-[10px] font-semibold mb-2" style={{ color: '#374151' }}>四方在支款单上签字确认</p>
      {signers.map(signer => {
        const confirmed = !!(pd as any)[signer.key];
        return (
          <div key={signer.key} className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: confirmed ? '#f0fdf4' : '#f9fafb', border: `1px solid ${confirmed ? '#bbf7d0' : '#e5e7eb'}` }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: confirmed ? '#22c55e' : '#e5e7eb', color: confirmed ? 'white' : '#9ca3af' }}>{confirmed ? '✓' : '○'}</div>
            <span className="text-[11px] flex-1 font-medium" style={{ color: confirmed ? '#15803d' : '#374151' }}>{signer.label}</span>
            {confirmed && (pd as any)[signer.dateKey] && <span className="text-[9px]" style={{ color: '#9B9A97' }}>{new Date((pd as any)[signer.dateKey]).toLocaleDateString('zh-CN')}</span>}
            {!confirmed && signer.can && !isDone && (
              <button onClick={() => {
                const updated = { ...pd, [signer.key]: true, [signer.dateKey]: new Date().toISOString() };
                const allDone = (updated.receipt_files || []).length > 0 && updated.salesperson_confirmed && updated.supervisor_confirmed && updated.purchasing_manager_confirmed && updated.sales_manager_confirmed;
                const sd2 = stageData(activeStage);
                const next = buildNext(activeStage, {
                  completed_steps: allDone && !sd2.completed_steps.includes('pay_deposit') ? [...sd2.completed_steps, 'pay_deposit'] : sd2.completed_steps,
                  steps_data: { ...(sd2.steps_data || {}), pay_deposit: updated },
                });
                save(next, true);
              }} disabled={!hasReceipt} className="text-[10px] px-2.5 py-0.5 rounded-lg font-semibold text-white disabled:opacity-40" style={{ background: '#c2410c' }}>
                签字确认
              </button>
            )}
          </div>
        );
      })}
      {allSigned && hasReceipt && <div className="text-xs text-center py-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={14} className="inline" /> 收款水单与四方签字均已完成</div>}
    </div>
  );
}
