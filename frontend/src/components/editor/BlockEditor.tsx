'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { api } from '@/lib/api';
import EditorContextMenu, { AIAction } from './EditorContextMenu';

export interface BlockEditorHandle {
  /** Insert text at the current cursor position (or end of doc) */
  insertAtCursor: (text: string) => void;
}

interface BlockEditorProps {
  pageId: string;
  initialContent?: any;
  onContentChange?: (blocks: any[]) => void; // if provided, skip auto-save
  /** Called once the editor is ready; provides insertAtCursor imperative handle */
  onReady?: (handle: BlockEditorHandle) => void;
}

export default function BlockEditor({ pageId, initialContent, onContentChange, onReady }: BlockEditorProps) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    selectedText: string;
    position: { x: number; y: number };
    blockId?: string;
    blockType?: string;
    blockProps?: Record<string, any>;
  } | null>(null);

  // BlockNote requires initialContent to be an array of valid Block objects.
  // Sanitize blocks to avoid NaN / null props / null styles that crash useCreateBlockNote.
  const parsedInitial = (() => {
    if (!Array.isArray(initialContent) || initialContent.length === 0) return undefined;
    try {
      // Deep-sanitize: fix NaN, null props, null styles
      const fixBlock = (b: any): any => {
        if (!b || typeof b !== 'object' || typeof b.type !== 'string') return null;
        // Ensure props is always an object (BlockNote does Object.entries(props))
        if (b.props === null || b.props === undefined) b.props = {};
        // Sanitize inline content styles
        if (Array.isArray(b.content)) {
          b.content = b.content.map((ic: any) => {
            if (ic && typeof ic === 'object') {
              if (ic.styles === null || ic.styles === undefined) ic.styles = {};
            }
            return ic;
          });
        }
        // Recurse into children
        if (Array.isArray(b.children)) {
          b.children = b.children.map(fixBlock).filter(Boolean);
        }
        return b;
      };
      const sanitized = JSON.parse(
        JSON.stringify(initialContent, (_key, value) =>
          typeof value === 'number' && isNaN(value) ? undefined : value
        )
      );
      if (!Array.isArray(sanitized) || sanitized.length === 0) return undefined;
      const fixed = sanitized.map(fixBlock).filter(Boolean);
      return fixed.length > 0 ? fixed : undefined;
    } catch {
      return undefined;
    }
  })();

  const editor = useCreateBlockNote({ initialContent: parsedInitial });

  // Expose insertAtCursor to parent via onReady callback
  useEffect(() => {
    if (!onReady) return;
    onReady({
      insertAtCursor(text: string) {
        console.log('[BlockEditor] insertAtCursor called:', JSON.stringify(text));
        if (!text.trim()) return;
        try {
          // Insert inline at the actual cursor position (like typing)
          const tiptap = (editor as any)._tiptapEditor;
          console.log('[BlockEditor] tiptap available:', !!tiptap, 'focused:', tiptap?.isFocused);
          if (tiptap) {
            // Focus editor if not focused, so insertContent has a valid selection
            if (!tiptap.isFocused) {
              tiptap.commands.focus('end');
            }
            const ok = tiptap.commands.insertContent(text);
            console.log('[BlockEditor] insertContent result:', ok);
            return;
          }
        } catch (e) { console.error('[BlockEditor] tiptap insert failed:', e); }
        // Fallback: append as new paragraph at end
        try {
          const lastBlock = editor.document[editor.document.length - 1];
          // @ts-ignore
          editor.insertBlocks([{
            type: 'paragraph',
            content: [{ type: 'text', text, styles: {} }],
          }], lastBlock, 'after');
          console.log('[BlockEditor] fallback insert done');
        } catch (e) { console.error('[BlockEditor] fallback insert failed:', e); }
      },
    });
  }, [editor, onReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert generic AI JSON blocks → BlockNote native format
  useEffect(() => {
    if (!initialContent || !Array.isArray(initialContent)) return;
    // Already in BlockNote format (has 'id' field)
    if (initialContent.length > 0 && initialContent[0].id) return;

    const convertedBlocks = initialContent.map((b: any) => {
      if (b.type === 'heading') return { type: 'heading', props: { level: b.level ?? 1 }, content: typeof b.content === 'string' ? [{ type: 'text', text: b.content, styles: {} }] : b.content };
      if (b.type === 'paragraph') return { type: 'paragraph', content: typeof b.content === 'string' ? [{ type: 'text', text: b.content, styles: {} }] : (b.content || []) };
      if (b.type === 'bullet_list' || b.type === 'bulletListItem') return { type: 'bulletListItem', content: typeof b.content === 'string' ? [{ type: 'text', text: b.content, styles: {} }] : (b.content || []) };
      if (b.type === 'numbered_list' || b.type === 'numberedListItem') return { type: 'numberedListItem', content: typeof b.content === 'string' ? [{ type: 'text', text: b.content, styles: {} }] : (b.content || []) };
      if (b.type === 'table') return { type: 'paragraph', content: [{ type: 'text', text: `[Table] ${(b.columns || []).join(' | ')}`, styles: {} }] };
      const text = typeof b.content === 'string' ? b.content : (b.text || '');
      return { type: 'paragraph', content: text ? [{ type: 'text', text, styles: {} }] : [] };
    }).filter(Boolean);

    try {
      // @ts-ignore
      editor.replaceBlocks(editor.document, convertedBlocks);
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: if content is {text: "..."} markdown format, convert to BlockNote blocks
  useEffect(() => {
    if (!initialContent?.text || typeof initialContent.text !== 'string') return;
    editor.tryParseMarkdownToBlocks(initialContent.text).then(blocks => {
      if (blocks.length > 0) {
        try { editor.replaceBlocks(editor.document, blocks); } catch {}
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(() => {
    if (onContentChange) {
      onContentChange(editor.document);
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.patch(`/api/workspace/pages/${pageId}`, { content: editor.document });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 800);
  }, [editor, pageId, onContentChange]);

  // ── Context menu: detect text selection ───────────────────────────────────
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Small delay to let selection settle
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text || text.length < 2) {
        setContextMenu(null);
        return;
      }
      // Check selection is within this editor container
      if (!containerRef.current || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) return;

      // Capture block info from the cursor position
      let blockId: string | undefined;
      let blockType: string | undefined;
      let blockProps: Record<string, any> | undefined;
      try {
        const cursorPos = editor.getTextCursorPosition();
        const block = cursorPos.block;
        blockId = block.id;
        blockType = block.type;
        blockProps = block.props as Record<string, any>;
      } catch { /* ignore */ }

      // Position: just below the mouse cursor
      setContextMenu({
        selectedText: text,
        position: { x: e.clientX, y: e.clientY + 12 },
        blockId,
        blockType,
        blockProps,
      });
    }, 50);
  }, [editor]);

  // Handle AI result: insert as new paragraph after current selection
  const handleAIResult = useCallback((result: string, action: AIAction) => {
    if (!result.trim()) return;
    try {
      // Get current cursor block
      const currentBlock = editor.getTextCursorPosition().block;
      const newParagraph = {
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: result, styles: {} }],
      };
      // @ts-ignore — insertBlocks works with partial block types
      editor.insertBlocks([newParagraph], currentBlock, 'after');
    } catch {
      // Fallback: append to end
      try {
        const lastBlock = editor.document[editor.document.length - 1];
        // @ts-ignore
        editor.insertBlocks([{
          type: 'paragraph',
          content: [{ type: 'text', text: result, styles: {} }],
        }], lastBlock, 'after');
      } catch {}
    }
    setContextMenu(null);
  }, [editor]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onMouseUp={handleMouseUp}>
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme="light"
      />
      {contextMenu && (
        <EditorContextMenu
          pageId={pageId}
          editor={editor}
          selectedText={contextMenu.selectedText}
          position={contextMenu.position}
          blockId={contextMenu.blockId}
          blockType={contextMenu.blockType}
          blockProps={contextMenu.blockProps}
          onResult={handleAIResult}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
