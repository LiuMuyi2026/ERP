'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import SecureFileLink from '@/components/ui/SecureFileLink';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import { StepRendererComponent } from './stepRenderers';
import { usePipelineConfig, type WorkflowStageDef } from '@/lib/usePipelineConfig';
import { WorkflowStepProvider, type WorkflowStepCtx } from './WorkflowStepContext';
import { BUILTIN_RENDERERS } from './builtinSteps';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowStageData {
  assignees: Record<string, string>;        // role_key → user_id
  completed_steps: string[];                // step keys
  meta: Record<string, string>;             // step-specific extra fields
  notes: string;
  steps_data: Record<string, any>;          // per-step extended data
}

interface ClassifyData {
  files?: { name: string; url: string }[];
  uploaded_by?: string;
  uploaded_at?: string;
  saved_at?: string;
}

interface PriceInquiryData {
  product_name?: string;
  specs?: string;
  target_price?: string;
  quantity?: string;
  delivery?: string;
  supplier_id?: string;
  supplier_name?: string;
  submitted?: boolean;
  submitted_at?: string;
  sc_result?: { final_price: string; note: string; confirmed: boolean };
}

interface SupplierItem {
  id: string;
  name: string;
  contact_person?: string;
  contact_info?: string;
  rating?: string;
  supplier_type?: string;
}

const FREIGHT_SUPPLIER_KEYWORDS = ['freight', '货运', 'shipping', 'ship', 'forwarder'];
function isFreightSupplier(supplier?: SupplierItem): boolean {
  if (!supplier?.supplier_type) return false;
  const normalized = supplier.supplier_type.toLowerCase();
  return FREIGHT_SUPPLIER_KEYWORDS.some(keyword => normalized.includes(keyword));
}

interface ApprovalData {
  content?: string;
  approver_id?: string;
  status?: 'draft' | 'pending' | 'approved' | 'rejected';
  submitted_at?: string;
  approved_at?: string;
  approved_by?: string;
  files?: { name: string; url: string }[];
  uploaded_by?: string;
  uploaded_at?: string;
}

interface ConfirmDetailsData {
  buyer_company?: string;
  buyer_address?: string;
  country?: string;
  quantity?: string;
  amount?: string;
  payment_method?: string;
  bank?: string;
  expected_collection_date?: string;
  sinosure?: boolean;
  buyer_info?: string;
  salesperson_saved?: boolean;
  salesperson_saved_at?: string;
  contract_no?: string;
  clerk_saved?: boolean;
  clerk_saved_at?: string;
}

interface DraftContractData {
  email_sent?: boolean;
  email_sent_at?: string;
  files?: { name: string; url: string }[];
  uploaded_by?: string;
  uploaded_at?: string;
  clerk_uploaded?: boolean;
}

interface SignContractData {
  contract_no?: string;
  contract_amount?: string;
  currency?: string;
  contract_id?: string;
  files?: { name: string; url: string }[];
  uploaded_by?: string;
  uploaded_at?: string;
  supervisor_saved?: boolean;
  supervisor_saved_at?: string;
}

interface SendContractData {
  files?: { name: string; url: string }[];
  uploaded_by?: string;
  uploaded_at?: string;
  confirmed?: boolean;
  confirmed_at?: string;
  confirmed_by?: string;
}

interface ConfirmSupplierData {
  supplier_id?: string;
  supplier_name?: string;
  supplier_rating?: string;
  supplier_contact?: string;
  confirmed?: boolean;
  confirmed_at?: string;
}

interface SignPurchaseData {
  po_number?: string;
  files?: { name: string; url: string }[];
  uploaded_by?: string;
  uploaded_at?: string;
  purchasing_manager_saved?: boolean;
  purchasing_manager_saved_at?: string;
  purchase_order_id?: string;
}

interface WorkflowData {
  active_stage?: number;             // legacy index-based
  active_stage_key?: string;         // new key-based
  stages: Record<string, WorkflowStageData>;  // keyed by stage.key (also stores legacy numeric for compatibility)
}

interface SysUser {
  id: string;
  full_name: string;
  email: string;
  role?: string;
  is_admin?: boolean;
  is_active?: boolean;
  position_name?: string;
}

interface FreightInquiryData {
  forwarders: Array<{
    name: string;
    supplier_id?: string;
    freight_rate: string;
    port_charges: string;
    packing_fee: string;
    total: string;
    notes: string;
  }>;
  selected_forwarder?: string;
  submitted?: boolean;
  submitted_at?: string;
  files?: { name: string; url: string }[];
}

interface BookingData {
  cargo_type?: 'bulk' | 'container';
  // === Bulk cargo ===
  port?: string;
  bulk_freight_rate?: string;
  laycan?: string;
  salesperson_saved?: boolean;
  draft_files?: { name: string; url: string }[];
  draft_uploaded_by?: string;
  draft_uploaded_at?: string;
  supervisor_confirmed?: boolean;
  supervisor_confirmed_at?: string;
  supervisor_confirmed_by?: string;
  signed_files?: { name: string; url: string }[];
  signed_uploaded_by?: string;
  signed_uploaded_at?: string;
  // === Container ===
  conditions_path?: 'normal' | 'risk';
  salesperson_conditions_ok?: boolean;
  clerk_conditions_ok?: boolean;
  risk_supervisor_ok?: boolean;
  risk_manager_ok?: boolean;
  risk_risk_manager_ok?: boolean;
  booking_contract_no?: string;
  shipping_line?: string;
  sailing_schedule?: string;
  container_type?: string;
  container_qty?: string;
  applied_freight?: string;
  details_saved?: boolean;
  freight_comparison?: Array<{ supplier_name: string; price: string }>;
  designated_supplier_id?: string;
  designated_supplier_name?: string;
  designated_by?: string;
  designated_at?: string;
  booking_form_files?: { name: string; url: string }[];
  booking_form_uploaded_by?: string;
  booking_form_uploaded_at?: string;
  confirmed_price?: string;
  confirmed_price_at?: string;
}

interface CostConfirmData {
  costs_consistent?: boolean;
  confirmed_by?: string;
  confirmed_at?: string;
  inconsistency_note?: string;
}

interface PackingDetailsData {
  cargo_files?: { name: string; url: string }[];
  cargo_uploaded_by?: string;
  cargo_uploaded_at?: string;
  packing_files?: { name: string; url: string }[];
  packing_uploaded_by?: string;
  packing_uploaded_at?: string;
  sent_to_forwarder?: boolean;
  sent_to_forwarder_at?: string;
  vat_files?: { name: string; url: string }[];
  vat_uploaded_by?: string;
  vat_uploaded_at?: string;
  cashier_confirmed?: boolean;
  cashier_confirmed_at?: string;
}

interface WarehouseEntryData {
  product_id?: string;
  product_name?: string;
  quantity?: string;
  confirmed?: boolean;
  confirmed_by?: string;
  confirmed_at?: string;
  movement_id?: string;
}

interface GodadBillingData {
  product_id?: string;
  product_name?: string;
  quantity?: string;
  confirmed?: boolean;
  confirmed_by?: string;
  confirmed_at?: string;
  movement_id?: string;
}

interface ProcurementCheckData {
  // Path A — payment proof upload (业务员 or 财务)
  payment_files?: { name: string; url: string }[];
  payment_uploaded_by?: string;
  payment_uploaded_at?: string;
  // Path B — three-way approval
  supervisor_approved?: boolean;
  supervisor_approved_at?: string;
  manager_approved?: boolean;
  manager_approved_at?: string;
  risk_approved?: boolean;
  risk_approved_at?: string;
}

interface PayDepositData {
  // 出纳上传收款水单
  receipt_files?: { name: string; url: string }[];
  receipt_uploaded_by?: string;
  receipt_uploaded_at?: string;
  // 四方签字：业务员 / 业务主管 / 采购经理 / 业务经理
  salesperson_confirmed?: boolean;
  salesperson_confirmed_at?: string;
  supervisor_confirmed?: boolean;
  supervisor_confirmed_at?: string;
  purchasing_manager_confirmed?: boolean;
  purchasing_manager_confirmed_at?: string;
  sales_manager_confirmed?: boolean;
  sales_manager_confirmed_at?: string;
}

// ── Position → workflow role mapping ──────────────────────────────────────────
const ROLE_POSITION_KEYWORDS: Record<string, string[]> = {
  salesperson:        ['业务员', '销售员', '业务代表', '外贸'],
  purchasing:         ['采购员', '采购专员'],
  sales_supervisor:   ['业务主管', '销售主管'],
  sales_manager:      ['业务经理', '销售经理'],
  risk_manager:       ['风控经理', '风险经理', '风控'],
  doc_clerk:          ['单证员', '单证'],
  purchasing_manager: ['采购经理'],
  cashier:            ['出纳', '财务出纳'],
  finance:            ['财务', '出纳', '会计'],
};

