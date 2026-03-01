'use client';

/**
 * NotionAIToolbar
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating toolbar that appears near selected text inside a page editor.
 * Provides inline AI actions identical to Notion AI:
 *   Ask AI, Improve writing, Fix spelling, Make shorter, Make longer,
 *   Summarize, Explain, Change tone (sub-menu), Translate (sub-menu),
 *   Extract action items, Continue writing
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';

export type AIAction =
  | 'ask_ai'
  | 'rewrite'
  | 'fix_grammar'
  | 'shorter'
  | 'longer'
  | 'summarize'
  | 'explain'
  | 'change_tone'
  | 'translate'
  | 'extract_actions'
  | 'continue_writing';

interface NotionAIToolbarProps {
  pageId: string;
  /** Currently selected text */
  selectedText: string;
  /** Position where the toolbar should appear */
  position: { x: number; y: number };
  /** Called with the AI result text so the parent can insert/replace */
  onResult: (result: string, action: AIAction) => void;
  onClose: () => void;
}

const TONES = [
  { label: 'Professional', value: 'professional' },
  { label: 'Casual', value: 'casual' },
  { label: 'Friendly', value: 'friendly' },
  { label: 'Confident', value: 'confident' },
  { label: 'Direct', value: 'direct' },
  { label: 'Humorous', value: 'humorous' },
];

const LANGUAGES = [
  { label: '🇺🇸 English', value: 'English' },
  { label: '🇨🇳 Chinese', value: 'Chinese (Simplified)' },
  { label: '🇯🇵 Japanese', value: 'Japanese' },
  { label: '🇰🇷 Korean', value: 'Korean' },
  { label: '🇩🇪 German', value: 'German' },
  { label: '🇫🇷 French', value: 'French' },
  { label: '🇪🇸 Spanish', value: 'Spanish' },
  { label: '🇵🇹 Portuguese', value: 'Portuguese' },
  { label: '🇷🇺 Russian', value: 'Russian' },
  { label: '🇦🇷 Arabic', value: 'Arabic' },
];

interface MenuItem {
  icon: string;
  label: string;
  action?: AIAction;
  sub?: { label: string; value: string }[];
  subAction?: AIAction;
  divider?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: 'sparkle-star', label: 'Ask AI...', action: 'ask_ai' },
  { icon: '', label: '', divider: true },
  { icon: 'writing-hand', label: 'Improve writing', action: 'rewrite' },
  { icon: 'text-abc', label: 'Fix spelling & grammar', action: 'fix_grammar' },
  { icon: 'arrows-vertical', label: 'Make shorter', action: 'shorter' },
  { icon: 'arrow-down', label: 'Make longer', action: 'longer' },
  { icon: 'document-pen', label: 'Summarize', action: 'summarize' },
  { icon: 'lightbulb', label: 'Explain this', action: 'explain' },
  { icon: 'arrow-right', label: 'Continue writing', action: 'continue_writing' },
  { icon: '', label: '', divider: true },
  { icon: 'masks', label: 'Change tone', subAction: 'change_tone', sub: TONES },
  { icon: 'globe', label: 'Translate', subAction: 'translate', sub: LANGUAGES },
  { icon: 'checkmark', label: 'Extract action items', action: 'extract_actions' },
];

