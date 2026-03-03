'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useTranslations, useLocale } from 'next-intl';
import WhatsAppChatPanel from '@/app/[tenant]/crm/components/WhatsAppChatPanel';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Conversation {
  other_id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  last_content: string;
  last_at: string;
  unread_count: number;
}

interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  from_name: string;
  from_email: string;
}

interface UserInfo {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
}

interface ListItem {
  other_id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  last_content?: string;
  last_at?: string;
  unread_count: number;
  isConversation: boolean;
}

interface WaConversation {
  id: string;
  wa_account_id: string;
  wa_jid?: string;
  display_name?: string;
  push_name?: string;
  phone_number?: string;
  profile_pic_url?: string;
  lead_id?: string;
  lead_name?: string;
  lead_status?: string;
  account_id?: string;
  account_name?: string;
  account_phone?: string;
  crm_account_name?: string;
  owner_wa_jid?: string;
  owner_name?: string;
  wa_labels?: { id: string; name: string; color?: string }[];
  last_message_at?: string;
  last_message_preview?: string;
  unread_count: number;
  is_group?: boolean;
  disappearing_duration?: number;
}

interface WaAccount {
  id: string;
  display_name?: string;
  phone_number?: string;
  status: string;
  wa_jid?: string;
  last_seen_at?: string;
}

interface WaLabel {
  id: string;
  name: string;
  color?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(d: string, justNow: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return justNow;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatTime(d: string, locale: string) {
  return new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ id, name, email, avatarUrl, size = 32 }: { id: string; name?: string; email?: string; avatarUrl?: string | null; size?: number }) {
  return <UserAvatar userId={id} name={name || email} avatarUrl={avatarUrl} size={size} />;
}

const LEAD_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: '#dbeafe', text: '#1d4ed8' },
  inquiry: { bg: '#dbeafe', text: '#1d4ed8' },
  engaged: { bg: '#fef9c3', text: '#a16207' },
  qualified: { bg: '#dcfce7', text: '#15803d' },
  quoted: { bg: '#e9d5ff', text: '#7c3aed' },
  negotiating: { bg: '#fce7f3', text: '#be185d' },
  converted: { bg: '#d1fae5', text: '#065f46' },
};

