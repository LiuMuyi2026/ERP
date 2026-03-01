'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { createAvatar } from '@dicebear/core';
import { adventurer, lorelei, notionists, openPeeps, croodles } from '@dicebear/collection';

export const AVATAR_STYLES = {
  adventurer: { collection: adventurer, label: 'Adventurer' },
  lorelei:    { collection: lorelei,    label: 'Lorelei' },
  notionists: { collection: notionists, label: 'Notionists' },
  'open-peeps': { collection: openPeeps, label: 'Open Peeps' },
  croodles:   { collection: croodles,   label: 'Croodles' },
} as const;

export type AvatarStyleKey = keyof typeof AVATAR_STYLES;
export const AVATAR_STYLE_KEYS = Object.keys(AVATAR_STYLES) as AvatarStyleKey[];

export interface AvatarConfig {
  style: AvatarStyleKey;
  seed: string;
}

/**
 * Parse avatar_url field (JSON or plain string) into AvatarConfig.
 * Returns null if not a valid DiceBear config.
 */
export function parseAvatarConfig(avatarUrl?: string | null): AvatarConfig | null {
  if (!avatarUrl) return null;
  try {
    const parsed = JSON.parse(avatarUrl);
    if (parsed && typeof parsed.style === 'string' && typeof parsed.seed === 'string' && parsed.style in AVATAR_STYLES) {
      return parsed as AvatarConfig;
    }
  } catch {
    // not JSON — ignore
  }
  return null;
}

/** Serialize AvatarConfig to JSON string for storage in avatar_url. */
export function serializeAvatarConfig(config: AvatarConfig): string {
  return JSON.stringify(config);
}

function generateSvgUri(style: AvatarStyleKey, seed: string): string {
  const { collection } = AVATAR_STYLES[style];
  const avatar = createAvatar(collection as never, { seed, size: 128 });
  return avatar.toDataUri();
}

interface UserAvatarProps {
  /** User ID — used as default seed */
  userId: string;
  /** User display name — used for fallback initials */
  name?: string;
  /** avatar_url field from DB (JSON or plain URL) */
  avatarUrl?: string | null;
  /** Size in pixels */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a DiceBear hand-drawn avatar if configured,
 * otherwise falls back to initial-based colored circle.
 */
export function UserAvatar({ userId, name, avatarUrl, size = 32, className, style: cssStyle }: UserAvatarProps) {
  const config = parseAvatarConfig(avatarUrl);

  const dataUri = useMemo(() => {
    if (!config) return null;
    return generateSvgUri(config.style, config.seed);
  }, [config]);

  if (dataUri) {
    return (
      <Image
        src={dataUri}
        alt={name || 'Avatar'}
        width={size}
        height={size}
        unoptimized
        className={`rounded-full flex-shrink-0 ${className || ''}`}
        style={{ ...cssStyle }}
      />
    );
  }

  // Fallback: initial-based colored circle
  const initial = (name?.[0] || userId?.[0] || '?').toUpperCase();
  let h = 0;
  const s = userId || name || 'x';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none ${className || ''}`}
      style={{
        width: size, height: size,
        background: `hsl(${h}, 60%, 55%)`,
        fontSize: Math.round(size * 0.38),
        ...cssStyle,
      }}
    >
      {initial}
    </div>
  );
}

/** Generate a preview data URI for a given style+seed (used by AvatarPicker). */
export function generateAvatarPreview(style: AvatarStyleKey, seed: string): string {
  return generateSvgUri(style, seed);
}

export default UserAvatar;
