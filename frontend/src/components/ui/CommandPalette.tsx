'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { HandIcon } from '@/components/ui/HandIcon';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  tenant: string;
}

export default function CommandPalette({ open, onClose, tenant }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems: CommandItem[] = [
    // Navigation
    { id: 'nav-workspace', label: 'Workspace', description: 'Go to Workspace', icon: 'document', group: 'Navigate', action: () => { router.push(`/${tenant}/workspace`); onClose(); } },
    { id: 'nav-crm', label: 'CRM', description: 'Go to CRM', icon: 'people-group', group: 'Navigate', action: () => { router.push(`/${tenant}/crm`); onClose(); } },
    { id: 'nav-hr', label: 'HR & People', description: 'Go to HR', icon: 'building', group: 'Navigate', action: () => { router.push(`/${tenant}/hr`); onClose(); } },
    { id: 'nav-accounting', label: 'Accounting', description: 'Go to Accounting', icon: 'credit-card', group: 'Navigate', action: () => { router.push(`/${tenant}/accounting`); onClose(); } },
    { id: 'nav-inventory', label: 'Inventory', description: 'Go to Inventory', icon: 'package', group: 'Navigate', action: () => { router.push(`/${tenant}/inventory`); onClose(); } },
    { id: 'nav-integrations', label: 'Integrations', description: 'Go to Integrations', icon: 'link', group: 'Navigate', action: () => { router.push(`/${tenant}/settings/integrations`); onClose(); } },
  ];

  const filtered = query.trim()
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.description?.toLowerCase().includes(query.toLowerCase()) ||
        item.group.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  const groups = Array.from(new Set(filtered.map(i => i.group)));

  const flatItems = groups.flatMap(g => filtered.filter(i => i.group === g));

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatItems.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      flatItems[activeIdx]?.action();
    }
  }, [open, flatItems, activeIdx, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[480px] max-h-[60vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--notion-card-elevated, var(--notion-card, white))', borderColor: 'var(--notion-border)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search or jump to..."
            className="flex-1 outline-none text-sm bg-transparent"
            style={{ color: 'var(--notion-text)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-active)' }}>
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
          {flatItems.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {groups.map(group => {
            const items = filtered.filter(i => i.group === group);
            const startIdx = flatItems.findIndex(i => i.group === group);
            return (
              <div key={group}>
                <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--notion-text-muted)' }}>
                  {group}
                </div>
                {items.map((item, relIdx) => {
                  const absIdx = startIdx + relIdx;
                  const isActive = absIdx === activeIdx;
                  return (
                    <button
                      key={item.id}
                      data-idx={absIdx}
                      onClick={item.action}
                      onMouseEnter={() => setActiveIdx(absIdx)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                      style={{
                        background: isActive ? 'var(--notion-hover)' : 'transparent',
                        color: 'var(--notion-text)',
                      }}
                    >
                      {item.icon && <span className="w-5 text-center flex-shrink-0"><HandIcon name={item.icon} size={16} /></span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{item.label}</div>
                        {item.description && (
                          <div className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>{item.description}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t flex items-center gap-4 text-xs" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}>
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
