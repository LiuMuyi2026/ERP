'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLocale, useTranslations } from 'next-intl';
import DOMPurify from 'dompurify';
import { absTime } from './wa-helpers';

interface Email {
  id: string;
  direction: string;
  from_email: string;
  from_name?: string;
  to_email: string;
  to_name?: string;
  cc?: string;
  subject?: string;
  body_text?: string;
  body_html?: string;
  status?: string;
  sender_name?: string;
  lead_name?: string;
  lead_id?: string;
  thread_id?: string;
  sent_at?: string;
  received_at?: string;
  created_at?: string;
}

interface EmailReaderProps {
  email: Email;
  autoTranslateEnabled?: boolean;
  userTargetLanguage?: string;
  onReply?: () => void;
  onForward?: () => void;
  onLinkCustomer?: () => void;
  onViewThread?: () => void;
  onMarkRead?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onSetFollowUp?: () => void;
  onClearFollowUp?: () => void;
  canViewThread?: boolean;
  canMarkRead?: boolean;
  isArchived?: boolean;
  isFollowUpPending?: boolean;
  onBack?: () => void;
}

function normalizeLanguageCode(value?: string) {
  const v = (value || '').trim().toLowerCase().replace('_', '-');
  if (!v) return 'en';
  if (v.startsWith('zh')) return 'zh-CN';
  return v.split('-')[0];
}

