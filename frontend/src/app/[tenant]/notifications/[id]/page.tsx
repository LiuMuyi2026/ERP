'use client';

import { useState, useEffect } from 'react';
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
  sender_id?: string;
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

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NotificationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const notifId = params.id as string;

  const [notif, setNotif] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(`/api/notifications/${notifId}`);
        setNotif(data);
        // Auto mark as read
        if (!data.is_read) {
          await api.patch(`/api/notifications/${notifId}/read`, {});
        }
      } catch {
        setError('通知不存在或已被删除');
      } finally {
        setLoading(false);
      }
    })();
  }, [notifId]);

  async function handleDelete() {
    if (!notif) return;
    await api.delete(`/api/notifications/${notif.id}`);
    router.push(`/${tenant}/notifications`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm" style={{ color: 'var(--notion-text-secondary)' }}>加载中...</span>
      </div>
    );
  }

  if (error || !notif) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center py-16">
          <div className="text-sm mb-4" style={{ color: 'var(--notion-text-secondary)' }}>{error || '通知未找到'}</div>
          <button
            onClick={() => router.push(`/${tenant}/notifications`)}
            className="text-sm px-4 py-2 rounded-lg"
            style={{ color: 'var(--notion-accent)', background: 'var(--notion-accent-bg)' }}
          >
            返回通知列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Back + Actions */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/${tenant}/notifications`)}
          className="flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 transition-colors"
          style={{ color: 'var(--notion-text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 transition-colors"
          style={{ color: 'var(--notion-danger, #EB5757)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          删除
        </button>
      </div>

      {/* Card */}
      <div className="rounded-xl p-6" style={{ background: 'var(--notion-card, var(--notion-bg-secondary))', border: '1px solid var(--notion-border)' }}>
        {/* Type badge + time */}
        <div className="flex items-center gap-2 mb-4">
          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ background: 'var(--notion-accent-bg)', color: 'var(--notion-accent)' }}>
            <HandIcon name={TYPE_ICONS[notif.type] ?? 'bell'} size={12} />
            {TYPE_LABELS[notif.type] || notif.type}
          </span>
          <span className="text-xs" style={{ color: 'var(--notion-text-tertiary)' }}>
            {formatTime(notif.created_at)}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-lg font-semibold mb-3" style={{ color: 'var(--notion-text)' }}>
          {notif.title}
        </h1>

        {/* Body */}
        {notif.body && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--notion-text-secondary)' }}>
            {notif.body}
          </div>
        )}

        {/* Link */}
        {notif.link && (
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--notion-border)' }}>
            <a
              href={notif.link}
              className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors"
              style={{ background: 'var(--notion-accent)', color: '#fff' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              查看详情
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
