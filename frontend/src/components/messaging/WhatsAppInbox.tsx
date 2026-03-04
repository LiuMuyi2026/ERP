'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { api } from '@/lib/api';
import { useWhatsAppSocket } from '@/lib/useWhatsAppSocket';
import { useDesktopNotifications } from '@/lib/useDesktopNotifications';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import SlideOver from '@/components/ui/SlideOver';
import WhatsAppChatPanel from './WhatsAppChatPanel';
import WhatsAppBroadcast from './WhatsAppBroadcast';
import { relTime, WA_STATUS_COLORS } from './wa-helpers';

// ── Types ──────────────────────────────────
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
  is_pinned?: boolean;
  is_muted?: boolean;
  wa_labels?: string[];
  disappearing_duration?: number;
  group_metadata?: any;
  merge_key?: string;
  assigned_to?: string;
  assigned_user_name?: string;
};

function parsePreview(raw?: unknown): { text: string; isMe: boolean } {
  if (typeof raw !== 'string' || !raw) return { text: 'No messages', isMe: false };
  const parts = raw.split(':');
  if (parts.length < 3) return { text: raw, isMe: false };
  const direction = parts[0];
  const type = parts[1];
  const content = parts.slice(2).join(':');
  const isMe = direction === 'outbound';

  const mediaLabels: Record<string, string> = {
    image: '\ud83d\udcf7 Photo', video: '\ud83c\udfa5 Video', audio: '\ud83c\udfb5 Audio',
    document: '\ud83d\udcc4 Document', location: '\ud83d\udccd Location',
    contact: '\ud83d\udc64 Contact', sticker: 'Sticker',
  };

  const label = mediaLabels[type];
  const text = label ? label : (content || 'Message');
  return { text, isMe };
}

type WaAccount = {
  id: string; display_name?: string; phone_number?: string;
  status?: string; label?: string; wa_jid?: string;
  is_active?: boolean; last_seen_at?: string; created_at?: string;
};
type WaLabel = { id: string; wa_label_id: string; name?: string; color?: string };

// relTime and WA_STATUS_COLORS imported from wa-helpers
function isSafeImageSrc(src?: unknown): boolean {
  if (typeof src !== 'string' || !src) return false;
  return (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:image/') ||
    src.startsWith('/')
  );
}

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: '#dbeafe', text: '#1d4ed8' },
  inquiry: { bg: '#dbeafe', text: '#1d4ed8' },
  engaged: { bg: '#fef9c3', text: '#a16207' },
  qualified: { bg: '#dcfce7', text: '#15803d' },
  quoted: { bg: '#e9d5ff', text: '#7c3aed' },
  negotiating: { bg: '#fce7f3', text: '#be185d' },
  converted: { bg: '#d1fae5', text: '#065f46' },
};

