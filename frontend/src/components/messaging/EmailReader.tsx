'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
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
  onBack,
}: EmailReaderProps) {
  const t = useTranslations('msgCenter');
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4" style={{ borderBottom: '1px solid #e5e7eb' }}>
        <div className="flex items-center gap-2 mb-2">
          {onBack && (
            <button onClick={onBack} className="p-1 rounded hover:bg-gray-100 mr-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
          <h3 className="text-base font-semibold flex-1 truncate" style={{ color: '#3b4a54' }}>
            {email.subject || '(No Subject)'}
          </h3>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs space-y-0.5" style={{ color: '#8696a0' }}>
            <div>
              <span className="font-medium" style={{ color: '#3b4a54' }}>
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
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-5">
        {autoTranslateEnabled && (
          <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: '#f3f4f6', color: '#6b7280' }}>
            {translating
              ? 'Translating...'
              : translatedText
              ? `Auto translated (${sourceLanguage || 'auto'} → ${normalizeLanguageCode(userTargetLanguage)})`
              : 'Auto translate enabled'}
          </div>
        )}
        {autoTranslateEnabled && translatedText && (
          <div className="mb-3 rounded-lg p-3" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: '#6d28d9' }}>Auto translated</p>
            <pre className="text-sm whitespace-pre-wrap font-sans" style={{ color: '#3b4a54' }}>{translatedText}</pre>
          </div>
        )}
        {email.body_html ? (
          <div
            className="text-sm prose prose-sm max-w-none"
            style={{ color: '#3b4a54' }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html) }}
          />
        ) : (
          <pre className="text-sm whitespace-pre-wrap font-sans" style={{ color: '#3b4a54' }}>
            {email.body_text || ''}
          </pre>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid #e5e7eb' }}>
        {onReply && (
          <button onClick={onReply}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
            style={{ borderColor: '#e5e7eb', color: '#3b4a54' }}>
            {t('emailReply') || 'Reply'}
          </button>
        )}
        {onForward && (
          <button onClick={onForward}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
            style={{ borderColor: '#e5e7eb', color: '#3b4a54' }}>
            {t('emailForward') || 'Forward'}
          </button>
        )}
        {onLinkCustomer && (
          <button onClick={onLinkCustomer}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50 ml-auto"
            style={{ borderColor: '#e5e7eb', color: '#4338ca' }}>
            {t('emailLinkCustomer') || 'Link to Customer'}
          </button>
        )}
      </div>
    </div>
  );
}
