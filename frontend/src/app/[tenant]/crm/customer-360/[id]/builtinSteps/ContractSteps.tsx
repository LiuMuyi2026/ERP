'use client';

import { useWorkflowStep } from '../WorkflowStepContext';
import SecureFileLink from '@/components/ui/SecureFileLink';
import { HandIcon } from '@/components/ui/HandIcon';

// ── Confirm Details ─────────────────────────────────────────────────────────

export function ConfirmDetailsStep() {
  const {
    activeStage, isDone, myId, stage,
    getStepData, resolvedAssignees, patchStepData,
    actionSalespersonSaveDetails, actionClerkSaveDetails,
  } = useWorkflowStep();

  const cd = getStepData<Record<string, any>>(activeStage, 'confirm_details');
  const effAssignees = resolvedAssignees(activeStage);
  const isSalesperson = !!(myId && myId === effAssignees['salesperson']);
  const isDocClerk = !!(myId && myId === effAssignees['doc_clerk']);
  const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none', width: '100%' };
  const roStyle = { ...fieldStyle, background: '#f3f4f6', color: '#9ca3af' };

  return (
    <div className="p-4 space-y-4">
      {/* 业务员部分 */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: isSalesperson && !cd.salesperson_saved ? '#f5f3ff' : cd.salesperson_saved ? '#f0fdf4' : '#f9fafb', border: `1px solid ${cd.salesperson_saved ? '#bbf7d0' : isSalesperson ? '#ddd6fe' : '#e5e7eb'}` }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold" style={{ color: cd.salesperson_saved ? '#15803d' : '#7c3aed' }}>
            {cd.salesperson_saved ? <HandIcon name="circle-check" size={12} className="inline" /> : <HandIcon name="user" size={12} className="inline" />} 业务员填写
          </span>
          {cd.salesperson_saved && cd.salesperson_saved_at && <span className="text-[9px]" style={{ color: '#9B9A97' }}>{new Date(cd.salesperson_saved_at).toLocaleDateString('zh-CN')}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'buyer_company', label: '买方公司名称', span: 2 },
            { key: 'buyer_address', label: '买方地址', span: 2 },
            { key: 'country', label: '国家', span: 1 },
            { key: 'quantity', label: '合同数量', span: 1 },
            { key: 'amount', label: '合同金额', span: 1 },
            { key: 'payment_method', label: '付款方式', span: 1 },
            { key: 'bank', label: '付款行/开证行', span: 1 },
            { key: 'expected_collection_date', label: '预计回款日期', span: 1 },
            { key: 'buyer_info', label: '买方信息（中信保）', span: 2 },
          ] as const).map(f => (
            <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
              <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>{f.label}</label>
              <input value={(cd as any)[f.key] || ''} readOnly={!isSalesperson || !!cd.salesperson_saved}
                onChange={e => patchStepData(activeStage, 'confirm_details', { [f.key]: e.target.value })}
                style={(!isSalesperson || cd.salesperson_saved) ? roStyle : fieldStyle} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={!!cd.sinosure} disabled={!isSalesperson || !!cd.salesperson_saved}
            onChange={e => patchStepData(activeStage, 'confirm_details', { sinosure: e.target.checked })} />
          <label className="text-[10px]" style={{ color: '#374151' }}>需投中信保</label>
        </div>
        {isSalesperson && !cd.salesperson_saved && (
          <button onClick={() => actionSalespersonSaveDetails(activeStage)} className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white" style={{ background: '#7c3aed' }}>
            业务员确认并保存 ✓
          </button>
        )}
      </div>
      {/* 单证员部分 */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: isDocClerk && !cd.clerk_saved ? '#eff6ff' : cd.clerk_saved ? '#f0fdf4' : '#f9fafb', border: `1px solid ${cd.clerk_saved ? '#bbf7d0' : isDocClerk ? '#bfdbfe' : '#e5e7eb'}` }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold" style={{ color: cd.clerk_saved ? '#15803d' : '#2563eb' }}>
            {cd.clerk_saved ? <HandIcon name="circle-check" size={12} className="inline" /> : <HandIcon name="clipboard" size={12} className="inline" />} 单证员填写合同号
          </span>
          {cd.clerk_saved && cd.clerk_saved_at && <span className="text-[9px]" style={{ color: '#9B9A97' }}>{new Date(cd.clerk_saved_at).toLocaleDateString('zh-CN')}</span>}
        </div>
        <div>
          <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>合同号</label>
          <input value={cd.contract_no || ''} readOnly={!isDocClerk || !!cd.clerk_saved}
            onChange={e => patchStepData(activeStage, 'confirm_details', { contract_no: e.target.value })}
            placeholder="SC-2025-XXXX" style={(!isDocClerk || cd.clerk_saved) ? roStyle : fieldStyle} />
        </div>
        {isDocClerk && !cd.clerk_saved && (
          <button onClick={() => actionClerkSaveDetails(activeStage)} className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white" style={{ background: '#2563eb' }}>
            单证员确认合同号 ✓
          </button>
        )}
      </div>
      {isDone && <div className="text-xs text-center py-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={14} className="inline" /> 双方均已完成确认</div>}
    </div>
  );
}

// ── Draft Contract ──────────────────────────────────────────────────────────

export function DraftContractStep() {
  const {
    activeStage, stage, isDone, myId, uploadingFile,
    getStepData, resolvedAssignees, handleFileUpload, actionEmailSent, renderUploadMeta,
  } = useWorkflowStep();

  const dd = getStepData<Record<string, any>>(activeStage, 'draft_contract');
  const effAssignees = resolvedAssignees(activeStage);
  const isSalesperson = !!(myId && myId === effAssignees['salesperson']);
  const isDocClerk = !!(myId && myId === effAssignees['doc_clerk']);
  const files = dd.files || [];

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-lg p-2.5" style={{ background: dd.email_sent ? '#f0fdf4' : '#f9fafb', border: `1px solid ${dd.email_sent ? '#bbf7d0' : '#e5e7eb'}` }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold" style={{ color: dd.email_sent ? '#15803d' : '#374151' }}>
            {dd.email_sent ? <><HandIcon name="circle-check" size={12} className="inline" /> 业务员已发送邮件</> : <><HandIcon name="user" size={12} className="inline" /> 业务员：发送 SC DRAFT EMAIL</>}
          </span>
          {dd.email_sent && dd.email_sent_at && <span className="text-[9px]" style={{ color: '#9B9A97' }}>{new Date(dd.email_sent_at).toLocaleDateString('zh-CN')}</span>}
        </div>
        {isSalesperson && !dd.email_sent && (
          <button onClick={() => actionEmailSent(activeStage)} className="mt-2 w-full text-[11px] py-1 rounded-lg font-semibold text-white" style={{ background: '#0284c7' }}>
            确认已发送邮件 ✓
          </button>
        )}
      </div>
      <div className="rounded-lg p-2.5" style={{ background: dd.clerk_uploaded ? '#f0fdf4' : '#f9fafb', border: `1px solid ${dd.clerk_uploaded ? '#bbf7d0' : '#e5e7eb'}` }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold" style={{ color: dd.clerk_uploaded ? '#15803d' : '#374151' }}>
            {dd.clerk_uploaded ? <><HandIcon name="circle-check" size={12} className="inline" /> 单证员已上传草稿</> : <><HandIcon name="clipboard" size={12} className="inline" /> 单证员：上传合同草稿</>}
          </span>
        </div>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {files.map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: stage.bg, color: stage.color }} />)}
          </div>
        )}
        {files.length > 0 && renderUploadMeta(dd.uploaded_by, dd.uploaded_at)}
        {isDocClerk && !dd.clerk_uploaded && (
          <label className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg cursor-pointer"
            style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: uploadingFile ? '#9ca3af' : '#374151', pointerEvents: uploadingFile ? 'none' as const : 'auto' as const }}>
            {uploadingFile ? '上传中…' : <><HandIcon name="paperclip" size={12} className="inline" /> 上传合同草稿</>}
            <input type="file" className="hidden" disabled={uploadingFile} accept=".pdf,.doc,.docx"
              onChange={async e => { const f = e.target.files?.[0]; if (f) { await handleFileUpload(activeStage, 'draft_contract', f); } e.target.value = ''; }} />
          </label>
        )}
      </div>
      {isDone && <div className="text-xs text-center py-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={14} className="inline" /> 合同草稿已就绪</div>}
    </div>
  );
}

