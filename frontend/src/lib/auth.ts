import { api } from './api';

export interface JwtPayload {
  sub: string;
  email: string;
  name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role: string;
  tenant_id: string | null;
  tenant_slug: string | null;
  permissions: string[];
  exp: number;
}

export interface AuthSnapshot {
  token: string | null;
  user: JwtPayload | null;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nexus_token');
}

export function setToken(token: string): void {
  localStorage.setItem('nexus_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('nexus_token');
  localStorage.removeItem('nexus_user');
}

export function parseJwt(token: string): JwtPayload | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

export async function login(email: string, password: string, tenantSlug?: string) {
  const data = await api.post('/api/auth/login', { email, password, tenant_slug: tenantSlug || null });
  setToken(data.access_token);
  const parsed = parseJwt(data.access_token);
  if (parsed) localStorage.setItem('nexus_user', JSON.stringify(parsed));
  return data;
}

export function logout() {
  clearToken();
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  const parsed = parseJwt(token);
  if (!parsed) return false;
  return parsed.exp * 1000 > Date.now();
}

export function getCurrentUser(): JwtPayload | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('nexus_user') || 'null'); } catch { return null; }
}

export function getAuthSnapshot(): AuthSnapshot {
  return {
    token: getToken(),
    user: getCurrentUser(),
  };
}

/** Refresh user profile from backend and update local cache (avatar, name, permissions). */
export async function refreshProfile(): Promise<JwtPayload | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await api.get('/api/auth/me');
    const next: JwtPayload = {
      sub: data.id,
      email: data.email,
      role: data.role,
      tenant_id: data.tenant_id,
      tenant_slug: data.tenant_slug,
      permissions: data.permissions || [],
      full_name: data.full_name || data.name || null,
      name: data.full_name || data.name || null,
      avatar_url: data.avatar_url || null,
      exp: parseJwt(token)?.exp || Math.floor(Date.now() / 1000) + 3600,
    };
    localStorage.setItem('nexus_user', JSON.stringify(next));
    return next;
  } catch {
    return getCurrentUser();
  }
}

export function getTenantId(): string | null {
  return getCurrentUser()?.tenant_id ?? null;
}

export function updateStoredUser(patch: Partial<JwtPayload>): JwtPayload | null {
  const current = getCurrentUser();
  if (!current || typeof window === 'undefined') return current;
  const next = { ...current, ...patch };
  localStorage.setItem('nexus_user', JSON.stringify(next));
  return next;
}
