'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import { usePageVisibility } from '@/hooks/usePageVisibility';

interface Notification {
  id: string;
  title: string;
  body?: string;
  type: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  system:  'bell',
  hr:      'necktie',
  crm:     'people-group',
  task:    'checkmark',
  finance: 'money-bag',
  alert:   'warning',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

export default function NotificationBell({ label }: { label?: string }) {
  const [open, setOpen]             = useState(false);
  const [notifications, setNotifs]  = useState<Notification[]>([]);
  const [unreadCount, setUnread]    = useState(0);
  const [loading, setLoading]       = useState(false);
  const panelRef                    = useRef<HTMLDivElement>(null);
  const isVisible                   = usePageVisibility();
  const router                      = useRouter();
  const params                      = useParams();
  const tenant                      = params.tenant as string;

  const fetchNotifs = useCallback(async () => {
    try {
      const data = await api.get('/api/notifications?limit=30');
      setNotifs(data.notifications ?? []);
      setUnread(data.unread_count ?? 0);
    } catch { /* ignore */ }
  }, []);

  // Poll unread count every 30 s — pause when tab is hidden
  useEffect(() => {
    if (!isVisible) return;
    const controller = new AbortController();
    fetchNotifs();
    const id = setInterval(async () => {
      if (controller.signal.aborted) return;
      try {
        const data = await api.get('/api/notifications/unread-count');
        if (!controller.signal.aborted) setUnread(data.count ?? 0);
      } catch { /* ignore */ }
    }, 30_000);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [fetchNotifs, isVisible]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await fetchNotifs();
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    await api.patch(`/api/notifications/${id}/read`, {});
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    await api.patch('/api/notifications/read-all', {});
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  }

  async function deleteNotif(id: string) {
    const wasUnread = notifications.find(n => n.id === id)?.is_read === false;
    await api.delete(`/api/notifications/${id}`);
    setNotifs(prev => prev.filter(n => n.id !== id));
    if (wasUnread) setUnread(prev => Math.max(0, prev - 1));
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button — full-width row when label provided */}
      <button
        onClick={toggleOpen}
        className={label
          ? "flex items-center gap-2.5 w-full rounded-lg cursor-pointer"
          : "w-7 h-7 flex items-center justify-center rounded-md relative cursor-pointer"
        }
        style={label
          ? { height: 30, padding: '0 12px', color: 'var(--sb-text-secondary)' }
          : { color: 'var(--sb-text-muted)' }
        }
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; if (!label) e.currentTarget.style.color = 'var(--sb-text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = label ? 'var(--sb-text-secondary)' : 'var(--sb-text-muted)'; }}
        title={label || '通知'}
      >
        <span style={{ display: 'flex', flexShrink: 0, color: 'var(--sb-text-muted)', position: 'relative' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span
              className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-white font-bold"
              style={{ fontSize: 9, background: '#EB5757', padding: '0 3px' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {label && (
          <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--sb-text)', userSelect: 'none' }}>{label}</span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 w-[360px] rounded-xl overflow-hidden"
          style={{ zIndex: 200, background: 'var(--sb-surface)', border: '1px solid var(--sb-border)', boxShadow: 'var(--sb-shadow)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--sb-divider)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--sb-text)' }}>
              {label || '通知'}
              {unreadCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold" style={{ background: '#EB5757' }}>
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] px-2 py-1 rounded-md transition-colors"
                style={{ color: 'var(--sb-accent)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-accent-subtle)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                全部已读
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--sb-text-muted)' }}>加载中...</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mb-2"><HandIcon name="bell" size={16} /></div>
                <div className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>暂无通知</div>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 relative group cursor-pointer"
                  style={{
                    background: n.is_read ? 'transparent' : 'var(--sb-accent-subtle)',
                    borderBottom: '1px solid var(--sb-divider)',
                  }}
                  onClick={() => { if (!n.is_read) markRead(n.id); setOpen(false); router.push(`/${tenant}/notifications/${n.id}`); }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.is_read ? 'transparent' : 'var(--sb-accent-subtle)'; }}
                >
                  {/* Unread dot */}
                  {!n.is_read && (
                    <span className="absolute left-1.5 top-4 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--sb-accent)' }} />
                  )}

                  {/* Icon */}
                  <span className="flex-shrink-0 mt-0.5"><HandIcon name={TYPE_ICONS[n.type] ?? 'bell'} size={16} /></span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-snug" style={{ color: 'var(--sb-text)' }}>{n.title}</div>
                    {n.body && (
                      <div className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--sb-text-muted)' }}>{n.body}</div>
                    )}
                    <div className="text-[10px] mt-1" style={{ color: 'var(--sb-text-faint)' }}>{timeAgo(n.created_at)}</div>
                  </div>

                  {/* Actions on hover */}
                  <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                    {!n.is_read && (
                      <button
                        onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        className="p-1 rounded"
                        style={{ color: 'var(--sb-text-muted)' }}
                        title="标为已读"
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--sb-accent)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); deleteNotif(n.id); }}
                      className="p-1 rounded"
                      style={{ color: 'var(--sb-text-muted)' }}
                      title="删除"
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--sb-danger)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 text-center" style={{ borderTop: '1px solid var(--sb-divider)' }}>
            <button
              onClick={() => { setOpen(false); router.push(`/${tenant}/notifications`); }}
              className="text-[11px] transition-colors"
              style={{ color: 'var(--sb-accent)' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.7'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              查看全部通知
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
