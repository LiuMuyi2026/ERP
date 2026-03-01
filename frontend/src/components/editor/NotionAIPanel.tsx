'use client';

/**
 * NotionAIPanel (AI Assistant)
 * ─────────────────────────────────────────────────────────────────────────────
 * Slide-in right panel for page-level AI features:
 *   - Ask AI (free-form Q&A about the page)
 *   - Summarize page
 *   - Extract action items
 *   - Translate page
 *   - AI Writer (generate content from prompt)
 *
 * Automatically extracts page content for all page types (document, task_tracker,
 * voice_memo, etc.) and sends it as context with every AI action.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';

interface Message {
  role: 'user' | 'ai';
  content: string;
  action?: string;
  loading?: boolean;
}

interface NotionAIPanelProps {
  pageId: string;
  pageTitle: string;
  pageContent?: any;  // raw page blocks
  open: boolean;
  onClose: () => void;
  /** Called when the user wants to insert AI content into the editor */
  onInsertContent?: (text: string) => void;
}

const LANGUAGES = ['English', 'Chinese (Simplified)', 'Japanese', 'Korean', 'German', 'French', 'Spanish'];

/** Extract readable text from any page content type */
function extractPageText(content: any): string {
  if (!content) return '';

  // task_tracker: format tasks array
  if (content._type === 'task_tracker' && Array.isArray(content._tasks)) {
    return content._tasks.map((t: any, i: number) => {
      const status = t.status || t.done ? 'Done' : 'To do';
      const priority = t.priority ? ` [${t.priority}]` : '';
      const assignee = t.assignee ? ` (${t.assignee})` : '';
      const due = t.due_date || t.due ? ` — due ${t.due_date || t.due}` : '';
      return `${i + 1}. [${status}]${priority} ${t.title || t.name || t.task || ''}${assignee}${due}`;
    }).join('\n');
  }

  // voice_memo: return transcript
  if (content._type === 'voice_memo') {
    return content.transcript || content.text || '';
  }

  // BlockNote blocks array
  if (Array.isArray(content)) {
    return extractBlockNoteText(content);
  }

  // Views-based content (e.g. database views)
  if (content._views && Array.isArray(content._views)) {
    return content._views.map((view: any) => {
      const header = view.name ? `## ${view.name}\n` : '';
      if (Array.isArray(view.data)) {
        return header + view.data.map((row: any) =>
          Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(', ')
        ).join('\n');
      }
      return header + JSON.stringify(view.data || '', null, 2);
    }).join('\n\n');
  }

  // If content is a string, return as-is
  if (typeof content === 'string') return content;

  // Fallback: try to extract blocks from content.content
  if (content.content && Array.isArray(content.content)) {
    return extractBlockNoteText(content.content);
  }

  return '';
}

/** Recursively extract text from BlockNote blocks */
function extractBlockNoteText(blocks: any[]): string {
  return blocks.map((block: any) => {
    let text = '';
    // Inline content
    if (Array.isArray(block.content)) {
      text = block.content.map((c: any) => {
        if (typeof c === 'string') return c;
        return c.text || c.content || '';
      }).join('');
    } else if (typeof block.content === 'string') {
      text = block.content;
    }
    // Recurse into children
    if (Array.isArray(block.children) && block.children.length > 0) {
      const childText = extractBlockNoteText(block.children);
      if (childText) text += '\n' + childText;
    }
    return text;
  }).filter(Boolean).join('\n');
}

