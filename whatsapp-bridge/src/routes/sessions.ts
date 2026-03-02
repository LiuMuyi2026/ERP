import { Router, Request, Response } from 'express';
import {
  startSession,
  getSession,
  sendMessage,
  closeSession,
  markRead,
  sendPresenceUpdate,
  sendReaction,
  forwardMessage,
  deleteMessage,
  editMessage,
  sendPoll,
  checkNumberExists,
  subscribePresence,
  getPresence,
  createGroup,
  getGroupMetadata,
  addGroupParticipants,
  removeGroupParticipants,
  setDisappearingMessages,
  getLabels,
} from '../sessions/session-manager';

const router = Router();

function errStatus(err: Error): number {
  if (err.message.includes('not found')) return 404;
  if (err.message.includes('not connected')) return 409;
  return 500;
}

// POST /sessions/:accountId/start
router.post('/:accountId/start', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { tenant_slug } = req.body;
    if (!tenant_slug) { res.status(400).json({ error: 'tenant_slug is required' }); return; }
    await startSession(aid, tenant_slug);
    res.json({ ok: true, status: 'connecting' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sessions/:accountId/qr
router.get('/:accountId/qr', (req: Request, res: Response) => {
  const aid = req.params.accountId as string;
  const session = getSession(aid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  res.json({ account_id: aid, status: session.status, qr_data: session.qrDataUrl });
});

// POST /sessions/:accountId/send
router.post('/:accountId/send', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid, content, message_type, media_url, media_mime_type, filename, caption, quoted_wa_key } = req.body;
    if (!jid) { res.status(400).json({ error: 'jid is required' }); return; }
    const result = await sendMessage(aid, jid, content || '', message_type || 'text', {
      media_url, media_mime_type, filename, caption, quoted_wa_key,
    });
    res.json(result);
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// DELETE /sessions/:accountId
router.delete('/:accountId', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { logout } = req.body || {};
    await closeSession(aid, logout === true);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sessions/:accountId/status
router.get('/:accountId/status', (req: Request, res: Response) => {
  const aid = req.params.accountId as string;
  const session = getSession(aid);
  if (!session) { res.status(404).json({ status: 'none' }); return; }
  res.json({ account_id: aid, status: session.status, has_qr: !!session.qrDataUrl });
});

// POST /sessions/:accountId/read
router.post('/:accountId/read', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid, message_ids } = req.body;
    if (!jid || !message_ids?.length) { res.status(400).json({ error: 'jid and message_ids required' }); return; }
    await markRead(aid, jid, message_ids);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/presence
router.post('/:accountId/presence', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid, type } = req.body;
    if (!jid || !type) { res.status(400).json({ error: 'jid and type required' }); return; }
    await sendPresenceUpdate(aid, jid, type);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/react
router.post('/:accountId/react', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid, message_key, emoji } = req.body;
    if (!jid || !message_key || !emoji) { res.status(400).json({ error: 'jid, message_key, emoji required' }); return; }
    await sendReaction(aid, jid, message_key, emoji);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/forward
router.post('/:accountId/forward', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { source_jid, target_jid, message_key } = req.body;
    if (!source_jid || !target_jid || !message_key) {
      res.status(400).json({ error: 'source_jid, target_jid, message_key required' }); return;
    }
    const result = await forwardMessage(aid, source_jid, target_jid, message_key);
    res.json(result);
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/delete-message
router.post('/:accountId/delete-message', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid, message_key } = req.body;
    if (!jid || !message_key) { res.status(400).json({ error: 'jid and message_key required' }); return; }
    await deleteMessage(aid, jid, message_key);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/edit-message
router.post('/:accountId/edit-message', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid, message_key, new_content } = req.body;
    if (!jid || !message_key || !new_content) {
      res.status(400).json({ error: 'jid, message_key, new_content required' }); return;
    }
    await editMessage(aid, jid, message_key, new_content);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/send-poll
router.post('/:accountId/send-poll', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid, question, options, allow_multiple } = req.body;
    if (!jid || !question || !options?.length) {
      res.status(400).json({ error: 'jid, question, options required' }); return;
    }
    const result = await sendPoll(aid, jid, question, options, allow_multiple);
    res.json(result);
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/check-number
router.post('/:accountId/check-number', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { phone_numbers } = req.body;
    if (!phone_numbers?.length) { res.status(400).json({ error: 'phone_numbers required' }); return; }
    const results = await checkNumberExists(aid, phone_numbers);
    res.json({ results });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/subscribe-presence
router.post('/:accountId/subscribe-presence', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid } = req.body;
    if (!jid) { res.status(400).json({ error: 'jid required' }); return; }
    await subscribePresence(aid, jid);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// GET /sessions/:accountId/presence/:jid
router.get('/:accountId/presence/:jid', (req: Request, res: Response) => {
  const aid = req.params.accountId as string;
  const jid = req.params.jid as string;
  const presence = getPresence(aid, jid);
  res.json(presence || { status: 'unavailable' });
});

// POST /sessions/:accountId/groups/create
router.post('/:accountId/groups/create', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { name, participants } = req.body;
    if (!name || !participants?.length) { res.status(400).json({ error: 'name and participants required' }); return; }
    const result = await createGroup(aid, name, participants);
    res.json(result);
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// GET /sessions/:accountId/groups/:groupJid/metadata
router.get('/:accountId/groups/:groupJid/metadata', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const groupJid = req.params.groupJid as string;
    const metadata = await getGroupMetadata(aid, groupJid);
    res.json(metadata);
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/groups/:groupJid/participants/add
router.post('/:accountId/groups/:groupJid/participants/add', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const groupJid = req.params.groupJid as string;
    const { participants } = req.body;
    if (!participants?.length) { res.status(400).json({ error: 'participants required' }); return; }
    await addGroupParticipants(aid, groupJid, participants);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/groups/:groupJid/participants/remove
router.post('/:accountId/groups/:groupJid/participants/remove', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const groupJid = req.params.groupJid as string;
    const { participants } = req.body;
    if (!participants?.length) { res.status(400).json({ error: 'participants required' }); return; }
    await removeGroupParticipants(aid, groupJid, participants);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// POST /sessions/:accountId/disappearing
router.post('/:accountId/disappearing', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const { jid, duration } = req.body;
    if (!jid || duration === undefined) { res.status(400).json({ error: 'jid and duration required' }); return; }
    await setDisappearingMessages(aid, jid, duration);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

// GET /sessions/:accountId/labels
router.get('/:accountId/labels', async (req: Request, res: Response) => {
  try {
    const aid = req.params.accountId as string;
    const labels = await getLabels(aid);
    res.json({ labels });
  } catch (err: any) {
    res.status(errStatus(err)).json({ error: err.message });
  }
});

export default router;
