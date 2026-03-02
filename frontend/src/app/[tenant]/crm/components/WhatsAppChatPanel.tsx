'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';

type Message = {
  id: string;
  direction: string;
  message_type: string;
  content?: string;
  media_url?: string;
  status?: string;
  timestamp: string;
};

interface WhatsAppChatPanelProps {
  contactId?: string;
  leadId?: string;
  contactName?: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
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

const TYPE_ICONS: Record<string, string> = {
  image: 'photo',
  video: 'play-button',
  audio: 'headphones',
  document: 'document',
  sticker: 'star',
  location: 'pin',
};

type AiAction = 'summarize' | 'enrich_profile' | 'sales_strategy' | 'sales_tips';

const AI_ACTIONS: { key: AiAction; label: string; icon: string; color: string }[] = [
  { key: 'summarize', label: 'Summarize', icon: 'document', color: '#7c3aed' },
  { key: 'enrich_profile', label: 'Enrich Profile', icon: 'person', color: '#0284c7' },
  { key: 'sales_strategy', label: 'Sales Strategy', icon: 'briefcase', color: '#059669' },
  { key: 'sales_tips', label: 'Sales Tips', icon: 'star', color: '#d97706' },
];

export default function WhatsAppChatPanel({ contactId, leadId, contactName }: WhatsAppChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // AI panel state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiLoading, setAiLoading] = useState<AiAction | null>(null);
  const [aiResult, setAiResult] = useState<{ action: AiAction; result: string } | null>(null);

  async function loadMessages() {
    setLoading(true);
    try {
      let data: Message[];
      if (leadId) {
        data = await api.get(`/api/whatsapp/leads/${leadId}/messages`);
      } else if (contactId) {
        data = await api.get(`/api/whatsapp/conversations/${contactId}/messages`);
      } else {
        data = [];
      }
      setMessages(Array.isArray(data) ? data : []);
    } catch { setMessages([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadMessages(); }, [contactId, leadId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !contactId) return;
    setSending(true);
    try {
      await api.post(`/api/whatsapp/conversations/${contactId}/send`, { content: input.trim() });
      setInput('');
      loadMessages();
    } catch {}
    finally { setSending(false); }
  }

  async function runAiAction(action: AiAction) {
    setAiLoading(action);
    setAiResult(null);
    try {
      const data = await api.post('/api/whatsapp/ai/analyze', {
        contact_id: contactId || null,
        lead_id: leadId || null,
        action,
      });
      setAiResult({ action, result: data.result || 'No result' });
    } catch (err: any) {
      setAiResult({ action, result: `Error: ${err.message || 'Analysis failed'}` });
    }
    finally { setAiLoading(null); }
  }

  const groups = groupByDate(messages);
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#25D366' }}>
          {(contactName || 'W').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{contactName || 'WhatsApp Chat'}</p>
          <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
            {messages.length} messages
          </p>
        </div>
        {/* AI toggle */}
        {hasMessages && (
          <button onClick={() => setShowAiPanel(!showAiPanel)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: showAiPanel ? '#7c3aed' : 'var(--notion-hover)',
              color: showAiPanel ? 'white' : '#7c3aed',
              border: showAiPanel ? 'none' : '1px solid #7c3aed',
            }}>
            <HandIcon name="brain" size={14} />
            AI
          </button>
        )}
      </div>

      {/* AI Panel */}
      {showAiPanel && (
        <div className="border-b" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          {/* Action buttons */}
          <div className="px-4 py-3 flex gap-2 flex-wrap">
            {AI_ACTIONS.map(a => (
              <button key={a.key} onClick={() => runAiAction(a.key)}
                disabled={aiLoading !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  border: `1px solid ${a.color}`,
                  color: aiResult?.action === a.key ? 'white' : a.color,
                  background: aiResult?.action === a.key ? a.color : 'transparent',
                  opacity: aiLoading && aiLoading !== a.key ? 0.5 : 1,
                  cursor: aiLoading ? 'default' : 'pointer',
                }}>
                {aiLoading === a.key ? (
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <HandIcon name={a.icon} size={12} />
                )}
                {a.label}
              </button>
            ))}
          </div>

          {/* AI Result */}
          {(aiLoading || aiResult) && (
            <div className="px-4 pb-3">
              <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--notion-hover)', maxHeight: 200, overflowY: 'auto' }}>
                {aiLoading ? (
                  <div className="flex items-center gap-2" style={{ color: 'var(--notion-text-muted)' }}>
                    <span className="inline-block w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    Analyzing conversation...
                  </div>
                ) : aiResult ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                        style={{ background: AI_ACTIONS.find(a => a.key === aiResult.action)?.color || '#7c3aed' }}>
                        {AI_ACTIONS.find(a => a.key === aiResult.action)?.label}
                      </span>
                      <button onClick={() => setAiResult(null)} className="ml-auto text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                        Dismiss
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: 'var(--notion-text)' }}>
                      {aiResult.result}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ background: 'var(--notion-hover)' }}>
        {loading ? (
          <div className="text-center text-sm py-8" style={{ color: 'var(--notion-text-muted)' }}>Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-3" style={{ color: '#25D366' }}><HandIcon name="chat-bubble" size={36} /></div>
            <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>No messages yet</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background: 'var(--notion-card, white)', color: 'var(--notion-text-muted)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                  {group.label}
                </span>
              </div>
              {group.messages.map(msg => {
                const isOut = msg.direction === 'outbound';
                const typeIcon = TYPE_ICONS[msg.message_type];
                return (
                  <div key={msg.id} className={`flex mb-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%] rounded-xl px-3.5 py-2 shadow-sm"
                      style={{
                        background: isOut ? '#dcf8c6' : 'var(--notion-card, white)',
                        borderBottomRightRadius: isOut ? 4 : 12,
                        borderBottomLeftRadius: isOut ? 12 : 4,
                      }}>
                      {typeIcon && msg.message_type !== 'text' && (
                        <div className="flex items-center gap-1.5 mb-1 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                          <HandIcon name={typeIcon} size={12} />
                          <span className="capitalize">{msg.message_type}</span>
                        </div>
                      )}
                      {msg.content && (
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--notion-text)', lineHeight: 1.5 }}>
                          {msg.content}
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{formatTime(msg.timestamp)}</span>
                        {isOut && (
                          <span className="text-[10px]" style={{ color: msg.status === 'read' ? '#53bdeb' : 'var(--notion-text-muted)' }}>
                            {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Send bar */}
      {contactId && (
        <form onSubmit={sendMessage}
          className="px-4 py-3 border-t flex items-center gap-2"
          style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }}
          />
          <button type="submit" disabled={sending || !input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: sending ? '#86efac' : '#25D366', cursor: sending ? 'default' : 'pointer' }}>
            {sending ? '...' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
}