// ── WhatsApp-style double checkmark ────────────────────────────────────────────
function DoubleCheck({ isRead }: { isRead: boolean }) {
  const c = isRead ? '#7c3aed' : '#a0aec0';
  return (
    <svg width="17" height="10" viewBox="0 0 17 10" fill="none" style={{ flexShrink: 0 }}>
      <polyline points="1,5 3.8,7.5 7.5,1.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="5.5,5 8.3,7.5 12,1.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MessagesPanel({ label }: { label?: string }) {
  const t = useTranslations('messages');
  const lang = useLocale();

  // Panel state
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'internal' | 'whatsapp'>('internal');

  // ── Internal messaging state ──────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [totalUnread, setTotalUnread]     = useState(0);
  const isVisible                         = usePageVisibility();
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [selectedItem, setSelectedItem]   = useState<ListItem | null>(null);
  const [thread, setThread]               = useState<Message[]>([]);
  const [inputText, setInputText]         = useState('');
  const [sending, setSending]             = useState(false);
  const [allUsers, setAllUsers]           = useState<UserInfo[]>([]);
  const [search, setSearch]               = useState('');
  const [loadingThread, setLoadingThread] = useState(false);
  const threadEndRef                      = useRef<HTMLDivElement>(null);
  const inputRef                          = useRef<HTMLInputElement>(null);

  // ── WhatsApp state ────────────────────────────────────────────────────────
  const [waConversations, setWaConversations] = useState<WaConversation[]>([]);
  const [waLoading, setWaLoading]             = useState(false);
  const [waSearch, setWaSearch]               = useState('');
  const [waSelected, setWaSelected]           = useState<WaConversation | null>(null);
  const [waUnread, setWaUnread]               = useState(0);
  const [waAccounts, setWaAccounts]           = useState<WaAccount[]>([]);
  const [waLabels, setWaLabels]               = useState<WaLabel[]>([]);
  const [waFilterAccount, setWaFilterAccount] = useState('');
  const [waFilterGroup, setWaFilterGroup]     = useState<'' | 'true' | 'false'>('');
  const [waFilterLabel, setWaFilterLabel]     = useState('');
  const [waSortBy, setWaSortBy]               = useState<'last_message' | 'unread'>('last_message');
  const [linkingContact, setLinkingContact]   = useState<WaConversation | null>(null);
  const [showArchived, setShowArchived]       = useState(false);
  const [labelingContact, setLabelingContact] = useState<WaConversation | null>(null);
  const [waMessageSearch, setWaMessageSearch] = useState('');

  // ── Unread badge polling ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;
    const load = async () => {
      try { setTotalUnread((await api.get('/api/messages/unread-count')).count ?? 0); } catch {}
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [isVisible]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get('/api/messages/conversations');
      const convs: Conversation[] = Array.isArray(data) ? data : [];
      setConversations(convs);
      setTotalUnread(convs.reduce((s, c) => s + Number(c.unread_count || 0), 0));
    } catch {}
  }, []);

  // ── WhatsApp conversations load ───────────────────────────────────────────
  const loadWaConversations = useCallback(async (filters?: {
    account_id?: string; is_group?: string; label_id?: string; sort_by?: string; include_archived?: boolean;
  }) => {
    setWaLoading(true);
    try {
      const params = new URLSearchParams();
      const f = filters || {};
      if (f.account_id) params.set('account_id', f.account_id);
      if (f.is_group === 'true' || f.is_group === 'false') params.set('is_group', f.is_group);
      if (f.label_id) params.set('label_id', f.label_id);
      if (f.sort_by) params.set('sort_by', f.sort_by);
      if (f.include_archived) params.set('include_archived', 'true');
      const qs = params.toString();
      const convs = await api.get(`/api/whatsapp/dashboard${qs ? `?${qs}` : ''}`);
      const list: WaConversation[] = Array.isArray(convs) ? convs : [];
      setWaConversations(list);
      setWaUnread(list.reduce((s, c) => s + (c.unread_count || 0), 0));
    } catch {}
    finally { setWaLoading(false); }
  }, []);

  const loadWaAccounts = useCallback(async () => {
    try {
      const data = await api.get('/api/whatsapp/accounts');
      setWaAccounts(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  const loadWaLabels = useCallback(async () => {
    try {
      const data = await api.get('/api/whatsapp/labels');
      setWaLabels(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  // ── Reload WhatsApp when filters change ───────────────────────────────────
  useEffect(() => {
    if (!open || activeTab !== 'whatsapp') return;
    const filters = { account_id: waFilterAccount, is_group: waFilterGroup, label_id: waFilterLabel, sort_by: waSortBy, include_archived: showArchived };
    loadWaConversations(filters);
    const iv = setInterval(() => {
      if (isVisible) loadWaConversations(filters);
    }, 10_000);
    return () => clearInterval(iv);
  }, [open, activeTab, waFilterAccount, waFilterGroup, waFilterLabel, waSortBy, showArchived, loadWaConversations, isVisible]);

  // ── Thread polling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !selectedId || !isVisible || activeTab !== 'internal') return;
    const load = async () => {
      try {
        const data: Message[] = await api.get(`/api/messages/${selectedId}`);
        setThread(prev => {
          const next = Array.isArray(data) ? data : [];
          const changed =
            next.length !== prev.length ||
            next[next.length - 1]?.id !== prev[prev.length - 1]?.id ||
            next.some((m, i) => prev[i] && m.is_read !== prev[i].is_read);
          return changed ? next : prev;
        });
        loadConversations();
      } catch {}
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [open, selectedId, loadConversations, isVisible, activeTab]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  // ── Open panel ────────────────────────────────────────────────────────────
  async function openPanel() {
    setOpen(true);
    await loadConversations();
    try {
      const users = await api.get('/api/admin/users');
      setAllUsers(Array.isArray(users) ? users : []);
    } catch {}
    loadWaConversations();
    loadWaAccounts();
    loadWaLabels();
  }

  // ── Select internal user ──────────────────────────────────────────────────
  async function selectUser(item: ListItem) {
    setSelectedId(item.other_id);
    setSelectedItem(item);
    setThread([]);
    setLoadingThread(true);
    try {
      const data = await api.get(`/api/messages/${item.other_id}`);
      setThread(Array.isArray(data) ? data : []);
      loadConversations();
    } catch {} finally {
      setLoadingThread(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  // ── Send internal message ─────────────────────────────────────────────────
  async function sendMessage() {
    if (!inputText.trim() || !selectedId || sending) return;
    const txt = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      const msg: Message = await api.post(`/api/messages/${selectedId}`, { content: txt });
      setThread(prev => [...prev, msg]);
      loadConversations();
    } catch { setInputText(txt); }
    finally { setSending(false); inputRef.current?.focus(); }
  }

  // ── Merged internal list ──────────────────────────────────────────────────
  const mergedList = useMemo<ListItem[]>(() => {
    const q = search.toLowerCase();
    const convIds = new Set(conversations.map(c => c.other_id));
    const convItems: ListItem[] = conversations.map(c => ({
      other_id: c.other_id, full_name: c.full_name, email: c.email,
      avatar_url: c.avatar_url, last_content: c.last_content, last_at: c.last_at,
      unread_count: Number(c.unread_count || 0), isConversation: true,
    }));
    const otherItems: ListItem[] = allUsers
      .filter(u => !convIds.has(u.id))
      .map(u => ({ other_id: u.id, full_name: u.full_name, email: u.email, avatar_url: u.avatar_url, unread_count: 0, isConversation: false }));
    const all = [...convItems, ...otherItems];
    if (!q) return all;
    return all.filter(i => i.full_name?.toLowerCase().includes(q) || i.email?.toLowerCase().includes(q));
  }, [conversations, allUsers, search]);

  // ── WhatsApp filtered list ────────────────────────────────────────────────
  const waFiltered = useMemo(() => {
    if (!waSearch) return waConversations;
    const q = waSearch.toLowerCase();
    return waConversations.filter(c =>
      (c.display_name || '').toLowerCase().includes(q) ||
      (c.push_name || '').toLowerCase().includes(q) ||
      (c.phone_number || '').includes(q) ||
      (c.lead_name || '').toLowerCase().includes(q)
    );
  }, [waConversations, waSearch]);

  const selName  = selectedItem?.full_name || selectedItem?.email || '';
  const selEmail = selectedItem?.email || '';
  const combinedUnread = totalUnread + waUnread;

  // ── Closed state ──────────────────────────────────────────────────────────
  if (!open) return (
    <button
      onClick={openPanel}
      className={label
        ? "flex items-center gap-2.5 w-full rounded-lg cursor-pointer"
        : "w-7 h-7 flex items-center justify-center rounded-md relative cursor-pointer"
      }
      style={label
        ? { height: 30, padding: '0 12px', color: 'var(--sb-text-secondary)' }
        : { color: 'var(--sb-text-muted)' }
      }
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; if (!label) e.currentTarget.style.color = 'var(--sb-text)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = label ? 'var(--sb-text-secondary)' : 'var(--sb-text-muted)'; }}
      title={label || t('title')}
    >
      <span style={{ display: 'flex', flexShrink: 0, color: 'var(--sb-text-muted)', position: 'relative' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {combinedUnread > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-white font-bold"
            style={{ fontSize: 9, background: '#7c3aed', padding: '0 3px' }}>
            {combinedUnread > 99 ? '99+' : combinedUnread}
          </span>
        )}
      </span>
      {label && (
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--sb-text)', userSelect: 'none' }}>{label}</span>
      )}
    </button>
  );

  // ── Open: chat panel ──────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} />

      <div
        className="fixed z-[160] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ bottom: 56, left: 252, width: 700, height: 530, border: '1px solid var(--sb-border)', background: 'var(--sb-surface)' }}
      >

        {/* ══ TOP: Tab bar ═══════════════════════════════════════════════════════ */}
        <div className="flex items-center flex-shrink-0" style={{ borderBottom: '1px solid var(--sb-divider)', background: 'var(--sb-bg)' }}>
          {([
            ['internal', t('tabInternal'), totalUnread] as const,
            ['whatsapp', 'WhatsApp', waUnread] as const,
          ]).map(([key, lbl, unread]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold relative"
              style={{
                color: activeTab === key ? 'var(--sb-accent, #7c3aed)' : 'var(--sb-text-muted)',
                borderBottom: activeTab === key ? '2px solid var(--sb-accent, #7c3aed)' : '2px solid transparent',
                marginBottom: -1,
              }}
              onMouseEnter={e => { if (activeTab !== key) e.currentTarget.style.color = 'var(--sb-text)'; }}
              onMouseLeave={e => { if (activeTab !== key) e.currentTarget.style.color = 'var(--sb-text-muted)'; }}
            >
              {key === 'whatsapp' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: activeTab === key ? '#25D366' : 'currentColor' }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.252-.149-2.868.852.852-2.868-.149-.252A7.963 7.963 0 014 12a8 8 0 1116 0 8 8 0 01-8 8z"/>
                </svg>
              )}
              {key === 'internal' && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              )}
              {lbl}
              {unread > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-white text-[9px] font-bold"
                  style={{ background: key === 'whatsapp' ? '#25D366' : '#7c3aed' }}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          ))}

          {/* Close button */}
          <button onClick={() => setOpen(false)}
            className="ml-auto mr-3 w-6 h-6 flex items-center justify-center rounded-md" style={{ color: 'var(--sb-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; e.currentTarget.style.color = 'var(--sb-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sb-text-muted)'; }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ══ CONTENT ═══════════════════════════════════════════════════════════ */}
        <div className="flex flex-1 min-h-0">

          {/* ── Internal Messages Tab ─────────────────────────────────────────── */}
          {activeTab === 'internal' && (
            <>
              {/* LEFT: contact list */}
              <div className="flex flex-col flex-shrink-0" style={{ width: 228, borderRight: '1px solid var(--sb-divider)', background: 'var(--sb-bg)' }}>
                {/* Search */}
                <div className="px-2.5 py-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--sb-hover)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--sb-text-muted)" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input placeholder={t('searchContacts')} value={search} onChange={e => setSearch(e.target.value)}
                      className="flex-1 text-xs outline-none bg-transparent" style={{ color: 'var(--sb-text)' }} />
                    {search && (
                      <button onClick={() => setSearch('')} style={{ color: 'var(--sb-text-muted)', display: 'flex', alignItems: 'center' }}>
                        <HandIcon name="cross-mark" size={10} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Recent label */}
                {conversations.length > 0 && !search && (
                  <div className="px-3 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sb-text-faint)' }}>{t('recentConversations')}</span>
                  </div>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                  {mergedList.length === 0 ? (
                    <div className="py-10 text-center text-xs" style={{ color: 'var(--sb-text-muted)' }}>
                      {search ? t('noMatchingContacts') : t('noContacts')}
                    </div>
                  ) : mergedList.map((item, idx) => {
                    const isActive = selectedId === item.other_id;
                    const prev = mergedList[idx - 1];
                    const showSectionLabel = !search && !item.isConversation && (idx === 0 || prev.isConversation);
                    return (
                      <div key={item.other_id}>
                        {showSectionLabel && conversations.length > 0 && (
                          <div className="px-3 pt-3 pb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sb-text-faint)' }}>{t('otherContacts')}</span>
                          </div>
                        )}
                        <div onClick={() => selectUser(item)}
                          className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                          style={{
                            background: isActive ? 'var(--sb-selected)' : 'transparent',
                            borderLeft: isActive ? '2px solid var(--sb-accent)' : '2px solid transparent',
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--sb-hover)'; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--sb-selected)' : 'transparent'; }}
                        >
                          <div className="relative flex-shrink-0">
                            <Avatar id={item.other_id} name={item.full_name} email={item.email} avatarUrl={item.avatar_url} size={36} />
                            {item.unread_count > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white font-bold"
                                style={{ fontSize: 9, background: '#7c3aed', padding: '0 3px' }}>{item.unread_count}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-1">
                              <span className="text-xs font-semibold truncate" style={{ color: 'var(--sb-text)' }}>{item.full_name || item.email}</span>
                              {item.last_at && (
                                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--sb-text-faint)' }}>{timeAgo(item.last_at, t('justNow'))}</span>
                              )}
                            </div>
                            <span className="text-[11px] block truncate mt-0.5" style={{ color: item.isConversation ? 'var(--sb-text-muted)' : 'var(--sb-text-faint)' }}>
                              {item.isConversation ? item.last_content : item.email}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: Thread */}
              <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--notion-bg)' }}>
                {selectedId ? (
                  <>
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
                      style={{ background: 'var(--sb-surface)', borderBottom: '1px solid var(--sb-divider)' }}>
                      <Avatar id={selectedId} name={selectedItem?.full_name} email={selectedItem?.email} avatarUrl={selectedItem?.avatar_url} size={36} />
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--sb-text)' }}>{selName}</div>
                        <div className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>{selEmail}</div>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
                      {loadingThread ? (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>{t('loading')}</span>
                        </div>
                      ) : thread.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-2">
                          <Avatar id={selectedId} name={selectedItem?.full_name} email={selectedItem?.email} avatarUrl={selectedItem?.avatar_url} size={56} />
                          <p className="text-sm font-medium mt-2" style={{ color: 'var(--sb-text)' }}>{selName}</p>
                          <p className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>{t('sendFirstMessage')}</p>
                        </div>
                      ) : (
                        thread.map((msg, idx) => {
                          const isFromMe = msg.from_user_id !== selectedId;
                          const prev     = thread[idx - 1];
                          const next     = thread[idx + 1];
                          const sameAsPrev = prev?.from_user_id === msg.from_user_id;
                          const sameAsNext = next?.from_user_id === msg.from_user_id;
                          const showTime   = !prev ||
                            new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000;

                          const brMine = {
                            borderRadius: 18,
                            borderTopRightRadius: sameAsPrev ? 4 : 18,
                            borderBottomRightRadius: sameAsNext ? 4 : 18,
                          };
                          const brTheirs = {
                            borderRadius: 18,
                            borderTopLeftRadius: sameAsPrev ? 4 : 18,
                            borderBottomLeftRadius: sameAsNext ? 4 : 18,
                          };

                          return (
                            <div key={msg.id} className={sameAsPrev && !showTime ? 'mt-0.5' : 'mt-3'}>
                              {showTime && (
                                <div className="flex justify-center mb-2">
                                  <span className="text-[10px] px-2.5 py-0.5 rounded-full select-none"
                                    style={{ background: 'var(--sb-hover-strong)', color: 'var(--sb-text-muted)' }}>
                                    {formatTime(msg.created_at, lang)}
                                  </span>
                                </div>
                              )}
                              <div className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} items-end gap-1.5`}>
                                {!isFromMe && (
                                  <div style={{ width: 28, flexShrink: 0 }}>
                                    {!sameAsNext && (
                                      <Avatar id={selectedId} name={selectedItem?.full_name} email={selectedItem?.email} avatarUrl={selectedItem?.avatar_url} size={26} />
                                    )}
                                  </div>
                                )}
                                <div className={`flex flex-col ${isFromMe ? 'items-end' : 'items-start'} max-w-[66%]`}>
                                  <div className="px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap"
                                    style={{
                                      background: isFromMe ? '#7c3aed' : 'var(--sb-surface)',
                                      color: isFromMe ? 'white' : 'var(--sb-text)',
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
                                      ...(isFromMe ? brMine : brTheirs),
                                    }}>
                                    {msg.content}
                                  </div>
                                  {(isFromMe || !sameAsNext) && (
                                    <div className={`flex items-center gap-1 mt-1 px-0.5 ${isFromMe ? 'flex-row' : 'flex-row-reverse'}`}>
                                      {isFromMe && <DoubleCheck isRead={msg.is_read} />}
                                      <span className="text-[10px]" style={{ color: 'var(--sb-text-faint)' }}>
                                        {formatTime(msg.created_at, lang)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={threadEndRef} />
                    </div>

                    {/* Input */}
                    <div className="px-4 py-3 flex-shrink-0" style={{ background: 'var(--sb-surface)', borderTop: '1px solid var(--sb-divider)' }}>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl" style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)' }}>
                        <input ref={inputRef} placeholder={t('messageTo', { name: selName })}
                          value={inputText} onChange={e => setInputText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                          className="flex-1 text-sm outline-none bg-transparent" style={{ color: 'var(--sb-text)' }} />
                        <button onClick={sendMessage} disabled={!inputText.trim() || sending}
                          className="w-7 h-7 flex items-center justify-center rounded-xl text-white disabled:opacity-30 flex-shrink-0 transition-opacity"
                          style={{ background: '#7c3aed' }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = inputText.trim() ? '0.85' : '0.3'; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = inputText.trim() ? '1' : '0.3'; }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                          </svg>
                        </button>
                      </div>
                      <p className="text-[10px] mt-1.5 px-1" style={{ color: 'var(--sb-text-faint)' }}>{t('enterToSend')} · {t('shiftEnterNewline')}</p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2" style={{ opacity: 0.4 }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--sb-text-muted)" strokeWidth="1.2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <p className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>{t('selectContact')}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── WhatsApp Tab ──────────────────────────────────────────────────── */}
          {activeTab === 'whatsapp' && (
            <>
              {/* LEFT: WhatsApp conversation list */}
              <div className="flex flex-col flex-shrink-0" style={{ width: 260, borderRight: '1px solid var(--sb-divider)', background: 'var(--sb-bg)' }}>

                {/* Account status bar */}
                {waAccounts.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid var(--sb-divider)', background: 'var(--sb-surface)' }}>
                    {waAccounts.map(acc => (
                      <div key={acc.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] flex-shrink-0"
                        style={{ background: acc.status === 'connected' ? '#dcfce7' : acc.status === 'pending_qr' ? '#fef9c3' : '#fee2e2',
                                 color: acc.status === 'connected' ? '#15803d' : acc.status === 'pending_qr' ? '#a16207' : '#dc2626' }}
                        title={acc.phone_number || acc.wa_jid || ''}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: acc.status === 'connected' ? '#22c55e' : acc.status === 'pending_qr' ? '#eab308' : '#ef4444' }} />
                        <span className="truncate max-w-[80px]">{acc.display_name || acc.phone_number || t('waFilterAccount')}</span>
                      </div>
                    ))}
                    <a href={`/${typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : ''}/settings?tab=whatsapp`}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 hover:underline"
                      style={{ color: '#25D366' }}>
                      {t('waManageAccounts')} &rarr;
                    </a>
                  </div>
                )}

                {/* Search */}
                <div className="px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--sb-hover)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--sb-text-muted)" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input placeholder={t('searchContacts')} value={waSearch} onChange={e => setWaSearch(e.target.value)}
                      className="flex-1 text-xs outline-none bg-transparent" style={{ color: 'var(--sb-text)' }} />
                    {waSearch && (
                      <button onClick={() => setWaSearch('')} style={{ color: 'var(--sb-text-muted)', display: 'flex', alignItems: 'center' }}>
                        <HandIcon name="cross-mark" size={10} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter toolbar */}
                <div className="flex flex-wrap gap-1 px-2.5 pb-1.5">
                  {waAccounts.length > 1 && (
                    <select value={waFilterAccount} onChange={e => setWaFilterAccount(e.target.value)}
                      className="text-[10px] h-6 rounded px-1.5 outline-none cursor-pointer"
                      style={{ background: 'var(--sb-hover)', color: 'var(--sb-text)', border: 'none' }}>
                      <option value="">{t('waFilterAccount')}</option>
                      {waAccounts.map(a => <option key={a.id} value={a.id}>{a.display_name || a.phone_number || a.id.slice(0, 8)}</option>)}
                    </select>
                  )}
                  <select value={waFilterGroup} onChange={e => setWaFilterGroup(e.target.value as '' | 'true' | 'false')}
                    className="text-[10px] h-6 rounded px-1.5 outline-none cursor-pointer"
                    style={{ background: 'var(--sb-hover)', color: 'var(--sb-text)', border: 'none' }}>
                    <option value="">{t('waFilterAll')}</option>
                    <option value="false">{t('waFilterDM')}</option>
                    <option value="true">{t('waFilterGroup')}</option>
                  </select>
                  {waLabels.length > 0 && (
                    <select value={waFilterLabel} onChange={e => setWaFilterLabel(e.target.value)}
                      className="text-[10px] h-6 rounded px-1.5 outline-none cursor-pointer"
                      style={{ background: 'var(--sb-hover)', color: 'var(--sb-text)', border: 'none' }}>
                      <option value="">{t('waFilterLabel')}</option>
                      {waLabels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                  <select value={waSortBy} onChange={e => setWaSortBy(e.target.value as 'last_message' | 'unread')}
                    className="text-[10px] h-6 rounded px-1.5 outline-none cursor-pointer"
                    style={{ background: 'var(--sb-hover)', color: 'var(--sb-text)', border: 'none' }}>
                    <option value="last_message">{t('waSortLastMsg')}</option>
                    <option value="unread">{t('waSortUnread')}</option>
                  </select>
                  <button onClick={() => setShowArchived(!showArchived)}
                    className="text-[10px] h-6 rounded px-1.5 cursor-pointer flex items-center gap-0.5"
                    style={{ background: showArchived ? '#dbeafe' : 'var(--sb-hover)', color: showArchived ? '#1d4ed8' : 'var(--sb-text)' }}>
                    {showArchived ? '📦 Archived' : '📦'}
                  </button>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                  {waLoading ? (
                    <div className="py-10 text-center text-xs" style={{ color: 'var(--sb-text-muted)' }}>{t('loading')}</div>
                  ) : waAccounts.length === 0 && waConversations.length === 0 ? (
                    <div className="py-10 text-center text-xs px-4" style={{ color: 'var(--sb-text-muted)' }}>
                      {t('waNoAccounts')}
                    </div>
                  ) : waFiltered.length === 0 ? (
                    <div className="py-10 text-center text-xs" style={{ color: 'var(--sb-text-muted)' }}>
                      {waSearch ? t('noMatchingContacts') : t('noWhatsApp')}
                    </div>
                  ) : waFiltered.map(conv => {
                    const contactName = conv.display_name || conv.push_name || conv.phone_number || 'Unknown';
                    const crmName = conv.crm_account_name || conv.lead_name;
                    const isLinked = !!(conv.crm_account_name || conv.lead_name);
                    const isActive = waSelected?.id === conv.id;
                    const statusColor = conv.lead_status ? LEAD_STATUS_COLORS[conv.lead_status] : null;
                    const labels = Array.isArray(conv.wa_labels) ? conv.wa_labels : [];
                    const jidShort = conv.wa_jid?.replace(/@s\.whatsapp\.net$/, '') || '';
                    return (
                      <div key={conv.id}
                        onClick={() => {
                          setWaSelected(conv);
                          if (conv.unread_count > 0) {
                            setWaConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
                            setWaUnread(prev => Math.max(0, prev - conv.unread_count));
                          }
                        }}
                        className="group flex items-start gap-2.5 px-3 py-2 cursor-pointer"
                        style={{
                          background: isActive ? 'var(--sb-selected)' : 'transparent',
                          borderLeft: isActive ? '2px solid #25D366' : '2px solid transparent',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--sb-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--sb-selected)' : 'transparent'; }}
                      >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0 mt-0.5">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden"
                            style={{ background: conv.is_group ? '#128C7E' : '#25D366' }}>
                            {conv.profile_pic_url ? (
                              <img src={conv.profile_pic_url} alt="" className="w-full h-full object-cover" />
                            ) : conv.is_group ? '\uD83D\uDC65' : contactName.charAt(0).toUpperCase()}
                          </div>
                          {conv.unread_count > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white font-bold"
                              style={{ fontSize: 9, background: '#25D366', padding: '0 3px' }}>{conv.unread_count}</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Row 1: CRM name (if linked) or contact name + time */}
                          <div className="flex items-baseline justify-between gap-1">
                            <div className="flex items-center gap-1 min-w-0">
                              {isLinked ? (
                                <>
                                  <span className="text-xs font-semibold truncate" style={{ color: '#15803d' }}>{crmName}</span>
                                  {statusColor && conv.lead_status && (
                                    <span className="text-[9px] px-1 rounded flex-shrink-0"
                                      style={{ background: statusColor.bg, color: statusColor.text }}>
                                      {conv.lead_status}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--sb-text)' }}>{contactName}</span>
                                </>
                              )}
                              {conv.is_group && <span className="text-[9px] px-1 rounded" style={{ background: '#128C7E20', color: '#128C7E' }}>G</span>}
                            </div>
                            {conv.last_message_at && (
                              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--sb-text-faint)' }}>
                                {timeAgo(conv.last_message_at, t('justNow'))}
                              </span>
                            )}
                          </div>

                          {/* Row 2: owner_name → contact_name · wa_jid */}
                          <div className="flex items-center gap-1 mt-0.5 min-w-0">
                            {conv.owner_name && (
                              <>
                                <span className="text-[10px] truncate flex-shrink-0" style={{ color: 'var(--sb-text-muted)' }}>{conv.owner_name}</span>
                                <span className="text-[10px]" style={{ color: 'var(--sb-text-faint)' }}>&rarr;</span>
                              </>
                            )}
                            {isLinked && (
                              <span className="text-[10px] truncate" style={{ color: 'var(--sb-text-muted)' }}>{contactName}</span>
                            )}
                            {jidShort && (
                              <>
                                {(conv.owner_name || isLinked) && <span className="text-[10px]" style={{ color: 'var(--sb-text-faint)' }}>&middot;</span>}
                                <span className="text-[10px] truncate" style={{ color: 'var(--sb-text-faint)' }}>{jidShort}</span>
                              </>
                            )}
                          </div>

                          {/* Row 3: Message preview */}
                          <span className="text-[11px] block truncate mt-0.5" style={{ color: 'var(--sb-text-muted)' }}>
                            {conv.last_message_preview || ''}
                          </span>

                          {/* Row 4: Labels + archive + link button */}
                          <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
                            {labels.slice(0, 3).map((lb, i) => (
                              <span key={i} className="text-[9px] px-1 rounded truncate max-w-[70px]"
                                style={{ background: 'var(--sb-hover)', color: 'var(--sb-text-muted)' }}>
                                {lb.name}
                              </span>
                            ))}
                            {labels.length > 3 && (
                              <span className="text-[9px]" style={{ color: 'var(--sb-text-faint)' }}>+{labels.length - 3}</span>
                            )}
                            {/* Label manage button */}
                            <button
                              onClick={e => { e.stopPropagation(); setLabelingContact(conv); }}
                              className="text-[9px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ background: '#fef9c3', color: '#a16207' }}
                              title="Manage labels"
                            >+Label</button>
                            {/* Archive button */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const isArch = (conv as any).is_archived;
                                  await api.post(`/api/whatsapp/conversations/${conv.id}/archive`, { archive: !isArch });
                                  loadWaConversations({ account_id: waFilterAccount, is_group: waFilterGroup, label_id: waFilterLabel, sort_by: waSortBy, include_archived: showArchived });
                                } catch {}
                              }}
                              className="text-[9px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ background: 'var(--sb-hover)', color: 'var(--sb-text-muted)' }}
                              title={(conv as any).is_archived ? 'Unarchive' : 'Archive'}
                            >{(conv as any).is_archived ? 'Unarchive' : 'Archive'}</button>
                            {!isLinked && (
                              <button
                                onClick={e => { e.stopPropagation(); setLinkingContact(conv); }}
                                className="ml-auto text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: '#dbeafe', color: '#1d4ed8' }}
                                title="Link to CRM"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline mr-0.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                Link
                              </button>
                            )}
                            {isLinked && (
                              <button
                                onClick={e => { e.stopPropagation(); setLinkingContact(conv); }}
                                className="ml-auto text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: '#f0fdf4', color: '#15803d' }}
                                title="Manage CRM link"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline mr-0.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                Linked
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: WhatsApp chat */}
              <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--notion-bg)' }}>
                {waSelected ? (
                  <WhatsAppChatPanel
                    contactId={waSelected.id}
                    contactName={waSelected.display_name || waSelected.push_name || waSelected.phone_number}
                    profilePicUrl={waSelected.profile_pic_url}
                    isGroup={waSelected.is_group}
                    disappearingDuration={waSelected.disappearing_duration}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2" style={{ opacity: 0.4 }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#25D366" opacity="0.5">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.252-.149-2.868.852.852-2.868-.149-.252A7.963 7.963 0 014 12a8 8 0 1116 0 8 8 0 01-8 8z"/>
                    </svg>
                    <p className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>{t('selectWaChat')}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* CRM Link Modal */}
      {linkingContact && (
        <LinkContactModal
          contact={linkingContact}
          onClose={() => setLinkingContact(null)}
          onLinked={() => {
            setLinkingContact(null);
            loadWaConversations({ account_id: waFilterAccount, is_group: waFilterGroup, label_id: waFilterLabel, sort_by: waSortBy, include_archived: showArchived });
          }}
        />
      )}

      {/* Label Management Modal */}
      {labelingContact && (
        <LabelManageModal
          contact={labelingContact}
          allLabels={waLabels}
          onClose={() => setLabelingContact(null)}
          onUpdated={() => {
            setLabelingContact(null);
            loadWaConversations({ account_id: waFilterAccount, is_group: waFilterGroup, label_id: waFilterLabel, sort_by: waSortBy, include_archived: showArchived });
          }}
        />
      )}
    </>
  );
}

// ── Link Contact Modal ────────────────────────────────────────────────────────
function LinkContactModal({ contact, onClose, onLinked }: {
  contact: WaConversation;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [tab, setTab] = useState<'lead' | 'account'>('lead');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const isLinked = !!(contact.lead_id || contact.account_id);
  const currentLink = contact.crm_account_name || contact.lead_name;

  useEffect(() => {
    setResults([]);
    setSearch('');
  }, [tab]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const endpoint = tab === 'lead'
          ? `/api/crm/leads?search=${encodeURIComponent(search)}&limit=20`
          : `/api/crm/accounts?search=${encodeURIComponent(search)}&limit=20`;
        const data = await api.get(endpoint);
        setResults(Array.isArray(data) ? data : (data?.items || []));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, tab]);

  async function handleLink(targetId: string) {
    setLinking(true);
    try {
      if (tab === 'lead') {
        await api.post(`/api/whatsapp/contacts/${contact.id}/link-lead`, { lead_id: targetId });
      } else {
        await api.post(`/api/whatsapp/contacts/${contact.id}/link-account`, { account_id: targetId });
      }
      onLinked();
    } catch (e: any) { alert(e.message || 'Link failed'); }
    finally { setLinking(false); }
  }

  async function handleUnlink() {
    setLinking(true);
    try {
      await api.post(`/api/whatsapp/contacts/${contact.id}/unlink`, {});
      onLinked();
    } catch (e: any) { alert(e.message || 'Unlink failed'); }
    finally { setLinking(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div className="rounded-xl w-full max-w-md shadow-xl border overflow-hidden"
        style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
              Link to CRM
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>
              {contact.display_name || contact.push_name || contact.phone_number}
            </p>
          </div>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--notion-text-muted)' }}>&times;</button>
        </div>

        {/* Current link info */}
        {isLinked && (
          <div className="px-5 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)', background: '#f0fdf4' }}>
            <span className="text-xs" style={{ color: '#15803d' }}>
              Currently linked to: <strong>{currentLink}</strong>
            </span>
            <button onClick={handleUnlink} disabled={linking}
              className="text-[10px] px-2 py-0.5 rounded font-medium"
              style={{ background: '#fef2f2', color: '#dc2626' }}>
              Unlink
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--notion-border)' }}>
          {(['lead', 'account'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 text-xs font-medium transition-colors"
              style={{
                color: tab === t ? '#1d4ed8' : 'var(--notion-text-muted)',
                borderBottom: tab === t ? '2px solid #1d4ed8' : '2px solid transparent',
              }}>
              {t === 'lead' ? 'Link Lead' : 'Link Account'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-5 py-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'lead' ? 'Search leads by name, email, phone...' : 'Search accounts by name...'}
            autoFocus
            className="w-full px-3 py-2 rounded-md text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
        </div>

        {/* Results */}
        <div className="px-5 pb-4 max-h-[300px] overflow-y-auto">
          {searching && <p className="text-xs text-center py-4" style={{ color: 'var(--notion-text-muted)' }}>Searching...</p>}
          {!searching && search && results.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--notion-text-muted)' }}>No results found</p>
          )}
          {results.map(item => (
            <button key={item.id} onClick={() => handleLink(item.id)} disabled={linking}
              className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors"
              style={{ color: 'var(--notion-text)' }}>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{tab === 'lead' ? item.full_name : item.name}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--notion-text-muted)' }}>
                  {tab === 'lead'
                    ? [item.company, item.email, item.phone].filter(Boolean).join(' · ')
                    : [item.industry, item.phone_number].filter(Boolean).join(' · ')}
                </p>
              </div>
              {tab === 'lead' && item.status && (
                <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: '#f3f4f6', color: '#6b7280' }}>{item.status}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Label Management Modal ─────────────────────────────────────────────────────
function LabelManageModal({ contact, allLabels, onClose, onUpdated }: {
  contact: WaConversation;
  allLabels: WaLabel[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const contactLabels = Array.isArray(contact.wa_labels) ? contact.wa_labels : [];
  const contactLabelIds = new Set(contactLabels.map(l => l.id));

  async function toggleLabel(labelId: string) {
    setSaving(true);
    const action = contactLabelIds.has(labelId) ? 'remove' : 'add';
    try {
      await api.post(`/api/whatsapp/conversations/${contact.id}/labels`, { label_id: labelId, action });
      onUpdated();
    } catch (e: any) { alert(e.message || 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div className="rounded-xl w-full max-w-sm shadow-xl border overflow-hidden"
        style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>Manage Labels</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>
              {contact.display_name || contact.push_name || contact.phone_number}
            </p>
          </div>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--notion-text-muted)' }}>&times;</button>
        </div>
        <div className="px-5 py-3 max-h-[300px] overflow-y-auto">
          {allLabels.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--notion-text-muted)' }}>No labels available</p>
          ) : allLabels.map(label => {
            const isSelected = contactLabelIds.has(label.id);
            return (
              <button key={label.id} onClick={() => toggleLabel(label.id)} disabled={saving}
                className="w-full text-left px-3 py-2 rounded-md flex items-center justify-between hover:bg-gray-50 transition-colors mb-1">
                <div className="flex items-center gap-2">
                  {label.color && (
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: label.color }} />
                  )}
                  <span className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{label.name}</span>
                </div>
                <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${isSelected ? 'bg-green-500 text-white' : 'border'}`}
                  style={{ borderColor: isSelected ? undefined : 'var(--notion-border)' }}>
                  {isSelected && '✓'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
