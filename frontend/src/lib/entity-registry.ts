/**
 * Entity Registry client — unified UID lookup.
 *
 * Provides functions to search/lookup entities by UID, phone, email, or WhatsApp JID.
 */

import { api } from './api';

export interface EntityRecord {
  uid: string;
  entity_type: string;
  entity_id: string;
  display_name: string | null;
  phone_e164: string | null;
  email_lower: string | null;
  whatsapp_jid: string | null;
  priority: number;
  metadata?: Record<string, any>;
}

export async function searchEntities(
  query: string,
  opts?: { entityType?: string; limit?: number }
): Promise<EntityRecord[]> {
  const params = new URLSearchParams({ q: query });
  if (opts?.entityType) params.set('entity_type', opts.entityType);
  if (opts?.limit) params.set('limit', String(opts.limit));
  return api.get<EntityRecord[]>(`/api/entity-registry/search?${params}`);
}

export async function lookupByUid(uid: string): Promise<EntityRecord> {
  return api.get<EntityRecord>(`/api/entity-registry/by-uid/${encodeURIComponent(uid)}`);
}

export async function lookupByPhone(phone: string): Promise<EntityRecord> {
  return api.get<EntityRecord>(`/api/entity-registry/by-phone/${encodeURIComponent(phone)}`);
}

export async function lookupByWhatsApp(jid: string): Promise<EntityRecord> {
  return api.get<EntityRecord>(`/api/entity-registry/by-whatsapp/${encodeURIComponent(jid)}`);
}

export async function lookupByEmail(email: string): Promise<EntityRecord> {
  return api.get<EntityRecord>(`/api/entity-registry/by-email/${encodeURIComponent(email)}`);
}
