'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineStage {
  key: string;
  label?: string;
  labelKey?: string;
  icon?: string;
  color?: string;
  bg?: string;
}

export interface StatusValue {
  key: string;
  label?: string;
  color?: string;
  stage?: string | null;
}

export interface OperationTask {
  code: string;
  title: string;
  owner_role: string;
  requires_attachment: boolean;
}

export interface FileCategory {
  key: string;
  label?: string;
  color?: string;
}

export interface WorkflowStepDef {
  key: string;
  label: string;
  desc?: string;
  owner?: string;
  builtin?: boolean;
  enabled?: boolean;
  type?: string;
  fields?: { key: string; label: string; type?: string; options?: string[] }[];
  checklist_items?: { key: string; label: string }[];
  file_category?: string;
  approver_role?: string;
}

export interface WorkflowStageDef {
  key: string;
  label: string;
  icon?: string;
  color?: string;
  bg?: string;
  roles?: { key: string; label: string }[];
  steps: WorkflowStepDef[];
}

export interface PipelineConfig {
  pipeline: { stages: PipelineStage[] };
  statuses: {
    values: StatusValue[];
    status_to_stage: Record<string, string>;
    rank: string[];
  };
  operation_tasks: OperationTask[];
  approval_rules: any[];
  file_categories: FileCategory[];
  role_mappings: Record<string, string>;
  workflow_stages: WorkflowStageDef[];
}

// ---------------------------------------------------------------------------
// Hardcoded fallback (mirrors backend DEFAULT_PIPELINE_DEFINITION)
// ---------------------------------------------------------------------------