// ── Sign Contract ───────────────────────────────────────────────────────────

export function SignContractStep() {
  const {
    activeStage, stage, isDone, myId, uploadingFile,
    getStepData, resolvedAssignees, patchStepData,
    handleFileUpload, actionSupervisorSignContract, renderUploadMeta,
  } = useWorkflowStep();

  const sc = getStepData<Record<string, any>>(activeStage, 'sign_contract');

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-[10px] font-semibold mb-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={12} className="inline" /> 销售合同已签订</p>
          {sc.contract_no && <p className="text-[11px]" style={{ color: '#15803d' }}>合同号：{sc.contract_no}</p>}
          {sc.contract_amount && <p className="text-[11px]" style={{ color: '#15803d' }}>合同金额：{sc.currency || 'USD'} {Number(sc.contract_amount).toLocaleString()}</p>}
          {(sc.files || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(sc.files || []).map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#15803d', border: '1px solid #bbf7d0' }} />)}
            </div>
          )}
          {(sc.files || []).length > 0 && renderUploadMeta(sc.uploaded_by, sc.uploaded_at)}
        </div>
      </div>
    );
  }

  // Not done path
  const effAssignees = resolvedAssignees(activeStage);
  const isSupervisor = !!(myId && (myId === effAssignees['sales_supervisor'] || myId === effAssignees['sales_manager']));
  const cd = getStepData<Record<string, any>>(1, 'confirm_details');
  const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none', width: '100%' };

  return (
    <div className="p-4 space-y-2">
      {isSupervisor ? (
        <>
          <p className="text-[10px] font-semibold" style={{ color: '#374151' }}>业务主管/业务经理：上传已签合同 + 填写合同号与金额</p>
          <input value={sc.contract_no || ''} onChange={e => patchStepData(activeStage, 'sign_contract', { contract_no: e.target.value })} placeholder="合同号 SC-2025-XXXX" style={fieldStyle} />
          <div className="flex gap-2">
            <input type="number" value={sc.contract_amount ?? cd.amount ?? ''} onChange={e => patchStepData(activeStage, 'sign_contract', { contract_amount: e.target.value })} placeholder="合同金额" style={{ ...fieldStyle, flex: 1 }} />
            <select value={sc.currency || 'USD'} onChange={e => patchStepData(activeStage, 'sign_contract', { currency: e.target.value })} style={{ ...fieldStyle, width: 90, flex: 'none' }}>
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            {(sc.files || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {(sc.files || []).map((f: any, fi: number) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: stage.bg, color: stage.color }} />)}
              </div>
            )}
            {(sc.files || []).length > 0 && renderUploadMeta(sc.uploaded_by, sc.uploaded_at)}
            <label className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg cursor-pointer"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: uploadingFile ? '#9ca3af' : '#374151', pointerEvents: uploadingFile ? 'none' as const : 'auto' as const }}>
              {uploadingFile ? '上传中…' : <><HandIcon name="paperclip" size={12} className="inline" /> 上传签订合同</>}
              <input type="file" className="hidden" disabled={uploadingFile} accept=".pdf,.doc,.docx"
                onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFileUpload(activeStage, 'sign_contract', f); e.target.value = ''; }} />
            </label>
          </div>
          <button disabled={!sc.contract_no?.trim() || !(sc.files || []).length} onClick={() => actionSupervisorSignContract(activeStage)}
            className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40" style={{ background: '#0284c7' }}>
            确认签订合同 ✓
          </button>
        </>
      ) : (
        <p className="text-[10px] p-3" style={{ color: '#9B9A97' }}>等待业务主管/业务经理上传签订合同…</p>
      )}
    </div>
  );
}

