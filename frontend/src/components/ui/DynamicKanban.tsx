'use client';

import { useMemo, useState, useRef, useCallback } from 'react';

/**
 * DynamicKanban — kanban/board view driven by module_definition.
 *
 * Groups records by a status/select field and renders columns.
 * Supports drag-and-drop between columns to change record status.
 */

export interface FieldDef {
  fieldname: string;
  fieldtype: string;
  label: string;
  options?: string;
  reqd?: boolean;
  in_list_view?: boolean;
}

export interface DynamicKanbanProps {
  fields: FieldDef[];
  data: any[];
  statusField: string;
  statusOptions: string[];
  statusColors?: Record<string, { bg: string; color: string }>;
  linkNames?: Record<string, Record<string, string>>;
  titleField?: string;
  onCardClick?: (row: any) => void;
  onCreate?: (status?: string) => void;
  onStatusChange?: (recordId: string, newStatus: string) => Promise<void>;
}

const DEFAULT_COLORS: Record<string, { bg: string; color: string; colBg: string }> = {
  active: { bg: '#dcfce7', color: '#15803d', colBg: '#f0fdf4' },
  approved: { bg: '#dcfce7', color: '#15803d', colBg: '#f0fdf4' },
  paid: { bg: '#dcfce7', color: '#15803d', colBg: '#f0fdf4' },
  posted: { bg: '#dcfce7', color: '#15803d', colBg: '#f0fdf4' },
  converted: { bg: '#dcfce7', color: '#15803d', colBg: '#f0fdf4' },
  completed: { bg: '#dcfce7', color: '#15803d', colBg: '#f0fdf4' },
  qualified: { bg: '#dbeafe', color: '#1d4ed8', colBg: '#eff6ff' },
  sent: { bg: '#dbeafe', color: '#1d4ed8', colBg: '#eff6ff' },
  replied: { bg: '#dbeafe', color: '#1d4ed8', colBg: '#eff6ff' },
  pending: { bg: '#fef9c3', color: '#a16207', colBg: '#fefce8' },
  quoted: { bg: '#fef9c3', color: '#a16207', colBg: '#fefce8' },
  partial: { bg: '#ffedd5', color: '#c2410c', colBg: '#fff7ed' },
  negotiating: { bg: '#ffedd5', color: '#c2410c', colBg: '#fff7ed' },
  overdue: { bg: '#fee2e2', color: '#dc2626', colBg: '#fef2f2' },
  lost: { bg: '#fee2e2', color: '#dc2626', colBg: '#fef2f2' },
  rejected: { bg: '#fee2e2', color: '#dc2626', colBg: '#fef2f2' },
  cancelled: { bg: '#fee2e2', color: '#dc2626', colBg: '#fef2f2' },
  draft: { bg: '#f3f4f6', color: '#6b7280', colBg: '#f9fafb' },
  cold: { bg: '#f3f4f6', color: '#6b7280', colBg: '#f9fafb' },
  inquiry: { bg: '#ede9fe', color: '#7c3aed', colBg: '#faf5ff' },
  procuring: { bg: '#ede9fe', color: '#7c3aed', colBg: '#faf5ff' },
  booking: { bg: '#cffafe', color: '#0891b2', colBg: '#ecfeff' },
  fulfillment: { bg: '#ccfbf1', color: '#0d9488', colBg: '#f0fdfa' },
  payment: { bg: '#fef3c7', color: '#d97706', colBg: '#fffbeb' },
};

const FALLBACK = { bg: '#f3f4f6', color: '#6b7280', colBg: '#f9fafb' };

