'use client';

import { createContext, useContext } from 'react';

// ── Shared types (re-exported for builtin steps) ─────────────────────────────

export interface SysUser {
  id: string;
  full_name: string;
  email: string;
  role?: string;
  is_admin?: boolean;
  is_active?: boolean;
  position_name?: string;
}

export interface SupplierItem {
  id: string;
  name: string;
  contact_person?: string;
  contact_info?: string;
  rating?: string;
  supplier_type?: string;
}

export interface WorkflowStageData {
  assignees: Record<string, string>;
  completed_steps: string[];
  meta: Record<string, string>;
  notes: string;
  steps_data: Record<string, any>;
}

export interface StageInfo {
  key: string;
  label: string;
  color: string;
  bg: string;
  icon?: string;
}

// ── Context value ────────────────────────────────────────────────────────────

export interface WorkflowStepCtx {
  leadId: string;
  tenant: string;
  myId: string;
  activeStage: number;
  stage: StageInfo;
  isDone: boolean;
  /** Current stage data snapshot */
  sd: WorkflowStageData;
  users: SysUser[];
  suppliers: SupplierItem[];
  products: { id: string; name: string; sku: string; current_stock: number }[];
  uploadingFile: boolean;

  // State setters
  setSupplierSearch: (v: string) => void;
  setSupplierDropdownOpen: (v: boolean) => void;
  supplierSearch: string;
  supplierDropdownOpen: boolean;
  freightOnlyMode: boolean;
  setFreightOnlyMode: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Data access
  stageData: (idx: number) => WorkflowStageData;
  getStepData: <T = Record<string, any>>(stageIdx: number, key: string) => T;
  resolvedAssignees: (stageIdx: number) => Record<string, string>;
  userCanFillRole: (user: SysUser, roleKey: string) => boolean;
  isFreightSupplier: (supplier?: SupplierItem) => boolean;

  // Actions
  toggleStep: (stageIdx: number, stepKey: string) => void;
  patchStepData: (stageIdx: number, key: string, patch: Record<string, any>) => void;
  completeStep: (stageIdx: number, key: string) => void;
  setMeta: (stageIdx: number, fieldKey: string, value: string) => void;
  handleFileUpload: (stageIdx: number, stepKey: string, file: File) => Promise<void>;
  save: (next: any, immediate?: boolean) => void;
  buildNext: (stageIdx: number, stagePatch: Partial<WorkflowStageData>) => any;

  // Business actions
  actionClassifySave: (stageIdx: number) => void;
  actionSubmitToSC: (stageIdx: number) => void;
  submitPriceInquiryWithSupplier: (stageIdx: number, supplier: SupplierItem) => void;
  actionConfirmSCResult: (stageIdx: number) => void;
  actionSubmitApproval: (stageIdx: number, stepKey: string, content: string, approverId: string) => void;
  actionApproverConfirm: (stageIdx: number, stepKey: string) => void;
  actionSalespersonSaveDetails: (stageIdx: number) => void;
  actionClerkSaveDetails: (stageIdx: number) => void;
  actionEmailSent: (stageIdx: number) => void;
  handleDraftContractUpload: (stageIdx: number, file: File) => Promise<void>;
  actionSupervisorSignContract: (stageIdx: number) => Promise<void>;
  handleSignContractUpload: (stageIdx: number, file: File) => Promise<void>;
  handlePaymentProofUpload: (stageIdx: number, file: File) => Promise<void>;
  actionApproveProcurementCheck: (stageIdx: number, approverKey: 'supervisor' | 'manager' | 'risk') => void;
  actionApprovePayDeposit: (stageIdx: number, who: 'salesperson' | 'supervisor' | 'purchasing_manager' | 'sales_manager') => void;
  actionUploadDepositReceipt: (stageIdx: number, file: File) => Promise<void>;
  actionConfirmSupplier: (stageIdx: number) => void;
  actionSignPurchase: (stageIdx: number) => Promise<void>;
  handlePurchaseContractUpload: (stageIdx: number, file: File) => Promise<void>;
  handleBookingFileUpload: (stageIdx: number, fileField: 'draft_files' | 'signed_files' | 'booking_form_files', file: File) => Promise<void>;
  actionApproveRiskBooking: (stageIdx: number, role: 'supervisor' | 'manager' | 'risk_manager') => void;
  handlePackingFileUpload: (stageIdx: number, fileField: 'cargo_files' | 'packing_files' | 'vat_files', file: File) => Promise<void>;

  // Refresh
  refreshWorkflow: () => Promise<void>;
  refreshing: boolean;

  // Upload state setter (for custom upload flows like procurement_check)
  setUploadingFile: (v: boolean) => void;

  // Utility functions
  userIsFinance: (user: SysUser) => boolean;
  resolveUserName: (userId?: string) => string;
  actionInventoryAdjust: (stageIdx: number, stepKey: 'warehouse_entry' | 'godad_billing', productId: string, qty: number, movementType: string) => Promise<void>;

  // Translation
  tw: (key: string, params?: Record<string, any>) => string;

  // Render helpers
  renderUploadMeta: (uploadedBy?: string, uploadedAt?: string) => React.ReactNode;
}

const WorkflowStepContext = createContext<WorkflowStepCtx | null>(null);

export const WorkflowStepProvider = WorkflowStepContext.Provider;

export function useWorkflowStep(): WorkflowStepCtx {
  const ctx = useContext(WorkflowStepContext);
  if (!ctx) throw new Error('useWorkflowStep must be used within WorkflowStepProvider');
  return ctx;
}
