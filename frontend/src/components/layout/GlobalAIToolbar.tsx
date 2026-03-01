'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { getApiUrl, getAuthHeaders } from '@/lib/api';
interface GlobalAIToolbarProps {
  tenant: string;
  mainRef: React.RefObject<HTMLElement | null>;
  pageContext: string;
  children: React.ReactNode;
}

export default function GlobalAIToolbar({ tenant, mainRef, pageContext, children }: GlobalAIToolbarProps) {
  const t = useTranslations('ai');
  const [showAiChat, setShowAiChat] = useState(false);
  const [showAtAi, setShowAtAi] = useState(false);
  const [atAiInput, setAtAiInput] = useState('');
  const [atAiResult, setAtAiResult] = useState('');
  const [atAiStreaming, setAtAiStreaming] = useState(false);
  const atAiResultRef = useRef('');

  // Lazy load AIChatSidebar
  const [AIChatSidebar, setAIChatSidebar] = useState<React.ComponentType<any> | null>(null);
  const loadAiChat = useCallback(async () => {
    if (!AIChatSidebar) {
      const mod = await import('@/components/ai/AIChatSidebar');
      setAIChatSidebar(() => mod.default);
    }
  }, [AIChatSidebar]);

  async function handleAtAiSubmit() {
    if (!atAiInput.trim() || atAiStreaming) return;
    setAtAiStreaming(true);
    setAtAiResult('');
    atAiResultRef.current = '';
    try {
      const apiUrl = getApiUrl();
      const freshContext = mainRef.current?.innerText?.slice(0, 4000) || pageContext;
      const response = await fetch(`${apiUrl}/api/automation/mention`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          page_id: 'global',
          page_content: freshContext,
          mention_text: atAiInput,
        }),
      });
      if (!response.body) { setAtAiResult(t('noResponse')); return; }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.chunk) {
              atAiResultRef.current += payload.chunk;
              setAtAiResult(atAiResultRef.current);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setAtAiResult(`${t('error')}: ${e.message || t('unknownError')}`);
    } finally {
      setAtAiStreaming(false);
    }
  }

  function copyAtAiResult() {
    if (atAiResultRef.current) {
      navigator.clipboard.writeText(atAiResultRef.current).catch(() => {});
    }
  }

  return (
    <>
      {/* ── Top-right toolbar ── */}
      <div
        className="flex items-center justify-end px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-bg)' }}
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setShowAiChat(v => !v);
              loadAiChat();
            }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium transition-all hover:bg-[#ede9fe] hover:text-[#7c3aed]"
            style={{
              background: showAiChat ? '#ede9fe' : 'transparent',
              color: showAiChat ? '#7c3aed' : 'var(--notion-text-muted)',
              border: showAiChat ? '1px solid #d8b4fe' : '1px solid transparent',
            }}
            title={t('assistant')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            </svg>
            {t('assistant')}
          </button>

          <button
            onClick={() => { setShowAtAi(true); setAtAiResult(''); setAtAiInput(''); atAiResultRef.current = ''; }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium transition-all hover:bg-[#fef3c7] hover:text-[#b45309]"
            style={{
              background: showAtAi ? '#fef3c7' : 'transparent',
              color: showAtAi ? '#b45309' : 'var(--notion-text-muted)',
              border: showAtAi ? '1px solid #fde68a' : '1px solid transparent',
            }}
            title={t('atAiTooltip')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
            </svg>
            @AI
          </button>
        </div>
      </div>

      {/* ── Content area with AI sidebar ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {children}

        {/* ── AI Chat Sidebar (slides in from right) ── */}
        {showAiChat && AIChatSidebar && (
          <AIChatSidebar
            tenant={tenant}
            open={showAiChat}
            onClose={() => setShowAiChat(false)}
            pageContext={pageContext}
            mainRef={mainRef}
          />
        )}
      </div>

      {/* ── @AI Dialog ── */}
      {showAtAi && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target === e.currentTarget && !atAiStreaming) { setShowAtAi(false); } }}
        >
          <div
            className="flex flex-col"
            style={{
              width: 560,
              maxWidth: 'calc(100vw - 40px)',
              background: 'var(--notion-card-elevated, #1e293b)',
              border: '2px solid #f59e0b',
              borderRadius: 16,
              boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(245,158,11,0.3)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(245,158,11,0.25)' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0,
              }}>@</div>
              <span className="text-sm font-semibold flex-1" style={{ color: 'var(--notion-text)' }}>
                {t('atAiTitle')}
              </span>
              {!atAiStreaming && (
                <button
                  onClick={() => setShowAtAi(false)}
                  className="p-1 rounded-md hover:bg-[var(--notion-hover)]"
                  style={{ color: 'var(--notion-text-muted)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: atAiResult ? '1px solid rgba(245,158,11,0.20)' : 'none' }}>
              <input
                autoFocus
                value={atAiInput}
                onChange={e => setAtAiInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAtAiSubmit(); }
                  if (e.key === 'Escape' && !atAiStreaming) setShowAtAi(false);
                }}
                placeholder={t('inputPlaceholder')}
                disabled={atAiStreaming}
                className="flex-1 text-sm outline-none bg-transparent"
                style={{ color: 'var(--notion-text)' }}
              />
              <button
                onClick={handleAtAiSubmit}
                disabled={atAiStreaming || !atAiInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 transition-opacity"
                style={{ background: atAiStreaming ? '#92400e' : '#f59e0b', flexShrink: 0 }}
              >
                {atAiStreaming ? (
                  <>
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {t('generating')}
                  </>
                ) : t('send')}
              </button>
            </div>

            {/* Quick prompts */}
            {!atAiResult && !atAiStreaming && (
              <div className="flex flex-wrap gap-1.5 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                {[t('promptAnalyze'), t('promptSummary'), t('promptWorkPlan'), t('promptEmail')].map(p => (
                  <button
                    key={p}
                    onClick={() => setAtAiInput(p)}
                    className="text-xs px-2.5 py-1 rounded-full transition-colors hover:bg-[rgba(245,158,11,0.25)]"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Result */}
            {(atAiResult || atAiStreaming) && (
              <div style={{
                padding: '16px',
                fontSize: 14,
                lineHeight: 1.75,
                whiteSpace: 'pre-wrap',
                maxHeight: 340,
                overflowY: 'auto',
                color: 'var(--notion-text)',
                background: 'rgba(245,158,11,0.06)',
              }}>
                {atAiResult || (atAiStreaming ? <span style={{ color: 'var(--notion-text-muted)' }}>{t('aiThinking')}</span> : null)}
                {atAiStreaming && (
                  <span style={{ display: 'inline-block', width: 2, height: 16, background: '#f59e0b', marginLeft: 2, verticalAlign: 'middle', animation: 'pulse 1s step-end infinite' }} />
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid rgba(245,158,11,0.15)' }}>
              <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                {atAiStreaming ? t('generatingEllipsis') : atAiResult ? t('generationComplete') : t('enterToSendEscClose')}
              </span>
              {atAiResult && !atAiStreaming && (
                <div className="flex gap-2">
                  <button
                    onClick={copyAtAiResult}
                    className="text-xs px-3 py-1 rounded-lg transition-colors hover:bg-[rgba(245,158,11,0.1)]"
                    style={{ color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                  >
                    {t('copy')}
                  </button>
                  <button
                    onClick={() => setShowAtAi(false)}
                    className="text-xs px-3 py-1 rounded-lg transition-colors hover:bg-[var(--notion-hover)]"
                    style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                  >
                    {t('close')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
