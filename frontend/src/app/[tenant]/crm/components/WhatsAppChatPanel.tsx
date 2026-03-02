'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';

type Reaction = { reactor_jid: string; emoji: string };

type Message = {
  id: string;
  direction: string;
  message_type: string;
  content?: string;
  media_url?: string;
  media_mime_type?: string;
  status?: string;
  timestamp: string;
  is_deleted?: boolean;
  is_edited?: boolean;
  reply_to_message_id?: string;
  reactions?: Reaction[];
  metadata?: any;
  created_by_name?: string;
};

interface WhatsAppChatPanelProps {
  contactId?: string;
  leadId?: string;
  contactName?: string;
  profilePicUrl?: string;
  isGroup?: boolean;
  disappearingDuration?: number;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString();
}

function groupByDate(messages: Message[]) {
  const groups: { label: string; messages: Message[] }[] = [];
  let currentLabel = '';
  for (const msg of messages) {
    const label = dateLabel(msg.timestamp);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const DISAPPEARING_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '90 days', value: 7776000 },
];

type AiAction = 'summarize' | 'enrich_profile' | 'sales_strategy' | 'sales_tips';
const AI_ACTIONS: { key: AiAction; label: string; icon: string; color: string }[] = [
  { key: 'summarize', label: 'Summarize', icon: 'document', color: '#7c3aed' },
  { key: 'enrich_profile', label: 'Enrich Profile', icon: 'person', color: '#0284c7' },
  { key: 'sales_strategy', label: 'Sales Strategy', icon: 'briefcase', color: '#059669' },
  { key: 'sales_tips', label: 'Sales Tips', icon: 'star', color: '#d97706' },
];

