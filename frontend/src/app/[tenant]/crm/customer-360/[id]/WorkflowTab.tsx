'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import SecureFileLink from '@/components/ui/SecureFileLink';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import { StepRendererComponent } from './stepRenderers';

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

interface WorkflowTemplateDefinition {
  stages?: TemplateStageDef[];
}

interface WorkflowTemplateRecord {
  slug: string;
  name: string;
  description?: string | null;
  definition?: WorkflowTemplateDefinition;
}

function normalizeRoleDef(role: TemplateRoleDef): { key: string; label: string } {
  if (typeof role === 'string') {
    return { key: role, label: role };
  }
  return { key: role.key, label: role.label || role.key };
}

function mergeStepDefinition(stepDef: TemplateStepDef, fallback?: WorkflowStep, idx = 0): WorkflowStep & { enabled?: boolean } {
  return {
    key: stepDef.key,
    label: stepDef.label ?? fallback?.label ?? `Step ${idx + 1}`,
    desc: stepDef.desc ?? fallback?.desc ?? '',
    owner: stepDef.owner ?? fallback?.owner,
    approval: fallback?.approval,
    metaField: stepDef.metaField ?? fallback?.metaField,
    type: stepDef.type ?? fallback?.type,
    stepDef: stepDef.type ? stepDef : undefined,
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
  const [workflowTemplate, setWorkflowTemplate] = useState<WorkflowTemplateRecord | null>(null);
  const staticWorkflow = useMemo(() => buildWorkflow(tw), [tw]);
  const WORKFLOW = useMemo(() => {
    const stages = workflowTemplate?.definition?.stages;
    if (stages && stages.length > 0) {
      return buildStagesFromTemplate(stages, staticWorkflow);
    }
    return staticWorkflow;
  }, [staticWorkflow, workflowTemplate]);
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

  useEffect(() => {
    let alive = true;
    api.get<WorkflowTemplateRecord>('/api/workflow-templates/active', { tenantSlug: tenant })
      .then(data => {
        if (!alive) return;
        setWorkflowTemplate(data);
      })
      .catch(() => {
        if (!alive) return;
        setWorkflowTemplate(null);
      });
    return () => { alive = false; };
  }, [tenant]);

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
            const SPECIAL_STEP_KEYS = ['classify', 'price_inquiry', 'soft_offer', 'firm_offer', 'confirm_details', 'draft_contract', 'sign_contract', 'procurement_check', 'confirm_supplier', 'sign_purchase', 'pay_deposit', 'order_note', 'send_contract', 'freight_inquiry', 'booking', 'cost_confirm', 'packing_details', 'warehouse_entry', 'godad_billing', 'customs'];
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

                    {/* ── 询盘归类 ── */}
                    {step.key === 'classify' && (() => {
                      const level = sd.meta?.inquiry_level || '';
                      const cd = getStepData<ClassifyData>(activeStage, 'classify');
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
                              {files.map((f, fi) => (
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
                    })()}

                    {/* ── 采购询价 ── */}
                    {step.key === 'price_inquiry' && (() => {
                      const requiredRoles = ['salesperson', 'purchasing'];
                      const effAssignees = resolvedAssignees(activeStage);
                      const missingRoles = requiredRoles.filter(r => !effAssignees[r]);
                      const hasRoles = missingRoles.length === 0;
                      const piq = getStepData<PriceInquiryData>(activeStage, 'price_inquiry');
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
                                  style={{ background: 'var(--notion-card, white)', border: '1px solid #fed7aa', color: '#c2410c' }}>{refreshing ? '…' : `↺ ${tw('refresh')}`}</button>
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
                    })()}

                    {/* ── 报虚盘 / 报实盘 ── */}
                    {(step.key === 'soft_offer' || step.key === 'firm_offer') && (() => {
                      const ad = getStepData<ApprovalData>(activeStage, step.key);
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
                                <textarea value={ad.content || ''} onChange={e => patchStepData(activeStage, step.key, { content: e.target.value, status: 'draft' })}
                                  placeholder="填写价格条款、有效期、特殊条件…" rows={3}
                                  style={{ ...fieldStyle, resize: 'none' as const, lineHeight: '1.6' }} />
                              </div>
                              <div>
                                <label className="text-[9px] font-semibold uppercase tracking-wide block mb-1" style={{ color: '#9B9A97' }}>支持文件</label>
                                {files.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-1.5">
                                    {files.map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: stage.bg, color: stage.color }} />)}
                                  </div>
                                )}
                                {files.length > 0 && renderUploadMeta(ad.uploaded_by, ad.uploaded_at)}
                                <label className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg cursor-pointer"
                                  style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: uploadingFile ? '#9ca3af' : '#6b7280', pointerEvents: uploadingFile ? 'none' as const : 'auto' as const }}>
                                  <span>{uploadingFile ? '上传中…' : <><HandIcon name="paperclip" size={12} className="inline" /> 上传支持文件</>}</span>
                                  <input type="file" className="hidden" disabled={uploadingFile} accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.png,.jpeg"
                                    onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFileUpload(activeStage, step.key, f); e.target.value = ''; }} />
                                </label>
                              </div>
                              <div>
                                <label className="text-[9px] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: '#9B9A97' }}>审批人</label>
                                <select value={ad.approver_id || ''} onChange={e => patchStepData(activeStage, step.key, { approver_id: e.target.value, status: 'draft' })} style={fieldStyle}>
                                  <option value="">— 选择审批人 —</option>
                                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                                </select>
                              </div>
                              {ad.content && ad.approver_id && files.length === 0 && (
                                <p className="text-[10px]" style={{ color: '#ef4444' }}>请上传支持文件后再提交审批</p>
                              )}
                              <button disabled={!canSubmit} onClick={() => actionSubmitApproval(activeStage, step.key, ad.content || '', ad.approver_id || '')}
                                className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white disabled:opacity-40" style={{ background: stage.color }}>
                                提交审批申请 →
                              </button>
                            </div>
                          )}
                          {status === 'pending' && isApprover && (
                            <div className="rounded-lg px-3 py-2 space-y-2" style={{ background: '#fdf4ff', border: '1px solid #e9d5ff' }}>
                              <p className="text-[10px] font-semibold" style={{ color: '#7c3aed' }}><HandIcon name="bell" size={12} className="inline" /> 待您审批</p>
                              <p className="text-[11px] whitespace-pre-wrap leading-relaxed" style={{ color: '#374151' }}>{ad.content}</p>
                              {files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#7c3aed', border: '1px solid #e9d5ff' }} />)}</div>}
                              {files.length > 0 && renderUploadMeta(ad.uploaded_by, ad.uploaded_at)}
                              <button onClick={() => actionApproverConfirm(activeStage, step.key)} className="w-full text-[11px] py-1.5 rounded-lg font-semibold text-white" style={{ background: '#7c3aed' }}><HandIcon name="circle-check" size={12} className="inline" /> 确认批准，进入下一步</button>
                            </div>
                          )}
                          {status === 'pending' && !isApprover && (
                            <div className="rounded-lg px-3 py-2 space-y-1.5" style={{ background: '#fdf4ff', border: '1px solid #e9d5ff' }}>
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-semibold" style={{ color: '#7c3aed' }}><HandIcon name="hourglass" size={12} className="inline" /> 等待 {users.find(u => u.id === ad.approver_id)?.full_name || '审批人'} 确认</p>
                                <button onClick={refreshWorkflow} disabled={refreshing} className="text-[10px] px-2 py-0.5 rounded-lg disabled:opacity-50"
                                  style={{ background: 'var(--notion-card, white)', border: '1px solid #e9d5ff', color: '#7c3aed' }}>{refreshing ? '…' : '↺ 刷新'}</button>
                              </div>
                              {ad.content && <p className="text-[11px] whitespace-pre-wrap leading-relaxed px-2 py-1.5 rounded-lg" style={{ background: 'var(--notion-card, white)', color: '#374151', border: '1px solid #e9d5ff' }}>{ad.content}</p>}
                              {files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#7c3aed', border: '1px solid #e9d5ff' }} />)}</div>}
                              {files.length > 0 && renderUploadMeta(ad.uploaded_by, ad.uploaded_at)}
                              {ad.submitted_at && <p className="text-[9px]" style={{ color: '#9B9A97' }}>提交于 {new Date(ad.submitted_at).toLocaleDateString('zh-CN')}</p>}
                            </div>
                          )}
                          {status === 'approved' && (
                            <div className="rounded-lg px-3 py-2.5 space-y-1.5" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                              <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={12} className="inline" /> 审批已通过</p>
                              {ad.content && <p className="text-[11px] whitespace-pre-wrap leading-relaxed px-2 py-1.5 rounded-lg" style={{ background: 'var(--notion-card, white)', color: '#374151', border: '1px solid #bbf7d0' }}>{ad.content}</p>}
                              {files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#15803d', border: '1px solid #bbf7d0' }} />)}</div>}
                              {files.length > 0 && renderUploadMeta(ad.uploaded_by, ad.uploaded_at)}
                              <div className="flex items-center gap-3 flex-wrap">
                                {ad.approved_by && <p className="text-[9px]" style={{ color: '#166534' }}>审批人：{users.find(u => u.id === ad.approved_by)?.full_name || '已确认'}</p>}
                                {ad.approved_at && <p className="text-[9px]" style={{ color: '#9B9A97' }}>批准于 {new Date(ad.approved_at).toLocaleDateString('zh-CN')}</p>}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── 确认合同细节 ── */}
                    {step.key === 'confirm_details' && (() => {
                      const cd = getStepData<ConfirmDetailsData>(activeStage, 'confirm_details');
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
                    })()}

                    {/* ── 起草销售合同 ── */}
                    {step.key === 'draft_contract' && (() => {
                      const dd = getStepData<DraftContractData>(activeStage, 'draft_contract');
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
                                {files.map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: stage.bg, color: stage.color }} />)}
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
                    })()}

                    {/* ── 判定采购条件 ── */}
                    {step.key === 'procurement_check' && (() => {
                      const pc = getStepData<ProcurementCheckData>(activeStage, 'procurement_check');
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
                                {(pc.payment_files || []).map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: '#f0fdf4', color: '#15803d' }} />)}
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
                                    } catch (e: any) { alert('上传失败: ' + (e.message || '')); }
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
                                        const updated = { ...pc, [approver.key]: true, [approver.dateKey]: new Date().toISOString() } as ProcurementCheckData;
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
                    })()}

                    {/* ── 确认供应商 ── */}
                    {step.key === 'confirm_supplier' && (() => {
                      const effAssignees = resolvedAssignees(activeStage);
                      const me = users.find(u => u.id === myId);
                      const isSupervisor = !!(me && userCanFillRole(me, 'sales_supervisor') && myId === effAssignees['sales_supervisor']);
                      const cs = getStepData<ConfirmSupplierData>(activeStage, 'confirm_supplier');
                      const fieldStyle = { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, padding: '5px 10px', fontSize: '12px', outline: 'none', width: '100%' };
                      const roStyle = { ...fieldStyle, background: '#f3f4f6', color: '#9ca3af' };
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
                    })()}

                    {/* ── 签订采购合同 ── */}
                    {step.key === 'sign_purchase' && (() => {
                      const effAssignees = resolvedAssignees(activeStage);
                      const me = users.find(u => u.id === myId);
                      const isPurchasingMgr = !!(me && userCanFillRole(me, 'purchasing_manager') && myId === effAssignees['purchasing_manager']);
                      const sp = getStepData<SignPurchaseData>(activeStage, 'sign_purchase');
                      const cs = getStepData<ConfirmSupplierData>(activeStage, 'confirm_supplier');
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
                                  {(sp.files || []).map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: stage.bg, color: stage.color }} />)}
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
                                {(sp.files || []).map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#15803d', border: '1px solid #bbf7d0' }} />)}
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
                    })()}

                    {/* ── 签订销售合同 ── */}
                    {step.key === 'sign_contract' && !isDone && (() => {
                      const effAssignees = resolvedAssignees(activeStage);
                      const isSupervisor = !!(myId && (myId === effAssignees['sales_supervisor'] || myId === effAssignees['sales_manager']));
                      const sc = getStepData<SignContractData>(activeStage, 'sign_contract');
                      const cd = getStepData<ConfirmDetailsData>(1, 'confirm_details');
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
                                  {(sc.files || []).map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: stage.bg, color: stage.color }} />)}
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
                    })()}
                    {step.key === 'sign_contract' && isDone && (() => {
                      const sc = getStepData<SignContractData>(activeStage, 'sign_contract');
                      return (
                        <div className="p-4">
                          <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                            <p className="text-[10px] font-semibold mb-1" style={{ color: '#15803d' }}><HandIcon name="circle-check" size={12} className="inline" /> 销售合同已签订</p>
                            {sc.contract_no && <p className="text-[11px]" style={{ color: '#15803d' }}>合同号：{sc.contract_no}</p>}
                            {sc.contract_amount && <p className="text-[11px]" style={{ color: '#15803d' }}>合同金额：{sc.currency || 'USD'} {Number(sc.contract_amount).toLocaleString()}</p>}
                            {(sc.files || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(sc.files || []).map((f, fi) => <SecureFileLink key={fi} url={f.url} name={f.name} icon="paperclip" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--notion-card, white)', color: '#15803d', border: '1px solid #bbf7d0' }} />)}
                              </div>
                            )}
                            {(sc.files || []).length > 0 && renderUploadMeta(sc.uploaded_by, sc.uploaded_at)}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── 付款（定金） ── */}
                    {step.key === 'pay_deposit' && (() => {
                      const effAssignees = resolvedAssignees(activeStage);
                      const me = users.find(u => u.id === myId);
                      const pd = getStepData<PayDepositData>(activeStage, 'pay_deposit');
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
                                {(pd.receipt_files || []).map((f, fi) => (
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
                                    const updated = { ...pd, [signer.key]: true, [signer.dateKey]: new Date().toISOString() } as PayDepositData;
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
                    })()}

                    {/* ── 线下步骤 (order_note) ── */}
                    {step.key === 'order_note' && !isDone && (() => {
                      const effAssignees = resolvedAssignees(activeStage);
                      const isSalesperson = !!(myId && myId === effAssignees['salesperson']);
                      return (
                        <div className="p-4">
                          {isSalesperson ? (
                            <button onClick={() => toggleStep(activeStage, step.key)}
                              className="w-full text-[11px] py-2 rounded-lg font-semibold text-white" style={{ background: '#0284c7' }}>
                              线下已完成，确认此步骤 ✓
                            </button>
                          ) : (
                            <p className="text-[10px]" style={{ color: '#9B9A97' }}>等待业务员确认线下完成…</p>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── 发送合同 / 会签确认 (send_contract) ── */}
                    {step.key === 'send_contract' && (() => {
                      const effAssignees = resolvedAssignees(activeStage);
                      const isDocClerk = !!(myId && myId === effAssignees['doc_clerk']);
                      const sc = getStepData<SendContractData>(activeStage, 'send_contract');
                      const files = sc.files || [];

                      if (isDone) {
                        return (
                          <div className="p-4">
                            <div className="rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                              <p className="text-xs font-semibold" style={{ color: '#15803d' }}>✓ 合同已会签确认</p>
                              {sc.confirmed_at && <p className="text-[10px] mt-0.5" style={{ color: '#6b7280' }}>确认时间：{new Date(sc.confirmed_at).toLocaleString()}</p>}
                              {files.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {files.map((f, fi) => (
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
                                  {files.map((f, fi) => (
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
                    })()}

                    {/* ── 海运询价 freight_inquiry ── */}
                    {step.key === 'freight_inquiry' && (() => {
                      const fiq = getStepData<FreightInquiryData>(activeStage, 'freight_inquiry');
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
                        // auto-calc total
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
                                  {/* Forwarder name / supplier selector */}
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
                    })()}

                    {/* ── 订舱 booking ── */}
                    {step.key === 'booking' && (() => {
                      const bk = getStepData<BookingData>(activeStage, 'booking');
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
                                    {(bk.draft_files || []).map((f, fi) => (
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
                                    {(bk.signed_files || []).map((f, fi) => (
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
                                  {(bk.booking_form_files || []).map((f, fi) => (
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
                    })()}

                    {/* ── 实际费用确认 cost_confirm ── */}
                    {step.key === 'cost_confirm' && (() => {
                      const cc = getStepData<CostConfirmData>(activeStage, 'cost_confirm');

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
                    })()}

                    {/* ── 货物明细 packing_details ── */}
                    {step.key === 'packing_details' && (() => {
                      const pd = getStepData<PackingDetailsData>(activeStage, 'packing_details');
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
                      const allDone = hasCargo && hasPacking && sentToFwd && hasVat && cashierOk;

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
                                {(pd.cargo_files || []).map((f, fi) => (
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
                                  {(pd.packing_files || []).map((f, fi) => (
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
                                  {(pd.vat_files || []).map((f, fi) => (
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
                    })()}

                    {/* ── 入库登记 warehouse_entry ── */}
                    {step.key === 'warehouse_entry' && (() => {
                      const we = getStepData<WarehouseEntryData>(activeStage, 'warehouse_entry');
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
                    })()}

                    {/* ── 系统开票/出库 godad_billing ── */}
                    {step.key === 'godad_billing' && (() => {
                      const gb = getStepData<GodadBillingData>(activeStage, 'godad_billing');
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
                    })()}

                    {/* ── 报关 customs ── */}
                    {step.key === 'customs' && (() => {
                      const cd = getStepData<{ files?: { name: string; url: string }[]; uploaded_by?: string; uploaded_at?: string }>(activeStage, 'customs');
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
                                  {files.map((f, fi) => (
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
                              {files.map((f, fi) => (
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
                    })()}

                    {/* ── 通用确认按钮（无特殊表单的步骤） ── */}
                    {!isDone && !SPECIAL_STEP_KEYS.includes(step.key) && (
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
