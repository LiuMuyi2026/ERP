'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import SlideOver from '@/components/ui/SlideOver';
import WhatsAppChatPanel from './WhatsAppChatPanel';

type Conversation = {
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
  last_message_at?: string;
  last_message_preview?: string;
  unread_count: number;
  is_group?: boolean;
  wa_labels?: string[];
  disappearing_duration?: number;
  group_metadata?: any;
  merge_key?: string;
};

type WaAccount = {
  id: string; display_name?: string; phone_number?: string;
  status?: string; label?: string; wa_jid?: string;
  is_active?: boolean; last_seen_at?: string; created_at?: string;
};
type WaLabel = { id: string; wa_label_id: string; name?: string; color?: string };

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

const ACCOUNT_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  connected: { bg: '#dcfce7', text: '#15803d' },
  disconnected: { bg: '#fef2f2', text: '#dc2626' },
  pending_qr: { bg: '#fef9c3', text: '#a16207' },
};

export default function WhatsAppDashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [labels, setLabels] = useState<WaLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Conversation | null>(null);

  // Account management
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [qrData, setQrData] = useState<{ accountId: string; qr: string } | null>(null);
  const [qrPolling, setQrPolling] = useState(false);

  // Dashboard tabs
  const [dashboardTab, setDashboardTab] = useState<'conversations' | 'groups' | 'monitor'>('conversations');
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [allInstances, setAllInstances] = useState<any[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterLeadStatus, setFilterLeadStatus] = useState('');
  const [filterGroup, setFilterGroup] = useState<'' | 'true' | 'false'>('');
  const [filterLabel, setFilterLabel] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'last_message' | 'unread' | 'lead_status'>('last_message');

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAccount) params.set('account_id', filterAccount);
      if (filterLeadStatus) params.set('lead_status', filterLeadStatus);
      if (filterGroup) params.set('is_group', filterGroup);
      if (filterLabel) params.set('label_id', filterLabel);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (sortBy) params.set('sort_by', sortBy);
      const qs = params.toString();
      const [convs, accs, lbls] = await Promise.all([
        api.get(`/api/whatsapp/dashboard${qs ? `?${qs}` : ''}`),
        api.get('/api/whatsapp/accounts'),
        api.get('/api/whatsapp/labels').catch(() => []),
      ]);
      setConversations(Array.isArray(convs) ? convs : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setLabels(Array.isArray(lbls) ? lbls : []);
    } catch { setConversations([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [filterAccount, filterLeadStatus, filterGroup, filterLabel, dateFrom, dateTo, sortBy]);

  // ── Account management functions ──
  async function createAccount() {
    setCreatingAccount(true);
    try {
      const result: any = await api.post('/api/whatsapp/accounts', { label: newAccountLabel || undefined });
      const accountId = result.id;
      setNewAccountLabel('');
      // Start polling for QR code
      pollQR(accountId);
    } catch (e: any) { alert(e.message || 'Failed to create account'); }
    finally { setCreatingAccount(false); }
  }

  async function pollQR(accountId: string) {
    setQrPolling(true);
    let attempts = 0;
    const poll = async () => {
      if (attempts > 60) { setQrPolling(false); setQrData(null); return; }
      try {
        const result: any = await api.get(`/api/whatsapp/accounts/${accountId}/qr`);
        if (result.status === 'connected') {
          setQrData(null);
          setQrPolling(false);
          loadData();
          return;
        }
        if (result.qr_data) {
          setQrData({ accountId, qr: result.qr_data });
        }
      } catch { /* ignore */ }
      attempts++;
      setTimeout(poll, 3000);
    };
    poll();
  }

  async function reconnectAccount(accountId: string) {
    try {
      await api.post(`/api/whatsapp/accounts/${accountId}/reconnect`, {});
      loadData();
    } catch (e: any) { alert(e.message || 'Reconnect failed'); }
  }

  async function disconnectAccount(accountId: string) {
    if (!confirm('Disconnect this WhatsApp account?')) return;
    try {
      await api.delete(`/api/whatsapp/accounts/${accountId}`);
      loadData();
    } catch (e: any) { alert(e.message || 'Disconnect failed'); }
  }

  const [linkingContact, setLinkingContact] = useState<Conversation | null>(null);

  // Clear unread locally when opening a conversation
  function handleSelectContact(conv: Conversation) {
    setSelectedContact(conv);
    if (conv.unread_count > 0) {
      setConversations(prev =>
        prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
      );
    }
  }

  async function loadAllGroups() {
    setGroupsLoading(true);
    try {
      const groupsByAccount = await Promise.all(
        accounts.filter(a => a.status === 'connected').map(async (acc) => {
          try {
            const data = await api.get(`/api/whatsapp/accounts/${acc.id}/groups`);
            return (Array.isArray(data) ? data : []).map((g: any) => ({ ...g, accountId: acc.id, accountLabel: acc.label || acc.phone_number }));
          } catch { return []; }
        })
      );
      setAllGroups(groupsByAccount.flat());
    } catch { setAllGroups([]); }
    finally { setGroupsLoading(false); }
  }

  async function lookupInviteCode() {
    if (!inviteCodeInput.trim()) return;
    const accountId = accounts.find(a => a.status === 'connected')?.id;
    if (!accountId) { alert('No connected account'); return; }
    try {
      const data = await api.post(`/api/whatsapp/groups/lookup-invite`, { invite_code: inviteCodeInput.trim(), account_id: accountId });
      setInviteInfo(data);
    } catch { setInviteInfo({ error: 'Failed to lookup invite code' }); }
  }

  async function loadAllInstances() {
    setInstancesLoading(true);
    try {
      const data = await api.get('/api/whatsapp/admin/instances');
      setAllInstances(Array.isArray(data) ? data : (data?.instances || []));
    } catch { setAllInstances([]); }
    finally { setInstancesLoading(false); }
  }

  async function healthCheck(accountId: string) {
    try {
      const data = await api.get(`/api/whatsapp/admin/instances/${accountId}/health`);
      alert(JSON.stringify(data, null, 2));
    } catch (e: any) { alert(e.message || 'Health check failed'); }
  }

  useEffect(() => {
    if (dashboardTab === 'groups' && allGroups.length === 0 && accounts.length > 0) loadAllGroups();
    if (dashboardTab === 'monitor' && allInstances.length === 0) loadAllInstances();
  }, [dashboardTab, accounts.length]);

  const filtered = search
    ? conversations.filter(c =>
        (c.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.push_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone_number || '').includes(search) ||
        (c.lead_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.crm_account_name || '').toLowerCase().includes(search.toLowerCase())
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
      {/* Account management bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          {accounts.map(acc => {
            const st = ACCOUNT_STATUS_STYLE[acc.status || 'disconnected'] || ACCOUNT_STATUS_STYLE.disconnected;
            return (
              <div key={acc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: st.text }} />
                <span className="font-medium" style={{ color: 'var(--notion-text)' }}>
                  {acc.label || acc.display_name || acc.phone_number || 'Account'}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>
                  {acc.status || 'disconnected'}
                </span>
                {acc.status === 'disconnected' && (
                  <button onClick={() => reconnectAccount(acc.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                    Reconnect
                  </button>
                )}
                {acc.status === 'connected' && (
                  <button onClick={() => disconnectAccount(acc.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: '#fef2f2', color: '#dc2626' }}>
                    Disconnect
                  </button>
                )}
              </div>
            );
          })}
          {accounts.length === 0 && !loading && (
            <span className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>No WhatsApp accounts connected</span>
          )}
        </div>
        <button onClick={() => setShowAccountPanel(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#25D366' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Account
        </button>
      </div>

      {/* QR Code Modal */}
      {qrData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-full max-w-sm shadow-xl border text-center" style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
            <h3 className="font-semibold mb-2 text-base" style={{ color: 'var(--notion-text)' }}>Scan QR Code</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--notion-text-muted)' }}>Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
            <div className="mx-auto w-64 h-64 rounded-lg overflow-hidden mb-4 flex items-center justify-center" style={{ background: 'white' }}>
              <img src={qrData.qr} alt="QR Code" className="w-full h-full object-contain" />
            </div>
            {qrPolling && (
              <p className="text-xs animate-pulse" style={{ color: '#25D366' }}>Waiting for scan...</p>
            )}
            <button onClick={() => { setQrData(null); setQrPolling(false); }}
              className="mt-3 px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add Account Panel */}
      <SlideOver open={showAccountPanel} onClose={() => setShowAccountPanel(false)} title="WhatsApp Account Management" width="w-[480px]">
        <div className="px-6 py-4 space-y-5">
          {/* Create new */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>Connect New Account</p>
            <div className="flex gap-2">
              <input placeholder="Label (optional)" value={newAccountLabel}
                onChange={e => setNewAccountLabel(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md text-sm outline-none border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              <button onClick={createAccount} disabled={creatingAccount}
                className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#25D366' }}>
                {creatingAccount ? 'Creating...' : 'Connect'}
              </button>
            </div>
          </div>

          {/* Account list */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>Your Accounts ({accounts.length})</p>
            {accounts.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--notion-text-muted)' }}>No accounts yet</p>
            ) : (
              <div className="space-y-2">
                {accounts.map(acc => {
                  const st = ACCOUNT_STATUS_STYLE[acc.status || 'disconnected'] || ACCOUNT_STATUS_STYLE.disconnected;
                  return (
                    <div key={acc.id} className="rounded-lg px-4 py-3 border" style={{ borderColor: 'var(--notion-border)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: st.text }} />
                          <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                            {acc.label || acc.display_name || acc.phone_number || 'Account'}
                          </span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.text }}>
                          {acc.status || 'disconnected'}
                        </span>
                      </div>
                      <div className="text-[11px] space-y-0.5" style={{ color: 'var(--notion-text-muted)' }}>
                        {acc.phone_number && <p>Phone: {acc.phone_number}</p>}
                        {acc.wa_jid && <p>JID: {acc.wa_jid}</p>}
                        {acc.last_seen_at && <p>Last seen: {new Date(acc.last_seen_at).toLocaleString()}</p>}
                      </div>
                      <div className="flex gap-2 mt-2">
                        {acc.status === 'disconnected' && (
                          <button onClick={() => { reconnectAccount(acc.id); setShowAccountPanel(false); }}
                            className="text-xs px-3 py-1 rounded font-medium"
                            style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                            Reconnect
                          </button>
                        )}
                        {acc.status === 'connected' && (
                          <button onClick={() => disconnectAccount(acc.id)}
                            className="text-xs px-3 py-1 rounded font-medium"
                            style={{ background: '#fef2f2', color: '#dc2626' }}>
                            Disconnect
                          </button>
                        )}
                        {acc.status === 'pending_qr' && (
                          <button onClick={() => pollQR(acc.id)}
                            className="text-xs px-3 py-1 rounded font-medium"
                            style={{ background: '#fef9c3', color: '#a16207' }}>
                            Show QR Code
                          </button>
                        )}
                        {acc.status === 'connected' && (
                          <>
                            <button onClick={async () => {
                              try { const r = await api.post(`/api/whatsapp/accounts/${acc.id}/sync-chats`, {}); alert(`Synced ${r.synced} chats`); loadData(); } catch {}
                            }} className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#e0f2f1', color: '#00796b' }}>
                              Sync Chats
                            </button>
                            <button onClick={async () => {
                              try { const r = await api.post(`/api/whatsapp/accounts/${acc.id}/sync-contacts`, {}); alert(`Synced ${r.synced} contacts`); loadData(); } catch {}
                            }} className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#e8eaf6', color: '#3f51b5' }}>
                              Sync Contacts
                            </button>
                            <button onClick={async () => {
                              if (!confirm('Restart this instance?')) return;
                              try { await api.post(`/api/whatsapp/accounts/${acc.id}/restart`, {}); alert('Instance restarted'); loadData(); } catch {}
                            }} className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#fff3e0', color: '#e65100' }}>
                              Restart
                            </button>
                          </>
                        )}
                      </div>

                      {/* Instance Settings (Phase 5.1) */}
                      {acc.status === 'connected' && (
                        <AccountSettingsPanel accountId={acc.id} />
                      )}
                      {/* Webhook Configuration (Phase 5.2) */}
                      {acc.status === 'connected' && (
                        <WebhookConfigPanel accountId={acc.id} />
                      )}
                      {/* My Product Catalog (Phase 5.4) */}
                      {acc.status === 'connected' && (
                        <AccountCatalogPanel accountId={acc.id} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SlideOver>

      {/* Dashboard Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
        {(['conversations', 'groups', 'monitor'] as const).map(tab => (
          <button key={tab} onClick={() => setDashboardTab(tab)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: dashboardTab === tab ? '#25D366' : 'var(--notion-text-muted)',
              borderBottom: dashboardTab === tab ? '2px solid #25D366' : '2px solid transparent',
            }}>
            {tab === 'conversations' ? 'Conversations' : tab === 'groups' ? 'Groups' : 'Instance Monitor'}
          </button>
        ))}
      </div>

      {/* ── Conversations Tab ── */}
      {dashboardTab === 'conversations' && <>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }} />
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
        {/* Group filter */}
        <select value={filterGroup} onChange={e => setFilterGroup(e.target.value as any)}
          className="px-3 py-2 rounded-lg text-sm border outline-none"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}>
          <option value="">All Chats</option>
          <option value="false">Direct Messages</option>
          <option value="true">Groups</option>
        </select>
        {/* Label filter */}
        {labels.length > 0 && (
          <select value={filterLabel} onChange={e => setFilterLabel(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}>
            <option value="">All Labels</option>
            {labels.map(l => (
              <option key={l.id} value={l.wa_label_id}>{l.name || l.wa_label_id}</option>
            ))}
          </select>
        )}
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
            const contactName = conv.display_name || conv.push_name || conv.phone_number || 'Unknown';
            const crmName = conv.crm_account_name || conv.lead_name;
            const isLinked = !!(conv.crm_account_name || conv.lead_name);
            const sc = conv.lead_status ? statusColors[conv.lead_status] : null;
            const labelNames = (conv.wa_labels || []).map(lid => labels.find(l => l.wa_label_id === lid)?.name).filter(Boolean);
            const jidShort = conv.wa_jid?.replace(/@s\.whatsapp\.net$/, '') || '';
            return (
              <div key={conv.id} className="group w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors cursor-pointer"
                style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}
                onClick={() => handleSelectContact(conv)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--notion-card, white)')}>
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden"
                  style={{ background: conv.is_group ? '#128C7E' : '#25D366' }}>
                  {conv.profile_pic_url ? (
                    <img src={conv.profile_pic_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    conv.is_group ? '\uD83D\uDC65' : contactName.charAt(0).toUpperCase()
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {isLinked ? (
                      <span className="text-sm font-semibold truncate" style={{ color: '#15803d' }}>{crmName}</span>
                    ) : (
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{contactName}</span>
                    )}
                    {conv.is_group && (
                      <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: '#e0f2f1', color: '#00796b' }}>Group</span>
                    )}
                    {sc && conv.lead_status && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: sc.bg, color: sc.text }}>
                        {conv.lead_status}
                      </span>
                    )}
                  </div>
                  {/* Identity line: owner → contact · jid */}
                  <div className="flex items-center gap-1 mb-0.5">
                    {conv.owner_name && (
                      <>
                        <span className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>{conv.owner_name}</span>
                        <span className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>&rarr;</span>
                      </>
                    )}
                    {isLinked && (
                      <span className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>{contactName}</span>
                    )}
                    {jidShort && (
                      <>
                        {(conv.owner_name || isLinked) && <span className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>&middot;</span>}
                        <span className="text-[11px]" style={{ color: 'var(--notion-text-muted)', opacity: 0.6 }}>{jidShort}</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>
                    {conv.last_message_preview || 'No messages'}
                  </p>
                  {/* Label badges + link button */}
                  <div className="flex items-center gap-1 mt-0.5">
                    {labelNames.map((ln, i) => (
                      <span key={i} className="text-[9px] px-1 py-0.5 rounded" style={{ background: '#f3e8ff', color: '#7c3aed' }}>{ln}</span>
                    ))}
                    {!isLinked && (
                      <button
                        onClick={e => { e.stopPropagation(); setLinkingContact(conv); }}
                        className="ml-auto text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline mr-0.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        Link
                      </button>
                    )}
                    {isLinked && (
                      <button
                        onClick={e => { e.stopPropagation(); setLinkingContact(conv); }}
                        className="ml-auto text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: '#f0fdf4', color: '#15803d' }}>
                        Linked
                      </button>
                    )}
                  </div>
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
              </div>
            );
          })}
        </div>
      )}

      </>}

      {/* ── Groups Tab ── */}
      {dashboardTab === 'groups' && (
        <div>
          {/* Invite code lookup */}
          <div className="flex gap-2 mb-4">
            <input value={inviteCodeInput} onChange={e => setInviteCodeInput(e.target.value)}
              placeholder="Paste invite code to lookup..."
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }} />
            <button onClick={lookupInviteCode}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#25D366' }}>
              Lookup
            </button>
            <button onClick={loadAllGroups} disabled={groupsLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              {groupsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {/* Invite lookup result */}
          {inviteInfo && (
            <div className="mb-4 p-3 rounded-lg border" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>Invite Lookup Result</span>
                <button onClick={() => setInviteInfo(null)} className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>✕</button>
              </div>
              {inviteInfo.error ? (
                <p className="text-xs" style={{ color: '#dc2626' }}>{inviteInfo.error}</p>
              ) : (
                <div className="text-xs space-y-0.5" style={{ color: 'var(--notion-text)' }}>
                  {inviteInfo.subject && <p><span className="font-medium">Name:</span> {inviteInfo.subject}</p>}
                  {inviteInfo.size && <p><span className="font-medium">Members:</span> {inviteInfo.size}</p>}
                  {inviteInfo.owner && <p><span className="font-medium">Owner:</span> {inviteInfo.owner}</p>}
                  {inviteInfo.desc && <p><span className="font-medium">Description:</span> {inviteInfo.desc}</p>}
                </div>
              )}
            </div>
          )}

          {/* Groups list */}
          {groupsLoading ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading groups...</div>
          ) : allGroups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>No groups found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {allGroups.map((group: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-lg border"
                  style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ background: '#128C7E' }}>
                    {group.profilePictureUrl ? (
                      <img src={group.profilePictureUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : '👥'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>
                      {group.subject || group.id || 'Group'}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>
                      {group.size ? `${group.size} members` : ''}{group.accountLabel ? ` · ${group.accountLabel}` : ''}
                    </p>
                    {group.desc && <p className="text-[10px] truncate" style={{ color: 'var(--notion-text-muted)' }}>{group.desc}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {group.inviteCode && (
                      <button onClick={() => { navigator.clipboard.writeText(group.inviteCode); }}
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{ background: '#e0f2f1', color: '#00796b' }}>
                        Copy Invite
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Instance Monitor Tab ── */}
      {dashboardTab === 'monitor' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>All Instances</span>
            <button onClick={loadAllInstances} disabled={instancesLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              {instancesLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          {instancesLoading ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading instances...</div>
          ) : allInstances.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>No instances found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allInstances.map((inst: any, idx: number) => {
                const status = inst.connectionStatus || inst.status || 'unknown';
                const statusColor = status === 'open' || status === 'connected'
                  ? '#15803d' : status === 'close' || status === 'disconnected'
                  ? '#dc2626' : '#a16207';
                const statusBg = status === 'open' || status === 'connected'
                  ? '#dcfce7' : status === 'close' || status === 'disconnected'
                  ? '#fef2f2' : '#fef9c3';
                return (
                  <div key={idx} className="rounded-lg px-4 py-3 border"
                    style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: statusColor }} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                          {inst.instanceName || inst.name || 'Instance'}
                        </span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: statusBg, color: statusColor }}>
                        {status}
                      </span>
                    </div>
                    <div className="text-[11px] space-y-0.5" style={{ color: 'var(--notion-text-muted)' }}>
                      {inst.owner && <p>Owner: {inst.owner}</p>}
                      {inst.profileName && <p>Name: {inst.profileName}</p>}
                      {inst.number && <p>Phone: {inst.number}</p>}
                      {inst.local_account_id && <p>Local ID: {inst.local_account_id}</p>}
                      {inst.webhook_status && <p>Webhook: {inst.webhook_status}</p>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => healthCheck(inst.local_account_id || inst.instanceName)}
                        className="text-[10px] px-3 py-1 rounded font-medium"
                        style={{ background: '#e0f2f1', color: '#00796b' }}>
                        Health Check
                      </button>
                      {inst.local_account_id && (
                        <button onClick={async () => {
                          if (!confirm('Restart this instance?')) return;
                          try { await api.post(`/api/whatsapp/accounts/${inst.local_account_id}/restart`, {}); alert('Restarted'); loadAllInstances(); } catch {}
                        }} className="text-[10px] px-3 py-1 rounded font-medium"
                          style={{ background: '#fff3e0', color: '#e65100' }}>
                          Restart
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Chat SlideOver */}
      <SlideOver open={!!selectedContact} onClose={() => { setSelectedContact(null); loadData(); }}
        title={selectedContact?.display_name || selectedContact?.push_name || selectedContact?.phone_number || 'Chat'}
        width="w-[560px]">
        {selectedContact && (
          <WhatsAppChatPanel
            contactId={selectedContact.id}
            contactName={selectedContact.display_name || selectedContact.push_name || selectedContact.phone_number}
            profilePicUrl={selectedContact.profile_pic_url}
            isGroup={selectedContact.is_group}
            disappearingDuration={selectedContact.disappearing_duration}
          />
        )}
      </SlideOver>

      {/* CRM Link Modal */}
      {linkingContact && (
        <LinkContactModal
          contact={linkingContact}
          onClose={() => setLinkingContact(null)}
          onLinked={() => { setLinkingContact(null); loadData(); }}
        />
      )}
    </div>
  );
}

// ── Account Instance Settings Panel (Phase 5.1) ──────────────────────────────
function AccountSettingsPanel({ accountId }: { accountId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    try {
      const data = await api.get(`/api/whatsapp/accounts/${accountId}/settings`);
      setSettings(data);
    } catch { setSettings({}); }
  }

  useEffect(() => { if (expanded && !settings) loadSettings(); }, [expanded]);

  async function saveSetting(key: string, value: any) {
    setSaving(true);
    try {
      await api.put(`/api/whatsapp/accounts/${accountId}/settings`, { [key]: value });
      setSettings((prev: any) => ({ ...prev, [key]: value }));
    } catch {}
    finally { setSaving(false); }
  }

  const toggles: { key: string; label: string; evoKey: string }[] = [
    { key: 'always_online', label: 'Always Online', evoKey: 'alwaysOnline' },
    { key: 'read_messages', label: 'Auto-read Messages', evoKey: 'readMessages' },
    { key: 'read_status', label: 'Auto-read Status', evoKey: 'readStatus' },
    { key: 'reject_call', label: 'Reject Calls', evoKey: 'rejectCall' },
    { key: 'groups_ignore', label: 'Ignore Group Messages', evoKey: 'groupsIgnore' },
    { key: 'sync_full_history', label: 'Sync Full History', evoKey: 'syncFullHistory' },
  ];

  return (
    <div className="mt-2">
      <button onClick={() => setExpanded(!expanded)}
        className="text-[10px] font-medium" style={{ color: 'var(--notion-text-muted)' }}>
        {expanded ? '▼' : '▶'} Instance Settings
      </button>
      {expanded && settings && (
        <div className="mt-1 space-y-1 pl-2">
          {toggles.map(t => (
            <label key={t.key} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--notion-text)' }}>
              <input type="checkbox" checked={!!settings[t.evoKey]}
                onChange={e => saveSetting(t.key, e.target.checked)}
                disabled={saving} />
              {t.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Webhook Configuration Panel (Phase 5.2) ──────────────────────────────────
const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE',
  'CONNECTION_UPDATE', 'PRESENCE_UPDATE', 'GROUPS_UPSERT', 'GROUP_PARTICIPANTS_UPDATE',
  'CHATS_SET', 'CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE',
  'CONTACTS_SET', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE',
  'LABELS_EDIT', 'LABELS_ASSOCIATION', 'CALL',
];

function WebhookConfigPanel({ accountId }: { accountId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState('');

  async function loadConfig() {
    try {
      const data = await api.get(`/api/whatsapp/admin/accounts/${accountId}/webhook`);
      setConfig(data);
      setUrl(data?.url || '');
    } catch { setConfig({}); }
  }

  useEffect(() => { if (expanded && !config) loadConfig(); }, [expanded]);

  async function saveWebhook(updates: any) {
    setSaving(true);
    try {
      const result = await api.put(`/api/whatsapp/admin/accounts/${accountId}/webhook`, updates);
      setConfig(result);
    } catch {}
    finally { setSaving(false); }
  }

  function toggleEvent(event: string) {
    const current = config?.events || [];
    const updated = current.includes(event)
      ? current.filter((e: string) => e !== event)
      : [...current, event];
    saveWebhook({ events: updated });
  }

  return (
    <div className="mt-2">
      <button onClick={() => setExpanded(!expanded)}
        className="text-[10px] font-medium" style={{ color: 'var(--notion-text-muted)' }}>
        {expanded ? '▼' : '▶'} Webhook Configuration
      </button>
      {expanded && config && (
        <div className="mt-1 pl-2 space-y-2">
          <div className="flex gap-1">
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder="Webhook URL"
              className="flex-1 text-[10px] px-2 py-1 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            <button onClick={() => saveWebhook({ url })} disabled={saving}
              className="text-[10px] px-2 py-1 rounded font-medium text-white"
              style={{ background: '#25D366' }}>Save</button>
          </div>
          <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--notion-text)' }}>
            <input type="checkbox" checked={!!config.enabled}
              onChange={e => saveWebhook({ enabled: e.target.checked })} disabled={saving} />
            Enabled
          </label>
          <div>
            <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--notion-text)' }}>Subscribed Events:</p>
            <div className="grid grid-cols-2 gap-0.5">
              {WEBHOOK_EVENTS.map(evt => (
                <label key={evt} className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--notion-text)' }}>
                  <input type="checkbox" checked={(config.events || []).includes(evt)}
                    onChange={() => toggleEvent(evt)} disabled={saving} />
                  {evt}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Account Catalog Panel (Phase 5.4) ────────────────────────────────────────
function AccountCatalogPanel({ accountId }: { accountId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [products, setProducts] = useState<any[] | null>(null);

  async function loadCatalog() {
    try {
      const data = await api.get(`/api/whatsapp/accounts/${accountId}/my-catalog`);
      setProducts(Array.isArray(data) ? data : (data?.data || data?.products || []));
    } catch { setProducts([]); }
  }

  useEffect(() => { if (expanded && !products) loadCatalog(); }, [expanded]);

  return (
    <div className="mt-2">
      <button onClick={() => setExpanded(!expanded)}
        className="text-[10px] font-medium" style={{ color: 'var(--notion-text-muted)' }}>
        {expanded ? '▼' : '▶'} My Product Catalog
      </button>
      {expanded && (
        <div className="mt-1 pl-2">
          {products === null ? (
            <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>Loading...</p>
          ) : products.length === 0 ? (
            <p className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>No products found</p>
          ) : (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {products.map((product: any, idx: number) => (
                <div key={idx} className="flex gap-2 p-1.5 rounded border" style={{ borderColor: 'var(--notion-border)' }}>
                  {product.productImage?.imageUrl && (
                    <img src={product.productImage.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium truncate" style={{ color: 'var(--notion-text)' }}>
                      {product.name || product.title || 'Product'}
                    </p>
                    {(product.price || product.priceAmount) && (
                      <p className="text-[9px] font-semibold" style={{ color: '#15803d' }}>
                        {product.currency || ''} {product.price || product.priceAmount}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Link Contact Modal ────────────────────────────────────────────────────────
function LinkContactModal({ contact, onClose, onLinked }: {
  contact: Conversation;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [tab, setTab] = useState<'lead' | 'account'>('lead');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isLinked = !!(contact.lead_id || contact.account_id);
  const currentLink = contact.crm_account_name || contact.lead_name;

  useEffect(() => { setResults([]); setSearch(''); }, [tab]);

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
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>Link to CRM</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>
              {contact.display_name || contact.push_name || contact.phone_number}
            </p>
          </div>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--notion-text-muted)' }}>&times;</button>
        </div>

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

        <div className="px-5 py-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'lead' ? 'Search leads by name, email, phone...' : 'Search accounts by name...'}
            autoFocus
            className="w-full px-3 py-2 rounded-md text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
        </div>

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
