'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface GlobalAIToolbarProps {
  tenant: string;
  mainRef: React.RefObject<HTMLElement | null>;
  pageContext: string;
  children: React.ReactNode;
}

export default function GlobalAIToolbar({ tenant, mainRef, pageContext, children }: GlobalAIToolbarProps) {
  const t = useTranslations('ai');
  const [showAiChat, setShowAiChat] = useState(false);

  // Lazy load AIChatSidebar
  const [AIChatSidebar, setAIChatSidebar] = useState<React.ComponentType<any> | null>(null);
  const loadAiChat = useCallback(async () => {
    if (!AIChatSidebar) {
      const mod = await import('@/components/ai/AIChatSidebar');
      setAIChatSidebar(() => mod.default);
    }
  }, [AIChatSidebar]);

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
    </>
  );
}
