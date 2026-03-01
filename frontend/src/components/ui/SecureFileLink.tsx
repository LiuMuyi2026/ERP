'use client';

import { useState } from 'react';
import { HandIcon } from '@/components/ui/HandIcon';
import { getApiUrl, getAuthHeaders } from '@/lib/api';

/**
 * Renders a file link that opens through the backend's authenticated
 * file-token endpoint, ensuring only logged-in tenant users can access uploads.
 *
 * Fix: window.open must use an absolute URL (API_URL + signed_url) because
 * signed_url is a relative path on the backend (port 8000), not the frontend.
 */
export default function SecureFileLink({
  url,
  name,
  className,
  style,
  icon = 'document',
}: {
  url: string;
  name: string;
  className?: string;
  style?: React.CSSProperties;
  icon?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function open(e: React.MouseEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(
        `${apiUrl}/api/workspace/file-token?path=${encodeURIComponent(url)}`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) throw new Error('token fetch failed');
      const data = await res.json();
      // signed_url is relative (e.g. /api/workspace/file?t=...) — must use absolute API_URL
      window.open(`${apiUrl}${data.signed_url}`, '_blank', 'noopener,noreferrer');
    } catch {
      // Fallback: open the raw upload URL via backend StaticFiles
      window.open(`${getApiUrl()}${url}`, '_blank', 'noopener,noreferrer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={open}
      disabled={loading}
      className={className}
      style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left', ...style }}
    >
      {loading ? <><HandIcon name="alarm-clock" size={14} style={{ display: 'inline' }} />{' '}</> : <><HandIcon name={icon} size={14} style={{ display: 'inline' }} />{' '}</>}{name}
    </button>
  );
}
