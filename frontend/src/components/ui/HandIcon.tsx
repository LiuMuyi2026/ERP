'use client';

import React from 'react';
import { ICON_REGISTRY } from './hand-icons';

interface HandIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a hand-drawn SVG icon by name.
 * Falls back to rendering the raw string (emoji) if icon not found.
 */
export function HandIcon({ name, size = 16, className, style }: HandIconProps) {
  const Icon = ICON_REGISTRY[name];
  const mergedClassName = className ? `hand-drawn-icon ${className}` : 'hand-drawn-icon';
  if (!Icon) {
    // Fallback: render as text (for emojis or unknown names)
    return <span style={{ fontSize: size, lineHeight: 1, ...style }} className={mergedClassName}>{name}</span>;
  }
  return <Icon size={size} className={mergedClassName} style={style} />;
}

export default HandIcon;
