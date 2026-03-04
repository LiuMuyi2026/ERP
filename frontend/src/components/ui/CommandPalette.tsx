'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { HandIcon } from '@/components/ui/HandIcon';
import { api } from '@/lib/api';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group: string;
  keywords?: string[];
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
  const [remoteItems, setRemoteItems] = useState<CommandItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [onClose, router]);

  const baseItems: CommandItem[] = useMemo(() => ([
    { id: 'page-workspace', label: 'Workspace', description: 'Pages, docs, templates', icon: 'document', group: 'Pages', keywords: ['docs', 'knowledge'], action: () => navigate(`/${tenant}/workspace`) },
    { id: 'page-crm', label: 'CRM', description: 'Leads, pipeline, contracts', icon: 'people-group', group: 'Pages', keywords: ['leads', 'customers', 'contracts'], action: () => navigate(`/${tenant}/crm`) },
    { id: 'page-customers', label: 'Customer Center', description: 'Customer list and 360 view', icon: 'building', group: 'Pages', keywords: ['customer', 'account'], action: () => navigate(`/${tenant}/crm/customers`) },
    { id: 'page-messages', label: 'Messages', description: 'WhatsApp, email, internal messages', icon: 'chat-bubble', group: 'Pages', keywords: ['whatsapp', 'email', 'inbox'], action: () => navigate(`/${tenant}/messages`) },
    { id: 'page-orders', label: 'Orders', description: 'Purchase and sales orders', icon: 'receipt', group: 'Pages', keywords: ['purchase', 'sales'], action: () => navigate(`/${tenant}/orders`) },
    { id: 'page-inventory', label: 'Inventory', description: 'Products, stock, suppliers', icon: 'factory', group: 'Pages', keywords: ['stock', 'supplier', 'warehouse'], action: () => navigate(`/${tenant}/inventory`) },
    { id: 'page-accounting', label: 'Accounting', description: 'Financials, invoices, balances', icon: 'money-bag', group: 'Pages', keywords: ['finance', 'invoice'], action: () => navigate(`/${tenant}/accounting`) },
    { id: 'page-hr', label: 'HR & People', description: 'Employees and leave management', icon: 'person', group: 'Pages', keywords: ['employee', 'leave'], action: () => navigate(`/${tenant}/hr`) },
    { id: 'page-operations', label: 'Operations', description: 'Operational workflows', icon: 'box', group: 'Pages', keywords: ['operations'], action: () => navigate(`/${tenant}/operations`) },
    { id: 'sys-settings', label: 'Settings', description: 'Tenant settings and preferences', icon: 'settings', group: 'System', keywords: ['profile', 'preferences'], action: () => navigate(`/${tenant}/settings`) },
    { id: 'sys-integrations', label: 'Integrations', description: 'Connected apps and automations', icon: 'link', group: 'System', keywords: ['app', 'n8n', 'automation'], action: () => navigate(`/${tenant}/settings/integrations`) },
    { id: 'sys-notifications', label: 'Notifications', description: 'Alerts and reminders', icon: 'bell', group: 'System', keywords: ['alerts'], action: () => navigate(`/${tenant}/notifications`) },
    { id: 'sys-admin', label: 'Admin', description: 'Permissions and system administration', icon: 'shield', group: 'System', keywords: ['roles', 'permission', 'users'], action: () => navigate(`/${tenant}/admin`) },
  ]), [navigate, tenant]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setRemoteItems([]);
      setRemoteLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setRemoteLoading(true);
      try {
        const [workspaceRes, integrationRes] = await Promise.allSettled([
          api.get(`/api/workspace/search?q=${encodeURIComponent(q)}`),
          api.get(`/api/integrations/directory/apps?q=${encodeURIComponent(q)}`),
        ]);

        const items: CommandItem[] = [];
        if (workspaceRes.status === 'fulfilled' && Array.isArray(workspaceRes.value)) {
          for (const row of workspaceRes.value.slice(0, 20)) {
            items.push({
              id: `workspace-page-${row.id}`,
              label: row.title || 'Untitled',
              description: row.workspace_name ? `Workspace: ${row.workspace_name}` : 'Workspace page',
              icon: 'document',
              group: 'Workspace Pages',
              keywords: ['workspace', 'page'],
              action: () => navigate(`/${tenant}/workspace/${row.id}`),
            });
          }
        }
        if (integrationRes.status === 'fulfilled' && Array.isArray(integrationRes.value)) {
          for (const app of integrationRes.value.slice(0, 12)) {
            const desc = [app.source, app.category, app.description].filter(Boolean).join(' · ');
            items.push({
              id: `integration-app-${app.app_key || app.id}`,
              label: app.name || app.app_key || 'Integration App',
              description: desc || 'Integration app',
              icon: 'link',
              group: 'System Info',
              keywords: ['integration', 'app', String(app.app_key || '')],
              action: () => navigate(`/${tenant}/settings/integrations`),
            });
          }
        }
        setRemoteItems(items);
      } catch {
        setRemoteItems([]);
      } finally {
        setRemoteLoading(false);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [open, query, navigate, tenant]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredLocal = normalizedQuery
    ? baseItems.filter(item =>
      item.label.toLowerCase().includes(normalizedQuery) ||
      item.description?.toLowerCase().includes(normalizedQuery) ||
      item.group.toLowerCase().includes(normalizedQuery) ||
      item.keywords?.some((kw) => kw.toLowerCase().includes(normalizedQuery))
    )
    : baseItems;

  const filtered = [...filteredLocal, ...remoteItems];
  const seen = new Set<string>();
  const deduped = filtered.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  const groups = Array.from(new Set(deduped.map(i => i.group)));

  const flatItems = groups.flatMap(g => deduped.filter(i => i.group === g));

  useEffect(() => {
    if (open) {
      setQuery('');
      setRemoteItems([]);
      setRemoteLoading(false);
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
    if (flatItems.length === 0) return;
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

  useEffect(() => {
    setActiveIdx((idx) => {
      if (flatItems.length === 0) return 0;
      return Math.min(idx, flatItems.length - 1);
    });
  }, [flatItems.length]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[92vw] max-w-[640px] max-h-[70vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden"
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
          {remoteLoading && (
            <div className="px-4 py-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
              Searching...
            </div>
          )}
          {!remoteLoading && query.trim().length > 0 && query.trim().length < 2 && (
            <div className="px-4 py-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
              Type at least 2 characters to search workspace pages and system data.
            </div>
          )}
          {flatItems.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {groups.map(group => {
            const items = deduped.filter(i => i.group === group);
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
