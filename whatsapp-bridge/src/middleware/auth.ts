import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function verifyBridgeSecret(req: Request, res: Response, next: NextFunction): void {
  if (!config.bridgeSecret) {
    next();
    return;
  }
  const secret = req.headers['x-bridge-secret'] as string;
  if (secret !== config.bridgeSecret) {
    res.status(403).json({ error: 'Invalid bridge secret' });
    return;
  }
  next();
}
