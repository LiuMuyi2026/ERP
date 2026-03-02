'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import SlideOver from '@/components/ui/SlideOver';
import { useTranslations } from 'next-intl';
import WhatsAppChatPanel from './WhatsAppChatPanel';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type CommItem = {
  id: string;
  source: 'interaction' | 'whatsapp_message';
  channel: string;
  direction: string;
  content: string;
  timestamp: string;
  created_by_name?: string;
  lead_id?: string;
  lead_name?: string;
  lead_company?: string;
  message_type?: string;
  media_url?: string;
  status?: string;
  wa_contact_id?: string;
};

type ViewMode = 'list' | 'by_lead' | 'by_channel' | 'timeline' | 'card';

type SortOption = {
  key: string;
  label: string;
  icon: string;
};

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
    note:        { icon: 'document-pen', label: t('chNote'),       color: '#374151', bg: 'var(--notion-hover)', border: '#D0CFC9' },
    feishu:      { icon: 'kite',         label: t('chFeishu'),     color: '#3370FF', bg: '#EEF3FF', border: '#A3BBFF' },
    dingtalk:    { icon: 'bell',         label: t('chDingtalk'),   color: '#1677FF', bg: '#E8F3FF', border: '#91CAFF' },
    wechat_work: { icon: 'briefcase',    label: t('chWechatWork'), color: '#07C160', bg: '#E8FFF0', border: '#7DE8A8' },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function relTime(ts: string) {
  if (!ts) return '';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function absTime(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

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
/* Reusable style constants (matching workspace pattern)               */
/* ------------------------------------------------------------------ */

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 10px', fontSize: 12, fontWeight: 500,
  borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'all 0.15s',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', fontSize: 11, fontWeight: 500, borderRadius: 6,
  background: 'rgba(124,58,237,0.08)', color: '#7c3aed',
  cursor: 'pointer',
};

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
  const [messageType, setMessageType] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');

  /* View */
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  /* Dropdowns */
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  /* WhatsApp SlideOver */
  const [waSlideOpen, setWaSlideOpen] = useState(false);
  const [waContactId, setWaContactId] = useState('');
  const [waContactName, setWaContactName] = useState('');

  /* Detail SlideOver */
  const [detailItem, setDetailItem] = useState<CommItem | null>(null);

  /* ---- Close dropdowns on outside click ---- */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
      if (messageType) params.message_type = messageType;
      if (status) params.status = status;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const qs = new URLSearchParams(params).toString();
      const data = await api.get(`/api/crm/communications?${qs}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, channel, direction, source, messageType, status, dateFrom, dateTo, sortBy]);

  useEffect(() => { load(); }, [load]);

  /* ---- Debounced search ---- */
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /* ---- Active filter count ---- */
  const activeFilters = [channel, direction, source, messageType, status, dateFrom, dateTo].filter(Boolean).length;

  /* ---- Sort options ---- */
  const sortOptions: SortOption[] = [
    { key: 'time_desc',       label: tMsg('sortNewest'),      icon: '↓' },
    { key: 'time_asc',        label: tMsg('sortOldest'),      icon: '↑' },
    { key: 'lead_name_asc',   label: tMsg('sortLeadAsc'),     icon: '↑' },
    { key: 'lead_name_desc',  label: tMsg('sortLeadDesc'),    icon: '↓' },
    { key: 'channel_asc',     label: tMsg('sortChannelAsc'),  icon: '↑' },
    { key: 'channel_desc',    label: tMsg('sortChannelDesc'), icon: '↓' },
  ];
  const activeSortLabel = sortOptions.find(o => o.key === sortBy)?.label || tMsg('sortNewest');

  /* ---- View mode options ---- */
  const viewModes: { key: ViewMode; label: string; icon: string }[] = [
    { key: 'list',       label: tMsg('viewList'),       icon: 'bars-3' },
    { key: 'timeline',   label: tMsg('viewTimeline'),   icon: 'clock' },
    { key: 'card',       label: tMsg('viewCard'),       icon: 'squares-2x2' },
    { key: 'by_lead',    label: tMsg('viewByLead'),     icon: 'user-group' },
    { key: 'by_channel', label: tMsg('viewByChannel'),  icon: 'funnel' },
  ];

  /* ---- Helpers ---- */
  const totalPages = Math.ceil(total / pageSize);

  const groupedByLead = viewMode === 'by_lead'
    ? items.reduce<Record<string, CommItem[]>>((acc, item) => {
        const key = item.lead_name || item.lead_id || 'Unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {})
    : {};

  const groupedByChannel = viewMode === 'by_channel'
    ? items.reduce<Record<string, CommItem[]>>((acc, item) => {
        if (!acc[item.channel]) acc[item.channel] = [];
        acc[item.channel].push(item);
        return acc;
      }, {})
    : {};

  const groupedByDate = viewMode === 'timeline'
    ? items.reduce<Record<string, CommItem[]>>((acc, item) => {
        const label = dateLabel(item.timestamp);
        if (!acc[label]) acc[label] = [];
        acc[label].push(item);
        return acc;
      }, {})
    : {};

  function handleRowClick(item: CommItem) {
    if (item.source === 'whatsapp_message' && item.wa_contact_id) {
      setWaContactName(item.lead_name || '');
      setWaContactId(item.wa_contact_id);
      setWaSlideOpen(true);
    } else {
      setDetailItem(item);
    }
  }

  function clearAllFilters() {
    setChannel(''); setDirection(''); setSource('');
    setMessageType(''); setStatus(''); setDateFrom(''); setDateTo('');
    setPage(1);
  }

  /* ---- Filter chip labels ---- */
  function getFilterChips(): { key: string; label: string; onClear: () => void }[] {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (channel) chips.push({ key: 'ch', label: CH[channel]?.label || channel, onClear: () => { setChannel(''); setPage(1); } });
    if (direction) chips.push({ key: 'dir', label: direction === 'inbound' ? t('dirInbound') : t('dirOutbound'), onClear: () => { setDirection(''); setPage(1); } });
    if (source) chips.push({ key: 'src', label: source === 'interaction' ? tMsg('srcLog') : 'WhatsApp', onClear: () => { setSource(''); setPage(1); } });
    if (messageType) chips.push({ key: 'mt', label: messageType, onClear: () => { setMessageType(''); setPage(1); } });
    if (status) chips.push({ key: 'st', label: status, onClear: () => { setStatus(''); setPage(1); } });
    if (dateFrom) chips.push({ key: 'df', label: `${tMsg('from')} ${dateFrom}`, onClear: () => { setDateFrom(''); setPage(1); } });
    if (dateTo) chips.push({ key: 'dt', label: `${tMsg('to')} ${dateTo}`, onClear: () => { setDateTo(''); setPage(1); } });
    return chips;
  }

  /* ================================================================ */
  /*  Render helpers                                                   */
  /* ================================================================ */

  function StatusBadge({ item }: { item: CommItem }) {
    if (item.source !== 'whatsapp_message' || !item.status) return null;
    const map: Record<string, { icon: string; color: string }> = {
      sent:      { icon: '✓',  color: '#9B9A97' },
      delivered: { icon: '✓✓', color: '#9B9A97' },
      read:      { icon: '✓✓', color: '#1d4ed8' },
      failed:    { icon: '✕',  color: '#dc2626' },
    };
    const cfg = map[item.status];
    if (!cfg) return null;
    return <span style={{ fontSize: 10, color: cfg.color, marginLeft: 4 }}>{cfg.icon}</span>;
  }

  function SourceBadge({ item }: { item: CommItem }) {
    const isWa = item.source === 'whatsapp_message';
    return (
      <span style={{
        fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
        background: isWa ? '#f0fdf4' : '#f3f4f6',
        color: isWa ? '#15803d' : '#6b7280',
      }}>
        {isWa ? 'WA' : tMsg('srcLog')}
      </span>
    );
  }

  /* ---- Table row ---- */
  function renderRow(item: CommItem, idx: number, arr: CommItem[]) {
    const cfg = CH[item.channel] ?? CH.note;
    return (
      <tr key={item.id}
        className="hover:bg-[var(--notion-hover)] transition-colors cursor-pointer"
        onClick={() => handleRowClick(item)}
        style={{ borderBottom: idx < arr.length - 1 ? '1px solid var(--notion-border)' : 'none' }}>
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <HandIcon name={cfg.icon} size={14} />
            <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
          </span>
        </td>
        <td className="px-4 py-2.5">
          <div className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>
            {item.lead_name || '\u2014'}
          </div>
          {item.lead_company && (
            <div className="text-[10px]" style={{ color: '#9B9A97' }}>{item.lead_company}</div>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              background: item.direction === 'inbound' ? '#f0fdf4' : '#eff6ff',
              color: item.direction === 'inbound' ? '#15803d' : '#1d4ed8',
            }}>
            {item.direction === 'inbound' ? `↙ ${t('dirInbound')}` : `↗ ${t('dirOutbound')}`}
          </span>
        </td>
        <td className="px-4 py-2.5 max-w-sm">
          <div className="flex items-center gap-1.5">
            <SourceBadge item={item} />
            <p className="text-xs truncate" style={{ color: 'var(--notion-text)' }}>
              {item.content.slice(0, 100)}{item.content.length > 100 ? '...' : ''}
            </p>
            <StatusBadge item={item} />
          </div>
        </td>
        <td className="px-4 py-2.5 text-[11px] whitespace-nowrap" style={{ color: '#9B9A97' }} title={absTime(item.timestamp)}>
          {relTime(item.timestamp)}
        </td>
      </tr>
    );
  }

  /* ---- Card item ---- */
  function renderCard(item: CommItem) {
    const cfg = CH[item.channel] ?? CH.note;
    return (
      <div key={item.id}
        className="rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => handleRowClick(item)}
        style={{
          background: 'var(--notion-card, white)',
          border: '1px solid var(--notion-border)',
        }}>
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5">
            <HandIcon name={cfg.icon} size={14} />
            <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
          </span>
          <span className="text-[10px]" style={{ color: '#9B9A97' }} title={absTime(item.timestamp)}>
            {relTime(item.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>
            {item.lead_name || '\u2014'}
          </span>
          {item.lead_company && (
            <span className="text-[10px]" style={{ color: '#9B9A97' }}>{item.lead_company}</span>
          )}
        </div>
        <p className="text-xs mb-2" style={{ color: 'var(--notion-text)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.content}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              background: item.direction === 'inbound' ? '#f0fdf4' : '#eff6ff',
              color: item.direction === 'inbound' ? '#15803d' : '#1d4ed8',
            }}>
            {item.direction === 'inbound' ? `↙ ${t('dirInbound')}` : `↗ ${t('dirOutbound')}`}
          </span>
          <SourceBadge item={item} />
          <StatusBadge item={item} />
        </div>
      </div>
    );
  }

  /* ---- Timeline item ---- */
  function renderTimelineItem(item: CommItem) {
    const cfg = CH[item.channel] ?? CH.note;
    return (
      <div key={item.id} className="flex gap-3 cursor-pointer hover:bg-[var(--notion-hover)] rounded-lg p-2 -mx-2 transition-colors"
        onClick={() => handleRowClick(item)}>
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <HandIcon name={cfg.icon} size={14} />
          </div>
          <div className="w-px flex-1 mt-1" style={{ background: 'var(--notion-border)' }} />
        </div>
        <div className="flex-1 pb-4">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>
              {item.lead_name || '\u2014'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: item.direction === 'inbound' ? '#f0fdf4' : '#eff6ff',
                color: item.direction === 'inbound' ? '#15803d' : '#1d4ed8',
              }}>
              {item.direction === 'inbound' ? `↙ ${t('dirInbound')}` : `↗ ${t('dirOutbound')}`}
            </span>
            <SourceBadge item={item} />
            <span className="text-[10px] ml-auto" style={{ color: '#9B9A97' }} title={absTime(item.timestamp)}>
              {absTime(item.timestamp)}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--notion-text)', opacity: 0.85 }}>
            {item.content.slice(0, 200)}{item.content.length > 200 ? '...' : ''}
          </p>
          {item.created_by_name && (
            <span className="text-[10px] mt-0.5 inline-block" style={{ color: '#9B9A97' }}>
              {item.created_by_name}
            </span>
          )}
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Main render                                                      */
  /* ================================================================ */

  return (
    <div className="space-y-3">

      {/* ===== Toolbar ===== */}
      <div className="flex items-center gap-2 flex-wrap"
        style={{ padding: '0 0 12px', borderBottom: '1px solid var(--notion-border)' }}>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={tMsg('searchPlaceholder')}
            className="w-full text-xs pl-8 pr-3 py-[7px] rounded-lg outline-none"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40">
            <HandIcon name="magnifying-glass" size={14} />
          </span>
        </div>

        {/* Filter button + dropdown */}
        <div ref={filterRef} className="relative">
          <button
            onClick={() => { setFilterOpen(v => !v); setSortOpen(false); }}
            style={{
              ...btnBase,
              border: `1px solid ${activeFilters > 0 ? '#7c3aed' : 'var(--notion-border)'}`,
              color: activeFilters > 0 ? '#7c3aed' : 'var(--notion-text-muted, #9B9A97)',
              background: activeFilters > 0 ? 'rgba(124,58,237,0.07)' : 'transparent',
            }}>
            <HandIcon name="funnel" size={13} />
            {tMsg('filter')}
            {activeFilters > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
                borderRadius: 8, background: '#7c3aed', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {activeFilters}
              </span>
            )}
          </button>

          {filterOpen && (
            <div className="absolute left-0 mt-1 z-50 animate-in fade-in slide-in-from-top-1"
              style={{
                width: 340, background: 'var(--notion-card, white)',
                border: '1px solid var(--notion-border)', borderRadius: 12,
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: 16,
              }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>{tMsg('filters')}</span>
                {activeFilters > 0 && (
                  <button onClick={clearAllFilters}
                    className="text-[11px] hover:underline" style={{ color: '#7c3aed' }}>
                    {tMsg('clearAll')}
                  </button>
                )}
              </div>

              {/* Channel */}
              <FilterSelect
                label={tMsg('filterChannel')}
                value={channel}
                onChange={v => { setChannel(v); setPage(1); }}
                options={[
                  { value: '', label: tMsg('all') },
                  ...Object.entries(CH).map(([k, cfg]) => ({ value: k, label: cfg.label })),
                ]}
              />

              {/* Direction */}
              <FilterSelect
                label={tMsg('filterDirection')}
                value={direction}
                onChange={v => { setDirection(v); setPage(1); }}
                options={[
                  { value: '', label: tMsg('all') },
                  { value: 'outbound', label: t('dirOutbound') },
                  { value: 'inbound', label: t('dirInbound') },
                ]}
              />

              {/* Source */}
              <FilterSelect
                label={tMsg('filterSource')}
                value={source}
                onChange={v => { setSource(v); setPage(1); }}
                options={[
                  { value: '', label: tMsg('all') },
                  { value: 'interaction', label: tMsg('srcLog') },
                  { value: 'whatsapp_message', label: 'WhatsApp' },
                ]}
              />

              {/* Message type */}
              <FilterSelect
                label={tMsg('filterMsgType')}
                value={messageType}
                onChange={v => { setMessageType(v); setPage(1); }}
                options={[
                  { value: '', label: tMsg('all') },
                  { value: 'text', label: tMsg('typeText') },
                  { value: 'image', label: tMsg('typeImage') },
                  { value: 'video', label: tMsg('typeVideo') },
                  { value: 'audio', label: tMsg('typeAudio') },
                  { value: 'document', label: tMsg('typeDocument') },
                ]}
              />

              {/* Status */}
              <FilterSelect
                label={tMsg('filterStatus')}
                value={status}
                onChange={v => { setStatus(v); setPage(1); }}
                options={[
                  { value: '', label: tMsg('all') },
                  { value: 'sent', label: tMsg('statusSent') },
                  { value: 'delivered', label: tMsg('statusDelivered') },
                  { value: 'read', label: tMsg('statusRead') },
                  { value: 'failed', label: tMsg('statusFailed') },
                ]}
              />

              {/* Date range */}
              <div className="mt-3">
                <span className="text-[11px] font-medium mb-1 block" style={{ color: '#9B9A97' }}>
                  {tMsg('filterDateRange')}
                </span>
                <div className="flex items-center gap-2">
                  <input type="date" value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                    className="flex-1 text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}
                  />
                  <span className="text-xs" style={{ color: '#9B9A97' }}>–</span>
                  <input type="date" value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setPage(1); }}
                    className="flex-1 text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sort button + dropdown */}
        <div ref={sortRef} className="relative">
          <button
            onClick={() => { setSortOpen(v => !v); setFilterOpen(false); }}
            style={{
              ...btnBase,
              border: `1px solid ${sortBy !== 'time_desc' ? '#7c3aed' : 'var(--notion-border)'}`,
              color: sortBy !== 'time_desc' ? '#7c3aed' : 'var(--notion-text-muted, #9B9A97)',
              background: sortBy !== 'time_desc' ? 'rgba(124,58,237,0.07)' : 'transparent',
            }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 4h12M2 8h8M2 12h5" />
            </svg>
            {activeSortLabel}
          </button>

          {sortOpen && (
            <div className="absolute left-0 mt-1 z-50 animate-in fade-in slide-in-from-top-1"
              style={{
                width: 220, background: 'var(--notion-card, white)',
                border: '1px solid var(--notion-border)', borderRadius: 10,
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '6px 0',
              }}>
              {sortOptions.map(opt => (
                <button key={opt.key}
                  onClick={() => { setSortBy(opt.key); setPage(1); setSortOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--notion-hover)] transition-colors"
                  style={{
                    color: sortBy === opt.key ? '#7c3aed' : 'var(--notion-text)',
                    fontWeight: sortBy === opt.key ? 600 : 400,
                  }}>
                  <span style={{ width: 16, textAlign: 'center', fontSize: 11, opacity: 0.6 }}>{opt.icon}</span>
                  {opt.label}
                  {sortBy === opt.key && <span className="ml-auto" style={{ color: '#7c3aed' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0"
          style={{ border: '1px solid var(--notion-border)' }}>
          {viewModes.map(vm => (
            <button key={vm.key}
              onClick={() => setViewMode(vm.key)}
              title={vm.label}
              className="p-1.5 transition-colors"
              style={{
                background: viewMode === vm.key ? 'var(--notion-hover)' : 'transparent',
                color: viewMode === vm.key ? 'var(--notion-text)' : '#9B9A97',
              }}>
              <HandIcon name={vm.icon} size={14} />
            </button>
          ))}
        </div>

        {/* Total */}
        <span className="text-xs ml-auto flex-shrink-0" style={{ color: '#9B9A97', whiteSpace: 'nowrap' }}>
          {total} {tCrm('totalRecords')}
        </span>
      </div>

      {/* ===== Active filter chips ===== */}
      {activeFilters > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {getFilterChips().map(chip => (
            <span key={chip.key} style={chipStyle}
              onClick={chip.onClear}>
              {chip.label}
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </span>
          ))}
          <button onClick={clearAllFilters}
            className="text-[11px] hover:underline" style={{ color: '#9B9A97' }}>
            {tMsg('clearAll')}
          </button>
        </div>
      )}

      {/* ===== Loading ===== */}
      {loading && (
        <div className="py-16 text-center text-sm" style={{ color: '#9B9A97' }}>
          <div className="inline-block animate-spin mb-2" style={{ width: 20, height: 20, border: '2px solid var(--notion-border)', borderTopColor: '#7c3aed', borderRadius: '50%' }} />
          <div>{tCrm('loadingText')}</div>
        </div>
      )}

      {/* ===== Empty ===== */}
      {!loading && items.length === 0 && (
        <div className="py-16 text-center">
          <div className="mb-2"><HandIcon name="chat-bubble" size={28} /></div>
          <p className="text-sm" style={{ color: '#9B9A97' }}>{t('noInteractions')}</p>
        </div>
      )}

      {/* ===== List view ===== */}
      {!loading && items.length > 0 && viewMode === 'list' && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
                {[t('thChannel'), tCrm('colLead'), t('thDirection'), t('thContentSummary'), t('thTime')].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold" style={{ color: '#9B9A97' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => renderRow(item, idx, items))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Timeline view ===== */}
      {!loading && items.length > 0 && viewMode === 'timeline' && (
        <div className="rounded-2xl p-5"
          style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
          {Object.entries(groupedByDate).map(([label, dateItems]) => (
            <div key={label} className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold" style={{ color: 'var(--notion-text)' }}>{label}</span>
                <div className="flex-1 h-px" style={{ background: 'var(--notion-border)' }} />
                <span className="text-[10px]" style={{ color: '#9B9A97' }}>{dateItems.length}</span>
              </div>
              {dateItems.map(item => renderTimelineItem(item))}
            </div>
          ))}
        </div>
      )}

      {/* ===== Card view ===== */}
      {!loading && items.length > 0 && viewMode === 'card' && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {items.map(item => renderCard(item))}
        </div>
      )}

      {/* ===== By Lead view ===== */}
      {!loading && items.length > 0 && viewMode === 'by_lead' && (
        <div className="space-y-4">
          {Object.entries(groupedByLead).map(([leadName, groupItems]) => (
            <div key={leadName} className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
              <div className="px-4 py-3 flex items-center gap-2"
                style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{leadName}</span>
                {groupItems[0]?.lead_company && (
                  <span className="text-xs" style={{ color: '#9B9A97' }}>{groupItems[0].lead_company}</span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: '#f3f4f6', color: '#374151' }}>
                  {groupItems.length}
                </span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {groupItems.map((item, idx) => renderRow(item, idx, groupItems))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ===== By Channel view ===== */}
      {!loading && items.length > 0 && viewMode === 'by_channel' && (
        <div className="space-y-4">
          {Object.entries(groupedByChannel).map(([ch, groupItems]) => {
            const cfg = CH[ch] ?? CH.note;
            return (
              <div key={ch} className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
                <div className="px-4 py-3 flex items-center gap-2"
                  style={{ borderBottom: '1px solid var(--notion-border)', background: cfg.bg }}>
                  <HandIcon name={cfg.icon} size={16} />
                  <span className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: 'var(--notion-card, white)', color: cfg.color }}>
                    {groupItems.length}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {groupItems.map((item, idx) => renderRow(item, idx, groupItems))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Pagination ===== */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-4">
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1}
            className="px-2 py-1.5 rounded-md text-xs transition-colors"
            style={{
              color: page <= 1 ? '#D0CFC9' : 'var(--notion-text)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}>
            «
          </button>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2 py-1.5 rounded-md text-xs transition-colors"
            style={{
              color: page <= 1 ? '#D0CFC9' : 'var(--notion-text)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}>
            ‹
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) pageNum = i + 1;
            else if (page <= 3) pageNum = i + 1;
            else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
            else pageNum = page - 2 + i;
            return (
              <button key={pageNum}
                onClick={() => setPage(pageNum)}
                className="w-7 h-7 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: page === pageNum ? '#7c3aed' : 'transparent',
                  color: page === pageNum ? '#fff' : 'var(--notion-text)',
                }}>
                {pageNum}
              </button>
            );
          })}

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1.5 rounded-md text-xs transition-colors"
            style={{
              color: page >= totalPages ? '#D0CFC9' : 'var(--notion-text)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            }}>
            ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="px-2 py-1.5 rounded-md text-xs transition-colors"
            style={{
              color: page >= totalPages ? '#D0CFC9' : 'var(--notion-text)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            }}>
            »
          </button>
        </div>
      )}

      {/* ===== WhatsApp SlideOver ===== */}
      <SlideOver open={waSlideOpen} onClose={() => setWaSlideOpen(false)} title={waContactName || 'WhatsApp'}>
        {waSlideOpen && (
          <div style={{ height: 500 }}>
            <WhatsAppChatPanel contactId={waContactId || undefined} contactName={waContactName} />
          </div>
        )}
      </SlideOver>

      {/* ===== Detail SlideOver ===== */}
      <SlideOver open={!!detailItem} onClose={() => setDetailItem(null)}
        title={detailItem ? (CH[detailItem.channel]?.label || detailItem.channel) : ''}>
        {detailItem && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: (CH[detailItem.channel] ?? CH.note).bg, border: `1px solid ${(CH[detailItem.channel] ?? CH.note).border}` }}>
                <HandIcon name={(CH[detailItem.channel] ?? CH.note).icon} size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                  {detailItem.lead_name || '\u2014'}
                </div>
                {detailItem.lead_company && (
                  <div className="text-xs" style={{ color: '#9B9A97' }}>{detailItem.lead_company}</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DetailField label={tMsg('filterChannel')} value={(CH[detailItem.channel] ?? CH.note).label} />
              <DetailField label={tMsg('filterDirection')}
                value={detailItem.direction === 'inbound' ? t('dirInbound') : t('dirOutbound')} />
              <DetailField label={tMsg('filterSource')}
                value={detailItem.source === 'whatsapp_message' ? 'WhatsApp' : tMsg('srcLog')} />
              <DetailField label={t('thTime')} value={absTime(detailItem.timestamp)} />
              {detailItem.created_by_name && (
                <DetailField label={tMsg('createdBy')} value={detailItem.created_by_name} />
              )}
            </div>

            <div>
              <span className="text-[11px] font-medium block mb-1" style={{ color: '#9B9A97' }}>{t('thContentSummary')}</span>
              <div className="text-sm p-3 rounded-lg"
                style={{ background: 'var(--notion-bg)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)', lineHeight: 1.6 }}>
                {detailItem.content}
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="mb-2.5">
      <span className="text-[11px] font-medium mb-1 block" style={{ color: '#9B9A97' }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-xs px-2.5 py-1.5 rounded-md outline-none"
        style={{
          border: `1px solid ${value ? '#7c3aed' : 'var(--notion-border)'}`,
          color: value ? '#7c3aed' : 'var(--notion-text)',
          background: value ? 'rgba(124,58,237,0.04)' : 'var(--notion-bg)',
          fontWeight: value ? 500 : 400,
        }}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-medium block" style={{ color: '#9B9A97' }}>{label}</span>
      <span className="text-xs" style={{ color: 'var(--notion-text)' }}>{value}</span>
    </div>
  );
}
