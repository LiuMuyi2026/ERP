'use client';

const INTENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  inquiry: { label: '询价', color: '#2563eb', bg: '#eff6ff' },
  order: { label: '下单', color: '#0f7b6c', bg: '#e6f7f2' },
  support: { label: '售后', color: '#7c3aed', bg: '#f3e8ff' },
  payment: { label: '付款', color: '#16a34a', bg: '#f0fdf4' },
  complaint: { label: '投诉', color: '#dc2626', bg: '#fef2f2' },
  followup: { label: '跟进', color: '#ea580c', bg: '#fff7ed' },
  logistics: { label: '物流', color: '#0891b2', bg: '#ecfeff' },
  chitchat: { label: '闲聊', color: '#9ca3af', bg: '#f9fafb' },
};

type Props = {
  intent: string;
  confidence?: number;
  size?: 'sm' | 'md';
};

export default function MessageIntentBadge({ intent, confidence, size = 'sm' }: Props) {
  const config = INTENT_CONFIG[intent] || INTENT_CONFIG.chitchat;
  const fontSize = size === 'sm' ? 10 : 11;
  const padding = size === 'sm' ? '1px 6px' : '2px 8px';

  // Don't show low confidence chitchat
  if (intent === 'chitchat' && (confidence ?? 0) < 0.6) return null;

  return (
    <span
      title={confidence ? `${(confidence * 100).toFixed(0)}% confidence` : undefined}
      style={{
        display: 'inline-block',
        fontSize,
        fontWeight: 500,
        color: config.color,
        background: config.bg,
        borderRadius: 4,
        padding,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}

export { INTENT_CONFIG };
