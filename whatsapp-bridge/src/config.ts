export const config = {
  port: parseInt(process.env.PORT || '3100', 10),
  bridgeSecret: process.env.BRIDGE_SECRET || '',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:8000',
  sessionDir: process.env.SESSION_DIR || './data/wa-sessions',
  logLevel: process.env.LOG_LEVEL || 'info',
};
