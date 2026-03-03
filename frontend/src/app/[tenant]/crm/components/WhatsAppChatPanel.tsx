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
  isBlocked?: boolean;
  isArchived?: boolean;
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
  isBlocked: initialIsBlocked, isArchived: initialIsArchived,
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
      api.post(`/api/whatsapp/conversations/${effectiveContactId}/subscribe-presence`, {}).catch(() => {});
    }
    const iv = setInterval(() => { loadMessages(); }, 5000);
    return () => clearInterval(iv);
  }, [effectiveContactId, leadId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // ── Presence polling ──
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
    setInput(tpl.content || '');
    setShowTemplateModal(false);
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
  const presenceText = presence?.status === 'composing' ? 'typing...'
    : presence?.status === 'available' ? 'online'
    : presence?.lastSeen ? `last seen ${new Date(presence.lastSeen * 1000).toLocaleString()}`
    : '';

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold overflow-hidden cursor-pointer"
          style={{ background: '#25D366' }}
          onClick={() => { if (isGroup) { setShowGroupInfo(!showGroupInfo); loadGroupInfo(); } }}>
          {profilePicUrl ? (
            <img src={profilePicUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            (contactName || 'W').charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0"
          onClick={() => { if (isGroup) { setShowGroupInfo(!showGroupInfo); loadGroupInfo(); } }}
          style={{ cursor: isGroup ? 'pointer' : 'default' }}>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{contactName || 'WhatsApp Chat'}</p>
          <p className="text-xs" style={{ color: presenceText === 'typing...' ? '#25D366' : 'var(--notion-text-muted)' }}>
            {presenceText || `${messages.length} messages`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Call */}
          {effectiveContactId && !isGroup && (
            <div className="relative">
              <button onClick={() => setShowCallMenu(!showCallMenu)}
                className="p-1.5 rounded hover:bg-gray-100" title="Call">
                <span className="text-sm">📞</span>
              </button>
              {showCallMenu && (
                <div className="absolute right-0 top-8 z-50 rounded-lg shadow-lg border py-1 min-w-[130px]"
                  style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
                  <button onClick={() => handleCall(false)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">📞 Voice call</button>
                  <button onClick={() => handleCall(true)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">📹 Video call</button>
                </div>
              )}
            </div>
          )}
          {/* Sync history */}
          {effectiveContactId && (
            <button onClick={handleSyncHistory} disabled={syncing}
              className="p-1.5 rounded hover:bg-gray-100" title="Sync history">
              {syncing ? <span className="inline-block w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /> : '🔄'}
            </button>
          )}
          {/* Search */}
          <button onClick={() => setShowSearch(!showSearch)}
            className="p-1.5 rounded hover:bg-gray-100" title="Search messages">
            <HandIcon name="search" size={16} />
          </button>
          {/* Profile */}
          {effectiveContactId && !isGroup && (
            <button onClick={handleFetchProfile}
              className="p-1.5 rounded hover:bg-gray-100 text-xs" title="Contact profile">
              <HandIcon name="person" size={16} />
            </button>
          )}
          {/* Block */}
          <button onClick={handleBlock}
            className="p-1.5 rounded hover:bg-gray-100 text-xs" title={isBlocked ? 'Unblock' : 'Block'}
            style={{ color: isBlocked ? '#dc2626' : 'var(--notion-text-muted)' }}>
            <HandIcon name="shield" size={16} />
          </button>
          {/* Sync profile pic */}
          {effectiveContactId && !isGroup && (
            <button onClick={async () => {
              try { await api.post(`/api/whatsapp/conversations/${effectiveContactId}/sync-profile`, {}); } catch {}
            }} className="p-1.5 rounded hover:bg-gray-100 text-xs" title="Sync profile picture">
              <HandIcon name="refresh" size={16} />
            </button>
          )}
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
                <div className="border-t my-1" style={{ borderColor: 'var(--notion-border)' }} />
                <button onClick={handleMarkUnread} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">Mark as unread</button>
                <button onClick={handleDeleteChat} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-red-500">Delete chat</button>
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

      {/* ── Blocked banner ── */}
      {isBlocked && (
        <div className="px-4 py-2 text-xs text-center font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>
          This contact is blocked. <button onClick={handleBlock} className="underline">Unblock</button>
        </div>
      )}

      {/* ── Sync result banner ── */}
      {syncCount !== null && (
        <div className="px-4 py-2 text-xs text-center font-medium" style={{ background: '#f0fdf4', color: '#15803d' }}>
          Synced {syncCount} messages from WhatsApp
          <button onClick={() => setSyncCount(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* ── Search bar ── */}
      {showSearch && (
        <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search messages..." className="flex-1 text-xs border rounded px-2 py-1.5 outline-none"
            style={{ borderColor: 'var(--notion-border)' }} autoFocus />
          <button onClick={handleSearch} className="text-xs px-2 py-1 rounded" style={{ background: '#25D366', color: 'white' }}>Search</button>
          {searchResults.length > 0 && (
            <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>
              <span>{searchIdx + 1}/{searchResults.length}</span>
              <button onClick={() => setSearchIdx(Math.max(0, searchIdx - 1))} className="px-1">▲</button>
              <button onClick={() => setSearchIdx(Math.min(searchResults.length - 1, searchIdx + 1))} className="px-1">▼</button>
            </div>
          )}
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
            className="text-xs p-1 hover:bg-gray-100 rounded">✕</button>
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
                const isHighlighted = searchResults.length > 0 && searchResults[searchIdx]?.id === msg.id;

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

          {/* Buttons message */}
          <button type="button" onClick={() => setShowButtonsModal(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-xs" title="Send buttons">
            <HandIcon name="grid" size={16} />
          </button>

          {/* List message */}
          <button type="button" onClick={() => setShowListModal(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-xs" title="Send list">
            <HandIcon name="list" size={16} />
          </button>

          {/* Template */}
          <button type="button" onClick={() => { setShowTemplateModal(true); loadTemplates(); }}
            className="p-2 rounded-lg hover:bg-gray-100 text-xs" title="Templates">
            <HandIcon name="bookmark" size={16} />
          </button>

          {/* Contact card */}
          <button type="button" onClick={() => setShowContactModal(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-xs" title="Send contact">
            👤
          </button>

          {/* Location */}
          <button type="button" onClick={() => setShowLocationModal(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-xs" title="Send location">
            📍
          </button>

          {/* Voice note */}
          {isRecording ? (
            <div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: '#fef2f2' }}>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-mono" style={{ color: '#dc2626' }}>{Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}</span>
              <button type="button" onClick={cancelRecording} className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>✕</button>
              <button type="button" onClick={stopRecordingAndSend} className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: '#25D366' }}>Send</button>
            </div>
          ) : (
            <button type="button" onClick={startRecording}
              className="p-2 rounded-lg hover:bg-gray-100 text-xs" title="Record voice note">
              🎤
            </button>
          )}

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
