/** Shared WhatsApp module helpers — time formatting & status colors. */

export function relTime(ts?: string): string {
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

export function absTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

export const WA_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  connected:    { bg: '#dcfce7', text: '#15803d' },
  disconnected: { bg: '#fef2f2', text: '#dc2626' },
  pending_qr:   { bg: '#fef9c3', text: '#a16207' },
};
