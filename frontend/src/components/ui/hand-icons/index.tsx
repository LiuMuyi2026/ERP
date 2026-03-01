'use client';

import React from 'react';

/* ── Hand-drawn SVG Icon Registry ──────────────────────────────────────────────
 *  All icons use currentColor for theme support.
 *  ViewBox: 0 0 24 24, stroke-based, round caps/joins for organic feel.
 *  ~110 icons covering all UI emoji replacements.
 * ────────────────────────────────────────────────────────────────────────────── */

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Shared SVG wrapper */
const S = ({ size = 16, className, style, children, fw, fill }: IconProps & { children: React.ReactNode; fw?: number; fill?: string }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill={fill ?? 'none'} stroke="currentColor"
    strokeWidth={fw ?? 2} strokeLinecap="round" strokeLinejoin="round"
    className={className} style={style}
  >
    {children}
  </svg>
);

type IC = React.FC<IconProps>;

// ── Core UI Icons ─────────────────────────────────────────────────────────────

const PeopleGroup: IC = p => (
  <S {...p}>
    <path d="M17 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M7 21v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <circle cx="20" cy="7" r="3" strokeDasharray="1 0.5"/>
    <path d="M1 21v-2a4 4 0 0 1 3-3.87"/>
    <circle cx="4" cy="7" r="3" strokeDasharray="1 0.5"/>
  </S>
);

const Factory: IC = p => (
  <S {...p}>
    <path d="M2 20h20"/>
    <path d="M5 20V8l4 3V8l4 3V4h6v16"/>
    <path d="M9 20v-3h3v3"/>
    <rect x="15" y="10" width="2" height="2" rx="0.5"/>
    <rect x="15" y="14" width="2" height="2" rx="0.5"/>
  </S>
);

const Ship: IC = p => (
  <S {...p}>
    <path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/>
    <path d="M4 17l1-7h14l1 7"/>
    <path d="M8 10V5h8v5"/>
    <path d="M12 3v2"/>
  </S>
);

const MoneyBag: IC = p => (
  <S {...p}>
    <path d="M9 3h6l-3 4-3-4z"/>
    <path d="M12 7c-5 0-8 3.5-8 7.5S7 21 12 21s8-2.5 8-6.5S17 7 12 7z"/>
    <path d="M14.5 13c0-.8-.7-1.5-2.5-1.5s-2.5.3-2.5 1.2c0 1 1 1.3 2.5 1.6s2.5.7 2.5 1.7c0 1-1 1.5-2.5 1.5s-2.5-.7-2.5-1.5"/>
    <path d="M12 11v1m0 5v1"/>
  </S>
);

const Person: IC = p => (
  <S {...p}>
    <circle cx="12" cy="7" r="4"/>
    <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/>
  </S>
);