/** Returns true if user may fill the given workflow role key. */
function userCanFillRole(user: SysUser, roleKey: string): boolean {
  if (user.is_admin) return true;
  if (user.role === 'tenant_admin' || user.role === 'platform_admin') return true;
  const pos = (user.position_name || '').toLowerCase();
  if (!pos) return false;
  if (pos.includes('总经理')) return true;
  const kws = ROLE_POSITION_KEYWORDS[roleKey] || [];
  return kws.some(kw => pos.includes(kw.toLowerCase()));
}

/** Returns true if the given user has finance position (for payment proof upload). */
function userIsFinance(user: SysUser): boolean {
  if (user.is_admin) return true;
  if (user.role === 'tenant_admin' || user.role === 'platform_admin') return true;
  const pos = (user.position_name || '').toLowerCase();
  if (pos.includes('总经理')) return true;
  return (ROLE_POSITION_KEYWORDS.finance || []).some(kw => pos.includes(kw.toLowerCase()));
}

interface StepMetaField {
  key: string;
  label: string;
  options: string[];
}

interface WorkflowStep {
  key: string;
  label: string;
  desc: string;
  owner?: string;                  // 负责岗位 label (informational)
  approval?: string;               // 审批条件描述
  metaField?: StepMetaField;
  type?: string;                   // step type for registry-based rendering
  stepDef?: TemplateStepDef;       // original template definition (fields, checklist_items, etc.)
}

interface WorkflowStage {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  description: string;
  roles: { key: string; label: string }[];
  steps: WorkflowStep[];
}

type TemplateRoleDef = string | { key: string; label?: string };
interface TemplateStepDef {
  key: string;
  label?: string;
  desc?: string;
  owner?: string;
  metaField?: StepMetaField;
  type?: string;                   // step type: checklist, file_upload, approval, data_input, supplier_select, custom
  fields?: { key: string; label: string; type?: string; options?: string[] }[];
  checklist_items?: { key: string; label: string }[];
  file_category?: string;
  approver_role?: string;
  enabled?: boolean;
  builtin?: boolean;
}

interface TemplateStageDef {
  key: string;
  label?: string;
  description?: string;
  icon?: string;
  color?: string;
  bg?: string;
  roles?: TemplateRoleDef[];
  steps?: TemplateStepDef[];
}

function normalizeRoleDef(role: TemplateRoleDef): { key: string; label: string } {
  if (typeof role === 'string') {
    return { key: role, label: role };
  }
  return { key: role.key, label: role.label || role.key };
}

function mergeStepDefinition(stepDef: TemplateStepDef, fallback?: WorkflowStep, idx = 0): WorkflowStep & { enabled?: boolean } {
  const type = stepDef.type ?? fallback?.type;
  return {
    key: stepDef.key,
    label: stepDef.label ?? fallback?.label ?? `Step ${idx + 1}`,
    desc: stepDef.desc ?? fallback?.desc ?? '',
    owner: stepDef.owner ?? fallback?.owner,
    approval: fallback?.approval,
    metaField: stepDef.metaField ?? fallback?.metaField,
    type,
    // Always pass template definition so renderers have access to fields/checklist/etc.
    stepDef: type ? stepDef : undefined,
    enabled: stepDef.enabled,
  };
}

function buildStagesFromTemplate(definitions: TemplateStageDef[], fallbackStages: WorkflowStage[]): WorkflowStage[] {
  return definitions.map((stageDef, idx) => {
    const fallback = fallbackStages.find(st => st.key === stageDef.key);
    const stepsSource = stageDef.steps ?? fallback?.steps ?? [];
    const steps = stepsSource
      .map((step, stepIdx) => {
        const fallbackStep = fallback?.steps?.find(s => s.key === step.key);
        return mergeStepDefinition(step, fallbackStep, stepIdx);
      })
      .filter(step => step.enabled !== false);
    return {
      key: stageDef.key,
      label: stageDef.label ?? fallback?.label ?? `Stage ${idx + 1}`,
      icon: stageDef.icon ?? fallback?.icon ?? 'briefcase',
      color: stageDef.color ?? fallback?.color ?? '#7c3aed',
      bg: stageDef.bg ?? fallback?.bg ?? '#f5f3ff',
      description: stageDef.description ?? fallback?.description ?? '',
      roles: (stageDef.roles ?? fallback?.roles ?? []).map(normalizeRoleDef),
      steps,
    };
  });
}

// ── Business Process Config (uses translation keys) ──────────────────────────

