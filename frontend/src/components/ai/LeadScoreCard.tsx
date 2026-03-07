'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type ScoreData = {
  score: number | null;
  reasons: Array<{ factor: string; points: number; detail: string }>;
  recommendation?: string;
  profile: string | null;
  score_updated_at?: string;
  profile_updated_at?: string;
};

export default function LeadScoreCard({ leadId }: { leadId: string }) {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    api.get(`/api/ai/lead-score/${leadId}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leadId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.post(`/api/ai/lead-score/${leadId}/refresh`, {});
      setData(res);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 75) return '#0f7b6c';
    if (score >= 50) return '#dfab01';
    if (score >= 25) return '#e08b00';
    return '#e03e3e';
  };

  const scoreBg = (score: number) => {
    if (score >= 75) return '#e6f7f2';
    if (score >= 50) return '#fef9e7';
    if (score >= 25) return '#fef3e2';
    return '#fce8e8';
  };

  const scoreLabel = (score: number) => {
    if (score >= 75) return 'A';
    if (score >= 50) return 'B';
    if (score >= 25) return 'C';
    return 'D';
  };

  if (loading) {
    return (
      <div style={{ padding: 16, background: 'var(--notion-bg-secondary, #f7f6f3)', borderRadius: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--notion-text-secondary, #787774)' }}>AI Score loading...</div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--notion-bg-secondary, #f7f6f3)',
      borderRadius: 10,
      padding: 16,
      marginBottom: 12,
      border: '1px solid var(--notion-border, #e5e5e5)',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data?.score != null ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--notion-text-primary, #37352f)' }}>
            AI Lead Score
          </span>
          {data?.score != null && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: scoreBg(data.score),
              color: scoreColor(data.score),
              fontWeight: 700,
              fontSize: 14,
            }}>
              {scoreLabel(data.score)}
            </span>
          )}
          {data?.score != null && (
            <span style={{ fontSize: 20, fontWeight: 700, color: scoreColor(data.score) }}>
              {data.score}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            background: 'var(--notion-bg-primary, #fff)',
            border: '1px solid var(--notion-border, #e5e5e5)',
            borderRadius: 6,
            padding: '4px 12px',
            fontSize: 12,
            cursor: refreshing ? 'wait' : 'pointer',
            color: 'var(--notion-text-primary, #37352f)',
          }}
        >
          {refreshing ? 'Analyzing...' : data?.score != null ? 'Refresh' : 'Generate Score'}
        </button>
      </div>

      {/* Profile */}
      {data?.profile && (
        <p style={{
          fontSize: 13,
          color: 'var(--notion-text-secondary, #787774)',
          margin: '0 0 8px 0',
          lineHeight: 1.6,
        }}>
          {data.profile}
        </p>
      )}

      {/* Recommendation */}
      {data?.recommendation && (
        <div style={{
          fontSize: 12,
          color: '#6366f1',
          background: '#eef2ff',
          borderRadius: 6,
          padding: '8px 10px',
          marginBottom: 8,
        }}>
          <strong>Recommended:</strong> {data.recommendation}
        </div>
      )}

      {/* Score breakdown */}
      {data?.reasons && data.reasons.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: 'var(--notion-text-secondary, #787774)',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {expanded ? 'Hide details' : 'Show scoring details'}
          </button>
          {expanded && (
            <div style={{ marginTop: 8 }}>
              {data.reasons.map((r, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                  fontSize: 12,
                  borderBottom: i < data.reasons.length - 1 ? '1px solid var(--notion-border, #eee)' : 'none',
                }}>
                  <span style={{ color: 'var(--notion-text-primary, #37352f)' }}>{r.factor}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--notion-text-secondary, #787774)', fontSize: 11 }}>{r.detail}</span>
                    <span style={{ fontWeight: 600, color: scoreColor(r.points * 4) }}>{r.points}pts</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {data?.score_updated_at && (
        <div style={{ fontSize: 11, color: 'var(--notion-text-tertiary, #999)', marginTop: 8 }}>
          Updated: {new Date(data.score_updated_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
