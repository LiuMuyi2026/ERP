'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTranslations, useLocale } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';

interface Template {
  id: string;
  title: string;
  icon: string;
  category: string;
  description: string;
  source: 'builtin' | 'user';
  content?: any;
  default_views?: Array<{ id: string; type: string; title: string; icon: string }>;
  created_at?: string;
  creator_name?: string;
}

interface TemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  onSelect: (templateId: string, title: string) => void;
  onBlank?: () => void;
  onAppend?: (templateId: string, title: string) => void;
  useTemplateLabel?: string;
  appendTemplateLabel?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  Meeting: 'handshake', Planning: 'clipboard', Product: 'rocket', Engineering: 'gear',
  Business: 'briefcase', Marketing: 'megaphone', Personal: 'herb', Custom: 'sparkle',
  会议: 'handshake', 规划: 'clipboard', 产品: 'rocket', 工程: 'gear',
  商务: 'briefcase', 市场: 'megaphone', 个人: 'herb', 自定义: 'sparkle',
  人事: 'users',
};

const CATEGORY_GRADIENTS: Record<string, string> = {
  Meeting:     'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  Planning:    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  Product:     'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  Engineering: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  Business:    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  Marketing:   'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  Personal:    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  Custom:      'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  会议:        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  规划:        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  产品:        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  工程:        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  商务:        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  市场:        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  个人:        'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  自定义:      'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  人事:        'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
};

const CATEGORY_BG: Record<string, string> = {
  Meeting:     '#f3f0ff',
  Planning:    '#fff0f5',
  Product:     '#e6f7ff',
  Engineering: '#e6fff7',
  Business:    '#fff3e0',
  Marketing:   '#f9f0ff',
  Personal:    '#fff8f0',
  Custom:      '#f0f4ff',
  会议:        '#f3f0ff',
  规划:        '#fff0f5',
  产品:        '#e6f7ff',
  工程:        '#e6fff7',
  商务:        '#fff3e0',
  市场:        '#f9f0ff',
  个人:        '#fff8f0',
  自定义:      '#f0f4ff',
  人事:        '#eef2ff',
};

function extractTemplateVariables(value: any): string[] {
  const found = new Set<string>();
  const walk = (v: any) => {
    if (typeof v === 'string') {
      const matches = v.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
      matches.forEach((m) => {
        const key = m.replace(/[{}]/g, '').trim().toLowerCase();
        if (key) found.add(key);
      });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return Array.from(found);
}

// ── Markdown preview renderer ─────────────────────────────────────────────────
function MarkdownPreview({ text, compact = false }: { text: string; compact?: boolean }) {
  const allLines = text.split('\n');
  const lines = allLines.slice(0, compact ? 12 : 30);

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: compact ? 3 : 5 }} />;
        if (/^#{1,6}\s/.test(line)) {
          const level = (line.match(/^(#+)/)?.[1]?.length ?? 1);
          return (
            <div key={i} style={{
              fontWeight: 600,
              fontSize: compact ? 10 : (level === 1 ? 13 : level === 2 ? 12 : 11),
              color: 'var(--notion-text)',
              marginTop: compact ? 4 : 8,
            }}>
              {line.replace(/^#{1,6}\s*/, '')}
            </div>
          );
        }
        if (/^[-*]\s/.test(line) || /^- \[[ x]\]/.test(line)) {
          const itemText = line.replace(/^- \[[ x]\] /, '').replace(/^[-*]\s/, '');
          return (
            <div key={i} className="flex items-start gap-1.5" style={{ color: 'var(--notion-text)', fontSize: compact ? 9 : 11 }}>
              <span className="flex-shrink-0 mt-1.5" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--notion-text-muted)', display: 'inline-block' }} />
              <span className="truncate">{itemText}</span>
            </div>
          );
        }
        if (line.startsWith('| ')) {
          const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
          if (cells.every(c => /^[-:]+$/.test(c))) return null;
          return (
            <div key={i} className="flex" style={{ borderBottom: '1px solid var(--notion-border)', fontSize: compact ? 8 : 10 }}>
              {cells.map((cell, ci) => (
                <span key={ci} className="px-1 py-0.5 flex-1 truncate" style={{ color: 'var(--notion-text)', borderRight: ci < cells.length - 1 ? '1px solid var(--notion-border)' : 'none' }}>
                  {cell}
                </span>
              ))}
            </div>
          );
        }
        if (line === '---' || line === '___') return <hr key={i} className="my-1" style={{ borderColor: 'var(--notion-border)' }} />;
        const formatted = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
        if (!formatted.trim()) return null;
        return <div key={i} style={{ fontSize: compact ? 9 : 11, color: 'var(--notion-text)', lineHeight: 1.5 }}>{formatted}</div>;
      })}
    </div>
  );
}

