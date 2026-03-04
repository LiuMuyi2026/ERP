'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';

interface EmailComposerProps {
  replyTo?: {
    id: string;
    from_email: string;
    from_name?: string;
    subject?: string;
    body_text?: string;
    thread_id?: string;
  } | null;
  defaultTo?: string;
  defaultSubject?: string;
  leadId?: string;
  accountId?: string;
  onSent?: () => void;
  onCancel?: () => void;
}

export default function EmailComposer({
  replyTo, defaultTo, defaultSubject, leadId, accountId, onSent, onCancel,
}: EmailComposerProps) {
  const t = useTranslations('msgCenter');
  const [to, setTo] = useState(replyTo?.from_email || defaultTo || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject?.replace(/^Re:\s*/i, '')}` : (defaultSubject || '')
  );
  const [bodyText, setBodyText] = useState(
    replyTo ? `\n\n---\nOn ${new Date().toLocaleDateString()}, ${replyTo.from_name || replyTo.from_email} wrote:\n> ${(replyTo.body_text || '').split('\n').join('\n> ')}` : ''
  );
  const [showCc, setShowCc] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!to.trim() || !subject.trim()) {
      toast.error('To and Subject are required');
      return;
    }
    setSending(true);
    try {
      await api.post('/api/email/send', {
        to_email: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim(),
        body_text: bodyText,
        body_html: undefined,
        in_reply_to_id: replyTo?.id || undefined,
        lead_id: leadId || undefined,
        account_id: accountId || undefined,
      });
      toast.success(t('emailSentSuccess') || 'Email sent');
      onSent?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb' }}>
        <h3 className="text-sm font-semibold" style={{ color: '#3b4a54' }}>
          {replyTo ? (t('emailReply') || 'Reply') : (t('emailCompose') || 'Compose')}
        </h3>
        {onCancel && (
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Fields */}
      <div className="flex-shrink-0 space-y-2 p-4" style={{ borderBottom: '1px solid #f3f4f6' }}>
        <div className="flex items-center gap-2">
          <label className="text-xs w-12 text-right flex-shrink-0" style={{ color: '#8696a0' }}>
            {t('emailTo') || 'To'}
          </label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 text-sm border rounded px-2 py-1.5 outline-none focus:border-blue-400"
            style={{ borderColor: '#e5e7eb' }}
            placeholder="recipient@example.com"
          />
          {!showCc && (
            <button onClick={() => setShowCc(true)} className="text-xs px-2 py-1 rounded hover:bg-gray-100"
              style={{ color: '#8696a0' }}>Cc/Bcc</button>
          )}
        </div>

        {showCc && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs w-12 text-right flex-shrink-0" style={{ color: '#8696a0' }}>
                {t('emailCc') || 'Cc'}
              </label>
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)}
                className="flex-1 text-sm border rounded px-2 py-1.5 outline-none focus:border-blue-400"
                style={{ borderColor: '#e5e7eb' }} placeholder="cc@example.com" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs w-12 text-right flex-shrink-0" style={{ color: '#8696a0' }}>Bcc</label>
              <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)}
                className="flex-1 text-sm border rounded px-2 py-1.5 outline-none focus:border-blue-400"
                style={{ borderColor: '#e5e7eb' }} placeholder="bcc@example.com" />
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <label className="text-xs w-12 text-right flex-shrink-0" style={{ color: '#8696a0' }}>
            {t('emailSubject') || 'Subject'}
          </label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
            className="flex-1 text-sm border rounded px-2 py-1.5 outline-none focus:border-blue-400"
            style={{ borderColor: '#e5e7eb' }} placeholder="Subject" />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 overflow-auto">
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          className="w-full h-full min-h-[200px] text-sm outline-none resize-none"
          style={{ color: '#3b4a54' }}
          placeholder="Write your email..."
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #e5e7eb' }}>
        {onCancel && (
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: '#e5e7eb', color: '#667781' }}>
            Cancel
          </button>
        )}
        <button onClick={handleSend} disabled={sending || !to.trim() || !subject.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: '#3b82f6' }}>
          {sending ? '...' : (t('emailSend') || 'Send')}
        </button>
      </div>
    </div>
  );
}
