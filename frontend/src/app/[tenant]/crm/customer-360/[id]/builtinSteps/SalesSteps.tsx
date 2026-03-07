'use client';

import { useWorkflowStep } from '../WorkflowStepContext';
import type { SupplierItem } from '../WorkflowStepContext';
import SecureFileLink from '@/components/ui/SecureFileLink';
import { HandIcon } from '@/components/ui/HandIcon';

// ── Classify ────────────────────────────────────────────────────────────────

export function ClassifyStep() {
  const {
    activeStage, stage, isDone, sd, uploadingFile,
    getStepData, handleFileUpload, actionClassifySave, tw, renderUploadMeta,
  } = useWorkflowStep();

  const level = sd.meta?.inquiry_level || '';
  const cd = getStepData<Record<string, any>>(activeStage, 'classify');
  const files = cd.files || [];

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#9B9A97' }}>{tw('backgroundFiles')}</span>
        {!isDone && (
          <label className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg cursor-pointer font-medium"
            style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: uploadingFile ? '#9ca3af' : '#374151', pointerEvents: uploadingFile ? 'none' : 'auto' }}>
            {uploadingFile ? <><HandIcon name="hourglass" size={12} className="inline" /> {tw('uploading')}</> : <><HandIcon name="paperclip" size={12} className="inline" /> {tw('uploadFile')}</>}
            <input type="file" className="hidden" disabled={uploadingFile} accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.png,.jpeg"
              onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFileUpload(activeStage, 'classify', f); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f: any, fi: number) => (
            <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
              className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg truncate max-w-[200px]"
              style={{ background: stage.bg, color: stage.color }} />
          ))}
        </div>
      )}
      {files.length > 0 && renderUploadMeta(cd.uploaded_by, cd.uploaded_at)}
      {isDone ? (
        <div className="text-xs" style={{ color: stage.color }}>✓ {tw('classifyDone')}{cd.saved_at ? ` · ${new Date(cd.saved_at).toLocaleDateString()}` : ''}</div>
      ) : (
        <>
          <button disabled={!level} onClick={() => actionClassifySave(activeStage)}
            className="w-full text-xs py-2 rounded-lg font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: level ? stage.color : '#9ca3af' }}>
            {!level ? tw('selectInquiryLevel') : `${tw('saveAndComplete')} ✓`}
          </button>
        </>
      )}
    </div>
  );
}

// ── Price Inquiry ───────────────────────────────────────────────────────────

