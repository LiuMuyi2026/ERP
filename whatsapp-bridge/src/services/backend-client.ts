import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import type {
  AuthUpdatePayload,
  MessageReceivedPayload,
  StatusUpdatePayload,
  ReactionReceivedPayload,
  MessageDeletedPayload,
  MessageEditedPayload,
  PollVotePayload,
  GroupUpdatePayload,
  GroupParticipantsPayload,
  LabelPayload,
  LabelAssociationPayload,
} from '../types';
import pino from 'pino';

const logger = pino({ level: config.logLevel });

class BackendClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.backendUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': config.bridgeSecret,
      },
    });
  }

  private headers(tenantSlug: string) {
    return { headers: { 'X-Tenant-Slug': tenantSlug } };
  }

  async authUpdate(tenantSlug: string, payload: AuthUpdatePayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/auth-update', payload, this.headers(tenantSlug));
      logger.info({ accountId: payload.wa_account_id, status: payload.status }, 'auth-update sent');
    } catch (err: any) {
      logger.error({ err: err.message, accountId: payload.wa_account_id }, 'auth-update failed');
    }
  }

  async messageReceived(tenantSlug: string, payload: MessageReceivedPayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/message-received', payload, this.headers(tenantSlug));
      logger.info({ accountId: payload.wa_account_id, jid: payload.wa_jid }, 'message-received sent');
    } catch (err: any) {
      logger.error({ err: err.message, accountId: payload.wa_account_id }, 'message-received failed');
    }
  }

  async statusUpdate(tenantSlug: string, payload: StatusUpdatePayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/status-update', payload, this.headers(tenantSlug));
      logger.info({ messageId: payload.wa_message_id, status: payload.status }, 'status-update sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'status-update failed');
    }
  }

  async reactionReceived(tenantSlug: string, payload: ReactionReceivedPayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/reaction-received', payload, this.headers(tenantSlug));
      logger.info({ messageId: payload.wa_message_id }, 'reaction-received sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'reaction-received failed');
    }
  }

  async messageDeleted(tenantSlug: string, payload: MessageDeletedPayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/message-deleted', payload, this.headers(tenantSlug));
      logger.info({ messageId: payload.wa_message_id }, 'message-deleted sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'message-deleted failed');
    }
  }

  async messageEdited(tenantSlug: string, payload: MessageEditedPayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/message-edited', payload, this.headers(tenantSlug));
      logger.info({ messageId: payload.wa_message_id }, 'message-edited sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'message-edited failed');
    }
  }

  async pollVoteReceived(tenantSlug: string, payload: PollVotePayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/poll-vote-received', payload, this.headers(tenantSlug));
      logger.info({ messageId: payload.wa_message_id }, 'poll-vote-received sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'poll-vote-received failed');
    }
  }

  async groupUpdated(tenantSlug: string, payload: GroupUpdatePayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/group-updated', payload, this.headers(tenantSlug));
      logger.info({ groupJid: payload.group_jid }, 'group-updated sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'group-updated failed');
    }
  }

  async groupParticipantsUpdated(tenantSlug: string, payload: GroupParticipantsPayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/group-participants-updated', payload, this.headers(tenantSlug));
      logger.info({ groupJid: payload.group_jid, action: payload.action }, 'group-participants-updated sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'group-participants-updated failed');
    }
  }

  async labelsUpdated(tenantSlug: string, payload: LabelPayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/labels-updated', payload, this.headers(tenantSlug));
      logger.info({ accountId: payload.wa_account_id }, 'labels-updated sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'labels-updated failed');
    }
  }

  async labelAssociation(tenantSlug: string, payload: LabelAssociationPayload): Promise<void> {
    try {
      await this.client.post('/api/whatsapp/internal/label-association', payload, this.headers(tenantSlug));
      logger.info({ labelId: payload.label_id, chatJid: payload.chat_jid }, 'label-association sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'label-association failed');
    }
  }
}

export const backendClient = new BackendClient();
