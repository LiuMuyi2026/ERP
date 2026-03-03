'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { useWhatsAppSocket } from '@/lib/useWhatsAppSocket';
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
  isBlocked?: boolean;
  isArchived?: boolean;
  /** Conversation data for template variable substitution */
  conversation?: {
    phone_number?: string;
    crm_account_name?: string;
    lead_name?: string;
    lead_status?: string;
    display_name?: string;
  };
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

type AiAction = 'summarize' | 'enrich_profile' | 'sales_strategy' | 'sales_tips' | 'suggest_reply';
const AI_ACTIONS: { key: AiAction; label: string; icon: string; color: string }[] = [
  { key: 'suggest_reply', label: 'AI Suggest', icon: 'sparkle', color: '#8b5cf6' },
  { key: 'summarize', label: 'Summarize', icon: 'document', color: '#7c3aed' },
  { key: 'enrich_profile', label: 'Enrich Profile', icon: 'person', color: '#0284c7' },
  { key: 'sales_strategy', label: 'Sales Strategy', icon: 'briefcase', color: '#059669' },
  { key: 'sales_tips', label: 'Sales Tips', icon: 'star', color: '#d97706' },
];

export default function WhatsAppChatPanel({
  contactId, leadId, contactName, profilePicUrl, isGroup, disappearingDuration,
  isBlocked: initialIsBlocked, isArchived: initialIsArchived, conversation,
}: WhatsAppChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  // CRM sidebar
  const [showCrmSidebar, setShowCrmSidebar] = useState(false);
  const [crmContext, setCrmContext] = useState<any>(null);
  const [crmLoading, setCrmLoading] = useState(false);

  // Typing indicator
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  // Resolved contactId (when opened via leadId, resolve from messages)
  const [resolvedContactId, setResolvedContactId] = useState<string | undefined>(contactId);

  // ── New feature states ──
  const [showButtonsModal, setShowButtonsModal] = useState(false);
  const [btnTitle, setBtnTitle] = useState('');
  const [btnDesc, setBtnDesc] = useState('');
  const [btnFooter, setBtnFooter] = useState('');
  const [btnButtons, setBtnButtons] = useState([{ id: '1', text: '' }]);

  const [showListModal, setShowListModal] = useState(false);
  const [listTitle, setListTitle] = useState('');
  const [listDesc, setListDesc] = useState('');
  const [listBtnText, setListBtnText] = useState('');
  const [listFooter, setListFooter] = useState('');
  const [listSections, setListSections] = useState([{ title: '', rows: [{ title: '', description: '', row_id: '1' }] }]);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');

  // Slash command template picker
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIdx, setSlashIdx] = useState(0);

  const [isBlocked, setIsBlocked] = useState(initialIsBlocked || false);

  // Message search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchIdx, setSearchIdx] = useState(0);

  // Group info panel
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupMeta, setGroupMeta] = useState<any>(null);
  const [inviteCode, setInviteCode] = useState('');

  // ── Phase 4+5 states ──

  // 4.1 Contact card
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactCardName, setContactCardName] = useState('');
  const [contactCardPhone, setContactCardPhone] = useState('');

  // 4.2 Location
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locLat, setLocLat] = useState('');
  const [locLng, setLocLng] = useState('');
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');

  // 4.3 Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 4.4 Sync history
  const [syncing, setSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState<number | null>(null);

  // 4.5 Contact profile
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);

  // 5.3 Group advanced
  const [groupParticipants, setGroupParticipants] = useState<any[]>([]);
  const [showGroupInviteModal, setShowGroupInviteModal] = useState(false);
  const [groupInviteContacts, setGroupInviteContacts] = useState<any[]>([]);
  const [groupInviteSearch, setGroupInviteSearch] = useState('');

  // 5.4 Catalog
  const [catalogData, setCatalogData] = useState<any[] | null>(null);
  const [showCatalogTab, setShowCatalogTab] = useState(false);

  // 5.5 Call
  const [showCallMenu, setShowCallMenu] = useState(false);

  // WhatsApp Web style menus
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const effectiveContactId = contactId || resolvedContactId;

  // ── WebSocket for real-time updates ──
  const { on: onWsEvent } = useWhatsAppSocket();
  const [wsTyping, setWsTyping] = useState(false);

  // ── Load messages ──
  async function loadMessages(olderPage = false) {
    if (olderPage) {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      let data: Message[];
      let more = false;
      if (contactId) {
        const beforeParam = olderPage && messages.length > 0
          ? `&before=${messages[0].timestamp}` : '';
        const resp: any = await api.get(`/api/whatsapp/conversations/${contactId}/messages?limit=50${beforeParam}`);
        // Support both new {messages, has_more} and legacy array format
        if (resp && typeof resp === 'object' && 'messages' in resp) {
          data = resp.messages;
          more = resp.has_more;
        } else {
          data = Array.isArray(resp) ? resp : [];
        }
      } else if (leadId) {
        const resp = await api.get(`/api/whatsapp/leads/${leadId}/messages`);
        data = Array.isArray(resp) ? resp : [];
        if (!resolvedContactId && data.length > 0) {
          const cid = (data[0] as any).wa_contact_id;
          if (cid) setResolvedContactId(cid);
        }
      } else {
        data = [];
      }
      setHasMore(more);
      if (olderPage) {
        // Prepend older messages, preserve scroll position
        const container = scrollContainerRef.current;
        const prevHeight = container?.scrollHeight || 0;
        setMessages(prev => [...data, ...prev]);
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevHeight;
          }
        });
      } else {
        setMessages(data);
      }
    } catch { if (!olderPage) setMessages([]); }
    finally {
      if (olderPage) setLoadingMore(false);
      else setLoading(false);
    }
  }

  // ── Mark read on open + initial load ──
  useEffect(() => {
    loadMessages();
    if (effectiveContactId) {
      api.post(`/api/whatsapp/conversations/${effectiveContactId}/read`, {}).catch(() => {});
      api.post(`/api/whatsapp/conversations/${effectiveContactId}/subscribe-presence`, {}).catch(() => {});
    }
    // Fallback: poll every 30s as safety net (WS is primary)
    const iv = setInterval(() => { loadMessages(); }, 30_000);
    return () => clearInterval(iv);
  }, [effectiveContactId, leadId]);

  // Auto-scroll only when new messages arrive at the end (not on history load)
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const prevCount = prevMsgCountRef.current;
    const newCount = messages.length;
    prevMsgCountRef.current = newCount;
    // Scroll to bottom on initial load or when new messages are appended at the end
    if (prevCount === 0 || (newCount > prevCount && messages.length > 0 &&
        messages[messages.length - 1]?.timestamp >= (messages[prevCount - 1]?.timestamp || ''))) {
      bottomRef.current?.scrollIntoView({ behavior: prevCount === 0 ? 'auto' : 'smooth' });
    }
  }, [messages.length]);

  // ── Presence: initial fetch (WS is primary for updates) ──
  useEffect(() => {
    if (!effectiveContactId) return;
    api.get(`/api/whatsapp/conversations/${effectiveContactId}/presence`).then(setPresence).catch(() => {});
  }, [effectiveContactId]);

  // ── WebSocket event handlers ──
  useEffect(() => {
    if (!effectiveContactId) return;
    const unsubs: (() => void)[] = [];

    // New message: append to list if for current contact
    unsubs.push(onWsEvent('new_message', (ev) => {
      if (ev.contact_id === effectiveContactId) {
        const m = ev.message;
        setMessages((prev) => {
          // Deduplicate by wa_message_id
          if (prev.some((p) => (p as any).wa_message_id === m.wa_message_id)) return prev;
          return [...prev, { id: m.wa_message_id, ...m }];
        });
        // Auto mark read since this chat is open
        api.post(`/api/whatsapp/conversations/${effectiveContactId}/read`, {}).catch(() => {});
      }
    }));

    // Message status update (✓✓)
    unsubs.push(onWsEvent('message_status', (ev) => {
      setMessages((prev) =>
        prev.map((m) =>
          (m as any).wa_message_id === ev.wa_message_id || m.id === ev.wa_message_id
            ? { ...m, status: ev.status }
            : m
        )
      );
    }));

    // Message deleted
    unsubs.push(onWsEvent('message_deleted', (ev) => {
      setMessages((prev) =>
        prev.map((m) =>
          (m as any).wa_message_id === ev.wa_message_id || m.id === ev.wa_message_id
            ? { ...m, is_deleted: true, content: undefined }
            : m
        )
      );
    }));

    // Typing indicator from WS
    unsubs.push(onWsEvent('typing', (ev) => {
      // Match by participant JID containing the contact's JID
      if (ev.participant && effectiveContactId) {
        const isComposing = ev.state === 'composing';
        setWsTyping(isComposing);
        if (isComposing) {
          // Auto-clear after 5s if no paused event
          const t = setTimeout(() => setWsTyping(false), 5000);
          return () => clearTimeout(t);
        }
      }
    }));

    return () => unsubs.forEach((u) => u());
  }, [effectiveContactId, onWsEvent]);

  // ── Typing indicator ──
  const sendTyping = useCallback((type: 'composing' | 'paused') => {
    if (!effectiveContactId) return;
    api.post(`/api/whatsapp/conversations/${effectiveContactId}/typing`, { type }).catch(() => {});
  }, [effectiveContactId]);

  function handleInputChange(val: string) {
    setInput(val);
    // Detect `/` at start for slash command template picker
    if (val.startsWith('/')) {
      const filter = val.slice(1).toLowerCase();
      setSlashFilter(filter);
      setSlashIdx(0);
      if (!showSlashMenu) {
        setShowSlashMenu(true);
        if (templates.length === 0) loadTemplates();
      }
    } else {
      if (showSlashMenu) setShowSlashMenu(false);
    }
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

  // ── Delete ──
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
    if (action === 'suggest_reply') setAiSuggestions([]);
    try {
      const data = await api.post('/api/whatsapp/ai/analyze', {
        contact_id: effectiveContactId || null,
        lead_id: leadId || null,
        action,
      });
      if (action === 'suggest_reply') {
        // Parse numbered suggestions: "1. xxx\n2. yyy\n3. zzz"
        const lines = (data.result || '').split('\n').filter((l: string) => l.trim());
        const suggestions = lines.map((l: string) => l.replace(/^\d+\.\s*/, '').trim()).filter((l: string) => l.length > 0);
        setAiSuggestions(suggestions.slice(0, 3));
        setAiResult({ action, result: data.result || 'No suggestions' });
      } else {
        setAiResult({ action, result: data.result || 'No result' });
      }
    } catch (err: any) {
      setAiResult({ action, result: `Error: ${err.message || 'Analysis failed'}` });
    }
    finally { setAiLoading(null); }
  }

  // ── CRM Context ──
  async function loadCrmContext() {
    if (!effectiveContactId) return;
    setCrmLoading(true);
    try {
      const data = await api.get(`/api/whatsapp/contacts/${effectiveContactId}/crm-context`);
      setCrmContext(data);
    } catch { setCrmContext(null); }
    finally { setCrmLoading(false); }
  }

  async function handleUpdateLeadStatus(status: string) {
    if (!effectiveContactId) return;
    try {
      await api.post(`/api/whatsapp/contacts/${effectiveContactId}/update-lead-status`, { status });
      if (crmContext?.lead) setCrmContext({ ...crmContext, lead: { ...crmContext.lead, status } });
    } catch (e: any) { alert(e.message || 'Failed to update status'); }
  }

  // ── Send Buttons ──
  async function handleSendButtons() {
    if (!effectiveContactId || !btnTitle.trim() || !btnButtons.some(b => b.text.trim())) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/send-buttons`, {
        title: btnTitle, description: btnDesc, footer: btnFooter,
        buttons: btnButtons.filter(b => b.text.trim()).map((b, i) => ({ id: b.id || String(i + 1), text: b.text })),
      });
      setShowButtonsModal(false);
      setBtnTitle(''); setBtnDesc(''); setBtnFooter('');
      setBtnButtons([{ id: '1', text: '' }]);
      loadMessages();
    } catch {}
  }

  // ── Send List ──
  async function handleSendList() {
    if (!effectiveContactId || !listTitle.trim()) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/send-list`, {
        title: listTitle, description: listDesc, button_text: listBtnText || 'View',
        footer: listFooter,
        sections: listSections.map(s => ({
          title: s.title,
          rows: s.rows.filter(r => r.title.trim()).map(r => ({ title: r.title, description: r.description, rowId: r.row_id })),
        })),
      });
      setShowListModal(false);
      setListTitle(''); setListDesc(''); setListBtnText(''); setListFooter('');
      setListSections([{ title: '', rows: [{ title: '', description: '', row_id: '1' }] }]);
      loadMessages();
    } catch {}
  }

  // ── Template selector ──
  async function loadTemplates() {
    try {
      const data = await api.get('/api/whatsapp/templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch { setTemplates([]); }
  }

  function handleSelectTemplate(tpl: any) {
    let content = tpl.content || '';
    // Variable substitution from CRM data
    const vars: Record<string, string> = {
      '{{name}}': conversation?.crm_account_name || conversation?.lead_name || conversation?.display_name || contactName || '',
      '{{phone}}': conversation?.phone_number || '',
      '{{company}}': conversation?.crm_account_name || '',
    };
    for (const [key, val] of Object.entries(vars)) {
      content = content.replaceAll(key, val);
    }
    setInput(content);
    setShowTemplateModal(false);
    setShowSlashMenu(false);
  }

  // ── Block/Unblock ──
  async function handleBlock() {
    if (!effectiveContactId) return;
    const newBlocked = !isBlocked;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/block`, { block: newBlocked });
      setIsBlocked(newBlocked);
    } catch {}
  }

  // ── Search messages ──
  async function handleSearch() {
    if (!searchQuery.trim() || !effectiveContactId) return;
    try {
      const data = await api.get(`/api/whatsapp/search?q=${encodeURIComponent(searchQuery)}&contact_id=${effectiveContactId}`);
      setSearchResults(Array.isArray(data) ? data : []);
      setSearchIdx(0);
    } catch { setSearchResults([]); }
  }

  // ── Group info ──
  async function loadGroupInfo() {
    if (!effectiveContactId) return;
    try {
      const meta = await api.get(`/api/whatsapp/groups/${effectiveContactId}/metadata`);
      setGroupMeta(meta);
    } catch {}
    try {
      const inv = await api.get(`/api/whatsapp/groups/${effectiveContactId}/invite-code`);
      setInviteCode(inv.inviteCode || inv.code || '');
    } catch {}
    loadGroupParticipants();
  }

  // ── 4.1 Send contact card ──
  async function handleSendContact() {
    if (!effectiveContactId || !contactCardName.trim() || !contactCardPhone.trim()) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/send-contact`, {
        contact_name: contactCardName, contact_phone: contactCardPhone,
      });
      setShowContactModal(false);
      setContactCardName(''); setContactCardPhone('');
      loadMessages();
    } catch {}
  }

  // ── 4.2 Send location ──
  async function handleSendLocation() {
    if (!effectiveContactId || !locLat || !locLng) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/send-location`, {
        latitude: parseFloat(locLat), longitude: parseFloat(locLng),
        name: locName || undefined, address: locAddress || undefined,
      });
      setShowLocationModal(false);
      setLocLat(''); setLocLng(''); setLocName(''); setLocAddress('');
      loadMessages();
    } catch {}
  }

  // ── 4.3 Voice recording ──
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => setRecordDuration(d => d + 1), 1000);
    } catch {}
  }

  async function stopRecordingAndSend() {
    if (!mediaRecorderRef.current || !effectiveContactId) return;
    const recorder = mediaRecorderRef.current;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(recordChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        const file = new File([blob], 'voice_note.ogg', { type: 'audio/ogg' });
        try {
          const uploadRes = await api.upload('/api/whatsapp/upload-media', file);
          await api.post(`/api/whatsapp/conversations/${effectiveContactId}/send-voice-note`, {
            audio_url: uploadRes.media_url,
          });
          loadMessages();
        } catch {}
        recorder.stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        setRecordDuration(0);
        mediaRecorderRef.current = null;
        resolve();
      };
      recorder.stop();
    });
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current.stop();
    }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setIsRecording(false);
    setRecordDuration(0);
    mediaRecorderRef.current = null;
  }

  // ── 4.4 Sync history ──
  async function handleSyncHistory() {
    if (!effectiveContactId) return;
    setSyncing(true);
    setSyncCount(null);
    try {
      const res = await api.post(`/api/whatsapp/conversations/${effectiveContactId}/sync-history`, { count: 100 });
      setSyncCount(res.imported || 0);
      loadMessages();
    } catch {}
    finally { setSyncing(false); }
  }

  // ── 4.4 Download media ──
  async function handleDownloadMedia(msgId: string) {
    if (!effectiveContactId) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/messages/${msgId}/download-media`, {});
      loadMessages();
    } catch {}
  }

  // ── 4.5 Mark unread ──
  async function handleMarkUnread() {
    if (!effectiveContactId) return;
    try { await api.post(`/api/whatsapp/conversations/${effectiveContactId}/mark-unread`, {}); } catch {}
  }

  // ── 4.5 Delete chat ──
  async function handleDeleteChat() {
    if (!effectiveContactId || !confirm('Delete this entire chat? This action cannot be undone.')) return;
    try { await api.delete(`/api/whatsapp/conversations/${effectiveContactId}/delete-chat`); } catch {}
  }

  // ── 4.5 Fetch profile ──
  async function handleFetchProfile() {
    if (!effectiveContactId) return;
    setShowProfilePanel(true);
    try {
      const data = await api.get(`/api/whatsapp/conversations/${effectiveContactId}/profile`);
      setProfileData(data);
    } catch { setProfileData(null); }
  }

  // ── 5.5 Call ──
  async function handleCall(isVideo: boolean) {
    if (!effectiveContactId) return;
    try {
      await api.post(`/api/whatsapp/conversations/${effectiveContactId}/call`, { is_video: isVideo });
      loadMessages();
    } catch {}
    setShowCallMenu(false);
  }

  // ── 5.3 Group operations ──
  async function handleLeaveGroup() {
    if (!effectiveContactId || !confirm('Leave this group? You will no longer receive messages.')) return;
    try {
      await api.delete(`/api/whatsapp/groups/${effectiveContactId}/leave`);
      setShowGroupInfo(false);
    } catch {}
  }

  async function handleRevokeInvite() {
    if (!effectiveContactId || !confirm('Revoke the current invite link? A new one will be generated.')) return;
    try {
      const result = await api.post(`/api/whatsapp/groups/${effectiveContactId}/revoke-invite`, {});
      setInviteCode(result.inviteCode || result.code || '');
    } catch {}
  }

  async function openGroupInviteModal() {
    setShowGroupInviteModal(true);
    try {
      const contacts = await api.get('/api/whatsapp/conversations?is_group=false');
      setGroupInviteContacts(Array.isArray(contacts) ? contacts : []);
    } catch { setGroupInviteContacts([]); }
  }

  async function handleSendGroupInvite(inviteeContactId: string) {
    if (!effectiveContactId) return;
    try {
      await api.post(`/api/whatsapp/groups/${effectiveContactId}/send-invite`, {
        invitee_contact_id: inviteeContactId,
      });
      setShowGroupInviteModal(false);
    } catch {}
  }

  async function handleGroupSetting(action: string) {
    if (!effectiveContactId) return;
    try { await api.put(`/api/whatsapp/groups/${effectiveContactId}/settings`, { action }); } catch {}
  }

  async function handleGroupEphemeral(expiration: number) {
    if (!effectiveContactId) return;
    try { await api.put(`/api/whatsapp/groups/${effectiveContactId}/ephemeral`, { expiration }); } catch {}
  }

  async function loadGroupParticipants() {
    if (!effectiveContactId) return;
    try {
      const data = await api.get(`/api/whatsapp/groups/${effectiveContactId}/participants`);
      setGroupParticipants(Array.isArray(data) ? data : (data?.participants || []));
    } catch { setGroupParticipants([]); }
  }

  // ── 5.4 Catalog ──
  async function loadCatalog() {
    if (!effectiveContactId) return;
    setShowCatalogTab(true);
    try {
      const data = await api.get(`/api/whatsapp/conversations/${effectiveContactId}/catalog`);
      setCatalogData(Array.isArray(data) ? data : (data?.data || data?.products || []));
    } catch { setCatalogData([]); }
  }

  // ── Find quoted message ──
  function findQuotedMessage(replyId: string): Message | undefined {
    return messages.find(m => m.id === replyId);
  }

  // ── Render interactive message types ──
  function renderButtonsMessage(msg: Message) {
    const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : (msg.metadata || {});
    const buttons = meta.buttons || [];
    const desc = meta.description || '';
    const footer = meta.footer || '';
    return (
      <div>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--notion-text)' }}>{msg.content}</p>
        {desc && <p className="text-xs mb-2" style={{ color: 'var(--notion-text-muted)' }}>{desc}</p>}
        {buttons.map((b: any, i: number) => (
          <div key={i} className="border rounded-lg px-3 py-1.5 mb-1 text-center text-xs font-medium"
            style={{ borderColor: '#25D366', color: '#25D366' }}>
            {b.text || b.buttonText || ''}
          </div>
        ))}
        {footer && <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--notion-text-muted)' }}>{footer}</p>}
      </div>
    );
  }

  function renderListMessage(msg: Message) {
    const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : (msg.metadata || {});
    const sections = meta.sections || [];
    const desc = meta.description || '';
    const footer = meta.footer || '';
    const buttonText = meta.button_text || 'View';
    return (
      <div>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--notion-text)' }}>{msg.content}</p>
        {desc && <p className="text-xs mb-2" style={{ color: 'var(--notion-text-muted)' }}>{desc}</p>}
        {sections.map((s: any, si: number) => (
          <div key={si} className="mb-2">
            {s.title && <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--notion-text-muted)' }}>── {s.title} ──</p>}
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--notion-border)' }}>
              {(s.rows || []).map((r: any, ri: number) => (
                <div key={ri} className="px-3 py-1.5 border-b last:border-b-0" style={{ borderColor: 'var(--notion-border)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{r.title}</p>
                  {r.description && <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{r.description}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="border rounded-lg px-3 py-1.5 text-center text-xs font-medium mt-1"
          style={{ borderColor: '#25D366', color: '#25D366' }}>
          {buttonText}
        </div>
        {footer && <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--notion-text-muted)' }}>{footer}</p>}
      </div>
    );
  }

  // ── Render contact card message ──
  function renderContactMessage(msg: Message) {
    const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : (msg.metadata || {});
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#128C7E' }}>
          {(meta.contact_name || msg.content || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{meta.contact_name || msg.content}</p>
          <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{meta.contact_phone || ''}</p>
        </div>
      </div>
    );
  }

  // ── Render location message ──
  function renderLocationMessage(msg: Message) {
    const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : (msg.metadata || {});
    const lat = meta.latitude || msg.content?.split(',')[0] || '0';
    const lng = meta.longitude || msg.content?.split(',')[1] || '0';
    const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
    return (
      <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <a href={mapUrl} target="_blank" rel="noopener noreferrer"
          className="block p-2 hover:opacity-80">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📍</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{meta.place_name || 'Location'}</span>
          </div>
          {meta.address && <p className="text-[10px] mb-1" style={{ color: 'var(--notion-text-muted)' }}>{meta.address}</p>}
          <p className="text-[10px]" style={{ color: '#1d4ed8' }}>View on map →</p>
        </a>
      </div>
    );
  }

  // ── Render voice note message ──
  function renderVoiceNoteMessage(msg: Message) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#25D366' }}>
          <span className="text-white text-sm">🎤</span>
        </div>
        {msg.media_url ? (
          <audio src={msg.media_url} controls className="max-w-[200px] h-8" />
        ) : (
          <button onClick={() => handleDownloadMedia(msg.id)}
            className="text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.06)' }}>
            Download audio
          </button>
        )}
      </div>
    );
  }

  // ── Render sticker message ──
  function renderStickerMessage(msg: Message) {
    if (msg.media_url) {
      return <img src={msg.media_url} alt="sticker" className="w-32 h-32 object-contain" />;
    }
    return (
      <button onClick={() => handleDownloadMedia(msg.id)}
        className="text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.06)' }}>
        Download sticker
      </button>
    );
  }

  // ── Render call message ──
  function renderCallMessage(msg: Message) {
    const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : (msg.metadata || {});
    const isVideo = meta.call_type === 'video';
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <span className="text-lg">{isVideo ? '📹' : '📞'}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>
          {isVideo ? 'Video call' : 'Voice call'}
        </span>
      </div>
    );
  }

  const groups = groupByDate(messages);
  const hasMessages = messages.length > 0;
  const presenceText = (wsTyping || presence?.status === 'composing') ? 'typing...'
    : presence?.status === 'available' ? 'online'
    : presence?.lastSeen ? `last seen ${new Date(presence.lastSeen * 1000).toLocaleString()}`
    : '';

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
      {/* ── Header ── */}
      <div className="px-4 py-2.5 flex items-center gap-3" style={{ background: '#008069' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold overflow-hidden cursor-pointer flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.2)' }}
          onClick={() => { if (isGroup) { setShowGroupInfo(!showGroupInfo); loadGroupInfo(); } else if (effectiveContactId) { handleFetchProfile(); } }}>
          {profilePicUrl ? (
            <img src={profilePicUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <svg viewBox="0 0 212 212" width="40" height="40"><path fill="rgba(255,255,255,0.6)" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0zm0 50c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zm0 145c-26.5 0-49.9-13.5-63.5-34 .3-21 42.3-32.5 63.5-32.5s63.2 11.5 63.5 32.5C155.9 181.5 132.5 195 106 195z"/></svg>
          )}
        </div>
        <div className="flex-1 min-w-0"
          onClick={() => { if (isGroup) { setShowGroupInfo(!showGroupInfo); loadGroupInfo(); } }}
          style={{ cursor: isGroup ? 'pointer' : 'default' }}>
          <p className="text-sm font-medium truncate text-white">{contactName || 'WhatsApp Chat'}</p>
          <p className="text-xs truncate" style={{ color: presenceText === 'typing...' ? '#a8f0d6' : 'rgba(255,255,255,0.7)' }}>
            {presenceText || (isGroup ? 'tap here for group info' : `${messages.length} messages`)}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Quick AI buttons */}
          {hasMessages && effectiveContactId && (
            <>
              <button onClick={() => { setShowAiPanel(true); runAiAction('suggest_reply'); }}
                disabled={aiLoading !== null}
                className="px-2 py-1 rounded-full hover:bg-white/10 transition-colors text-[10px] font-medium flex items-center gap-1"
                style={{ color: '#e0c3fc', border: '1px solid rgba(255,255,255,0.2)' }}
                title="AI Suggest Reply">
                {aiLoading === 'suggest_reply' ? <span className="inline-block w-3 h-3 border-2 border-white/60 border-t-transparent rounded-full animate-spin" /> : '✨'}
                AI
              </button>
              <button onClick={() => { setShowAiPanel(true); runAiAction('summarize'); }}
                disabled={aiLoading !== null}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                title="Summarize conversation">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </button>
              <button onClick={() => { setShowCrmSidebar(!showCrmSidebar); if (!crmContext) loadCrmContext(); }}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                title="CRM Info"
                style={{ color: showCrmSidebar ? '#a8f0d6' : 'white' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            </>
          )}
          {/* Search */}
          <button onClick={() => setShowSearch(!showSearch)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Search messages">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
          {/* Call (non-group) */}
          {effectiveContactId && !isGroup && (
            <div className="relative">
              <button onClick={() => setShowCallMenu(!showCallMenu)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Call">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </button>
              {showCallMenu && (
                <div className="absolute right-0 top-10 z-50 rounded-lg shadow-lg border py-1 min-w-[130px]"
                  style={{ background: 'white', borderColor: '#e5e7eb' }}>
                  <button onClick={() => handleCall(false)} className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50">📞 Voice call</button>
                  <button onClick={() => handleCall(true)} className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50">📹 Video call</button>
                </div>
              )}
            </div>
          )}
          {/* More (three-dot) menu */}
          <div className="relative">
            <button onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors" title="More options">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 top-10 z-50 rounded-lg shadow-xl py-1.5 min-w-[200px]"
                style={{ background: 'white', border: '1px solid #e5e7eb' }}
                onClick={() => setShowMoreMenu(false)}>
                {/* Block/Unblock */}
                <button onClick={handleBlock}
                  className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50"
                  style={{ color: isBlocked ? '#dc2626' : '#3b4a54' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  {isBlocked ? 'Unblock contact' : 'Block contact'}
                </button>
                {/* Disappearing messages */}
                <button onClick={() => { setShowMoreMenu(false); setShowDisappearing(!showDisappearing); }}
                  className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Disappearing messages {currentDisappearing > 0 && '✓'}
                </button>
                {/* AI Analysis */}
                {hasMessages && (
                  <button onClick={() => { setShowMoreMenu(false); setShowAiPanel(!showAiPanel); }}
                    className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#7c3aed' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a4 4 0 0 1 4 4c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2 4 4 0 0 1 4-4z"/><path d="M12 8v8"/><path d="M8 12h8"/><circle cx="12" cy="12" r="10"/></svg>
                    AI Analysis
                  </button>
                )}
                {/* Sync history */}
                {effectiveContactId && (
                  <button onClick={() => { setShowMoreMenu(false); handleSyncHistory(); }} disabled={syncing}
                    className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                    {syncing ? 'Syncing...' : 'Sync history'}
                  </button>
                )}
                {/* Sync profile pic (non-group) */}
                {effectiveContactId && !isGroup && (
                  <button onClick={async () => {
                    setShowMoreMenu(false);
                    try { await api.post(`/api/whatsapp/conversations/${effectiveContactId}/sync-profile`, {}); } catch {}
                  }}
                    className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                    Sync profile picture
                  </button>
                )}
                {/* Contact profile (non-group) */}
                {effectiveContactId && !isGroup && (
                  <button onClick={() => { setShowMoreMenu(false); handleFetchProfile(); }}
                    className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Contact info
                  </button>
                )}
                <div className="border-t my-1" style={{ borderColor: '#e5e7eb' }} />
                {/* Mark unread */}
                <button onClick={() => { setShowMoreMenu(false); handleMarkUnread(); }}
                  className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
                  Mark as unread
                </button>
                {/* Delete chat */}
                <button onClick={() => { setShowMoreMenu(false); handleDeleteChat(); }}
                  className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#dc2626' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Delete chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Disappearing messages dropdown (triggered from more menu) ── */}
      {showDisappearing && (
        <div className="px-4 py-2 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: '#e5e7eb', background: '#f0f2f5' }}>
          <span className="text-xs font-medium" style={{ color: '#3b4a54' }}>Disappearing:</span>
          {DISAPPEARING_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => handleDisappearing(opt.value)}
              className="px-2.5 py-1 rounded-full text-xs transition-colors"
              style={{
                background: currentDisappearing === opt.value ? '#008069' : 'white',
                color: currentDisappearing === opt.value ? 'white' : '#3b4a54',
                border: '1px solid #d1d5db',
              }}>
              {opt.label}
            </button>
          ))}
          <button onClick={() => setShowDisappearing(false)} className="ml-auto text-xs p-1 hover:bg-gray-200 rounded" style={{ color: '#8696a0' }}>✕</button>
        </div>
      )}

      {/* ── Blocked banner ── */}
      {isBlocked && (
        <div className="px-4 py-2 text-[13px] text-center font-medium" style={{ background: '#fdf2f2', color: '#ea0038' }}>
          This contact is blocked. <button onClick={handleBlock} className="underline font-semibold">Unblock</button>
        </div>
      )}

      {/* ── Sync result banner ── */}
      {syncCount !== null && (
        <div className="px-4 py-2 text-[13px] text-center font-medium" style={{ background: '#d1f4cc', color: '#111b21' }}>
          Synced {syncCount} messages from WhatsApp
          <button onClick={() => setSyncCount(null)} className="ml-3 text-[12px] px-2 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.06)' }}>Dismiss</button>
        </div>
      )}

      {/* ── Search bar ── */}
      {showSearch && (
        <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: '#f0f2f5' }}>
          <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: 'white' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8696a0" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Search..."
              className="flex-1 text-[13px] outline-none bg-transparent"
              style={{ color: '#3b4a54' }} autoFocus />
          </div>
          {searchResults.length > 0 && (
            <div className="flex items-center gap-0.5 text-[11px]" style={{ color: '#8696a0' }}>
              <span>{searchIdx + 1}/{searchResults.length}</span>
              <button onClick={() => setSearchIdx(Math.max(0, searchIdx - 1))}
                className="p-1 rounded hover:bg-gray-200">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg>
              </button>
              <button onClick={() => setSearchIdx(Math.min(searchResults.length - 1, searchIdx + 1))}
                className="p-1 rounded hover:bg-gray-200">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
            </div>
          )}
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
            className="p-1.5 rounded hover:bg-gray-200" style={{ color: '#8696a0' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

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

      {/* ── CRM Sidebar Panel ── */}
      {showCrmSidebar && (
        <div className="border-b overflow-y-auto" style={{ borderColor: '#e5e7eb', background: '#f9fafb', maxHeight: 300 }}>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold" style={{ color: '#3b4a54' }}>CRM Info</span>
              <button onClick={() => setShowCrmSidebar(false)} className="text-xs" style={{ color: '#8696a0' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {crmLoading ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: '#8696a0' }}>
                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Loading...
              </div>
            ) : crmContext?.lead ? (
              <div className="space-y-3">
                {/* Lead info card */}
                <div className="rounded-lg p-3" style={{ background: 'white', border: '1px solid #e5e7eb' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: '#3b4a54' }}>{crmContext.lead.full_name}</span>
                    <select value={crmContext.lead.status || ''} onChange={(e) => handleUpdateLeadStatus(e.target.value)}
                      className="text-[10px] px-2 py-0.5 rounded-full border outline-none cursor-pointer"
                      style={{ borderColor: '#e5e7eb', color: '#00a884', background: '#e7fcf5' }}>
                      {['new', 'inquiry', 'engaged', 'qualified', 'quoted', 'negotiating', 'converted', 'lost'].map((s) => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 text-[11px]" style={{ color: '#8696a0' }}>
                    {crmContext.lead.company && <div>Company: <span style={{ color: '#3b4a54' }}>{crmContext.lead.company}</span></div>}
                    {crmContext.lead.email && <div>Email: <span style={{ color: '#3b4a54' }}>{crmContext.lead.email}</span></div>}
                    {crmContext.lead.source && <div>Source: <span style={{ color: '#3b4a54' }}>{crmContext.lead.source}</span></div>}
                    {crmContext.lead.ai_summary && (
                      <div className="mt-1 p-2 rounded text-[10px]" style={{ background: '#f0f2f5' }}>
                        {crmContext.lead.ai_summary}
                      </div>
                    )}
                  </div>
                </div>

                {/* Contracts */}
                {crmContext.contracts?.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: '#667781' }}>Contracts</div>
                    {crmContext.contracts.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between text-[11px] px-2 py-1 rounded mb-0.5"
                        style={{ background: 'white', border: '1px solid #e5e7eb' }}>
                        <span style={{ color: '#3b4a54' }}>{c.contract_no}</span>
                        <span style={{ color: '#00a884' }}>{c.currency} {Number(c.contract_amount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent interactions */}
                {crmContext.interactions?.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: '#667781' }}>Recent Activity</div>
                    <div className="space-y-1">
                      {crmContext.interactions.slice(0, 5).map((i: any) => (
                        <div key={i.id} className="text-[10px] px-2 py-1 rounded" style={{ background: 'white', border: '1px solid #f0f2f5' }}>
                          <span className="font-medium" style={{ color: '#3b4a54' }}>{i.channel}</span>
                          <span className="mx-1" style={{ color: '#8696a0' }}>&middot;</span>
                          <span style={{ color: '#8696a0' }}>{i.summary?.slice(0, 60)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Refresh button */}
                <button onClick={loadCrmContext} className="text-[10px] font-medium" style={{ color: '#00a884' }}>
                  Refresh CRM data
                </button>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-xs" style={{ color: '#8696a0' }}>No CRM data linked</div>
                <p className="text-[10px] mt-1" style={{ color: '#8696a0' }}>Link this contact to a lead in the inbox sidebar</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Group info panel (enhanced) ── */}
      {showGroupInfo && isGroup && groupMeta && (
        <div className="border-b px-4 py-3 max-h-[400px] overflow-y-auto" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>Group Info</span>
            <button onClick={() => setShowGroupInfo(false)} className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>✕</button>
          </div>
          <p className="text-[11px] mb-1" style={{ color: 'var(--notion-text-muted)' }}>
            {groupMeta.desc || groupMeta.description || 'No description'}
          </p>
          <p className="text-[10px] mb-1" style={{ color: 'var(--notion-text-muted)' }}>
            {groupMeta.size || (groupMeta.participants || []).length} members
          </p>

          {/* Invite link */}
          {inviteCode && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] truncate flex-1" style={{ color: 'var(--notion-text-muted)' }}>
                https://chat.whatsapp.com/{inviteCode}
              </span>
              <button onClick={() => navigator.clipboard.writeText(`https://chat.whatsapp.com/${inviteCode}`)}
                className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                Copy
              </button>
              <button onClick={handleRevokeInvite}
                className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#fef2f2', color: '#dc2626' }}>
                Revoke
              </button>
            </div>
          )}

          {/* Group settings toggles */}
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-semibold" style={{ color: 'var(--notion-text-muted)' }}>Group Settings</p>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--notion-text)' }}>
              <input type="checkbox"
                onChange={e => handleGroupSetting(e.target.checked ? 'announcement' : 'not_announcement')} />
              Admin-only messages
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--notion-text)' }}>
              <input type="checkbox"
                onChange={e => handleGroupSetting(e.target.checked ? 'locked' : 'unlocked')} />
              Lock group info editing
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[11px]" style={{ color: 'var(--notion-text)' }}>Disappearing:</span>
              <select onChange={e => handleGroupEphemeral(Number(e.target.value))}
                className="text-[10px] border rounded px-1 py-0.5" style={{ borderColor: 'var(--notion-border)' }}>
                <option value="0">Off</option>
                <option value="86400">24 hours</option>
                <option value="604800">7 days</option>
                <option value="7776000">90 days</option>
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={openGroupInviteModal}
              className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              Send Invite
            </button>
            <button onClick={handleLeaveGroup}
              className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>
              Leave Group
            </button>
          </div>

          {/* Participants (from API) */}
          <div className="mt-3">
            <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--notion-text-muted)' }}>
              Members ({groupParticipants.length || (groupMeta.participants || []).length})
            </p>
            <div className="max-h-[150px] overflow-y-auto">
              {(groupParticipants.length > 0 ? groupParticipants : (groupMeta.participants || [])).map((p: any, i: number) => {
                const pid = typeof p === 'string' ? p : (p.id || '');
                const isAdmin = typeof p === 'object' && (p.admin === 'admin' || p.admin === 'superadmin');
                return (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <span className="text-[10px] truncate" style={{ color: 'var(--notion-text)' }}>{pid.replace(/@s\.whatsapp\.net$/, '')}</span>
                    {isAdmin && <span className="text-[9px] px-1 rounded" style={{ background: '#dcfce7', color: '#15803d' }}>Admin</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Group invite modal ── */}
      {showGroupInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowGroupInviteModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-80 max-h-96 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b font-semibold text-sm">Send Group Invite To...</div>
            <div className="px-4 py-2">
              <input value={groupInviteSearch} onChange={e => setGroupInviteSearch(e.target.value)}
                placeholder="Search contacts..." className="w-full text-xs border rounded px-2 py-1.5" />
            </div>
            <div className="overflow-y-auto max-h-64">
              {groupInviteContacts.filter(c => !groupInviteSearch || (c.display_name || c.push_name || '').toLowerCase().includes(groupInviteSearch.toLowerCase()))
                .map(c => (
                  <button key={c.id} onClick={() => handleSendGroupInvite(c.id)}
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 border-b" style={{ borderColor: 'var(--notion-border)' }}>
                    {c.display_name || c.push_name || c.phone_number || c.wa_jid}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Contact profile panel ── */}
      {showProfilePanel && (
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>Contact Profile</span>
            <button onClick={() => setShowProfilePanel(false)} className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>✕</button>
          </div>
          {profileData ? (
            <div className="space-y-1">
              {profileData.name && <p className="text-[11px]"><span className="font-semibold">Name:</span> {profileData.name}</p>}
              {profileData.status && <p className="text-[11px]"><span className="font-semibold">Status:</span> {profileData.status}</p>}
              {profileData.picture && <img src={profileData.picture} alt="" className="w-12 h-12 rounded-full mt-1" />}
              {profileData.business && Object.keys(profileData.business).length > 0 && (
                <div className="mt-2 p-2 rounded" style={{ background: 'rgba(0,0,0,0.03)' }}>
                  <p className="text-[10px] font-semibold mb-1" style={{ color: '#128C7E' }}>Business Profile</p>
                  {profileData.business.description && <p className="text-[10px]">{profileData.business.description}</p>}
                  {profileData.business.category && <p className="text-[10px]">Category: {profileData.business.category}</p>}
                  {profileData.business.website && (
                    <a href={profileData.business.website} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] underline" style={{ color: '#1d4ed8' }}>{profileData.business.website}</a>
                  )}
                  {profileData.business.email && <p className="text-[10px]">Email: {profileData.business.email}</p>}
                </div>
              )}
              {/* Product Catalog tab */}
              <div className="mt-2">
                {!showCatalogTab ? (
                  <button onClick={loadCatalog} className="text-[10px] font-medium px-2 py-1 rounded"
                    style={{ background: '#e0f2f1', color: '#00796b' }}>
                    View Product Catalog
                  </button>
                ) : (
                  <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <p className="text-[10px] font-semibold mb-1" style={{ color: '#128C7E' }}>Product Catalog</p>
                    {catalogData === null ? (
                      <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>Loading...</p>
                    ) : catalogData.length === 0 ? (
                      <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>No products found</p>
                    ) : (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {catalogData.map((product: any, idx: number) => (
                          <div key={idx} className="flex gap-2 p-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }}>
                            {product.productImage?.imageUrl && (
                              <img src={product.productImage.imageUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-medium truncate" style={{ color: 'var(--notion-text)' }}>
                                {product.name || product.title || 'Product'}
                              </p>
                              {(product.price || product.priceAmount) && (
                                <p className="text-[10px] font-semibold" style={{ color: '#15803d' }}>
                                  {product.currency || ''} {product.price || product.priceAmount}
                                </p>
                              )}
                              {product.description && (
                                <p className="text-[9px] truncate" style={{ color: 'var(--notion-text-muted)' }}>{product.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>Loading...</p>
          )}
        </div>
      )}

      {/* ── Messages ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-12 py-4" style={{
        background: `#e5ddd5`,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c6ccd1' fill-opacity='0.15'%3E%3Cpath d='M20 20h8v2h-8zm30 0h6v3h-6zm25 5h4v4h-4zm-60 10h5v5h-5zm40 0h3v6h-3zm30 5h7v3h-7zM15 50h4v4h-4zm35-5h6v4h-6zm30 10h5v3h-5zm-50 15h3v5h-3zm25-5h8v2h-8zm35 0h4v6h-4zM10 80h6v3h-6zm45-5h5v5h-5zm25 10h7v2h-7zm-55 15h4v4h-4zm30-5h6v3h-6zm40 5h3v5h-3zM20 110h5v4h-5zm25 5h8v3h-8zm30-5h4v6h-4zm-65 20h7v2h-7zm35-5h5v5h-5zm30 10h6v3h-6zM10 150h4v4h-4zm40-5h3v6h-3zm25 5h8v2h-8zm-50 20h6v3h-6zm30 0h5v5h-5zm35-5h4v4h-4zM25 185h7v3h-7zm25 5h4v4h-4zm30-5h6v5h-6zm-70 20h5v3h-5zm40 0h3v6h-3zm30 5h8v2h-8zM15 220h4v5h-4zm30-5h6v4h-6zm25 10h5v3h-5zm-40 15h7v2h-7zm25 0h4v6h-4zm35-5h3v5h-3zM10 260h6v3h-6zm45-5h8v4h-8zm20 10h5v3h-5zm-55 15h4v4h-4zm30 0h6v5h-6zm30-5h7v3h-7zM20 295h5v4h-5zm25 5h3v6h-3zm30-5h8v2h-8zm-60 20h4v4h-4zm35 0h6v3h-6zm30 5h5v5h-5zM15 335h7v3h-7zm25-5h4v6h-4zm30 5h6v2h-6zm-50 15h5v4h-5zm30 5h3v5h-3zm25-5h8v3h-8zM10 370h6v4h-6zm40-5h5v5h-5zm25 10h4v3h-4zm-55 15h7v2h-7zm35 0h4v6h-4zm30-5h6v4h-6z'/%3E%3Ccircle cx='200' cy='50' r='2'/%3E%3Ccircle cx='350' cy='100' r='1.5'/%3E%3Ccircle cx='100' cy='200' r='2'/%3E%3Ccircle cx='300' cy='250' r='1.5'/%3E%3Ccircle cx='50' cy='350' r='2'/%3E%3Ccircle cx='250' cy='370' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop < 100 && hasMore && !loadingMore) {
            loadMessages(true);
          }
        }}
        onClick={() => { setMenuMsg(null); setShowDisappearing(false); setShowMoreMenu(false); setShowCallMenu(false); setShowAttachMenu(false); }}>
        {loading ? (
          <div className="text-center text-sm py-8" style={{ color: 'var(--notion-text-muted)' }}>Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>No messages yet</p>
          </div>
        ) : (<>
          {loadingMore && (
            <div className="text-center py-3">
              <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          )}
          {!hasMore && !loadingMore && messages.length > 0 && (
            <div className="text-center py-3">
              <span className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.9)', color: '#8696a0' }}>
                Beginning of conversation
              </span>
            </div>
          )}
          {groups.map(group => (
            <div key={group.label}>
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                  style={{ background: 'rgba(255,255,255,0.95)', color: '#54656f', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  {group.label}
                </span>
              </div>
              {group.messages.map(msg => {
                const isOut = msg.direction === 'outbound';
                const quoted = msg.reply_to_message_id ? findQuotedMessage(msg.reply_to_message_id) : null;
                const isHighlighted = searchResults.length > 0 && searchResults[searchIdx]?.id === msg.id;

                // Deleted message
                if (msg.is_deleted) {
                  return (
                    <div key={msg.id} className={`flex mb-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[65%] px-2.5 py-1.5 shadow-sm" style={{ background: isOut ? '#d9fdd3' : 'white', borderRadius: '7.5px', opacity: 0.6 }}>
                        <p className="text-xs italic" style={{ color: '#8696a0' }}>This message was deleted</p>
                      </div>
                    </div>
                  );
                }

                // Editing inline
                if (editingMsg?.id === msg.id) {
                  return (
                    <div key={msg.id} className={`flex mb-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[65%] px-2.5 py-1.5 shadow-sm" style={{ background: '#d9fdd3', borderRadius: '7.5px' }}>
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
                    <div className="max-w-[65%] px-2.5 py-1.5 shadow-sm relative"
                      style={{
                        background: isOut ? '#d9fdd3' : 'white',
                        borderRadius: '7.5px',
                        borderBottomRightRadius: isOut ? 0 : 7.5,
                        borderBottomLeftRadius: isOut ? 7.5 : 0,
                        outline: isHighlighted ? '2px solid #f59e0b' : 'none',
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

                      {/* Interactive message types */}
                      {msg.message_type === 'buttons' && renderButtonsMessage(msg)}
                      {msg.message_type === 'list' && renderListMessage(msg)}
                      {msg.message_type === 'contact' && renderContactMessage(msg)}
                      {msg.message_type === 'location' && renderLocationMessage(msg)}
                      {msg.message_type === 'voice_note' && renderVoiceNoteMessage(msg)}
                      {msg.message_type === 'call' && renderCallMessage(msg)}

                      {/* Sticker — no bubble background */}
                      {msg.message_type === 'sticker' && renderStickerMessage(msg)}

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

                      {/* Media download button for missing media */}
                      {['image', 'video', 'audio', 'document'].includes(msg.message_type) && !msg.media_url && (
                        <button onClick={() => handleDownloadMedia(msg.id)}
                          className="text-[10px] px-2 py-1 rounded mb-1" style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--notion-text)' }}>
                          Download media
                        </button>
                      )}

                      {/* Text content (not for special types) */}
                      {msg.content && !['document', 'poll', 'buttons', 'list', 'contact', 'location', 'voice_note', 'sticker', 'call'].includes(msg.message_type) && (
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
          ))}
        </>)}
        <div ref={bottomRef} />
      </div>

      {/* ── Reply preview bar ── */}
      {replyTo && (
        <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: '#f0f2f5' }}>
          <div className="flex-1 border-l-3 pl-2.5 py-1.5 rounded-r-lg text-xs truncate" style={{ borderColor: '#00a884', background: 'white', color: '#667781' }}>
            Replying to: {replyTo.content || '(media)'}
          </div>
          <button onClick={() => setReplyTo(null)}
            className="p-1.5 rounded-full hover:bg-gray-200" style={{ color: '#8696a0' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* ── Attachment preview ── */}
      {attachFile && (
        <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: '#f0f2f5' }}>
          <div className="flex-1 flex items-center gap-2 py-1.5 px-3 rounded-lg" style={{ background: 'white' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8696a0" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span className="flex-1 text-xs truncate" style={{ color: '#3b4a54' }}>{attachFile.name}</span>
          </div>
          <button onClick={() => setAttachFile(null)}
            className="p-1.5 rounded-full hover:bg-gray-200" style={{ color: '#8696a0' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* ── AI Suggested Replies ── */}
      {aiSuggestions.length > 0 && (
        <div className="px-3 py-2 flex gap-2 overflow-x-auto flex-shrink-0" style={{ background: '#f9f5ff', borderTop: '1px solid #ede9fe' }}>
          <span className="text-[10px] font-medium self-center flex-shrink-0" style={{ color: '#8b5cf6' }}>AI:</span>
          {aiSuggestions.map((s, i) => (
            <button key={i} onClick={() => { setInput(s); setAiSuggestions([]); }}
              className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors hover:shadow-sm"
              style={{ background: 'white', border: '1px solid #ddd6fe', color: '#3b4a54' }}>
              {s.length > 60 ? s.slice(0, 60) + '...' : s}
            </button>
          ))}
          <button onClick={() => setAiSuggestions([])}
            className="p-1 rounded-full hover:bg-purple-100 flex-shrink-0 self-center"
            style={{ color: '#8b5cf6' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* ── Slash command template picker ── */}
      {showSlashMenu && effectiveContactId && (
        <div className="mx-3 mb-1 rounded-lg shadow-lg overflow-hidden" style={{ background: 'white', border: '1px solid #e5e7eb', maxHeight: 240 }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
            <span className="text-xs" style={{ color: '#8696a0' }}>Templates matching &quot;{slashFilter}&quot;</span>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
            {templates.length === 0 ? (
              <div className="px-4 py-4 text-center text-xs" style={{ color: '#8696a0' }}>Loading templates...</div>
            ) : (() => {
              const filtered = templates.filter(t =>
                !slashFilter ||
                (t.name || '').toLowerCase().includes(slashFilter) ||
                (t.shortcut || '').toLowerCase().includes(slashFilter) ||
                (t.content || '').toLowerCase().includes(slashFilter)
              );
              if (filtered.length === 0) return (
                <div className="px-4 py-4 text-center text-xs" style={{ color: '#8696a0' }}>No matching templates</div>
              );
              return filtered.map((tpl: any, i: number) => (
                <button key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  className="block w-full text-left px-3 py-2 transition-colors"
                  style={{ background: i === slashIdx ? '#f0f2f5' : 'transparent', borderBottom: '1px solid #f0f2f5' }}>
                  <div className="flex items-center gap-2">
                    {tpl.shortcut && <span className="text-xs font-mono font-semibold" style={{ color: '#00a884' }}>/{tpl.shortcut}</span>}
                    <span className="text-xs font-medium" style={{ color: '#3b4a54' }}>{tpl.name}</span>
                    {tpl.category && <span className="text-[9px] px-1 rounded" style={{ background: '#f0f2f5', color: '#8696a0' }}>{tpl.category}</span>}
                  </div>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: '#8696a0' }}>{tpl.content}</p>
                </button>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── Send bar ── */}
      {effectiveContactId && (
        <form onSubmit={sendMessage}
          className="px-3 py-2 flex items-center gap-2"
          style={{ background: '#f0f2f5' }}>
          <input ref={fileInputRef} type="file" className="hidden"
            onChange={e => { if (e.target.files?.[0]) { setAttachFile(e.target.files[0]); setShowAttachMenu(false); } }} />

          {/* Recording state */}
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-full" style={{ background: 'white' }}>
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-mono flex-1" style={{ color: '#dc2626' }}>
                {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}
              </span>
              <button type="button" onClick={cancelRecording}
                className="p-1.5 rounded-full hover:bg-gray-100" title="Cancel">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              <button type="button" onClick={stopRecordingAndSend}
                className="p-2 rounded-full flex-shrink-0" style={{ background: '#00a884' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
              </button>
            </div>
          ) : (
            <>
              {/* Attach button */}
              <div className="relative">
                <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="p-2 rounded-full hover:bg-gray-200 transition-colors" title="Attach"
                  style={{ transform: showAttachMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#54656f" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                </button>
                {showAttachMenu && (
                  <div className="absolute bottom-12 left-0 z-50 rounded-xl shadow-xl overflow-hidden"
                    style={{ background: 'white', border: '1px solid #e5e7eb', width: '200px' }}
                    onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => { fileInputRef.current?.click(); }}
                      className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#7f66ff' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>
                      </span>
                      File
                    </button>
                    <button type="button" onClick={() => { setShowAttachMenu(false); setShowPollModal(true); }}
                      className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#ff9500' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><rect x="4" y="4" width="4" height="16" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="2" width="4" height="18" rx="1"/></svg>
                      </span>
                      Poll
                    </button>
                    <button type="button" onClick={() => { setShowAttachMenu(false); setShowButtonsModal(true); }}
                      className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#00a884' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><rect x="3" y="5" width="18" height="4" rx="1"/><rect x="3" y="11" width="18" height="4" rx="1"/><rect x="3" y="17" width="10" height="4" rx="1"/></svg>
                      </span>
                      Buttons
                    </button>
                    <button type="button" onClick={() => { setShowAttachMenu(false); setShowListModal(true); }}
                      className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#007bfc' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M3 4h18M3 8h18M3 12h18M3 16h12M3 20h8"/></svg>
                      </span>
                      List
                    </button>
                    <button type="button" onClick={() => { setShowAttachMenu(false); setShowTemplateModal(true); loadTemplates(); }}
                      className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#02a698' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                      </span>
                      Template
                    </button>
                    <button type="button" onClick={() => { setShowAttachMenu(false); setShowContactModal(true); }}
                      className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#0795dc' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </span>
                      Contact
                    </button>
                    <button type="button" onClick={() => { setShowAttachMenu(false); setShowLocationModal(true); }}
                      className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50" style={{ color: '#3b4a54' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#d3362c' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3" fill="#d3362c"/></svg>
                      </span>
                      Location
                    </button>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="flex-1 flex items-center rounded-full px-3" style={{ background: 'white' }}>
                <input type="text" value={input}
                  onChange={e => handleInputChange(e.target.value)}
                  placeholder="Type a message"
                  className="flex-1 py-2.5 text-[15px] outline-none bg-transparent"
                  style={{ color: '#3b4a54' }} />
              </div>

              {/* Mic or Send */}
              {(input.trim() || attachFile) ? (
                <button type="submit" disabled={sending}
                  className="p-2.5 rounded-full flex-shrink-0 transition-colors"
                  style={{ background: '#00a884' }}>
                  {sending ? (
                    <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
                  )}
                </button>
              ) : (
                <button type="button" onClick={startRecording}
                  className="p-2 rounded-full hover:bg-gray-200 transition-colors" title="Voice message">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#54656f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
              )}
            </>
          )}
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

      {/* ── Buttons message modal ── */}
      {showButtonsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowButtonsModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-96 p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Send Button Message</h3>
            <input value={btnTitle} onChange={e => setBtnTitle(e.target.value)}
              placeholder="Title" className="w-full text-xs border rounded px-2 py-1.5 mb-2" />
            <textarea value={btnDesc} onChange={e => setBtnDesc(e.target.value)}
              placeholder="Description" rows={2} className="w-full text-xs border rounded px-2 py-1.5 mb-2" />
            <input value={btnFooter} onChange={e => setBtnFooter(e.target.value)}
              placeholder="Footer (optional)" className="w-full text-xs border rounded px-2 py-1.5 mb-2" />
            <p className="text-[10px] mb-1 font-semibold" style={{ color: 'var(--notion-text-muted)' }}>Buttons (max 3)</p>
            {btnButtons.map((btn, i) => (
              <input key={i} value={btn.text} onChange={e => {
                const next = [...btnButtons]; next[i] = { ...next[i], text: e.target.value }; setBtnButtons(next);
              }} placeholder={`Button ${i + 1}`} className="w-full text-xs border rounded px-2 py-1.5 mb-1" />
            ))}
            {btnButtons.length < 3 && (
              <button onClick={() => setBtnButtons([...btnButtons, { id: String(btnButtons.length + 1), text: '' }])}
                className="text-xs text-blue-500 mb-2">+ Add button</button>
            )}
            <div className="flex gap-2 mt-2">
              <button onClick={handleSendButtons} className="flex-1 px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: '#25D366' }}>Send</button>
              <button onClick={() => setShowButtonsModal(false)} className="flex-1 px-3 py-1.5 rounded text-xs border">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── List message modal ── */}
      {showListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowListModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[440px] p-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Send List Message</h3>
            <input value={listTitle} onChange={e => setListTitle(e.target.value)}
              placeholder="Title" className="w-full text-xs border rounded px-2 py-1.5 mb-2" />
            <textarea value={listDesc} onChange={e => setListDesc(e.target.value)}
              placeholder="Description" rows={2} className="w-full text-xs border rounded px-2 py-1.5 mb-2" />
            <input value={listBtnText} onChange={e => setListBtnText(e.target.value)}
              placeholder="Button text (e.g. View Options)" className="w-full text-xs border rounded px-2 py-1.5 mb-2" />
            <input value={listFooter} onChange={e => setListFooter(e.target.value)}
              placeholder="Footer (optional)" className="w-full text-xs border rounded px-2 py-1.5 mb-3" />

            {listSections.map((section, si) => (
              <div key={si} className="border rounded-lg p-3 mb-2" style={{ borderColor: 'var(--notion-border)' }}>
                <input value={section.title} onChange={e => {
                  const next = [...listSections]; next[si] = { ...next[si], title: e.target.value }; setListSections(next);
                }} placeholder={`Section ${si + 1} title`} className="w-full text-xs border rounded px-2 py-1.5 mb-2 font-semibold" />
                {section.rows.map((row, ri) => (
                  <div key={ri} className="flex gap-1 mb-1">
                    <input value={row.title} onChange={e => {
                      const next = [...listSections];
                      next[si].rows[ri] = { ...next[si].rows[ri], title: e.target.value };
                      setListSections(next);
                    }} placeholder="Row title" className="flex-1 text-xs border rounded px-2 py-1" />
                    <input value={row.description} onChange={e => {
                      const next = [...listSections];
                      next[si].rows[ri] = { ...next[si].rows[ri], description: e.target.value };
                      setListSections(next);
                    }} placeholder="Description" className="flex-1 text-xs border rounded px-2 py-1" />
                  </div>
                ))}
                <button onClick={() => {
                  const next = [...listSections];
                  next[si].rows.push({ title: '', description: '', row_id: String(next[si].rows.length + 1) });
                  setListSections(next);
                }} className="text-[10px] text-blue-500">+ Add row</button>
              </div>
            ))}
            <button onClick={() => setListSections([...listSections, { title: '', rows: [{ title: '', description: '', row_id: '1' }] }])}
              className="text-xs text-blue-500 mb-3">+ Add section</button>

            <div className="flex gap-2">
              <button onClick={handleSendList} className="flex-1 px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: '#25D366' }}>Send</button>
              <button onClick={() => setShowListModal(false)} className="flex-1 px-3 py-1.5 rounded text-xs border">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Template selector modal ── */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-80 max-h-96 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b font-semibold text-sm">Quick Reply Templates</div>
            <div className="px-4 py-2">
              <input value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
                placeholder="Search templates..." className="w-full text-xs border rounded px-2 py-1.5" />
            </div>
            <div className="overflow-y-auto max-h-64">
              {templates.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--notion-text-muted)' }}>No templates. Create one in Settings.</div>
              ) : templates
                .filter(t => !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase()) || t.content.toLowerCase().includes(templateSearch.toLowerCase()))
                .map(tpl => (
                  <button key={tpl.id} onClick={() => handleSelectTemplate(tpl)}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-50 border-b" style={{ borderColor: 'var(--notion-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{tpl.name}</span>
                      <span className="text-[9px] px-1 rounded" style={{ background: 'var(--notion-hover)', color: 'var(--notion-text-muted)' }}>{tpl.category}</span>
                      {tpl.shortcut && <span className="text-[9px]" style={{ color: '#7c3aed' }}>/{tpl.shortcut}</span>}
                    </div>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--notion-text-muted)' }}>{tpl.content}</p>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Contact card modal ── */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowContactModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-80 p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Send Contact Card</h3>
            <input value={contactCardName} onChange={e => setContactCardName(e.target.value)}
              placeholder="Contact name" className="w-full text-xs border rounded px-2 py-1.5 mb-2" autoFocus />
            <input value={contactCardPhone} onChange={e => setContactCardPhone(e.target.value)}
              placeholder="Phone number (e.g. +1234567890)" className="w-full text-xs border rounded px-2 py-1.5 mb-3" />
            <div className="flex gap-2">
              <button onClick={handleSendContact} className="flex-1 px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: '#25D366' }}>Send</button>
              <button onClick={() => setShowContactModal(false)} className="flex-1 px-3 py-1.5 rounded text-xs border">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Location modal ── */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowLocationModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-80 p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Send Location</h3>
            <div className="flex gap-2 mb-2">
              <input value={locLat} onChange={e => setLocLat(e.target.value)}
                placeholder="Latitude" className="flex-1 text-xs border rounded px-2 py-1.5" type="number" step="any" />
              <input value={locLng} onChange={e => setLocLng(e.target.value)}
                placeholder="Longitude" className="flex-1 text-xs border rounded px-2 py-1.5" type="number" step="any" />
            </div>
            <input value={locName} onChange={e => setLocName(e.target.value)}
              placeholder="Place name (optional)" className="w-full text-xs border rounded px-2 py-1.5 mb-2" />
            <input value={locAddress} onChange={e => setLocAddress(e.target.value)}
              placeholder="Address (optional)" className="w-full text-xs border rounded px-2 py-1.5 mb-3" />
            <div className="flex gap-2">
              <button onClick={handleSendLocation} className="flex-1 px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: '#25D366' }}>Send</button>
              <button onClick={() => setShowLocationModal(false)} className="flex-1 px-3 py-1.5 rounded text-xs border">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
