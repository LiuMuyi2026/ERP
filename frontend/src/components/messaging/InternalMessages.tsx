'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useInternalMessagesSocket } from '@/lib/useInternalMessagesSocket';
import { useTranslations, useLocale } from 'next-intl';
import toast from 'react-hot-toast';

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

function DoubleCheck({ isRead }: { isRead: boolean }) {
  const c = isRead ? '#7c3aed' : '#a0aec0';
  return (
    <svg width="17" height="10" viewBox="0 0 17 10" fill="none" style={{ flexShrink: 0 }}>
      <polyline points="1,5 3.8,7.5 7.5,1.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="5.5,5 8.3,7.5 12,1.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function InternalMessages() {
  const t = useTranslations('messages');
  const lang = useLocale();
  const isVisible = usePageVisibility();
  const PAGE_SIZE = 60;
  const { on, connected: wsConnected } = useInternalMessagesSocket();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [search, setSearch] = useState('');
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [myId, setMyId] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get('/api/messages/conversations');
      setConversations(Array.isArray(data) ? data : []);
    } catch (e: any) { console.error('loadConversations:', e); }
  }, []);

  // Initial load
  useEffect(() => {
    loadConversations();
    api.get('/api/messages/users').then((users: any) => {
      setAllUsers(Array.isArray(users) ? users : []);
    }).catch(() => {});
  }, [loadConversations]);

  const loadThread = useCallback(async (otherId: string, before?: string) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (before) params.set('before', before);
    const data: Message[] = await api.get(`/api/messages/${otherId}?${params.toString()}`);
    const list = Array.isArray(data) ? data : [];
    setHasMore(list.length === PAGE_SIZE);
    return list;
  }, []);

  // Fallback polling (WS is primary)
  useEffect(() => {
    if (!selectedId || !isVisible) return;
    const load = async () => {
      try {
        const data = await loadThread(selectedId);
        setThread(prev => {
          const next = data;
          const changed =
            next.length !== prev.length ||
            next[next.length - 1]?.id !== prev[prev.length - 1]?.id ||
            next.some((m, i) => prev[i] && m.is_read !== prev[i].is_read);
          return changed ? next : prev;
        });
        loadConversations();
      } catch (e: any) { console.error('loadThread poll:', e); }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [selectedId, loadConversations, isVisible, loadThread]);

  // Real-time events
  useEffect(() => {
    const offMsg = on('internal_message', async (event) => {
      const msg = event?.message as Message | undefined;
      if (!msg) return;
      await loadConversations();

      if (!myId || !selectedId) return;
      const otherId = msg.from_user_id === myId ? msg.to_user_id : msg.from_user_id;
      if (otherId !== selectedId) return;

      setThread(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      // If this is an inbound message in the open thread, mark read quickly.
      if (msg.from_user_id === selectedId && msg.to_user_id === myId) {
        try {
          const latest = await loadThread(selectedId);
          setThread(latest);
        } catch (e) {
          console.error('refresh after ws message:', e);
        }
      }
    });

    const offRead = on('message_read', (event) => {
      if (!myId || !selectedId) return;
      const readerId = String(event?.reader_id || '');
      if (readerId !== selectedId) return;
      setThread(prev => prev.map(m => (
        m.from_user_id === myId && m.to_user_id === selectedId
          ? { ...m, is_read: true }
          : m
      )));
      loadConversations();
    });

    return () => {
      offMsg();
      offRead();
    };
  }, [on, loadConversations, loadThread, myId, selectedId]);

  // Auto-scroll
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  async function selectUser(item: ListItem) {
    setSelectedId(item.other_id);
    setSelectedItem(item);
    setThread([]);
    setHasMore(true);
    setLoadingThread(true);
    try {
      const data = await loadThread(item.other_id);
      setThread(data);
      loadConversations();
    } catch (e: any) { console.error('selectUser:', e); toast.error('Failed to load messages'); } finally {
      setLoadingThread(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function loadOlderMessages() {
    if (!selectedId || loadingOlder || !hasMore || thread.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = thread[0]?.created_at;
      if (!oldest) return;
      const older = await loadThread(selectedId, oldest);
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      setThread(prev => {
        const seen = new Set(prev.map(m => m.id));
        const merged = older.filter(m => !seen.has(m.id));
        return merged.length ? [...merged, ...prev] : prev;
      });
    } catch (e: any) {
      console.error('loadOlderMessages:', e);
      toast.error('Failed to load older messages');
    } finally {
      setLoadingOlder(false);
    }
  }

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

  const selName = selectedItem?.full_name || selectedItem?.email || '';

  useEffect(() => {
    try { setMyId(JSON.parse(localStorage.getItem('nexus_user') || '{}').id || ''); } catch {}
  }, []);

  return (
    <div className="h-full flex" style={{ background: '#f0f2f5' }}>
      {/* Left: Conversations List */}
      <div className="flex flex-col" style={{ width: 320, background: 'white', borderRight: '1px solid #e5e7eb' }}>
        {/* Search */}
        <div className="px-3 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('searchUsers') || 'Search users...'}
            className="w-full text-xs border rounded-lg px-3 py-2 outline-none"
            style={{ borderColor: '#e5e7eb' }} />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-auto">
          {mergedList.map(item => {
            const active = item.other_id === selectedId;
            return (
              <div key={item.other_id} onClick={() => selectUser(item)}
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
                style={{ background: active ? '#e0e7ff' : 'transparent', borderBottom: '1px solid #f3f4f6' }}>
                <UserAvatar userId={item.other_id} name={item.full_name || item.email}
                  avatarUrl={item.avatar_url} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold truncate" style={{ color: '#3b4a54' }}>
                      {item.full_name || item.email}
                    </span>
                    {item.last_at && (
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#8696a0' }}>
                        {timeAgo(item.last_at, t('justNow') || 'now')}
                      </span>
                    )}
                  </div>
                  {item.last_content && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: '#8696a0' }}>
                      {item.last_content}
                    </p>
                  )}
                </div>
                {item.unread_count > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                    style={{ background: '#7c3aed', padding: '0 4px' }}>
                    {item.unread_count > 99 ? '99+' : item.unread_count}
                  </span>
                )}
              </div>
            );
          })}
          {mergedList.length === 0 && (
            <div className="text-center py-12 text-xs" style={{ color: '#8696a0' }}>
              {t('noConversations') || 'No conversations yet'}
            </div>
          )}
        </div>
      </div>

      {/* Right: Thread */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: 'white' }}>
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-sm" style={{ color: '#8696a0' }}>
                {t('selectConversation') || 'Select a conversation'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
              <button onClick={() => { setSelectedId(null); setSelectedItem(null); }}
                className="p-1 rounded hover:bg-gray-100 md:hidden">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
              {selectedItem && (
                <UserAvatar userId={selectedItem.other_id} name={selName}
                  avatarUrl={selectedItem.avatar_url} size={32} />
              )}
              <div>
                <div className="text-sm font-semibold" style={{ color: '#3b4a54' }}>{selName}</div>
                {selectedItem?.email && (
                  <div className="text-[10px]" style={{ color: '#8696a0' }}>{selectedItem.email}</div>
                )}
                <div className="text-[10px]" style={{ color: wsConnected ? '#16a34a' : '#f59e0b' }}>
                  {wsConnected ? 'Live' : 'Syncing...'}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto px-4 py-3" style={{ background: '#f0f2f5' }}>
              {loadingThread ? (
                <div className="text-center py-8 text-xs" style={{ color: '#8696a0' }}>Loading...</div>
              ) : thread.length === 0 ? (
                <div className="text-center py-12 text-xs" style={{ color: '#8696a0' }}>
                  {t('noMessages') || 'No messages yet. Say hi!'}
                </div>
              ) : (
                <>
                  {thread.length > 0 && (
                    <div className="flex justify-center mb-3">
                      <button
                        onClick={loadOlderMessages}
                        disabled={loadingOlder || !hasMore}
                        className="text-[11px] px-3 py-1.5 rounded-full border disabled:opacity-50"
                        style={{ borderColor: '#d1d5db', color: '#6b7280', background: '#fff' }}
                      >
                        {loadingOlder ? 'Loading...' : (hasMore ? 'Load older messages' : 'No more history')}
                      </button>
                    </div>
                  )}
                  {thread.map(msg => {
                    const isMe = msg.from_user_id === myId;
                    return (
                      <div key={msg.id} className={`flex mb-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[75%] rounded-lg px-3 py-2 shadow-sm"
                          style={{ background: isMe ? '#d9fdd3' : 'white' }}>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: '#3b4a54' }}>
                            {msg.content}
                          </p>
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            <span className="text-[10px]" style={{ color: '#8696a0' }}>
                              {formatTime(msg.created_at, lang)}
                            </span>
                            {isMe && <DoubleCheck isRead={msg.is_read} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid #e5e7eb' }}>
              <input ref={inputRef} type="text" value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={t('typeMessage') || 'Type a message...'}
                className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none"
                style={{ borderColor: '#e5e7eb' }} />
              <button onClick={sendMessage}
                disabled={!inputText.trim() || sending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#7c3aed' }}>
                {t('send') || 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
