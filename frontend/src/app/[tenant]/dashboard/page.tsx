'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type InsightItem = {
  type: string;
  icon: string;
  title: string;
  detail: string;
  priority: string;
  action_url?: string;
};

type QueryResult = {
  sql?: string;
  explanation?: string;
  columns?: string[];
  rows?: Record<string, any>[];
  total?: number;
  error?: string;
};

const ICON_MAP: Record<string, string> = {
  warning: '⚠️',
  trending_up: '📈',
  schedule: '📅',
  inventory: '📦',
  message: '💬',
  people: '👥',
  money: '💰',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#e03e3e',
  medium: '#dfab01',
  low: '#0f7b6c',
};

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;

  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [rawData, setRawData] = useState<Record<string, string>>({});
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string>('');

  // NL Query
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const res = await api.get('/api/ai/insights');
      setInsights(res.brief || []);
      setRawData(res.raw_data || {});
      setGeneratedAt(res.generated_at || '');
    } catch {
      // silent
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setQueryLoading(true);
    try {
      const res = await api.post('/api/ai/query', { question: query });
      setQueryResult(res);
      setQueryHistory(prev => [query, ...prev.filter(q => q !== query)].slice(0, 10));
    } catch (e: any) {
      setQueryResult({ error: e.message || 'Query failed' });
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--notion-text-primary, #37352f)',
          margin: '0 0 4px 0',
        }}>
          AI Dashboard
        </h1>
        <p style={{ fontSize: 14, color: 'var(--notion-text-secondary, #787774)', margin: 0 }}>
          Business insights and natural language data queries
        </p>
      </div>

      {/* KPI Summary Cards */}
      {Object.keys(rawData).length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}>
          {Object.entries(rawData).map(([key, value]) => (
            <div key={key} style={{
              background: 'var(--notion-bg-primary, #fff)',
              border: '1px solid var(--notion-border, #e5e5e5)',
              borderRadius: 10,
              padding: '14px 16px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--notion-text-secondary, #787774)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {key}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--notion-text-primary, #37352f)' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daily Brief */}
      <div style={{
        background: 'var(--notion-bg-primary, #fff)',
        border: '1px solid var(--notion-border, #e5e5e5)',
        borderRadius: 12,
        marginBottom: 24,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--notion-border, #e5e5e5)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--notion-text-primary, #37352f)', margin: 0 }}>
            Today&apos;s Brief
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {generatedAt && (
              <span style={{ fontSize: 11, color: 'var(--notion-text-tertiary, #999)' }}>
                {new Date(generatedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchInsights}
              disabled={insightsLoading}
              style={{
                background: 'var(--notion-bg-secondary, #f7f6f3)',
                border: '1px solid var(--notion-border, #e5e5e5)',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 12,
                cursor: 'pointer',
                color: 'var(--notion-text-primary, #37352f)',
              }}
            >
              {insightsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {insightsLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--notion-text-secondary, #787774)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
            Generating insights...
          </div>
        ) : insights.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--notion-text-secondary, #787774)' }}>
            No insights available
          </div>
        ) : (
          <div>
            {insights.map((item, i) => (
              <div
                key={i}
                onClick={() => item.action_url && router.push(`/${tenant}${item.action_url}`)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '14px 20px',
                  borderBottom: i < insights.length - 1 ? '1px solid var(--notion-border, #f0f0f0)' : 'none',
                  cursor: item.action_url ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (item.action_url) (e.currentTarget as HTMLElement).style.background = 'var(--notion-bg-hover, #f7f7f7)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>
                  {ICON_MAP[item.icon] || '📌'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--notion-text-primary, #37352f)',
                    }}>
                      {item.title}
                    </span>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: PRIORITY_COLORS[item.priority] || '#999',
                      flexShrink: 0,
                    }} />
                  </div>
                  <p style={{
                    fontSize: 12,
                    color: 'var(--notion-text-secondary, #787774)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}>
                    {item.detail}
                  </p>
                </div>
                {item.action_url && (
                  <span style={{ fontSize: 12, color: 'var(--notion-text-tertiary, #999)', flexShrink: 0 }}>→</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Natural Language Query */}
      <div style={{
        background: 'var(--notion-bg-primary, #fff)',
        border: '1px solid var(--notion-border, #e5e5e5)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--notion-border, #e5e5e5)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--notion-text-primary, #37352f)', margin: '0 0 12px 0' }}>
            Ask a Question
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              placeholder="e.g. How many contracts were signed last month?"
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid var(--notion-border, #e5e5e5)',
                borderRadius: 8,
                fontSize: 14,
                background: 'var(--notion-bg-secondary, #f7f6f3)',
                color: 'var(--notion-text-primary, #37352f)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleQuery}
              disabled={queryLoading || !query.trim()}
              style={{
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 500,
                cursor: queryLoading ? 'wait' : 'pointer',
                opacity: queryLoading || !query.trim() ? 0.6 : 1,
              }}
            >
              {queryLoading ? '...' : 'Query'}
            </button>
          </div>

          {/* Quick suggestions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {[
              'How many leads are in negotiating status?',
              'Show overdue receivables',
              'Top 5 customers by contract value',
              'New leads this week',
            ].map((q) => (
              <button
                key={q}
                onClick={() => { setQuery(q); }}
                style={{
                  background: 'var(--notion-bg-secondary, #f7f6f3)',
                  border: '1px solid var(--notion-border, #e5e5e5)',
                  borderRadius: 12,
                  padding: '3px 10px',
                  fontSize: 11,
                  color: 'var(--notion-text-secondary, #787774)',
                  cursor: 'pointer',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Query Result */}
        {queryResult && (
          <div style={{ padding: 20 }}>
            {queryResult.error ? (
              <div style={{ color: '#e03e3e', fontSize: 13, padding: '12px 16px', background: '#fef2f2', borderRadius: 8 }}>
                {queryResult.error}
              </div>
            ) : (
              <>
                {queryResult.explanation && (
                  <div style={{ fontSize: 12, color: 'var(--notion-text-secondary, #787774)', marginBottom: 8 }}>
                    {queryResult.explanation}
                    {queryResult.total != null && <span style={{ marginLeft: 8, fontWeight: 600 }}>({queryResult.total} rows)</span>}
                  </div>
                )}
                {queryResult.sql && (
                  <details style={{ marginBottom: 12 }}>
                    <summary style={{ fontSize: 11, color: 'var(--notion-text-tertiary, #999)', cursor: 'pointer' }}>
                      Show SQL
                    </summary>
                    <pre style={{
                      fontSize: 11,
                      background: 'var(--notion-bg-secondary, #f7f6f3)',
                      padding: 10,
                      borderRadius: 6,
                      overflowX: 'auto',
                      marginTop: 4,
                      color: 'var(--notion-text-primary, #37352f)',
                    }}>
                      {queryResult.sql}
                    </pre>
                  </details>
                )}
                {queryResult.rows && queryResult.rows.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 13,
                    }}>
                      <thead>
                        <tr>
                          {Object.keys(queryResult.rows[0]).map(col => (
                            <th key={col} style={{
                              textAlign: 'left',
                              padding: '8px 12px',
                              borderBottom: '2px solid var(--notion-border, #e5e5e5)',
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--notion-text-secondary, #787774)',
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              whiteSpace: 'nowrap',
                            }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.rows.map((row, ri) => (
                          <tr key={ri}>
                            {Object.values(row).map((val, ci) => (
                              <td key={ci} style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid var(--notion-border, #f0f0f0)',
                                color: 'var(--notion-text-primary, #37352f)',
                                whiteSpace: 'nowrap',
                                maxWidth: 300,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {val == null ? '-' : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
