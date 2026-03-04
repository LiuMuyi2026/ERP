'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLocale, useTranslations } from 'next-intl';
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
  autoTranslateEnabled?: boolean;
  userTargetLanguage?: string;
  onSent?: () => void;
  onCancel?: () => void;
}

function normalizeLanguageCode(value?: string) {
  const v = (value || '').trim().toLowerCase().replace('_', '-');
  if (!v) return 'en';
  if (v.startsWith('zh')) return 'zh-CN';
  if (v.startsWith('ja')) return 'ja';
  if (v.startsWith('es')) return 'es';
  if (v.startsWith('de')) return 'de';
  if (v.startsWith('fr')) return 'fr';
  if (v.startsWith('pt')) return 'pt';
  return v.split('-')[0];
}

function guessLanguageFromEmail(email: string) {
  const lower = (email || '').toLowerCase();
  if (lower.endsWith('.cn') || lower.endsWith('.com.cn')) return 'zh-CN';
  if (lower.endsWith('.tw') || lower.endsWith('.hk')) return 'zh-TW';
  if (lower.endsWith('.jp')) return 'ja';
  if (lower.endsWith('.es') || lower.endsWith('.mx') || lower.endsWith('.ar')) return 'es';
  if (lower.endsWith('.de')) return 'de';
  if (lower.endsWith('.fr')) return 'fr';
  if (lower.endsWith('.br') || lower.endsWith('.pt')) return 'pt';
  return 'en';
}

export default function EmailComposer({
  replyTo, defaultTo, defaultSubject, leadId, accountId,
  autoTranslateEnabled = false,
  userTargetLanguage = 'en',
  onSent, onCancel,
}: EmailComposerProps) {
  const t = useTranslations('msgCenter');
  const locale = useLocale();
  const isZh = locale.toLowerCase().startsWith('zh');
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
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string; body_text: string }>>([]);
  const [templateId, setTemplateId] = useState('');

  async function loadTemplates() {
    try {
      const data = await api.get('/api/email/manage/templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      setTemplates([]);
    }
  }

  function renderTemplate(raw: string) {
    return String(raw || '')
      .replaceAll('{{to_email}}', to || '')
      .replaceAll('{{date}}', new Date().toLocaleDateString());
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(renderTemplate(tpl.subject));
    setBodyText(renderTemplate(tpl.body_text));
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  async function handleSend() {
    if (!to.trim() || !subject.trim()) {
      toast.error(isZh ? '收件人和主题不能为空' : 'To and Subject are required');
      return;
    }
    setSending(true);
    try {
      let outgoingBody = bodyText;
      if (autoTranslateEnabled && bodyText.trim()) {
        const targetLanguage = normalizeLanguageCode(guessLanguageFromEmail(to.trim()));
        const sourceLanguage = normalizeLanguageCode(userTargetLanguage);
        try {
          const translated: any = await api.post('/api/whatsapp/ai/translate', {
            text: bodyText,
            target_language: targetLanguage,
            source_language: sourceLanguage,
            mode: 'outgoing',
          });
          if (translated?.is_translated && translated?.translated_text) {
            outgoingBody = String(translated.translated_text);
          }
        } catch {
          // fallback to original text when translation fails
        }
      }

      await api.post('/api/email/send', {
        to_email: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim(),
        body_text: outgoingBody,
        body_html: undefined,
        in_reply_to_id: replyTo?.id || undefined,
        lead_id: leadId || undefined,
        account_id: accountId || undefined,
      });
      toast.success(t('emailSentSuccess') || 'Email sent');
      onSent?.();
    } catch (e: any) {
      toast.error(e.message || (isZh ? '发送失败' : 'Failed to send'));
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
          {replyTo ? (isZh ? '回复邮件' : (t('emailReply') || 'Reply')) : (isZh ? '写邮件' : (t('emailCompose') || 'Compose'))}
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
        {templates.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs w-12 text-right flex-shrink-0" style={{ color: '#8696a0' }}>
              {isZh ? '模板' : 'Tpl'}
            </label>
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="flex-1 text-sm border rounded px-2 py-1.5 outline-none"
              style={{ borderColor: '#e5e7eb' }}
            >
              <option value="">{isZh ? '选择模板...' : 'Choose template...'}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </div>
        )}
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
              style={{ color: '#8696a0' }}>{isZh ? '抄送/密送' : 'Cc/Bcc'}</button>
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
          placeholder={isZh ? '请输入邮件正文...' : 'Write your email...'}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #e5e7eb' }}>
        {autoTranslateEnabled && (
          <span className="mr-auto text-[11px]" style={{ color: '#64748b' }}>
            {isZh ? '自动翻译: ' : 'Auto translate: '}
            {normalizeLanguageCode(userTargetLanguage)} → {normalizeLanguageCode(guessLanguageFromEmail(to))}
          </span>
        )}
        {onCancel && (
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: '#e5e7eb', color: '#667781' }}>
            {isZh ? '取消' : 'Cancel'}
          </button>
        )}
        <button onClick={handleSend} disabled={sending || !to.trim() || !subject.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: '#3b82f6' }}>
          {sending ? '...' : (isZh ? '发送' : (t('emailSend') || 'Send'))}
        </button>
      </div>
    </div>
  );
}
