'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

type Alert = {
  module: string;
  type: string;
  priority: string;
  title: string;
  detail: string;
  record_id: string;
};

const TYPE_ICONS: Record<string, string> = {
  low_stock: '📦',
  zero_stock: '🚫',
  overdue_po: '🚚',
  overdue_task: '⏰',
  pending_approval: '✋',
  overdue_receivable: '💸',
  large_outstanding: '💰',
};

const PRIORITY_STYLES: Record<string, { bg: string; border: string; dot: string }> = {
  high: { bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
  medium: { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
  low: { bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
};

export default function AnomalyAlertBar({
  module,
  onAlertClick,
}: {
  module: 'inventory' | 'orders' | 'accounting';
  onAlertClick?: (alert: Alert) => void;
}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get(`/api/ai/anomaly-alerts?module=${module}`);
      setAlerts(res.alerts || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const visibleAlerts = alerts.filter(a => !dismissed.has(`${a.type}-${a.record_id}`));
  const highAlerts = visibleAlerts.filter(a => a.priority === 'high');
  const otherAlerts = visibleAlerts.filter(a => a.priority !== 'high');

  if (loading || visibleAlerts.length === 0) return null;

  const dismiss = (a: Alert, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(prev => new Set(prev).add(`${a.type}-${a.record_id}`));
  };

  const renderAlert = (a: Alert, i: number) => {
    const ps = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.low;
    return (
      <div
        key={`${a.type}-${a.record_id}-${i}`}
        onClick={() => onAlertClick?.(a)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px 4px 8px',
          background: ps.bg,
          border: `1px solid ${ps.border}`,
          borderRadius: 8,
          cursor: onAlertClick ? 'pointer' : 'default',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ps.dot, flexShrink: 0 }} />
        <span>{TYPE_ICONS[a.type] || '⚠️'}</span>
        <span style={{ fontWeight: 600, color: '#37352f', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.title}
        </span>
        <span style={{ color: '#787774', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.detail}
        </span>
        <button
          onClick={(e) => dismiss(a, e)}
          style={{
            background: 'none', border: 'none', padding: '0 2px',
            fontSize: 14, color: '#999', cursor: 'pointer', lineHeight: 1,
          }}
          title="忽略"
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 12 }}>
      {/* High priority alerts in a highlighted bar */}
      {highAlerts.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 10,
          marginBottom: otherAlerts.length > 0 ? 6 : 0,
          overflowX: 'auto',
          flexWrap: 'nowrap',
        }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', flexShrink: 0 }}>
            {highAlerts.length}项紧急
          </span>
          <div style={{ display: 'flex', gap: 6, overflow: 'auto', flexWrap: 'nowrap' }}>
            {highAlerts.slice(0, 5).map(renderAlert)}
          </div>
          {highAlerts.length > 5 && (
            <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>+{highAlerts.length - 5}</span>
          )}
        </div>
      )}

      {/* Other alerts */}
      {otherAlerts.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          overflowX: 'auto',
          flexWrap: 'nowrap',
        }}>
          <span style={{ fontSize: 11, color: '#787774', flexShrink: 0 }}>提醒:</span>
          {otherAlerts.slice(0, 8).map(renderAlert)}
          {otherAlerts.length > 8 && (
            <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>+{otherAlerts.length - 8}</span>
          )}
        </div>
      )}
    </div>
  );
}