export default function WhatsAppChatPanel({
  contactId, leadId, contactName, profilePicUrl, isGroup, disappearingDuration,
}: WhatsAppChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reply state
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // Edit state
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editInput, setEditInput] = useState('');

  // Media attachment
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Context menu
  const [menuMsg, setMenuMsg] = useState<string | null>(null);

  // Forward dialog
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardContacts, setForwardContacts] = useState<any[]>([]);
  const [forwardSearch, setForwardSearch] = useState('');

  // Poll creation
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);

  // Disappearing
  const [showDisappearing, setShowDisappearing] = useState(false);
  const [currentDisappearing, setCurrentDisappearing] = useState(disappearingDuration || 0);

  // Presence
  const [presence, setPresence] = useState<{ status: string; lastSeen?: number } | null>(null);

  // AI panel
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiLoading, setAiLoading] = useState<AiAction | null>(null);
  const [aiResult, setAiResult] = useState<{ action: AiAction; result: string } | null>(null);

  // Typing indicator
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  // Resolved contactId (when opened via leadId, resolve from messages)
  const [resolvedContactId, setResolvedContactId] = useState<string | undefined>(contactId);

  const effectiveContactId = contactId || resolvedContactId;

  // ── Load messages ──
  async function loadMessages() {
    setLoading(true);
    try {
      let data: Message[];
      if (contactId) {
        data = await api.get(`/api/whatsapp/conversations/${contactId}/messages`);
      } else if (leadId) {
        data = await api.get(`/api/whatsapp/leads/${leadId}/messages`);
        // Resolve contactId from first message so send/reactions/etc. work
        if (!resolvedContactId && Array.isArray(data) && data.length > 0) {
          const cid = (data[0] as any).wa_contact_id;
          if (cid) setResolvedContactId(cid);
        }
      } else {
        data = [];
      }
      setMessages(Array.isArray(data) ? data : []);
    } catch { setMessages([]); }
    finally { setLoading(false); }
  }

  // ── Mark read on open ──
  useEffect(() => {
    loadMessages();
    if (effectiveContactId) {
      api.post(`/api/whatsapp/conversations/${effectiveContactId}/read`, {}).catch(() => {});
      // Subscribe presence
      api.post(`/api/whatsapp/conversations/${effectiveContactId}/subscribe-presence`, {}).catch(() => {});
    }
  }, [effectiveContactId, leadId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Presence polling (5s) ──
  useEffect(() => {
    if (!effectiveContactId) return;
    const fetchPresence = async () => {
      try {
        const data = await api.get(`/api/whatsapp/conversations/${effectiveContactId}/presence`);
        setPresence(data);
      } catch {}
    };
    fetchPresence();
    const iv = setInterval(fetchPresence, 5000);
    return () => clearInterval(iv);
  }, [effectiveContactId]);

  // ── Typing indicator ──
  const sendTyping = useCallback((type: 'composing' | 'paused') => {
    if (!effectiveContactId) return;
    api.post(`/api/whatsapp/conversations/${effectiveContactId}/typing`, { type }).catch(() => {});
  }, [effectiveContactId]);

  function handleInputChange(val: string) {
    setInput(val);
    if (val.trim()) {
      sendTyping('composing');
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => sendTyping('paused'), 3000);
    }
  }

  // ── Send message ──
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!input.trim() && !attachFile) || !effectiveContactId) return;
    setSending(true);
    try {
      let media_url: string | undefined;
      let media_mime_type: string | undefined;
      let filename: string | undefined;
      let message_type = 'text';

      if (attachFile) {
        const uploadRes = await api.upload('/api/whatsapp/upload-media', attachFile);
        media_url = uploadRes.media_url;
        media_mime_type = uploadRes.mime_type;
        filename = uploadRes.filename;

        if (attachFile.type.startsWith('image/')) message_type = 'image';
        else if (attachFile.type.startsWith('video/')) message_type = 'video';
        else if (attachFile.type.startsWith('audio/')) message_type = 'audio';
        else message_type = 'document';
      }

      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/send`, {
        content: input.trim(),
        message_type,
        media_url,
        media_mime_type,
        filename,
        caption: attachFile ? input.trim() : undefined,
        reply_to_message_id: replyTo?.id || undefined,
      });
      setInput('');
      setAttachFile(null);
      setReplyTo(null);
      sendTyping('paused');
      loadMessages();
    } catch {}
    finally { setSending(false); }
  }

  // ── Reaction ──
  async function handleReaction(msg: Message, emoji: string) {
    if (!effectiveContactId) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/messages/${msg.id}/react`, { emoji });
      loadMessages();
    } catch {}
    setMenuMsg(null);
  }

  // ── Delete (revoke) ──
  async function handleDelete(msg: Message) {
    if (!effectiveContactId) return;
    try {
      await api.delete(`/api/whatsapp/conversations/${effectiveContactId}/messages/${msg.id}`);
      loadMessages();
    } catch {}
    setMenuMsg(null);
  }

  // ── Edit ──
  async function handleEditSubmit() {
    if (!effectiveContactId || !editingMsg || !editInput.trim()) return;
    try {
      await api.patch(`/api/whatsapp/conversations/${effectiveContactId}/messages/${editingMsg.id}`, { content: editInput.trim() });
      setEditingMsg(null);
      setEditInput('');
      loadMessages();
    } catch {}
  }

  // ── Forward ──
  async function openForwardDialog(msg: Message) {
    setForwardMsg(msg);
    try {
      const contacts = await api.get('/api/whatsapp/conversations');
      setForwardContacts(Array.isArray(contacts) ? contacts : []);
    } catch { setForwardContacts([]); }
  }

  async function handleForward(targetContactId: string) {
    if (!effectiveContactId || !forwardMsg) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/messages/${forwardMsg.id}/forward`, {
        target_contact_id: targetContactId,
      });
    } catch {}
    setForwardMsg(null);
  }

  // ── Poll ──
  async function handleSendPoll() {
    if (!effectiveContactId || !pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/send-poll`, {
        question: pollQuestion,
        options: pollOptions.filter(o => o.trim()),
        allow_multiple: pollMultiple,
      });
      setShowPollModal(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollMultiple(false);
      loadMessages();
    } catch {}
  }

  // ── Disappearing ──
  async function handleDisappearing(duration: number) {
    if (!effectiveContactId) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/disappearing`, { duration });
      setCurrentDisappearing(duration);
    } catch {}
    setShowDisappearing(false);
  }

  // ── AI ──
  async function runAiAction(action: AiAction) {
    setAiLoading(action);
    setAiResult(null);
    try {
      const data = await api.post('/api/whatsapp/ai/analyze', {
        contact_id: effectiveContactId || null,
        lead_id: leadId || null,
        action,
      });
      setAiResult({ action, result: data.result || 'No result' });
    } catch (err: any) {
      setAiResult({ action, result: `Error: ${err.message || 'Analysis failed'}` });
    }
    finally { setAiLoading(null); }
  }

  // ── Find quoted message ──
  function findQuotedMessage(replyId: string): Message | undefined {
    return messages.find(m => m.id === replyId);
  }

  const groups = groupByDate(messages);
  const hasMessages = messages.length > 0;
  const presenceText = presence?.status === 'composing' ? 'typing...'
    : presence?.status === 'available' ? 'online'
    : presence?.lastSeen ? `last seen ${new Date(presence.lastSeen * 1000).toLocaleString()}`
    : '';

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold overflow-hidden" style={{ background: '#25D366' }}>
          {profilePicUrl ? (
            <img src={profilePicUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            (contactName || 'W').charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{contactName || 'WhatsApp Chat'}</p>
          <p className="text-xs" style={{ color: presenceText === 'typing...' ? '#25D366' : 'var(--notion-text-muted)' }}>
            {presenceText || `${messages.length} messages`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Disappearing toggle */}
          <div className="relative">
            <button onClick={() => setShowDisappearing(!showDisappearing)}
              className="p-1.5 rounded hover:bg-gray-100 text-xs" title="Disappearing messages">
              <HandIcon name="clock" size={16} />
            </button>
            {showDisappearing && (
              <div className="absolute right-0 top-8 z-50 rounded-lg shadow-lg border py-1 min-w-[140px]"
                style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
                {DISAPPEARING_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => handleDisappearing(opt.value)}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                    style={{ color: currentDisappearing === opt.value ? '#25D366' : 'var(--notion-text)', fontWeight: currentDisappearing === opt.value ? 600 : 400 }}>
                    {opt.label} {currentDisappearing === opt.value && '✓'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* AI toggle */}
          {hasMessages && (
            <button onClick={() => setShowAiPanel(!showAiPanel)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: showAiPanel ? '#7c3aed' : 'transparent', color: showAiPanel ? 'white' : '#7c3aed' }}>
              <HandIcon name="brain" size={14} /> AI
            </button>
          )}
        </div>
      </div>

      {/* ── AI Panel ── */}
      {showAiPanel && (
        <div className="border-b" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          <div className="px-4 py-3 flex gap-2 flex-wrap">
            {AI_ACTIONS.map(a => (
              <button key={a.key} onClick={() => runAiAction(a.key)} disabled={aiLoading !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  border: `1px solid ${a.color}`, color: aiResult?.action === a.key ? 'white' : a.color,
                  background: aiResult?.action === a.key ? a.color : 'transparent',
                  opacity: aiLoading && aiLoading !== a.key ? 0.5 : 1,
                }}>
                {aiLoading === a.key ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <HandIcon name={a.icon} size={12} />}
                {a.label}
              </button>
            ))}
          </div>
          {(aiLoading || aiResult) && (
            <div className="px-4 pb-3">
              <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--notion-hover)', maxHeight: 200, overflowY: 'auto' }}>
                {aiLoading ? (
                  <div className="flex items-center gap-2" style={{ color: 'var(--notion-text-muted)' }}>
                    <span className="inline-block w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /> Analyzing...
                  </div>
                ) : aiResult ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                        style={{ background: AI_ACTIONS.find(a => a.key === aiResult.action)?.color }}>
                        {AI_ACTIONS.find(a => a.key === aiResult.action)?.label}
                      </span>
                      <button onClick={() => setAiResult(null)} className="ml-auto text-xs" style={{ color: 'var(--notion-text-muted)' }}>Dismiss</button>
                    </div>
                    <div className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: 'var(--notion-text)' }}>{aiResult.result}</div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ background: 'var(--notion-hover)' }}
        onClick={() => { setMenuMsg(null); setShowDisappearing(false); }}>
        {loading ? (
          <div className="text-center text-sm py-8" style={{ color: 'var(--notion-text-muted)' }}>Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>No messages yet</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background: 'var(--notion-card, white)', color: 'var(--notion-text-muted)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                  {group.label}
                </span>
              </div>
              {group.messages.map(msg => {
                const isOut = msg.direction === 'outbound';
                const quoted = msg.reply_to_message_id ? findQuotedMessage(msg.reply_to_message_id) : null;

                // Deleted message
                if (msg.is_deleted) {
                  return (
                    <div key={msg.id} className={`flex mb-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%] rounded-xl px-3.5 py-2 shadow-sm" style={{ background: 'var(--notion-card, white)', opacity: 0.6 }}>
                        <p className="text-xs italic" style={{ color: 'var(--notion-text-muted)' }}>This message was deleted</p>
                      </div>
                    </div>
                  );
                }

                // Editing inline
                if (editingMsg?.id === msg.id) {
                  return (
                    <div key={msg.id} className={`flex mb-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%] rounded-xl px-3.5 py-2 shadow-sm" style={{ background: '#dcf8c6' }}>
                        <input value={editInput} onChange={e => setEditInput(e.target.value)}
                          className="w-full text-sm border rounded px-2 py-1 mb-1" autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleEditSubmit(); if (e.key === 'Escape') setEditingMsg(null); }} />
                        <div className="flex gap-1">
                          <button onClick={handleEditSubmit} className="text-xs px-2 py-0.5 rounded bg-green-500 text-white">Save</button>
                          <button onClick={() => setEditingMsg(null)} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--notion-hover)' }}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={`flex mb-2 ${isOut ? 'justify-end' : 'justify-start'} group relative`}>
                    <div className="max-w-[75%] rounded-xl px-3.5 py-2 shadow-sm relative"
                      style={{
                        background: isOut ? '#dcf8c6' : 'var(--notion-card, white)',
                        borderBottomRightRadius: isOut ? 4 : 12,
                        borderBottomLeftRadius: isOut ? 12 : 4,
                      }}>

                      {/* Quoted message */}
                      {quoted && (
                        <div className="mb-1.5 rounded px-2 py-1 border-l-2" style={{ borderColor: '#25D366', background: 'rgba(0,0,0,0.04)' }}>
                          <p className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>{quoted.content || '(media)'}</p>
                        </div>
                      )}

                      {/* Sender name for outbound messages */}
                      {isOut && msg.created_by_name && (
                        <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#128C7E' }}>{msg.created_by_name}</p>
                      )}

                      {/* Media rendering */}
                      {msg.message_type === 'image' && msg.media_url && (
                        <img src={msg.media_url} alt="" className="rounded-lg mb-1 max-w-full max-h-60 object-cover cursor-pointer"
                          onClick={() => window.open(msg.media_url, '_blank')} />
                      )}
                      {msg.message_type === 'video' && msg.media_url && (
                        <video src={msg.media_url} controls className="rounded-lg mb-1 max-w-full max-h-60" />
                      )}
                      {msg.message_type === 'audio' && msg.media_url && (
                        <audio src={msg.media_url} controls className="mb-1 max-w-full" />
                      )}
                      {msg.message_type === 'document' && msg.media_url && (
                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 mb-1 px-2 py-1.5 rounded" style={{ background: 'rgba(0,0,0,0.04)' }}>
                          <HandIcon name="document" size={16} />
                          <span className="text-xs underline" style={{ color: 'var(--notion-text)' }}>{msg.content || 'Download file'}</span>
                        </a>
                      )}
                      {msg.message_type === 'poll' && (
                        <div className="mb-1 px-2 py-1.5 rounded" style={{ background: 'rgba(0,0,0,0.04)' }}>
                          <p className="text-xs font-semibold mb-1">📊 {msg.content}</p>
                        </div>
                      )}

                      {/* Text content (not for document type where it's the filename) */}
                      {msg.content && msg.message_type !== 'document' && msg.message_type !== 'poll' && (
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--notion-text)', lineHeight: 1.5 }}>
                          {msg.content}
                        </p>
                      )}

                      {/* Footer: time + status + edited */}
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        {msg.is_edited && <span className="text-[9px] italic" style={{ color: 'var(--notion-text-muted)' }}>(edited)</span>}
                        <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{formatTime(msg.timestamp)}</span>
                        {isOut && (
                          <span className="text-[10px]" style={{ color: msg.status === 'read' ? '#53bdeb' : 'var(--notion-text-muted)' }}>
                            {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>

                      {/* Reaction badges */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="flex gap-0.5 mt-1 flex-wrap">
                          {msg.reactions.map((r, i) => (
                            <span key={i} className="text-xs px-1 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }}>{r.emoji}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Hover action menu */}
                    <div className="absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 z-10"
                      style={{ [isOut ? 'left' : 'right']: '-8px', transform: 'translateX(-100%)' }}>
                      <button onClick={() => setReplyTo(msg)} className="p-1 rounded hover:bg-gray-200" title="Reply">↩</button>
                      <button onClick={(e) => { e.stopPropagation(); setMenuMsg(menuMsg === msg.id ? null : msg.id); }} className="p-1 rounded hover:bg-gray-200" title="More">⋯</button>
                    </div>

                    {/* Dropdown menu */}
                    {menuMsg === msg.id && (
                      <div className="absolute top-8 z-50 rounded-lg shadow-lg border py-1 min-w-[120px]"
                        style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)', [isOut ? 'right' : 'left']: 0 }}
                        onClick={e => e.stopPropagation()}>
                        {/* Reactions */}
                        <div className="flex gap-1 px-2 py-1 border-b" style={{ borderColor: 'var(--notion-border)' }}>
                          {REACTION_EMOJIS.map(em => (
                            <button key={em} onClick={() => handleReaction(msg, em)} className="text-sm hover:scale-125 transition-transform">{em}</button>
                          ))}
                        </div>
                        <button onClick={() => openForwardDialog(msg)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">Forward</button>
                        {isOut && msg.message_type === 'text' && (
                          <button onClick={() => { setEditingMsg(msg); setEditInput(msg.content || ''); setMenuMsg(null); }}
                            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">Edit</button>
                        )}
                        {isOut && (
                          <button onClick={() => handleDelete(msg)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-red-500">Delete</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Reply preview bar ── */}
      {replyTo && (
        <div className="px-4 py-2 border-t flex items-center gap-2" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          <div className="flex-1 border-l-2 pl-2 text-xs truncate" style={{ borderColor: '#25D366', color: 'var(--notion-text-muted)' }}>
            Replying to: {replyTo.content || '(media)'}
          </div>
          <button onClick={() => setReplyTo(null)} className="text-xs p-1 hover:bg-gray-100 rounded">✕</button>
        </div>
      )}

      {/* ── Attachment preview ── */}
      {attachFile && (
        <div className="px-4 py-2 border-t flex items-center gap-2" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          <HandIcon name="document" size={14} />
          <span className="flex-1 text-xs truncate" style={{ color: 'var(--notion-text)' }}>{attachFile.name}</span>
          <button onClick={() => setAttachFile(null)} className="text-xs p-1 hover:bg-gray-100 rounded">✕</button>
        </div>
      )}

      {/* ── Send bar ── */}
      {effectiveContactId && (
        <form onSubmit={sendMessage}
          className="px-4 py-3 border-t flex items-center gap-2"
          style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          {/* Attach button */}
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg hover:bg-gray-100" title="Attach file">
            <HandIcon name="paperclip" size={18} />
          </button>
          <input ref={fileInputRef} type="file" className="hidden"
            onChange={e => { if (e.target.files?.[0]) setAttachFile(e.target.files[0]); }} />

          {/* Poll button */}
          <button type="button" onClick={() => setShowPollModal(true)}
            className="p-2 rounded-lg hover:bg-gray-100" title="Create poll">
            📊
          </button>

          <input type="text" value={input}
            onChange={e => handleInputChange(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }} />
          <button type="submit" disabled={sending || (!input.trim() && !attachFile)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: sending ? '#86efac' : '#25D366' }}>
            {sending ? '...' : 'Send'}
          </button>
        </form>
      )}

      {/* ── Forward dialog ── */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setForwardMsg(null)}>
          <div className="bg-white rounded-xl shadow-xl w-80 max-h-96 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b font-semibold text-sm">Forward to...</div>
            <div className="px-4 py-2">
              <input value={forwardSearch} onChange={e => setForwardSearch(e.target.value)}
                placeholder="Search contacts..." className="w-full text-xs border rounded px-2 py-1" />
            </div>
            <div className="overflow-y-auto max-h-64">
              {forwardContacts.filter(c => !forwardSearch || (c.display_name || c.push_name || '').toLowerCase().includes(forwardSearch.toLowerCase()))
                .map(c => (
                  <button key={c.id} onClick={() => handleForward(c.id)}
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 border-b" style={{ borderColor: 'var(--notion-border)' }}>
                    {c.display_name || c.push_name || c.phone_number || c.wa_jid}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Poll creation modal ── */}
      {showPollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPollModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-80 p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Create Poll</h3>
            <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)}
              placeholder="Question" className="w-full text-xs border rounded px-2 py-1.5 mb-2" />
            {pollOptions.map((opt, i) => (
              <input key={i} value={opt} onChange={e => {
                const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next);
              }} placeholder={`Option ${i + 1}`} className="w-full text-xs border rounded px-2 py-1.5 mb-1" />
            ))}
            {pollOptions.length < 12 && (
              <button onClick={() => setPollOptions([...pollOptions, ''])}
                className="text-xs text-blue-500 mb-2">+ Add option</button>
            )}
            <label className="flex items-center gap-2 text-xs mb-3">
              <input type="checkbox" checked={pollMultiple} onChange={e => setPollMultiple(e.target.checked)} />
              Allow multiple selections
            </label>
            <div className="flex gap-2">
              <button onClick={handleSendPoll} className="flex-1 px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: '#25D366' }}>Send</button>
              <button onClick={() => setShowPollModal(false)} className="flex-1 px-3 py-1.5 rounded text-xs border">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
