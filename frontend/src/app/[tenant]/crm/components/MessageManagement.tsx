'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import SlideOver from '@/components/ui/SlideOver';
import { useTranslations } from 'next-intl';
import { relTime, absTime } from '@/components/messaging/wa-helpers';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type CommItem = {
  id: string;
  source: 'interaction' | 'whatsapp_message' | 'email';
  channel: string;
  direction: string;
  content: string;
  timestamp: string;
  owner_user_id?: string;
  created_by?: string;
  created_by_name?: string;
  account_id?: string;
  account_name?: string;
  lead_id?: string;
  lead_name?: string;
  lead_company?: string;
  message_type?: string;
  media_url?: string;
  status?: string;
  wa_contact_id?: string;
  thread_key?: string;
  thread_label?: string;
};

/** Aggregated WhatsApp conversation — one row per contact */
type WaGroup = {
  _grouped: true;
  wa_contact_id: string;
  contact_name: string;
  company?: string;
  lead_id?: string;
  message_count: number;
  last_message: string;
  last_direction: string;
  last_timestamp: string;
  items: CommItem[];
};

/** A display row is either a single CommItem or a grouped WA conversation */
type DisplayRow = (CommItem & { _grouped?: false }) | WaGroup;

type ViewMode = 'timeline' | 'list' | 'by_lead';

type CHConfig = Record<string, { icon: string; label: string; color: string; bg: string; border: string }>;

/* ------------------------------------------------------------------ */
/* Channel config                                                      */
/* ------------------------------------------------------------------ */

