'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface LeadSuggestion {
  full_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  should_create_lead: boolean;
}

interface AIChatSidebarProps {
  tenant: string;
  open: boolean;
  onClose: () => void;
  pageContext?: string;  // visible page text for context-aware AI
  mainRef?: React.RefObject<HTMLElement | null>;  // ref to main content area for fresh context extraction
}

export default function AIChatSidebar({ tenant, open, onClose, pageContext, mainRef }: AIChatSidebarProps) {
  const t = useTranslations('workspace');
  const tAi = useTranslations('ai');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [leadSuggestion, setLeadSuggestion] = useState<LeadSuggestion | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevPageContextRef = useRef(pageContext);

  const copyMessage = useCallback((content: string, idx: number) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }, []);

  const handleQuickPrompt = useCallback((prompt: string) => {
    setInput(prompt);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset conversation when page context changes (user navigated to a different page)
  useEffect(() => {
    if (prevPageContextRef.current !== pageContext) {
      prevPageContextRef.current = pageContext;
      setMessages([]);
      setLeadSuggestion(null);
      setInput('');
    }
  }, [pageContext]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);
    setLeadSuggestion(null);

    try {
      let assistantContent = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Re-extract fresh page content (dynamic pages like AI Finder change after initial load)
      const freshContext = mainRef?.current?.innerText?.slice(0, 4000) || pageContext || undefined;

      for await (const chunk of api.stream('/api/ai/chat', {
        message: userMessage,
        history: messages,
        tenant_slug: tenant,
        page_context: freshContext,
      })) {
        if (chunk.chunk) {
          assistantContent += chunk.chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
            return updated;
          });
        }
        if (chunk.lead_suggestion?.should_create_lead) {
          setLeadSuggestion(chunk.lead_suggestion);
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Error: ' + (err.message || 'Unknown error') };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  async function createLeadFromSuggestion() {
    if (!leadSuggestion) return;
    try {
      await api.post('/api/crm/leads', {
        full_name: leadSuggestion.full_name || 'Unknown',
        email: leadSuggestion.email,
        phone: leadSuggestion.phone,
        company_name: leadSuggestion.company,
        source: 'ai_chat',
      });
      setLeadSuggestion(null);
      alert(t('leadCreatedSuccess'));
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (!open) return null;

  return (
    <div className="flex flex-col h-full" style={{ width: 340, background: 'var(--notion-card, white)', borderLeft: '1px solid var(--notion-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--notion-border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold" style={{ fontSize: 9 }}>AI</div>
          <span className="font-semibold text-sm" style={{ color: 'var(--notion-text)' }}>{t('aiChatTitle')}</span>
        </div>
        <button onClick={onClose} style={{ color: 'var(--notion-text-muted)', padding: 4, borderRadius: 6 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Lead suggestion toast */}
      {leadSuggestion && (
        <div className="mx-3 mt-3 p-3 rounded-lg text-sm" style={{ background: '#ede9fe', border: '1px solid #d8b4fe' }}>
          <p className="font-medium mb-1" style={{ color: '#5b21b6' }}>{t('newLeadDetected')}</p>
          <p className="text-xs" style={{ color: '#7c3aed' }}>{leadSuggestion.full_name}{leadSuggestion.company ? ` @ ${leadSuggestion.company}` : ''}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={createLeadFromSuggestion} className="px-2 py-1 text-white rounded text-xs" style={{ background: '#7c3aed' }}>{t('createLeadBtn')}</button>
            <button onClick={() => setLeadSuggestion(null)} className="px-2 py-1 rounded text-xs" style={{ color: 'var(--notion-text-muted)' }}>{t('dismissBtn')}</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm mt-8" style={{ color: 'var(--notion-text-muted)' }}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white font-bold mx-auto mb-3" style={{ fontSize: 12 }}>AI</div>
            <p>{t('aiChatWelcome1')}</p>
            <p className="mb-4">{t('aiChatWelcome2')}</p>
            {/* Quick prompts */}
            <div className="flex flex-wrap gap-1.5 justify-center">
              {[tAi('promptAnalyze'), tAi('promptSummary'), tAi('promptWorkPlan'), tAi('promptEmail')].map(p => (
                <button
                  key={p}
                  onClick={() => handleQuickPrompt(p)}
                  className="text-xs px-2.5 py-1 rounded-full transition-colors hover:bg-[#ede9fe]"
                  style={{ background: 'var(--notion-hover, #f3f4f6)', color: '#7c3aed', border: '1px solid #e9d5ff' }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%] relative">
              <div className="rounded-xl px-3 py-2 text-sm" style={{
                whiteSpace: 'pre-wrap',
                background: msg.role === 'user' ? '#7c3aed' : 'var(--notion-sidebar, #f1f5f9)',
                color: msg.role === 'user' ? '#fff' : 'var(--notion-text)',
              }}>
                {msg.content || (loading && i === messages.length - 1 ? '...' : '')}
              </div>
              {/* Copy button for assistant messages */}
              {msg.role === 'assistant' && msg.content && (
                <button
                  onClick={() => copyMessage(msg.content, i)}
                  className="absolute -bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--notion-hover)', color: 'var(--notion-text-muted)' }}
                >
                  {copiedIdx === i ? '✓' : tAi('copy')}
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--notion-border)' }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={t('aiChatPlaceholder')}
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-50"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
            style={{ background: '#7c3aed' }}
          >
            →
          </button>
        </div>
      </form>
    </div>
  );
}
