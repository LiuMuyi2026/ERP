'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Reminder = {
  type: string;
  priority: string;
  title: string;
  detail: string;
  record_id: string;
  lead_id?: string;
  action: string;
  days_idle?: number;
  overdue?: boolean;
};

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  stale_lead: { icon: '📞', label: '待跟进', color: '#c2410c', bg: '#fff7ed' },
  unread_whatsapp: { icon: '💬', label: '未读消息', color: '#7c3aed', bg: '#f5f3ff' },
  receivable_due: { icon: '💰', label: '应收款', color: '#dc2626', bg: '#fef2f2' },
  stale_contract: { icon: '📝', label: '合同停滞', color: '#0369a1', bg: '#f0f9ff' },
};

const PRIORITY_DOT: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

export default function FollowUpReminders() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const res = await api.get('/api/ai/follow-up-reminders');
      setReminders(res.reminders || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const highCount = reminders.filter(r => r.priority === 'high').length;

  if (loading) return null;
  if (reminders.length === 0) return null;

  const handleClick = (r: Reminder) => {
    if (r.type === 'stale_lead' && r.record_id) {
      router.push(`/${tenant}/crm/customer-360/${r.record_id}`);
    } else if (r.type === 'unread_whatsapp') {
      router.push(`/${tenant}/messages`);
    } else if (r.type === 'receivable_due') {
      router.push(`/${tenant}/crm`);
    } else if (r.type === 'stale_contract') {
      router.push(`/${tenant}/crm`);
    }
  };

  return (
    <div style={{
      background: 'var(--notion-card, #fff)',
      border: '1px solid var(--notion-border, #e5e5e5)',
      borderRadius: 12,
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: highCount > 0 ? '#fef2f2' : 'transparent',
          border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--notion-border, #e5e5e5)',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>🔔</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text, #37352f)' }}>
            智能跟进提醒
          </span>
          {highCount > 0 && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              background: '#ef4444',
              borderRadius: 10,
              padding: '1px 7px',
              minWidth: 18,
              textAlign: 'center',
            }}>
              {highCount}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--notion-text-secondary, #787774)' }}>
            共{reminders.length}项
          </span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--notion-text-secondary, #999)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
          ▼
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {reminders.map((r, i) => {
            const cfg = TYPE_CONFIG[r.type] || TYPE_CONFIG.stale_lead;
            return (
              <div
                key={`${r.type}-${r.record_id}-${i}`}
                onClick={() => handleClick(r)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px',
                  borderBottom: i < reminders.length - 1 ? '1px solid var(--notion-border, #f0f0f0)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover, #f7f7f7)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: PRIORITY_DOT[r.priority] || '#999',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: 'var(--notion-text, #37352f)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.title}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 500,
                      color: cfg.color, background: cfg.bg,
                      padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--notion-text-secondary, #787774)',
                    marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.detail}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--notion-text-secondary, #999)', flexShrink: 0 }}>→</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
