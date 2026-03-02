'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import SlideOver from '@/components/ui/SlideOver';
import WhatsAppChatPanel from './WhatsAppChatPanel';

type Conversation = {
  id: string;
  wa_account_id: string;
  display_name?: string;
  push_name?: string;
  phone_number?: string;
  lead_id?: string;
  lead_name?: string;
  lead_status?: string;
  account_name?: string;
  account_phone?: string;
  owner_name?: string;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count: number;
};

type WaAccount = { id: string; display_name?: string; phone_number?: string };

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function WhatsAppDashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Conversation | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterLeadStatus, setFilterLeadStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'last_message' | 'unread' | 'lead_status'>('last_message');

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAccount) params.set('account_id', filterAccount);
      if (filterLeadStatus) params.set('lead_status', filterLeadStatus);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (sortBy) params.set('sort_by', sortBy);
      const qs = params.toString();
      const [convs, accs] = await Promise.all([
        api.get(`/api/whatsapp/dashboard${qs ? `?${qs}` : ''}`),
        api.get('/api/whatsapp/accounts'),
      ]);
      setConversations(Array.isArray(convs) ? convs : []);
      setAccounts(Array.isArray(accs) ? accs : []);
    } catch { setConversations([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [filterAccount, filterLeadStatus, dateFrom, dateTo, sortBy]);

  const filtered = search
    ? conversations.filter(c =>
        (c.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.push_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone_number || '').includes(search) ||
        (c.lead_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  const statusColors: Record<string, { bg: string; text: string }> = {
    new: { bg: '#dbeafe', text: '#1d4ed8' },
    inquiry: { bg: '#dbeafe', text: '#1d4ed8' },
    engaged: { bg: '#fef9c3', text: '#a16207' },
    qualified: { bg: '#dcfce7', text: '#15803d' },
    quoted: { bg: '#e9d5ff', text: '#7c3aed' },
    negotiating: { bg: '#fce7f3', text: '#be185d' },
    converted: { bg: '#d1fae5', text: '#065f46' },
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }}
          />
        </div>
        {/* Account filter */}
        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border outline-none"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}>
          <option value="">All Accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.display_name || a.phone_number || 'Account'}</option>
          ))}
        </select>
        {/* Lead status */}
        <select value={filterLeadStatus} onChange={e => setFilterLeadStatus(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border outline-none"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}>
          <option value="">All Statuses</option>
          {['new', 'inquiry', 'engaged', 'qualified', 'quoted', 'negotiating', 'converted'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {/* Date range */}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border outline-none"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border outline-none"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }} />
        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="px-3 py-2 rounded-lg text-sm border outline-none"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}>
          <option value="last_message">Latest Message</option>
          <option value="unread">Most Unread</option>
          <option value="lead_status">Lead Status</option>
        </select>
      </div>

      {/* Conversations List */}
      {loading ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading conversations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="mb-3" style={{ color: '#25D366' }}><HandIcon name="chat-bubble" size={48} /></div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--notion-text)' }}>No WhatsApp conversations</p>
          <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
            Connect a WhatsApp account in Settings to start syncing messages.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(conv => {
            const name = conv.display_name || conv.push_name || conv.phone_number || 'Unknown';
            const sc = conv.lead_status ? statusColors[conv.lead_status] : null;
            return (
              <button key={conv.id} onClick={() => setSelectedContact(conv)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors"
                style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--notion-card, white)')}>
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: '#25D366' }}>
                  {name.charAt(0).toUpperCase()}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{name}</span>
                    {conv.lead_name && (
                      <span className="text-xs px-1.5 py-0.5 rounded truncate max-w-[120px]"
                        style={{ background: sc?.bg || '#f3f4f6', color: sc?.text || '#6b7280' }}>
                        {conv.lead_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>
                    {conv.last_message_preview || 'No messages'}
                  </p>
                </div>
                {/* Meta */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>
                    {relativeTime(conv.last_message_at)}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] text-white font-bold px-1.5"
                      style={{ background: '#25D366' }}>
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Chat SlideOver */}
      <SlideOver open={!!selectedContact} onClose={() => setSelectedContact(null)}
        title={selectedContact?.display_name || selectedContact?.push_name || selectedContact?.phone_number || 'Chat'}
        width="w-[560px]">
        {selectedContact && (
          <WhatsAppChatPanel
            contactId={selectedContact.id}
            contactName={selectedContact.display_name || selectedContact.push_name || selectedContact.phone_number}
          />
        )}
      </SlideOver>
    </div>
  );
}
