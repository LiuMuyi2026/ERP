import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config';
import type { SessionMetadata } from '../types';

export async function getAuthState(accountId: string) {
  const dir = path.join(config.sessionDir, accountId);
  await fs.mkdir(dir, { recursive: true });
  return useMultiFileAuthState(dir);
}

export async function saveMetadata(accountId: string, metadata: SessionMetadata): Promise<void> {
  const metaPath = path.join(config.sessionDir, accountId, 'metadata.json');
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
}

export async function loadMetadata(accountId: string): Promise<SessionMetadata | null> {
  const metaPath = path.join(config.sessionDir, accountId, 'metadata.json');
  try {
    const data = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function deleteSessionFiles(accountId: string): Promise<void> {
  const dir = path.join(config.sessionDir, accountId);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function listSessionDirs(): Promise<string[]> {
  try {
    await fs.mkdir(config.sessionDir, { recursive: true });
    const entries = await fs.readdir(config.sessionDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}
