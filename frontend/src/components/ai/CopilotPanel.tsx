'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { api } from '@/lib/api';

type Suggestion = {
  type: string;
  title: string;
  message: string;
  priority: string;
  action_type?: string;
  action_data?: any;
};

export default function CopilotPanel({ module, recordId }: { module?: string; recordId?: string }) {
  const params = useParams();
  const pathname = usePathname();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  const tenant = params.tenant as string;

  // Detect module from pathname if not provided
  const detectedModule = module || (() => {
    if (pathname.includes('/crm')) return 'crm';
    if (pathname.includes('/accounting')) return 'accounting';
    if (pathname.includes('/messages')) return 'whatsapp';
    if (pathname.includes('/inventory')) return 'inventory';
    if (pathname.includes('/hr')) return 'hr';
    return '';
  })();

  const fetchSuggestions = useCallback(async () => {
    if (!detectedModule) return;
    setLoading(true);
    try {
      const res = await api.post('/api/ai/copilot/suggestions', {
        module: detectedModule,
        record_id: recordId || null,
      });
      setSuggestions(res.suggestions || []);
      if (res.suggestions?.length > 0) setVisible(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [detectedModule, recordId]);

  useEffect(() => {
    if (detectedModule) {
      fetchSuggestions();
    }
  }, [detectedModule, recordId, fetchSuggestions]);

  if (!visible || suggestions.length === 0) return null;

  const priorityColors: Record<string, string> = {
    high: 'var(--notion-red, #e03e3e)',
    medium: 'var(--notion-yellow, #dfab01)',
    low: 'var(--notion-green, #0f7b6c)',
  };

  const typeIcons: Record<string, string> = {
    follow_up: '📞',
    risk_alert: '⚠️',
    opportunity: '💡',
    reminder: '🔔',
    insight: '📊',
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      width: collapsed ? 48 : 360,
      maxHeight: collapsed ? 48 : 480,
      background: 'var(--notion-bg-primary, #fff)',
      border: '1px solid var(--notion-border, #e5e5e5)',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      zIndex: 1000,
      overflow: 'hidden',
      transition: 'all 0.2s ease',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: collapsed ? '10px' : '12px 16px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {collapsed ? (
          <span style={{ fontSize: 20, margin: '0 auto' }}>AI</span>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>AI Copilot</span>
              <span style={{
                fontSize: 11,
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 10,
                padding: '2px 8px',
              }}>
                {suggestions.length}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={(e) => { e.stopPropagation(); fetchSuggestions(); }}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }}
              >
                {loading ? '...' : '↻'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setVisible(false); }}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ padding: '8px 0', maxHeight: 400, overflowY: 'auto' }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              style={{
                padding: '10px 16px',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--notion-border, #f0f0f0)' : 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--notion-bg-hover, #f7f7f7)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span>{typeIcons[s.type] || '💡'}</span>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--notion-text-primary, #37352f)',
                  flex: 1,
                }}>
                  {s.title}
                </span>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: priorityColors[s.priority] || priorityColors.medium,
                  flexShrink: 0,
                }} />
              </div>
              <p style={{
                fontSize: 12,
                color: 'var(--notion-text-secondary, #787774)',
                margin: 0,
                lineHeight: 1.5,
              }}>
                {s.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
