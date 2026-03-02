import express from 'express';
import pino from 'pino';
import { config } from './config';
import { verifyBridgeSecret } from './middleware/auth';
import { restoreAll } from './sessions/session-manager';
import sessionsRouter from './routes/sessions';
import healthRouter from './routes/health';

const logger = pino({ level: config.logLevel });
const app = express();

app.use(express.json());

// Health check (no auth required)
app.use('/health', healthRouter);

// All session routes require bridge secret
app.use('/sessions', verifyBridgeSecret, sessionsRouter);

app.listen(config.port, async () => {
  logger.info({ port: config.port }, 'WhatsApp Bridge started');

  // Restore existing sessions on startup
  try {
    await restoreAll();
    logger.info('Session restore complete');
  } catch (err) {
    logger.error({ err }, 'Failed to restore sessions');
  }
});
