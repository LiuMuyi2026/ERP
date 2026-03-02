import { Router, Request, Response } from 'express';
import { getAllSessions } from '../sessions/session-manager';
import { config } from '../config';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const sessions = getAllSessions();
  const connected = Array.from(sessions.values()).filter(s => s.status === 'connected').length;

  const sessionDetails = Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    status: s.status,
    has_qr: !!s.qrDataUrl,
    retry_count: s.retryCount,
  }));

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    sessions: {
      total: sessions.size,
      connected,
      details: sessionDetails,
    },
    config: {
      backend_url: config.backendUrl ? config.backendUrl.replace(/\/\/(.+?):(.+?)@/, '//$1:***@') : 'not set',
      session_dir: config.sessionDir,
      has_bridge_secret: !!config.bridgeSecret,
    },
  });
});

export default router;
