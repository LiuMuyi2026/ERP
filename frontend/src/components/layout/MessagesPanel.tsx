'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';

interface UnreadCounts {
  internal: number;
  whatsapp: number;
  email: number;
}

export default function MessagesPanel({ label }: { label?: string }) {
  const t = useTranslations('messages');
  const isVisible = usePageVisibility();
  const router = useRouter();
  const params = useParams();
  const tenant = params?.tenant as string;

  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<UnreadCounts>({ internal: 0, whatsapp: 0, email: 0 });

  const loadCounts = useCallback(async () => {
    try {
      const [intData, emailData] = await Promise.all([
        api.get('/api/messages/unread-count').catch(() => ({ count: 0 })),
        api.get('/api/email/unread-count').catch(() => ({ count: 0 })),
      ]);
      // WhatsApp unread from dashboard
      let waCount = 0;
      try {
        const convs = await api.get('/api/whatsapp/dashboard');
        if (Array.isArray(convs)) waCount = convs.reduce((s: number, c: any) => s + (c.unread_count || 0), 0);
      } catch {}
      setCounts({
        internal: intData.count ?? 0,
        whatsapp: waCount,
        email: emailData.count ?? 0,
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    loadCounts();
    const id = setInterval(loadCounts, 30_000);
    return () => clearInterval(id);
  }, [isVisible, loadCounts]);

  const totalUnread = counts.internal + counts.whatsapp + counts.email;

  function goToMessages(tab?: string) {
    setOpen(false);
    const path = tab ? `/${tenant}/messages?tab=${tab}` : `/${tenant}/messages`;
    router.push(path);
  }

  // Closed state: just the icon button with badge
  if (!open) return (
    <button
      onClick={() => setOpen(true)}
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
      title={label || t('title')}
    >
      <span style={{ display: 'flex', flexShrink: 0, color: 'var(--sb-text-muted)', position: 'relative' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-white font-bold"
            style={{ fontSize: 9, background: '#7c3aed', padding: '0 3px' }}>
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </span>
      {label && (
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--sb-text)', userSelect: 'none' }}>{label}</span>
      )}
    </button>
  );

  // Open: quick preview dropdown
  return (
    <>
      <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} />

      <div
        className="fixed z-[160] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ bottom: 56, left: 252, width: 300, border: '1px solid var(--sb-border)', background: 'var(--sb-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--sb-divider)', background: 'var(--sb-bg)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--sb-text)' }}>
            {t('title')}
          </span>
          <button onClick={() => setOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded-md"
            style={{ color: 'var(--sb-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Channel rows */}
        <div className="py-2">
          {[
            { key: 'internal', label: t('tabInternal') || 'Internal', count: counts.internal, color: '#7c3aed',
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
            { key: 'whatsapp', label: 'WhatsApp', count: counts.whatsapp, color: '#25D366',
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.252-.149-2.868.852.852-2.868-.149-.252A7.963 7.963 0 014 12a8 8 0 1116 0 8 8 0 01-8 8z"/></svg> },
            { key: 'email', label: t('tabEmail') || 'Email', count: counts.email, color: '#3b82f6',
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> },
          ].map(ch => (
            <button key={ch.key} onClick={() => goToMessages(ch.key)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <span className="flex-shrink-0">{ch.icon}</span>
              <span className="flex-1 text-xs font-medium" style={{ color: 'var(--sb-text)' }}>{ch.label}</span>
              {ch.count > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                  style={{ background: ch.color, padding: '0 4px' }}>
                  {ch.count > 99 ? '99+' : ch.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* View all */}
        <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--sb-divider)' }}>
          <button onClick={() => goToMessages()}
            className="w-full text-center text-xs font-medium py-2 rounded-lg transition-colors"
            style={{ color: '#7c3aed' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            {t('viewAll') || 'View All Messages'} →
          </button>
        </div>
      </div>
    </>
  );
}
