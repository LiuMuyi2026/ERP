'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  AVATAR_STYLE_KEYS,
  AVATAR_STYLES,
  AvatarStyleKey,
  AvatarConfig,
  generateAvatarPreview,
} from './UserAvatar';

interface AvatarPickerProps {
  /** Current config (null = no DiceBear avatar set) */
  value: AvatarConfig | null;
  /** Callback when user selects a new avatar config */
  onChange: (config: AvatarConfig) => void;
  /** User ID for default seed */
  userId: string;
}

function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Avatar style/seed picker.
 * Shows 5 hand-drawn styles in a grid, with a random-shuffle button per style.
 */
export function AvatarPicker({ value, onChange, userId }: AvatarPickerProps) {
  const [activeStyle, setActiveStyle] = useState<AvatarStyleKey>(value?.style || 'adventurer');
  const [seeds, setSeeds] = useState<Record<AvatarStyleKey, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of AVATAR_STYLE_KEYS) {
      initial[key] = value?.style === key && value?.seed ? value.seed : userId;
    }
    return initial as Record<AvatarStyleKey, string>;
  });

  const handleShuffle = useCallback((style: AvatarStyleKey) => {
    const newSeed = randomSeed();
    setSeeds(prev => ({ ...prev, [style]: newSeed }));
    onChange({ style, seed: newSeed });
  }, [onChange]);

  const handleSelect = useCallback((style: AvatarStyleKey) => {
    setActiveStyle(style);
    onChange({ style, seed: seeds[style] });
  }, [onChange, seeds]);

  // Generate 4 preview variants per active style
  const previews = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const seed = i === 0 ? seeds[activeStyle] : `${seeds[activeStyle]}-${i}`;
      return { seed, uri: generateAvatarPreview(activeStyle, seed) };
    });
  }, [activeStyle, seeds]);

  return (
    <div>
      {/* Style tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {AVATAR_STYLE_KEYS.map(key => (
          <button
            key={key}
            onClick={() => handleSelect(key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: activeStyle === key ? 'var(--notion-accent)' : 'var(--notion-hover)',
              color: activeStyle === key ? '#fff' : 'var(--notion-text-muted)',
            }}
          >
            {AVATAR_STYLES[key].label}
          </button>
        ))}
      </div>

      {/* Main preview (large) */}
      <div className="flex items-center gap-4 mb-4">
        <Image
          src={generateAvatarPreview(activeStyle, seeds[activeStyle])}
          alt="Selected avatar"
          width={80}
          height={80}
          unoptimized
          className="rounded-full"
          style={{ border: '3px solid var(--notion-accent)', background: 'var(--notion-hover)' }}
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
            {AVATAR_STYLES[activeStyle].label}
          </p>
          <button
            onClick={() => handleShuffle(activeStyle)}
            className="mt-1 px-3 py-1 rounded-md text-xs transition-colors"
            style={{ background: 'var(--notion-hover)', color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-border)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
          >
            Shuffle
          </button>
        </div>
      </div>

      {/* Variant grid */}
      <div className="grid grid-cols-4 gap-2">
        {previews.map(p => {
          const isActive = p.seed === seeds[activeStyle];
          return (
            <button
              key={p.seed}
              onClick={() => {
                setSeeds(prev => ({ ...prev, [activeStyle]: p.seed }));
                onChange({ style: activeStyle, seed: p.seed });
              }}
              className="rounded-xl p-1 transition-all"
              style={{
                border: isActive ? '2px solid var(--notion-accent)' : '2px solid transparent',
                background: 'var(--notion-hover)',
              }}
            >
              <Image
                src={p.uri}
                alt="variant"
                width={72}
                height={72}
                unoptimized
                className="w-full rounded-lg"
                style={{ height: 'auto' }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AvatarPicker;
