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
  display_name?: string;
  push_name?: string;
  phone_number?: string;
  profile_pic_url?: string;
  lead_id?: string;
  lead_name?: string;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count: number;
  is_group?: boolean;
  disappearing_duration?: number;
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
  const loadWaConversations = useCallback(async () => {
    setWaLoading(true);
    try {
      const convs = await api.get('/api/whatsapp/dashboard');
      const list: WaConversation[] = Array.isArray(convs) ? convs : [];
      setWaConversations(list);
      setWaUnread(list.reduce((s, c) => s + (c.unread_count || 0), 0));
    } catch {}
    finally { setWaLoading(false); }
  }, []);

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
              <div className="flex flex-col flex-shrink-0" style={{ width: 228, borderRight: '1px solid var(--sb-divider)', background: 'var(--sb-bg)' }}>
                {/* Search */}
                <div className="px-2.5 py-2">
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

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                  {waLoading ? (
                    <div className="py-10 text-center text-xs" style={{ color: 'var(--sb-text-muted)' }}>{t('loading')}</div>
                  ) : waFiltered.length === 0 ? (
                    <div className="py-10 text-center text-xs" style={{ color: 'var(--sb-text-muted)' }}>
                      {waSearch ? t('noMatchingContacts') : t('noWhatsApp')}
                    </div>
                  ) : waFiltered.map(conv => {
                    const name = conv.display_name || conv.push_name || conv.phone_number || 'Unknown';
                    const isActive = waSelected?.id === conv.id;
                    return (
                      <div key={conv.id}
                        onClick={() => {
                          setWaSelected(conv);
                          if (conv.unread_count > 0) {
                            setWaConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
                            setWaUnread(prev => Math.max(0, prev - conv.unread_count));
                          }
                        }}
                        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                        style={{
                          background: isActive ? 'var(--sb-selected)' : 'transparent',
                          borderLeft: isActive ? '2px solid #25D366' : '2px solid transparent',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--sb-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--sb-selected)' : 'transparent'; }}
                      >
                        {/* WA Avatar */}
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden"
                            style={{ background: conv.is_group ? '#128C7E' : '#25D366' }}>
                            {conv.profile_pic_url ? (
                              <img src={conv.profile_pic_url} alt="" className="w-full h-full object-cover" />
                            ) : conv.is_group ? '\uD83D\uDC65' : name.charAt(0).toUpperCase()}
                          </div>
                          {conv.unread_count > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white font-bold"
                              style={{ fontSize: 9, background: '#25D366', padding: '0 3px' }}>{conv.unread_count}</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-xs font-semibold truncate" style={{ color: 'var(--sb-text)' }}>{name}</span>
                            {conv.last_message_at && (
                              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--sb-text-faint)' }}>
                                {timeAgo(conv.last_message_at, t('justNow'))}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] block truncate mt-0.5" style={{ color: 'var(--sb-text-muted)' }}>
                            {conv.last_message_preview || (conv.lead_name ? conv.lead_name : '')}
                          </span>
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
    </>
  );
}