export function PriceInquiryStep() {
  const {
    activeStage, isDone, users, suppliers, uploadingFile,
    supplierSearch, supplierDropdownOpen, setSupplierSearch, setSupplierDropdownOpen,
    getStepData, resolvedAssignees, patchStepData, isFreightSupplier,
    actionSubmitToSC, submitPriceInquiryWithSupplier, actionConfirmSCResult,
    refreshWorkflow, refreshing, tw,
  } = useWorkflowStep();

  const requiredRoles = ['salesperson', 'purchasing'];
  const effAssignees = resolvedAssignees(activeStage);
  const missingRoles = requiredRoles.filter(r => !effAssignees[r]);
  const hasRoles = missingRoles.length === 0;
  const piq = getStepData<Record<string, any>>(activeStage, 'price_inquiry');
  const isSubmitted = piq.submitted === true;
  const hasResult = !!piq.sc_result?.confirmed;
  const fieldStyle = {
    background: '#f9fafb', border: '1px solid #e5e7eb',
    color: '#374151', borderRadius: 8, padding: '5px 10px',
    fontSize: '12px', outline: 'none', width: '100%',
  };
  const freightSuppliers = suppliers.filter(isFreightSupplier);
  const matchingSuppliers = freightSuppliers.filter(s =>
    !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  return (
    <div className="p-4 space-y-3">
      {!hasRoles && (
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <HandIcon name="alert-triangle" size={14} className="inline" /> {tw('assignRolesFirst')}
        </div>
      )}
      {hasRoles && !isSubmitted && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'product_name', label: tw('productName'), span: 1 },
              { key: 'quantity', label: tw('quantity'), span: 1 },
              { key: 'specs', label: tw('specs'), span: 2 },
              { key: 'target_price', label: tw('targetPrice'), span: 1 },
              { key: 'delivery', label: tw('delivery'), span: 1 },
            ] as const).map(f => (
              <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
                <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>{f.label}</label>
                <input value={(piq as any)[f.key] || ''}
                  onChange={e => patchStepData(activeStage, 'price_inquiry', { [f.key]: e.target.value })}
                  style={fieldStyle} />
              </div>
            ))}
          </div>
          <div>
            <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>{tw('supplier')}</label>
            {piq.supplier_id ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <span className="text-[11px] flex-1" style={{ color: '#15803d' }}>✓ {piq.supplier_name}</span>
                <button onClick={() => patchStepData(activeStage, 'price_inquiry', { supplier_id: undefined, supplier_name: undefined })}
                  className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#9B9A97' }}>× {tw('changeSupplier')}</button>
              </div>
            ) : (
              <div className="relative">
                <input value={supplierSearch}
                  onChange={e => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true); }}
                  onFocus={() => setSupplierDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 150)}
                  placeholder={tw('searchSupplier')} style={fieldStyle} />
                {supplierDropdownOpen && (
                  <div className="absolute z-20 left-0 right-0 mt-0.5 rounded-lg shadow-lg"
                    style={{ background: 'var(--notion-card, white)', border: '1px solid #e5e7eb', maxHeight: 150, overflowY: 'auto' }}>
                    {matchingSuppliers.map(s => (
                      <button key={s.id} className="w-full text-left px-3 py-2 text-[11px]"
                        style={{ color: '#374151', borderBottom: '1px solid #f3f4f6' }}
                        onMouseDown={e => {
                          e.preventDefault();
                          submitPriceInquiryWithSupplier(activeStage, s);
                          setSupplierDropdownOpen(false);
                          setSupplierSearch('');
                        }}>
                        {s.name}{s.contact_person && <span className="ml-2 text-[9px]" style={{ color: '#9B9A97' }}>{s.contact_person}</span>}
                        {s.rating && <span className="ml-1.5 text-[9px] px-1 rounded" style={{ background: '#f0fdf4', color: '#15803d' }}>{s.rating} {tw('level')}</span>}
                      </button>
                    ))}
                    {matchingSuppliers.length === 0 && (
                      <p className="px-3 py-2 text-[11px]" style={{ color: '#9B9A97' }}>
                        {tw('noMatchingSupplier')} 只能选择已录入的货运供应商。
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <button disabled={!piq.product_name || !piq.quantity} onClick={() => actionSubmitToSC(activeStage)}
            className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40" style={{ background: '#c2410c' }}>
            <HandIcon name="factory" size={14} className="inline" /> {tw('submitToSC')}
          </button>
        </div>
      )}
      {isSubmitted && !hasResult && (
        <div className="rounded-lg px-3 py-2.5" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2"><span><HandIcon name="hourglass" size={14} /></span>
              <p className="text-[11px] font-semibold" style={{ color: '#c2410c' }}>{tw('submittedToSC')}</p>
            </div>
            <button onClick={refreshWorkflow} disabled={refreshing} className="text-[10px] px-2 py-0.5 rounded-lg disabled:opacity-50"
              style={{ background: 'var(--notion-card, white)', border: '1px solid #fed7aa', color: '#c2410c' }}>{refreshing ? '...' : `↺ ${tw('refresh')}`}</button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-1.5">
            {[{ label: tw('productName'), value: piq.product_name }, { label: tw('quantity'), value: piq.quantity }, { label: tw('specs'), value: piq.specs, full: true }, { label: tw('targetPrice'), value: piq.target_price }, { label: tw('delivery'), value: piq.delivery }, { label: tw('supplier'), value: piq.supplier_name }]
              .filter(f => f.value).map(f => (
                <div key={f.label} className={(f as any).full ? 'col-span-2' : ''}>
                  <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9B9A97' }}>{f.label}：</span>
                  <span className="text-[11px]" style={{ color: '#374151' }}>{f.value}</span>
                </div>
              ))}
          </div>
          {piq.submitted_at && <p className="text-[9px]" style={{ color: '#9B9A97' }}>提交于 {new Date(piq.submitted_at).toLocaleString('zh-CN')}<span className="ml-1.5 font-medium" style={{ color: '#7c3aed' }}>→ 请前往 供应链管理 → 采购询价 查看进度</span></p>}
        </div>
      )}
      {hasResult && (
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[10px] font-semibold mb-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={12} className="inline" /> 供应链最终报价</p>
          <p className="text-sm font-bold" style={{ color: '#15803d' }}>{piq.sc_result?.final_price}</p>
          {piq.sc_result?.note && <p className="text-[10px] mt-0.5" style={{ color: '#166534' }}>{piq.sc_result.note}</p>}
          {!isDone && <button onClick={() => actionConfirmSCResult(activeStage)} className="mt-2 w-full text-[11px] py-1 rounded-lg font-semibold text-white" style={{ background: '#15803d' }}>确认并完成此步骤</button>}
        </div>
      )}
    </div>
  );
}

