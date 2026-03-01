'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';

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

const TYPE_LABELS: Record<string, string> = {
  system:  '系统通知',
  hr:      '人事通知',
  crm:     '客户通知',
  task:    '任务通知',
  finance: '财务通知',
  alert:   '预警通知',
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

export default function NotificationsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;

  const [notifications, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifs = useCallback(async () => {
    try {
      const q = filter === 'unread' ? '?unread_only=true&limit=100' : '?limit=100';
      const data = await api.get(`/api/notifications${q}`);
      setNotifs(data.notifications ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { setLoading(true); fetchNotifs(); }, [fetchNotifs]);

  async function markAllRead() {
    await api.patch('/api/notifications/read-all', {});
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function deleteNotif(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await api.delete(`/api/notifications/${id}`);
    setNotifs(prev => prev.filter(n => n.id !== id));
  }

  function goToDetail(n: Notification) {
    router.push(`/${tenant}/notifications/${n.id}`);
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>
          通知
          {unreadCount > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full text-white font-bold" style={{ background: '#EB5757' }}>
              {unreadCount}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--notion-accent)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-accent-bg)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              全部已读
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: 'var(--notion-bg-secondary)' }}>
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-1 text-xs py-1.5 rounded-md transition-colors font-medium"
            style={{
              background: filter === f ? 'var(--notion-card, var(--notion-bg))' : 'transparent',
              color: filter === f ? 'var(--notion-text)' : 'var(--notion-text-secondary)',
              boxShadow: filter === f ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {f === 'all' ? '全部' : '未读'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
        {loading ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--notion-text-secondary)' }}>加载中...</div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mb-2"><HandIcon name="bell" size={20} /></div>
            <div className="text-sm" style={{ color: 'var(--notion-text-secondary)' }}>
              {filter === 'unread' ? '没有未读通知' : '暂无通知'}
            </div>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className="flex items-start gap-3 px-5 py-4 relative group cursor-pointer transition-colors"
              style={{
                background: n.is_read ? 'transparent' : 'var(--notion-accent-bg)',
                borderBottom: '1px solid var(--notion-border)',
              }}
              onClick={() => goToDetail(n)}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = n.is_read ? 'transparent' : 'var(--notion-accent-bg)'; }}
            >
              {/* Unread dot */}
              {!n.is_read && (
                <span className="absolute left-1.5 top-5 w-2 h-2 rounded-full" style={{ background: 'var(--notion-accent)' }} />
              )}

              {/* Icon */}
              <span className="flex-shrink-0 mt-0.5">
                <HandIcon name={TYPE_ICONS[n.type] ?? 'bell'} size={16} />
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{n.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--notion-bg-secondary)', color: 'var(--notion-text-tertiary)' }}>
                    {TYPE_LABELS[n.type] || n.type}
                  </span>
                </div>
                {n.body && (
                  <div className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--notion-text-secondary)' }}>{n.body}</div>
                )}
                <div className="text-[10px] mt-1" style={{ color: 'var(--notion-text-tertiary)' }}>{timeAgo(n.created_at)}</div>
              </div>

              {/* Delete on hover */}
              <div className="hidden group-hover:flex items-center flex-shrink-0">
                <button
                  onClick={e => deleteNotif(e, n.id)}
                  className="p-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--notion-text-secondary)' }}
                  title="删除"
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--notion-danger, #EB5757)'; e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--notion-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
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
    </div>
  );
}