function MarkdownResult({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 4 }} />;
        if (/^#{1,3}\s/.test(line)) return (
          <div key={i} className="font-semibold" style={{ fontSize: 12, color: '#1a1a1a', marginTop: 8 }}>
            {line.replace(/^#{1,3}\s/, '')}
          </div>
        );
        if (/^- \[[ x]\]/.test(line)) {
          const done = /^- \[x\]/.test(line);
          return (
            <div key={i} className="flex items-start gap-1.5" style={{ fontSize: 11 }}>
              <span style={{ marginTop: 2, fontSize: 11 }}>{done ? <HandIcon name="checkmark" size={11} /> : '☐'}</span>
              <span>{line.replace(/^- \[[ x]\] /, '')}</span>
            </div>
          );
        }
        if (/^[-*]\s/.test(line)) return (
          <div key={i} className="flex items-start gap-1.5" style={{ fontSize: 11, color: '#374151' }}>
            <span className="mt-1.5 flex-shrink-0" style={{ width: 3, height: 3, borderRadius: '50%', background: '#9ca3af', display: 'inline-block' }} />
            <span>{line.replace(/^[-*]\s/, '')}</span>
          </div>
        );
        const formatted = line.replace(/\*\*([^*]+)\*\*/g, (_, m) => m).replace(/`([^`]+)`/g, (_, m) => m);
        return <div key={i} style={{ fontSize: 11, color: '#374151', lineHeight: 1.6 }}>{formatted}</div>;
      })}
    </div>
  );
}

function MessageBubble({ msg, onInsert, t }: { msg: Message; onInsert?: (text: string) => void; t: any }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm text-xs" style={{ background: '#7c3aed', color: 'white' }}>
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0" style={{ fontSize: 7, fontWeight: 700 }}>AI</div>
        <span className="text-[10px] font-semibold" style={{ color: '#6b21a8' }}>{t('aiAssistant')}</span>
      </div>
      <div className="rounded-xl rounded-tl-sm px-3 py-2.5" style={{ background: '#f8f7ff', border: '1px solid #e9d5ff' }}>
        {msg.loading ? (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="rounded-full" style={{ width: 5, height: 5, background: '#a78bfa', animation: `ai-dot-bounce 1s ${i * 0.2}s infinite` }} />
              ))}
            </div>
            <span className="text-xs" style={{ color: '#7c3aed' }}>Thinking...</span>
          </div>
        ) : (
          <MarkdownResult text={msg.content} />
        )}
      </div>
      {!msg.loading && (
        <div className="flex items-center gap-1 mt-0.5">
          <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors" style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {copied ? <><HandIcon name="checkmark" size={10} /> {t('copied')}</> : <><HandIcon name="document-pen" size={10} /> {t('copy')}</>}
          </button>
          {onInsert && (
            <button onClick={() => onInsert(msg.content)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors" style={{ color: '#7c3aed' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#faf9ff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <HandIcon name="arrow-down" size={10} /> {t('insertBelow')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function NotionAIPanel({ pageId, pageTitle, pageContent, open, onClose, onInsertContent }: NotionAIPanelProps) {
  const t = useTranslations('workspace');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const quickActions = useMemo(() => [
    { icon: 'document-pen', label: t('summarizePage'), action: 'summarize' },
    { icon: 'checkmark', label: t('extractActions'), action: 'extract_actions' },
    { icon: 'writing-hand', label: t('improveWriting'), action: 'rewrite' },
    { icon: 'text-abc', label: t('fixGrammar'), action: 'fix_grammar' },
  ], [t]);

  const pageText = useMemo(() => extractPageText(pageContent), [pageContent]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const runAction = useCallback(async (action: string, extraBody: Record<string, any> = {}) => {
    const userLabel = extraBody._userLabel || action;
    delete extraBody._userLabel;

    setMessages(prev => [
      ...prev,
      { role: 'user', content: userLabel },
      { role: 'ai', content: '', loading: true },
    ]);
    setLoading(true);

    try {
      const body: Record<string, any> = {
        action,
        page_content: pageContent,
        ...extraBody,
      };
      // Always attach extracted page text as context
      if (pageText && !body.text) {
        body.text = pageText;
      }
      const res = await api.post(`/api/workspace/pages/${pageId}/ai-action`, body);

      let result = '';
      if (res.type === 'json' && Array.isArray(res.result)) {
        if (action === 'extract_actions') {
          result = res.result.map((item: any) =>
            `- [ ] **${item.task || item.item || ''}**${item.owner ? ` (${item.owner})` : ''}${item.due_date ? ` — ${item.due_date}` : ''}`
          ).join('\n') || 'No action items found.';
        } else {
          result = JSON.stringify(res.result, null, 2);
        }
      } else {
        result = res.result || '';
      }

      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { ...m, content: result, loading: false } : m
      ));
    } catch (e: any) {
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { ...m, content: `Error: ${e?.message || 'AI request failed'}`, loading: false } : m
      ));
    } finally {
      setLoading(false);
    }
  }, [pageId, pageContent, pageText]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const contextPrefix = pageText
      ? `[Page: "${pageTitle}"]\n\nPage content:\n${pageText}\n\nUser question: `
      : `Regarding the page "${pageTitle}":\n`;
    await runAction('generate', { prompt: `${contextPrefix}${text}`, _userLabel: text });
  }, [input, loading, pageTitle, pageText, runAction]);

  const clearChat = () => setMessages([]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop (mobile) */}
      <div className="fixed inset-0 z-[199] lg:hidden" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-[200] flex flex-col"
        style={{
          width: 360,
          background: 'white',
          borderLeft: '1px solid var(--notion-border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--notion-border)', background: 'linear-gradient(to right, #faf9ff, white)' }}>
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold shadow-sm" style={{ fontSize: 11 }}>
            AI
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#6b21a8' }}>{t('aiAssistant')}</p>
            <p className="text-[10px] truncate" style={{ color: 'var(--notion-text-muted)' }}>{pageTitle || t('aiAssistant')}</p>
          </div>
          {messages.length > 0 && (
            <button onClick={clearChat} className="text-[10px] px-2 py-1 rounded-md transition-colors" style={{ color: 'var(--notion-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title={t('clearChat')}
            >
              {t('clear')}
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Quick actions */}
        <div className="px-3 py-2.5 border-b flex-shrink-0" style={{ borderColor: '#f0f0ef' }}>
          <p className="text-[10px] uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--notion-text-muted)' }}>{t('quickActions')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {quickActions.map(qa => (
              <button
                key={qa.action}
                disabled={loading}
                onClick={() => runAction(qa.action, { _userLabel: qa.label })}
                className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg text-left transition-colors disabled:opacity-50"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#faf9ff'; e.currentTarget.style.borderColor = '#d8b4fe'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
              >
                <HandIcon name={qa.icon} size={12} />
                {qa.label}
              </button>
            ))}
            {/* Translate button */}
            <div className="relative col-span-2">
              <button
                disabled={loading}
                onClick={() => setShowTranslate(v => !v)}
                className="w-full flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg text-left transition-colors disabled:opacity-50"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#faf9ff'; e.currentTarget.style.borderColor = '#d8b4fe'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
              >
                <HandIcon name="globe" size={12} />
                {t('translateTo')}
                <svg className="ml-auto" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points={showTranslate ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
                </svg>
              </button>
              {showTranslate && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg overflow-hidden shadow-lg" style={{ border: '1px solid var(--notion-border)', background: 'white' }}>
                  {LANGUAGES.map(lang => (
                    <button key={lang} onClick={() => { setShowTranslate(false); runAction('translate', { target_language: lang, _userLabel: `${t('translateTo')} ${lang}` }); }}
                      className="w-full text-left text-xs px-3 py-2 transition-colors" style={{ color: 'var(--notion-text)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                AI
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>{t('askMeAnything')}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--notion-text-muted)' }}>
                  {t('aiPanelDesc')}
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                t={t}
                onInsert={msg.role === 'ai' && !msg.loading && onInsertContent ? () => onInsertContent(msg.content) : undefined}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-4 pt-2 flex-shrink-0 border-t" style={{ borderColor: '#f0f0ef' }}>
          <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid #d8b4fe', background: '#faf9ff' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={t('aiInputPlaceholder')}
              className="w-full resize-none text-xs px-3 py-2.5 outline-none bg-transparent"
              style={{ color: 'var(--notion-text)', minHeight: 72, maxHeight: 160 }}
              rows={3}
              disabled={loading}
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{t('shiftEnterHint')}</span>
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-white font-medium transition-opacity disabled:opacity-40 shadow-sm"
                style={{ background: '#7c3aed' }}
              >
                {loading ? (
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
                {t('send')}
              </button>
            </div>
          </div>
          <p className="text-[9px] text-center mt-2" style={{ color: 'var(--notion-text-muted)' }}>
            {t('aiDisclaimer')}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes ai-dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
