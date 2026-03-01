'use client';

/**
 * EditorContextMenu
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating context menu that appears near selected text inside the block editor.
 * Sections:
 *   1. Clipboard: Cut / Copy / Paste
 *   2. Inline formatting: Bold / Italic / Underline / Strikethrough
 *   3. Block-level: Heading (H1/H2/H3/T) + Alignment (left/center/right)
 *   4. Comment
 *   5. AI: Polish / Ask AI / More AI features (sub-menu)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';
import type { BlockNoteEditor } from '@blocknote/core';

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

interface EditorContextMenuProps {
  pageId: string;
  editor: BlockNoteEditor<any, any, any>;
  selectedText: string;
  position: { x: number; y: number };
  blockId?: string;
  blockType?: string;
  blockProps?: Record<string, any>;
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
  { label: 'English', value: 'English' },
  { label: '简体中文', value: 'Chinese (Simplified)' },
  { label: '日本語', value: 'Japanese' },
  { label: '한국어', value: 'Korean' },
  { label: 'Deutsch', value: 'German' },
  { label: 'Français', value: 'French' },
  { label: 'Español', value: 'Spanish' },
  { label: 'Português', value: 'Portuguese' },
  { label: 'Русский', value: 'Russian' },
  { label: 'العربية', value: 'Arabic' },
];

interface AIMenuItem {
  icon: string;
  labelKey: string;
  fallbackLabel: string;
  action?: AIAction;
  sub?: { label: string; value: string }[];
  subAction?: AIAction;
  divider?: boolean;
}

const AI_MENU_ITEMS: AIMenuItem[] = [
  { icon: 'writing-hand', labelKey: 'improveWriting', fallbackLabel: 'Improve writing', action: 'rewrite' },
  { icon: 'text-abc', labelKey: 'fixGrammar', fallbackLabel: 'Fix spelling & grammar', action: 'fix_grammar' },
  { icon: 'arrows-vertical', labelKey: 'makeShorter', fallbackLabel: 'Make shorter', action: 'shorter' },
  { icon: 'arrow-down', labelKey: 'makeLonger', fallbackLabel: 'Make longer', action: 'longer' },
  { icon: 'document-pen', labelKey: 'summarizePage', fallbackLabel: 'Summarize', action: 'summarize' },
  { icon: 'lightbulb', labelKey: 'explain', fallbackLabel: 'Explain this', action: 'explain' },
  { icon: 'arrow-right', labelKey: 'continueWriting', fallbackLabel: 'Continue writing', action: 'continue_writing' },
  { icon: '', labelKey: '', fallbackLabel: '', divider: true },
  { icon: 'masks', labelKey: 'changeTone', fallbackLabel: 'Change tone', subAction: 'change_tone', sub: TONES },
  { icon: 'globe', labelKey: 'translateTo', fallbackLabel: 'Translate', subAction: 'translate', sub: LANGUAGES },
  { icon: 'checkmark', labelKey: 'extractActions', fallbackLabel: 'Extract action items', action: 'extract_actions' },
];

type MenuView = 'main' | 'comment' | 'askAI' | 'moreAI' | 'subMenu';

export default function EditorContextMenu({
  pageId,
  editor,
  selectedText,
  position,
  blockId,
  blockType,
  blockProps,
  onResult,
  onClose,
}: EditorContextMenuProps) {
  const ws = useTranslations('workspace');
  const menuRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<MenuView>('main');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Comment state
  const [commentText, setCommentText] = useState('');
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Ask AI state
  const [aiPrompt, setAiPrompt] = useState('');
  const aiPromptRef = useRef<HTMLInputElement>(null);

  // Sub-menu state (tone / translate)
  const [activeSub, setActiveSub] = useState<string | null>(null);

  // Active styles
  const [activeStyles, setActiveStyles] = useState<Record<string, boolean>>({});

  // Read current active styles from editor
  useEffect(() => {
    try {
      const styles = editor.getActiveStyles();
      setActiveStyles({
        bold: !!styles.bold,
        italic: !!styles.italic,
        underline: !!styles.underline,
        strike: !!styles.strike,
      });
    } catch {
      // ignore
    }
  }, [editor, selectedText]);

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (view !== 'main') setView('main');
        else onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, view]);

  // Focus inputs when views change
  useEffect(() => {
    if (view === 'comment') setTimeout(() => commentRef.current?.focus(), 50);
    if (view === 'askAI') setTimeout(() => aiPromptRef.current?.focus(), 50);
  }, [view]);

  // Prevent mousedown from clearing selection
  const prevent = (e: React.MouseEvent) => e.preventDefault();

  // ── Clipboard ──────────────────────────────────────────────────────────────

  const handleCut = useCallback(() => {
    document.execCommand('cut');
    onClose();
  }, [onClose]);

  const handleCopy = useCallback(() => {
    document.execCommand('copy');
    onClose();
  }, [onClose]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor._tiptapEditor.commands.insertContent(text);
      }
    } catch {
      document.execCommand('paste');
    }
    onClose();
  }, [editor, onClose]);

  // ── Formatting ─────────────────────────────────────────────────────────────

  const toggleStyle = useCallback((style: 'bold' | 'italic' | 'underline' | 'strike') => {
    editor.toggleStyles({ [style]: true });
    // Update active state
    try {
      const styles = editor.getActiveStyles();
      setActiveStyles(prev => ({ ...prev, [style]: !!styles[style] }));
    } catch {
      setActiveStyles(prev => ({ ...prev, [style]: !prev[style] }));
    }
  }, [editor]);

  // ── Block-level: Heading ───────────────────────────────────────────────────

  const setHeading = useCallback((level: number | null) => {
    try {
      const cursorPos = editor.getTextCursorPosition();
      const block = cursorPos.block;
      if (level === null) {
        // Convert to paragraph
        editor.updateBlock(block, { type: 'paragraph' as any });
      } else {
        editor.updateBlock(block, { type: 'heading' as any, props: { level } as any });
      }
    } catch { /* ignore */ }
  }, [editor]);

  // ── Block-level: Alignment ─────────────────────────────────────────────────

  const setAlignment = useCallback((align: 'left' | 'center' | 'right') => {
    try {
      const cursorPos = editor.getTextCursorPosition();
      const block = cursorPos.block;
      editor.updateBlock(block, { props: { textAlignment: align } as any });
    } catch { /* ignore */ }
  }, [editor]);

  // ── Comment ────────────────────────────────────────────────────────────────

  const submitComment = useCallback(async () => {
    if (!commentText.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post(`/api/workspace/pages/${pageId}/comments`, {
        block_id: blockId || null,
        selected_text: selectedText,
        comment_text: commentText.trim(),
      });
      setCommentText('');
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to add comment');
    } finally {
      setLoading(false);
    }
  }, [pageId, blockId, selectedText, commentText, onClose]);

  // ── AI Actions ─────────────────────────────────────────────────────────────

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
        body.prompt = extra?.prompt || aiPrompt;
        body.text = selectedText;
      }
      const res = await api.post(`/api/workspace/pages/${pageId}/ai-action`, body);
      if (res.type === 'json') {
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
  }, [pageId, selectedText, aiPrompt, onResult, onClose]);

  // ── Position ───────────────────────────────────────────────────────────────

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    top: Math.min(position.y, window.innerHeight - 460),
    left: Math.min(position.x, window.innerWidth - 340),
  };

  // Current heading level for highlighting
  const currentHeadingLevel = blockType === 'heading' ? (blockProps?.level ?? 1) : 0;
  const currentAlignment = blockProps?.textAlignment || 'left';

  // ── Helpers ────────────────────────────────────────────────────────────────


  const BtnIcon = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
    <button
      onMouseDown={prevent}
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded-md transition-colors"
      style={{
        width: 30,
        height: 28,
        background: active ? '#ede9fe' : 'transparent',
        color: active ? '#7c3aed' : '#374151',
        fontWeight: active ? 700 : 500,
        fontSize: 12,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f3f4f6'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={menuRef} style={style} className="select-none" onMouseDown={prevent}>
      <div
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          width: 296,
          background: 'white',
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {/* ── Main view ─────────────────────────────────────────────── */}
        {view === 'main' && (
          <>
            {/* Row 1: Clipboard */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b" style={{ borderColor: '#f0f0ef' }}>
              <button onMouseDown={prevent} onClick={handleCut}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors flex-1 justify-center"
                style={{ color: '#374151' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2.8A.8.8 0 0 1 6.8 2h10.4a.8.8 0 0 1 .8.8V9"/><path d="M18 12.5V22H6V12.5"/><path d="M2 9h20v3H2z"/></svg>
                {ws('cut')}
              </button>
              <button onMouseDown={prevent} onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors flex-1 justify-center"
                style={{ color: '#374151' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <HandIcon name="clipboard" size={12} />
                {ws('copy')}
              </button>
              <button onMouseDown={prevent} onClick={handlePaste}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors flex-1 justify-center"
                style={{ color: '#374151' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                {ws('paste')}
              </button>
            </div>

            {/* Row 2: Inline formatting */}
            <div className="flex items-center gap-0.5 px-2 py-1 border-b" style={{ borderColor: '#f0f0ef' }}>
              <BtnIcon active={activeStyles.bold} onClick={() => toggleStyle('bold')} title={ws('bold')}>
                <strong>B</strong>
              </BtnIcon>
              <BtnIcon active={activeStyles.italic} onClick={() => toggleStyle('italic')} title={ws('italic')}>
                <em style={{ fontStyle: 'italic' }}>I</em>
              </BtnIcon>
              <BtnIcon active={activeStyles.underline} onClick={() => toggleStyle('underline')} title={ws('underline')}>
                <span style={{ textDecoration: 'underline' }}>U</span>
              </BtnIcon>
              <BtnIcon active={activeStyles.strike} onClick={() => toggleStyle('strike')} title={ws('strikethrough')}>
                <span style={{ textDecoration: 'line-through' }}>S</span>
              </BtnIcon>
            </div>

            {/* Row 3: Heading + Alignment */}
            <div className="flex items-center px-2 py-1 border-b" style={{ borderColor: '#f0f0ef' }}>
              {/* Headings */}
              <div className="flex items-center gap-0.5 flex-1">
                <BtnIcon active={currentHeadingLevel === 1} onClick={() => setHeading(1)} title="Heading 1">
                  <span style={{ fontSize: 11, fontWeight: 700 }}>H1</span>
                </BtnIcon>
                <BtnIcon active={currentHeadingLevel === 2} onClick={() => setHeading(2)} title="Heading 2">
                  <span style={{ fontSize: 11, fontWeight: 700 }}>H2</span>
                </BtnIcon>
                <BtnIcon active={currentHeadingLevel === 3} onClick={() => setHeading(3)} title="Heading 3">
                  <span style={{ fontSize: 11, fontWeight: 700 }}>H3</span>
                </BtnIcon>
                <BtnIcon active={currentHeadingLevel === 0 && blockType === 'paragraph'} onClick={() => setHeading(null)} title={ws('normalText')}>
                  <span style={{ fontSize: 11 }}>T</span>
                </BtnIcon>
              </div>
              {/* Divider */}
              <div style={{ width: 1, height: 18, background: '#e5e7eb', margin: '0 4px' }} />
              {/* Alignment */}
              <div className="flex items-center gap-0.5">
                <BtnIcon active={currentAlignment === 'left'} onClick={() => setAlignment('left')} title={ws('alignLeft')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
                </BtnIcon>
                <BtnIcon active={currentAlignment === 'center'} onClick={() => setAlignment('center')} title={ws('alignCenter')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                </BtnIcon>
                <BtnIcon active={currentAlignment === 'right'} onClick={() => setAlignment('right')} title={ws('alignRight')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
                </BtnIcon>
              </div>
            </div>

            {/* Row 4: Comment */}
            <div className="border-b" style={{ borderColor: '#f0f0ef' }}>
              <button
                onMouseDown={prevent}
                onClick={() => setView('comment')}
                className="w-full flex items-center gap-2.5 text-xs px-3 py-[7px] text-left transition-colors"
                style={{ color: '#374151' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <HandIcon name="chat-bubble" size={14} />
                {ws('addComment')}
              </button>
            </div>

            {/* Row 5: AI section */}
            <div className="py-0.5">
              {/* AI Polish */}
              <button
                onMouseDown={prevent}
                onClick={() => runAction('rewrite')}
                disabled={loading}
                className="w-full flex items-center gap-2.5 text-xs px-3 py-[7px] text-left transition-colors disabled:opacity-50"
                style={{ color: '#7c3aed' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#faf9ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <HandIcon name="sparkle-star" size={14} />
                {ws('aiPolish')}
                {loading && (
                  <svg className="animate-spin ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
              </button>

              {/* Ask AI */}
              <button
                onMouseDown={prevent}
                onClick={() => setView('askAI')}
                className="w-full flex items-center gap-2.5 text-xs px-3 py-[7px] text-left transition-colors"
                style={{ color: '#7c3aed' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#faf9ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <HandIcon name="robot" size={14} />
                {ws('askAI')}
              </button>

              {/* More AI features */}
              <button
                onMouseDown={prevent}
                onClick={() => setView('moreAI')}
                className="w-full flex items-center gap-2.5 text-xs px-3 py-[7px] text-left transition-colors"
                style={{ color: '#6b7280' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                {ws('moreAI')}
              </button>
            </div>
          </>
        )}

        {/* ── Comment view ────────────────────────────────────────── */}
        {view === 'comment' && (
          <div className="p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <button onMouseDown={prevent} onClick={() => setView('main')} className="text-xs p-1 rounded transition-colors" style={{ color: '#6b7280' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="text-xs font-medium" style={{ color: '#374151' }}>
                <HandIcon name="chat-bubble" size={12} /> {ws('addComment')}
              </span>
            </div>
            <div className="rounded-lg px-2 py-1.5 mb-2 text-[11px] truncate" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
              &ldquo;{selectedText.length > 80 ? selectedText.slice(0, 80) + '...' : selectedText}&rdquo;
            </div>
            <textarea
              ref={commentRef}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) {
                  e.preventDefault();
                  submitComment();
                }
              }}
              placeholder={ws('commentPlaceholder')}
              className="w-full text-xs px-2.5 py-2 rounded-md outline-none resize-none"
              style={{ border: '1.5px solid #d1d5db', background: '#fafafa', minHeight: 60 }}
              disabled={loading}
            />
            <div className="flex items-center gap-1.5 mt-2">
              <button onMouseDown={prevent} onClick={() => setView('main')}
                className="flex-1 text-xs py-1.5 rounded-md transition-colors"
                style={{ color: '#6b7280', border: '1px solid #e5e7eb' }}
              >
                {ws('cancel')}
              </button>
              <button
                onMouseDown={prevent}
                onClick={submitComment}
                disabled={!commentText.trim() || loading}
                className="flex-1 text-xs py-1.5 rounded-md text-white font-medium transition-opacity disabled:opacity-50"
                style={{ background: '#7c3aed' }}
              >
                {loading ? '...' : (ws('submit'))}
              </button>
            </div>
          </div>
        )}

        {/* ── Ask AI view ─────────────────────────────────────────── */}
        {view === 'askAI' && (
          <div className="p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <button onMouseDown={prevent} onClick={() => setView('main')} className="text-xs p-1 rounded transition-colors" style={{ color: '#6b7280' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="text-xs font-medium" style={{ color: '#7c3aed' }}>
                <HandIcon name="robot" size={12} /> {ws('askAI')}
              </span>
            </div>
            <input
              ref={aiPromptRef}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && aiPrompt.trim()) {
                  e.preventDefault();
                  runAction('ask_ai', { prompt: aiPrompt });
                }
              }}
              placeholder={ws('aiPromptPlaceholder')}
              className="w-full text-xs px-2.5 py-2 rounded-md outline-none"
              style={{ border: '1.5px solid #8b5cf6', background: '#faf9ff' }}
              disabled={loading}
            />
            <div className="flex items-center gap-1.5 mt-2">
              <button onMouseDown={prevent} onClick={() => setView('main')}
                className="flex-1 text-xs py-1.5 rounded-md transition-colors"
                style={{ color: '#6b7280', border: '1px solid #e5e7eb' }}
              >
                {ws('cancel')}
              </button>
              <button
                onMouseDown={prevent}
                onClick={() => runAction('ask_ai', { prompt: aiPrompt })}
                disabled={!aiPrompt.trim() || loading}
                className="flex-1 text-xs py-1.5 rounded-md text-white font-medium transition-opacity disabled:opacity-50"
                style={{ background: '#7c3aed' }}
              >
                {loading ? '...' : (ws('send'))}
              </button>
            </div>
          </div>
        )}

        {/* ── More AI view ────────────────────────────────────────── */}
        {view === 'moreAI' && !activeSub && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: '#f0f0ef' }}>
              <button onMouseDown={prevent} onClick={() => setView('main')} className="text-xs p-1 rounded transition-colors" style={{ color: '#6b7280' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div className="w-4 h-4 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white" style={{ fontSize: 8, fontWeight: 700 }}>AI</div>
              <span className="text-xs font-semibold" style={{ color: '#6b21a8' }}>{ws('moreAI')}</span>
              {loading && (
                <svg className="animate-spin ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
            </div>
            <div className="py-1">
              {AI_MENU_ITEMS.map((item, i) => {
                if (item.divider) return <div key={i} className="h-px mx-2 my-1" style={{ background: '#f0f0ef' }} />;
                return (
                  <button
                    key={i}
                    disabled={loading}
                    onMouseDown={prevent}
                    onClick={() => {
                      if (item.sub) { setActiveSub(item.subAction!); return; }
                      if (item.action) runAction(item.action);
                    }}
                    className="w-full flex items-center gap-2.5 text-xs px-3 py-[7px] text-left transition-colors disabled:opacity-50"
                    style={{ color: '#374151' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ width: 18, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <HandIcon name={item.icon} size={14} />
                    </span>
                    <span className="flex-1">{(ws as any)[item.labelKey] || item.fallbackLabel}</span>
                    {item.sub && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#9ca3af' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Sub-menu (tone / translate) ─────────────────────────── */}
        {view === 'moreAI' && activeSub && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: '#f0f0ef' }}>
              <button onMouseDown={prevent} onClick={() => setActiveSub(null)} className="text-xs p-1 rounded transition-colors" style={{ color: '#6b7280' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="text-xs font-medium" style={{ color: '#374151' }}>
                {activeSub === 'change_tone' ? (ws('changeTone')) : (ws('translateTo'))}
              </span>
            </div>
            <div className="py-1 max-h-60 overflow-y-auto">
              {(activeSub === 'change_tone' ? TONES : LANGUAGES).map(opt => (
                <button
                  key={opt.value}
                  onMouseDown={prevent}
                  onClick={() => {
                    if (activeSub === 'change_tone') runAction('change_tone', { tone: opt.value });
                    else runAction('translate', { target_language: opt.value });
                  }}
                  disabled={loading}
                  className="w-full text-left text-xs px-3 py-2 transition-colors disabled:opacity-50"
                  style={{ color: '#374151' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Error bar ───────────────────────────────────────────── */}
        {error && (
          <div className="px-3 py-2 text-xs border-t" style={{ color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