function getCH(t: any): CHConfig {
  return {
    email:       { icon: 'envelope',     label: t('chEmail'),      color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd' },
    whatsapp:    { icon: 'chat-bubble',  label: t('chWhatsApp'),   color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
    call:        { icon: 'phone',        label: t('chCall'),       color: '#c2410c', bg: '#fff7ed', border: '#fdba74' },
    meeting:     { icon: 'handshake',    label: t('chMeeting'),    color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
    note:        { icon: 'document-pen', label: t('chNote'),       color: '#374151', bg: '#f9fafb', border: '#d1d5db' },
    feishu:      { icon: 'kite',         label: t('chFeishu'),     color: '#3370FF', bg: '#EEF3FF', border: '#A3BBFF' },
    dingtalk:    { icon: 'bell',         label: t('chDingtalk'),   color: '#1677FF', bg: '#E8F3FF', border: '#91CAFF' },
    wechat_work: { icon: 'briefcase',    label: t('chWechatWork'), color: '#07C160', bg: '#E8FFF0', border: '#7DE8A8' },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// relTime and absTime imported from wa-helpers

function dateLabel(ts: string) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = today.getTime() - target.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
}

/* ------------------------------------------------------------------ */
/* WaChatView — WhatsApp-style chat bubbles                            */
/* ------------------------------------------------------------------ */

function WaChatView({ items, contactName, maxItems = 50, compact = true }: { items: CommItem[]; contactName: string; maxItems?: number; compact?: boolean }) {
  const sorted = useMemo(() => {
    const arr = [...items].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return arr.slice(-maxItems);
  }, [items, maxItems]);

  let lastDate = '';

  return (
    <div className="flex flex-col gap-1 py-3 px-4 overflow-y-auto" style={{ ...(compact ? { maxHeight: 400 } : {}), background: '#efeae2' }}>
      {sorted.map(msg => {
        const msgDate = new Date(msg.timestamp).toLocaleDateString();
        const showDate = msgDate !== lastDate;
        lastDate = msgDate;
        const isInbound = msg.direction === 'inbound';
        return (
          <Fragment key={msg.id}>
            {showDate && (
              <div className="flex justify-center my-2">
                <span className="text-[11px] px-3 py-1 rounded-full shadow-sm" style={{ background: '#d1e7dd', color: '#4a5568' }}>
                  {dateLabel(msg.timestamp)}
                </span>
              </div>
            )}
            <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
              <div className="max-w-[75%] px-3 py-1.5 text-[13px]"
                style={{
                  background: isInbound ? '#ffffff' : '#d9fdd3',
                  borderRadius: isInbound ? '0 8px 8px 8px' : '8px 0 8px 8px',
                  boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
                }}>
                {isInbound && (
                  <div className="text-[11px] font-medium mb-0.5" style={{ color: '#00a884' }}>
                    {contactName}
                  </div>
                )}
                <p style={{ color: '#111b21', wordBreak: 'break-word' }}>{msg.content}</p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span className="text-[10px]" style={{ color: '#667781' }}>
                    {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!isInbound && msg.status && (
                    <span className="text-[10px]" style={{ color: msg.status === 'read' ? '#53bdeb' : '#667781' }}>
                      {msg.status === 'read' || msg.status === 'delivered' ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function MessageManagement() {
  const t = useTranslations('customer360');
  const tCrm = useTranslations('crm');
  const tMsg = useTranslations('msgMgmt');
  const CH = getCH(t);

  /* Data */
  const [items, setItems] = useState<CommItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  /* Filters */
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [direction, setDirection] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');
  const [isAdminScope, setIsAdminScope] = useState(false);
  const [users, setUsers] = useState<{ id: string; full_name?: string; email?: string }[]>([]);
  const [userFilter, setUserFilter] = useState('');

  /* View */
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  /* Detail SlideOver */
  const [detailItem, setDetailItem] = useState<CommItem | null>(null);

  /* Expanded WA conversations — track which wa_contact_id are expanded inline */
  const [expandedWa, setExpandedWa] = useState<Set<string>>(new Set());

  /* Chat SlideOver */
  const [chatContact, setChatContact] = useState<WaGroup | null>(null);
  const [chatMessages, setChatMessages] = useState<CommItem[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  /* Customer linking */
  const [linkingItem, setLinkingItem] = useState<CommItem | null>(null);
  const [linkAccountSearch, setLinkAccountSearch] = useState('');
  const [linkAccountResults, setLinkAccountResults] = useState<any[]>([]);
  const [linkLeadSearch, setLinkLeadSearch] = useState('');
  const [linkLeadResults, setLinkLeadResults] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);
  const [selectedLead, setSelectedLead] = useState<{ id: string; full_name: string; company?: string } | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  useEffect(() => {
    api.get('/api/auth/me')
      .then((u: any) => {
        const admin = !!(u?.is_admin || ['tenant_admin', 'platform_admin', 'manager'].includes(u?.role));
        setIsAdminScope(admin);
        if (admin) {
          api.get('/api/admin/users-lite')
            .then((d: any) => setUsers(Array.isArray(d) ? d : (d?.items || [])))
            .catch(() => setUsers([]));
        }
      })
      .catch(() => {
        setIsAdminScope(false);
      });
  }, []);

  /* ---- Load data ---- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(pageSize),
        sort_by: sortBy,
      };
      if (search) params.search = search;
      if (channel) params.channel = channel;
      if (direction) params.direction = direction;
      if (source) params.source = source;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (isAdminScope && userFilter) params.user_id = userFilter;

      const qs = new URLSearchParams(params).toString();
      const data = await api.get(`/api/crm/communications?${qs}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, channel, direction, source, dateFrom, dateTo, sortBy, isAdminScope, userFilter]);

  useEffect(() => { load(); }, [load]);

  /* ---- Debounced search ---- */
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /* ---- Fetch full chat messages for SlideOver ---- */
  useEffect(() => {
    if (!chatContact) { setChatMessages([]); return; }
    setChatLoading(true);
    api.get(`/api/whatsapp/conversations/${chatContact.wa_contact_id}/messages?limit=200`)
      .then((data: any) => {
        const msgs: CommItem[] = (data.messages || data || []).map((m: any) => ({
          id: m.id,
          source: 'whatsapp_message' as const,
          channel: 'whatsapp',
          direction: m.direction,
          content: m.content || m.body || '',
          timestamp: m.timestamp || m.created_at,
          message_type: m.message_type,
          media_url: m.media_url,
          status: m.status,
          wa_contact_id: chatContact.wa_contact_id,
        }));
        setChatMessages(msgs);
      })
      .catch(() => setChatMessages(chatContact.items))
      .finally(() => setChatLoading(false));
  }, [chatContact]);

  /* ---- Active filter count (excluding default source) ---- */
  const activeFilters = [channel, direction, source !== 'interaction' ? source : '', dateFrom, dateTo].filter(Boolean).length;

  /* ---- Aggregate WhatsApp messages by contact ---- */
  const displayRows = useMemo<DisplayRow[]>(() => {
    const nonWa: CommItem[] = [];
    const waMap = new Map<string, CommItem[]>();

    for (const item of items) {
      if (item.source === 'whatsapp_message' && item.wa_contact_id) {
        const key = item.wa_contact_id;
        if (!waMap.has(key)) waMap.set(key, []);
        waMap.get(key)!.push(item);
      } else {
        nonWa.push(item);
      }
    }

    const rows: DisplayRow[] = [...nonWa];

    waMap.forEach((msgs, contactId) => {
      // Sort messages newest-first within each group
      msgs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const latest = msgs[0];
      rows.push({
        _grouped: true,
        wa_contact_id: contactId,
        contact_name: latest.lead_name || contactId,
        company: latest.lead_company,
        lead_id: latest.lead_id,
        message_count: msgs.length,
        last_message: latest.content,
        last_direction: latest.direction,
        last_timestamp: latest.timestamp,
        items: msgs,
      });
    });

    // Sort all rows by timestamp descending
    rows.sort((a, b) => {
      const tsA = a._grouped ? a.last_timestamp : a.timestamp;
      const tsB = b._grouped ? b.last_timestamp : b.timestamp;
      if (sortBy === 'time_asc') return new Date(tsA).getTime() - new Date(tsB).getTime();
      return new Date(tsB).getTime() - new Date(tsA).getTime();
    });

    return rows;
  }, [items, sortBy]);

  /* ---- Grouping helpers for views ---- */
  const groupedByDate = displayRows.reduce<Record<string, DisplayRow[]>>((acc, row) => {
    const ts = row._grouped ? row.last_timestamp : row.timestamp;
    const label = dateLabel(ts);
    if (!acc[label]) acc[label] = [];
    acc[label].push(row);
    return acc;
  }, {});

  const groupedByLead = displayRows.reduce<Record<string, DisplayRow[]>>((acc, row) => {
    const key = row._grouped
      ? (row.contact_name || row.wa_contact_id)
      : (row.lead_name || row.lead_id || row.thread_label || row.account_name || row.account_id || 'Unknown');
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const totalPages = Math.ceil(total / pageSize);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-4">

      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--notion-text)' }}>
            {'通讯记录'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#8696a0' }}>
            {total} {tCrm('totalRecords')}
          </p>
        </div>

        {/* Source toggle — switch between manual, auto, email, and all */}
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: '#f0f2f5' }}>
          {([
            ['interaction', tMsg('srcManual') || '手动记录'],
            ['whatsapp_message', tMsg('srcAuto') || '自动记录(WA)'],
            ['email', tMsg('srcEmail') || '邮件'],
            ['', tMsg('all') || '全部'],
          ] as const).map(([key, label]) => (
            <button key={key}
              onClick={() => { setSource(key); setPage(1); }}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
              style={{
                background: source === key ? 'white' : 'transparent',
                color: source === key ? '#111b21' : '#8696a0',
                boxShadow: source === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Toolbar ===== */}
      <div className="flex items-center gap-2 flex-wrap pb-3" style={{ borderBottom: '1px solid #e5e7eb' }}>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={tMsg('searchPlaceholder')}
            className="w-full text-[13px] pl-8 pr-3 py-2 rounded-lg outline-none"
            style={{ border: '1px solid #e5e7eb', color: '#111b21', background: 'white' }}
          />
        </div>

        {/* Channel filter */}
        <select value={channel} onChange={e => { setChannel(e.target.value); setPage(1); }}
          className="px-2.5 py-2 rounded-lg text-[12px] outline-none cursor-pointer"
          style={{
            border: `1px solid ${channel ? '#00a884' : '#e5e7eb'}`,
            color: channel ? '#00a884' : '#667781',
            background: channel ? '#e7fcf5' : 'white',
          }}>
          <option value="">{tMsg('filterChannel')}: {tMsg('all')}</option>
          {Object.entries(CH).map(([k, cfg]) => (
            <option key={k} value={k}>{cfg.label}</option>
          ))}
        </select>

        {/* Direction filter */}
        <select value={direction} onChange={e => { setDirection(e.target.value); setPage(1); }}
          className="px-2.5 py-2 rounded-lg text-[12px] outline-none cursor-pointer"
          style={{
            border: `1px solid ${direction ? '#00a884' : '#e5e7eb'}`,
            color: direction ? '#00a884' : '#667781',
            background: direction ? '#e7fcf5' : 'white',
          }}>
          <option value="">{tMsg('filterDirection')}: {tMsg('all')}</option>
          <option value="outbound">{t('dirOutbound')}</option>
          <option value="inbound">{t('dirInbound')}</option>
        </select>

        {isAdminScope && (
          <select value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1); }}
            className="px-2.5 py-2 rounded-lg text-[12px] outline-none cursor-pointer"
            style={{
              border: `1px solid ${userFilter ? '#00a884' : '#e5e7eb'}`,
              color: userFilter ? '#00a884' : '#667781',
              background: userFilter ? '#e7fcf5' : 'white',
            }}>
            <option value="">{tMsg('all') || '全部用户'}</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
            ))}
          </select>
        )}

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="text-[12px] px-2 py-1.5 rounded-lg outline-none"
            style={{ border: '1px solid #e5e7eb', color: '#667781' }} />
          <span className="text-xs" style={{ color: '#8696a0' }}>–</span>
          <input type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="text-[12px] px-2 py-1.5 rounded-lg outline-none"
            style={{ border: '1px solid #e5e7eb', color: '#667781' }} />
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 ml-auto rounded-lg p-0.5" style={{ background: '#f0f2f5' }}>
          {([
            { key: 'timeline' as ViewMode, icon: 'clock', label: tMsg('viewTimeline') },
            { key: 'list' as ViewMode, icon: 'bars-3', label: tMsg('viewList') },
            { key: 'by_lead' as ViewMode, icon: 'user-group', label: tMsg('viewByLead') },
          ]).map(vm => (
            <button key={vm.key}
              onClick={() => setViewMode(vm.key)}
              title={vm.label}
              className="p-1.5 rounded-md transition-all"
              style={{
                background: viewMode === vm.key ? 'white' : 'transparent',
                color: viewMode === vm.key ? '#111b21' : '#8696a0',
                boxShadow: viewMode === vm.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>
              <HandIcon name={vm.icon} size={14} />
            </button>
          ))}
        </div>

        {/* Sort */}
        <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}
          className="px-2.5 py-2 rounded-lg text-[12px] outline-none cursor-pointer"
          style={{ border: '1px solid #e5e7eb', color: '#667781', background: 'white' }}>
          <option value="time_desc">{tMsg('sortNewest')}</option>
          <option value="time_asc">{tMsg('sortOldest')}</option>
          <option value="lead_name_asc">{tMsg('sortLeadAsc')}</option>
          <option value="lead_name_desc">{tMsg('sortLeadDesc')}</option>
        </select>
      </div>

      {/* ===== Active filter chips ===== */}
      {activeFilters > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {channel && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer"
              style={{ background: '#e7fcf5', color: '#00a884' }}
              onClick={() => { setChannel(''); setPage(1); }}>
              {CH[channel]?.label || channel}
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>
            </span>
          )}
          {direction && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer"
              style={{ background: '#e7fcf5', color: '#00a884' }}
              onClick={() => { setDirection(''); setPage(1); }}>
              {direction === 'inbound' ? t('dirInbound') : t('dirOutbound')}
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer"
              style={{ background: '#e7fcf5', color: '#00a884' }}
              onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
              {dateFrom || '...'} – {dateTo || '...'}
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>
            </span>
          )}
          <button onClick={() => { setChannel(''); setDirection(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="text-[11px] hover:underline" style={{ color: '#8696a0' }}>
            {tMsg('clearAll')}
          </button>
        </div>
      )}

      {/* ===== Loading ===== */}
      {loading && (
        <div className="py-20 text-center">
          <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mb-2" style={{ borderColor: '#00a884', borderTopColor: 'transparent' }} />
          <p className="text-[13px]" style={{ color: '#8696a0' }}>{tCrm('loadingText')}</p>
        </div>
      )}

      {/* ===== Empty ===== */}
      {!loading && displayRows.length === 0 && (
        <div className="py-20 text-center">
          <svg className="mx-auto mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p className="text-[14px]" style={{ color: '#667781' }}>{t('noInteractions')}</p>
          <p className="text-[12px] mt-1" style={{ color: '#8696a0' }}>
            {source === 'interaction' ? '暂无手动记录' : source === 'whatsapp_message' ? '暂无自动记录' : source === 'email' ? '暂无邮件记录' : '暂无通讯记录'}
          </p>
        </div>
      )}

      {/* ===== Timeline view (default) ===== */}
      {!loading && displayRows.length > 0 && viewMode === 'timeline' && (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([label, dateRows]) => (
            <div key={label}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[13px] font-semibold" style={{ color: '#111b21' }}>{label}</span>
                <div className="flex-1 h-px" style={{ background: '#e5e7eb' }} />
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#f0f2f5', color: '#667781' }}>
                  {dateRows.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {dateRows.map(row => {
                  if (row._grouped) {
                    const isExpanded = expandedWa.has(row.wa_contact_id);
                    return (
                      <div key={`wa-${row.wa_contact_id}`}>
                        {/* Grouped WA conversation row */}
                        <div
                          className="flex gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                          onClick={() => setChatContact(row)}>
                          <div className="flex flex-col items-center pt-0.5">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ background: '#dcfce7', border: '1.5px solid #86efac' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="#15803d">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[13px] font-medium" style={{ color: '#111b21' }}>
                                {row.contact_name}
                              </span>
                              {row.company && (
                                <span className="text-[11px]" style={{ color: '#8696a0' }}>{row.company}</span>
                              )}
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#15803d' }}>
                                WA · {row.message_count} 条
                              </span>
                              <span className="text-[11px] ml-auto flex-shrink-0" style={{ color: '#8696a0' }} title={absTime(row.last_timestamp)}>
                                {relTime(row.last_timestamp)}
                              </span>
                              <button onClick={(e) => { e.stopPropagation(); setExpandedWa(prev => { const next = new Set(prev); next.has(row.wa_contact_id) ? next.delete(row.wa_contact_id) : next.add(row.wa_contact_id); return next; }); }}
                                className="p-1 -m-1 rounded hover:bg-black/5">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round"
                                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                                  <path d="M3 4.5l3 3 3-3"/>
                                </svg>
                              </button>
                            </div>
                            <p className="text-[13px] truncate" style={{ color: '#3b4a54' }}>
                              {row.last_direction === 'outbound' ? '↗ ' : '↙ '}
                              {row.last_message.slice(0, 150)}{row.last_message.length > 150 ? '...' : ''}
                            </p>
                          </div>
                        </div>
                        {/* Expanded chat preview */}
                        {isExpanded && (
                          <div className="ml-11 rounded-lg overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
                            <WaChatView items={row.items} contactName={row.contact_name} maxItems={50} />
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Regular CommItem row
                  const item = row;
                  const cfg = CH[item.channel] ?? CH.note;
                  return (
                    <div key={item.id}
                      className="flex gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                      onClick={() => setDetailItem(item)}>
                      <div className="flex flex-col items-center pt-0.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
                          <HandIcon name={cfg.icon} size={14} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] font-medium" style={{ color: '#111b21' }}>
                            {item.lead_name || '—'}
                          </span>
                          {item.lead_company && (
                            <span className="text-[11px]" style={{ color: '#8696a0' }}>{item.lead_company}</span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{
                              background: item.direction === 'inbound' ? '#dcfce7' : '#dbeafe',
                              color: item.direction === 'inbound' ? '#15803d' : '#1d4ed8',
                            }}>
                            {item.direction === 'inbound' ? '↙ ' + t('dirInbound') : '↗ ' + t('dirOutbound')}
                          </span>
                          <span className="text-[11px] ml-auto flex-shrink-0" style={{ color: '#8696a0' }} title={absTime(item.timestamp)}>
                            {relTime(item.timestamp)}
                          </span>
                        </div>
                        <p className="text-[13px] truncate" style={{ color: '#3b4a54' }}>
                          {item.content.slice(0, 150)}{item.content.length > 150 ? '...' : ''}
                        </p>
                        {item.created_by_name && (
                          <span className="text-[11px] mt-0.5 inline-block" style={{ color: '#8696a0' }}>
                            by {item.created_by_name}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== List view ===== */}
      {!loading && displayRows.length > 0 && viewMode === 'list' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                {[t('thChannel'), tCrm('colLead'), t('thDirection'), t('thContentSummary'), t('thTime')].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8696a0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => {
                if (row._grouped) {
                  const isExpanded = expandedWa.has(row.wa_contact_id);
                  return (
                    <Fragment key={`wa-${row.wa_contact_id}`}>
                      <tr className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setChatContact(row)}
                        style={{ borderBottom: '1px solid #f0f2f5' }}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#dcfce7' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="#15803d">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </span>
                            <span className="text-[12px] font-medium" style={{ color: '#15803d' }}>WhatsApp</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[13px] font-medium" style={{ color: '#111b21' }}>{row.contact_name}</span>
                          {row.company && <span className="text-[11px] ml-1.5" style={{ color: '#8696a0' }}>{row.company}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#15803d' }}>
                            {row.message_count} 条
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-md">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[13px] truncate" style={{ color: '#3b4a54' }}>
                              {row.last_direction === 'outbound' ? '↗ ' : '↙ '}{row.last_message.slice(0, 100)}
                            </p>
                            <button onClick={(e) => { e.stopPropagation(); setExpandedWa(prev => { const next = new Set(prev); next.has(row.wa_contact_id) ? next.delete(row.wa_contact_id) : next.add(row.wa_contact_id); return next; }); }}
                              className="p-1 -m-1 rounded hover:bg-black/5 flex-shrink-0">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                                <path d="M3 4.5l3 3 3-3"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: '#8696a0' }} title={absTime(row.last_timestamp)}>
                          {relTime(row.last_timestamp)}
                        </td>
                      </tr>
                      {/* Expanded chat preview */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <WaChatView items={row.items} contactName={row.contact_name} maxItems={50} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }

                const item = row;
                const cfg = CH[item.channel] ?? CH.note;
                return (
                  <tr key={item.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setDetailItem(item)}
                    style={{ borderBottom: idx < displayRows.length - 1 ? '1px solid #f0f2f5' : 'none' }}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: cfg.bg }}>
                          <HandIcon name={cfg.icon} size={12} />
                        </span>
                        <span className="text-[12px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          {item.lead_name ? (
                            <span>
                              <span className="text-[13px] font-medium" style={{ color: '#111b21' }}>{item.lead_name}</span>
                              {(item.lead_company || item.account_name) && (
                                <span className="text-[11px] ml-1.5" style={{ color: '#8696a0' }}>{item.lead_company || item.account_name}</span>
                              )}
                            </span>
                          ) : item.account_name ? (
                            <span>
                              <span className="text-[13px] font-medium" style={{ color: '#111b21' }}>{item.account_name}</span>
                              <span className="text-[11px] ml-1.5" style={{ color: '#8696a0' }}>未关联线索</span>
                            </span>
                          ) : (
                            <span className="text-[12px]" style={{ color: '#9ca3af' }}>未关联</span>
                          )}
                        </span>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setLinkingItem(item);
                          setLinkAccountSearch('');
                          setLinkLeadSearch('');
                          setLinkAccountResults([]);
                          setLinkLeadResults([]);
                          setSelectedAccount(item.account_id ? { id: item.account_id, name: item.account_name || '已关联客户' } : null);
                          setSelectedLead(item.lead_id ? { id: item.lead_id, full_name: item.lead_name || '已关联线索', company: item.lead_company } : null);
                        }}
                          className="text-[11px] px-2 py-1 rounded border hover:bg-gray-50 whitespace-nowrap"
                          style={{ borderColor: '#d1d5db', color: '#4338ca' }}>
                          {item.lead_name || item.account_name ? '调整关联' : (tMsg('linkCustomer') || '关联客户')}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: item.direction === 'inbound' ? '#dcfce7' : '#dbeafe',
                          color: item.direction === 'inbound' ? '#15803d' : '#1d4ed8',
                        }}>
                        {item.direction === 'inbound' ? '↙' : '↗'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <p className="text-[13px] truncate" style={{ color: '#3b4a54' }}>{item.content.slice(0, 100)}</p>
                    </td>
                    <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: '#8696a0' }} title={absTime(item.timestamp)}>
                      {relTime(item.timestamp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== By Lead view ===== */}
      {!loading && displayRows.length > 0 && viewMode === 'by_lead' && (
        <div className="space-y-4">
          {Object.entries(groupedByLead).map(([leadName, groupRows]) => {
            const firstRow = groupRows[0];
            const company = firstRow?._grouped ? firstRow.company : firstRow?.lead_company;
            return (
              <div key={leadName} className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#00a884' }}>
                    {leadName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[14px] font-semibold" style={{ color: '#111b21' }}>{leadName}</span>
                    {company && <span className="text-[12px] ml-2" style={{ color: '#8696a0' }}>{company}</span>}
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#f0f2f5', color: '#667781' }}>
                    {groupRows.length}
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: '#f0f2f5' }}>
                  {groupRows.map(row => {
                    if (row._grouped) {
                      const isExpanded = expandedWa.has(row.wa_contact_id);
                      return (
                        <div key={`wa-${row.wa_contact_id}`}>
                          <div
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => setChatContact(row)}>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#dcfce7' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="#15803d">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>
                              WA · {row.message_count} 条
                            </span>
                            <p className="text-[13px] truncate flex-1" style={{ color: '#3b4a54' }}>
                              {row.last_direction === 'outbound' ? '↗ ' : '↙ '}{row.last_message.slice(0, 100)}
                            </p>
                            <span className="text-[11px] flex-shrink-0" style={{ color: '#8696a0' }}>{relTime(row.last_timestamp)}</span>
                            <button onClick={(e) => { e.stopPropagation(); setExpandedWa(prev => { const next = new Set(prev); next.has(row.wa_contact_id) ? next.delete(row.wa_contact_id) : next.add(row.wa_contact_id); return next; }); }}
                              className="p-1 -m-1 rounded hover:bg-black/5 flex-shrink-0">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                                <path d="M3 4.5l3 3 3-3"/>
                              </svg>
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="ml-7 rounded-lg overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
                              <WaChatView items={row.items} contactName={row.contact_name} maxItems={50} />
                            </div>
                          )}
                        </div>
                      );
                    }

                    const item = row;
                    const cfg = CH[item.channel] ?? CH.note;
                    return (
                      <div key={item.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setDetailItem(item)}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: cfg.bg }}>
                          <HandIcon name={cfg.icon} size={12} />
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{
                            background: item.direction === 'inbound' ? '#dcfce7' : '#dbeafe',
                            color: item.direction === 'inbound' ? '#15803d' : '#1d4ed8',
                          }}>
                          {item.direction === 'inbound' ? '↙' : '↗'}
                        </span>
                        <p className="text-[13px] truncate flex-1" style={{ color: '#3b4a54' }}>{item.content.slice(0, 100)}</p>
                        <span className="text-[11px] flex-shrink-0" style={{ color: '#8696a0' }}>{relTime(item.timestamp)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Pagination ===== */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-4">
          <button onClick={() => setPage(1)} disabled={page <= 1}
            className="px-2 py-1.5 rounded-md text-xs" style={{ color: page <= 1 ? '#d1d5db' : '#667781' }}>«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-2 py-1.5 rounded-md text-xs" style={{ color: page <= 1 ? '#d1d5db' : '#667781' }}>‹</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) pageNum = i + 1;
            else if (page <= 3) pageNum = i + 1;
            else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
            else pageNum = page - 2 + i;
            return (
              <button key={pageNum} onClick={() => setPage(pageNum)}
                className="w-8 h-8 rounded-lg text-[12px] font-medium transition-colors"
                style={{
                  background: page === pageNum ? '#00a884' : 'transparent',
                  color: page === pageNum ? '#fff' : '#667781',
                }}>
                {pageNum}
              </button>
            );
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-2 py-1.5 rounded-md text-xs" style={{ color: page >= totalPages ? '#d1d5db' : '#667781' }}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}
            className="px-2 py-1.5 rounded-md text-xs" style={{ color: page >= totalPages ? '#d1d5db' : '#667781' }}>»</button>
        </div>
      )}

      {/* ===== WA Chat SlideOver ===== */}
      <SlideOver open={!!chatContact} onClose={() => setChatContact(null)}
        title={chatContact?.contact_name || 'WhatsApp'}>
        {chatContact && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid #e5e7eb', background: '#00a884' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'rgba(255,255,255,0.2)' }}>
                {chatContact.contact_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-[14px] font-semibold text-white">{chatContact.contact_name}</div>
                {chatContact.company && (
                  <div className="text-[12px] text-white/80">{chatContact.company}</div>
                )}
              </div>
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full text-white/90" style={{ background: 'rgba(255,255,255,0.2)' }}>
                {chatLoading ? '...' : `${(chatMessages.length || chatContact.message_count)} 条消息`}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ background: '#efeae2' }}>
              {chatLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00a884', borderTopColor: 'transparent' }} />
                </div>
              ) : (
                <WaChatView items={chatMessages.length > 0 ? chatMessages : chatContact.items} contactName={chatContact.contact_name} maxItems={200} compact={false} />
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* ===== Detail SlideOver ===== */}
      <SlideOver open={!!detailItem} onClose={() => setDetailItem(null)}
        title={detailItem ? (CH[detailItem.channel]?.label || detailItem.channel) : ''}>
        {detailItem && (
          <div className="p-5 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: (CH[detailItem.channel] ?? CH.note).bg, border: `1.5px solid ${(CH[detailItem.channel] ?? CH.note).border}` }}>
                <HandIcon name={(CH[detailItem.channel] ?? CH.note).icon} size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold" style={{ color: '#111b21' }}>
                  {detailItem.lead_name || '—'}
                </div>
                {detailItem.lead_company && (
                  <div className="text-[12px]" style={{ color: '#8696a0' }}>{detailItem.lead_company}</div>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] font-medium block mb-0.5" style={{ color: '#8696a0' }}>{tMsg('filterChannel')}</span>
                <span className="text-[13px]" style={{ color: '#111b21' }}>{(CH[detailItem.channel] ?? CH.note).label}</span>
              </div>
              <div>
                <span className="text-[11px] font-medium block mb-0.5" style={{ color: '#8696a0' }}>{tMsg('filterDirection')}</span>
                <span className="text-[13px]" style={{ color: '#111b21' }}>
                  {detailItem.direction === 'inbound' ? t('dirInbound') : t('dirOutbound')}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium block mb-0.5" style={{ color: '#8696a0' }}>{t('thTime')}</span>
                <span className="text-[13px]" style={{ color: '#111b21' }}>{absTime(detailItem.timestamp)}</span>
              </div>
              {detailItem.created_by_name && (
                <div>
                  <span className="text-[11px] font-medium block mb-0.5" style={{ color: '#8696a0' }}>{tMsg('createdBy')}</span>
                  <span className="text-[13px]" style={{ color: '#111b21' }}>{detailItem.created_by_name}</span>
                </div>
              )}
            </div>

            {/* Content */}
            <div>
              <span className="text-[11px] font-medium block mb-1" style={{ color: '#8696a0' }}>{t('thContentSummary')}</span>
              <div className="text-[14px] p-4 rounded-lg leading-relaxed"
                style={{ background: '#f9fafb', color: '#111b21', border: '1px solid #e5e7eb' }}>
                {detailItem.content}
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* ── Link to Customer Modal ── */}
      {linkingItem && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
          onClick={() => setLinkingItem(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#3b4a54' }}>
              {tMsg('linkCustomer') || '关联客户'}
            </h3>
            <div className="space-y-2 mb-3">
              <div className="text-xs font-medium" style={{ color: '#667781' }}>1. 选择客户</div>
              <input type="text" value={linkAccountSearch}
                onChange={async (e) => {
                  const q = e.target.value;
                  setLinkAccountSearch(q);
                  if (q.length < 2) { setLinkAccountResults([]); return; }
                  try {
                    const data = await api.get(`/api/crm/accounts?search=${encodeURIComponent(q)}`);
                    setLinkAccountResults(Array.isArray(data) ? data : []);
                  } catch { setLinkAccountResults([]); }
                }}
                placeholder={'搜索客户公司...'}
                className="w-full text-sm border rounded-lg px-3 py-2 outline-none"
                style={{ borderColor: '#e5e7eb' }} />
              {selectedAccount && (
                <div className="text-xs rounded-lg px-2.5 py-1.5" style={{ background: '#f3f4f6', color: '#374151' }}>
                  已选客户: {selectedAccount.name}
                </div>
              )}
              <div className="max-h-24 overflow-auto space-y-1">
                {linkAccountResults.slice(0, 8).map((acc: any) => (
                  <button key={acc.id}
                    onClick={() => {
                      setSelectedAccount({ id: acc.id, name: acc.name });
                      setLinkAccountSearch(acc.name || '');
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                    <div className="font-medium" style={{ color: '#3b4a54' }}>{acc.name}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium" style={{ color: '#667781' }}>2. 选择线索（可选）</div>
              <input type="text" value={linkLeadSearch}
                onChange={async (e) => {
                  const q = e.target.value;
                  setLinkLeadSearch(q);
                  if (q.length < 2) { setLinkLeadResults([]); return; }
                  try {
                    const data = await api.get(`/api/crm/leads?search=${encodeURIComponent(q)}&limit=20`);
                    const leads = Array.isArray(data) ? data : (data?.items || []);
                    if (selectedAccount?.name) {
                      const key = selectedAccount.name.toLowerCase();
                      setLinkLeadResults(leads.filter((l: any) => String(l.company || '').toLowerCase().includes(key)));
                    } else {
                      setLinkLeadResults(leads);
                    }
                  } catch { setLinkLeadResults([]); }
                }}
                placeholder={tMsg('searchLeads') || '搜索线索...'}
                className="w-full text-sm border rounded-lg px-3 py-2 outline-none"
                style={{ borderColor: '#e5e7eb' }} />
              {selectedLead && (
                <div className="text-xs rounded-lg px-2.5 py-1.5" style={{ background: '#f3f4f6', color: '#374151' }}>
                  已选线索: {selectedLead.full_name}{selectedLead.company ? ` · ${selectedLead.company}` : ''}
                </div>
              )}
              <div className="max-h-28 overflow-auto space-y-1">
                {linkLeadResults.slice(0, 10).map((lead: any) => (
                  <button key={lead.id}
                    onClick={() => {
                      setSelectedLead({ id: lead.id, full_name: lead.full_name, company: lead.company });
                      if (!selectedAccount && lead.company) {
                        setSelectedAccount({ id: '', name: lead.company });
                      }
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                    <div className="font-medium" style={{ color: '#3b4a54' }}>{lead.full_name}</div>
                    {lead.company && (
                      <div className="text-xs" style={{ color: '#8696a0' }}>{lead.company}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <button onClick={async () => {
                setLinkLoading(true);
                try {
                  await api.patch(`/api/crm/communications/${linkingItem.id}/link`, {
                    source: linkingItem.source,
                    account_id: '',
                    lead_id: '',
                  });
                  setLinkingItem(null);
                  load();
                } catch (e: any) {
                  alert(e.message || 'Failed');
                } finally {
                  setLinkLoading(false);
                }
              }}
                disabled={linkLoading}
                className="text-xs py-2 rounded-lg border"
                style={{ borderColor: '#fecaca', color: '#b91c1c' }}>
                清空关联
              </button>
              <button onClick={() => setLinkingItem(null)}
                className="text-xs py-2 rounded-lg border"
                style={{ borderColor: '#e5e7eb', color: '#667781' }}>
                {tMsg('cancel') || '取消'}
              </button>
              <button onClick={async () => {
                setLinkLoading(true);
                try {
                  await api.patch(`/api/crm/communications/${linkingItem.id}/link`, {
                    source: linkingItem.source,
                    account_id: selectedAccount?.id || '',
                    lead_id: selectedLead?.id || '',
                  });
                  setLinkingItem(null);
                  load();
                } catch (e: any) {
                  alert(e.message || 'Failed');
                } finally {
                  setLinkLoading(false);
                }
              }}
                disabled={linkLoading}
                className="text-xs py-2 rounded-lg border text-white"
                style={{ borderColor: '#4338ca', background: '#4338ca' }}>
                保存关联
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