function stripHtml(html?: string) {
  if (!html) return '';
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function EmailReader({
  email,
  autoTranslateEnabled = false,
  userTargetLanguage = 'en',
  onReply,
  onForward,
  onLinkCustomer,
  onViewThread,
  onMarkRead,
  onDelete,
  onArchive,
  onSetFollowUp,
  onClearFollowUp,
  canViewThread = false,
  canMarkRead = false,
  isArchived = false,
  isFollowUpPending = false,
  onBack,
}: EmailReaderProps) {
  const t = useTranslations('msgCenter');
  const locale = useLocale();
  const isZh = locale.toLowerCase().startsWith('zh');
  const timestamp = email.sent_at || email.received_at || email.created_at || '';
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [translating, setTranslating] = useState(false);

  const bodyPlain = email.body_text || stripHtml(email.body_html);

  useEffect(() => {
    if (!autoTranslateEnabled || !bodyPlain.trim()) {
      setTranslatedText('');
      setSourceLanguage('');
      return;
    }
    let cancelled = false;
    setTranslating(true);
    api.post('/api/whatsapp/ai/translate', {
      text: bodyPlain,
      target_language: normalizeLanguageCode(userTargetLanguage),
      mode: 'incoming',
    }).then((resp: any) => {
      if (cancelled) return;
      const translated = String(resp?.translated_text || '').trim();
      setTranslatedText(translated);
      setSourceLanguage(String(resp?.source_language || ''));
    }).catch(() => {
      if (cancelled) return;
      setTranslatedText('');
      setSourceLanguage('');
    }).finally(() => {
      if (!cancelled) setTranslating(false);
    });
    return () => { cancelled = true; };
  }, [email.id, autoTranslateEnabled, bodyPlain, userTargetLanguage]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'white' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4" style={{ borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
        <div className="flex items-center gap-2 mb-2">
          {onBack && (
            <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white mr-1" style={{ border: '1px solid #e5e7eb' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
          <h3 className="text-[17px] font-semibold flex-1 truncate" style={{ color: '#1f2937' }}>
            {email.subject || '(No Subject)'}
          </h3>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="text-xs space-y-1" style={{ color: '#64748b' }}>
            <div>
              <span className="font-medium" style={{ color: '#334155' }}>
                {email.from_name || email.sender_name || email.from_email}
              </span>
              {' '}&lt;{email.from_email}&gt;
            </div>
            <div>To: {email.to_name || email.to_email}</div>
            {email.cc && <div>Cc: {email.cc}</div>}
          </div>
          <div className="text-xs flex-shrink-0" style={{ color: '#8696a0' }}>
            {timestamp ? absTime(timestamp) : ''}
          </div>
        </div>
        {email.lead_name && (
          <div className="mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#e0e7ff', color: '#4338ca' }}>
              {email.lead_name}
            </span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          {isFollowUpPending && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#fffbeb', color: '#a16207' }}>
              {isZh ? '待跟进' : 'Need Follow-up'}
            </span>
          )}
          {isArchived && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#64748b' }}>
              {isZh ? '已归档' : 'Archived'}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {autoTranslateEnabled && (
          <div className="mb-3 rounded-xl px-3 py-2 text-xs" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>
            {translating
              ? 'Translating...'
              : translatedText
              ? `Auto translated (${sourceLanguage || 'auto'} → ${normalizeLanguageCode(userTargetLanguage)})`
              : 'Auto translate enabled'}
          </div>
        )}
        {autoTranslateEnabled && translatedText && (
          <div className="mb-3 rounded-xl p-3.5" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: '#6d28d9' }}>Auto translated</p>
            <pre className="text-sm whitespace-pre-wrap font-sans leading-6" style={{ color: '#334155' }}>{translatedText}</pre>
          </div>
        )}
        {email.body_html ? (
          <div
            className="text-sm prose prose-sm max-w-none rounded-xl border p-4"
            style={{ color: '#334155', borderColor: '#e5e7eb', background: 'white' }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html) }}
          />
        ) : (
          <pre className="text-sm whitespace-pre-wrap font-sans leading-6 rounded-xl border p-4" style={{ color: '#334155', borderColor: '#e5e7eb', background: 'white' }}>
            {email.body_text || ''}
          </pre>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-3 flex-shrink-0 flex items-center justify-between gap-2" style={{ borderTop: '1px solid #e5e7eb', background: '#f8fafc' }}>
        <div className="flex items-center gap-2 flex-wrap">
          {onReply && (
            <button onClick={onReply}
              className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-white"
              style={{ borderColor: '#dbe3ea', color: '#334155' }}>
              {isZh ? '回复' : (t('emailReply') || 'Reply')}
            </button>
          )}
          {onForward && (
            <button onClick={onForward}
              className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-white"
              style={{ borderColor: '#dbe3ea', color: '#334155' }}>
              {isZh ? '转发' : (t('emailForward') || 'Forward')}
            </button>
          )}
          {onArchive && (
            <button onClick={onArchive}
              className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-white"
              style={{ borderColor: '#dbe3ea', color: '#334155' }}>
              {isArchived ? (isZh ? '移回收件箱' : 'Move to Inbox') : (isZh ? '归档' : 'Archive')}
            </button>
          )}
          {isFollowUpPending && onClearFollowUp && (
            <button onClick={onClearFollowUp}
              className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-gray-50"
              style={{ borderColor: '#fde68a', color: '#92400e', background: '#fffbeb' }}>
              {isZh ? '清除待跟进' : 'Clear Follow-up'}
            </button>
          )}
          {!isFollowUpPending && onSetFollowUp && (
            <button onClick={onSetFollowUp}
              className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-gray-50"
              style={{ borderColor: '#fde68a', color: '#92400e', background: '#fffbeb' }}>
              {isZh ? '设为待跟进' : 'Set Follow-up'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {onLinkCustomer && (
            <button onClick={onLinkCustomer}
              className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-white"
              style={{ borderColor: '#dbe3ea', color: '#4338ca' }}>
              {isZh ? '关联客户' : (t('emailLinkCustomer') || 'Link to Customer')}
            </button>
          )}
        {canViewThread && onViewThread && (
          <button onClick={onViewThread}
            className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-white"
            style={{ borderColor: '#dbe3ea', color: '#334155' }}>
            {isZh ? '查看会话' : 'View Thread'}
          </button>
        )}
        {canMarkRead && onMarkRead && (
          <button onClick={onMarkRead}
            className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-white"
            style={{ borderColor: '#dbe3ea', color: '#334155' }}>
            {isZh ? '标记已读' : 'Mark Read'}
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete}
            className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-gray-50"
            style={{ borderColor: '#fecaca', color: '#dc2626' }}>
            {isZh ? '删除' : 'Delete'}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
