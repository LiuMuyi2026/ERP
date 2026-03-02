'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import SlideOver from '@/components/ui/SlideOver';
import { useTranslations } from 'next-intl';
import WhatsAppChatPanel from './WhatsAppChatPanel';

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
};

type CHConfig = Record<string, { icon: string; label: string; color: string; bg: string; border: string }>;

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

export default function MessageManagement() {
  const t = useTranslations('customer360');
  const tCrm = useTranslations('crm');
  const CH = getCH(t);

  const [items, setItems] = useState<CommItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Filters
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [direction, setDirection] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'by_lead' | 'by_channel'>('list');

  // SlideOver for WhatsApp chat
  const [waSlideOpen, setWaSlideOpen] = useState(false);
  const [waContactId, setWaContactId] = useState('');
  const [waContactName, setWaContactName] = useState('');

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
  }, [page, search, channel, direction, dateFrom, dateTo, sortBy]);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.ceil(total / pageSize);

  // Group helpers
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

  function handleRowClick(item: CommItem) {
    if (item.source === 'whatsapp_message' && item.lead_id) {
      // Open WhatsApp chat for this lead
      setWaContactName(item.lead_name || '');
      setWaContactId(''); // We use leadId in WhatsAppChatPanel
      setWaSlideOpen(true);
    }
  }

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
            {item.direction === 'inbound' ? `\u2199 ${t('dirInbound')}` : `\u2197 ${t('dirOutbound')}`}
          </span>
        </td>
        <td className="px-4 py-2.5 max-w-sm">
          <p className="text-xs truncate" style={{ color: 'var(--notion-text)' }}>
            {item.content.slice(0, 100)}{item.content.length > 100 ? '...' : ''}
          </p>
        </td>
        <td className="px-4 py-2.5 text-[11px] whitespace-nowrap" style={{ color: '#9B9A97' }} title={absTime(item.timestamp)}>
          {relTime(item.timestamp)}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={tCrm('searchPlaceholder') || 'Search messages...'}
            className="w-full text-xs pl-8 pr-3 py-2 rounded-lg outline-none"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40">
            <HandIcon name="magnifying-glass" size={14} />
          </span>
        </div>

        {/* Channel filter */}
        <select
          value={channel}
          onChange={e => { setChannel(e.target.value); setPage(1); }}
          className="text-xs px-3 py-2 rounded-lg outline-none"
          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
          <option value="">{t('sourceAll')}</option>
          {Object.entries(CH).map(([k, cfg]) => (
            <option key={k} value={k}>{cfg.label}</option>
          ))}
        </select>

        {/* Direction filter */}
        <select
          value={direction}
          onChange={e => { setDirection(e.target.value); setPage(1); }}
          className="text-xs px-3 py-2 rounded-lg outline-none"
          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
          <option value="">{t('sourceAll')}</option>
          <option value="outbound">{t('dirOutbound')}</option>
          <option value="inbound">{t('dirInbound')}</option>
        </select>

        {/* Date range */}
        <input type="date" value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="text-xs px-2 py-2 rounded-lg outline-none"
          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
        <span className="text-xs" style={{ color: '#9B9A97' }}>\u2013</span>
        <input type="date" value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="text-xs px-2 py-2 rounded-lg outline-none"
          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setPage(1); }}
          className="text-xs px-3 py-2 rounded-lg outline-none"
          style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
          <option value="time_desc">{tCrm('sortNewest') || 'Newest'}</option>
          <option value="time_asc">{tCrm('sortOldest') || 'Oldest'}</option>
        </select>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
          {([
            ['list', tCrm('viewList') || 'List'],
            ['by_lead', tCrm('viewByLead') || 'By Lead'],
            ['by_channel', tCrm('viewByChannel') || 'By Channel'],
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => setViewMode(v)}
              className="px-3 py-1.5 text-xs font-medium"
              style={{
                background: viewMode === v ? '#7c3aed' : 'white',
                color: viewMode === v ? 'white' : '#9B9A97',
              }}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs ml-auto" style={{ color: '#9B9A97' }}>
          {total} {tCrm('totalRecords') || 'records'}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center text-sm" style={{ color: '#9B9A97' }}>Loading...</div>
      )}

      {/* List view */}
      {!loading && viewMode === 'list' && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--notion-card, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
          {items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-3xl mb-2"><HandIcon name="chat-bubble" size={28} /></p>
              <p className="text-sm" style={{ color: '#9B9A97' }}>{t('noInteractions')}</p>
            </div>
          ) : (
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
          )}
        </div>
      )}

      {/* By Lead view */}
      {!loading && viewMode === 'by_lead' && (
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

      {/* By Channel view */}
      {!loading && viewMode === 'by_channel' && (
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

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{
              border: '1px solid var(--notion-border)',
              color: page <= 1 ? '#D0CFC9' : 'var(--notion-text)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}>
            Prev
          </button>
          <span className="text-xs" style={{ color: '#9B9A97' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{
              border: '1px solid var(--notion-border)',
              color: page >= totalPages ? '#D0CFC9' : 'var(--notion-text)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            }}>
            Next
          </button>
        </div>
      )}

      {/* WhatsApp SlideOver */}
      <SlideOver open={waSlideOpen} onClose={() => setWaSlideOpen(false)} title={waContactName || 'WhatsApp'}>
        {waSlideOpen && (
          <div style={{ height: 500 }}>
            <WhatsAppChatPanel contactId={waContactId || undefined} contactName={waContactName} />
          </div>
        )}
      </SlideOver>
    </div>
  );
}
