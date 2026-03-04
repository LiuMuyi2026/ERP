'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  defaultFontFamily?: string;
  defaultFontSize?: string;
  onSent?: () => void;
  onCancel?: () => void;
}

type TranslationReview = {
  original: string;
  translated: string;
  targetLanguage: string;
};

function normalizeLanguageCode(value?: string) {
  const v = (value || '').trim().toLowerCase().replace('_', '-');
  if (!v) return 'en';
  if (v === 'zh-tw' || v === 'zh-hk' || v === 'zh-hant') return 'zh-TW';
  if (v.startsWith('zh')) return 'zh-CN';
  if (v.startsWith('ja')) return 'ja';
  if (v.startsWith('es')) return 'es';
  if (v.startsWith('de')) return 'de';
  if (v.startsWith('fr')) return 'fr';
  if (v.startsWith('pt')) return 'pt';
  return v.split('-')[0];
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function plainToHtml(text: string) {
  return escapeHtml(text || '').replace(/\n/g, '<br>');
}

function htmlToPlain(html: string) {
  if (typeof window === 'undefined') {
    return String(html || '').replace(/<[^>]+>/g, '');
  }
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ').trimEnd();
}

export default function EmailComposer({
  replyTo,
  defaultTo,
  defaultSubject,
  leadId,
  accountId,
  autoTranslateEnabled = false,
  userTargetLanguage = 'en',
  defaultFontFamily = 'Arial',
  defaultFontSize = '14px',
  onSent,
  onCancel,
}: EmailComposerProps) {
  const t = useTranslations('msgCenter');
  const locale = useLocale();
  const isZh = locale.toLowerCase().startsWith('zh');

  const [to, setTo] = useState(replyTo?.from_email || defaultTo || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject?.replace(/^Re:\s*/i, '')}` : (defaultSubject || ''),
  );
  const initialReplyText = useMemo(() => {
    if (!replyTo) return '';
    return `\n\n---\nOn ${new Date().toLocaleDateString()}, ${replyTo.from_name || replyTo.from_email} wrote:\n> ${(replyTo.body_text || '').split('\n').join('\n> ')}`;
  }, [replyTo]);

  const [bodyHtml, setBodyHtml] = useState(plainToHtml(initialReplyText));
  const editorRef = useRef<HTMLDivElement>(null);

  const [showCc, setShowCc] = useState(false);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string; body_text: string }>>([]);
  const [templateId, setTemplateId] = useState('');

  const [fontFamily, setFontFamily] = useState(defaultFontFamily || 'Arial');
  const [fontSize, setFontSize] = useState(defaultFontSize || '14px');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');

  const [writingAi, setWritingAi] = useState(false);
  const [polishingAi, setPolishingAi] = useState(false);
  const [translationReview, setTranslationReview] = useState<TranslationReview | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== bodyHtml) {
      editorRef.current.innerHTML = bodyHtml;
    }
  }, [bodyHtml]);

  useEffect(() => {
    setFontFamily(defaultFontFamily || 'Arial');
  }, [defaultFontFamily]);

  useEffect(() => {
    setFontSize(defaultFontSize || '14px');
  }, [defaultFontSize]);

  async function loadTemplates() {
    try {
      const data = await api.get('/api/email/manage/templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      setTemplates([]);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  function renderTemplate(raw: string) {
    return String(raw || '')
      .replaceAll('{{to_email}}', to || '')
      .replaceAll('{{date}}', new Date().toLocaleDateString());
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((item) => item.id === id);
    if (!tpl) return;
    setSubject(renderTemplate(tpl.subject));
    setBodyHtml(plainToHtml(renderTemplate(tpl.body_text)));
  }

  function syncFromEditor() {
    setBodyHtml(editorRef.current?.innerHTML || '');
  }

  function applyCommand(command: string, value?: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    syncFromEditor();
  }

  function uppercaseSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText.trim()) return;
    range.deleteContents();
    range.insertNode(document.createTextNode(selectedText.toUpperCase()));
    selection.removeAllRanges();
    syncFromEditor();
  }

  async function handleAiWrite() {
    if (writingAi) return;
    setWritingAi(true);
    try {
      const draftText = htmlToPlain(editorRef.current?.innerHTML || bodyHtml);
      const resp: any = await api.post('/api/email/ai/write', {
        draft_text: draftText,
        to_email: to,
        subject,
        target_language: normalizeLanguageCode(userTargetLanguage),
      });
      const result = String(resp?.result || '').trim();
      if (!result) {
        toast.error(isZh ? 'AI 未返回内容' : 'AI returned empty result');
        return;
      }
      setBodyHtml(plainToHtml(result));
      toast.success(isZh ? 'AI 已帮你生成邮件正文' : 'AI draft generated');
    } catch (e: any) {
      toast.error(e.message || (isZh ? 'AI 帮写失败' : 'AI write failed'));
    } finally {
      setWritingAi(false);
    }
  }

  function selectionInsideEditor() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return false;
    const range = sel.getRangeAt(0);
    const anchorNode = range.commonAncestorContainer;
    return editorRef.current.contains(anchorNode);
  }

  async function handleAiPolishSelection() {
    if (polishingAi) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selectionInsideEditor()) {
      toast.error(isZh ? '请先在正文中选中要润色的文字' : 'Select text in the email body first');
      return;
    }
    const range = selection.getRangeAt(0);
    const selectedText = range.toString().trim();
    if (!selectedText) {
      toast.error(isZh ? '请先选中文字' : 'Please select text first');
      return;
    }

    setPolishingAi(true);
    try {
      const resp: any = await api.post('/api/email/ai/polish', {
        text: selectedText,
        target_language: normalizeLanguageCode(userTargetLanguage),
        style: 'professional',
      });
      const polished = String(resp?.result || '').trim();
      if (!polished) {
        toast.error(isZh ? 'AI 未返回结果' : 'AI returned empty result');
        return;
      }
      range.deleteContents();
      range.insertNode(document.createTextNode(polished));
      selection.removeAllRanges();
      syncFromEditor();
      toast.success(isZh ? '已润色选中文本' : 'Selected text polished');
    } catch (e: any) {
      toast.error(e.message || (isZh ? 'AI 润色失败' : 'AI polish failed'));
    } finally {
      setPolishingAi(false);
    }
  }

  async function sendWithBody(finalText: string, finalHtml: string) {
    setSending(true);
    try {
      await api.post('/api/email/send', {
        to_email: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim(),
        body_text: finalText,
        body_html: finalHtml,
        in_reply_to_id: replyTo?.id || undefined,
        lead_id: leadId || undefined,
        account_id: accountId || undefined,
      });
      toast.success(t('emailSentSuccess') || 'Email sent');
      setTranslationReview(null);
      onSent?.();
    } catch (e: any) {
      toast.error(e.message || (isZh ? '发送失败' : 'Failed to send'));
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (!to.trim() || !subject.trim()) {
      toast.error(isZh ? '收件人和主题不能为空' : 'To and Subject are required');
      return;
    }

    const currentHtml = editorRef.current?.innerHTML || bodyHtml;
    const currentText = htmlToPlain(currentHtml);

    if (autoTranslateEnabled && currentText.trim()) {
      try {
        const targetLanguage = normalizeLanguageCode(userTargetLanguage);
        const translated: any = await api.post('/api/whatsapp/ai/translate', {
          text: currentText,
          target_language: targetLanguage,
          mode: 'outgoing',
        });
        const translatedText = String(translated?.translated_text || '').trim();
        if (translated?.is_translated && translatedText) {
          setTranslationReview({
            original: currentText,
            translated: translatedText,
            targetLanguage,
          });
          return;
        }
      } catch {
        // fall back to original content
      }
    }

    await sendWithBody(currentText, currentHtml);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'white' }}>
      <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
        <h3 className="text-[15px] font-semibold" style={{ color: '#334155' }}>
          {replyTo ? (isZh ? '回复邮件' : (t('emailReply') || 'Reply')) : (isZh ? '写邮件' : (t('emailCompose') || 'Compose'))}
        </h3>
        {onCancel && (
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white" style={{ border: '1px solid #e5e7eb' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      <div className="flex-shrink-0 space-y-2 p-5" style={{ borderBottom: '1px solid #f3f4f6', background: '#f8fafc' }}>
        {templates.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs w-14 text-right flex-shrink-0" style={{ color: '#64748b' }}>
              {isZh ? '模板' : 'Tpl'}
            </label>
            <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}
              className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none" style={{ borderColor: '#dbe3ea', background: 'white' }}>
              <option value="">{isZh ? '选择模板...' : 'Choose template...'}</option>
              {templates.map((tpl) => (<option key={tpl.id} value={tpl.id}>{tpl.name}</option>))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-xs w-14 text-right flex-shrink-0" style={{ color: '#64748b' }}>{t('emailTo') || 'To'}</label>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)}
            className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:border-blue-400"
            style={{ borderColor: '#dbe3ea', background: 'white' }} placeholder="recipient@example.com" />
          {!showCc && (
            <button onClick={() => setShowCc(true)} className="text-xs px-2 py-1 rounded hover:bg-gray-100" style={{ color: '#8696a0' }}>
              {isZh ? '抄送/密送' : 'Cc/Bcc'}
            </button>
          )}
        </div>

        {showCc && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs w-14 text-right flex-shrink-0" style={{ color: '#64748b' }}>{t('emailCc') || 'Cc'}</label>
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)}
                className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:border-blue-400"
                style={{ borderColor: '#dbe3ea', background: 'white' }} placeholder="cc@example.com" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs w-14 text-right flex-shrink-0" style={{ color: '#64748b' }}>Bcc</label>
              <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)}
                className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:border-blue-400"
                style={{ borderColor: '#dbe3ea', background: 'white' }} placeholder="bcc@example.com" />
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <label className="text-xs w-14 text-right flex-shrink-0" style={{ color: '#64748b' }}>{t('emailSubject') || 'Subject'}</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
            className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:border-blue-400"
            style={{ borderColor: '#dbe3ea', background: 'white' }} placeholder="Subject" />
        </div>
      </div>

      <div className="px-5 py-2 flex items-center gap-1.5 flex-wrap border-b" style={{ borderColor: '#eef2f7', background: '#f8fafc' }}>
        <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea', background: 'white' }}>
          {['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'].map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea', background: 'white' }}>
          {['12px', '13px', '14px', '16px', '18px'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <button onClick={() => applyCommand('bold')} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea' }}>B</button>
        <button onClick={() => applyCommand('italic')} className="text-xs px-2 py-1 rounded border italic" style={{ borderColor: '#dbe3ea' }}>I</button>
        <button onClick={() => applyCommand('underline')} className="text-xs px-2 py-1 rounded border underline" style={{ borderColor: '#dbe3ea' }}>U</button>
        <button onClick={uppercaseSelection} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea' }}>{isZh ? '大写' : 'UP'}</button>
        <button onClick={() => applyCommand('indent')} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea' }}>{isZh ? '缩进' : 'Indent'}</button>
        <button onClick={() => applyCommand('outdent')} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea' }}>{isZh ? '减少缩进' : 'Outdent'}</button>

        <button onClick={() => { setTextAlign('left'); applyCommand('justifyLeft'); }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea' }}>L</button>
        <button onClick={() => { setTextAlign('center'); applyCommand('justifyCenter'); }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea' }}>C</button>
        <button onClick={() => { setTextAlign('right'); applyCommand('justifyRight'); }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#dbe3ea' }}>R</button>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={handleAiWrite} disabled={writingAi} className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: '#ddd6fe', color: '#6d28d9', background: '#f5f3ff' }}>
            {writingAi ? '...' : (isZh ? 'AI帮写' : 'AI Write')}
          </button>
          <button onClick={handleAiPolishSelection} disabled={polishingAi} className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: '#bfdbfe', color: '#1d4ed8', background: '#eff6ff' }}>
            {polishingAi ? '...' : (isZh ? 'AI润色选中' : 'AI Polish Selection')}
          </button>
        </div>
      </div>

      <div className="flex-1 p-5 overflow-auto">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncFromEditor}
          className="w-full h-full min-h-[220px] outline-none rounded-xl border p-4 leading-6 overflow-auto"
          style={{
            color: '#334155',
            borderColor: '#dbe3ea',
            background: 'white',
            fontFamily,
            fontSize,
            textAlign,
          }}
        />
      </div>

      <div className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0" style={{ borderTop: '1px solid #e5e7eb', background: '#f8fafc' }}>
        {autoTranslateEnabled && (
          <span className="mr-auto text-[11px]" style={{ color: '#64748b' }}>
            {isZh ? '写信自动翻译已开启，发送前会让你确认翻译结果。' : 'Auto translation is on. You will confirm the translated result before send.'}
          </span>
        )}
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2 rounded-full text-sm border" style={{ borderColor: '#dbe3ea', color: '#64748b' }}>
            {isZh ? '取消' : 'Cancel'}
          </button>
        )}
        <button onClick={handleSend} disabled={sending || !to.trim() || !subject.trim()}
          className="px-4 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50" style={{ background: '#2563eb' }}>
          {sending ? '...' : (isZh ? '发送' : (t('emailSend') || 'Send'))}
        </button>
      </div>

      {translationReview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTranslationReview(null)}>
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b" style={{ borderColor: '#e5e7eb' }}>
              <h4 className="text-sm font-semibold" style={{ color: '#334155' }}>{isZh ? '翻译预览（发送前确认）' : 'Translation Preview (Confirm Before Send)'}</h4>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: '#64748b' }}>{isZh ? '原文' : 'Original'}</p>
                <textarea value={translationReview.original} readOnly className="w-full h-56 text-sm border rounded-lg px-3 py-2 resize-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: '#64748b' }}>{isZh ? '翻译结果（可编辑）' : 'Translated (Editable)'}</p>
                <textarea value={translationReview.translated}
                  onChange={(e) => setTranslationReview((prev) => prev ? { ...prev, translated: e.target.value } : prev)}
                  className="w-full h-56 text-sm border rounded-lg px-3 py-2 resize-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
            </div>
            <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: '#e5e7eb', background: '#f8fafc' }}>
              <button onClick={() => setTranslationReview(null)} className="px-3 py-1.5 text-xs rounded border" style={{ borderColor: '#dbe3ea', color: '#64748b' }}>
                {isZh ? '继续编辑' : 'Keep Editing'}
              </button>
              <button
                onClick={() => sendWithBody(translationReview.original, plainToHtml(translationReview.original))}
                className="px-3 py-1.5 text-xs rounded border"
                style={{ borderColor: '#dbe3ea', color: '#334155', background: 'white' }}
              >
                {isZh ? '直接发原文' : 'Send Original'}
              </button>
              <button
                onClick={() => sendWithBody(translationReview.translated, plainToHtml(translationReview.translated))}
                className="px-3 py-1.5 text-xs rounded text-white"
                style={{ background: '#2563eb' }}
              >
                {isZh ? '满意，发送翻译稿' : 'Looks Good, Send Translation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