// ── Account Settings Sub-panels (reused from WhatsAppDashboard) ────────────
function AccountSettingsPanel({ accountId }: { accountId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expanded && !settings) {
      api.get(`/api/whatsapp/accounts/${accountId}/settings`).then(setSettings).catch(() => setSettings({}));
    }
  }, [expanded, accountId, settings]);

  async function saveSetting(key: string, value: any) {
    setSaving(true);
    try {
      await api.put(`/api/whatsapp/accounts/${accountId}/settings`, { [key]: value });
      setSettings((prev: any) => ({ ...prev, [key]: value }));
    } catch (e: any) { console.error('updateSetting:', e); toast.error('Failed to update setting'); }
    finally { setSaving(false); }
  }

  const toggles = [
    { key: 'always_online', label: 'Always Online', evoKey: 'alwaysOnline' },
    { key: 'read_messages', label: 'Auto-read Messages', evoKey: 'readMessages' },
    { key: 'read_status', label: 'Auto-read Status', evoKey: 'readStatus' },
    { key: 'reject_call', label: 'Reject Calls', evoKey: 'rejectCall' },
    { key: 'groups_ignore', label: 'Ignore Group Messages', evoKey: 'groupsIgnore' },
    { key: 'sync_full_history', label: 'Sync Full History', evoKey: 'syncFullHistory' },
  ];

  return (
    <div className="mt-2">
      <button onClick={() => setExpanded(!expanded)} className="text-[10px] font-medium" style={{ color: 'var(--notion-text-muted)' }}>
        {expanded ? '\u25BC' : '\u25B6'} Instance Settings
      </button>
      {expanded && settings && (
        <div className="mt-1 space-y-1 pl-2">
          {toggles.map(t => (
            <label key={t.key} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--notion-text)' }}>
              <input type="checkbox" checked={!!settings[t.evoKey]} onChange={e => saveSetting(t.key, e.target.checked)} disabled={saving} />
              {t.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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

  useEffect(() => {
    if (expanded && !config) {
      api.get(`/api/whatsapp/admin/accounts/${accountId}/webhook`).then(d => { setConfig(d); setUrl(d?.url || ''); }).catch(() => setConfig({}));
    }
  }, [expanded, accountId, config]);

  async function saveWebhook(updates: any) {
    setSaving(true);
    try { const r = await api.put(`/api/whatsapp/admin/accounts/${accountId}/webhook`, updates); setConfig(r); } catch (e: any) { console.error('saveWebhook:', e); toast.error('Failed to save webhook config'); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-2">
      <button onClick={() => setExpanded(!expanded)} className="text-[10px] font-medium" style={{ color: 'var(--notion-text-muted)' }}>
        {expanded ? '\u25BC' : '\u25B6'} Webhook Configuration
      </button>
      {expanded && config && (
        <div className="mt-1 pl-2 space-y-2">
          <div className="flex gap-1">
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Webhook URL"
              className="flex-1 text-[10px] px-2 py-1 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            <button onClick={() => saveWebhook({ url })} disabled={saving}
              className="text-[10px] px-2 py-1 rounded font-medium text-white" style={{ background: '#25D366' }}>Save</button>
          </div>
          <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--notion-text)' }}>
            <input type="checkbox" checked={!!config.enabled} onChange={e => saveWebhook({ enabled: e.target.checked })} disabled={saving} />
            Enabled
          </label>
          <div>
            <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--notion-text)' }}>Subscribed Events:</p>
            <div className="grid grid-cols-2 gap-0.5">
              {WEBHOOK_EVENTS.map(evt => (
                <label key={evt} className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--notion-text)' }}>
                  <input type="checkbox" checked={(config.events || []).includes(evt)}
                    onChange={() => {
                      const current = config?.events || [];
                      saveWebhook({ events: current.includes(evt) ? current.filter((e: string) => e !== evt) : [...current, evt] });
                    }} disabled={saving} />
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

function AccountCatalogPanel({ accountId }: { accountId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [products, setProducts] = useState<any[] | null>(null);

  useEffect(() => {
    if (expanded && !products) {
      api.get(`/api/whatsapp/accounts/${accountId}/my-catalog`)
        .then(d => setProducts(Array.isArray(d) ? d : (d?.data || d?.products || [])))
        .catch(() => setProducts([]));
    }
  }, [expanded, accountId, products]);

  return (
    <div className="mt-2">
      <button onClick={() => setExpanded(!expanded)} className="text-[10px] font-medium" style={{ color: 'var(--notion-text-muted)' }}>
        {expanded ? '\u25BC' : '\u25B6'} My Product Catalog
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
                  {isSafeImageSrc(product.productImage?.imageUrl) && (
                    <Image
                      src={product.productImage.imageUrl}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium truncate" style={{ color: 'var(--notion-text)' }}>{product.name || product.title || 'Product'}</p>
                    {(product.price || product.priceAmount) && (
                      <p className="text-[9px] font-semibold" style={{ color: '#15803d' }}>{product.currency || ''} {product.price || product.priceAmount}</p>
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

// ── Link Contact Modal ─────────────────────────────────────────────────────
function LinkContactModal({ contact, onClose, onLinked, isMobile = false }: {
  contact: Conversation; onClose: () => void; onLinked: () => void; isMobile?: boolean;
}) {
  const tCrm = useTranslations('crm');
  const [tab, setTab] = useState<'lead' | 'account'>('lead');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [users, setUsers] = useState<{ id: string; full_name?: string; email?: string }[]>([]);
  const [ownerUserId, setOwnerUserId] = useState('');
  const [meId, setMeId] = useState('');
  const [isAdminScope, setIsAdminScope] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isLinked = !!(contact.lead_id || contact.account_id);
  const currentLink = contact.crm_account_name || contact.lead_name;

  useEffect(() => { setResults([]); setSearch(''); }, [tab]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await api.get('/api/auth/me').catch(() => null);
        const role = String(me?.role || '').toLowerCase();
        const adminScope = role === 'tenant_admin' || role === 'platform_admin' || role === 'manager' || role === 'admin';
        const allUsers = adminScope ? await api.get('/api/admin/users-lite').catch(() => []) : [];
        if (!mounted) return;
        setIsAdminScope(adminScope);
        setMeId(me?.id || '');
        const list = Array.isArray(allUsers) ? allUsers : (allUsers?.items || []);
        setUsers(adminScope ? list : (me?.id ? [{ id: me.id, full_name: me?.full_name, email: me?.email }] : []));
        const preset = adminScope
          ? (contact.assigned_to || me?.id || list?.[0]?.id || '')
          : (me?.id || '');
        setOwnerUserId(preset);
      } catch {
        if (mounted) {
          setIsAdminScope(false);
          setMeId('');
          setUsers([]);
          setOwnerUserId('');
        }
      }
    })();
    return () => { mounted = false; };
  }, [contact.assigned_to]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const effectiveOwnerId = isAdminScope ? ownerUserId : meId;
    if (tab === 'lead' && !effectiveOwnerId) { setResults([]); return; }
    if (!search.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const endpoint = tab === 'lead'
          ? `/api/crm/leads?search=${encodeURIComponent(search)}&limit=20${effectiveOwnerId ? `&user_id=${encodeURIComponent(effectiveOwnerId)}` : ''}`
          : `/api/crm/accounts?search=${encodeURIComponent(search)}&limit=20${effectiveOwnerId ? `&user_id=${encodeURIComponent(effectiveOwnerId)}` : ''}`;
        const data = await api.get(endpoint);
        const rows = Array.isArray(data) ? data : (data?.items || []);
        if (!isAdminScope && effectiveOwnerId && tab === 'account') {
          setResults(rows.filter((r: any) => (
            String(r?.owner_id || '') === effectiveOwnerId
            || String(r?.created_by || '') === effectiveOwnerId
            || String(r?.assigned_to || '') === effectiveOwnerId
            || String(r?.user_id || '') === effectiveOwnerId
          )));
        } else {
          setResults(rows);
        }
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, tab, ownerUserId, isAdminScope, meId]);

  async function handleLink(targetId: string) {
    setLinking(true);
    try {
      if (tab === 'lead') {
        await api.post(`/api/whatsapp/contacts/${contact.id}/link-lead`, { lead_id: targetId });
      } else {
        await api.post(`/api/whatsapp/contacts/${contact.id}/link-account`, { account_id: targetId });
      }
      onLinked();
    } catch (e: any) { toast.error(e.message || tCrm('waInboxLinkFailed')); }
    finally { setLinking(false); }
  }

  async function handleUnlink() {
    setLinking(true);
    try { await api.post(`/api/whatsapp/contacts/${contact.id}/unlink`, {}); onLinked(); }
    catch (e: any) { toast.error(e.message || tCrm('waInboxUnlinkFailed')); }
    finally { setLinking(false); }
  }

  async function handleCreateAndLink() {
    setLinking(true);
    try {
      const name = contact.push_name || contact.display_name || contact.phone_number || 'Unknown';
      const leadData: any = { full_name: name, source: 'WhatsApp' };
      const effectiveOwnerId = isAdminScope ? ownerUserId : meId;
      if (effectiveOwnerId) leadData.assigned_to = effectiveOwnerId;
      if (contact.phone_number) { leadData.phone = contact.phone_number; leadData.whatsapp = contact.phone_number; }
      const newLead: any = await api.post('/api/crm/leads', leadData);
      const leadId = newLead.id || newLead.lead_id;
      await api.post(`/api/whatsapp/contacts/${contact.id}/link-lead`, { lead_id: leadId });
      toast.success(tCrm('waInboxLeadCreatedAndLinked'));
      onLinked();
    } catch (e: any) { toast.error(e.message || tCrm('waInboxCreateLeadFailed')); }
    finally { setLinking(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div className={`${isMobile ? 'h-[100dvh] max-w-none rounded-none' : 'rounded-xl max-w-md'} w-full shadow-xl border overflow-hidden`}
        style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{tCrm('waInboxLinkToCrm')}</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>
              {contact.display_name || contact.push_name || contact.phone_number}
            </p>
          </div>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--notion-text-muted)' }}>&times;</button>
        </div>

        {isLinked && (
          <div className="px-5 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)', background: '#f0fdf4' }}>
            <span className="text-xs" style={{ color: '#15803d' }}>{tCrm('waInboxCurrentlyLinked')}: <strong>{currentLink}</strong></span>
            <button onClick={handleUnlink} disabled={linking}
              className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>{tCrm('waInboxUnlink')}</button>
          </div>
        )}

        <div className="flex border-b" style={{ borderColor: 'var(--notion-border)' }}>
          {(['lead', 'account'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 text-xs font-medium transition-colors"
              style={{ color: tab === t ? '#1d4ed8' : 'var(--notion-text-muted)', borderBottom: tab === t ? '2px solid #1d4ed8' : '2px solid transparent' }}>
              {t === 'lead' ? tCrm('waInboxLinkLead') : tCrm('waInboxLinkAccount')}
            </button>
          ))}
        </div>

        <div className="px-5 py-3">
          {tab === 'lead' && isAdminScope && (
            <select value={ownerUserId} onChange={e => { setOwnerUserId(e.target.value); setResults([]); }}
              className="w-full px-3 py-2 rounded-md text-sm outline-none border mb-2"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              <option value="">{tCrm('waInboxSelectUserFirst')}</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
              ))}
            </select>
          )}
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'lead'
              ? (isAdminScope ? tCrm('waInboxSearchLeadsByUser') : tCrm('waInboxSearchOwnLeads'))
              : (isAdminScope ? tCrm('waInboxSearchAccountsByName') : tCrm('waInboxSearchOwnAccountsByName'))}
            autoFocus
            className="w-full px-3 py-2 rounded-md text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
        </div>

        <div className="px-5 pb-4 max-h-[300px] overflow-y-auto">
          {searching && <p className="text-xs text-center py-4" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('waInboxSearching')}</p>}
          {!searching && search && results.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('waInboxNoResults')}</p>
          )}
          {results.map(item => (
            <button key={item.id} onClick={() => handleLink(item.id)} disabled={linking}
              className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors"
              style={{ color: 'var(--notion-text)' }}>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{tab === 'lead' ? item.full_name : item.name}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--notion-text-muted)' }}>
                  {tab === 'lead'
                    ? [item.company, item.email, item.phone].filter(Boolean).join(' \u00b7 ')
                    : [item.industry, item.phone_number].filter(Boolean).join(' \u00b7 ')}
                </p>
              </div>
              {tab === 'lead' && item.status && (
                <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#f3f4f6', color: '#6b7280' }}>{item.status}</span>
              )}
            </button>
          ))}
        </div>
        {/* Create new lead and link */}
        <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--notion-border)' }}>
          <button onClick={handleCreateAndLink} disabled={linking}
            className="w-full py-2 rounded-md text-xs font-medium text-white"
            style={{ background: '#008069' }}>
            {linking ? tCrm('waInboxCreating') : tCrm('waInboxCreateLeadAndLink')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Contact Modal ──────────────────────────────────────────────────────
function AddContactModal({ accounts, onClose, onAdded, isMobile = false }: {
  accounts: WaAccount[]; onClose: () => void; onAdded: () => void; isMobile?: boolean;
}) {
  const tCrm = useTranslations('crm');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!phone.trim() || !accountId) return;
    setAdding(true);
    try {
      await api.post('/api/whatsapp/contacts/add', { phone_number: phone.trim(), account_id: accountId, display_name: displayName.trim() || undefined });
      toast.success(tCrm('waInboxAddContact') + ' OK');
      onAdded();
    } catch (e: any) { toast.error(e.message || 'Failed to add contact'); }
    finally { setAdding(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div className={`${isMobile ? 'h-[100dvh] max-w-none rounded-none' : 'rounded-xl max-w-md'} w-full shadow-xl border overflow-hidden`}
        style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{tCrm('waInboxAddContactTitle')}</h3>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--notion-text-muted)' }}>&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('waInboxAddContactAccount')}</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-sm outline-none border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              {accounts.filter(a => a.status === 'connected').map(a => (
                <option key={a.id} value={a.id}>{a.label || a.display_name || a.phone_number || 'Account'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('waInboxAddContactPhone')}</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+1234567890"
              className="w-full px-3 py-2 rounded-md text-sm outline-none border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('waInboxAddContactName')}</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-3 py-2 rounded-md text-sm outline-none border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          </div>
          <button onClick={handleAdd} disabled={adding || !phone.trim() || !accountId}
            className="w-full px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#25D366' }}>
            {adding ? '...' : tCrm('waInboxAddContactVerify')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Contact Modal ──────────────────────────────────────────────────
function AssignContactModal({ contact, onClose, onAssigned, isMobile = false }: {
  contact: Conversation; onClose: () => void; onAssigned: () => void; isMobile?: boolean;
}) {
  const tCrm = useTranslations('crm');
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    api.get('/api/admin/users-lite').then(d => setUsers(Array.isArray(d) ? d : (d?.items || []))).catch(() => setUsers([]));
  }, []);

  const filtered = search
    ? users.filter(u => (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase()))
    : users;

  async function handleAssign(userId: string | null) {
    setAssigning(true);
    try {
      await api.post(`/api/whatsapp/contacts/${contact.id}/assign`, { user_id: userId });
      onAssigned();
    } catch (e: any) { toast.error(e.message || 'Failed to assign'); }
    finally { setAssigning(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div className={`${isMobile ? 'h-[100dvh] max-w-none rounded-none' : 'rounded-xl max-w-md'} w-full shadow-xl border overflow-hidden`}
        style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{tCrm('waInboxAssign')}</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>
              {contact.display_name || contact.push_name || contact.phone_number}
            </p>
          </div>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--notion-text-muted)' }}>&times;</button>
        </div>

        {contact.assigned_user_name && (
          <div className="px-5 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--notion-border)', background: '#f0fdf4' }}>
            <span className="text-xs" style={{ color: '#15803d' }}>{tCrm('waInboxAssigned')}: <strong>{contact.assigned_user_name}</strong></span>
            <button onClick={() => handleAssign(null)} disabled={assigning}
              className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>{tCrm('waInboxUnassign')}</button>
          </div>
        )}

        <div className="px-5 py-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            autoFocus
            className="w-full px-3 py-2 rounded-md text-sm outline-none border"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
        </div>

        <div className="px-5 pb-4 max-h-[300px] overflow-y-auto">
          {filtered.map(u => (
            <button key={u.id} onClick={() => handleAssign(u.id)} disabled={assigning}
              className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors"
              style={{ color: 'var(--notion-text)' }}>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{u.full_name || u.email}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--notion-text-muted)' }}>{u.email}</p>
              </div>
              {contact.assigned_to === u.id && (
                <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>Current</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--notion-text-muted)' }}>No users found</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main WhatsApp Inbox Component ──────────────────────────────────────────
export default function WhatsAppInbox() {
  const tCrm = useTranslations('crm');
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 768px)').matches;
  });

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

  // Filters
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterGroup, setFilterGroup] = useState<'' | 'true' | 'false'>('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterLeadStatus, setFilterLeadStatus] = useState('');

  // Link modal
  const [linkingContact, setLinkingContact] = useState<Conversation | null>(null);

  // Add / Assign / Delete
  const [showAddContact, setShowAddContact] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [assigningContact, setAssigningContact] = useState<Conversation | null>(null);
  const [filterAssigned, setFilterAssigned] = useState('');
  const [allUsers, setAllUsers] = useState<{ id: string; full_name?: string; email?: string }[]>([]);
  const [batchLinking, setBatchLinking] = useState(false);
  const unreadSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [typingByKey, setTypingByKey] = useState<Record<string, boolean>>({});
  const recoveringInvalidRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let cleanup: (() => void) | undefined;
    try {
      const mq = window.matchMedia('(max-width: 768px)');
      const update = () => setIsMobile(mq.matches);
      update();
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', update);
        cleanup = () => mq.removeEventListener('change', update);
      } else if (typeof (mq as any).addListener === 'function') {
        (mq as any).addListener(update);
        cleanup = () => (mq as any).removeListener(update);
      }
    } catch {
      setIsMobile(false);
    }
    return () => cleanup?.();
  }, []);

  async function handleBatchAutoLink() {
    setBatchLinking(true);
    try {
      const res: any = await api.post('/api/whatsapp/contacts/batch-auto-link', {});
      toast.success(`自动匹配完成：${res.linked_count}/${res.total_checked} 个联系人已绑定`);
      if (res.linked_count > 0) loadData();
    } catch (e: any) { toast.error(e.message || 'Auto-link failed'); }
    finally { setBatchLinking(false); }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAccount) params.set('account_id', filterAccount);
      if (filterGroup) params.set('is_group', filterGroup);
      if (filterLabel) params.set('label_id', filterLabel);
      if (filterLeadStatus) params.set('lead_status', filterLeadStatus);
      if (filterAssigned) params.set('assigned_to', filterAssigned);
      params.set('sort_by', 'last_message');
      const qs = params.toString();
      const [convs, accs, lbls] = await Promise.all([
        api.get(`/api/whatsapp/dashboard${qs ? `?${qs}` : ''}`).catch(e => { console.error('dashboard load failed:', e); return []; }),
        api.get('/api/whatsapp/accounts').catch(e => { console.error('accounts load failed:', e); return []; }),
        api.get('/api/whatsapp/labels').catch(e => { console.error('labels load failed:', e); return []; }),
      ]);
      setConversations(Array.isArray(convs) ? convs : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setLabels(Array.isArray(lbls) ? lbls : []);
    } catch { /* all errors handled per-request above */ }
    finally { setLoading(false); }
  }, [filterAccount, filterGroup, filterLabel, filterLeadStatus, filterAssigned]);

  // Load users list for assigned_to filter
  useEffect(() => {
    api.get('/api/admin/users-lite').then(d => setAllUsers(Array.isArray(d) ? d : (d?.items || []))).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── WebSocket real-time updates ──
  const { on: onWsEvent } = useWhatsAppSocket();

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // New message: bump conversation to top, update preview and unread
    unsubs.push(onWsEvent('new_message', (ev) => {
      let needsReload = false;
      setConversations((prev) => {
        // Try exact contact_id match first, then fallback to merge_key
        let idx = prev.findIndex((c) => c.id === ev.contact_id);
        if (idx < 0 && ev.contact_jid) {
          const phone = ev.contact_jid.split('@')[0];
          idx = prev.findIndex((c) => c.merge_key === phone || (c.wa_jid && c.wa_jid.split('@')[0] === phone));
        }
        if (idx >= 0) {
          const updated = { ...prev[idx] };
          const dir = ev.direction || ev.message?.direction || '';
          updated.last_message_preview = `${dir === 'outbound' ? 'outbound' : 'inbound'}:${ev.message?.message_type || 'text'}:${ev.message?.content || ''}`;
          updated.last_message_at = ev.message?.timestamp || new Date().toISOString();
          // Only increment unread if this isn't the currently open chat
          const isOpen = selectedContact && (selectedContact.id === ev.contact_id ||
            (selectedContact.merge_key && ev.contact_jid && selectedContact.merge_key === ev.contact_jid.split('@')[0]));
          if (!isOpen) {
            updated.unread_count = (updated.unread_count || 0) + 1;
            needsReload = true;
          }
          const rest = [...prev];
          rest.splice(idx, 1);
          return [updated, ...rest];
        }
        // New contact not in list — schedule reload outside updater
        needsReload = true;
        return prev;
      });
      // Schedule server reconciliation OUTSIDE of state updater
      if (needsReload) {
        if (unreadSyncTimerRef.current) clearTimeout(unreadSyncTimerRef.current);
        unreadSyncTimerRef.current = setTimeout(() => {
          loadData();
        }, 2000);
      }
    }));

    // Connection status change
    unsubs.push(onWsEvent('connection_update', (ev) => {
      setAccounts((prev) =>
        prev.map((a) => a.id === ev.account_id ? { ...a, status: ev.status } : a)
      );
    }));

    // Typing presence
    unsubs.push(onWsEvent('typing', (ev) => {
      const participant = String(ev?.participant || '');
      const phone = participant.includes('@') ? participant.split('@')[0] : participant;
      const targetKey = phone || String(ev?.contact_id || '');
      if (!targetKey) return;

      if (ev?.state === 'composing') {
        setTypingByKey((prev) => ({ ...prev, [targetKey]: true }));
        if (typingTimersRef.current[targetKey]) {
          clearTimeout(typingTimersRef.current[targetKey]);
        }
        typingTimersRef.current[targetKey] = setTimeout(() => {
          setTypingByKey((prev) => {
            const next = { ...prev };
            delete next[targetKey];
            return next;
          });
          delete typingTimersRef.current[targetKey];
        }, 5000);
      } else if (ev?.state === 'paused' || ev?.state === 'available' || ev?.state === 'unavailable') {
        if (typingTimersRef.current[targetKey]) {
          clearTimeout(typingTimersRef.current[targetKey]);
          delete typingTimersRef.current[targetKey];
        }
        setTypingByKey((prev) => {
          const next = { ...prev };
          delete next[targetKey];
          return next;
        });
      }
    }));

    return () => unsubs.forEach((u) => u());
  }, [onWsEvent, selectedContact, loadData]);

  // ── Desktop notifications ──
  const handleNotificationClick = useCallback((contactId: string) => {
    const conv = conversations.find((c) => c.id === contactId);
    if (conv) setSelectedContact(conv);
  }, [conversations]);
  const { enabled: notifEnabled, toggle: toggleNotif } = useDesktopNotifications(
    selectedContact?.id,
    handleNotificationClick,
  );

  // ── Listen for open-link-modal event from ChatPanel ──
  useEffect(() => {
    function handleOpenLinkModal(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail?.contactId) return;
      const conv = conversations.find(c => c.id === detail.contactId);
      if (conv) setLinkingContact(conv);
    }
    window.addEventListener('open-link-modal', handleOpenLinkModal);
    return () => window.removeEventListener('open-link-modal', handleOpenLinkModal);
  }, [conversations]);

  // ── Account management functions ──
  async function createAccount() {
    setCreatingAccount(true);
    try {
      const result: any = await api.post('/api/whatsapp/accounts', { label: newAccountLabel || undefined });
      setNewAccountLabel('');
      // Start QR polling regardless — bridge may need time to initialize
      pollQR(result.id);
      loadData();
    } catch (e: any) { toast.error(e.message || 'Failed to create account'); }
    finally { setCreatingAccount(false); }
  }

  const [qrError, setQrError] = useState<string | null>(null);

  async function pollQR(accountId: string) {
    setQrPolling(true);
    setQrError(null);
    let attempts = 0;
    let bridgeFailCount = 0;
    const poll = async () => {
      if (attempts > 60) { setQrPolling(false); setQrData(null); setQrError('QR polling timed out'); return; }
      try {
        const result: any = await api.get(`/api/whatsapp/accounts/${accountId}/qr`);
        if (result.status === 'connected') { setQrData(null); setQrPolling(false); setQrError(null); loadData(); return; }
        if (result.status === 'bridge_unavailable') {
          bridgeFailCount++;
          setQrError(result.error || 'WhatsApp Bridge unavailable');
          // Keep retrying but slower — bridge might be starting up
          if (bridgeFailCount > 10) { setQrPolling(false); return; }
          setTimeout(poll, 5000);
          return;
        }
        if (result.status === 'restarting') {
          setQrError('Instance restarting, waiting...');
          setTimeout(poll, 4000);
          attempts++;
          return;
        }
        // Got QR data — clear any previous error
        if (result.qr_data) {
          setQrData({ accountId, qr: result.qr_data });
          setQrError(null);
          bridgeFailCount = 0;
        }
      } catch (e: any) {
        setQrError(e.message || 'Failed to fetch QR');
      }
      attempts++;
      setTimeout(poll, 3000);
    };
    // Show modal immediately with loading state
    setQrData({ accountId, qr: '' });
    poll();
  }

  async function reconnectAccount(accountId: string) {
    try {
      const result: any = await api.post(`/api/whatsapp/accounts/${accountId}/reconnect`, {});
      loadData();
      // Auto-start QR polling after reconnect
      if (result.status === 'pending_qr' || result.ok) {
        pollQR(accountId);
      } else if (result.status === 'bridge_unavailable') {
        toast.error(result.error || 'WhatsApp Bridge unavailable — check Evolution API');
      }
    } catch (e: any) { toast.error(e.message || 'Reconnect failed'); }
  }

  async function disconnectAccount(accountId: string) {
    if (!confirm('Disconnect this WhatsApp account?')) return;
    try { await api.delete(`/api/whatsapp/accounts/${accountId}`); loadData(); }
    catch (e: any) { toast.error(e.message || 'Disconnect failed'); }
  }

  function handleSelectContact(conv: Conversation) {
    setSelectedContact(conv);
    if (conv.unread_count > 0) {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      api.post(`/api/whatsapp/conversations/${conv.id}/read`, {})
        .then(() => loadData())
        .catch(() => loadData());
    }
  }

  const handleConversationInvalid = useCallback(async (invalidContactId?: string, reason?: string) => {
    if (!selectedContact || recoveringInvalidRef.current) return;
    // Ignore stale callback from an old chat panel instance.
    if (invalidContactId && invalidContactId !== selectedContact.id) return;
    recoveringInvalidRef.current = true;
    try {
      const previous = selectedContact;
      const params = new URLSearchParams();
      if (filterAccount) params.set('account_id', filterAccount);
      if (filterGroup) params.set('is_group', filterGroup);
      if (filterLabel) params.set('label_id', filterLabel);
      if (filterLeadStatus) params.set('lead_status', filterLeadStatus);
      if (filterAssigned) params.set('assigned_to', filterAssigned);
      params.set('sort_by', 'last_message');
      const qs = params.toString();
      const convs = await api.get(`/api/whatsapp/dashboard${qs ? `?${qs}` : ''}`).catch(() => []);
      const nextConversations = Array.isArray(convs) ? convs : [];
      setConversations(nextConversations);

      const byId = nextConversations.find((c) => c.id === previous.id);
      const byMerge = previous.merge_key
        ? nextConversations.find((c) => c.merge_key && c.merge_key === previous.merge_key)
        : null;
      const byPhone = previous.phone_number
        ? nextConversations.find((c) => c.phone_number && c.phone_number === previous.phone_number)
        : null;
      const recovered = byId || byMerge || byPhone || null;

      if (recovered) {
        setSelectedContact(recovered);
        if (reason === 'send_404') {
          toast('Conversation refreshed to latest session.');
        }
      } else {
        setSelectedContact(null);
        toast.error('Conversation expired. Please re-open from the list.');
      }
    } finally {
      recoveringInvalidRef.current = false;
    }
  }, [selectedContact, filterAccount, filterGroup, filterLabel, filterLeadStatus, filterAssigned]);

  // Client-side search filtering
  const filtered = search
    ? conversations.filter(c =>
        (c.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.push_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone_number || '').includes(search) ||
        (c.lead_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.crm_account_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  // Flat sorted conversation list — pinned first, then by last message time
  const sortedConvs = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      const aT = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bT = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bT - aT;
    });
  }, [filtered]);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; conv: Conversation } | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  async function handlePin(conv: Conversation) {
    try {
      const res: any = await api.post(`/api/whatsapp/contacts/${conv.id}/pin`, {});
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, is_pinned: res.is_pinned } : c));
    } catch (e: any) { console.error('handlePin:', e); toast.error('Failed to pin'); }
    setCtxMenu(null);
  }

  async function handleMute(conv: Conversation) {
    try {
      const res: any = await api.post(`/api/whatsapp/contacts/${conv.id}/mute`, {});
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, is_muted: res.is_muted } : c));
    } catch (e: any) { console.error('handleMute:', e); toast.error('Failed to mute'); }
    setCtxMenu(null);
  }

  async function handleCtxUnlink(conv: Conversation) {
    setCtxMenu(null);
    try {
      await api.post(`/api/whatsapp/contacts/${conv.id}/unlink`, {});
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, lead_id: undefined, lead_name: undefined, lead_status: undefined, account_id: undefined, crm_account_name: undefined } : c));
      toast.success('已解除绑定');
    } catch (e: any) { toast.error(e.message || 'Unlink failed'); }
  }

  async function handleDeleteContact(conv: Conversation) {
    setCtxMenu(null);
    if (!confirm(tCrm('waInboxDeleteConfirm'))) return;
    const delMsgs = confirm(tCrm('waInboxDeleteMessages') + '?');
    try {
      await api.delete(`/api/whatsapp/contacts/${conv.id}?delete_messages=${delMsgs}`);
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      if (selectedContact?.id === conv.id) setSelectedContact(null);
      toast.success(tCrm('waInboxDeleteContact') + ' OK');
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  }

  return (
    <div className="h-full min-h-0 w-full min-w-0 flex" style={{ background: '#eae6df' }}>
      {/* ── Left Panel: Contact List ── */}
      <div
        className={`flex-col h-full min-h-0 flex-shrink-0 ${isMobile && selectedContact ? 'hidden' : 'flex'} md:flex`}
        style={{
          width: isMobile ? '100%' : 380,
          borderRight: isMobile ? 'none' : '1px solid #d1d7db',
          background: 'white',
        }}
      >
        {/* Header bar — WhatsApp green */}
        <div
          className={`px-3 py-2.5 flex-shrink-0 ${isMobile ? 'flex flex-col gap-2' : 'flex items-center justify-between'}`}
          style={{ background: '#008069' }}
        >
          <div className={`flex items-center gap-2 min-w-0 ${isMobile ? '' : 'flex-1'} overflow-x-auto`}>
            {accounts.map(acc => {
              const isConn = acc.status === 'connected';
              return (
                <div key={acc.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium flex-shrink-0"
                  style={{ background: isConn ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', color: 'white' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: isConn ? '#4ade80' : '#fbbf24' }} />
                  <span className="truncate max-w-[80px]">{acc.label || acc.display_name || acc.phone_number || 'Account'}</span>
                </div>
              );
            })}
            {accounts.length === 0 && !loading && (
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{tCrm('waInboxConnectHint')}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button onClick={() => toggleNotif(!notifEnabled)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
              title={notifEnabled ? 'Notifications on' : 'Notifications off'}>
              {notifEnabled ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              )}
            </button>
            <button onClick={() => setShowAddContact(true)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
              title={tCrm('waInboxAddContact')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button onClick={() => setShowBroadcast(true)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
              title="Broadcast">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/>
                <path d="M16 9a5 5 0 0 1 0 6"/>
                <path d="M19 6a9 9 0 0 1 0 12"/>
              </svg>
            </button>
            <button onClick={() => setShowAccountPanel(true)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
              title={tCrm('waInboxSettings')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="px-2.5 py-2 flex-shrink-0" style={{ background: '#f0f2f5' }}>
          <div className="relative mb-2">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={tCrm('waInboxSearch')}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: 'white', color: '#3b4a54' }} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
              className="px-2 py-1 rounded-full text-[11px] outline-none cursor-pointer"
              style={{ border: '1px solid #d1d7db', color: filterAccount ? '#008069' : '#667781', background: filterAccount ? '#e7fcf5' : 'white' }}>
              <option value="">{tCrm('waInboxAllAccounts')}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label || a.display_name || a.phone_number || 'Account'}</option>)}
            </select>
            <select value={filterGroup} onChange={e => setFilterGroup(e.target.value as any)}
              className="px-2 py-1 rounded-full text-[11px] outline-none cursor-pointer"
              style={{ border: '1px solid #d1d7db', color: filterGroup ? '#008069' : '#667781', background: filterGroup ? '#e7fcf5' : 'white' }}>
              <option value="">{tCrm('waInboxAllChats')}</option>
              <option value="false">{tCrm('waInboxDM')}</option>
              <option value="true">{tCrm('waInboxGroups')}</option>
            </select>
            {labels.length > 0 && (
              <select value={filterLabel} onChange={e => setFilterLabel(e.target.value)}
                className="px-2 py-1 rounded-full text-[11px] outline-none cursor-pointer"
                style={{ border: '1px solid #d1d7db', color: filterLabel ? '#008069' : '#667781', background: filterLabel ? '#e7fcf5' : 'white' }}>
                <option value="">All Labels</option>
                {labels.map(l => <option key={l.id} value={l.wa_label_id}>{l.name || l.wa_label_id}</option>)}
              </select>
            )}
            <select value={filterLeadStatus} onChange={e => setFilterLeadStatus(e.target.value)}
              className="px-2 py-1 rounded-full text-[11px] outline-none cursor-pointer"
              style={{ border: '1px solid #d1d7db', color: filterLeadStatus ? '#008069' : '#667781', background: filterLeadStatus ? '#e7fcf5' : 'white' }}>
              <option value="">{tCrm('waInboxAllStatuses')}</option>
              {['new', 'inquiry', 'engaged', 'qualified', 'quoted', 'negotiating', 'converted'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {allUsers.length > 0 && (
              <select value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}
                className="px-2 py-1 rounded-full text-[11px] outline-none cursor-pointer"
                style={{ border: '1px solid #d1d7db', color: filterAssigned ? '#008069' : '#667781', background: filterAssigned ? '#e7fcf5' : 'white' }}>
                <option value="">{tCrm('waInboxAllUsers')}</option>
                {allUsers.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
            )}
            <button onClick={handleBatchAutoLink} disabled={batchLinking}
              className="px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap"
              style={{ border: '1px solid #d1d7db', color: '#008069', background: '#e7fcf5' }}>
              {batchLinking ? '匹配中...' : '🔗 自动匹配'}
            </button>
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto" style={{ background: 'white' }}>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00a884', borderTopColor: 'transparent' }} />
            </div>
          ) : sortedConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="1" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p className="text-[13px]" style={{ color: '#667781' }}>{tCrm('waInboxNoConvs')}</p>
            </div>
          ) : (
            <>
            {sortedConvs.map(conv => {
              const contactName = conv.display_name || conv.push_name || conv.phone_number || 'Unknown';
              const crmName = conv.crm_account_name || conv.lead_name;
              const isLinked = !!(conv.crm_account_name || conv.lead_name);
              const sc = conv.lead_status ? statusColors[conv.lead_status] : null;
              const isSelected = selectedContact?.id === conv.id;
              const labelIds = Array.isArray(conv.wa_labels) ? conv.wa_labels : [];
              const labelNames = labelIds.map(lid => labels.find(l => l.wa_label_id === lid)?.name).filter(Boolean);
              const hasUnread = conv.unread_count > 0;
              const preview = parsePreview(conv.last_message_preview);
              const typingKey = conv.merge_key || conv.id;
              const isTyping = !!typingByKey[typingKey];

              return (
                <div key={conv.id}
                  className="group flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? '#f0f2f5' : 'transparent',
                    borderBottom: '1px solid #f0f2f5',
                  }}
                  onClick={() => handleSelectContact(conv)}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, conv }); }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f5f6f6'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                  {/* Avatar */}
                  <div className="relative w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden"
                    style={{ background: conv.is_group ? '#00a884' : '#dfe5e7' }}>
                    {isSafeImageSrc(conv.profile_pic_url) ? (
                      <Image
                        src={conv.profile_pic_url as string}
                        alt=""
                        fill
                        unoptimized
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : conv.is_group ? (
                      <svg viewBox="0 0 212 212" width="48" height="48"><path fill="white" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0zm-30 80c11 0 20 9 20 20s-9 20-20 20-20-9-20-20 9-20 20-20zm60 0c11 0 20 9 20 20s-9 20-20 20-20-9-20-20 9-20 20-20zM46 160c.2-13 26-20 30-20s29.8 7 30 20zm60 0c.2-13 26-20 30-20s29.8 7 30 20z"/></svg>
                    ) : (
                      <svg viewBox="0 0 212 212" width="48" height="48"><path fill="#8696a0" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0zm0 50c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zm0 145c-26.5 0-49.9-13.5-63.5-34 .3-21 42.3-32.5 63.5-32.5s63.2 11.5 63.5 32.5C155.9 181.5 132.5 195 106 195z"/></svg>
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] truncate" style={{ color: '#111b21', fontWeight: hasUnread ? 600 : 400 }}>
                        {contactName}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[12px]" style={{ color: hasUnread ? '#00a884' : '#667781' }}>
                          {relTime(conv.last_message_at)}
                        </span>
                      </div>
                    </div>
                    {(isLinked || conv.assigned_user_name) && (
                      <div className="flex items-center gap-1.5 truncate mt-0.5">
                        {isLinked && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: '#e7fcf5', color: '#008069', border: '1px solid #b5f5e0' }}>
                            👤 {crmName}
                          </span>
                        )}
                        {conv.assigned_user_name && (
                          <span className="text-[10px] truncate" style={{ color: '#6366f1' }}>{conv.assigned_user_name}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[13px] truncate flex-1" style={{ color: '#667781', fontWeight: hasUnread ? 500 : 400 }}>
                        {isTyping ? (
                          <span style={{ color: '#00a884', fontWeight: 600 }}>typing...</span>
                        ) : (
                          <>
                            {preview.isMe && <span style={{ color: '#667781' }}>You: </span>}
                            {preview.text}
                          </>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {conv.is_pinned && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#667781"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                        )}
                        {conv.is_muted && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#667781"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                        )}
                        {sc && conv.lead_status && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.text }}>
                            {conv.lead_status}
                          </span>
                        )}
                        {labelNames.length > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: '#e9e2ff', color: '#7c3aed' }}>
                            {labelNames[0]}{labelNames.length > 1 ? ` +${labelNames.length - 1}` : ''}
                          </span>
                        )}
                        {hasUnread && (
                          <span className="min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[11px] text-white font-medium px-1.5"
                            style={{ background: conv.is_muted ? '#8696a0' : '#00a884' }}>
                            {conv.unread_count}
                          </span>
                        )}
                        {!isLinked && !conv.is_group && (
                          <button onClick={e => { e.stopPropagation(); setLinkingContact(conv); }}
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: '#fff7ed', color: '#d97706', border: '1px solid #fed7aa' }}>
                            绑定客户
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Context menu */}
            {ctxMenu && (
              <div
                className="fixed z-50 rounded-lg shadow-lg py-1 min-w-[160px]"
                style={{ left: ctxMenu.x, top: ctxMenu.y, background: 'white', border: '1px solid #e9edef' }}
                onClick={e => e.stopPropagation()}>
                <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f6f6]" style={{ color: '#111b21' }}
                  onClick={() => handlePin(ctxMenu.conv)}>
                  {ctxMenu.conv.is_pinned ? 'Unpin' : 'Pin'} conversation
                </button>
                <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f6f6]" style={{ color: '#111b21' }}
                  onClick={() => handleMute(ctxMenu.conv)}>
                  {ctxMenu.conv.is_muted ? 'Unmute' : 'Mute'} notifications
                </button>
                <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f6f6]" style={{ color: '#111b21' }}
                  onClick={() => { setAssigningContact(ctxMenu.conv); setCtxMenu(null); }}>
                  {ctxMenu.conv.assigned_to ? tCrm('waInboxReassign') : tCrm('waInboxAssign')}
                </button>
                {/* CRM Link/Unlink */}
                {!ctxMenu.conv.is_group && !(ctxMenu.conv.lead_name || ctxMenu.conv.crm_account_name) && (
                  <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f6f6]" style={{ color: '#d97706' }}
                    onClick={() => { setLinkingContact(ctxMenu.conv); setCtxMenu(null); }}>
                    绑定CRM客户
                  </button>
                )}
                {(ctxMenu.conv.lead_name || ctxMenu.conv.crm_account_name) && (
                  <>
                    <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f6f6]" style={{ color: '#008069' }}
                      onClick={() => { handleSelectContact(ctxMenu.conv); setCtxMenu(null); }}>
                      查看CRM客户
                    </button>
                    <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f6f6]" style={{ color: '#dc2626' }}
                      onClick={() => handleCtxUnlink(ctxMenu.conv)}>
                      解除绑定
                    </button>
                  </>
                )}
                <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f6f6]" style={{ color: '#dc2626' }}
                  onClick={() => handleDeleteContact(ctxMenu.conv)}>
                  {tCrm('waInboxDeleteContact')}
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* ── Right Panel: Chat or Empty ── */}
      <div
        className={`flex-1 flex-col h-full min-h-0 min-w-0 ${isMobile && !selectedContact ? 'hidden' : 'flex'} md:flex`}
      >
        {selectedContact ? (
          <div className="flex-1 min-h-0">
            <WhatsAppChatPanel
              key={selectedContact.id}
              contactId={selectedContact.id}
              contactName={selectedContact.display_name || selectedContact.push_name || selectedContact.phone_number}
              profilePicUrl={typeof selectedContact.profile_pic_url === 'string' ? selectedContact.profile_pic_url : undefined}
              isGroup={selectedContact.is_group}
              disappearingDuration={selectedContact.disappearing_duration}
              onBack={isMobile ? () => setSelectedContact(null) : undefined}
              onConversationInvalid={handleConversationInvalid}
              conversation={{
                phone_number: selectedContact.phone_number,
                crm_account_name: selectedContact.crm_account_name,
                lead_name: selectedContact.lead_name,
                lead_status: selectedContact.lead_status,
                display_name: selectedContact.display_name,
              }}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{
            background: '#f0f2f5',
            borderBottom: '6px solid #00a884',
          }}>
            <svg width={isMobile ? 240 : 340} height={isMobile ? 140 : 200} viewBox="0 0 340 200" fill="none">
              <rect x="70" y="20" width="200" height="160" rx="10" fill="#d9fdd3" opacity="0.5"/>
              <circle cx="170" cy="80" r="35" fill="#00a884" opacity="0.15"/>
              <path d="M155 80 l10 10 l20-20" stroke="#00a884" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <rect x="120" y="130" width="100" height="8" rx="4" fill="#c4c4c4" opacity="0.4"/>
              <rect x="140" y="145" width="60" height="6" rx="3" fill="#c4c4c4" opacity="0.3"/>
            </svg>
            <div className="text-center">
              <p className={isMobile ? 'text-[22px] font-light' : 'text-[28px] font-light'} style={{ color: '#41525d' }}>{tCrm('waInboxEmpty')}</p>
              <p className={isMobile ? 'text-[12px] mt-2 px-4' : 'text-[14px] mt-2'} style={{ color: '#667781' }}>{tCrm('waInboxEmptyHint')}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-2" style={{ color: '#8696a0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span className="text-[12px]">End-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Account Management SlideOver ── */}
      <SlideOver open={showAccountPanel} onClose={() => setShowAccountPanel(false)} title={tCrm('waInboxSettings')} width={isMobile ? 'w-full' : 'w-[480px]'}>
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
                  const st = WA_STATUS_COLORS[acc.status || 'disconnected'] || WA_STATUS_COLORS.disconnected;
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
                        {acc.status !== 'connected' && (
                          <button onClick={() => { reconnectAccount(acc.id); setShowAccountPanel(false); }}
                            className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Reconnect</button>
                        )}
                        {acc.status === 'connected' && (
                          <button onClick={() => disconnectAccount(acc.id)}
                            className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>Disconnect</button>
                        )}
                        {(acc.status === 'pending_qr' || acc.status === 'connecting') && (
                          <button onClick={() => pollQR(acc.id)}
                            className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#fef9c3', color: '#a16207' }}>Show QR Code</button>
                        )}
                        {acc.status === 'connected' && (
                          <>
                            <button onClick={async () => {
                              try { const r = await api.post(`/api/whatsapp/accounts/${acc.id}/sync-chats`, {}); toast.success(`Synced ${r.synced} chats`); loadData(); } catch (e) { console.error('sync-chats:', e); }
                            }} className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#e0f2f1', color: '#00796b' }}>Sync Chats</button>
                            <button onClick={async () => {
                              try { const r = await api.post(`/api/whatsapp/accounts/${acc.id}/sync-contacts`, {}); toast.success(`Synced ${r.synced} contacts`); loadData(); } catch (e) { console.error('sync-contacts:', e); }
                            }} className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#e8eaf6', color: '#3f51b5' }}>Sync Contacts</button>
                            <button onClick={async () => {
                              if (!confirm('Restart this instance?')) return;
                              try { await api.post(`/api/whatsapp/accounts/${acc.id}/restart`, {}); toast.success('Instance restarted'); loadData(); } catch (e) { console.error('restart:', e); }
                            }} className="text-xs px-3 py-1 rounded font-medium" style={{ background: '#fff3e0', color: '#e65100' }}>Restart</button>
                          </>
                        )}
                      </div>
                      {acc.status === 'connected' && <AccountSettingsPanel accountId={acc.id} />}
                      {acc.status === 'connected' && <WebhookConfigPanel accountId={acc.id} />}
                      {acc.status === 'connected' && <AccountCatalogPanel accountId={acc.id} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SlideOver>

      {/* QR Code Modal */}
      {qrData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            className={`${isMobile ? 'h-[100dvh] max-w-none rounded-none p-4' : 'rounded-xl p-6 max-w-sm'} w-full shadow-xl border text-center`}
            style={{ background: 'var(--notion-card, white)', borderColor: 'var(--notion-border)' }}
          >
            <h3 className="font-semibold mb-2 text-base" style={{ color: 'var(--notion-text)' }}>Scan QR Code</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--notion-text-muted)' }}>Open WhatsApp on your phone &rarr; Settings &rarr; Linked Devices &rarr; Link a Device</p>
            <div className="mx-auto w-64 h-64 rounded-lg overflow-hidden mb-4 flex items-center justify-center" style={{ background: 'white' }}>
              {isSafeImageSrc(qrData.qr) ? (
                <Image
                  src={qrData.qr}
                  alt="QR Code"
                  width={256}
                  height={256}
                  unoptimized
                  className="w-full h-full object-contain"
                />
              ) : qrError ? (
                <div className="flex flex-col items-center gap-2 px-4">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                  </svg>
                  <p className="text-xs text-center" style={{ color: '#dc2626' }}>{qrError}</p>
                </div>
              ) : qrData.qr ? (
                <div className="flex flex-col items-center gap-2 px-4">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                  </svg>
                  <p className="text-xs text-center" style={{ color: '#dc2626' }}>Invalid QR image format</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#25D366', borderTopColor: 'transparent' }} />
                  <p className="text-xs" style={{ color: '#8696a0' }}>Connecting to WhatsApp...</p>
                </div>
              )}
            </div>
            {qrPolling && !qrError && qrData.qr && <p className="text-xs animate-pulse" style={{ color: '#25D366' }}>Waiting for scan...</p>}
            {qrError && qrPolling && <p className="text-xs animate-pulse" style={{ color: '#a16207' }}>Retrying...</p>}
            {qrError && !qrPolling && (
              <button onClick={() => pollQR(qrData.accountId)}
                className="mt-2 px-4 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: '#25D366' }}>
                Retry
              </button>
            )}
            <button onClick={() => { setQrData(null); setQrPolling(false); setQrError(null); }}
              className="mt-3 px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>Close</button>
          </div>
        </div>
      )}

      {/* CRM Link Modal */}
      {linkingContact && (
        <LinkContactModal
          contact={linkingContact}
          isMobile={isMobile}
          onClose={() => setLinkingContact(null)}
          onLinked={() => { setLinkingContact(null); loadData(); }}
        />
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <AddContactModal
          accounts={accounts}
          isMobile={isMobile}
          onClose={() => setShowAddContact(false)}
          onAdded={() => { setShowAddContact(false); loadData(); }}
        />
      )}

      {/* Assign Contact Modal */}
      {assigningContact && (
        <AssignContactModal
          contact={assigningContact}
          isMobile={isMobile}
          onClose={() => setAssigningContact(null)}
          onAssigned={() => { setAssigningContact(null); loadData(); }}
        />
      )}

      {showBroadcast && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowBroadcast(false)}>
          <div
            className={`w-full max-w-6xl overflow-hidden shadow-2xl bg-white flex flex-col ${isMobile ? 'h-[100dvh] max-w-none rounded-none' : 'h-[90vh] rounded-2xl'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: '#e5e7eb' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#111b21' }}>WhatsApp Broadcast</h3>
              <button onClick={() => setShowBroadcast(false)} className="p-1.5 rounded hover:bg-gray-100" title="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <WhatsAppBroadcast />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
