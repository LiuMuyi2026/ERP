'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/lib/auth';
import { useTranslations, useLocale } from 'next-intl';
import { LangCode, LANGUAGES, setLocale } from '@/lib/locale';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import TemplateGallery from '@/components/workspace/TemplateGallery';
import NotificationBell from '@/components/layout/NotificationBell';
import MessagesPanel from '@/components/layout/MessagesPanel';
import SharePanel from '@/components/workspace/SharePanel';
import { HandIcon } from '@/components/ui/HandIcon';
import { IconOrEmoji } from '@/components/ui/IconOrEmoji';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Module-level drag tracking — safe since there is only one Sidebar instance
let _pageDragId: string | null = null;

interface SidebarProps {
  tenant: string;
  userName?: string;
  userRole?: string;
  avatarUrl?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenCommandPalette?: () => void;
}

interface TreeItem {
  id: string;
  type: 'workspace' | 'page';
  name?: string;
  title?: string;
  icon: string | null;
  visibility?: 'private' | 'team';
  owner_id?: string;
  current_user_role?: string | null; // workspace member role: 'admin'|'editor'|'viewer'|null
  children?: TreeItem[];
  workspace_id?: string;
  position?: number;
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const Icons = {
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  ),
  Workspace: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>
    </svg>
  ),
  Settings: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Plus: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  ChevronRight: ({ open }: { open: boolean }) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  More: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  Bell: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  PanelLeft: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
    </svg>
  ),
  GripVertical: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
      <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
      <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
    </svg>
  ),
  ArrowUp: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/>
    </svg>
  ),
  ArrowDown: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/>
    </svg>
  ),
  Copy: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  Share: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
  FileTemplate: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  Link: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  ChildPage: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Sun: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  Moon: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Monitor: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
};

// ── SidebarNavItem (Search / Workspace) ───────────────────────────────────────
function SidebarNavItem({
  icon, label, shortcut, onClick, active = false,
}: {
  icon: React.ReactNode; label: string; shortcut?: string; onClick?: () => void; active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 rounded-lg cursor-pointer transition-all"
      style={{
        height: 36,
        background: active ? 'var(--sb-active)' : 'transparent',
        color: active ? 'var(--sb-text)' : 'var(--sb-text-secondary)',
        fontWeight: active ? 600 : 400,
        fontSize: 15,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sb-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--sb-active)' : 'transparent'; }}
    >
      <span style={{ color: active ? 'var(--sb-text-secondary)' : 'var(--sb-text-muted)', flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span style={{ fontSize: 11, color: 'var(--sb-text-faint)', border: '1px solid var(--sb-border)', borderRadius: 4, padding: '0 4px' }}>{shortcut}</span>
      )}
    </div>
  );
}

// ── AppNavItem (CRM / HR / etc.) ───────────────────────────────────────────────
function AppNavItem({
  icon, label, bg, active, readOnly, href, readOnlyLabel,
}: {
  icon: string; label: string; bg: string; color: string;
  active: boolean; readOnly: boolean; href: string; readOnlyLabel?: string;
}) {
  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none' }} title={readOnly ? readOnlyLabel : undefined}>
      <div
        className="flex items-center gap-3 px-2.5 rounded-xl cursor-pointer transition-all"
        style={{
          height: 44,
          background: active ? 'var(--sb-surface)' : 'transparent',
          boxShadow: active ? 'var(--sb-card-shadow)' : 'none',
          color: active ? 'var(--sb-text)' : 'var(--sb-text-secondary)',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sb-hover)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--sb-surface)' : 'transparent'; }}
      >
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 30, height: 30, background: bg }}
        >
          <HandIcon name={icon} size={18} />
        </div>
        <span
          className="flex-1 truncate"
          style={{ fontSize: 15, fontWeight: active ? 600 : 500, color: active ? 'var(--sb-text)' : 'var(--sb-text-secondary)' }}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 mb-1 mt-1 group">
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--sb-text-faint)', textTransform: 'uppercase' }}>
        {label}
      </span>
      {onAdd && (
        <button
          onClick={onAdd}
          className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
          style={{ color: 'var(--sb-text-faint)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover-strong)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Icons.Plus />
        </button>
      )}
    </div>
  );
}