export default function DynamicKanban({
  fields, data, statusField, statusOptions, statusColors, linkNames, titleField, onCardClick, onCreate, onStatusChange,
}: DynamicKanbanProps) {
  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  // Group data by status
  const columns = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const opt of statusOptions) groups[opt] = [];
    for (const row of data) {
      const st = row[statusField] || '';
      if (!groups[st]) groups[st] = [];
      groups[st].push(row);
    }
    return statusOptions.map(opt => ({
      status: opt,
      records: groups[opt] || [],
    }));
  }, [data, statusField, statusOptions]);

  // Determine which fields to show on cards (in_list_view, up to 4)
  const cardFields = useMemo(() =>
    fields.filter(f =>
      f.in_list_view &&
      f.fieldname !== statusField &&
      f.fieldname !== titleField &&
      !['Section Break', 'Column Break', 'Tab Break'].includes(f.fieldtype)
    ).slice(0, 4),
    [fields, statusField, titleField]
  );

  const getTitle = (row: any) => {
    if (titleField && row[titleField]) return row[titleField];
    const firstData = fields.find(f => f.fieldtype === 'Data' && f.in_list_view);
    return firstData ? row[firstData.fieldname] || 'Untitled' : row.id?.slice(0, 8) || 'Untitled';
  };

  const getColors = (status: string) => {
    if (statusColors?.[status]) {
      const sc = statusColors[status];
      return { ...sc, colBg: sc.bg + '33' };
    }
    return DEFAULT_COLORS[status] || FALLBACK;
  };

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, row: any) => {
    setDragId(row.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.id);
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDragId(null);
    setDropTarget(null);
    dragCounter.current = {};
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    dragCounter.current[status] = (dragCounter.current[status] || 0) + 1;
    setDropTarget(status);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    dragCounter.current[status] = (dragCounter.current[status] || 0) - 1;
    if (dragCounter.current[status] <= 0) {
      dragCounter.current[status] = 0;
      if (dropTarget === status) setDropTarget(null);
    }
  }, [dropTarget]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDropTarget(null);
    dragCounter.current = {};
    const recordId = e.dataTransfer.getData('text/plain');
    if (!recordId || !onStatusChange) return;

    // Find the record's current status
    const record = data.find(r => r.id === recordId);
    if (!record || record[statusField] === targetStatus) return;

    setUpdating(recordId);
    try {
      await onStatusChange(recordId, targetStatus);
    } finally {
      setUpdating(null);
      setDragId(null);
    }
  }, [data, statusField, onStatusChange]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
      {columns.map(col => {
        const colors = getColors(col.status);
        const isDropping = dropTarget === col.status && dragId !== null;
        return (
          <div key={col.status}
            className="flex-shrink-0 w-72 flex flex-col rounded-xl transition-all"
            style={{
              background: isDropping ? colors.bg + '40' : colors.colBg,
              border: isDropping ? `2px dashed ${colors.color}` : '1px solid var(--notion-border)',
              transform: isDropping ? 'scale(1.01)' : 'scale(1)',
            }}
            onDragEnter={e => handleDragEnter(e, col.status)}
            onDragLeave={e => handleDragLeave(e, col.status)}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, col.status)}>
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5"
              style={{ borderBottom: '1px solid var(--notion-border)' }}>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: colors.bg, color: colors.color }}>
                  {col.status}
                </span>
                <span className="text-xs font-medium" style={{ color: '#9B9A97' }}>{col.records.length}</span>
              </div>
              {onCreate && (
                <button onClick={() => onCreate(col.status)}
                  className="p-1 rounded transition-colors"
                  style={{ color: '#9B9A97' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ maxHeight: 600 }}>
              {col.records.map(row => {
                const isDragging = dragId === row.id;
                const isUpdating = updating === row.id;
                return (
                  <div key={row.id}
                    draggable={!!onStatusChange && !isUpdating}
                    onDragStart={e => handleDragStart(e, row)}
                    onDragEnd={handleDragEnd}
                    className="rounded-lg p-3 cursor-pointer transition-all group"
                    style={{
                      background: isUpdating ? colors.bg + '20' : 'var(--notion-card, white)',
                      border: '1px solid var(--notion-border)',
                      opacity: isDragging ? 0.4 : 1,
                      cursor: onStatusChange ? 'grab' : 'pointer',
                    }}
                    onClick={() => !isDragging && onCardClick?.(row)}
                    onMouseEnter={e => { if (!isDragging) { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = colors.color; } }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}>
                    {isUpdating && (
                      <div className="flex items-center gap-1 mb-1">
                        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.color} strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <span className="text-[10px]" style={{ color: colors.color }}>更新中...</span>
                      </div>
                    )}
                    <p className="text-sm font-medium truncate mb-1" style={{ color: 'var(--notion-text)' }}>
                      {getTitle(row)}
                    </p>
                    {cardFields.map(f => {
                      const val = row[f.fieldname];
                      if (val == null || val === '') return null;
                      const displayVal = f.fieldtype === 'Link' && f.options
                        ? (linkNames?.[f.options]?.[val] || String(val).slice(0, 8) + '…')
                        : f.fieldtype === 'Currency'
                          ? Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
                          : f.fieldtype === 'Date' && val
                            ? new Date(val).toLocaleDateString('zh-CN')
                            : String(val);
                      return (
                        <div key={f.fieldname} className="flex items-center justify-between text-[11px] mt-0.5">
                          <span style={{ color: '#9B9A97' }}>{f.label}</span>
                          <span className="font-medium truncate ml-2"
                            style={{ color: f.fieldtype === 'Link' ? '#7c3aed' : 'var(--notion-text-muted)', maxWidth: 120 }}>
                            {displayVal}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {col.records.length === 0 && (
                <div className="text-center py-8 text-xs" style={{ color: '#9B9A97' }}>
                  {isDropping ? (
                    <span style={{ color: colors.color, fontWeight: 500 }}>拖放到此处</span>
                  ) : '暂无'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