export const FALLBACK_CONFIG: PipelineConfig = {
  pipeline: {
    stages: [
      { key: 'sales', labelKey: 'stageSales', icon: 'briefcase', color: '#7c3aed', bg: '#f5f3ff' },
      { key: 'contract', labelKey: 'stageContract', icon: 'document-pen', color: '#0284c7', bg: '#e0f2fe' },
      { key: 'procurement', labelKey: 'stageProcurement', icon: 'factory', color: '#c2410c', bg: '#fff7ed' },
      { key: 'booking', labelKey: 'stageBooking', icon: 'ship', color: '#15803d', bg: '#f0fdf4' },
      { key: 'shipping', labelKey: 'stageShipping', icon: 'package', color: '#d97706', bg: '#fffbeb' },
      { key: 'collection', labelKey: 'stageCollection', icon: 'money-bag', color: '#059669', bg: '#d1fae5' },
    ],
  },
  statuses: {
    values: [
      { key: 'inquiry', label: '询盘', color: 'bg-indigo-100 text-indigo-700', stage: 'sales' },
      { key: 'new', label: '新线索', color: 'bg-indigo-100 text-indigo-700', stage: 'sales' },
      { key: 'replied', label: '已回复', color: 'bg-teal-100 text-teal-700', stage: 'sales' },
      { key: 'engaged', label: '已互动', color: 'bg-teal-100 text-teal-700', stage: 'sales' },
      { key: 'qualified', label: '已验证', color: 'bg-purple-100 text-purple-700', stage: 'sales' },
      { key: 'contacted', label: '已联系', color: 'bg-teal-100 text-teal-700', stage: 'sales' },
      { key: 'quoted', label: '已报价', color: 'bg-sky-100 text-sky-700', stage: 'contract' },
      { key: 'negotiating', label: '谈判中', color: 'bg-blue-100 text-blue-700', stage: 'contract' },
      { key: 'procuring', label: '采购中', color: 'bg-orange-100 text-orange-700', stage: 'procurement' },
      { key: 'booking', label: '订舱中', color: 'bg-green-100 text-green-700', stage: 'booking' },
      { key: 'fulfillment', label: '履约中', color: 'bg-amber-100 text-amber-700', stage: 'shipping' },
      { key: 'payment', label: '收款中', color: 'bg-emerald-100 text-emerald-700', stage: 'collection' },
      { key: 'converted', label: '已成交', color: 'bg-green-100 text-green-800', stage: 'collection' },
      { key: 'cold', label: '冷线索', color: 'bg-gray-100 text-gray-500', stage: null },
      { key: 'lost', label: '已流失', color: 'bg-gray-100 text-gray-500', stage: null },
    ],
    status_to_stage: {
      inquiry: 'sales', new: 'sales', replied: 'sales',
      engaged: 'sales', qualified: 'sales', contacted: 'sales',
      quoted: 'contract', negotiating: 'contract',
      procuring: 'procurement',
      booking: 'booking',
      fulfillment: 'shipping',
      payment: 'collection', converted: 'collection',
    },
    rank: ['new', 'inquiry', 'quoted', 'negotiating', 'fulfillment', 'won'],
  },
  operation_tasks: [],
  approval_rules: [],
  file_categories: [
    { key: 'contract', label: '合同', color: 'bg-blue-100 text-blue-700' },
    { key: 'quotation', label: '报价单', color: 'bg-purple-100 text-purple-700' },
    { key: 'inspection', label: '验货', color: 'bg-orange-100 text-orange-700' },
    { key: 'shipping', label: '物流', color: 'bg-green-100 text-green-700' },
    { key: 'invoice', label: '发票', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'correspondence', label: '函件', color: 'bg-teal-100 text-teal-700' },
    { key: 'other', label: '其他', color: 'bg-gray-100 text-gray-600' },
  ],
  role_mappings: {},
  workflow_stages: [],
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const PipelineConfigContext = createContext<PipelineConfig>(FALLBACK_CONFIG);

// ---------------------------------------------------------------------------
// Hook — use this in components to read pipeline config
// ---------------------------------------------------------------------------

export function usePipelineConfig(): PipelineConfig {
  return useContext(PipelineConfigContext);
}

// ---------------------------------------------------------------------------
// Module-level cache so multiple components share the same fetch
// ---------------------------------------------------------------------------
let _cachedConfig: PipelineConfig | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Fetcher hook — call in a top-level layout/provider.
 * Returns { config, isLoading, error }.
 */
export function usePipelineConfigFetcher(tenantSlug?: string) {
  const [config, setConfig] = useState<PipelineConfig>(_cachedConfig ?? FALLBACK_CONFIG);
  const [isLoading, setIsLoading] = useState(!_cachedConfig);
  const [error, setError] = useState<Error | null>(null);
  const fetchedRef = useRef(false);

  const doFetch = useRef(() => {});
  doFetch.current = async () => {
    try {
      const data = await api.get('/api/pipeline-config');
      _cachedConfig = data;
      _cacheTime = Date.now();
      setConfig(data);
      setIsLoading(false);
    } catch (err: any) {
      setError(err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!tenantSlug) return;
    if (_cachedConfig && Date.now() - _cacheTime < CACHE_TTL) {
      setConfig(_cachedConfig);
      setIsLoading(false);
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    doFetch.current();
  }, [tenantSlug]);

  // Listen for config updates from settings page
  useEffect(() => {
    const handler = () => {
      _cachedConfig = null;
      _cacheTime = 0;
      fetchedRef.current = false;
      doFetch.current();
    };
    window.addEventListener('pipeline-config-updated', handler);
    return () => window.removeEventListener('pipeline-config-updated', handler);
  }, []);

  return { config, isLoading, error };
}

// ---------------------------------------------------------------------------
// Helper utilities derived from config
// ---------------------------------------------------------------------------

/** Build a status -> color lookup from config */
export function buildStatusColors(config: PipelineConfig): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const s of config.statuses.values) {
    if (s.color) colors[s.key] = s.color;
  }
  return colors;
}

/** Get the status_to_stage mapping */
export function buildStatusToStage(config: PipelineConfig): Record<string, string> {
  return config.statuses.status_to_stage;
}

/** Build file category color map */
export function buildFileCategoryColors(config: PipelineConfig): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const c of config.file_categories) {
    if (c.color) colors[c.key] = c.color;
  }
  return colors;
}

