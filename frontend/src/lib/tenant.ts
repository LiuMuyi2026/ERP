import { getCurrentUser } from './auth';

export function getTenantSlug(): string | null {
  const user = getCurrentUser();
  return user?.tenant_slug || null;
}
