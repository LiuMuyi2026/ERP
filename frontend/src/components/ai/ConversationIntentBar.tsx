'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import MessageIntentBadge from './MessageIntentBadge';

type Classification = {
  message_id: string;
  intent: string;
  confidence: number;
  sub_intent?: string;
  suggested_action?: string;
};

export default function ConversationIntentBar({ contactId }: { contactId: string }) {
  const [classifications, setClassifications] = useState<Classification[]>([]);

  useEffect(() => {
    if (!contactId) return;
    api.get(`/api/ai/message-classifications/${contactId}`)
      .then(setClassifications)
      .catch(() => {});
  }, [contactId]);

  if (classifications.length === 0) return null;

  // Count intents
  const intentCounts: Record<string, number> = {};
  for (const c of classifications) {
    if (c.intent !== 'chitchat') {
      intentCounts[c.intent] = (intentCounts[c.intent] || 0) + 1;
    }
  }

  if (Object.keys(intentCounts).length === 0) return null;

  // Latest classification
  const latest = classifications[0];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 12px',
      background: 'rgba(99, 102, 241, 0.05)',
      borderBottom: '1px solid var(--notion-border, #e5e5e5)',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 10, color: 'var(--notion-text-secondary, #787774)', fontWeight: 500 }}>
        AI:
      </span>
      {Object.entries(intentCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([intent, count]) => (
          <span key={intent} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <MessageIntentBadge intent={intent} confidence={1} size="sm" />
            {count > 1 && (
              <span style={{ fontSize: 10, color: 'var(--notion-text-secondary, #787774)' }}>
                x{count}
              </span>
            )}
          </span>
        ))}
      {latest.sub_intent && (
        <span style={{ fontSize: 10, color: 'var(--notion-text-secondary, #787774)', marginLeft: 4 }}>
          Latest: {latest.sub_intent}
        </span>
      )}
    </div>
  );
}