function buildWorkflow(tw: any): WorkflowStage[] {
  return [
  {
    key: 'sales_negotiation',
    label: tw('salesNegotiation'),
    icon: 'briefcase',
    color: '#7c3aed',
    bg: '#f5f3ff',
    description: tw('descSales'),
    roles: [
      { key: 'salesperson', label: tw('roleSalesperson') },
      { key: 'purchasing', label: tw('rolePurchasing') },
      { key: 'sales_supervisor', label: tw('roleSalesSupervisor') },
      { key: 'sales_manager', label: tw('roleSalesManager') },
    ],
    steps: [
      {
        key: 'classify',
        label: tw('stepClassify'),
        desc: tw('stepClassifyDesc'),
        owner: tw('stepClassifyOwner'),
        metaField: {
          key: 'inquiry_level',
          label: tw('inquiryLevel'),
          options: [tw('levelA'), tw('levelB'), tw('levelC'), tw('levelD')],
        },
      },
      {
        key: 'price_inquiry',
        label: tw('stepPriceInquiry'),
        desc: tw('stepPriceInquiryDesc'),
        owner: tw('stepPriceInquiryOwner'),
      },
      {
        key: 'soft_offer',
        label: tw('stepSoftOffer'),
        desc: tw('stepSoftOfferDesc'),
        owner: tw('stepSoftOfferOwner'),
        approval: tw('stepSoftOfferApproval'),
      },
      {
        key: 'firm_offer',
        label: tw('stepFirmOffer'),
        desc: tw('stepFirmOfferDesc'),
        owner: tw('stepFirmOfferOwner'),
        approval: tw('stepFirmOfferApproval'),
      },
    ],
  },
  {
    key: 'contract_signing',
    label: tw('signExportContract'),
    icon: 'document-pen',
    color: '#0284c7',
    bg: '#e0f2fe',
    description: tw('descContract'),
    roles: [
      { key: 'salesperson', label: tw('roleSalesperson') },
      { key: 'doc_clerk', label: tw('roleDocClerk') },
      { key: 'sales_supervisor', label: tw('roleSalesSupervisor') },
      { key: 'sales_manager', label: tw('roleSalesManager') },
    ],
    steps: [
      { key: 'confirm_details', label: tw('stepConfirmDetails'), desc: tw('stepConfirmDetailsDesc'), owner: tw('stepConfirmDetailsOwner') },
      { key: 'draft_contract', label: tw('stepDraftContract'), desc: tw('stepDraftContractDesc'), owner: tw('stepDraftContractOwner') },
      { key: 'order_note', label: tw('stepOrderNote'), desc: tw('stepOrderNoteDesc'), owner: tw('stepOrderNoteOwner'), approval: tw('stepOrderNoteApproval') },
      { key: 'sign_contract', label: tw('stepSignContract'), desc: tw('stepSignContractDesc'), owner: tw('stepSignContractOwner'), approval: tw('stepSignContractApproval') },
      { key: 'send_contract', label: tw('stepSendContract'), desc: tw('stepSendContractDesc'), owner: tw('stepSendContractOwner'), approval: tw('stepSendContractApproval') },
    ],
  },
  {
    key: 'procurement',
    label: tw('procurement'),
    icon: 'factory',
    color: '#c2410c',
    bg: '#fff7ed',
    description: tw('descProcurement'),
    roles: [
      { key: 'salesperson', label: tw('roleSalesperson') },
      { key: 'doc_clerk', label: tw('roleDocClerk') },
      { key: 'purchasing', label: tw('rolePurchasing') },
      { key: 'purchasing_manager', label: tw('rolePurchasingManager') },
      { key: 'cashier', label: tw('roleCashier') },
      { key: 'sales_supervisor', label: tw('roleSalesSupervisor') },
      { key: 'sales_manager', label: tw('roleSalesManager') },
      { key: 'risk_manager', label: tw('roleRiskManager') },
    ],
    steps: [
      { key: 'procurement_check', label: tw('stepProcurementCheck'), desc: tw('stepProcurementCheckDesc'), owner: tw('stepProcurementCheckOwner'), approval: tw('stepProcurementCheckApproval') },
      { key: 'confirm_supplier', label: tw('stepConfirmSupplier'), desc: tw('stepConfirmSupplierDesc'), owner: tw('stepConfirmSupplierOwner') },
      { key: 'sign_purchase', label: tw('stepSignPurchase'), desc: tw('stepSignPurchaseDesc'), owner: tw('stepSignPurchaseOwner') },
      { key: 'pay_deposit', label: tw('stepPayDeposit'), desc: tw('stepPayDepositDesc'), owner: tw('stepPayDepositOwner'), approval: tw('stepPayDepositApproval') },
    ],
  },
  {
    key: 'booking',
    label: tw('bookingFlow'),
    icon: 'ship',
    color: '#15803d',
    bg: '#f0fdf4',
    description: tw('descBooking'),
    roles: [
      { key: 'salesperson', label: tw('roleSalesperson') },
      { key: 'doc_clerk', label: tw('roleDocClerk') },
      { key: 'sales_supervisor', label: tw('roleSalesSupervisor') },
      { key: 'sales_manager', label: tw('roleSalesManager') },
    ],
    steps: [
      { key: 'freight_inquiry', label: tw('stepFreightInquiry'), desc: tw('stepFreightInquiryDesc'), owner: tw('stepFreightInquiryOwner') },
      { key: 'booking', label: tw('stepBooking'), desc: tw('stepBookingDesc'), owner: tw('stepBookingOwner'), approval: tw('stepBookingApproval') },
      { key: 'cost_confirm', label: tw('stepCostConfirm'), desc: tw('stepCostConfirmDesc'), owner: tw('stepCostConfirmOwner') },
    ],
  },
  {
    key: 'shipping',
    label: tw('shippingFlow'),
    icon: 'package',
    color: '#d97706',
    bg: '#fffbeb',
    description: tw('descShipping'),
    roles: [
      { key: 'salesperson', label: tw('roleSalesperson') },
      { key: 'doc_clerk', label: tw('roleDocClerk') },
      { key: 'cashier', label: tw('roleCashier') },
      { key: 'sales_supervisor', label: tw('roleSalesSupervisor') },
      { key: 'sales_manager', label: tw('roleSalesManager') },
    ],
    steps: [
      { key: 'labels', label: tw('stepLabels'), desc: tw('stepLabelsDesc'), owner: tw('stepLabelsOwner') },
      { key: 'inspection', label: tw('stepInspection'), desc: tw('stepInspectionDesc'), owner: tw('stepInspectionOwner'), metaField: { key: 'inspection_type', label: tw('inspectionType'), options: [tw('inspectionSelf'), tw('inspectionThirdParty'), tw('inspectionNone')] } },
      { key: 'packing_details', label: tw('stepPackingDetails'), desc: tw('stepPackingDetailsDesc'), owner: tw('stepPackingDetailsOwner') },
      { key: 'warehouse_entry', label: tw('stepWarehouseEntry'), desc: tw('stepWarehouseEntryDesc'), owner: tw('stepWarehouseEntryOwner') },
      { key: 'pay_balance', label: tw('stepPayBalance'), desc: tw('stepPayBalanceDesc'), owner: tw('stepPayBalanceOwner') },
      { key: 'delivery_notice', label: tw('stepDeliveryNotice'), desc: tw('stepDeliveryNoticeDesc'), owner: tw('stepDeliveryNoticeOwner'), approval: tw('stepDeliveryNoticeApproval') },
      { key: 'godad_billing', label: tw('stepGodadBilling'), desc: tw('stepGodadBillingDesc'), owner: tw('stepGodadBillingOwner') },
      { key: 'customs', label: tw('stepCustoms'), desc: tw('stepCustomsDesc'), owner: tw('stepCustomsOwner') },
      { key: 'clearance_photos', label: tw('stepClearancePhotos'), desc: tw('stepClearancePhotosDesc'), owner: tw('stepClearancePhotosOwner') },
      { key: 'shipment_notice', label: tw('stepShipmentNotice'), desc: tw('stepShipmentNoticeDesc'), owner: tw('stepShipmentNoticeOwner') },
      { key: 'documents', label: tw('stepDocuments'), desc: tw('stepDocumentsDesc'), owner: tw('stepDocumentsOwner'), approval: tw('stepDocumentsApproval') },
    ],
  },
  {
    key: 'collection',
    label: tw('paymentSettlement'),
    icon: 'money-bag',
    color: '#059669',
    bg: '#d1fae5',
    description: tw('descCollection'),
    roles: [
      { key: 'salesperson', label: tw('roleSalesperson') },
      { key: 'doc_clerk', label: tw('roleDocClerk') },
      { key: 'cashier', label: tw('roleCashier') },
      { key: 'sales_supervisor', label: tw('roleSalesSupervisor') },
      { key: 'sales_manager', label: tw('roleSalesManager') },
      { key: 'risk_manager', label: tw('roleRiskManager') },
      { key: 'general_manager', label: tw('roleGeneralManager') },
    ],
    steps: [
      { key: 'follow_payment', label: tw('stepFollowPayment'), desc: tw('stepFollowPaymentDesc'), owner: tw('stepFollowPaymentOwner') },
      { key: 'risk_delivery', label: tw('stepRiskDelivery'), desc: tw('stepRiskDeliveryDesc'), owner: tw('stepRiskDeliveryOwner'), approval: tw('stepRiskDeliveryApproval') },
      { key: 'arrival_notice', label: tw('stepArrivalNotice'), desc: tw('stepArrivalNoticeDesc'), owner: tw('stepArrivalNoticeOwner') },
      { key: 'after_sales', label: tw('stepAfterSales'), desc: tw('stepAfterSalesDesc'), owner: tw('stepAfterSalesOwner') },
      { key: 'filing', label: tw('stepFiling'), desc: tw('stepFilingDesc'), owner: tw('stepFilingOwner') },
    ],
  },
  ];
}

// ── Empty stage data factory ───────────────────────────────────────────────────