// ── Send Contract ───────────────────────────────────────────────────────────

export function SendContractStep() {
  const {
    activeStage, stage, isDone, myId, uploadingFile,
    getStepData, resolvedAssignees, patchStepData,
    handleFileUpload, toggleStep, renderUploadMeta,
  } = useWorkflowStep();

  const effAssignees = resolvedAssignees(activeStage);
  const isDocClerk = !!(myId && myId === effAssignees['doc_clerk']);
  const sc = getStepData<Record<string, any>>(activeStage, 'send_contract');
  const files = sc.files || [];

  if (isDone) {
    return (
      <div className="p-4">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p className="text-xs font-semibold" style={{ color: '#15803d' }}>✓ 合同已会签确认</p>
          {sc.confirmed_at && <p className="text-[10px] mt-0.5" style={{ color: '#6b7280' }}>确认时间：{new Date(sc.confirmed_at).toLocaleString()}</p>}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {files.map((f: any, fi: number) => (
                <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                  className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg truncate max-w-[200px]"
                  style={{ background: '#e0f2fe', color: '#0284c7' }} />
              ))}
            </div>
          )}
          {files.length > 0 && renderUploadMeta(sc.uploaded_by, sc.uploaded_at)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {isDocClerk ? (
        <>
          <p className="text-[11px] font-medium" style={{ color: '#374151' }}>
            上传双方签字合同并确认会签完成
          </p>

          {/* Uploaded files */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f: any, fi: number) => (
                <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip"
                  className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg truncate max-w-[200px]"
                  style={{ background: stage.bg, color: stage.color }} />
              ))}
            </div>
          )}
          {files.length > 0 && renderUploadMeta(sc.uploaded_by, sc.uploaded_at)}

          {/* Upload button */}
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer font-medium transition-colors"
              style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
              <HandIcon name="paperclip" size={12} />
              {uploadingFile ? '上传中...' : '上传签字合同'}
              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFileUpload(activeStage, 'send_contract', f); e.target.value = ''; }} />
            </label>
            <span className="text-[9px]" style={{ color: '#9B9A97' }}>PDF / Word / 图片</span>
          </div>

          {/* Confirm button */}
          <button
            disabled={files.length === 0}
            onClick={async () => {
              patchStepData(activeStage, 'send_contract', {
                confirmed: true,
                confirmed_at: new Date().toISOString(),
                confirmed_by: myId,
              });
              toggleStep(activeStage, 'send_contract');
            }}
            className="w-full text-[11px] py-2 rounded-lg font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: '#0284c7' }}>
            确认合同已会签 ✓
          </button>
        </>
      ) : (
        <p className="text-[10px]" style={{ color: '#9B9A97' }}>等待单证员上传双方签字合同并确认会签…</p>
      )}
    </div>
  );
}

// ── Order Note ──────────────────────────────────────────────────────────────

export function OrderNoteStep() {
  const {
    activeStage, isDone, myId,
    resolvedAssignees, toggleStep,
  } = useWorkflowStep();

  if (isDone) return null;

  const effAssignees = resolvedAssignees(activeStage);
  const isSalesperson = !!(myId && myId === effAssignees['salesperson']);

  return (
    <div className="p-4">
      {isSalesperson ? (
        <button onClick={() => toggleStep(activeStage, 'order_note')}
          className="w-full text-[11px] py-2 rounded-lg font-semibold text-white" style={{ background: '#0284c7' }}>
          线下已完成，确认此步骤 ✓
        </button>
      ) : (
        <p className="text-[10px]" style={{ color: '#9B9A97' }}>等待业务员确认线下完成…</p>
      )}
    </div>
  );
}