// ── Soft Offer / Firm Offer (shared renderer) ──────────────────────────────

function OfferStepInner({ stepKey }: { stepKey: string }) {
  const {
    activeStage, stage, isDone, myId, users, uploadingFile,
    getStepData, patchStepData, handleFileUpload,
    actionSubmitApproval, actionApproverConfirm,
    refreshWorkflow, refreshing, renderUploadMeta,
  } = useWorkflowStep();

  const ad = getStepData<Record<string, any>>(activeStage, stepKey);
  const status = ad.status || 'draft';
  const isApprover = myId && myId === ad.approver_id;
  const files = ad.files || [];
  const canSubmit = !!(ad.content && ad.approver_id && files.length > 0);
  const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none', width: '100%' };

  return (
    <div className="p-4 space-y-3">
      {status === 'draft' && (
        <div className="space-y-2">
          <div>
            <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>报价情况</label>
            <textarea value={ad.content || ''} onChange={e => patchStepData(activeStage, stepKey, { content: e.target.value, status: 'draft' })}
              placeholder="填写价格条款、有效期、特殊条件…" rows={3}
              style={{ ...fieldStyle, resize: 'none' as const, lineHeight: '1.6' }} />
          </div>
          <div>
            <label className="text-[9px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>支持文件</label>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {files.map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: stage.bg, color: stage.color }} />)}
              </div>
            )}
            {files.length > 0 && renderUploadMeta(ad.uploaded_by, ad.uploaded_at)}
            <label className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg cursor-pointer"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: uploadingFile ? '#9ca3af' : '#6b7280', pointerEvents: uploadingFile ? 'none' as const : 'auto' as const }}>
              <span>{uploadingFile ? '上传中…' : <><HandIcon name="paperclip" size={12} className="inline" /> 上传支持文件</>}</span>
              <input type="file" className="hidden" disabled={uploadingFile} accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.png,.jpeg"
                onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFileUpload(activeStage, stepKey, f); e.target.value = ''; }} />
            </label>
          </div>
          <div>
            <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>审批人</label>
            <select value={ad.approver_id || ''} onChange={e => patchStepData(activeStage, stepKey, { approver_id: e.target.value, status: 'draft' })} style={fieldStyle}>
              <option value="">— 选择审批人 —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </select>
          </div>
          {ad.content && ad.approver_id && files.length === 0 && (
            <p className="text-[10px]" style={{ color: '#ef4444' }}>请上传支持文件后再提交审批</p>
          )}
          <button disabled={!canSubmit} onClick={() => actionSubmitApproval(activeStage, stepKey, ad.content || '', ad.approver_id || '')}
            className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40" style={{ background: stage.color }}>
            提交审批申请 →
          </button>
        </div>
      )}
      {status === 'pending' && isApprover && (
        <div className="rounded-lg px-3 py-2 space-y-2" style={{ background: '#fdf4ff', border: '1px solid #e9d5ff' }}>
          <p className="text-[10px] font-semibold" style={{ color: '#7c3aed' }}><HandIcon name="bell" size={12} className="inline" /> 待您审批</p>
          <p className="text-[11px] whitespace-pre-wrap leading-relaxed" style={{ color: '#374151' }}>{ad.content}</p>
          {files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#7c3aed', border: '1px solid #e9d5ff' }} />)}</div>}
          {files.length > 0 && renderUploadMeta(ad.uploaded_by, ad.uploaded_at)}
          <button onClick={() => actionApproverConfirm(activeStage, stepKey)} className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white" style={{ background: '#7c3aed' }}><HandIcon name="circle-check" size={12} className="inline" /> 确认批准，进入下一步</button>
        </div>
      )}
      {status === 'pending' && !isApprover && (
        <div className="rounded-lg px-3 py-2 space-y-1.5" style={{ background: '#fdf4ff', border: '1px solid #e9d5ff' }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold" style={{ color: '#7c3aed' }}><HandIcon name="hourglass" size={12} className="inline" /> 等待 {users.find(u => u.id === ad.approver_id)?.full_name || '审批人'} 确认</p>
            <button onClick={refreshWorkflow} disabled={refreshing} className="text-[10px] px-2 py-0.5 rounded-lg disabled:opacity-50"
              style={{ background: 'var(--notion-card, white)', border: '1px solid #e9d5ff', color: '#7c3aed' }}>{refreshing ? '...' : '↺ 刷新'}</button>
          </div>
          {ad.content && <p className="text-[11px] whitespace-pre-wrap leading-relaxed px-2 py-1.5 rounded-lg" style={{ background: 'var(--notion-card, white)', color: '#374151', border: '1px solid #e9d5ff' }}>{ad.content}</p>}
          {files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#7c3aed', border: '1px solid #e9d5ff' }} />)}</div>}
          {files.length > 0 && renderUploadMeta(ad.uploaded_by, ad.uploaded_at)}
          {ad.submitted_at && <p className="text-[9px]" style={{ color: '#9B9A97' }}>提交于 {new Date(ad.submitted_at).toLocaleDateString('zh-CN')}</p>}
        </div>
      )}
      {status === 'approved' && (
        <div className="rounded-lg px-3 py-2.5 space-y-1.5" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={12} className="inline" /> 审批已通过</p>
          {ad.content && <p className="text-[11px] whitespace-pre-wrap leading-relaxed px-2 py-1.5 rounded-lg" style={{ background: 'var(--notion-card, white)', color: '#374151', border: '1px solid #bbf7d0' }}>{ad.content}</p>}
          {files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#15803d', border: '1px solid #bbf7d0' }} />)}</div>}
          {files.length > 0 && renderUploadMeta(ad.uploaded_by, ad.uploaded_at)}
          <div className="flex items-center gap-3 flex-wrap">
            {ad.approved_by && <p className="text-[9px]" style={{ color: '#166534' }}>审批人：{users.find(u => u.id === ad.approved_by)?.full_name || '已确认'}</p>}
            {ad.approved_at && <p className="text-[9px]" style={{ color: '#9B9A97' }}>批准于 {new Date(ad.approved_at).toLocaleDateString('zh-CN')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function SoftOfferStep() {
  return <OfferStepInner stepKey="soft_offer" />;
}

export function FirmOfferStep() {
  return <OfferStepInner stepKey="firm_offer" />;
}
