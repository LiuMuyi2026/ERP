'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { useWhatsAppSocket } from '@/lib/useWhatsAppSocket';
import toast from 'react-hot-toast';

type Broadcast = {
  id: string;
  name?: string;
  template_id?: string;
  message_content?: string;
  media_url?: string;
  target_contacts: string[];
  status: string;
  sent_count?: number;
  failed_count?: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
};

type Conversation = {
  id: string;
  display_name?: string;
  push_name?: string;
  phone_number?: string;
  profile_pic_url?: string;
  lead_name?: string;
  lead_status?: string;
  crm_account_name?: string;
  unread_count: number;
  is_group?: boolean;
  wa_labels?: string[];
};

type Template = {
  id: string;
  name: string;
  content: string;
  shortcut?: string;
  category?: string;
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#f0f2f5', text: '#667781', label: 'Draft' },
  sending: { bg: '#fef9c3', text: '#a16207', label: 'Sending...' },
  completed: { bg: '#dcfce7', text: '#15803d', label: 'Completed' },
  failed: { bg: '#fef2f2', text: '#dc2626', label: 'Failed' },
};

export default function WhatsAppBroadcast() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  // Create broadcast state
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convoSearch, setConvoSearch] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [sending, setSending] = useState(false);

  const { on: onWsEvent } = useWhatsAppSocket();

  async function loadBroadcasts() {
    setLoading(true);
    try {
      const data = await api.get('/api/whatsapp/broadcasts');
      setBroadcasts(Array.isArray(data) ? data : []);
    } catch { setBroadcasts([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadBroadcasts(); }, []);

  async function loadConversations() {
    try {
      const data = await api.get('/api/whatsapp/dashboard?sort_by=last_message');
      setConversations(Array.isArray(data) ? data.filter((c: Conversation) => !c.is_group) : []);
    } catch { setConversations([]); }
  }

  async function loadTemplates() {
    try {
      const data = await api.get('/api/whatsapp/templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch { setTemplates([]); }
  }

  function openCreate() {
    setShowCreate(true);
    setStep(1);
    setName('');
    setMessageContent('');
    setSelectedContacts([]);
    setSelectedTemplate(null);
    loadConversations();
    loadTemplates();
  }

  function toggleContact(id: string) {
    setSelectedContacts((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  }

  function selectAll() {
    const filtered = filteredConvos.map((c) => c.id);
    setSelectedContacts((prev) => {
      const allSelected = filtered.every((id) => prev.includes(id));
      if (allSelected) return prev.filter((id) => !filtered.includes(id));
      return Array.from(new Set([...prev, ...filtered]));
    });
  }

  function handleSelectTemplate(tpl: Template) {
    setSelectedTemplate(tpl);
    setMessageContent(tpl.content);
  }

  async function handleCreate() {
    if (!name.trim() || !messageContent.trim() || selectedContacts.length === 0) return;
    setSending(true);
    try {
      const result = await api.post('/api/whatsapp/broadcasts', {
        name,
        message_content: messageContent,
        template_id: selectedTemplate?.id,
        target_contacts: selectedContacts,
      });
      setShowCreate(false);
      loadBroadcasts();
    } catch (e: any) { toast.error(e.message || 'Failed to create broadcast'); }
    finally { setSending(false); }
  }

  async function handleSend(id: string) {
    if (!confirm('Send this broadcast now? Messages will be sent one by one with 1s delay.')) return;
    try {
      await api.post(`/api/whatsapp/broadcasts/${id}/send`, {});
      loadBroadcasts();
    } catch (e: any) { toast.error(e.message || 'Failed to send broadcast'); }
  }

  const filteredConvos = useMemo(() => {
    if (!convoSearch) return conversations;
    const q = convoSearch.toLowerCase();
    return conversations.filter((c) =>
      (c.display_name || '').toLowerCase().includes(q) ||
      (c.push_name || '').toLowerCase().includes(q) ||
      (c.phone_number || '').includes(q) ||
      (c.lead_name || '').toLowerCase().includes(q)
    );
  }, [conversations, convoSearch]);

  return (
    <div className="h-full flex flex-col" style={{ background: '#f0f2f5' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: 'white', borderBottom: '1px solid #e5e7eb' }}>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#3b4a54' }}>Broadcasts</h2>
          <p className="text-xs" style={{ color: '#8696a0' }}>Send messages to multiple contacts at once</p>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: '#00a884' }}>
          + New Broadcast
        </button>
      </div>

      {/* Broadcast list */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-12 text-sm" style={{ color: '#8696a0' }}>Loading...</div>
        ) : broadcasts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📢</div>
            <p className="text-sm font-medium" style={{ color: '#3b4a54' }}>No broadcasts yet</p>
            <p className="text-xs mt-1" style={{ color: '#8696a0' }}>Create a broadcast to send messages to multiple contacts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((b) => {
              const style = STATUS_STYLE[b.status] || STATUS_STYLE.draft;
              const targets = Array.isArray(b.target_contacts) ? b.target_contacts : JSON.parse(b.target_contacts as any || '[]');
              return (
                <div key={b.id} className="rounded-xl p-4 shadow-sm" style={{ background: 'white' }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold truncate" style={{ color: '#3b4a54' }}>{b.name || 'Untitled'}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: style.bg, color: style.text }}>{style.label}</span>
                      </div>
                      <p className="text-xs truncate mb-2" style={{ color: '#8696a0' }}>{b.message_content}</p>
                      <div className="flex items-center gap-4 text-[11px]" style={{ color: '#8696a0' }}>
                        <span>{targets.length} recipients</span>
                        {b.sent_count != null && <span>{b.sent_count} sent</span>}
                        {b.failed_count != null && b.failed_count > 0 && (
                          <span style={{ color: '#dc2626' }}>{b.failed_count} failed</span>
                        )}
                        {b.created_at && <span>{new Date(b.created_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {b.status === 'draft' && (
                      <button onClick={() => handleSend(b.id)}
                        className="ml-3 px-3 py-1.5 rounded-lg text-xs font-medium text-white flex-shrink-0"
                        style={{ background: '#00a884' }}>
                        Send Now
                      </button>
                    )}
                    {b.status === 'sending' && (
                      <div className="ml-3 flex items-center gap-2 text-xs" style={{ color: '#a16207' }}>
                        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Sending...
                      </div>
                    )}
                  </div>
                  {/* Progress bar for sending/completed */}
                  {(b.status === 'sending' || b.status === 'completed') && targets.length > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f2f5' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.round(((b.sent_count || 0) + (b.failed_count || 0)) / targets.length * 100)}%`,
                            background: (b.failed_count || 0) > 0 ? '#f59e0b' : '#00a884',
                          }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create Broadcast SlideOver ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
              <h3 className="text-base font-semibold" style={{ color: '#3b4a54' }}>
                {step === 1 ? 'Step 1: Select Recipients' : step === 2 ? 'Step 2: Compose Message' : 'Step 3: Review & Send'}
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Step indicators */}
            <div className="px-6 py-2 flex gap-2 flex-shrink-0" style={{ background: '#f9fafb' }}>
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex-1 h-1 rounded-full" style={{ background: s <= step ? '#00a884' : '#e5e7eb' }} />
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {step === 1 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <input type="text" value={convoSearch} onChange={(e) => setConvoSearch(e.target.value)}
                      placeholder="Search contacts..." className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none"
                      style={{ borderColor: '#e5e7eb' }} />
                    <button onClick={selectAll} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: '#e5e7eb', color: '#667781' }}>
                      {filteredConvos.every((c) => selectedContacts.includes(c.id)) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="text-xs mb-2" style={{ color: '#8696a0' }}>
                    {selectedContacts.length} selected of {conversations.length} contacts
                  </div>
                  <div className="space-y-1 max-h-64 overflow-auto">
                    {filteredConvos.map((c) => (
                      <label key={c.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <input type="checkbox" checked={selectedContacts.includes(c.id)}
                          onChange={() => toggleContact(c.id)}
                          className="w-4 h-4 rounded accent-[#00a884]" />
                        {c.profile_pic_url ? (
                          <img src={c.profile_pic_url} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: '#dfe5e7' }}>
                            {(c.display_name || c.push_name || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: '#3b4a54' }}>
                            {c.display_name || c.push_name || c.phone_number}
                          </div>
                          {c.lead_name && <div className="text-[10px] truncate" style={{ color: '#8696a0' }}>{c.lead_name}</div>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: '#667781' }}>Broadcast Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., March promotion"
                      className="w-full text-sm border rounded-lg px-3 py-2 outline-none"
                      style={{ borderColor: '#e5e7eb' }} />
                  </div>

                  {/* Template selector */}
                  {templates.length > 0 && (
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: '#667781' }}>Use Template (optional)</label>
                      <div className="flex gap-2 flex-wrap">
                        {templates.map((tpl) => (
                          <button key={tpl.id} onClick={() => handleSelectTemplate(tpl)}
                            className="px-3 py-1.5 rounded-lg text-xs border transition-colors"
                            style={{
                              borderColor: selectedTemplate?.id === tpl.id ? '#00a884' : '#e5e7eb',
                              background: selectedTemplate?.id === tpl.id ? '#e7fcf5' : 'white',
                              color: selectedTemplate?.id === tpl.id ? '#00a884' : '#667781',
                            }}>
                            {tpl.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: '#667781' }}>Message Content</label>
                    <textarea value={messageContent} onChange={(e) => setMessageContent(e.target.value)}
                      placeholder="Type your broadcast message..."
                      rows={5}
                      className="w-full text-sm border rounded-lg px-3 py-2 outline-none resize-none"
                      style={{ borderColor: '#e5e7eb' }} />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="rounded-lg p-4" style={{ background: '#f9fafb' }}>
                    <div className="text-xs font-medium mb-2" style={{ color: '#667781' }}>Summary</div>
                    <div className="space-y-2 text-sm" style={{ color: '#3b4a54' }}>
                      <div className="flex justify-between">
                        <span>Name:</span>
                        <span className="font-medium">{name || 'Untitled'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Recipients:</span>
                        <span className="font-medium">{selectedContacts.length} contacts</span>
                      </div>
                      {selectedTemplate && (
                        <div className="flex justify-between">
                          <span>Template:</span>
                          <span className="font-medium">{selectedTemplate.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: '#667781' }}>Message Preview</div>
                    <div className="rounded-lg p-3 text-sm whitespace-pre-wrap" style={{ background: '#d9fdd3', color: '#3b4a54' }}>
                      {messageContent || 'No content'}
                    </div>
                  </div>
                  <div className="rounded-lg p-3 text-xs" style={{ background: '#fef9c3', color: '#a16207' }}>
                    Messages will be sent one at a time with a 1-second delay to avoid rate limits. Estimated time: ~{selectedContacts.length} seconds.
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderTop: '1px solid #e5e7eb' }}>
              <button onClick={() => step > 1 ? setStep(step - 1) : setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: '#e5e7eb', color: '#667781' }}>
                {step > 1 ? 'Back' : 'Cancel'}
              </button>
              {step < 3 ? (
                <button onClick={() => setStep(step + 1)}
                  disabled={step === 1 && selectedContacts.length === 0 || step === 2 && (!name.trim() || !messageContent.trim())}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ background: '#00a884' }}>
                  Next
                </button>
              ) : (
                <button onClick={handleCreate} disabled={sending}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ background: '#00a884' }}>
                  {sending ? 'Creating...' : 'Create Broadcast'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