// ── View structure visualization ──────────────────────────────────────────────
function ViewStructureViz({ views, t, isZh }: { views: Template['default_views']; t: any; isZh: boolean }) {
  if (!views?.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--notion-text-muted)' }}>{t('includes')}</p>
      <div className="flex flex-wrap gap-1.5">
        {views.map(v => (
          <div key={v.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{
            background: v.type === 'document' ? '#e8f4fd' : v.type === 'task_tracker' ? '#fdf4ff' : '#f0fdf4',
            color: v.type === 'document' ? '#1d6fa8' : v.type === 'task_tracker' ? '#7c3aed' : '#15803d',
            border: `1px solid ${v.type === 'document' ? '#bde0f9' : v.type === 'task_tracker' ? '#e9d5ff' : '#bbf7d0'}`,
          }}>
            <span style={{ fontSize: 11 }}>{v.icon}</span>
            {v.title}
            <span className="opacity-50 text-[9px]">{v.type === 'document' ? (isZh ? '文档' : 'doc') : v.type === 'task_tracker' ? (isZh ? '任务' : 'tasks') : (isZh ? '表格' : 'table')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Blank Page Card ───────────────────────────────────────────────────────────
function BlankPageCard({ onBlank, t }: { onBlank: () => void; t: any }) {
  return (
    <button
      onClick={onBlank}
      className="group flex flex-col rounded-xl overflow-hidden text-left transition-all duration-200 hover:shadow-lg"
      style={{ border: '2px dashed #cbd5e1', background: 'var(--notion-card-elevated, var(--notion-card, white))', minHeight: 160 }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = '#faf5ff'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'white'; }}
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
          style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: '#374151' }}>
            {t('blankPage')}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#9B9A97' }}>
            {t('startFromScratch')}
          </p>
        </div>
      </div>
    </button>
  );
}

// ── Template Card (grid view) ─────────────────────────────────────────────────
function TemplateCard({ template, onSelect }: { template: Template; onSelect: (t: Template) => void }) {
  const gradient = CATEGORY_GRADIENTS[template.category] || CATEGORY_GRADIENTS.Custom;
  const bgColor = CATEGORY_BG[template.category] || CATEGORY_BG.Custom;

  return (
    <button
      onClick={() => onSelect(template)}
      className="group flex flex-col rounded-xl overflow-hidden text-left transition-all duration-200 hover:shadow-lg"
      style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card-elevated, var(--notion-card, white))' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
    >
      {/* Card header with gradient */}
      <div className="relative overflow-hidden flex-shrink-0" style={{ height: 90, background: bgColor }}>
        <div className="absolute inset-0 opacity-30" style={{ background: gradient }} />
        {/* Mini document preview */}
        <div className="absolute inset-3 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.88)', padding: '6px 8px' }}>
          {template.content?.text ? <MarkdownPreview text={template.content.text} compact /> : (
            <div className="space-y-1">
              <div style={{ height: 8, width: '60%', background: 'var(--notion-border)', borderRadius: 2 }} />
              <div style={{ height: 6, width: '80%', background: '#eee', borderRadius: 2 }} />
              <div style={{ height: 6, width: '70%', background: '#eee', borderRadius: 2 }} />
              <div style={{ height: 6, width: '50%', background: '#eee', borderRadius: 2 }} />
            </div>
          )}
        </div>
        {/* Icon badge */}
        <div className="absolute top-2 right-2 text-base leading-none px-1.5 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.9)' }}>
          {template.icon}
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 flex-1">
        <div className="font-semibold text-sm mb-1 truncate" style={{ color: 'var(--notion-text)' }}>{template.title}</div>
        {template.description && (
          <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--notion-text-muted)' }}>{template.description}</p>
        )}

        {/* View count */}
        {(template.default_views?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1 mt-2">
            {template.default_views!.slice(0, 3).map(v => (
              <span key={v.id} className="text-[10px]" title={v.title}>{v.icon}</span>
            ))}
            <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{template.default_views!.length} views</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Sidebar item ──────────────────────────────────────────────────────────────
function SidebarItem({ icon, label, active, onClick, badge }: {
  icon: string; label: string; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 py-[5px] px-4 text-[13px] text-left transition-colors"
      style={{
        background: active ? 'var(--notion-active)' : 'transparent',
        color: active ? 'var(--notion-text)' : 'var(--notion-text-muted)',
        fontWeight: active ? 500 : 400,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--notion-hover)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <HandIcon name={icon} size={13} />
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="text-[10px] px-1.5 rounded-full" style={{ background: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TemplateGallery({
  open,
  onClose,
  onSelect,
  onBlank,
  onAppend,
  useTemplateLabel,
  appendTemplateLabel,
}: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const lang = useLocale();
  const isZh = String(lang || '').toLowerCase().startsWith('zh');
  const tWorkspace = useTranslations('workspace');
  const tCommon = useTranslations('common');
  const VARIABLE_LABELS: Record<string, string> = isZh ? {
    date: '日期',
    time: '时间',
    datetime: '日期时间',
    year: '年份',
    month: '月份',
    day: '日',
    quarter: '季度',
    next_week: '下周日期',
    next_weekday: '下周工作日',
    weekday: '星期',
    weekday_zh: '中文星期',
    user: '用户',
    user_name: '用户名',
    email: '邮箱',
    user_email: '用户邮箱',
    workspace: '工作区',
    workspace_name: '工作区名称',
    tenant: '租户',
    tenant_slug: '租户标识',
    page: '页面',
    page_title: '页面标题',
  } : {
    date: 'Date',
    time: 'Time',
    datetime: 'DateTime',
    year: 'Year',
    month: 'Month',
    day: 'Day',
    quarter: 'Quarter',
    next_week: 'Next Week Date',
    next_weekday: 'Next Weekday',
    weekday: 'Weekday',
    weekday_zh: 'Weekday ZH',
    user: 'User',
    user_name: 'User Name',
    email: 'Email',
    user_email: 'User Email',
    workspace: 'Workspace',
    workspace_name: 'Workspace Name',
    tenant: 'Tenant',
    tenant_slug: 'Tenant Slug',
    page: 'Page',
    page_title: 'Page Title',
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch(''); setSelected(null); setActiveFilter('All');
    api.get(`/api/workspace/templates?lang=${lang}`)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        const normalized = list.map((tpl: any) => {
          if (!tpl?.default_views && Array.isArray(tpl?.content?._views)) {
            return { ...tpl, default_views: tpl.content._views };
          }
          return tpl;
        });
        setTemplates(normalized);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, lang]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSelect = useCallback((t: Template) => setSelected(t), []);

  const handleUse = useCallback(() => {
    if (!selected) return;
    onSelect(selected.id, selected.title);
    onClose();
  }, [selected, onSelect, onClose]);

  const handleAppend = useCallback(() => {
    if (!selected || !onAppend) return;
    onAppend(selected.id, selected.title);
    onClose();
  }, [selected, onAppend, onClose]);

  async function handleDelete(tpl: Template) {
    if (!window.confirm(tWorkspace('deleteTemplateConfirm', { title: tpl.title }))) return;
    setDeleting(true);
    try {
      await api.delete(`/api/workspace/templates/${tpl.id}`);
      setTemplates(prev => prev.filter(t => t.id !== tpl.id));
      if (selected?.id === tpl.id) setSelected(null);
    } catch {} finally { setDeleting(false); }
  }

  if (!open) return null;

  const userTemplates = templates.filter(t => t.source === 'user');
  const filteredList = templates
    .filter(t => {
      if (activeFilter === 'my-templates') return t.source === 'user';
      if (activeFilter !== 'All') return t.category === activeFilter;
      return true;
    })
    .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.description || '').toLowerCase().includes(search.toLowerCase()));

  const categories = Array.from(new Set(templates.filter(t => t.source === 'builtin').map(t => t.category)));
  const selectedVariables = selected ? extractTemplateVariables({ title: selected.title, content: selected.content, views: selected.default_views }) : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: '96vw', maxWidth: 1280, height: '90vh', background: 'var(--notion-card-elevated, var(--notion-card, white))', border: '1px solid rgba(0,0,0,0.1)' }}
      >
        {/* ── Left sidebar ── */}
        <div className="flex-shrink-0 flex flex-col py-5 overflow-y-auto border-r" style={{ width: 220, background: '#f7f7f5', borderColor: 'var(--notion-border)' }}>
          <div className="px-5 mb-5">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--notion-text-muted)' }}>
              {tWorkspace('templates')}
            </p>
          </div>

          <SidebarItem icon="clipboard" label={tWorkspace('allTemplates')} active={activeFilter === 'All'} onClick={() => { setActiveFilter('All'); setSelected(null); }} />

          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--notion-text-muted)' }}>
              {tWorkspace('categoriesLabel')}
            </p>
          </div>
          {categories.map(cat => (
            <SidebarItem key={cat} icon={CATEGORY_ICONS[cat] || 'clipboard'} label={cat} active={activeFilter === cat} onClick={() => { setActiveFilter(cat); setSelected(null); }} />
          ))}

          {userTemplates.length > 0 && (
            <>
              <div className="h-px mx-4 mt-3 mb-2" style={{ background: 'var(--notion-border)' }} />
              <SidebarItem icon="file-cabinet" label={tWorkspace('myTemplates')} badge={userTemplates.length} active={activeFilter === 'my-templates'} onClick={() => { setActiveFilter('my-templates'); setSelected(null); }} />
            </>
          )}
        </div>

        {/* ── Main content area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center gap-4 px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card-elevated, var(--notion-card, white))' }}>
            <div className="flex items-center gap-2 flex-shrink-0">
              <HandIcon name="sparkle-star" size={18} />
              <span className="text-sm font-bold" style={{ color: 'var(--notion-text)' }}>
                {tWorkspace('newPage')}
              </span>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1" style={{ border: '1.5px solid var(--notion-border)', background: 'var(--notion-sidebar)', maxWidth: 440 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={searchRef}
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
                placeholder={tWorkspace('searchTemplates')}
                className="flex-1 text-sm outline-none bg-transparent"
                style={{ color: 'var(--notion-text)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ color: 'var(--notion-text-muted)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-3 flex-shrink-0">
              <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                {tWorkspace('templateCount', { n: filteredList.length })}
              </span>
              <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors" style={{ color: 'var(--notion-text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content: two-pane (grid/list + preview) */}
          <div className="flex-1 flex overflow-hidden">
            {/* Grid / list pane */}
            <div className={`flex-1 overflow-y-auto ${selected ? 'border-r' : ''}`} style={{ borderColor: 'var(--notion-border)' }}>
              {loading ? (
                <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                  <svg className="animate-spin mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  {tCommon('loading')}
                </div>
              ) : filteredList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2">
                  <HandIcon name="magnifier" size={32} />
                  <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>
                    {tWorkspace('noTemplatesFound')}
                  </p>
                  {search && (
                    <button onClick={() => setSearch('')} className="text-xs px-3 py-1.5 rounded-md" style={{ color: 'var(--notion-accent)', border: '1px solid var(--notion-accent)' }}>
                      {tWorkspace('clearSearchBtn')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-6">
                  {/* Category sections when on "All" */}
                  {activeFilter === 'All' && !search ? (
                    <>
                      {/* Start here: blank + featured */}
                      <div className="mb-8">
                        <div className="flex items-center gap-2 mb-4">
                          <HandIcon name="sparkle-star" size={16} />
                          <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                            {tWorkspace('startCreating')}
                          </h3>
                        </div>
                        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                          <BlankPageCard onBlank={() => { onClose(); onBlank?.(); }} t={tWorkspace} />
                          {filteredList.filter(t => t.source === 'builtin').slice(0, 5).map(t => (
                            <TemplateCard key={t.id} template={t} onSelect={handleSelect} />
                          ))}
                        </div>
                      </div>

                      {/* By category */}
                      {categories.map(cat => {
                        const catTemplates = filteredList.filter(t => t.source === 'builtin' && t.category === cat);
                        if (!catTemplates.length) return null;
                        return (
                          <div key={cat} className="mb-8">
                            <div className="flex items-center gap-2 mb-4">
                              <HandIcon name={CATEGORY_ICONS[cat]} size={16} />
                              <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{cat}</h3>
                              <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{catTemplates.length}</span>
                            </div>
                            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                              {catTemplates.map(t => (
                                <TemplateCard key={t.id} template={t} onSelect={handleSelect} />
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {/* User templates */}
                      {filteredList.filter(t => t.source === 'user').length > 0 && (
                        <div className="mb-8">
                          <div className="flex items-center gap-2 mb-4">
                            <HandIcon name="file-cabinet" size={16} />
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                              {tWorkspace('myTemplates')}
                            </h3>
                          </div>
                          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                            {filteredList.filter(t => t.source === 'user').map(t => (
                              <TemplateCard key={t.id} template={t} onSelect={handleSelect} />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Single category or search: card grid */
                    <>
                      {activeFilter !== 'All' && (
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: CATEGORY_BG[activeFilter] || '#f5f5f5' }}>
                            <HandIcon name={CATEGORY_ICONS[activeFilter] || 'clipboard'} size={24} />
                          </div>
                          <div>
                            <h2 className="text-base font-bold" style={{ color: 'var(--notion-text)' }}>{activeFilter}</h2>
                            <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                              {tWorkspace('templateCount', { n: filteredList.length })}
                            </p>
                          </div>
                        </div>
                      )}
                      {search && (
                        <p className="text-xs mb-4" style={{ color: 'var(--notion-text-muted)' }}>
                          {tWorkspace('searchResultCount', { n: filteredList.length })} {search && `"${search}"`}
                        </p>
                      )}
                      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                        {!search && <BlankPageCard onBlank={() => { onClose(); onBlank?.(); }} t={tWorkspace} />}
                        {filteredList.map(t => (
                          <TemplateCard key={t.id} template={t} onSelect={handleSelect} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Preview pane */}
            {selected && (
              <div className="flex-shrink-0 overflow-y-auto flex flex-col" style={{ width: 380, background: 'var(--notion-card-elevated, var(--notion-card, white))' }}>
                {/* Template header with gradient */}
                <div className="relative flex-shrink-0" style={{
                  height: 140,
                  background: CATEGORY_GRADIENTS[selected.category] || CATEGORY_GRADIENTS.Custom,
                }}>
                  <div className="absolute inset-0 flex items-end p-5">
                    <div>
                      <div className="text-4xl mb-2">{selected.icon}</div>
                      <h2 className="text-lg font-bold text-white drop-shadow">{selected.title}</h2>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col gap-4">
                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: CATEGORY_BG[selected.category] || '#f5f5f5', color: '#555' }}>
                      <HandIcon name={CATEGORY_ICONS[selected.category] || 'clipboard'} size={12} /> {selected.category}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                      background: selected.source === 'builtin' ? '#e8f4fd' : '#f0fdf4',
                      color: selected.source === 'builtin' ? '#1d6fa8' : '#15803d',
                    }}>
                      <span className="inline-flex items-center gap-1"><HandIcon name="sparkle-star" size={10} /> {selected.source === 'builtin' ? tWorkspace('builtIn') : tWorkspace('myTemplate')}</span>
                    </span>
                    {selected.creator_name && selected.source === 'user' && (
                      <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{isZh ? '作者' : 'by'} {selected.creator_name}</span>
                    )}
                  </div>

                  {/* Description */}
                  {selected.description && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--notion-text-muted)' }}>{selected.description}</p>
                  )}

                  {/* Views */}
                  <ViewStructureViz views={selected.default_views} t={tWorkspace} isZh={isZh} />

                  {/* Template variables */}
                  {selectedVariables.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--notion-text-muted)' }}>
                        {isZh ? '变量' : 'Variables'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedVariables.map(v => (
                          <span key={v} className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--notion-hover)', color: 'var(--notion-text)' }}>
                            {`{{${v}}}`} · {VARIABLE_LABELS[v] || v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleUse}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-lg"
                      style={{ background: 'linear-gradient(135deg, var(--notion-accent), #a855f7)', boxShadow: '0 4px 14px rgba(124,58,237,0.4)' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,58,237,0.5)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(124,58,237,0.4)'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {useTemplateLabel || tWorkspace('useTemplate')}
                    </button>
                    {onAppend && (
                      <button
                        onClick={handleAppend}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-card-elevated, var(--notion-card, white))' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-card-elevated, var(--notion-card, white))'; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        {appendTemplateLabel || (isZh ? '插入到页面' : 'Insert into Page')}
                      </button>
                    )}
                    {selected.source === 'user' && (
                      <button
                        onClick={() => handleDelete(selected)}
                        disabled={deleting}
                        className="px-3 py-2.5 rounded-lg text-sm transition-colors"
                        style={{ color: '#dc2626', border: '1px solid #fecaca', opacity: deleting ? 0.6 : 1 }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        title={isZh ? '删除模板' : 'Delete template'}
                      >
                        <HandIcon name="trash-can" size={16} />
                      </button>
                    )}
                  </div>

                  {/* Content preview */}
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--notion-text-muted)' }}>
                      {tWorkspace('contentPreview')}
                    </p>
                    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--notion-border)', background: '#fafaf9' }}>
                      <div className="px-4 py-4 text-xs">
                        {selected.content?.text ? (
                          <MarkdownPreview text={selected.content.text} />
                        ) : selected.content?._views ? (
                          <div className="text-center py-4 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                            {tWorkspace('multiViewTemplate', { n: selected.content._views.length })}
                          </div>
                        ) : (
                          <p style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('noPreview')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
