import { Router, Request, Response } from 'express';
import { getAllSessions } from '../sessions/session-manager';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const sessions = getAllSessions();
  const connected = Array.from(sessions.values()).filter(s => s.status === 'connected').length;

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    sessions: {
      total: sessions.size,
      connected,
    },
  });
});

export default router;
