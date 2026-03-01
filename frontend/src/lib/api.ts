const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit & { tenantSlug?: string } = {}
): Promise<T> {
  const { tenantSlug, ...fetchOptions } = options;
  const headers = getAuthHeaders(
    {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    },
    { tenantSlug }
  );

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers });
  } catch {
    throw new Error('Unable to reach API server. Please check your connection.');
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('nexus_token');
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
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
      response = await fetch(`${API_URL}${path}`, { method: 'POST', body: form, headers });
    } catch {
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
    const response = await fetch(`${API_URL}${path}`, { method: 'POST', body: JSON.stringify(body), headers });
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
  },
};