export default function NotionAIToolbar({ pageId, selectedText, position, onResult, onClose }: NotionAIToolbarProps) {
  const t = useTranslations('workspace');
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [activeSub, setActiveSub] = useState<string | null>(null); // 'change_tone' | 'translate'
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState('');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const runAction = useCallback(async (action: AIAction, extra?: { tone?: string; target_language?: string; prompt?: string }) => {
    if (!selectedText.trim() && action !== 'ask_ai') return;
    setLoading(true);
    setError('');
    try {
      const body: Record<string, any> = {
        action: action === 'ask_ai' ? 'generate' : action,
        text: selectedText,
        ...extra,
      };
      if (action === 'ask_ai') {
        body.prompt = extra?.prompt || customPrompt;
        body.text = selectedText;
      }
      const res = await api.post(`/api/workspace/pages/${pageId}/ai-action`, body);
      if (res.type === 'json') {
        // For action items, format as markdown list
        let formatted = '';
        if (action === 'extract_actions' && Array.isArray(res.result)) {
          formatted = res.result.map((item: any) =>
            `- [ ] **${item.task || item.item || ''}**${item.owner ? ` (${item.owner})` : ''}${item.due_date || item.due ? ` — due ${item.due_date || item.due}` : ''}`
          ).join('\n');
        } else {
          formatted = JSON.stringify(res.result, null, 2);
        }
        onResult(formatted, action);
      } else {
        onResult(res.result || '', action);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || 'AI action failed');
    } finally {
      setLoading(false);
    }
  }, [pageId, selectedText, customPrompt, onResult, onClose]);

  // Constrain position to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    top: Math.min(position.y, window.innerHeight - 400),
    left: Math.min(position.x, window.innerWidth - 320),
  };

  return (
    <div
      ref={toolbarRef}
      style={style}
      className="select-none"
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          width: 260,
          background: 'white',
          border: '1px solid rgba(0,0,0,0.12)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: '#f0f0ef', background: 'linear-gradient(to right, #f8f7ff, #fff)' }}>
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white" style={{ fontSize: 10, fontWeight: 700 }}>
            AI
          </div>
          <span className="text-xs font-semibold" style={{ color: '#6b21a8' }}>{t('aiAssistant')}</span>
          {loading && (
            <svg className="animate-spin ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
        </div>

        {/* Custom prompt (ask AI mode) */}
        {showCustom ? (
          <div className="p-2">
            <input
              ref={promptRef}
              autoFocus
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customPrompt.trim()) { e.preventDefault(); runAction('ask_ai', { prompt: customPrompt }); }
                if (e.key === 'Escape') { setShowCustom(false); setCustomPrompt(''); }
              }}
              placeholder="Ask AI anything about this text..."
              className="w-full text-xs px-2.5 py-2 rounded-md outline-none"
              style={{ border: '1.5px solid #8b5cf6', background: '#faf9ff' }}
              disabled={loading}
            />
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={() => { setShowCustom(false); setCustomPrompt(''); }}
                className="flex-1 text-xs py-1.5 rounded-md transition-colors"
                style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => runAction('ask_ai', { prompt: customPrompt })}
                disabled={!customPrompt.trim() || loading}
                className="flex-1 text-xs py-1.5 rounded-md text-white font-medium transition-opacity disabled:opacity-50"
                style={{ background: '#7c3aed' }}
              >
                {loading ? '...' : 'Send'}
              </button>
            </div>
          </div>
        ) : activeSub ? (
          /* Sub-menu (tone / translate) */
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: '#f0f0ef' }}>
              <button onClick={() => setActiveSub(null)} className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>
                {activeSub === 'change_tone' ? 'Change tone to...' : 'Translate to...'}
              </span>
            </div>
            <div className="py-1 max-h-60 overflow-y-auto">
              {(activeSub === 'change_tone' ? TONES : LANGUAGES).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (activeSub === 'change_tone') runAction('change_tone', { tone: opt.value });
                    else runAction('translate', { target_language: opt.value });
                  }}
                  disabled={loading}
                  className="w-full text-left text-xs px-3 py-2 transition-colors disabled:opacity-50"
                  style={{ color: 'var(--notion-text)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Main menu */
          <div className="py-1">
            {MENU_ITEMS.map((item, i) => {
              if (item.divider) return <div key={i} className="h-px mx-2 my-1" style={{ background: '#f0f0ef' }} />;
              return (
                <button
                  key={i}
                  disabled={loading}
                  onClick={() => {
                    if (item.action === 'ask_ai') { setShowCustom(true); setTimeout(() => promptRef.current?.focus(), 50); return; }
                    if (item.sub) { setActiveSub(item.subAction!); return; }
                    if (item.action) runAction(item.action);
                  }}
                  className="w-full flex items-center gap-2.5 text-xs px-3 py-[7px] text-left transition-colors disabled:opacity-50"
                  style={{ color: item.action === 'ask_ai' ? '#7c3aed' : 'var(--notion-text)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = item.action === 'ask_ai' ? '#faf9ff' : 'var(--notion-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 18, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><HandIcon name={item.icon} size={14} /></span>
                  <span className="flex-1">{item.label}</span>
                  {item.sub && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--notion-text-muted)' }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="px-3 py-2 text-xs border-t" style={{ color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
