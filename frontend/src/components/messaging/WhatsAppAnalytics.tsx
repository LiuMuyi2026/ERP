'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';

type AnalyticsData = {
  period: string;
  daily: { day: string; count: number; inbound: number; outbound: number }[];
  hourly: { hour: number; count: number }[];
  avg_response_seconds: number | null;
  total_messages: number;
  active_contacts: number;
  total_inbound: number;
  total_outbound: number;
  total_unread: number;
  user_stats: { full_name: string; owner_user_id: string; message_count: number }[];
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default function WhatsAppAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');

  async function loadAnalytics(p: string) {
    setLoading(true);
    try {
      const result = await api.get(`/api/whatsapp/analytics?period=${p}`);
      setData(result);
    } catch { setData(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadAnalytics(period); }, [period]);

  // Chart calculations
  const dailyMax = useMemo(() => {
    if (!data?.daily.length) return 1;
    return Math.max(...data.daily.map((d) => d.count), 1);
  }, [data]);

  const hourlyMax = useMemo(() => {
    if (!data?.hourly.length) return 1;
    return Math.max(...data.hourly.map((h) => h.count), 1);
  }, [data]);

  // Fill 24 hours
  const hourlyFull = useMemo(() => {
    const map = new Map((data?.hourly || []).map((h) => [h.hour, h.count]));
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: map.get(i) || 0 }));
  }, [data]);

  return (
    <div className="h-full overflow-auto" style={{ background: '#f0f2f5' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ background: 'white', borderBottom: '1px solid #e5e7eb' }}>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#3b4a54' }}>WhatsApp Analytics</h2>
          <p className="text-xs" style={{ color: '#8696a0' }}>Track messaging performance and engagement</p>
        </div>
        <div className="flex gap-1">
          {['7d', '30d', '90d'].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: period === p ? '#00a884' : 'white',
                color: period === p ? 'white' : '#667781',
                border: `1px solid ${period === p ? '#00a884' : '#e5e7eb'}`,
              }}>
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: '#8696a0' }}>Loading analytics...</div>
      ) : !data ? (
        <div className="text-center py-16 text-sm" style={{ color: '#8696a0' }}>Failed to load analytics</div>
      ) : (
        <div className="p-6 space-y-6">
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Messages', value: data.total_messages.toLocaleString(), color: '#3b4a54', sub: `${data.total_inbound} in / ${data.total_outbound} out` },
              { label: 'Active Contacts', value: data.active_contacts.toLocaleString(), color: '#00a884', sub: `in ${period}` },
              { label: 'Avg Response', value: formatDuration(data.avg_response_seconds), color: '#7c3aed', sub: 'first reply time' },
              { label: 'Unread', value: (data.total_unread || 0).toLocaleString(), color: '#dc2626', sub: 'pending messages' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl p-4 shadow-sm" style={{ background: 'white' }}>
                <div className="text-xs font-medium mb-1" style={{ color: '#8696a0' }}>{kpi.label}</div>
                <div className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                <div className="text-[10px] mt-0.5" style={{ color: '#8696a0' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Daily Message Trend (CSS bars) ── */}
          <div className="rounded-xl p-5 shadow-sm" style={{ background: 'white' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: '#3b4a54' }}>Message Volume Trend</h3>
            {data.daily.length === 0 ? (
              <div className="text-center py-8 text-xs" style={{ color: '#8696a0' }}>No data for this period</div>
            ) : (
              <div className="flex items-end gap-1" style={{ height: 160 }}>
                {data.daily.map((d) => {
                  const inH = (d.inbound / dailyMax) * 140;
                  const outH = (d.outbound / dailyMax) * 140;
                  const dayLabel = new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5 min-w-0 group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                        <div className="px-2 py-1 rounded text-[10px] whitespace-nowrap shadow-lg" style={{ background: '#3b4a54', color: 'white' }}>
                          {dayLabel}: {d.count} ({d.inbound} in, {d.outbound} out)
                        </div>
                      </div>
                      <div className="w-full flex flex-col items-center gap-0">
                        <div className="w-full max-w-[20px] rounded-t" style={{ height: Math.max(inH, 2), background: '#3b82f6' }} />
                        <div className="w-full max-w-[20px] rounded-b" style={{ height: Math.max(outH, 2), background: '#22c55e' }} />
                      </div>
                      <span className="text-[8px] truncate w-full text-center" style={{ color: '#8696a0' }}>
                        {new Date(d.day).getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 justify-center">
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#8696a0' }}>
                <div className="w-3 h-3 rounded" style={{ background: '#3b82f6' }} /> Inbound
              </div>
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#8696a0' }}>
                <div className="w-3 h-3 rounded" style={{ background: '#22c55e' }} /> Outbound
              </div>
            </div>
          </div>

          {/* ── Hourly Distribution (heatmap-style bars) ── */}
          <div className="rounded-xl p-5 shadow-sm" style={{ background: 'white' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: '#3b4a54' }}>Hourly Activity Distribution</h3>
            <div className="flex items-end gap-px" style={{ height: 100 }}>
              {hourlyFull.map((h) => {
                const pct = h.count / hourlyMax;
                const intensity = Math.round(pct * 255);
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5 group relative min-w-0">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                      <div className="px-2 py-1 rounded text-[10px] whitespace-nowrap shadow-lg" style={{ background: '#3b4a54', color: 'white' }}>
                        {h.hour}:00 — {h.count} messages
                      </div>
                    </div>
                    <div className="w-full rounded-t transition-all"
                      style={{
                        height: Math.max((h.count / hourlyMax) * 80, 2),
                        background: h.count > 0 ? `rgba(0, 168, 132, ${0.2 + pct * 0.8})` : '#f0f2f5',
                      }} />
                    <span className="text-[7px]" style={{ color: '#8696a0' }}>{h.hour}</span>
                  </div>
                );
              })}
            </div>
            <div className="text-center mt-2 text-[10px]" style={{ color: '#8696a0' }}>Hour of day (server timezone)</div>
          </div>

          {/* ── User Rankings (admin only) ── */}
          {data.user_stats.length > 0 && (
            <div className="rounded-xl p-5 shadow-sm" style={{ background: 'white' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#3b4a54' }}>Team Performance</h3>
              <div className="space-y-2">
                {data.user_stats.map((u, i) => {
                  const maxCount = data.user_stats[0]?.message_count || 1;
                  return (
                    <div key={u.owner_user_id} className="flex items-center gap-3">
                      <span className="text-xs font-bold w-5 text-center" style={{ color: i < 3 ? '#00a884' : '#8696a0' }}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium truncate" style={{ color: '#3b4a54' }}>{u.full_name}</span>
                          <span className="text-xs font-mono" style={{ color: '#667781' }}>{u.message_count}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f2f5' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${(u.message_count / maxCount) * 100}%`, background: i === 0 ? '#00a884' : i === 1 ? '#3b82f6' : '#8696a0' }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
