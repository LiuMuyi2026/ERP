'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import SlideOver from '@/components/ui/SlideOver';
import { useTranslations } from 'next-intl';

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

  /* Filters — default to internal logs only (WhatsApp has its own tab) */
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [direction, setDirection] = useState('');
  const [source, setSource] = useState('interaction');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');

  /* View */
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  /* Detail SlideOver */
  const [detailItem, setDetailItem] = useState<CommItem | null>(null);

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

      const qs = new URLSearchParams(params).toString();
      const data = await api.get(`/api/crm/communications?${qs}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, channel, direction, source, dateFrom, dateTo, sortBy]);

  useEffect(() => { load(); }, [load]);

  /* ---- Debounced search ---- */
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /* ---- Active filter count (excluding default source) ---- */
  const activeFilters = [channel, direction, source !== 'interaction' ? source : '', dateFrom, dateTo].filter(Boolean).length;

  /* ---- Grouping ---- */
  const groupedByDate = items.reduce<Record<string, CommItem[]>>((acc, item) => {
    const label = dateLabel(item.timestamp);
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});

  const groupedByLead = items.reduce<Record<string, CommItem[]>>((acc, item) => {
    const key = item.lead_name || item.lead_id || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
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

        {/* Source toggle — switch between internal logs and all */}
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: '#f0f2f5' }}>
          <button
            onClick={() => { setSource('interaction'); setPage(1); }}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
            style={{
              background: source === 'interaction' ? 'white' : 'transparent',
              color: source === 'interaction' ? '#111b21' : '#8696a0',
              boxShadow: source === 'interaction' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {tMsg('srcLog') || '内部记录'}
          </button>
          <button
            onClick={() => { setSource(''); setPage(1); }}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
            style={{
              background: source === '' ? 'white' : 'transparent',
              color: source === '' ? '#111b21' : '#8696a0',
              boxShadow: source === '' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {tMsg('all') || '全部'}
          </button>
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
      {!loading && items.length === 0 && (
        <div className="py-20 text-center">
          <svg className="mx-auto mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p className="text-[14px]" style={{ color: '#667781' }}>{t('noInteractions')}</p>
          <p className="text-[12px] mt-1" style={{ color: '#8696a0' }}>
            {source === 'interaction' ? '暂无内部沟通记录' : '暂无通讯记录'}
          </p>
        </div>
      )}

      {/* ===== Timeline view (default) ===== */}
      {!loading && items.length > 0 && viewMode === 'timeline' && (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([label, dateItems]) => (
            <div key={label}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[13px] font-semibold" style={{ color: '#111b21' }}>{label}</span>
                <div className="flex-1 h-px" style={{ background: '#e5e7eb' }} />
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#f0f2f5', color: '#667781' }}>
                  {dateItems.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {dateItems.map(item => {
                  const cfg = CH[item.channel] ?? CH.note;
                  const isWa = item.source === 'whatsapp_message';
                  return (
                    <div key={item.id}
                      className="flex gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                      onClick={() => setDetailItem(item)}>
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center pt-0.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
                          <HandIcon name={cfg.icon} size={14} />
                        </div>
                      </div>
                      {/* Content */}
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
                          {isWa && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#15803d' }}>WA</span>
                          )}
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
      {!loading && items.length > 0 && viewMode === 'list' && (
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
              {items.map((item, idx) => {
                const cfg = CH[item.channel] ?? CH.note;
                const isWa = item.source === 'whatsapp_message';
                return (
                  <tr key={item.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setDetailItem(item)}
                    style={{ borderBottom: idx < items.length - 1 ? '1px solid #f0f2f5' : 'none' }}>
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
                      <span className="text-[13px] font-medium" style={{ color: '#111b21' }}>{item.lead_name || '—'}</span>
                      {item.lead_company && (
                        <span className="text-[11px] ml-1.5" style={{ color: '#8696a0' }}>{item.lead_company}</span>
                      )}
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
                      <div className="flex items-center gap-1.5">
                        {isWa && <span className="text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>WA</span>}
                        <p className="text-[13px] truncate" style={{ color: '#3b4a54' }}>{item.content.slice(0, 100)}</p>
                        {item.status && (
                          <span className="text-[10px] flex-shrink-0" style={{ color: item.status === 'read' ? '#1d4ed8' : '#8696a0' }}>
                            {item.status === 'read' ? '✓✓' : item.status === 'delivered' ? '✓✓' : item.status === 'failed' ? '✕' : '✓'}
                          </span>
                        )}
                      </div>
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
      {!loading && items.length > 0 && viewMode === 'by_lead' && (
        <div className="space-y-4">
          {Object.entries(groupedByLead).map(([leadName, groupItems]) => {
            const company = groupItems[0]?.lead_company;
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
                    {groupItems.length}
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: '#f0f2f5' }}>
                  {groupItems.map(item => {
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
    </div>
  );
}
