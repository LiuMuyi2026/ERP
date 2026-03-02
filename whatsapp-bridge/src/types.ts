import type { WASocket, proto } from '@whiskeysockets/baileys';

export interface SessionEntry {
  socket: WASocket;
  accountId: string;
  tenantSlug: string;
  qrDataUrl: string | null;
  status: 'connecting' | 'connected' | 'disconnected';
  retryCount: number;
  presenceMap: Map<string, { status: string; lastSeen?: number }>;
}

export interface SessionMetadata {
  accountId: string;
  tenantSlug: string;
  createdAt: string;
  waJid?: string;
  phoneNumber?: string;
  displayName?: string;
}

export interface WAKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export interface SendMessageRequest {
  jid: string;
  content: string;
  message_type: 'text' | 'image' | 'document' | 'audio' | 'video';
  media_url?: string;
  media_mime_type?: string;
  filename?: string;
  caption?: string;
  quoted_wa_key?: WAKey;
}

export interface AuthUpdatePayload {
  wa_account_id: string;
  status: string;
  wa_jid?: string;
  phone_number?: string;
  display_name?: string;
  profile_pic_url?: string;
}

export interface MessageReceivedPayload {
  wa_account_id: string;
  wa_jid: string;
  wa_message_id?: string;
  content?: string;
  message_type: string;
  media_url?: string;
  media_mime_type?: string;
  timestamp?: string;
  push_name?: string;
  profile_pic_url?: string;
  wa_key?: WAKey;
  quoted_message_id?: string;
  quoted_content?: string;
  direction?: string;
  is_history_sync?: boolean;
}

export interface StatusUpdatePayload {
  wa_message_id: string;
  status: string;
}

export interface ReactionReceivedPayload {
  wa_account_id: string;
  wa_message_id: string;
  reactor_jid: string;
  emoji: string | null;
  timestamp: string;
}

export interface MessageDeletedPayload {
  wa_account_id: string;
  wa_message_id: string;
}

export interface MessageEditedPayload {
  wa_account_id: string;
  wa_message_id: string;
  new_content: string;
  timestamp: string;
}

export interface PollVotePayload {
  wa_account_id: string;
  wa_message_id: string;
  voter_jid: string;
  selected_options: number[];
}

export interface GroupUpdatePayload {
  wa_account_id: string;
  group_jid: string;
  metadata: Record<string, any>;
}

export interface GroupParticipantsPayload {
  wa_account_id: string;
  group_jid: string;
  action: string;
  participants: string[];
}

export interface LabelPayload {
  wa_account_id: string;
  labels: Array<{ id: string; name: string; color: string }>;
}

export interface LabelAssociationPayload {
  wa_account_id: string;
  label_id: string;
  chat_jid: string;
  action: 'add' | 'remove';
}
