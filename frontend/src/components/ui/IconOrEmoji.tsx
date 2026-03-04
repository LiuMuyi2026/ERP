'use client';

import React from 'react';
import { EMOJI_TO_ICON } from '@/lib/icon-map';
import { ICON_REGISTRY } from './hand-icons';

interface IconOrEmojiProps {
  value: string;          // emoji string OR icon name
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Compatibility renderer: accepts either an emoji string or icon name
 * and renders the appropriate hand-drawn SVG icon.
 * Falls back to emoji text if no matching icon found.
 */
export function IconOrEmoji({ value, size = 16, className, style }: IconOrEmojiProps) {
  const mergedClassName = className ? `hand-drawn-icon ${className}` : 'hand-drawn-icon';
  // 1. Check if value is already an icon name
  const directIcon = ICON_REGISTRY[value];
  if (directIcon) {
    const Icon = directIcon;
    return <Icon size={size} className={mergedClassName} style={style} />;
  }

  // 2. Check if value is an emoji with a mapping
  const iconName = EMOJI_TO_ICON[value];
  if (iconName) {
    const Icon = ICON_REGISTRY[iconName];
    if (Icon) {
      return <Icon size={size} className={mergedClassName} style={style} />;
    }
  }

  // 3. Fallback: render as text (emoji or unknown)
  return (
    <span
      style={{ fontSize: size, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }}
      className={mergedClassName}
    >
      {value}
    </span>
  );
}

export default IconOrEmoji;