// ── SectionHeaderWithAdd ──────────────────────────────────────────────────────
function SectionHeaderWithAdd({ label, wsType, expanded, onToggle, onOpenTemplates, newPageLabel, onNavigate }: {
  label: string; wsType?: string; expanded: boolean; onToggle: () => void; onOpenTemplates: () => void; newPageLabel?: string;
  onNavigate?: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-1.5 px-1 rounded-lg mb-1 mt-2"
      style={{ height: 28 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--sb-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center flex-shrink-0 transition-opacity"
        style={{ width: 14, cursor: 'grab', color: 'var(--sb-text-faint)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <Icons.GripVertical />
      </span>
      {/* Chevron — toggles expand only */}
      <span
        style={{ color: 'var(--sb-text-faint)', flexShrink: 0, display: 'flex', cursor: 'pointer',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        onClick={e => { e.stopPropagation(); onToggle(); }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </span>
      {/* Icon + name — clicking navigates to the workspace file browser */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); onNavigate ? onNavigate() : onToggle(); }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: wsType === 'private'
            ? 'linear-gradient(135deg,#8b5cf6,#6366f1)'
            : 'linear-gradient(135deg,#3b82f6,#60a5fa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
        }}>
          <HandIcon name={wsType === 'private' ? 'lock' : 'building'} size={10} style={{ color: '#fff' }} />
        </div>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--sb-text-secondary)', letterSpacing: '0.01em' }} className="truncate">
          {label}
        </span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onOpenTemplates(); }}
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center rounded transition-opacity"
        style={{ width: 20, height: 20, flexShrink: 0, color: 'var(--sb-text-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover-strong)'; e.currentTarget.style.color = 'var(--sb-text-secondary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
        title={newPageLabel || 'New page'}
      >
        <Icons.Plus />
      </button>
    </div>
  );
}

// ── PageNodeMenu (dropdown) ──────────────────────────────────────────────────
function PageNodeMenu({
  page, tenant, wsId, onClose, onOpenTemplates, onReloadTree, onOpenShare,
}: {
  page: TreeItem; tenant: string; wsId: string;
  onClose: () => void;
  onOpenTemplates: (wsId: string, parentId: string) => void;
  onReloadTree: () => void;
  onOpenShare: (id: string, title: string) => void;
}) {
  const tNav = useTranslations('nav');
  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    const url = `${window.location.origin}/${tenant}/workspace/${page.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 800);
  }

  async function handleDuplicate() {
    try {
      await api.post(`/api/workspace/pages/${page.id}/copy-to`, { target_workspace_id: wsId });
      onReloadTree();
    } catch (err: any) { alert(err.message || 'Failed'); }
    onClose();
  }

  function handleAddChild() {
    onOpenTemplates(wsId, page.id);
    onClose();
  }

  function handleShare() {
    onOpenShare(page.id, page.title || 'Untitled');
    onClose();
  }

  async function handleSaveAsTemplate() {
    try {
      await api.post(`/api/workspace/pages/${page.id}/save-as-template`, {});
    } catch (err: any) { alert(err.message || 'Failed'); }
    onClose();
  }

  const items = [
    { icon: <Icons.Link />, label: copied ? tNav('copied') : tNav('copyLink'), onClick: handleCopyLink },
    { icon: <Icons.Copy />, label: tNav('duplicate'), onClick: handleDuplicate },
    { icon: <Icons.ChildPage />, label: tNav('addSubpage'), onClick: handleAddChild },
    { icon: <Icons.Share />, label: tNav('share'), onClick: handleShare },
    { icon: <Icons.FileTemplate />, label: tNav('saveAsTemplate'), onClick: handleSaveAsTemplate },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden"
        style={{ width: 200, background: 'var(--sb-surface)', border: '1px solid var(--sb-border)', boxShadow: 'var(--sb-shadow)', fontSize: 13, color: 'var(--sb-text-secondary)' }}
      >
        <div className="py-1">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); item.onClick(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
              style={{ color: 'var(--sb-text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ color: 'var(--sb-text-muted)', display: 'flex', flexShrink: 0 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── PageNode (recursive, accordion) ──────────────────────────────────────────
function PageNode({
  page, tenant, wsId, level, siblings, expandedIds, onToggle, onOpenTemplates,
  selectedPageId, onSelect, onDelete, onPageReorder, onReloadTree, onOpenShare, canDelete,
}: {
  page: TreeItem; tenant: string; wsId: string; level: number;
  siblings: TreeItem[];
  expandedIds: Set<string>;
  onToggle: (id: string, siblingIds: string[]) => void;
  onOpenTemplates: (wsId: string, parentId: string) => void;
  selectedPageId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onPageReorder: (fromId: string, toId: string, siblings: TreeItem[]) => void;
  onReloadTree: () => void;
  onOpenShare: (id: string, title: string) => void;
  canDelete: boolean;
}) {
  const pathname = usePathname();
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const expanded = expandedIds.has(page.id);
  const hasChildren = (page.children?.length ?? 0) > 0;
  const isActive = pathname === `/${tenant}/workspace/${page.id}`;
  const isSelected = selectedPageId === page.id;
  const siblingIds = siblings.map(c => c.id);
  const [showMenu, setShowMenu] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragStart(e: React.DragEvent) {
    _pageDragId = page.id;
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  }
  function handleDragEnd() {
    _pageDragId = null;
    setIsDragging(false);
    setDragOver(false);
  }
  function handleDragOver(e: React.DragEvent) {
    if (!_pageDragId || _pageDragId === page.id) return;
    if (!siblings.some(s => s.id === _pageDragId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }
  function handleDragLeave() { setDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const fromId = _pageDragId;
    if (!fromId || fromId === page.id) return;
    onPageReorder(fromId, page.id, siblings);
  }

  return (
    <div data-page-node>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="group/page flex items-center rounded-lg relative cursor-pointer"
        style={{
          minHeight: 32,
          paddingLeft: `${level * 14 + 4}px`,
          paddingRight: 6,
          background: dragOver
            ? 'var(--sb-drag-bg)'
            : isSelected ? 'var(--sb-selected)' : isActive ? 'var(--sb-active)' : 'transparent',
          color: isActive ? 'var(--sb-text)' : 'var(--sb-text-secondary)',
          fontWeight: isActive ? 600 : 400,
          fontSize: 14,
          opacity: isDragging ? 0.4 : 1,
          boxShadow: dragOver ? 'inset 0 2px 0 0 var(--sb-drag)' : undefined,
          transition: 'box-shadow 0.08s, background 0.08s',
        }}
        onMouseEnter={e => { if (!isSelected && !isActive && !dragOver) e.currentTarget.style.background = 'var(--sb-hover)'; }}
        onMouseLeave={e => {
          if (!isSelected && !dragOver) e.currentTarget.style.background = isActive ? 'var(--sb-active)' : 'transparent';
        }}
        onClick={e => { e.stopPropagation(); onSelect(page.id); }}
      >
        <span
          className="opacity-0 group-hover/page:opacity-100 flex items-center justify-center flex-shrink-0 transition-opacity"
          style={{ width: 14, height: 14, cursor: 'grab', color: 'var(--sb-text-faint)', marginRight: 2 }}
          onMouseDown={e => e.stopPropagation()}
        >
          <Icons.GripVertical />
        </span>

        <button
          className="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 mr-0.5"
          style={{ opacity: hasChildren ? 1 : 0, color: 'var(--sb-text-muted)' }}
          onClick={e => { e.stopPropagation(); onToggle(page.id, siblingIds); }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover-strong)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Icons.ChevronRight open={expanded} />
        </button>

        <Link
          href={`/${tenant}/workspace/${page.id}`}
          className="flex items-center flex-1 min-w-0 gap-1.5 py-1"
          style={{ textDecoration: 'none', color: 'inherit' }}
          onClick={e => e.stopPropagation()}
        >
          <span style={{ flexShrink: 0, display: 'flex' }}><IconOrEmoji value={page.icon || 'document'} size={15} /></span>
          <span className="truncate flex-1">{page.title || 'Untitled'}</span>
        </Link>

        {isSelected && (
          <div className="flex items-center gap-0.5 flex-shrink-0 relative">
            {canDelete && (
              <button
                className="p-1 rounded flex items-center justify-center"
                style={{ color: 'var(--sb-text-muted)' }}
                onClick={e => { e.stopPropagation(); onDelete(page.id); }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-danger-subtle)'; e.currentTarget.style.color = 'var(--sb-danger)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
                title={tCommon('delete')}
              >
                <Icons.Trash />
              </button>
            )}
            <button
              className="p-1 rounded flex items-center justify-center"
              style={{ color: showMenu ? 'var(--sb-text)' : 'var(--sb-text-muted)' }}
              onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover-strong)'; e.currentTarget.style.color = 'var(--sb-text)'; }}
              onMouseLeave={e => { if (!showMenu) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sb-text-muted)'; } }}
            >
              <Icons.More />
            </button>
            {showMenu && (
              <PageNodeMenu
                page={page} tenant={tenant} wsId={wsId}
                onClose={() => setShowMenu(false)}
                onOpenTemplates={onOpenTemplates}
                onReloadTree={onReloadTree}
                onOpenShare={onOpenShare}
              />
            )}
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', left: level * 14 + 20,
            top: 2, bottom: 2, width: 1,
            background: 'var(--sb-guide)', borderRadius: 1, pointerEvents: 'none',
          }} />
          {page.children!.map(child => (
            <PageNode key={child.id} page={child} tenant={tenant} wsId={wsId} level={level + 1}
              siblings={page.children!} expandedIds={expandedIds} onToggle={onToggle} onOpenTemplates={onOpenTemplates}
              selectedPageId={selectedPageId} onSelect={onSelect} onDelete={onDelete}
              onPageReorder={onPageReorder} onReloadTree={onReloadTree} onOpenShare={onOpenShare}
              canDelete={canDelete} />
          ))}
        </div>
      )}
      {expanded && !hasChildren && level > 0 && (
        <div style={{ paddingLeft: `${(level + 1) * 14 + 8}px`, fontSize: 12, color: 'var(--sb-text-faint)', fontStyle: 'italic', paddingTop: 4, paddingBottom: 4 }}>
          {tNav('noPages')}
        </div>
      )}
    </div>
  );
}

// ── UserMenu ──────────────────────────────────────────────────────────────────
function UserMenu({ userName, onLogout, onClose }: {
  userName?: string; onLogout: () => void; onClose: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const tNav = useTranslations('nav');
  const lang = useLocale();
  const [showLangMenu, setShowLangMenu] = useState(false);

  const themeOptions: { key: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }[] = [
    { key: 'light', icon: <Icons.Sun />, label: tNav('themeLight') },
    { key: 'dark', icon: <Icons.Moon />, label: tNav('themeDark') },
    { key: 'system', icon: <Icons.Monitor />, label: tNav('themeSystem') },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-[60px] left-3 w-64 rounded-xl z-50 py-1.5"
        style={{ fontSize: 14, color: 'var(--sb-text)', background: 'var(--sb-surface)', border: '1px solid var(--sb-border)', boxShadow: 'var(--sb-shadow)' }}>
        <div className="px-3 py-2 mb-1" style={{ borderBottom: '1px solid var(--sb-divider)' }}>
          <div style={{ fontSize: 11, color: 'var(--sb-text-faint)', marginBottom: 2 }}>{userName?.includes('@') ? userName.split('@')[1] : 'Nexus ERP'}</div>
          <div style={{ fontWeight: 600, fontSize: 14 }} className="truncate">{userName}</div>
        </div>
        <div className="px-1 py-0.5">
          {/* Language selector — inline expandable */}
          <div>
            <div className="px-2 py-2 rounded-lg cursor-pointer flex items-center justify-between"
              onClick={() => setShowLangMenu(v => !v)}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <span>{tNav('language')}: {LANGUAGES.find(l => l.code === lang)?.native}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showLangMenu ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            {showLangMenu && (
              <div className="py-1 pl-2">
                {LANGUAGES.map(l => (
                  <div key={l.code}
                    onClick={() => { setLocale(l.code as LangCode); setShowLangMenu(false); }}
                    className="px-3 py-1.5 cursor-pointer rounded-lg text-sm flex items-center justify-between"
                    style={{ color: l.code === lang ? 'var(--sb-accent)' : 'var(--sb-text-secondary)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <span>{l.native}</span>
                    {l.code === lang && <span style={{ fontSize: 12 }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Theme selector */}
          <div className="px-2 py-2 rounded-lg">
            <div style={{ fontSize: 13, marginBottom: 6, color: 'var(--sb-text-secondary)' }}>{tNav('appearance')}</div>
            <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--sb-hover)' }}>
              {themeOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={e => { e.stopPropagation(); setTheme(opt.key); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: theme === opt.key ? 'var(--sb-surface)' : 'transparent',
                    boxShadow: theme === opt.key ? 'var(--sb-card-shadow)' : 'none',
                    color: theme === opt.key ? 'var(--sb-text)' : 'var(--sb-text-muted)',
                  }}
                  onMouseEnter={e => { if (theme !== opt.key) e.currentTarget.style.color = 'var(--sb-text-secondary)'; }}
                  onMouseLeave={e => { if (theme !== opt.key) e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
                >
                  <span style={{ display: 'flex' }}>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-1 px-1 py-0.5" style={{ borderTop: '1px solid var(--sb-divider)' }}>
          <div onClick={onLogout} className="px-2 py-2 rounded-lg cursor-pointer" style={{ color: 'var(--sb-danger)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            {tNav('signOut')}
          </div>
        </div>
      </div>
    </>
  );
}

// ── TemplateGalleryPortal ─────────────────────────────────────────────────────
function TemplateGalleryPortal({
  tenant, wsId, parentId, onClose, onCreated, creatingLabel,
}: {
  tenant: string; wsId: string; parentId?: string; onClose: () => void; onCreated: (pageId: string) => void; creatingLabel?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSelect(templateId: string, title: string) {
    setLoading(true);
    try {
      const page = await api.post(`/api/workspace/templates/${templateId}/use`, {
        workspace_id: wsId, title, parent_page_id: parentId ?? null,
      });
      onCreated(page.id);
    } catch (err: any) { alert(err.message || 'Failed'); onClose(); }
    finally { setLoading(false); }
  }

  async function handleBlank() {
    setLoading(true);
    try {
      const page = await api.post('/api/workspace/pages', {
        workspace_id: wsId, parent_page_id: parentId ?? null, title: 'Untitled', icon: null,
      });
      onCreated(page.id);
    } catch (err: any) { alert(err.message || 'Failed'); onClose(); }
    finally { setLoading(false); }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'var(--sb-overlay)' }}>
        <div className="rounded-xl px-8 py-6 flex items-center gap-3" style={{ background: 'var(--sb-surface)', boxShadow: 'var(--sb-shadow)' }}>
          <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span style={{ fontSize: 14, color: 'var(--sb-text)' }}>{creatingLabel || 'Creating page...'}</span>
        </div>
      </div>
    );
  }

  return <TemplateGallery open={true} onClose={onClose} onSelect={handleSelect} onBlank={handleBlank} />;
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar({ tenant, userName, userRole, avatarUrl, collapsed, onToggleCollapse, onOpenCommandPalette }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const lang = useLocale();
  const [treeData, setTreeData] = useState<TreeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [pendingWsId, setPendingWsId] = useState<string | null>(null);
  const [pendingParentId, setPendingParentId] = useState<string | undefined>(undefined);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [appPerms, setAppPerms] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedWsIds, setExpandedWsIds] = useState<Set<string>>(new Set());
  const [wsTreeOpen, setWsTreeOpen] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [sharePageId, setSharePageId] = useState<string | null>(null);
  const [sharePageTitle, setSharePageTitle] = useState('');
  // Sidebar page limit per workspace: default 5, "load more" adds 10
  const [wsPageLimits, setWsPageLimits] = useState<Record<string, number>>({});
  // Favorites
  const [favorites, setFavorites] = useState<any[]>([]);
  const [favExpanded, setFavExpanded] = useState(true);
  // Global search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // App items with translated labels
  const appItems = [
    { key: 'customers',  label: tNav('customerCenter'),  path: 'crm/customers', icon: 'building',      bg: '#e0e7ff', color: '#4338ca' },
    { key: 'crm',        label: tNav('customerMgmt'),   path: 'crm',           icon: 'people-group',  bg: '#dbeafe', color: '#1e40af' },
    { key: 'messages',   label: tNav('messagesCenter'),  path: 'messages',      icon: 'chat-bubble',   bg: '#fce7f3', color: '#be185d' },
    { key: 'inventory',  label: tNav('supplyChain'),     path: 'inventory',     icon: 'factory',       bg: '#ffedd5', color: '#c2410c' },
    { key: 'accounting', label: tNav('financeMgmt'),     path: 'accounting',    icon: 'money-bag',     bg: '#dcfce7', color: '#166534' },
    { key: 'hr',         label: tNav('peopleMgmt'),      path: 'hr',            icon: 'person',        bg: '#ede9fe', color: '#5b21b6' },
  ];

  function handleToggleNode(id: string, siblingIds: string[]) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        for (const sid of siblingIds) next.delete(sid);
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleWorkspace(wsId: string) {
    setExpandedWsIds(prev => {
      const next = new Set<string>();
      if (!prev.has(wsId)) next.add(wsId);
      return next;
    });
  }

  const reloadTree = useCallback(async () => {
    try {
      const data = await api.get('/api/workspace/sidebar/tree');
      setTreeData(Array.isArray(data) ? data : []);
    } catch { /* keep existing */ }
  }, []);

  useEffect(() => {
    async function loadTree() {
      try {
        let data = await api.get('/api/workspace/sidebar/tree');
        if (!Array.isArray(data) || data.length === 0) {
          await api.post('/api/workspace/setup', {});
          data = await api.get('/api/workspace/sidebar/tree');
        }
        setTreeData(Array.isArray(data) ? data : []);
      } catch { setTreeData([]); }
      finally { setLoading(false); }
    }
    async function loadPerms() {
      try {
        const perms = await api.get('/api/admin/my-permissions');
        if (perms && typeof perms === 'object') setAppPerms(perms);
      } catch { /* leave empty */ }
    }
    loadTree();
    loadPerms();
    loadFavorites();
  }, []);

  async function loadFavorites() {
    try {
      const data = await api.get('/api/workspace/favorites');
      setFavorites(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q || q.trim().length < 2) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get(`/api/workspace/search?q=${encodeURIComponent(q.trim())}`);
        setSearchResults(Array.isArray(data) ? data : []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
  }

  async function toggleFavorite(pageId: string) {
    try {
      await api.post(`/api/workspace/pages/${pageId}/favorite`, {});
      await loadFavorites();
    } catch { /* ignore */ }
  }

  // Reload sidebar tree when a workspace is created/deleted from another page
  useEffect(() => {
    const handler = () => reloadTree();
    window.addEventListener('workspace-changed', handler);
    return () => window.removeEventListener('workspace-changed', handler);
  }, [reloadTree]);

  function openTemplatesFor(wsId: string, parentId?: string) {
    setPendingWsId(wsId);
    setPendingParentId(parentId);
    setShowTemplateGallery(true);
  }

  async function handleDeletePage(id: string) {
    if (!confirm(tNav('confirmArchive'))) return;
    try {
      await api.patch(`/api/workspace/pages/${id}`, { is_archived: true });
      await reloadTree();
      setSelectedPageId(null);
      if (pathname === `/${tenant}/workspace/${id}`) {
        router.push(`/${tenant}/workspace`);
      }
    } catch (err: any) { alert(err.message || 'Failed'); }
  }

  // ── Workspace drag-and-drop ─────────────────────────────────────────────────
  const wsDragRef = useRef<string | null>(null);
  const [wsDragTarget, setWsDragTarget] = useState<string | null>(null);

  function handleWsDrop(targetId: string) {
    const fromId = wsDragRef.current;
    wsDragRef.current = null;
    setWsDragTarget(null);
    if (!fromId || fromId === targetId) return;

    const arr = [...treeData];
    const fromIdx = arr.findIndex(w => w.id === fromId);
    const toIdx = arr.findIndex(w => w.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [item] = arr.splice(fromIdx, 1);
    const newToIdx = arr.findIndex(w => w.id === targetId);
    arr.splice(newToIdx, 0, item);

    const newOrder = arr.map((w, i) => ({ ...w, position: i }));
    setTreeData(newOrder);
    Promise.all(newOrder.map(w =>
      api.patch(`/api/workspace/workspaces/${w.id}`, { position: w.position })
    )).catch(() => reloadTree());
  }

  // ── Page drag-and-drop ───────────────────────────────────────────────────────
  async function handlePageReorder(fromId: string, toId: string, siblings: TreeItem[]) {
    const arr = [...siblings];
    const fromIdx = arr.findIndex(s => s.id === fromId);
    const toIdx = arr.findIndex(s => s.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const [item] = arr.splice(fromIdx, 1);
    const newToIdx = arr.findIndex(s => s.id === toId);
    arr.splice(newToIdx, 0, item);

    try {
      await Promise.all(arr.map((p, i) =>
        api.patch(`/api/workspace/pages/${p.id}`, { position: i })
      ));
      await reloadTree();
    } catch (err: any) { alert(err.message || 'Failed'); }
  }

  function handleOpenShare(id: string, title: string) {
    setSharePageId(id);
    setSharePageTitle(title);
  }

  function handleSidebarClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-page-node]')) {
      setSelectedPageId(null);
    }
  }

  const isWorkspaceActive = pathname.startsWith(`/${tenant}/workspace`);
  const isSettingsActive = pathname.startsWith(`/${tenant}/settings`);

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center h-full flex-shrink-0 select-none py-3 gap-2"
        style={{ width: 48, background: 'var(--sb-bg)', borderRight: '1px solid var(--sb-border)', transition: 'width 0.2s ease' }}
      >
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, color: 'var(--sb-text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          title={tNav('expandSidebar')}
        >
          <Icons.PanelLeft />
        </button>
      </div>
    );
  }

  return (
    <>
    <div
      className="flex flex-col h-full flex-shrink-0 select-none relative"
      style={{ width: 268, background: 'var(--sb-bg)', borderRight: '1px solid var(--sb-border)', transition: 'width 0.2s ease' }}
      onClick={handleSidebarClick}
    >
      {/* ── User Header ── */}
      <div className="mx-2 mt-3 mb-1 flex items-center gap-1">
        <div
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer flex-1 min-w-0"
          onClick={() => setShowUserMenu(v => !v)}
          style={{ transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <UserAvatar userId={tenant} name={userName} avatarUrl={avatarUrl} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
              <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--sb-text)', lineHeight: 1.2 }}>
                {userName?.split('@')[0] || 'User'}
              </span>
              {userRole === 'admin' && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: 'var(--sb-accent)',
                  background: 'var(--sb-accent-subtle)', borderRadius: 3,
                  padding: '1px 5px', flexShrink: 0, letterSpacing: '0.03em',
                }}>
                  {tNav('admin')}
                </span>
              )}
            </div>
            <div className="truncate" style={{ fontSize: 11, color: 'var(--sb-text-muted)', lineHeight: 1.2 }}>
              {userName || 'Nexus ERP'}
            </div>
          </div>
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="var(--sb-text-faint)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 30, height: 30, color: 'var(--sb-text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; e.currentTarget.style.color = 'var(--sb-text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
          title={tNav('collapseSidebar')}
        >
          <Icons.PanelLeft />
        </button>
      </div>

      {showUserMenu && (
        <UserMenu userName={userName} onLogout={logout} onClose={() => setShowUserMenu(false)} />
      )}

      {/* ── Top Nav ── */}
      <div className="px-2 mt-1 mb-2 space-y-0.5">
        <SidebarNavItem icon={<Icons.Search />} label={tNav('search')} onClick={() => setSearchOpen(true)} shortcut="⌘K" />
        <div
          className="flex items-center gap-2.5 px-3 rounded-lg cursor-pointer transition-all"
          style={{
            height: 36,
            background: isWorkspaceActive ? 'var(--sb-active)' : 'transparent',
            color: isWorkspaceActive ? 'var(--sb-text)' : 'var(--sb-text-secondary)',
            fontWeight: isWorkspaceActive ? 600 : 400,
            fontSize: 15,
          }}
          onClick={() => setWsTreeOpen(v => !v)}
          onMouseEnter={e => { if (!isWorkspaceActive) e.currentTarget.style.background = 'var(--sb-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = isWorkspaceActive ? 'var(--sb-active)' : 'transparent'; }}
        >
          <span style={{ color: isWorkspaceActive ? 'var(--sb-text-secondary)' : 'var(--sb-text-muted)', flexShrink: 0, display: 'flex' }}><Icons.Workspace /></span>
          <Link href={`/${tenant}/workspace`} className="flex-1 truncate" style={{ textDecoration: 'none', color: 'inherit' }}
            onClick={e => e.stopPropagation()}>
            {tNav('workspace')}
          </Link>
          <span style={{
            display: 'flex', color: 'var(--sb-text-faint)', flexShrink: 0,
            transform: wsTreeOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </div>
      </div>

      {/* ── Scrollable Area ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3">

        {/* ── Favorites Section ── */}
        {favorites.length > 0 && (
          <div>
            <div
              className="group flex items-center gap-1.5 px-1 rounded-lg mb-1"
              style={{ height: 28 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--sb-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span
                style={{ color: 'var(--sb-text-faint)', flexShrink: 0, display: 'flex', cursor: 'pointer',
                  transform: favExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
                onClick={() => setFavExpanded(v => !v)}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--sb-text-secondary)', letterSpacing: '0.01em', cursor: 'pointer' }}
                onClick={() => setFavExpanded(v => !v)}>
                {tNav('favorites')}
              </span>
            </div>
            {favExpanded && favorites.map(fav => {
              const isActive = pathname === `/${tenant}/workspace/${fav.id}`;
              return (
                <Link
                  key={fav.id}
                  href={`/${tenant}/workspace/${fav.id}`}
                  className="group/fav flex items-center gap-1.5 rounded-lg px-2 py-1"
                  style={{
                    textDecoration: 'none', fontSize: 14, minHeight: 32, paddingLeft: 22,
                    background: isActive ? 'var(--sb-active)' : 'transparent',
                    color: isActive ? 'var(--sb-text)' : 'var(--sb-text-secondary)',
                    fontWeight: isActive ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--sb-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--sb-active)' : 'transparent'; }}
                >
                  <span style={{ flexShrink: 0, display: 'flex' }}><IconOrEmoji value={fav.icon || 'document'} size={15} /></span>
                  <span className="truncate flex-1">{fav.title || 'Untitled'}</span>
                  <button
                    className="opacity-0 group-hover/fav:opacity-100 p-0.5 rounded transition-opacity flex-shrink-0"
                    style={{ color: 'var(--sb-text-faint)' }}
                    onClick={async (e) => { e.preventDefault(); e.stopPropagation(); await toggleFavorite(fav.id); }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#eab308'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--sb-text-faint)'; }}
                    title={tNav('unfavorite')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </button>
                </Link>
              );
            })}
          </div>
        )}

        {wsTreeOpen && (loading ? (
          <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--sb-text-faint)' }}>{tCommon('loading')}</div>
        ) : treeData.length === 0 ? (
          <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--sb-text-faint)', fontStyle: 'italic' }}>{tNav('noWorkspaces')}</div>
        ) : (
          treeData.map(ws => {
            const wsExpanded = expandedWsIds.has(ws.id);
            const isWsDragTarget = wsDragTarget === ws.id;
            return (
              <div
                key={ws.id}
                draggable
                onDragStart={e => {
                  wsDragRef.current = ws.id;
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('nexus-ws', ws.id);
                }}
                onDragOver={e => {
                  if (!wsDragRef.current || wsDragRef.current === ws.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setWsDragTarget(ws.id);
                }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setWsDragTarget(null);
                }}
                onDrop={e => { e.preventDefault(); handleWsDrop(ws.id); }}
                onDragEnd={() => { wsDragRef.current = null; setWsDragTarget(null); }}
                style={{ position: 'relative' }}
              >
                {isWsDragTarget && (
                  <div style={{ position: 'absolute', top: 0, left: 4, right: 4, height: 2, background: 'var(--sb-drag)', borderRadius: 1, zIndex: 10, pointerEvents: 'none' }} />
                )}
                <SectionHeaderWithAdd
                  label={ws.name || (ws.visibility === 'private' ? tNav('privateSpace') : tNav('teamSpace'))}
                  wsType={ws.visibility}
                  expanded={wsExpanded}
                  onToggle={() => handleToggleWorkspace(ws.id)}
                  onOpenTemplates={() => openTemplatesFor(ws.id)}
                  newPageLabel={tNav('newPage')}
                  onNavigate={() => router.push(`/${tenant}/workspace?ws=${ws.id}`)}
                />
                {wsExpanded && (() => {
                  // ── Compute delete permission for this workspace ──────────
                  const canDeleteInWs =
                    ws.visibility === 'private'
                      ? true
                      : userRole === 'admin'
                        || ws.current_user_role === 'admin'
                        || ws.current_user_role === 'editor';

                  const allPages = ws.children ?? [];
                  const limit = wsPageLimits[ws.id] ?? 5;
                  const visiblePages = allPages.slice(0, limit);
                  const remaining = allPages.length - limit;

                  if (allPages.length === 0) {
                    return (
                      <div
                        className="flex items-center gap-1.5 mx-1 px-2 py-1.5 rounded-lg cursor-pointer"
                        onClick={() => openTemplatesFor(ws.id)}
                        style={{ fontSize: 13, color: 'var(--sb-text-faint)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sb-text-faint)'; }}
                      >
                        <Icons.Plus />
                        <span>{tNav('newPage')}</span>
                      </div>
                    );
                  }

                  return (
                    <>
                      {visiblePages.map(page => (
                        <PageNode key={page.id} page={page} tenant={tenant} wsId={ws.id} level={0}
                          siblings={allPages}
                          expandedIds={expandedIds} onToggle={handleToggleNode} onOpenTemplates={openTemplatesFor}
                          selectedPageId={selectedPageId} onSelect={id => setSelectedPageId(prev => prev === id ? null : id)}
                          onDelete={handleDeletePage} onPageReorder={handlePageReorder}
                          onReloadTree={reloadTree} onOpenShare={handleOpenShare}
                          canDelete={canDeleteInWs} />
                      ))}
                      {remaining > 0 && (
                        <button
                          onClick={() => setWsPageLimits(prev => ({ ...prev, [ws.id]: limit + 10 }))}
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left rounded-lg transition-colors"
                          style={{ fontSize: 12, color: 'var(--sb-text-muted)', paddingLeft: 28 }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; e.currentTarget.style.color = 'var(--sb-text-secondary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                          {tNav('loadMore', { n: remaining })}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })
        ))}

        {/* ── Apps Section ── */}
        <div>
          <div style={{ height: 1, background: 'var(--sb-border)', margin: '4px 4px 8px' }} />
          <SectionHeader label={tNav('businessModules')} />
          <div className="space-y-1">
            {appItems.map(item => {
              const perm = appPerms[item.key] ?? 'view';
              if (perm === 'none') return null;
              const href = `/${tenant}/${item.path}`;
              return (
                <div key={item.key}>
                  <AppNavItem
                    icon={item.icon}
                    label={item.label}
                    bg={item.bg}
                    color={item.color}
                    active={pathname.startsWith(href)}
                    readOnly={perm === 'view'}
                    href={href}
                    readOnlyLabel={tNav('viewOnly')}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: '1px solid var(--sb-border)', padding: '8px 8px 12px' }} className="space-y-0.5">
        <NotificationBell label={tNav('notifications')} />
        <MessagesPanel label={tNav('messages')} />
        <Link href={`/${tenant}/settings`} style={{ display: 'block' }}>
          <SidebarNavItem icon={<Icons.Settings />} label={tNav('settings')} active={isSettingsActive} />
        </Link>
      </div>
    </div>

    {showTemplateGallery && pendingWsId && (
      <TemplateGalleryPortal
        tenant={tenant}
        wsId={pendingWsId}
        parentId={pendingParentId}
        onClose={() => { setShowTemplateGallery(false); setPendingWsId(null); setPendingParentId(undefined); }}
        onCreated={async (pageId) => {
          setShowTemplateGallery(false);
          setPendingWsId(null);
          setPendingParentId(undefined);
          await reloadTree();
          router.push(`/${tenant}/workspace/${pageId}`);
        }}
        creatingLabel={tNav('creatingPage')}
      />
    )}

    {sharePageId && (
      <SharePanel
        pageId={sharePageId}
        pageTitle={sharePageTitle}
        onClose={() => { setSharePageId(null); setSharePageTitle(''); }}
      />
    )}

    {/* ── Global Search Overlay ── */}
    {searchOpen && (
      <>
        <div className="fixed inset-0 z-[100]" style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }} />
        <div className="fixed z-[101] rounded-xl overflow-hidden"
          style={{
            top: '15%', left: '50%', transform: 'translateX(-50%)',
            width: 520, maxHeight: '60vh',
            background: 'var(--sb-surface)', border: '1px solid var(--sb-border)',
            boxShadow: '0 16px 70px rgba(0,0,0,0.2)',
          }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--sb-border)' }}>
            <Icons.Search />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder={tNav('searchAllPages')}
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 15, color: 'var(--sb-text)' }}
              onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); } }}
            />
            {searching && (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sb-text-muted)" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 52px)' }}>
            {searchResults.length === 0 && searchQuery.length >= 2 && !searching && (
              <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--sb-text-faint)', textAlign: 'center' }}>
                {tNav('noMatchingPages')}
              </div>
            )}
            {searchResults.map(r => (
              <Link
                key={r.id}
                href={`/${tenant}/workspace/${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{ textDecoration: 'none', color: 'var(--sb-text)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }}
              >
                <span style={{ flexShrink: 0, display: 'flex' }}><IconOrEmoji value={r.icon || 'document'} size={16} /></span>
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>{r.title || 'Untitled'}</div>
                  <div className="truncate" style={{ fontSize: 11, color: 'var(--sb-text-muted)' }}>{r.workspace_name}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </>
    )}
    </>
  );
}
