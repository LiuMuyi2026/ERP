const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const DEFAULT_TIMEOUT = 30_000;   // 30s for normal requests (covers external API calls)
const UPLOAD_TIMEOUT = 60_000;    // 60s for uploads
const STREAM_TIMEOUT = 120_000;   // 120s for streaming
const MAX_RETRIES = 2;            // retry up to 2 times (GET only)

export function getApiUrl(): string {
  return API_URL;
}

export function getAuthHeaders(
  headers: Record<string, string> = {},
  opts?: { tenantSlug?: string }
): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  const finalHeaders: Record<string, string> = { ...headers };
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  if (opts?.tenantSlug) finalHeaders['X-Tenant-Slug'] = opts.tenantSlug;
  return finalHeaders;
}

function isRetryable(method: string, status?: number): boolean {
  // Only retry GET/DELETE; never retry POST/PATCH/PUT (side effects)
  if (method !== 'GET' && method !== 'DELETE') return false;
  // Retry on network error (no status) or server errors (502/503/504)
  if (!status) return true;
  return status === 502 || status === 503 || status === 504;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit & { tenantSlug?: string; timeout?: number } = {}
): Promise<T> {
  const { tenantSlug, timeout, ...fetchOptions } = options;
  const headers = getAuthHeaders(
    {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    },
    { tenantSlug }
  );
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const reqTimeout = timeout ?? DEFAULT_TIMEOUT;

  let lastError: Error | null = null;
  const maxAttempts = isRetryable(method) ? MAX_RETRIES + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Exponential backoff before retry (skip first attempt)
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 5000)));
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${API_URL}${path}`,
        { ...fetchOptions, headers },
        reqTimeout,
      );
    } catch (err: any) {
      if (err.name === 'AbortError') {
        lastError = new Error('Request timed out. Please try again.');
      } else {
        lastError = new Error('Unable to reach API server. Please check your connection.');
      }
      // Retry if eligible
      if (isRetryable(method)) continue;
      throw lastError;
    }

    if (!response.ok) {
      if (response.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('nexus_token');
        window.location.href = '/login';
        throw new Error('Session expired');
      }
      // Retry on transient server errors for safe methods
      if (isRetryable(method, response.status) && attempt < maxAttempts - 1) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
  }

  throw lastError || new Error('Request failed');
}

export const api = {
  get: <T = any>(path: string, opts?: { tenantSlug?: string }) =>
    apiRequest<T>(path, { method: 'GET', ...opts }),
  post: <T = any>(path: string, body: any, opts?: { tenantSlug?: string }) =>
    apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body), ...opts }),
  patch: <T = any>(path: string, body: any, opts?: { tenantSlug?: string }) =>
    apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),
  put: <T = any>(path: string, body: any, opts?: { tenantSlug?: string }) =>
    apiRequest<T>(path, { method: 'PUT', body: JSON.stringify(body), ...opts }),
  delete: <T = any>(path: string, opts?: { tenantSlug?: string }) =>
    apiRequest<T>(path, { method: 'DELETE', ...opts }),

  upload: async function(path: string, file: File, opts?: { tenantSlug?: string; extraFields?: Record<string, string> }) {
    const headers = getAuthHeaders({}, { tenantSlug: opts?.tenantSlug });
    const form = new FormData();
    form.append('file', file);
    if (opts?.extraFields) {
      for (const [k, v] of Object.entries(opts.extraFields)) form.append(k, v);
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${API_URL}${path}`,
        { method: 'POST', body: form, headers },
        UPLOAD_TIMEOUT,
      );
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('Upload timed out. Please try again.');
      throw new Error('Unable to reach API server. Please check your connection.');
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
  },

  stream: async function* (path: string, body: any, opts?: { tenantSlug?: string }) {
    const headers = getAuthHeaders({ 'Content-Type': 'application/json' }, { tenantSlug: opts?.tenantSlug });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT);
    try {
      const response = await fetch(`${API_URL}${path}`, {
        method: 'POST', body: JSON.stringify(body), headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Stream request failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try { yield JSON.parse(line.slice(6)); } catch {}
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  },
};