function emptyStageData(): WorkflowStageData {
  return { assignees: {}, completed_steps: [], meta: {}, notes: '', steps_data: {} };
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function WorkflowTab({ leadId, isCold, onMarkCold }: {
  leadId: string;
  isCold?: boolean;
  onMarkCold?: () => void;
}) {
  const { tenant } = useParams<{ tenant: string }>();
  const tw = useTranslations('workflow');
  const pipelineConfig = usePipelineConfig();
  const staticWorkflow = useMemo(() => buildWorkflow(tw), [tw]);
  const WORKFLOW = useMemo(() => {
    // Pipeline config (settings page) > hardcoded fallback
    if (pipelineConfig.workflow_stages.length > 0) {
      return buildStagesFromTemplate(
        pipelineConfig.workflow_stages as TemplateStageDef[],
        staticWorkflow,
      );
    }
    return staticWorkflow;
  }, [pipelineConfig.workflow_stages, staticWorkflow]);
  const myId = getCurrentUser()?.sub || '';

  const [workflowData, setWorkflowData] = useState<WorkflowData>({ active_stage: 0, active_stage_key: undefined, stages: {} });
  const [activeStage, setActiveStage] = useState(0);
  const [users, setUsers] = useState<SysUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | false>(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isReturningCustomer, setIsReturningCustomer] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Supplier state
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [freightOnlyMode, setFreightOnlyMode] = useState(true);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);

  // Product state (for warehouse entry/billing)
  const [products, setProducts] = useState<{ id: string; name: string; sku: string; current_stock: number }[]>([]);

  // Derive stage key helper
  const stageKey = useCallback((idx: number) => WORKFLOW[idx]?.key ?? String(idx), [WORKFLOW]);

  // Load workflow + users + suppliers + products
  useEffect(() => {
    Promise.all([
      api.get(`/api/crm/leads/${leadId}/workflow`).catch(() => ({ workflow_data: {}, is_returning_customer: false })),
      api.get('/api/admin/users-lite').catch(() => []),
      api.get('/api/inventory/suppliers').catch(() => []),
      api.get('/api/inventory/products').catch(() => []),
    ]).then(([wf, us, sups, prods]) => {
      const raw: WorkflowData = wf.workflow_data || {};
      const initialIdx = raw.active_stage ?? 0;
      const initialKey = raw.active_stage_key || stageKey(initialIdx);
      setWorkflowData({ active_stage: initialIdx, active_stage_key: initialKey, stages: raw.stages || {} });
      const idxByKey = WORKFLOW.findIndex(s => s.key === initialKey);
      setActiveStage(idxByKey >= 0 ? idxByKey : initialIdx);
      setIsReturningCustomer(!!wf.is_returning_customer);
      setUsers(Array.isArray(us) ? (us as SysUser[]).filter(u => u.is_active !== false || u.is_admin === true) : []);
      setSuppliers(Array.isArray(sups) ? sups as SupplierItem[] : []);
      setProducts(Array.isArray(prods) ? prods : []);
    }).finally(() => setLoading(false));
  }, [leadId, stageKey, WORKFLOW]);

  // Manual refresh — used by purchasing result and approval polling
  const refreshWorkflow = useCallback(async () => {
    setRefreshing(true);
    try {
      const wf = await api.get(`/api/crm/leads/${leadId}/workflow`);
      const raw: WorkflowData = wf.workflow_data || {};
      setWorkflowData({
        active_stage: raw.active_stage ?? 0,
        active_stage_key: raw.active_stage_key || stageKey(raw.active_stage ?? 0),
        stages: raw.stages || {},
      });
      setIsReturningCustomer(!!wf.is_returning_customer);
    } catch { /* silent */ }
    finally { setRefreshing(false); }
  }, [leadId, stageKey]);

  const stageData = useCallback((idx: number): WorkflowStageData => {
    const key = stageKey(idx);
    const stored = workflowData.stages?.[key] || workflowData.stages?.[String(idx)];
    return stored ? { ...emptyStageData(), ...stored } : emptyStageData();
  }, [workflowData, stageKey]);

  const save = useCallback((next: WorkflowData, immediate = false) => {
    setWorkflowData(next);
    setSaveError(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const doSave = async () => {
      setSaving(true);
      try { await api.patch(`/api/crm/leads/${leadId}/workflow`, next); }
      catch (err: any) { setSaveError(err?.message || tw('saveFailed')); }
      finally { setSaving(false); }
    };
    if (immediate) {
      doSave();
    } else {
      saveTimer.current = setTimeout(doSave, 800);
    }
  }, [leadId, tw]);

  function updateStage(idx: number, patch: Partial<WorkflowStageData>) {
    const existing = stageData(idx);
    const updated = { ...existing, ...patch };
    const key = stageKey(idx);
    save({
      ...workflowData,
      active_stage: activeStage,
      active_stage_key: stageKey(activeStage),
      stages: { ...workflowData.stages, [key]: updated, [String(idx)]: updated },
    });
  }

  function toggleStep(stageIdx: number, stepKey: string) {
    const sd = stageData(stageIdx);
    const done = sd.completed_steps.includes(stepKey);
    updateStage(stageIdx, {
      completed_steps: done
        ? sd.completed_steps.filter(k => k !== stepKey)
        : [...sd.completed_steps, stepKey],
    });
  }

  // Un-complete a step AND reset approval/flag fields so the form becomes fully editable again
  const APPROVAL_STEP_KEYS = ['soft_offer', 'firm_offer'];
  function uncompleteStep(stageIdx: number, stepKey: string) {
    const sd = stageData(stageIdx);
    const patch: Partial<WorkflowStageData> = {
      completed_steps: sd.completed_steps.filter(k => k !== stepKey),
    };
    // For approval steps, reset status → 'draft' so submitter can re-edit
    if (APPROVAL_STEP_KEYS.includes(stepKey)) {
      const existing = (sd.steps_data || {})[stepKey] || {};
      patch.steps_data = {
        ...(sd.steps_data || {}),
        [stepKey]: { ...existing, status: 'draft', approved_at: undefined, approved_by: undefined },
      };
    }
    // For sign_purchase, clear the "signed" flag so the form re-opens
    if (stepKey === 'sign_purchase') {
      const existing = (sd.steps_data || {})[stepKey] || {};
      patch.steps_data = {
        ...(sd.steps_data || {}),
        [stepKey]: { ...existing, purchasing_manager_saved: false, purchase_order_id: undefined },
      };
    }
    // For sign_contract, clear the "saved" flag
    if (stepKey === 'sign_contract') {
      const existing = (sd.steps_data || {})[stepKey] || {};
      patch.steps_data = {
        ...(sd.steps_data || {}),
        [stepKey]: { ...existing, supervisor_saved: false, supervisor_saved_at: undefined },
      };
    }
    updateStage(stageIdx, patch);
  }

  function setAssignee(stageIdx: number, roleKey: string, userId: string) {
    const sd = stageData(stageIdx);
    updateStage(stageIdx, {
      assignees: { ...sd.assignees, [roleKey]: userId },
    });
  }

  function setMeta(stageIdx: number, fieldKey: string, value: string) {
    const sd = stageData(stageIdx);
    updateStage(stageIdx, { meta: { ...sd.meta, [fieldKey]: value } });
  }

  function setNotes(stageIdx: number, value: string) {
    updateStage(stageIdx, { notes: value });
  }

  // ── Resolved assignees: merge previous stages so roles carry forward ────────
  // Returns the effective assignees for stageIdx: current stage takes priority,
  // falls back to earlier stages for any role not yet set in the current one.
  function resolvedAssignees(stageIdx: number): Record<string, string> {
    const merged: Record<string, string> = {};
    for (let i = 0; i <= stageIdx; i++) {
      const a = workflowData.stages?.[String(i)]?.assignees || {};
      for (const [k, v] of Object.entries(a)) {
        if (v) merged[k] = v;
      }
    }
    return merged;
  }

  // ── Step-data helpers ──────────────────────────────────────────────────────
  function getStepData<T>(stageIdx: number, key: string): T {
    return ((stageData(stageIdx).steps_data || {})[key] || {}) as T;
  }

  function patchStepData(stageIdx: number, key: string, patch: Record<string, any>) {
    const sd = stageData(stageIdx);
    const existing = (sd.steps_data || {})[key] || {};
    updateStage(stageIdx, { steps_data: { ...(sd.steps_data || {}), [key]: { ...existing, ...patch } } });
  }

  function completeStep(stageIdx: number, key: string) {
    const sd = stageData(stageIdx);
    if (!sd.completed_steps.includes(key)) {
      updateStage(stageIdx, { completed_steps: [...sd.completed_steps, key] });
    }
  }

  // ── Atomic action handlers (immediate save) ───────────────────────────────
  // Builds a fully merged next WorkflowData and saves it immediately.
  function buildNext(stageIdx: number, stagePatch: Partial<WorkflowStageData>): WorkflowData {
    const sd = stageData(stageIdx);
    const merged: WorkflowStageData = {
      ...sd,
      ...stagePatch,
      steps_data: { ...(sd.steps_data || {}), ...(stagePatch.steps_data || {}) },
    };
    const key = stageKey(stageIdx);
    return {
      ...workflowData,
      active_stage: activeStage,
      active_stage_key: stageKey(activeStage),
      stages: { ...workflowData.stages, [key]: merged, [String(stageIdx)]: merged },
    };
  }

  // 询盘归类 save → mark complete immediately
  function actionClassifySave(stageIdx: number) {
    const sd = stageData(stageIdx);
    const level = sd.meta?.inquiry_level || '';
    if (!level) return;
    const next = buildNext(stageIdx, {
      completed_steps: sd.completed_steps.includes('classify') ? sd.completed_steps : [...sd.completed_steps, 'classify'],
      steps_data: { ...(sd.steps_data || {}), classify: { ...((sd.steps_data || {}).classify || {}), saved_at: new Date().toISOString() } },
    });
    save(next, true);
  }

  // 采购询价 submit to SC → immediate save
  function actionSubmitToSC(stageIdx: number) {
    const sd = stageData(stageIdx);
    const next = buildNext(stageIdx, {
      steps_data: {
        ...(sd.steps_data || {}),
        price_inquiry: { ...((sd.steps_data || {}).price_inquiry || {}), submitted: true, submitted_at: new Date().toISOString() },
      },
    });
    save(next, true);
  }

  function submitPriceInquiryWithSupplier(stageIdx: number, supplier: SupplierItem) {
    const sd = stageData(stageIdx);
    const priceInquiry = getStepData<PriceInquiryData>(stageIdx, 'price_inquiry');
    const now = new Date().toISOString();
    const updated = {
      ...priceInquiry,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      submitted: true,
      submitted_at: now,
    };
    const next = buildNext(stageIdx, {
      steps_data: {
        ...(sd.steps_data || {}),
        price_inquiry: updated,
      },
    });
    save(next, true);
  }

  // 采购询价 confirm SC result → mark complete + immediate save
  function actionConfirmSCResult(stageIdx: number) {
    const sd = stageData(stageIdx);
    const next = buildNext(stageIdx, {
      completed_steps: sd.completed_steps.includes('price_inquiry') ? sd.completed_steps : [...sd.completed_steps, 'price_inquiry'],
    });
    save(next, true);
  }

  // 报虚盘/报实盘 submit approval → immediate save
  function actionSubmitApproval(stageIdx: number, stepKey: string, content: string, approverId: string) {
    const sd = stageData(stageIdx);
    const next = buildNext(stageIdx, {
        steps_data: {
        ...(sd.steps_data || {}),
        [stepKey]: {
          ...((sd.steps_data || {})[stepKey] || {}),
          content, approver_id: approverId,
          status: 'pending', submitted_at: new Date().toISOString(),
        },
      },
    });
    save(next, true);
  }

  // Approver confirms → mark step complete + immediate save
  function actionApproverConfirm(stageIdx: number, stepKey: string) {
    const sd = stageData(stageIdx);
    const next = buildNext(stageIdx, {
      completed_steps: sd.completed_steps.includes(stepKey) ? sd.completed_steps : [...sd.completed_steps, stepKey],
      steps_data: {
        ...(sd.steps_data || {}),
        [stepKey]: {
          ...((sd.steps_data || {})[stepKey] || {}),
          status: 'approved', approved_at: new Date().toISOString(), approved_by: myId,
        },
      },
    });
    save(next, true);
  }

  // confirm_details: salesperson saves their section; auto-completes step if clerk already saved
  function actionSalespersonSaveDetails(stageIdx: number) {
    const sd = stageData(stageIdx);
    const cd = getStepData<ConfirmDetailsData>(stageIdx, 'confirm_details');
    const newData = { ...cd, salesperson_saved: true, salesperson_saved_at: new Date().toISOString() };
    const bothDone = !!cd.clerk_saved;
    const next = buildNext(stageIdx, {
      ...(bothDone && { completed_steps: sd.completed_steps.includes('confirm_details') ? sd.completed_steps : [...sd.completed_steps, 'confirm_details'] }),
      steps_data: { ...(sd.steps_data || {}), confirm_details: newData },
    });
    save(next, true);
  }

  // confirm_details: clerk saves contract number; auto-completes step if salesperson already saved
  function actionClerkSaveDetails(stageIdx: number) {
    const sd = stageData(stageIdx);
    const cd = getStepData<ConfirmDetailsData>(stageIdx, 'confirm_details');
    const newData = { ...cd, clerk_saved: true, clerk_saved_at: new Date().toISOString() };
    const bothDone = !!cd.salesperson_saved;
    const next = buildNext(stageIdx, {
      ...(bothDone && { completed_steps: sd.completed_steps.includes('confirm_details') ? sd.completed_steps : [...sd.completed_steps, 'confirm_details'] }),
      steps_data: { ...(sd.steps_data || {}), confirm_details: newData },
    });
    save(next, true);
  }

  // draft_contract: salesperson confirms email sent; auto-completes if clerk already uploaded
  function actionEmailSent(stageIdx: number) {
    const sd = stageData(stageIdx);
    const dd = getStepData<DraftContractData>(stageIdx, 'draft_contract');
    const newData = { ...dd, email_sent: true, email_sent_at: new Date().toISOString() };
    const bothDone = !!dd.clerk_uploaded;
    const next = buildNext(stageIdx, {
      ...(bothDone && { completed_steps: sd.completed_steps.includes('draft_contract') ? sd.completed_steps : [...sd.completed_steps, 'draft_contract'] }),
      steps_data: { ...(sd.steps_data || {}), draft_contract: newData },
    });
    save(next, true);
  }

  // draft_contract: clerk uploads contract; sets clerk_uploaded and auto-completes if email already sent
  async function handleDraftContractUpload(stageIdx: number, file: File) {
    setUploadingFile(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file, { tenantSlug: tenant });
      const sd = stageData(stageIdx);
      const dd = getStepData<DraftContractData>(stageIdx, 'draft_contract');
      const newFiles = [...(dd.files || []), { name: result.name, url: result.url }];
      const bothDone = !!dd.email_sent;
      const next = buildNext(stageIdx, {
        ...(bothDone && { completed_steps: sd.completed_steps.includes('draft_contract') ? sd.completed_steps : [...sd.completed_steps, 'draft_contract'] }),
        steps_data: { ...(sd.steps_data || {}), draft_contract: { ...dd, files: newFiles, clerk_uploaded: true } },
      });
      save(next, true);
    } catch (e: any) {
      alert(tw('fileUploadFailed', { msg: e.message || tw('unknownError') }));
    } finally {
      setUploadingFile(false);
    }
  }

  // sign_contract: supervisor saves signed contract → creates contract + receivable in backend → marks step complete
  async function actionSupervisorSignContract(stageIdx: number) {
    const sd = stageData(stageIdx);
    const sc = getStepData<SignContractData>(stageIdx, 'sign_contract');
    if (!sc.contract_no?.trim()) return;

    let contractId: string | undefined;
    try {
      const cd = getStepData<ConfirmDetailsData>(1, 'confirm_details');
      const result: any = await api.post('/api/crm/contracts', {
        contract_no: sc.contract_no,
        contract_amount: Number(sc.contract_amount || cd.amount || 0),
        currency: sc.currency || 'USD',
        sign_date: new Date().toISOString().slice(0, 10),
        status: 'signed',
        lead_id: leadId,
        create_operation_order: false,
      });
      contractId = result.id;
    } catch { /* non-fatal — contract creation best-effort */ }

    const next = buildNext(stageIdx, {
      completed_steps: sd.completed_steps.includes('sign_contract') ? sd.completed_steps : [...sd.completed_steps, 'sign_contract'],
      steps_data: {
        ...(sd.steps_data || {}),
        sign_contract: { ...sc, supervisor_saved: true, supervisor_saved_at: new Date().toISOString(), contract_id: contractId },
      },
    });
    save(next, true);
  }

  async function handleSignContractUpload(stageIdx: number, file: File) {
    setUploadingFile(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file, { tenantSlug: tenant });
      const sc = getStepData<SignContractData>(stageIdx, 'sign_contract');
      patchStepData(stageIdx, 'sign_contract', { files: [...(sc.files || []), { name: result.name, url: result.url }] });
    } catch (e: any) {
      alert(tw('fileUploadFailed', { msg: e.message || tw('unknownError') }));
    } finally {
      setUploadingFile(false);
    }
  }

  // procurement_check path A: upload payment proof → auto-complete step
  async function handlePaymentProofUpload(stageIdx: number, file: File) {
    setUploadingFile(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file, { tenantSlug: tenant });
      const pc = getStepData<ProcurementCheckData>(stageIdx, 'procurement_check');
      const updated: ProcurementCheckData = {
        ...pc,
        payment_files: [...(pc.payment_files || []), { name: result.name, url: result.url }],
        payment_uploaded_by: myId || undefined,
        payment_uploaded_at: new Date().toISOString(),
      };
      const sd = stageData(stageIdx);
      const next = buildNext(stageIdx, {
        completed_steps: sd.completed_steps.includes('procurement_check')
          ? sd.completed_steps
          : [...sd.completed_steps, 'procurement_check'],
        steps_data: { ...(sd.steps_data || {}), procurement_check: updated },
      });
      save(next, true);
    } catch (e: any) {
      alert(tw('fileUploadFailed', { msg: e.message || '' }));
    } finally {
      setUploadingFile(false);
    }
  }

  // procurement_check path B: individual approval by supervisor / manager / risk_manager
  function actionApproveProcurementCheck(stageIdx: number, approverKey: 'supervisor' | 'manager' | 'risk') {
    const pc = getStepData<ProcurementCheckData>(stageIdx, 'procurement_check');
    const now = new Date().toISOString();
    const updated: ProcurementCheckData = {
      ...pc,
      [`${approverKey}_approved`]: true,
      [`${approverKey}_approved_at`]: now,
    } as ProcurementCheckData;
    const allApproved = updated.supervisor_approved && updated.manager_approved && updated.risk_approved;
    const sd = stageData(stageIdx);
    const next = buildNext(stageIdx, {
      completed_steps: allApproved && !sd.completed_steps.includes('procurement_check')
        ? [...sd.completed_steps, 'procurement_check']
        : sd.completed_steps,
      steps_data: { ...(sd.steps_data || {}), procurement_check: updated },
    });
    save(next, true);
  }

  // pay_deposit: 四方逐一确认 → 全部确认后自动完成
  function actionApprovePayDeposit(stageIdx: number, who: 'salesperson' | 'supervisor' | 'purchasing_manager' | 'sales_manager') {
    const pd = getStepData<PayDepositData>(stageIdx, 'pay_deposit');
    const now = new Date().toISOString();
    const updated: PayDepositData = {
      ...pd,
      [`${who}_confirmed`]: true,
      [`${who}_confirmed_at`]: now,
    } as PayDepositData;
    const allDone = !!(
      (updated.receipt_files || []).length > 0 &&
      updated.salesperson_confirmed &&
      updated.supervisor_confirmed &&
      updated.purchasing_manager_confirmed &&
      updated.sales_manager_confirmed
    );
    const sd = stageData(stageIdx);
    const next = buildNext(stageIdx, {
      completed_steps: allDone && !sd.completed_steps.includes('pay_deposit')
        ? [...sd.completed_steps, 'pay_deposit']
        : sd.completed_steps,
      steps_data: { ...(sd.steps_data || {}), pay_deposit: updated },
    });
    save(next, true);
  }

  async function actionUploadDepositReceipt(stageIdx: number, file: File) {
    setUploadingFile(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file, { tenantSlug: tenant });
      const pd = getStepData<PayDepositData>(stageIdx, 'pay_deposit');
      const updated: PayDepositData = {
        ...pd,
        receipt_files: [...(pd.receipt_files || []), { name: result.name, url: result.url }],
        receipt_uploaded_by: myId || undefined,
        receipt_uploaded_at: new Date().toISOString(),
      };
      const allDone = !!(
        (updated.receipt_files || []).length > 0 &&
        updated.salesperson_confirmed &&
        updated.supervisor_confirmed &&
        updated.purchasing_manager_confirmed &&
        updated.sales_manager_confirmed
      );
      const sd = stageData(stageIdx);
      const next = buildNext(stageIdx, {
        completed_steps: allDone && !sd.completed_steps.includes('pay_deposit')
          ? [...sd.completed_steps, 'pay_deposit']
          : sd.completed_steps,
        steps_data: { ...(sd.steps_data || {}), pay_deposit: updated },
      });
      save(next, true);
    } catch (e: any) {
      alert('上传收款水单失败: ' + (e?.message || ''));
    } finally {
      setUploadingFile(false);
    }
  }

  // confirm_supplier: 业务主管 confirms supplier selection
  function actionConfirmSupplier(stageIdx: number) {
    const sd = stageData(stageIdx);
    const cs = getStepData<ConfirmSupplierData>(stageIdx, 'confirm_supplier');
    if (!cs.supplier_id) return;
    const next = buildNext(stageIdx, {
      completed_steps: sd.completed_steps.includes('confirm_supplier')
        ? sd.completed_steps
        : [...sd.completed_steps, 'confirm_supplier'],
      steps_data: {
        ...(sd.steps_data || {}),
        confirm_supplier: { ...cs, confirmed: true, confirmed_at: new Date().toISOString() },
      },
    });
    save(next, true);
  }

  // sign_purchase: 采购经理 uploads contract → creates PO in orders system
  async function actionSignPurchase(stageIdx: number) {
    const sd = stageData(stageIdx);
    const sp = getStepData<SignPurchaseData>(stageIdx, 'sign_purchase');
    const cs = getStepData<ConfirmSupplierData>(stageIdx, 'confirm_supplier');
    if (!sp.po_number?.trim() || !(sp.files || []).length) return;
    // Create purchase order in backend
    let poId: string | undefined;
    try {
      const piq = getStepData<PriceInquiryData>(0, 'price_inquiry');
      const result: any = await api.post('/api/orders/purchase', {
        po_number: sp.po_number,
        vendor_company_id: cs.supplier_id || undefined,
        product_name: piq.product_name || undefined,
        specs: piq.specs || undefined,
        quantity: piq.quantity || undefined,
        contract_file_url: sp.files?.[0]?.url || undefined,
        contract_file_name: sp.files?.[0]?.name || undefined,
        lead_id: leadId,
        status: 'confirmed',
      });
      poId = result.id;
    } catch { /* non-fatal — PO creation best-effort */ }
    const next = buildNext(stageIdx, {
      completed_steps: sd.completed_steps.includes('sign_purchase')
        ? sd.completed_steps
        : [...sd.completed_steps, 'sign_purchase'],
      steps_data: {
        ...(sd.steps_data || {}),
        sign_purchase: {
          ...sp,
          purchasing_manager_saved: true,
          purchasing_manager_saved_at: new Date().toISOString(),
          purchase_order_id: poId,
        },
      },
    });
    save(next, true);
  }

  async function handlePurchaseContractUpload(stageIdx: number, file: File) {
    setUploadingFile(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file, { tenantSlug: tenant });
      const sp = getStepData<SignPurchaseData>(stageIdx, 'sign_purchase');
      patchStepData(stageIdx, 'sign_purchase', {
        files: [...(sp.files || []), { name: result.name, url: result.url }],
        uploaded_by: myId || undefined,
        uploaded_at: new Date().toISOString(),
      });
    } catch (e: any) {
      alert(tw('fileUploadFailed', { msg: e.message || '' }));
    } finally {
      setUploadingFile(false);
    }
  }

  // booking: file upload for draft/counter-signed/booking-form
  async function handleBookingFileUpload(stageIdx: number, fileField: 'draft_files' | 'signed_files' | 'booking_form_files', file: File) {
    setUploadingFile(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file, { tenantSlug: tenant });
      const bk = getStepData<BookingData>(stageIdx, 'booking');
      const uploadedByField = fileField === 'draft_files' ? 'draft_uploaded_by' : fileField === 'signed_files' ? 'signed_uploaded_by' : 'booking_form_uploaded_by';
      const uploadedAtField = fileField === 'draft_files' ? 'draft_uploaded_at' : fileField === 'signed_files' ? 'signed_uploaded_at' : 'booking_form_uploaded_at';
      patchStepData(stageIdx, 'booking', {
        [fileField]: [...((bk as any)[fileField] || []), { name: result.name, url: result.url }],
        [uploadedByField]: myId || undefined,
        [uploadedAtField]: new Date().toISOString(),
      });
    } catch (e: any) {
      alert(tw('fileUploadFailed', { msg: e.message || '' }));
    } finally {
      setUploadingFile(false);
    }
  }

  // booking: approve risk booking
  function actionApproveRiskBooking(stageIdx: number, role: 'supervisor' | 'manager' | 'risk_manager') {
    const bk = getStepData<BookingData>(stageIdx, 'booking');
    const key = role === 'supervisor' ? 'risk_supervisor_ok' : role === 'manager' ? 'risk_manager_ok' : 'risk_risk_manager_ok';
    patchStepData(stageIdx, 'booking', { [key]: true });
  }

  // packing_details: file upload for cargo/packing/vat sub-fields
  async function handlePackingFileUpload(stageIdx: number, fileField: 'cargo_files' | 'packing_files' | 'vat_files', file: File) {
    setUploadingFile(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file, { tenantSlug: tenant });
      const pd = getStepData<PackingDetailsData>(stageIdx, 'packing_details');
      const byKey = fileField === 'cargo_files' ? 'cargo_uploaded_by' : fileField === 'packing_files' ? 'packing_uploaded_by' : 'vat_uploaded_by';
      const atKey = fileField === 'cargo_files' ? 'cargo_uploaded_at' : fileField === 'packing_files' ? 'packing_uploaded_at' : 'vat_uploaded_at';
      patchStepData(stageIdx, 'packing_details', {
        [fileField]: [...((pd as any)[fileField] || []), { name: result.name, url: result.url }],
        [byKey]: myId || undefined,
        [atKey]: new Date().toISOString(),
      });
    } catch (e: any) {
      alert(tw('fileUploadFailed', { msg: e.message || '' }));
    } finally {
      setUploadingFile(false);
    }
  }

  // warehouse_entry / godad_billing: adjust stock via inventory API
  async function actionInventoryAdjust(stageIdx: number, stepKey: 'warehouse_entry' | 'godad_billing', productId: string, qty: number, movementType: string) {
    try {
      const result: any = await api.post(`/api/inventory/products/${productId}/adjust-stock`, {
        product_id: productId,
        quantity: qty,
        movement_type: movementType,
        notes: `Workflow step: ${stepKey} (Lead ${leadId})`,
      });
      const data = getStepData<WarehouseEntryData>(stageIdx, stepKey);
      const sd = stageData(stageIdx);
      const next = buildNext(stageIdx, {
        completed_steps: sd.completed_steps.includes(stepKey)
          ? sd.completed_steps
          : [...sd.completed_steps, stepKey],
        steps_data: {
          ...(sd.steps_data || {}),
          [stepKey]: { ...data, confirmed: true, confirmed_by: myId, confirmed_at: new Date().toISOString(), movement_id: result.movement_id },
        },
      });
      save(next, true);
    } catch (e: any) {
      alert(e.message || 'Stock adjustment failed');
    }
  }

  // Create new supplier and set it as the selected supplier for price_inquiry
  async function handleFileUpload(stageIdx: number, stepKey: string, file: File) {
    setUploadingFile(true);
    try {
      const result: any = await api.upload('/api/workspace/upload', file, { tenantSlug: tenant });
      const existing = getStepData<{ files?: { name: string; url: string }[]; uploaded_by?: string; uploaded_at?: string }>(stageIdx, stepKey);
      patchStepData(stageIdx, stepKey, {
        files: [...(existing.files || []), { name: result.name, url: result.url }],
        uploaded_by: myId || undefined,
        uploaded_at: new Date().toISOString(),
      });
    } catch (e: any) {
      alert(tw('fileUploadFailed', { msg: e.message || tw('unknownError') }));
    } finally {
      setUploadingFile(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm" style={{ color: '#9B9A97' }}>{tw('loadingWorkflow')}</div>
      </div>
    );
  }

  const stage = WORKFLOW[activeStage];
  const sd = stageData(activeStage);
  const totalSteps = stage.steps.length;
  const doneSteps = stage.steps.filter(s => sd.completed_steps.includes(s.key)).length;
  const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const resolveUserName = (userId?: string) => {
    if (!userId) return '';
    const u = users.find(x => x.id === userId);
    return u?.full_name || u?.email || userId;
  };
  const renderUploadMeta = (userId?: string, uploadedAt?: string) => {
    if (!userId && !uploadedAt) return null;
    const who = resolveUserName(userId);
    const when = uploadedAt ? new Date(uploadedAt).toLocaleString('zh-CN') : '';
    return (
      <p className="text-[9px]" style={{ color: '#9B9A97' }}>
        上传人：{who || '未知'}{when ? ` · 上传时间：${when}` : ''}
      </p>
    );
  };

  // Build context value for builtin step renderers (WorkflowStepProvider)
  const stageInfo = { key: stage.key, label: stage.label, color: stage.color, bg: stage.bg, icon: stage.icon };

  return (
    <div className="space-y-3">

      {/* ── 1. Stage Stepper ── */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex overflow-x-auto" style={{ borderBottom: '1px solid #e5e7eb' }}>
          {WORKFLOW.map((s, idx) => {
            const sd2 = stageData(idx);
            const done2 = s.steps.filter(st => sd2.completed_steps.includes(st.key)).length;
            const isActive = idx === activeStage;
            const isComplete = done2 === s.steps.length && s.steps.length > 0;
            return (
              <button key={s.key} onClick={() => setActiveStage(idx)}
                className="flex items-center gap-2.5 px-5 py-3 flex-shrink-0 transition-all"
                style={{ borderBottom: `2px solid ${isActive ? s.color : 'transparent'}`, background: isActive ? s.bg : 'transparent' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: isComplete ? '#22c55e' : isActive ? s.color : '#e5e7eb', color: (isComplete || isActive) ? 'white' : '#9ca3af' }}>
                  {isComplete ? '✓' : idx + 1}
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold whitespace-nowrap" style={{ color: isActive ? s.color : '#374151' }}>{s.label}</div>
                  <div className="text-[10px]" style={{ color: '#9ca3af' }}>{done2}/{s.steps.length}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="h-1" style={{ background: '#f3f4f6' }}>
          <div className="h-full transition-all" style={{ width: `${progress}%`, background: stage.color }} />
        </div>
      </div>

      {/* ── 2. Active Stage Card ── */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}>

        {/* Stage Header */}
        <div className="px-6 py-4" style={{ background: stage.bg, borderBottom: `2px solid ${stage.color}20` }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <HandIcon name={stage.icon} size={28} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base" style={{ color: stage.color }}>{stage.label}</h3>
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: stage.color, color: 'white' }}>
                    {doneSteps}/{totalSteps} {tw('completed')}
                  </span>
                  {activeStage === 0 && !isCold && onMarkCold && (
                    <button onClick={onMarkCold}
                      className="flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-medium transition-all"
                      style={{ background: 'var(--notion-hover)', color: '#9B9A97', border: '1px solid #E3E2E0' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = '#9B9A97'; e.currentTarget.style.borderColor = '#E3E2E0'; }}>
                      <HandIcon name="snowflake" size={12} className="inline" /> {tw('markColdLead')}
                    </button>
                  )}
                  {isCold && activeStage === 0 && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--notion-hover)', color: '#9B9A97', border: '1px solid #E3E2E0' }}><HandIcon name="snowflake" size={12} className="inline" /> {tw('markedCold')}</span>
                  )}
                  {isReturningCustomer && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full font-semibold" style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}><HandIcon name="star" size={12} className="inline" /> {tw('returningCustomer')}</span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: stage.color + '99' }}>{stage.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {saving && <span className="text-[10px]" style={{ color: '#9B9A97' }}>{tw('saving')}</span>}
              {saveError && !saving && <span className="text-[10px] font-medium" style={{ color: '#dc2626' }}><HandIcon name="alert-triangle" size={12} className="inline" /> {tw('saveFailedShort')}</span>}
              <button onClick={refreshWorkflow} disabled={refreshing}
                className="text-[10px] px-2.5 py-1 rounded-lg transition-all"
                style={{ background: 'rgba(255,255,255,0.6)', color: stage.color, border: `1px solid ${stage.color}44` }}>
                {refreshing ? tw('refreshing') : `↻ ${tw('refresh')}`}
              </button>
            </div>
          </div>
        </div>

        {/* Role Assignment Row */}
        <div className="px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest flex-shrink-0" style={{ color: '#9B9A97' }}>{tw('staffAssignment')}</span>
          {(() => {
            const effAssignees = resolvedAssignees(activeStage);
            return stage.roles.map(role => {
              const explicitId = sd.assignees?.[role.key] || '';
              const inheritedId = !explicitId ? (effAssignees[role.key] || '') : '';
              const displayId = explicitId || inheritedId;
              const isInherited = !explicitId && !!inheritedId;
              const qualified = users.filter(u => userCanFillRole(u, role.key));
              const selectedUser = displayId ? users.find(u => u.id === displayId) : null;
              const selectedMismatch = selectedUser && !userCanFillRole(selectedUser, role.key);
              return (
                <div key={role.key} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: '#6b7280' }}>{role.label}</span>
                  <select value={displayId} onChange={e => setAssignee(activeStage, role.key, e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: displayId ? (isInherited ? '#f3f4f6' : stage.bg) : '#f3f4f6', color: displayId ? (isInherited ? '#6b7280' : stage.color) : '#9ca3af', border: `1px solid ${selectedMismatch ? '#fca5a5' : displayId ? (isInherited ? '#e5e7eb' : stage.color + '44') : '#e5e7eb'}`, outline: 'none', maxWidth: 140 }}>
                    <option value="">{tw('unassigned')}</option>
                    {qualified.length > 0 ? qualified.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}{u.position_name ? ` · ${u.position_name}` : ''}</option>) : <option disabled value="">{tw('noQualifiedUsers')}</option>}
                  </select>
                  {isInherited && <span className="text-[9px]" style={{ color: '#9ca3af' }}>{tw('inherited')}</span>}
                  {selectedMismatch && <span className="text-[9px]" style={{ color: '#dc2626' }}><HandIcon name="alert-triangle" size={10} className="inline" /> {tw('positionMismatch')}</span>}
                </div>
              );
            });
          })()}
        </div>

        {/* Steps Timeline */}
        <div className="px-6 pt-5 pb-2">
          {stage.steps.map((step, stepIdx) => {
            const isDone = sd.completed_steps.includes(step.key);
            const isLast = stepIdx === stage.steps.length - 1;
            const isBuiltinStep = step.key in BUILTIN_RENDERERS;
            const isConfirmSupplierExpanded = (() => {
              if (step.key !== 'confirm_supplier' || isDone) return false;
              const effAssignees = resolvedAssignees(activeStage);
              const me = users.find(u => u.id === myId);
              return !!(me && userCanFillRole(me, 'sales_supervisor') && myId === effAssignees['sales_supervisor']);
            })();
            return (
              <div key={step.key} className="flex gap-4">
                {/* Timeline dot + connector */}
                <div className="flex flex-col items-center" style={{ width: 28, flexShrink: 0 }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: isDone ? stage.color : 'white', color: isDone ? 'white' : '#9ca3af', border: `2px solid ${isDone ? stage.color : '#e5e7eb'}`, boxShadow: isDone ? `0 0 0 3px ${stage.color}20` : 'none', flexShrink: 0 }}>
                    {isDone ? '✓' : stepIdx + 1}
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 mt-1 mb-1" style={{ background: isDone ? stage.color + '44' : '#e5e7eb', minHeight: 24 }} />}
                </div>

                {/* Step content */}
                <div className="flex-1 pb-6">
                  {/* Step header */}
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-sm font-semibold" style={{ color: isDone ? stage.color : '#111827' }}>{step.label}</span>
                    {step.owner && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                        {step.owner}
                      </span>
                    )}
                    {isDone ? (
                      <>
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: stage.bg, color: stage.color }}>✓ {tw('stepCompleted')}</span>
                        {(() => {
                          const me = users.find(u => u.id === myId);
                          const effAssignees = resolvedAssignees(activeStage);
                          const isAssigned = !!myId && Object.values(effAssignees).includes(myId);
                          const canEdit = !!(me && (me.is_admin || me.role === 'tenant_admin' || me.role === 'platform_admin' || isAssigned));
                          return canEdit ? (
                            <button onClick={e => { e.stopPropagation(); uncompleteStep(activeStage, step.key); }}
                              className="text-[9px] px-1.5 py-0.5 rounded-full transition-all"
                              style={{ background: '#fff3cd', color: '#92400e', border: '1px solid #fde68a' }}
                              title={tw('editStepTitle')}>
                              <HandIcon name="pencil" size={12} className="inline" /> {tw('editStep')}
                            </button>
                          ) : null;
                        })()}
                      </>
                    ) : (
                      <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: '#f9fafb', color: '#9ca3af', border: '1px solid #e5e7eb' }}>{tw('stepPending')}</span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs leading-relaxed mb-2" style={{ color: '#6b7280', whiteSpace: 'pre-line' }}>{step.desc}</p>

                  {/* Approval note */}
                  {step.approval && !isDone && (
                    <div className="flex items-start gap-1.5 mb-3 px-3 py-2 rounded-xl text-[10px]" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                      <span className="flex-shrink-0"><HandIcon name="alert-triangle" size={14} /></span>
                      <span>{step.approval}</span>
                    </div>
                  )}

                  {/* Meta field */}
                  {step.metaField && (
                    <div className="mb-3">
                      <label className="text-[9px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>{step.metaField.label}</label>
                      {isDone && sd.meta?.[step.metaField.key] ? (
                        <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg font-semibold" style={{ background: stage.bg, color: stage.color, border: `1px solid ${stage.color}33` }}>
                          ✓ {sd.meta[step.metaField.key]}
                        </div>
                      ) : (
                        <select value={sd.meta?.[step.metaField.key] || ''} onChange={e => setMeta(activeStage, step.metaField!.key, e.target.value)}
                          className="text-xs px-3 py-1.5 rounded-lg w-full max-w-sm"
                          style={{ background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', outline: 'none' }}>
                          <option value="">{tw('selectPlaceholder', { label: step.metaField.label })}</option>
                          {step.metaField.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Action Block */}
                  <div
                    className="rounded-xl"
                    style={{
                      border: '1px solid #e5e7eb',
                      background: '#fafafa',
                      overflow: isConfirmSupplierExpanded ? 'visible' : 'hidden',
                      minHeight: isConfirmSupplierExpanded ? 320 : undefined,
                    }}
                  >

                    {/* ── Type-based step rendering (registry) ── */}
                    {step.type && step.type !== 'custom' && (() => {
                      const stepData = getStepData<Record<string, any>>(activeStage, step.key);
                      return (
                        <div className="p-4">
                          <StepRendererComponent
                            type={step.type}
                            leadId={leadId}
                            stageKey={stage.key}
                            stepKey={step.key}
                            stepLabel={step.label}
                            stepDesc={step.desc}
                            isDone={isDone}
                            stepData={stepData}
                            onSaveStepData={async (key, data) => {
                              patchStepData(activeStage, key, data);
                            }}
                            onToggleStep={(key) => {
                              toggleStep(activeStage, key);
                            }}
                            currentUser={{ id: myId, name: users.find(u => u.id === myId)?.full_name }}
                            users={users}
                            stepDef={step.stepDef ? {
                              fields: step.stepDef.fields,
                              checklist_items: step.stepDef.checklist_items,
                              file_category: step.stepDef.file_category,
                              approver_role: step.stepDef.approver_role,
                            } : undefined}
                          />
                        </div>
                      );
                    })()}

                    {/* ── Builtin step renderers (from registry) ── */}
                    {isBuiltinStep && (() => {
                      const BuiltinComp = BUILTIN_RENDERERS[step.key];
                      if (!BuiltinComp) return null;
                      const ctxValue: WorkflowStepCtx = {
                        leadId, tenant, myId, activeStage, stage: stageInfo, isDone, sd,
                        users, suppliers, products, uploadingFile,
                        setSupplierSearch, setSupplierDropdownOpen, supplierSearch, supplierDropdownOpen,
                        freightOnlyMode, setFreightOnlyMode,
                        stageData, getStepData, resolvedAssignees, userCanFillRole, isFreightSupplier,
                        toggleStep, patchStepData, completeStep, setMeta, handleFileUpload, save, buildNext,
                        actionClassifySave, actionSubmitToSC, submitPriceInquiryWithSupplier, actionConfirmSCResult,
                        actionSubmitApproval, actionApproverConfirm,
                        actionSalespersonSaveDetails, actionClerkSaveDetails, actionEmailSent,
                        handleDraftContractUpload, actionSupervisorSignContract, handleSignContractUpload,
                        handlePaymentProofUpload, actionApproveProcurementCheck, actionApprovePayDeposit,
                        actionUploadDepositReceipt, actionConfirmSupplier, actionSignPurchase,
                        handlePurchaseContractUpload, handleBookingFileUpload, actionApproveRiskBooking,
                        handlePackingFileUpload,
                        refreshWorkflow, refreshing, setUploadingFile,
                        userIsFinance, resolveUserName, actionInventoryAdjust,
                        tw: tw as unknown as (key: string, params?: Record<string, any>) => string, renderUploadMeta,
                      };
                      return (
                        <WorkflowStepProvider value={ctxValue}>
                          <BuiltinComp />
                        </WorkflowStepProvider>
                      );
                    })()}

                    {/* Generic confirm button (non-builtin steps) */}
                    {!isDone && !isBuiltinStep && (
                      <div className="p-4">
                        <button onClick={() => toggleStep(activeStage, step.key)}
                          className="w-full text-xs py-2 rounded-xl font-semibold text-white transition-all"
                          style={{ background: stage.color }}>
                          确认此步骤已完成 ✓
                        </button>
                      </div>
                    )}


                  </div>{/* end Action Block */}
                </div>{/* end step content */}
              </div>
            );
          })}
        </div>

        {/* Stage Notes */}
        <div className="px-6 py-4" style={{ borderTop: '1px solid #e5e7eb' }}>
          <label className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color: '#9B9A97' }}>阶段备注</label>
          <textarea value={sd.notes || ''} onChange={e => setNotes(activeStage, e.target.value)} rows={2}
            placeholder="记录本阶段的关键信息、特殊情况、沟通结果…"
            className="w-full text-xs px-3 py-2 rounded-xl resize-none"
            style={{ background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', outline: 'none', lineHeight: '1.6' }}
            onFocus={e => { e.target.style.borderColor = stage.color; }}
            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; }} />
        </div>

        {/* Stage Navigation */}
        <div className="px-6 pb-5 flex gap-2">
          {activeStage > 0 && (
            <button onClick={() => setActiveStage(prev => prev - 1)}
              className="flex-1 text-xs py-2 rounded-xl font-medium transition-all"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280' }}>
              ← 上一阶段
            </button>
          )}
          {activeStage < WORKFLOW.length - 1 && (
            <button onClick={() => setActiveStage(prev => prev + 1)}
              className="flex-1 text-xs py-2 rounded-xl font-semibold text-white transition-all"
              style={{ background: stage.color }}>
              下一阶段 →
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Overall Progress Summary ── */}
      <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#9B9A97' }}>整体进度总览</p>
        <div className="grid grid-cols-6 gap-2">
          {WORKFLOW.map((s, idx) => {
            const sd2 = stageData(idx);
            const done2 = s.steps.filter(st => sd2.completed_steps.includes(st.key)).length;
            const pct = s.steps.length > 0 ? Math.round((done2 / s.steps.length) * 100) : 0;
            const isActive = idx === activeStage;
            return (
              <button key={s.key} onClick={() => setActiveStage(idx)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all text-left"
                style={{ background: isActive ? s.bg : '#f9fafb', border: `1px solid ${isActive ? s.color + '44' : '#e5e7eb'}` }}>
                <span className="text-base">{pct === 100 ? <HandIcon name="circle-check" size={18} /> : <HandIcon name={s.icon} size={18} />}</span>
                <span className="text-[9px] font-semibold whitespace-nowrap w-full text-center" style={{ color: isActive ? s.color : '#374151' }}>{s.label}</span>
                <div className="w-full h-1 rounded-full" style={{ background: '#e5e7eb' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                </div>
                <span className="text-[9px]" style={{ color: '#9B9A97' }}>{done2}/{s.steps.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Authorization Reference ── */}
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #fde68a' }}>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: '#92400E' }}>授权参考</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {[
            { label: '实盘报价 ≥500万/70万美金', approver: '业务经理' },
            { label: '销售合同 ≥200万/30万美金', approver: '业务经理' },
            { label: 'O/A付款合同（任意金额）', approver: '业务经理签署' },
            { label: '采购合同 ≥200万/30万美金', approver: '业务经理' },
            { label: '支款单 ≥200万/30万美金', approver: '业务经理加签' },
            { label: '订舱 >500吨 / >10TEU', approver: '业务经理确认' },
            { label: '风险发货 >10万美金', approver: '总经理批准' },
            { label: '风险放货 >10万美金', approver: '总经理批准' },
          ].map(r => (
            <div key={r.label} className="flex items-start gap-1.5">
              <span className="text-[9px] flex-shrink-0 mt-0.5" style={{ color: '#D97706' }}>•</span>
              <div>
                <span className="text-[9px]" style={{ color: '#92400E' }}>{r.label}</span>
                <span className="text-[9px] ml-1 font-semibold" style={{ color: '#B45309' }}>→ {r.approver}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
