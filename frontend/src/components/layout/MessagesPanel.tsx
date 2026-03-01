'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useTranslations, useLocale } from 'next-intl';
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

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#7c3aed,#a855f7)',
  'linear-gradient(135deg,#0369a1,#0ea5e9)',
  'linear-gradient(135deg,#065f46,#10b981)',
  'linear-gradient(135deg,#92400e,#f59e0b)',
  'linear-gradient(135deg,#9f1239,#f43f5e)',
];

function avatarBg(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[h];
}

function initials(name?: string, email?: string) {
  return (name?.[0] || email?.[0] || '?').toUpperCase();
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
  const [open, setOpen]                   = useState(false);
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

  // ── Unread badge polling — pause when tab hidden ──────────────────────────
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

  // ── Thread polling every 15 s — pause when tab hidden ──────────────────────
  useEffect(() => {
    if (!open || !selectedId || !isVisible) return;
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
  }, [open, selectedId, loadConversations, isVisible]);

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
  }

  // ── Select user ───────────────────────────────────────────────────────────
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

  // ── Send ──────────────────────────────────────────────────────────────────
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

  // ── Merged left-panel list: conversations first, then unchatted users ──────
  const mergedList = useMemo<ListItem[]>(() => {
    const q = search.toLowerCase();
    const convIds = new Set(conversations.map(c => c.other_id));

    const convItems: ListItem[] = conversations.map(c => ({
      other_id: c.other_id,
      full_name: c.full_name,
      email: c.email,
      avatar_url: c.avatar_url,
      last_content: c.last_content,
      last_at: c.last_at,
      unread_count: Number(c.unread_count || 0),
      isConversation: true,
    }));

    const otherItems: ListItem[] = allUsers
      .filter(u => !convIds.has(u.id))
      .map(u => ({ other_id: u.id, full_name: u.full_name, email: u.email, avatar_url: u.avatar_url, unread_count: 0, isConversation: false }));

    const all = [...convItems, ...otherItems];
    if (!q) return all;
    return all.filter(i => i.full_name?.toLowerCase().includes(q) || i.email?.toLowerCase().includes(q));
  }, [conversations, allUsers, search]);

  const selName  = selectedItem?.full_name || selectedItem?.email || '';
  const selEmail = selectedItem?.email || '';

  // ── Closed: full-width row button when label provided ──────────────────────
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
        {totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-white font-bold"
            style={{ fontSize: 9, background: '#7c3aed', padding: '0 3px' }}>
            {totalUnread > 99 ? '99+' : totalUnread}
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
        className="fixed z-[160] rounded-2xl shadow-2xl overflow-hidden flex"
        style={{ bottom: 56, left: 252, width: 700, height: 530, border: '1px solid var(--sb-border)', background: 'var(--sb-surface)' }}
      >

        {/* ══ LEFT: Always-visible user list ══════════════════════════════════ */}
        <div className="flex flex-col flex-shrink-0" style={{ width: 228, borderRight: '1px solid var(--sb-divider)', background: 'var(--sb-bg)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--sb-divider)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--sb-text)' }}>
              {label || t('title')}
              {totalUnread > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold" style={{ background: '#7c3aed' }}>
                  {totalUnread}
                </span>
              )}
            </span>
            <button onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-md" style={{ color: 'var(--sb-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--sb-hover)'; e.currentTarget.style.color = 'var(--sb-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sb-text-muted)'; }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="px-2.5 py-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--sb-hover)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--sb-text-muted)" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                placeholder={t('searchContacts')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 text-xs outline-none bg-transparent"
                style={{ color: 'var(--sb-text)' }}
              />
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
                  <div
                    onClick={() => selectUser(item)}
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
                          style={{ fontSize: 9, background: '#7c3aed', padding: '0 3px' }}>
                          {item.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--sb-text)' }}>
                          {item.full_name || item.email}
                        </span>
                        {item.last_at && (
                          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--sb-text-faint)' }}>
                            {timeAgo(item.last_at, t('justNow'))}
                          </span>
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

        {/* ══ RIGHT: Thread ═════════════════════════════════════════════════════ */}
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
                            <div
                              className="px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap"
                              style={{
                                background: isFromMe ? '#7c3aed' : 'var(--sb-surface)',
                                color: isFromMe ? 'white' : 'var(--sb-text)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
                                ...(isFromMe ? brMine : brTheirs),
                              }}
                            >
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
                  <input
                    ref={inputRef}
                    placeholder={t('messageTo', { name: selName })}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    className="flex-1 text-sm outline-none bg-transparent"
                    style={{ color: 'var(--sb-text)' }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim() || sending}
                    className="w-7 h-7 flex items-center justify-center rounded-xl text-white disabled:opacity-30 flex-shrink-0 transition-opacity"
                    style={{ background: '#7c3aed' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = inputText.trim() ? '0.85' : '0.3'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = inputText.trim() ? '1' : '0.3'; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] mt-1.5 px-1" style={{ color: 'var(--sb-text-faint)' }}>{t('enterToSend')} · {t('shiftEnterNewline')}</p>
              </div>
            </>
          ) : (
            /* No selection */
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ opacity: 0.4 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--sb-text-muted)" strokeWidth="1.2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>{t('selectContact')}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