const Lock: IC = p => (
  <S {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    <circle cx="12" cy="16" r="1"/>
  </S>
);

const LockOpen: IC = p => (
  <S {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
    <circle cx="12" cy="16" r="1"/>
  </S>
);

const Building: IC = p => (
  <S {...p}>
    <rect x="4" y="2" width="16" height="20" rx="2"/>
    <path d="M9 22v-4h6v4"/>
    <rect x="8" y="6" width="2" height="2" rx="0.4"/>
    <rect x="14" y="6" width="2" height="2" rx="0.4"/>
    <rect x="8" y="11" width="2" height="2" rx="0.4"/>
    <rect x="14" y="11" width="2" height="2" rx="0.4"/>
  </S>
);

const Eye: IC = p => (
  <S {...p}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </S>
);

const Palette: IC = p => (
  <S {...p}>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1 0 1.5-.5 1.5-1.2 0-.3-.1-.6-.4-.9-.2-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4H16c3.3 0 6-2.7 6-6 0-5.2-4.5-9.5-10-9.5z"/>
    <circle cx="7.5" cy="11.5" r="1.5" fill="currentColor"/>
    <circle cx="10.5" cy="7.5" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="7.5" r="1.5" fill="currentColor"/>
    <circle cx="17.5" cy="11" r="1.5" fill="currentColor"/>
  </S>
);

const Brain: IC = p => (
  <S {...p}>
    <path d="M12 2C9 2 7 4 7 6.5c0 .5-.4 1-1 1C4 7.5 2.5 9.5 2.5 12c0 2 1 3.5 2.5 4 .5.2 1 .7 1 1.3 0 2.5 2.5 4.7 6 4.7s6-2.2 6-4.7c0-.6.5-1.1 1-1.3 1.5-.5 2.5-2 2.5-4 0-2.5-1.5-4.5-3.5-4.5-.6 0-1-.5-1-1C17 4 15 2 12 2z"/>
    <path d="M12 2v20"/>
    <path d="M7.5 10c1.5 0 3 .5 4.5 2"/>
    <path d="M16.5 10c-1.5 0-3 .5-4.5 2"/>
  </S>
);

const Key: IC = p => (
  <S {...p}>
    <circle cx="8" cy="15" r="5"/>
    <path d="M14.5 9.5L21 3"/>
    <path d="M17 6l3 3"/>
    <path d="M12 12l2.5-2.5"/>
  </S>
);

const Folder: IC = p => (
  <S {...p}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </S>
);

const Bell: IC = p => (
  <S {...p}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </S>
);

const Plug: IC = p => (
  <S {...p}>
    <path d="M12 22v-5"/>
    <path d="M9 17h6"/>
    <path d="M9 12V7"/>
    <path d="M15 12V7"/>
    <path d="M6 12h12"/>
    <path d="M9 7V2"/>
    <path d="M15 7V2"/>
  </S>
);

const Briefcase: IC = p => (
  <S {...p}>
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <path d="M2 12h20"/>
  </S>
);

const Necktie: IC = p => (
  <S {...p}>
    <path d="M9 3h6l-1 5-2 12-2-12z"/>
    <path d="M9 3l1.5 2h3L15 3"/>
  </S>
);

const Ruler: IC = p => (
  <S {...p}>
    <rect x="1" y="9" width="22" height="6" rx="1" transform="rotate(-45 12 12)"/>
    <path d="M7.5 10.5l2 2"/>
    <path d="M10 8l2 2"/>
    <path d="M12.5 5.5l2 2"/>
  </S>
);

const WaveHand: IC = p => (
  <S {...p}>
    <path d="M7 11c-1-3 .5-5.5 2-5s1 3 1 3"/>
    <path d="M10 9c-1-3 .5-5 2-4.5s1 3 1 3"/>
    <path d="M13 8c-.5-2.5.5-4.5 2-4s1 3 1 3"/>
    <path d="M16 9c-.5-2 .5-3.5 1.5-3s.5 2.5.5 2.5"/>
    <path d="M17.5 8.5c1 2 1.5 4 .5 7-1 3-4 5.5-8 5.5-3.5 0-5.5-2-7-5-.8-1.5 0-3 1-2l2 2"/>
  </S>
);

const Checkmark: IC = p => (
  <S {...p} fw={2.5}>
    <path d="M20 6L9 17l-5-5"/>
  </S>
);

const CrossMark: IC = p => (
  <S {...p} fw={2.5}>
    <path d="M18 6L6 18"/>
    <path d="M6 6l12 12"/>
  </S>
);

const Warning: IC = p => (
  <S {...p}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
  </S>
);

const AlertTriangle: IC = p => (
  <S {...p}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
  </S>
);

const CircleCheck: IC = p => (
  <S {...p}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M9 12l2 2 4-4"/>
  </S>
);

const User: IC = p => (
  <S {...p}>
    <circle cx="12" cy="8" r="4"/>
    <path d="M6 21v-2a4 4 0 0 1 8 0v2"/>
  </S>
);

const Hourglass: IC = p => (
  <S {...p}>
    <path d="M5 3h14"/>
    <path d="M5 21h14"/>
    <path d="M7 3v3a5 5 0 0 0 5 5 5 5 0 0 0 5-5V3"/>
    <path d="M7 21v-3a5 5 0 0 1 5-5 5 5 0 0 1 5 5v3"/>
  </S>
);

const Pencil: IC = p => (
  <S {...p}>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>
    <path d="M15 5l4 4"/>
  </S>
);

const ChatBubble: IC = p => (
  <S {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </S>
);

const NoEntry: IC = p => (
  <S {...p}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M4.93 4.93l14.14 14.14"/>
  </S>
);

const LinkIcon: IC = p => (
  <S {...p}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </S>
);

const Document: IC = p => (
  <S {...p}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/>
    <polyline points="14 2 14 8 20 8"/>
  </S>
);

const DocumentPen: IC = p => (
  <S {...p}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="12" y2="17"/>
  </S>
);

const Package: IC = p => (
  <S {...p}>
    <path d="M16.5 9.4l-9-5.19"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </S>
);

const Envelope: IC = p => (
  <S {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="M22 6l-10 7L2 6"/>
  </S>
);

const Phone: IC = p => (
  <S {...p}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.59.69 2.33a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.74.33 1.52.56 2.33.69A2 2 0 0 1 22 16.92z"/>
  </S>
);

const Handshake: IC = p => (
  <S {...p}>
    <path d="M20 11H4"/>
    <path d="M4 11l4-4 3 1 5-5"/>
    <path d="M20 11l-4 4-2-1"/>
    <path d="M8 15l2-2 3 1 3-3"/>
    <path d="M2 11h2"/>
    <path d="M20 11h2"/>
    <path d="M10 16l-2 3"/>
    <path d="M14 19l-2-3"/>
  </S>
);

const Kite: IC = p => (
  <S {...p}>
    <path d="M12 2L4 12l8 8 8-8z"/>
    <path d="M12 2v18"/>
    <path d="M4 12h16"/>
    <path d="M9 20l-3 2"/>
    <path d="M12 20l-1 3"/>
  </S>
);

const Target: IC = p => (
  <S {...p}>
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </S>
);

const SparkleNew: IC = p => (
  <S {...p}>
    <path d="M12 3v2m0 14v2M3 12h2m14 0h2"/>
    <rect x="5" y="5" width="14" height="14" rx="3"/>
    <path d="M12 8v8M8 12h8" strokeWidth={2.5}/>
  </S>
);

const Flame: IC = p => (
  <S {...p}>
    <path d="M12 22c4-2 7-5 7-9 0-3-2-6-4-8-1 2-2 3-3 3s-1.5-2-1-4c-3 2-6 5-6 9 0 4 3 7 7 9z"/>
    <path d="M12 22c-2-1-3-3-3-5 0-2 1-3 2-4 .5 1 1 1.5 1.5 1.5s.5-1 .5-2c1.5 1 2.5 2.5 2.5 4.5 0 2-1 4-3.5 5z"/>
  </S>
);

const IceCube: IC = p => (
  <S {...p}>
    <path d="M12 2l9 5v10l-9 5-9-5V7z"/>
    <path d="M12 22V12"/>
    <path d="M3 7l9 5"/>
    <path d="M21 7l-9 5"/>
    <path d="M7.5 4.5L12 7l4.5-2.5"/>
  </S>
);

const DollarBill: IC = p => (
  <S {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <circle cx="12" cy="12" r="3"/>
    <path d="M2 9h2m16 0h2M2 15h2m16 0h2"/>
  </S>
);

const TrashCan: IC = p => (
  <S {...p}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>
  </S>
);

const AlarmClock: IC = p => (
  <S {...p}>
    <circle cx="12" cy="13" r="8"/>
    <path d="M12 9v4l2 2"/>
    <path d="M5 3L2 6"/>
    <path d="M19 3l3 3"/>
  </S>
);

const BarChart: IC = p => (
  <S {...p}>
    <rect x="3" y="12" width="4" height="9" rx="0.5"/>
    <rect x="10" y="6" width="4" height="15" rx="0.5"/>
    <rect x="17" y="3" width="4" height="18" rx="0.5"/>
  </S>
);

const RefreshArrows: IC = p => (
  <S {...p}>
    <path d="M1 4v6h6"/>
    <path d="M23 20v-6h-6"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"/>
    <path d="M3.51 15a9 9 0 0 0 14.85 3.36L23 14"/>
  </S>
);

const Tag: IC = p => (
  <S {...p}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
  </S>
);

const ShieldLock: IC = p => (
  <S {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <rect x="9" y="11" width="6" height="5" rx="1"/>
    <path d="M10 11V9a2 2 0 0 1 4 0v2"/>
  </S>
);

const Clipboard: IC = p => (
  <S {...p}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
    <line x1="8" y1="16" x2="14" y2="16"/>
  </S>
);

const Robot: IC = p => (
  <S {...p}>
    <rect x="3" y="8" width="18" height="12" rx="2"/>
    <circle cx="9" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="14" r="1.5" fill="currentColor"/>
    <path d="M12 2v4"/>
    <circle cx="12" cy="2" r="1"/>
    <path d="M1 13h2m18 0h2"/>
  </S>
);

const Gear: IC = p => (
  <S {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </S>
);

const CreditCard: IC = p => (
  <S {...p}>
    <rect x="1" y="4" width="22" height="16" rx="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
    <line x1="5" y1="15" x2="10" y2="15"/>
  </S>
);

const SparkleStar: IC = p => (
  <S {...p} fw={1.5}>
    <path d="M12 2l2.5 7.5H22l-6 4.5 2.3 7L12 17l-6.3 4 2.3-7L2 9.5h7.5z"/>
    <path d="M12 2l1 3-1 1-1-1z" fill="currentColor" stroke="none"/>
  </S>
);

const WritingHand: IC = p => (
  <S {...p}>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>
    <path d="M15 5l4 4"/>
    <path d="M3 19c2 0 3-1 3-1"/>
  </S>
);

const TextAbc: IC = p => (
  <S {...p}>
    <path d="M3 18l3-12h2l3 12"/>
    <path d="M5 14h4"/>
    <path d="M14 18V6"/>
    <path d="M14 10c0-2 1.5-4 3.5-4S21 8 21 10c0 3-3.5 3-3.5 5.5V18"/>
    <circle cx="17.5" cy="18" r="0.5" fill="currentColor"/>
  </S>
);

const ArrowsVertical: IC = p => (
  <S {...p} fw={2.5}>
    <path d="M12 3v18"/>
    <polyline points="8 7 12 3 16 7"/>
    <polyline points="8 17 12 21 16 17"/>
  </S>
);

const ArrowDown: IC = p => (
  <S {...p} fw={2.5}>
    <path d="M12 5v14"/>
    <polyline points="19 12 12 19 5 12"/>
  </S>
);

const ArrowRight: IC = p => (
  <S {...p} fw={2.5}>
    <path d="M5 12h14"/>
    <polyline points="12 5 19 12 12 19"/>
  </S>
);

const Lightbulb: IC = p => (
  <S {...p}>
    <path d="M9 18h6"/>
    <path d="M10 22h4"/>
    <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z"/>
  </S>
);

const Masks: IC = p => (
  <S {...p}>
    <path d="M2 8c0-3 4-5 7-5 1.5 0 3 .5 3 .5S13.5 3 15 3c3 0 7 2 7 5s-2 7-5 9c-1 .7-2.5 1-4 1"/>
    <circle cx="8" cy="9" r="1" fill="currentColor"/>
    <circle cx="16" cy="9" r="1" fill="currentColor"/>
    <path d="M9 13c1 1 2 1.5 3 1.5s2-.5 3-1.5"/>
    <path d="M12 17c-2 0-5 1-7 3"/>
    <path d="M12 17c2 0 5 1 7 3"/>
  </S>
);

const Globe: IC = p => (
  <S {...p}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </S>
);

// ── Additional Icons for Pickers ──────────────────────────────────────────────

const FolderOpen: IC = p => (
  <S {...p}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    <path d="M2 10h20"/>
  </S>
);

const CardFile: IC = p => (
  <S {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="M10 4v16"/>
    <path d="M2 9h8"/>
    <path d="M2 14h8"/>
  </S>
);

const Lightning: IC = p => (
  <S {...p}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9z"/>
  </S>
);

const Microscope: IC = p => (
  <S {...p}>
    <path d="M6 18h12"/>
    <path d="M10 18v-3"/>
    <circle cx="14" cy="6" r="4"/>
    <path d="M14 10v2a4 4 0 0 1-4 4"/>
    <path d="M12 4l4 4"/>
  </S>
);

const Star: IC = p => (
  <S {...p}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>
  </S>
);

const Trophy: IC = p => (
  <S {...p}>
    <path d="M8 21h8"/>
    <path d="M12 17v4"/>
    <path d="M7 4h10v6a5 5 0 0 1-10 0z"/>
    <path d="M7 7H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3h1"/>
    <path d="M17 7h3a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3h-1"/>
  </S>
);

const Herb: IC = p => (
  <S {...p}>
    <path d="M12 22V12"/>
    <path d="M12 12c-4-4-8-2-8 2"/>
    <path d="M12 12c4-4 8-2 8 2"/>
    <path d="M12 8c-3-3-6-2-6 1"/>
    <path d="M12 8c3-3 6-2 6 1"/>
    <path d="M12 5c-2-2-4-1.5-4 .5"/>
    <path d="M12 5c2-2 4-1.5 4 .5"/>
  </S>
);

const ChartUp: IC = p => (
  <S {...p}>
    <path d="M3 20h18"/>
    <path d="M3 20V4"/>
    <polyline points="7 14 11 9 14 12 20 5"/>
    <polyline points="16 5 20 5 20 9"/>
  </S>
);

const Pin: IC = p => (
  <S {...p}>
    <path d="M15 4.5L9.5 10l-2-2L4 12l6 6 4-3.5-2-2L17.5 7"/>
    <path d="M9 15l-5 5"/>
    <path d="M15 4.5l4.5 4.5"/>
  </S>
);

const Paperclip: IC = p => (
  <S {...p}>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </S>
);

const Magnifier: IC = p => (
  <S {...p}>
    <circle cx="11" cy="11" r="8"/>
    <path d="M21 21l-4.35-4.35"/>
  </S>
);

const Rocket: IC = p => (
  <S {...p}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </S>
);

const Diamond: IC = p => (
  <S {...p}>
    <path d="M6 3h12l4 6-10 12L2 9z"/>
    <path d="M2 9h20"/>
    <path d="M12 21L6 9l3-6"/>
    <path d="M12 21l6-12-3-6"/>
  </S>
);

const Sparkle: IC = p => (
  <S {...p}>
    <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>
    <path d="M19 8l.5 1.5L21 10l-1.5.5L19 12l-.5-1.5L17 10l1.5-.5z"/>
    <path d="M5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5z"/>
  </S>
);

const Megaphone: IC = p => (
  <S {...p}>
    <path d="M3 11l18-5v14l-18-5z"/>
    <path d="M3 11v4"/>
    <path d="M7 20v-6"/>
    <path d="M11 20l-4 0"/>
  </S>
);

const Party: IC = p => (
  <S {...p}>
    <path d="M5.8 11.3L2 22l10.7-3.8"/>
    <path d="M4 3l.5 2"/>
    <path d="M13.5 2l-.5 2"/>
    <path d="M19 4l-1 1.5"/>
    <path d="M22 9.5l-2 .5"/>
    <path d="M16.5 17.5l1.5 1"/>
    <path d="M5.8 11.3C7.4 8 10.5 5 14.2 4.2c3-.6 5.7.3 7.2 2.2.7.9.5 2-.5 2.6L9.5 16.5"/>
  </S>
);

const Wrench: IC = p => (
  <S {...p}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </S>
);

const Mailbox: IC = p => (
  <S {...p}>
    <path d="M22 17H2a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3z"/>
    <path d="M2 17v3h20v-3"/>
    <path d="M18 17V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12"/>
    <path d="M10 7h4"/>
  </S>
);

const FileCabinet: IC = p => (
  <S {...p}>
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="10" y1="7" x2="14" y2="7"/>
    <line x1="10" y1="17" x2="14" y2="17"/>
  </S>
);

const TriangleRuler: IC = p => (
  <S {...p}>
    <path d="M3 21h18L12 3z"/>
    <path d="M7 21l5-9 5 9"/>
  </S>
);

const Graduation: IC = p => (
  <S {...p}>
    <path d="M22 10L12 5 2 10l10 5z"/>
    <path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/>
    <path d="M22 10v6"/>
  </S>
);

const Books: IC = p => (
  <S {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <line x1="8" y1="7" x2="16" y2="7"/>
    <line x1="8" y1="11" x2="13" y2="11"/>
  </S>
);

const Guitar: IC = p => (
  <S {...p}>
    <path d="M20 2l-3.5 3.5"/>
    <path d="M16.5 5.5l2 2"/>
    <path d="M15 7l-3 3"/>
    <circle cx="9.5" cy="14.5" r="5.5"/>
    <circle cx="9.5" cy="14.5" r="1.5"/>
  </S>
);

const Earth: IC = p => (
  <S {...p}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20"/>
    <path d="M12 2c3 3 5 7 5 10s-2 7-5 10"/>
    <path d="M12 2c-3 3-5 7-5 10s2 7 5 10"/>
  </S>
);

const Lion: IC = p => (
  <S {...p}>
    <circle cx="12" cy="13" r="6"/>
    <path d="M12 7C9 3 5 4 4 7c-1 3 1 5 2 6"/>
    <path d="M12 7c3-4 7-3 8 0 1 3-1 5-2 6"/>
    <circle cx="10" cy="13" r="0.8" fill="currentColor"/>
    <circle cx="14" cy="13" r="0.8" fill="currentColor"/>
    <path d="M10 16c1 .5 2 .5 4 0"/>
    <path d="M12 14v1.5"/>
  </S>
);

const Fox: IC = p => (
  <S {...p}>
    <path d="M4 4l4 12h8l4-12"/>
    <path d="M12 16v4"/>
    <path d="M4 4c-1 4 0 8 4 12"/>
    <path d="M20 4c1 4 0 8-4 12"/>
    <circle cx="9" cy="11" r="1" fill="currentColor"/>
    <circle cx="15" cy="11" r="1" fill="currentColor"/>
    <path d="M10 14l2 1 2-1"/>
  </S>
);

const TopHat: IC = p => (
  <S {...p}>
    <path d="M2 17h20"/>
    <rect x="6" y="7" width="12" height="10" rx="1"/>
    <path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3"/>
    <path d="M10 11h4"/>
  </S>
);

const Loudspeaker: IC = p => (
  <S {...p}>
    <path d="M18 8a6 6 0 0 1 0 8"/>
    <path d="M13 3L7 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3l6 5z"/>
    <path d="M21 5a10 10 0 0 1 0 14"/>
  </S>
);

// ── Cover/Nature Icons ────────────────────────────────────────────────────────

const Wave: IC = p => (
  <S {...p}>
    <path d="M2 12c2-3 4-4 6-1s4 2 6-1 4-2 6 1"/>
    <path d="M2 17c2-3 4-4 6-1s4 2 6-1 4-2 6 1"/>
    <path d="M2 7c2-3 4-4 6-1s4 2 6-1 4-2 6 1"/>
  </S>
);

const Sunrise: IC = p => (
  <S {...p}>
    <path d="M2 17h20"/>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 4v2"/>
    <path d="M5 8l1.5 1.5"/>
    <path d="M19 8l-1.5 1.5"/>
    <path d="M2 21h20"/>
  </S>
);

const Dawn: IC = p => (
  <S {...p}>
    <path d="M2 19h20"/>
    <path d="M12 3v3"/>
    <path d="M4.22 7.22l2.12 2.12"/>
    <path d="M19.78 7.22l-2.12 2.12"/>
    <path d="M4 15a8 8 0 0 1 16 0"/>
  </S>
);

const NightSky: IC = p => (
  <S {...p}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    <circle cx="18" cy="6" r="0.5" fill="currentColor"/>
    <circle cx="20" cy="10" r="0.5" fill="currentColor"/>
    <circle cx="15" cy="4" r="0.5" fill="currentColor"/>
  </S>
);

const Leaf: IC = p => (
  <S {...p}>
    <path d="M5 21c.5-4.5 2.5-8 7-10"/>
    <path d="M12 11C14 6 18 3 22 3c0 5-3 9-8 11"/>
    <path d="M22 3c-8 1-12 5-14 8"/>
    <path d="M2 19c4-2 7-5 9-8"/>
  </S>
);

const CircusTent: IC = p => (
  <S {...p}>
    <path d="M2 20L12 4l10 16"/>
    <path d="M2 20h20"/>
    <path d="M12 4c-3 5-3 10 0 16"/>
    <path d="M12 4c3 5 3 10 0 16"/>
    <line x1="12" y1="1" x2="12" y2="4"/>
  </S>
);

const Mountain: IC = p => (
  <S {...p}>
    <path d="M8 21l4-10 4 10"/>
    <path d="M2 21l7-14 3 6"/>
    <path d="M14 11l3-4 5 14"/>
    <path d="M2 21h20"/>
  </S>
);

const Foggy: IC = p => (
  <S {...p}>
    <path d="M5 6h14"/>
    <path d="M3 10h18"/>
    <path d="M4 14h16"/>
    <path d="M6 18h12"/>
    <rect x="7" y="20" width="10" height="2" rx="1" fill="currentColor" stroke="none" opacity="0.2"/>
  </S>
);

const NightCity: IC = p => (
  <S {...p}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    <path d="M5 17h2v4H5z"/>
    <path d="M9 14h2v7H9z"/>
    <path d="M13 15h2v6h-2z"/>
  </S>
);

const Cityscape: IC = p => (
  <S {...p}>
    <path d="M2 22h20"/>
    <rect x="2" y="12" width="5" height="10"/>
    <rect x="7" y="7" width="5" height="15"/>
    <rect x="12" y="3" width="5" height="19"/>
    <rect x="17" y="9" width="5" height="13"/>
    <path d="M4 15h1M4 18h1M9 10h1M9 13h1M9 16h1M14 6h1M14 9h1M14 12h1M19 12h1M19 15h1"/>
  </S>
);

const SunsetCity: IC = p => (
  <S {...p}>
    <circle cx="12" cy="10" r="4"/>
    <path d="M2 18h20"/>
    <path d="M4 22h3v-4h2v4h6v-6h2v6h3"/>
    <path d="M12 6V3"/>
    <path d="M7 8l-1.5-1.5"/>
    <path d="M17 8l1.5-1.5"/>
  </S>
);

const Bridge: IC = p => (
  <S {...p}>
    <path d="M2 15h20"/>
    <path d="M2 20h20"/>
    <path d="M6 15c0-3 3-6 6-6s6 3 6 6"/>
    <path d="M6 15v5"/>
    <path d="M18 15v5"/>
    <path d="M12 9v6"/>
  </S>
);

const Rainbow: IC = p => (
  <S {...p}>
    <path d="M2 18a10 10 0 0 1 20 0"/>
    <path d="M5 18a7 7 0 0 1 14 0"/>
    <path d="M8 18a4 4 0 0 1 8 0"/>
  </S>
);

const Cloud: IC = p => (
  <S {...p}>
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </S>
);

const Snowflake: IC = p => (
  <S {...p}>
    <path d="M12 2v20"/>
    <path d="M2 12h20"/>
    <path d="M4.93 4.93l14.14 14.14"/>
    <path d="M19.07 4.93L4.93 19.07"/>
    <path d="M9 3l3 3 3-3"/>
    <path d="M9 21l3-3 3 3"/>
    <path d="M3 9l3 3-3 3"/>
    <path d="M21 9l-3 3 3 3"/>
  </S>
);

const Hibiscus: IC = p => (
  <S {...p}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2c-1 2-1 4 0 6"/>
    <path d="M12 22c1-2 1-4 0-6"/>
    <path d="M2 12c2 1 4 1 6 0"/>
    <path d="M22 12c-2-1-4-1-6 0"/>
    <path d="M4.93 4.93c.7 1.8 2.1 3 3.6 3.6"/>
    <path d="M19.07 19.07c-.7-1.8-2.1-3-3.6-3.6"/>
    <path d="M4.93 19.07c1.8-.7 3-2.1 3.6-3.6"/>
    <path d="M19.07 4.93c-1.8.7-3 2.1-3.6 3.6"/>
  </S>
);

const Butterfly: IC = p => (
  <S {...p}>
    <path d="M12 3v18"/>
    <path d="M12 7c-4-5-10-2-9 3 .5 3 4 5 9 5"/>
    <path d="M12 7c4-5 10-2 9 3-.5 3-4 5-9 5"/>
    <path d="M12 14c-3 0-6 2-6 5"/>
    <path d="M12 14c3 0 6 2 6 5"/>
  </S>
);

const Shell: IC = p => (
  <S {...p}>
    <path d="M22 16c0 3-4.5 5-10 5S2 19 2 16"/>
    <path d="M12 3c0 0-8 3-8 10"/>
    <path d="M12 3c0 0 8 3 8 10"/>
    <path d="M12 6c0 0-5 2-5 7"/>
    <path d="M12 6c0 0 5 2 5 7"/>
    <path d="M12 9c0 0-2 1-2 4"/>
    <path d="M12 9c0 0 2 1 2 4"/>
  </S>
);

const Clover: IC = p => (
  <S {...p}>
    <path d="M12 12c-2-4-6-5-7-2s2 5 7 7"/>
    <path d="M12 12c-4 2-5 6-2 7s5-2 7-7"/>
    <path d="M12 12c2 4 6 5 7 2s-2-5-7-7"/>
    <path d="M12 12c4-2 5-6 2-7s-5 2-7 7"/>
    <path d="M12 17v5"/>
  </S>
);

const CrescentMoon: IC = p => (
  <S {...p}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </S>
);

const CherryBlossom: IC = p => (
  <S {...p}>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" opacity="0.2"/>
    <path d="M12 2c-1 2.5 0 5 0 5s1-2.5 0-5z"/>
    <path d="M12 22c1-2.5 0-5 0-5s-1 2.5 0 5z"/>
    <path d="M2 12c2.5 1 5 0 5 0s-2.5-1-5 0z"/>
    <path d="M22 12c-2.5-1-5 0-5 0s2.5 1 5 0z"/>
    <path d="M5 5c2 1.5 4.5 1 4.5 1s-1-2.5-4.5-1z"/>
    <path d="M19 19c-2-1.5-4.5-1-4.5-1s1 2.5 4.5 1z"/>
    <path d="M19 5c-1.5 2-1 4.5-1 4.5s2.5-1 1-4.5z"/>
    <path d="M5 19c1.5-2 1-4.5 1-4.5s-2.5 1-1 4.5z"/>
  </S>
);

const Island: IC = p => (
  <S {...p}>
    <path d="M2 20c4-1 6 0 10-1s6 0 10 1"/>
    <path d="M14 20c-1-3 0-6 0-8"/>
    <path d="M14 12c-4-2-5-6-4-8 2 1 5 3 4 8z"/>
    <path d="M14 12c2-4 6-5 8-3-1 2-4 4-8 3z"/>
  </S>
);

const Sunflower: IC = p => (
  <S {...p}>
    <circle cx="12" cy="10" r="4"/>
    <path d="M12 2v4m0 8v4"/>
    <path d="M4.5 4.5l3 3m9 9l3 3"/>
    <path d="M2 10h4m12 0h4"/>
    <path d="M4.5 15.5l3-3m9-9l3-3"/>
    <path d="M12 18v3"/>
  </S>
);

const Fireworks: IC = p => (
  <S {...p}>
    <path d="M12 6V2"/>
    <path d="M12 6l4-2"/>
    <path d="M12 6L8 4"/>
    <path d="M12 6l5 3"/>
    <path d="M12 6L7 9"/>
    <circle cx="12" cy="12" r="1" fill="currentColor"/>
    <path d="M12 12l-5 6"/>
    <path d="M12 12l5 6"/>
    <path d="M12 12l0 7"/>
    <path d="M12 12l-7 1"/>
    <path d="M12 12l7 1"/>
    <path d="M12 12l-4-5"/>
    <path d="M12 12l4-5"/>
  </S>
);

const SparklerIcon: IC = p => (
  <S {...p}>
    <path d="M12 2l1 3-1 2-1-2z"/>
    <path d="M12 7v15"/>
    <path d="M8 5l3 3"/>
    <path d="M16 5l-3 3"/>
    <path d="M6 9l4 2"/>
    <path d="M18 9l-4 2"/>
    <path d="M7 13l3 1"/>
    <path d="M17 13l-3 1"/>
  </S>
);

// ── Icon Registry ─────────────────────────────────────────────────────────────

export const ICON_REGISTRY: Record<string, IC> = {
  // Core UI
  'people-group': PeopleGroup,
  'factory': Factory,
  'ship': Ship,
  'money-bag': MoneyBag,
  'person': Person,
  'lock': Lock,
  'lock-open': LockOpen,
  'building': Building,
  'eye': Eye,
  'palette': Palette,
  'brain': Brain,
  'key': Key,
  'folder': Folder,
  'bell': Bell,
  'plug': Plug,
  'briefcase': Briefcase,
  'necktie': Necktie,
  'ruler': Ruler,
  'wave-hand': WaveHand,
  'checkmark': Checkmark,
  'cross-mark': CrossMark,
  'warning': Warning,
  'alert-triangle': AlertTriangle,
  'circle-check': CircleCheck,
  'user': User,
  'hourglass': Hourglass,
  'pencil': Pencil,
  'chat-bubble': ChatBubble,
  'no-entry': NoEntry,
  'link': LinkIcon,
  'document': Document,
  'document-pen': DocumentPen,
  'package': Package,
  'envelope': Envelope,
  'phone': Phone,
  'handshake': Handshake,
  'kite': Kite,
  'target': Target,
  'sparkle-new': SparkleNew,
  'flame': Flame,
  'ice-cube': IceCube,
  'dollar-bill': DollarBill,
  'trash-can': TrashCan,
  'alarm-clock': AlarmClock,
  'bar-chart': BarChart,
  'refresh-arrows': RefreshArrows,
  'tag': Tag,
  'shield-lock': ShieldLock,
  'clipboard': Clipboard,
  'robot': Robot,
  'gear': Gear,
  'credit-card': CreditCard,
  'sparkle-star': SparkleStar,
  'writing-hand': WritingHand,
  'text-abc': TextAbc,
  'arrows-vertical': ArrowsVertical,
  'arrow-down': ArrowDown,
  'arrow-right': ArrowRight,
  'lightbulb': Lightbulb,
  'masks': Masks,
  'globe': Globe,
  // Picker additional
  'folder-open': FolderOpen,
  'card-file': CardFile,
  'lightning': Lightning,
  'microscope': Microscope,
  'star': Star,
  'trophy': Trophy,
  'herb': Herb,
  'chart-up': ChartUp,
  'pin': Pin,
  'paperclip': Paperclip,
  'magnifier': Magnifier,
  'rocket': Rocket,
  'diamond': Diamond,
  'sparkle': Sparkle,
  'megaphone': Megaphone,
  'party': Party,
  'wrench': Wrench,
  'mailbox': Mailbox,
  'file-cabinet': FileCabinet,
  'triangle-ruler': TriangleRuler,
  'graduation': Graduation,
  'books': Books,
  'guitar': Guitar,
  'earth': Earth,
  'lion': Lion,
  'fox': Fox,
  'top-hat': TopHat,
  'loudspeaker': Loudspeaker,
  // Cover / nature
  'wave': Wave,
  'sunrise': Sunrise,
  'dawn': Dawn,
  'night-sky': NightSky,
  'leaf': Leaf,
  'circus-tent': CircusTent,
  'mountain': Mountain,
  'foggy': Foggy,
  'night-city': NightCity,
  'cityscape': Cityscape,
  'sunset-city': SunsetCity,
  'bridge': Bridge,
  'rainbow': Rainbow,
  'cloud': Cloud,
  'snowflake': Snowflake,
  'hibiscus': Hibiscus,
  'butterfly': Butterfly,
  'shell': Shell,
  'clover': Clover,
  'crescent-moon': CrescentMoon,
  'cherry-blossom': CherryBlossom,
  'island': Island,
  'sunflower': Sunflower,
  'fireworks': Fireworks,
  'sparkler': SparklerIcon,
};

/** All available icon names */
export const ICON_NAMES = Object.keys(ICON_REGISTRY);

/** Get an icon component by name (returns undefined if not found) */
export function getIcon(name: string): IC | undefined {
  return ICON_REGISTRY[name];
}
