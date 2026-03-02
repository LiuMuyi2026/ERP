import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WAMessageUpdate,
  proto,
  downloadMediaMessage,
  getContentType,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  AnyMessageContent,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import pino from 'pino';
import axios from 'axios';
import { config } from '../config';
import { getAuthState, saveMetadata, loadMetadata, deleteSessionFiles, listSessionDirs } from './auth-state';
import { backendClient } from '../services/backend-client';
import type { SessionEntry, SessionMetadata, WAKey } from '../types';

const logger = pino({ level: config.logLevel });
const sessions = new Map<string, SessionEntry>();
const MAX_RETRIES = 5;

// ── Helper: download media from URL to Buffer ──
async function downloadMedia(url: string): Promise<Buffer> {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  return Buffer.from(response.data);
}

// ── Helper: get profile picture URL (safe) ──
async function getProfilePicUrl(socket: any, jid: string): Promise<string | undefined> {
  try {
    return await socket.profilePictureUrl(jid, 'image');
  } catch {
    return undefined;
  }
}

// ── Session access ──
export function getSession(accountId: string): SessionEntry | undefined {
  return sessions.get(accountId);
}

export function getAllSessions(): Map<string, SessionEntry> {
  return sessions;
}

// ── Helper: require connected session ──
function requireSession(accountId: string): SessionEntry {
  const entry = sessions.get(accountId);
  if (!entry) throw new Error('Session not found');
  if (entry.status !== 'connected') throw new Error(`Session not connected (status: ${entry.status})`);
  return entry;
}

// ── Start session ──
export async function startSession(accountId: string, tenantSlug: string): Promise<void> {
  const existing = sessions.get(accountId);
  if (existing) {
    try { existing.socket.end(undefined); } catch {}
    sessions.delete(accountId);
  }

  const { state, saveCreds } = await getAuthState(accountId);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger as any),
    },
    logger: logger as any,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
  });

  const entry: SessionEntry = {
    socket,
    accountId,
    tenantSlug,
    qrDataUrl: null,
    status: 'connecting',
    retryCount: 0,
    presenceMap: new Map(),
  };
  sessions.set(accountId, entry);

  const metadata: SessionMetadata = {
    accountId,
    tenantSlug,
    createdAt: new Date().toISOString(),
  };
  await saveMetadata(accountId, metadata);

  // ── Connection updates ──
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        entry.qrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
        entry.status = 'connecting';
        logger.info({ accountId }, 'QR code generated');
      } catch (err) {
        logger.error({ err, accountId }, 'Failed to generate QR data URL');
      }
    }

    if (connection === 'open') {
      entry.status = 'connected';
      entry.qrDataUrl = null;
      entry.retryCount = 0;

      const jid = socket.user?.id;
      const phoneNumber = jid?.split(':')[0] || jid?.split('@')[0] || undefined;
      const displayName = socket.user?.name || undefined;
      const profilePicUrl = jid ? await getProfilePicUrl(socket, jid) : undefined;

      metadata.waJid = jid;
      metadata.phoneNumber = phoneNumber;
      metadata.displayName = displayName;
      await saveMetadata(accountId, metadata);

      await backendClient.authUpdate(tenantSlug, {
        wa_account_id: accountId,
        status: 'connected',
        wa_jid: jid,
        phone_number: phoneNumber,
        display_name: displayName,
        profile_pic_url: profilePicUrl,
      });

      logger.info({ accountId, jid }, 'WhatsApp connected');
    }

    if (connection === 'close') {
      entry.status = 'disconnected';
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const errorMessage = (lastDisconnect?.error as Error)?.message || 'unknown';
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      logger.info({ accountId, statusCode, loggedOut, errorMessage, retryCount: entry.retryCount }, 'WhatsApp disconnected');

      if (loggedOut) {
        sessions.delete(accountId);
        await deleteSessionFiles(accountId);
        await backendClient.authUpdate(tenantSlug, {
          wa_account_id: accountId,
          status: 'disconnected',
        });
      } else if (entry.retryCount < MAX_RETRIES) {
        entry.retryCount++;
        const delay = Math.min(entry.retryCount * 2000, 30000);
        logger.info({ accountId, retryCount: entry.retryCount, delay }, 'Reconnecting...');
        setTimeout(() => startSession(accountId, tenantSlug), delay);
      } else {
        logger.error({ accountId }, 'Max retries reached, giving up');
        sessions.delete(accountId);
        await backendClient.authUpdate(tenantSlug, {
          wa_account_id: accountId,
          status: 'disconnected',
        });
      }
    }
  });

  socket.ev.on('creds.update', saveCreds);

  // ── Incoming messages (notify + history sync) ──
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    const isHistorySync = type === 'append';
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      const fromMe = msg.key.fromMe || false;
      // For notify, skip own messages (they go through sendMessage flow)
      if (type === 'notify' && fromMe) continue;

      const messageContent = extractMessageContent(msg.message);
      const waKey: WAKey = { remoteJid: jid, fromMe, id: msg.key.id || '' };

      // Extract quoted message info
      let quotedMessageId: string | undefined;
      let quotedContent: string | undefined;
      const contextInfo = extractContextInfo(msg.message);
      if (contextInfo?.quotedMessage) {
        quotedMessageId = contextInfo.stanzaId || undefined;
        const quoted = extractMessageContent(contextInfo.quotedMessage);
        quotedContent = quoted.text;
      }

      // Check for reaction messages
      if (msg.message?.reactionMessage) {
        const reaction = msg.message.reactionMessage;
        const targetKey = reaction.key;
        if (targetKey?.id) {
          await backendClient.reactionReceived(tenantSlug, {
            wa_account_id: accountId,
            wa_message_id: targetKey.id,
            reactor_jid: jid,
            emoji: reaction.text || null,
            timestamp: new Date((msg.messageTimestamp as number) * 1000).toISOString(),
          });
        }
        continue;
      }

      // Check for poll creation
      if (msg.message?.pollCreationMessage || msg.message?.pollCreationMessageV3) {
        const poll = msg.message.pollCreationMessage || msg.message.pollCreationMessageV3;
        if (poll) {
          const options = (poll.options || []).map((o: any) => o.optionName || '');
          await backendClient.messageReceived(tenantSlug, {
            wa_account_id: accountId,
            wa_jid: jid,
            wa_message_id: msg.key.id || undefined,
            content: poll.name || '',
            message_type: 'poll',
            timestamp: new Date((msg.messageTimestamp as number) * 1000).toISOString(),
            push_name: msg.pushName || undefined,
            wa_key: waKey,
            direction: fromMe ? 'outbound' : 'inbound',
            is_history_sync: isHistorySync,
          });
        }
        continue;
      }

      // Check for poll update (vote)
      if (msg.message?.pollUpdateMessage) {
        // Poll votes are encrypted; skip for now (handled via pollUpdateMessageV2 events)
        continue;
      }

      // Get profile pic for inbound messages
      let profilePicUrl: string | undefined;
      if (!fromMe && type === 'notify') {
        profilePicUrl = await getProfilePicUrl(socket, jid);
      }

      await backendClient.messageReceived(tenantSlug, {
        wa_account_id: accountId,
        wa_jid: jid,
        wa_message_id: msg.key.id || undefined,
        content: messageContent.text,
        message_type: messageContent.type,
        media_url: messageContent.mediaUrl,
        media_mime_type: messageContent.mimetype,
        timestamp: new Date((msg.messageTimestamp as number) * 1000).toISOString(),
        push_name: msg.pushName || undefined,
        profile_pic_url: profilePicUrl,
        wa_key: waKey,
        quoted_message_id: quotedMessageId,
        quoted_content: quotedContent,
        direction: fromMe ? 'outbound' : 'inbound',
        is_history_sync: isHistorySync,
      });
    }
  });

  // ── Message status updates (delivered, read) ──
  socket.ev.on('messages.update', async (updates: WAMessageUpdate[]) => {
    for (const update of updates) {
      if (!update.key.id) continue;

      // Check for message deletion (revoke)
      if (update.update?.messageStubType === 1) {
        await backendClient.messageDeleted(tenantSlug, {
          wa_account_id: accountId,
          wa_message_id: update.key.id,
        });
        continue;
      }

      const statusMap: Record<number, string> = {
        2: 'sent',
        3: 'delivered',
        4: 'read',
      };
      const status = statusMap[update.update?.status || 0];
      if (status) {
        await backendClient.statusUpdate(tenantSlug, {
          wa_message_id: update.key.id,
          status,
        });
      }
    }
  });

  // ── Message edit detection ──
  socket.ev.on('messages.update', async (updates: WAMessageUpdate[]) => {
    for (const update of updates) {
      if (!update.key.id) continue;
      const editedMsg = (update.update as any)?.message;
      if (editedMsg) {
        const content = extractMessageContent(editedMsg);
        if (content.text) {
          await backendClient.messageEdited(tenantSlug, {
            wa_account_id: accountId,
            wa_message_id: update.key.id,
            new_content: content.text,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  });

  // ── Group updates ──
  socket.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      if (!update.id) continue;
      await backendClient.groupUpdated(tenantSlug, {
        wa_account_id: accountId,
        group_jid: update.id,
        metadata: update as Record<string, any>,
      });
    }
  });

  // ── Group participant updates ──
  socket.ev.on('group-participants.update', async (update) => {
    await backendClient.groupParticipantsUpdated(tenantSlug, {
      wa_account_id: accountId,
      group_jid: update.id,
      action: update.action,
      participants: update.participants,
    });
  });

  // ── Label updates ──
  socket.ev.on('labels.edit', async (label: any) => {
    // Fetch all labels and send to backend
    try {
      const store = (socket as any).store;
      if (store?.labels) {
        const labels = Object.values(store.labels).map((l: any) => ({
          id: l.id, name: l.name, color: l.color?.toString() || '',
        }));
        await backendClient.labelsUpdated(tenantSlug, {
          wa_account_id: accountId,
          labels,
        });
      }
    } catch (err) {
      logger.warn({ err, accountId }, 'Failed to process label edit');
    }
  });

  socket.ev.on('labels.association', async (assoc: any) => {
    try {
      await backendClient.labelAssociation(tenantSlug, {
        wa_account_id: accountId,
        label_id: assoc.labelId || assoc.id || '',
        chat_jid: assoc.chatId || assoc.jid || '',
        action: assoc.type === 'remove' ? 'remove' : 'add',
      });
    } catch (err) {
      logger.warn({ err, accountId }, 'Failed to process label association');
    }
  });

  // ── Presence updates ──
  socket.ev.on('presence.update', async (update) => {
    const jid = Object.keys(update?.presences || {})[0] || update.id;
    const presenceData = update.presences?.[jid];
    if (jid && presenceData) {
      entry.presenceMap.set(jid, {
        status: presenceData.lastKnownPresence || 'unavailable',
        lastSeen: presenceData.lastSeen || undefined,
      });
    }
  });
}

// ── Extract context info for quoted messages ──
function extractContextInfo(message: proto.IMessage | null | undefined): proto.IContextInfo | null {
  if (!message) return null;
  if (message.extendedTextMessage?.contextInfo) return message.extendedTextMessage.contextInfo;
  if (message.imageMessage?.contextInfo) return message.imageMessage.contextInfo;
  if (message.videoMessage?.contextInfo) return message.videoMessage.contextInfo;
  if (message.audioMessage?.contextInfo) return message.audioMessage.contextInfo;
  if (message.documentMessage?.contextInfo) return message.documentMessage.contextInfo;
  return null;
}

// ── Extract message content ──
function extractMessageContent(message: proto.IMessage | null | undefined): {
  text?: string;
  type: string;
  mediaUrl?: string;
  mimetype?: string;
} {
  if (!message) return { type: 'text' };

  if (message.conversation) {
    return { text: message.conversation, type: 'text' };
  }
  if (message.extendedTextMessage?.text) {
    return { text: message.extendedTextMessage.text, type: 'text' };
  }
  if (message.imageMessage) {
    return {
      text: message.imageMessage.caption || undefined,
      type: 'image',
      mimetype: message.imageMessage.mimetype || undefined,
      mediaUrl: message.imageMessage.url || undefined,
    };
  }
  if (message.videoMessage) {
    return {
      text: message.videoMessage.caption || undefined,
      type: 'video',
      mimetype: message.videoMessage.mimetype || undefined,
      mediaUrl: message.videoMessage.url || undefined,
    };
  }
  if (message.audioMessage) {
    return {
      type: 'audio',
      mimetype: message.audioMessage.mimetype || undefined,
      mediaUrl: message.audioMessage.url || undefined,
    };
  }
  if (message.documentMessage) {
    return {
      text: message.documentMessage.fileName || undefined,
      type: 'document',
      mimetype: message.documentMessage.mimetype || undefined,
      mediaUrl: message.documentMessage.url || undefined,
    };
  }
  if (message.stickerMessage) {
    return { type: 'sticker' };
  }
  if (message.contactMessage) {
    return { text: message.contactMessage.displayName || undefined, type: 'contact' };
  }
  if (message.locationMessage) {
    const lat = message.locationMessage.degreesLatitude;
    const lng = message.locationMessage.degreesLongitude;
    return { text: `Location: ${lat}, ${lng}`, type: 'location' };
  }
  if (message.editedMessage?.message) {
    return extractMessageContent(message.editedMessage.message);
  }

  return { type: 'text' };
}

// ── Send message (supports text + media + quoted reply) ──
export async function sendMessage(
  accountId: string,
  jid: string,
  content: string,
  messageType: string = 'text',
  options: {
    media_url?: string;
    media_mime_type?: string;
    filename?: string;
    caption?: string;
    quoted_wa_key?: WAKey;
  } = {},
): Promise<{ wa_message_id?: string; wa_key?: WAKey; status: string }> {
  const entry = requireSession(accountId);

  // Build quoted message reference if provided
  let quoted: any = undefined;
  if (options.quoted_wa_key) {
    quoted = {
      key: {
        remoteJid: options.quoted_wa_key.remoteJid,
        fromMe: options.quoted_wa_key.fromMe,
        id: options.quoted_wa_key.id,
      },
    };
  }

  let msgContent: AnyMessageContent;

  if (messageType === 'text' || !options.media_url) {
    msgContent = { text: content };
  } else {
    const mediaBuffer = await downloadMedia(options.media_url);
    const caption = options.caption || content || undefined;

    switch (messageType) {
      case 'image':
        msgContent = { image: mediaBuffer, caption, mimetype: options.media_mime_type } as any;
        break;
      case 'video':
        msgContent = { video: mediaBuffer, caption, mimetype: options.media_mime_type } as any;
        break;
      case 'audio':
        msgContent = { audio: mediaBuffer, ptt: true, mimetype: options.media_mime_type || 'audio/ogg; codecs=opus' } as any;
        break;
      case 'document':
        msgContent = {
          document: mediaBuffer,
          fileName: options.filename || 'file',
          mimetype: options.media_mime_type || 'application/octet-stream',
        } as any;
        break;
      default:
        msgContent = { text: content };
    }
  }

  const sentMsg = await entry.socket.sendMessage(jid, msgContent, { quoted });

  const waKey: WAKey | undefined = sentMsg?.key ? {
    remoteJid: sentMsg.key.remoteJid || jid,
    fromMe: sentMsg.key.fromMe || true,
    id: sentMsg.key.id || '',
  } : undefined;

  return {
    wa_message_id: sentMsg?.key?.id || undefined,
    wa_key: waKey,
    status: 'sent',
  };
}

// ── Mark messages as read ──
export async function markRead(
  accountId: string,
  jid: string,
  messageIds: string[],
): Promise<void> {
  const entry = requireSession(accountId);
  const keys = messageIds.map(id => ({
    remoteJid: jid,
    id,
    fromMe: false,
  }));
  await entry.socket.readMessages(keys);
}

// ── Send presence update (composing/paused) ──
export async function sendPresenceUpdate(
  accountId: string,
  jid: string,
  type: 'composing' | 'paused',
): Promise<void> {
  const entry = requireSession(accountId);
  await entry.socket.sendPresenceUpdate(type, jid);
}

// ── Send reaction ──
export async function sendReaction(
  accountId: string,
  jid: string,
  messageKey: WAKey,
  emoji: string,
): Promise<void> {
  const entry = requireSession(accountId);
  await entry.socket.sendMessage(jid, {
    react: {
      text: emoji,
      key: {
        remoteJid: messageKey.remoteJid,
        fromMe: messageKey.fromMe,
        id: messageKey.id,
      },
    },
  });
}

// ── Forward message ──
export async function forwardMessage(
  accountId: string,
  sourceJid: string,
  targetJid: string,
  messageKey: WAKey,
): Promise<{ wa_message_id?: string; status: string }> {
  const entry = requireSession(accountId);

  const userJid = entry.socket.user?.id || '';
  const forwardContent = generateForwardMessageContent(
    { key: { remoteJid: messageKey.remoteJid, fromMe: messageKey.fromMe, id: messageKey.id } } as any,
    false,
  );
  const waMsg = generateWAMessageFromContent(targetJid, forwardContent, { userJid });
  await entry.socket.relayMessage(targetJid, waMsg.message!, { messageId: waMsg.key.id! });

  return {
    wa_message_id: waMsg.key.id || undefined,
    status: 'sent',
  };
}

// ── Delete message (revoke) ──
export async function deleteMessage(
  accountId: string,
  jid: string,
  messageKey: WAKey,
): Promise<void> {
  const entry = requireSession(accountId);
  await entry.socket.sendMessage(jid, {
    delete: {
      remoteJid: messageKey.remoteJid,
      fromMe: messageKey.fromMe,
      id: messageKey.id,
    },
  });
}

// ── Edit message ──
export async function editMessage(
  accountId: string,
  jid: string,
  messageKey: WAKey,
  newContent: string,
): Promise<void> {
  const entry = requireSession(accountId);
  await entry.socket.sendMessage(jid, {
    text: newContent,
    edit: {
      remoteJid: messageKey.remoteJid,
      fromMe: messageKey.fromMe,
      id: messageKey.id,
    },
  });
}

// ── Send poll ──
export async function sendPoll(
  accountId: string,
  jid: string,
  question: string,
  options: string[],
  allowMultiple: boolean = false,
): Promise<{ wa_message_id?: string; status: string }> {
  const entry = requireSession(accountId);
  const sentMsg = await entry.socket.sendMessage(jid, {
    poll: {
      name: question,
      values: options,
      selectableCount: allowMultiple ? 0 : 1,
    },
  });
  return {
    wa_message_id: sentMsg?.key?.id || undefined,
    status: 'sent',
  };
}

// ── Check number exists on WhatsApp ──
export async function checkNumberExists(
  accountId: string,
  phoneNumbers: string[],
): Promise<Array<{ number: string; exists: boolean; jid?: string }>> {
  const entry = requireSession(accountId);
  const results = await entry.socket.onWhatsApp(...phoneNumbers) || [];
  return phoneNumbers.map(num => {
    const found = results.find((r: any) => r.jid?.includes(num.replace('+', '')));
    return {
      number: num,
      exists: !!found?.exists,
      jid: found?.jid,
    };
  });
}

// ── Subscribe to presence ──
export async function subscribePresence(
  accountId: string,
  jid: string,
): Promise<void> {
  const entry = requireSession(accountId);
  await entry.socket.presenceSubscribe(jid);
}

// ── Get presence ──
export function getPresence(
  accountId: string,
  jid: string,
): { status: string; lastSeen?: number } | null {
  const entry = sessions.get(accountId);
  if (!entry) return null;
  return entry.presenceMap.get(jid) || null;
}

// ── Group: create ──
export async function createGroup(
  accountId: string,
  name: string,
  participants: string[],
): Promise<{ groupJid: string }> {
  const entry = requireSession(accountId);
  const result = await entry.socket.groupCreate(name, participants);
  return { groupJid: result.id };
}

// ── Group: get metadata ──
export async function getGroupMetadata(
  accountId: string,
  groupJid: string,
): Promise<any> {
  const entry = requireSession(accountId);
  return await entry.socket.groupMetadata(groupJid);
}

// ── Group: add participants ──
export async function addGroupParticipants(
  accountId: string,
  groupJid: string,
  participants: string[],
): Promise<void> {
  const entry = requireSession(accountId);
  await entry.socket.groupParticipantsUpdate(groupJid, participants, 'add');
}

// ── Group: remove participants ──
export async function removeGroupParticipants(
  accountId: string,
  groupJid: string,
  participants: string[],
): Promise<void> {
  const entry = requireSession(accountId);
  await entry.socket.groupParticipantsUpdate(groupJid, participants, 'remove');
}

// ── Set disappearing messages ──
export async function setDisappearingMessages(
  accountId: string,
  jid: string,
  duration: number,
): Promise<void> {
  const entry = requireSession(accountId);
  await entry.socket.sendMessage(jid, {
    disappearingMessagesInChat: duration === 0 ? false : duration,
  });
}

// ── Get labels ──
export async function getLabels(
  accountId: string,
): Promise<Array<{ id: string; name: string; color: string }>> {
  const entry = requireSession(accountId);
  try {
    const store = (entry.socket as any).store;
    if (store?.labels) {
      return Object.values(store.labels).map((l: any) => ({
        id: l.id, name: l.name, color: l.color?.toString() || '',
      }));
    }
  } catch {}
  return [];
}

// ── Close session ──
export async function closeSession(accountId: string, logout: boolean = false): Promise<void> {
  const entry = sessions.get(accountId);
  if (entry) {
    try {
      if (logout) {
        await entry.socket.logout();
      } else {
        entry.socket.end(undefined);
      }
    } catch (err) {
      logger.warn({ err, accountId }, 'Error closing session');
    }
    sessions.delete(accountId);
  }
  if (logout) {
    await deleteSessionFiles(accountId);
  }
}

// ── Restore all sessions on startup ──
export async function restoreAll(): Promise<void> {
  const dirs = await listSessionDirs();
  logger.info({ count: dirs.length }, 'Restoring sessions...');

  for (const accountId of dirs) {
    const metadata = await loadMetadata(accountId);
    if (!metadata) {
      logger.warn({ accountId }, 'No metadata found, skipping');
      continue;
    }
    try {
      await startSession(metadata.accountId, metadata.tenantSlug);
      logger.info({ accountId: metadata.accountId }, 'Session restore initiated');
    } catch (err) {
      logger.error({ err, accountId: metadata.accountId }, 'Failed to restore session');
    }
  }
}
