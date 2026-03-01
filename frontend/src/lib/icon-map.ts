/**
 * Emoji → hand-drawn icon name mapping.
 * Used by IconOrEmoji to translate stored emoji values to icon component names.
 */
export const EMOJI_TO_ICON: Record<string, string> = {
  // People & roles
  '👥': 'people-group',
  '👤': 'person',
  '👔': 'necktie',
  '👋': 'wave-hand',
  '🤝': 'handshake',
  '✍️': 'writing-hand',
  // Buildings & places
  '🏭': 'factory',
  '🏢': 'building',
  // Transport & logistics
  '🚢': 'ship',
  // Money & finance
  '💰': 'money-bag',
  '💵': 'dollar-bill',
  '💳': 'credit-card',
  // Security
  '🔒': 'lock',
  '🔓': 'lock-open',
  '🔐': 'shield-lock',
  '🔑': 'key',
  // Communication
  '💬': 'chat-bubble',
  '✉️': 'envelope',
  '📞': 'phone',
  '📢': 'loudspeaker',
  '📣': 'megaphone',
  // Documents & files
  '📄': 'document',
  '📝': 'document-pen',
  '📋': 'clipboard',
  '📁': 'folder',
  '📂': 'folder-open',
  '🗂️': 'card-file',
  '🗃️': 'file-cabinet',
  '📮': 'mailbox',
  // Tools & settings
  '⚙️': 'gear',
  '🛠️': 'wrench',
  '✏️': 'pencil',
  '📏': 'ruler',
  '📐': 'triangle-ruler',
  '🔗': 'link',
  '📎': 'paperclip',
  '📌': 'pin',
  // Status & actions
  '✅': 'checkmark',
  '❌': 'cross-mark',
  '⚠️': 'warning',
  '🚫': 'no-entry',
  '🔔': 'bell',
  '🔌': 'plug',
  '🔄': 'refresh-arrows',
  '🗑️': 'trash-can',
  // Creativity & style
  '🎨': 'palette',
  '🎭': 'masks',
  '🎯': 'target',
  '🎉': 'party',
  '🎓': 'graduation',
  '🏷️': 'tag',
  '🏷': 'tag',
  // AI & tech
  '🧠': 'brain',
  '🤖': 'robot',
  '✦': 'sparkle-star',
  '🔤': 'text-abc',
  // Nature & weather
  '🌐': 'globe',
  '🌍': 'earth',
  '🔥': 'flame',
  '🧊': 'ice-cube',
  '💡': 'lightbulb',
  '⚡': 'lightning',
  '🔬': 'microscope',
  '⭐': 'star',
  '🌟': 'sparkle',
  '🏆': 'trophy',
  '🌿': 'herb',
  '💎': 'diamond',
  '💼': 'briefcase',
  '📦': 'package',
  '🚀': 'rocket',
  '📊': 'bar-chart',
  '📈': 'chart-up',
  '🔍': 'magnifier',
  '📚': 'books',
  '🎸': 'guitar',
  '🦁': 'lion',
  '🦊': 'fox',
  '🎩': 'top-hat',
  '⏰': 'alarm-clock',
  '🪁': 'kite',
  '🆕': 'sparkle-new',
  '👁': 'eye',
  // Arrows
  '↕️': 'arrows-vertical',
  '⬇️': 'arrow-down',
  '➡️': 'arrow-right',
  // Cover emojis (nature/aesthetic)
  '🌊': 'wave',
  '🌅': 'sunrise',
  '🌄': 'dawn',
  '🌌': 'night-sky',
  '🍃': 'leaf',
  '🎪': 'circus-tent',
  '🏔️': 'mountain',
  '🌁': 'foggy',
  '🌃': 'night-city',
  '🌆': 'cityscape',
  '🌇': 'sunset-city',
  '🌉': 'bridge',
  '🌈': 'rainbow',
  '⛅': 'cloud',
  '❄️': 'snowflake',
  '🌺': 'hibiscus',
  '🦋': 'butterfly',
  '🐚': 'shell',
  '🍀': 'clover',
  '🌙': 'crescent-moon',
  '🌸': 'cherry-blossom',
  '🏝️': 'island',
  '🌻': 'sunflower',
  '🎆': 'fireworks',
  '🎇': 'sparkler',
};

/** Reverse mapping: icon name → original emoji (for export/API) */
export const ICON_TO_EMOJI: Record<string, string> = Object.fromEntries(
  Object.entries(EMOJI_TO_ICON).map(([emoji, name]) => [name, emoji])
);

// ── Picker Lists (icon names replacing emoji arrays) ──────────────────────────

/** Workspace icon picker list */
export const WS_ICON_LIST = [
  'folder', 'folder-open', 'card-file', 'briefcase', 'building', 'globe',
  'lightning', 'microscope', 'palette', 'package', 'people-group', 'star',
  'trophy', 'herb', 'flame',
];

/** Page icon picker list */
export const PAGE_ICON_LIST = [
  'document', 'document-pen', 'clipboard', 'bar-chart', 'chart-up', 'pin',
  'paperclip', 'card-file', 'folder', 'lightbulb', 'magnifier', 'gear',
  'target', 'checkmark', 'rocket', 'diamond', 'sparkle', 'megaphone', 'brain',
  'party', 'key', 'package', 'wrench', 'chat-bubble', 'tag', 'mailbox',
  'file-cabinet', 'triangle-ruler', 'lock', 'people-group', 'trophy',
  'graduation', 'books', 'microscope', 'briefcase', 'guitar', 'earth',
  'lion', 'fox', 'top-hat',
];

/** Cover icon picker list */
export const COVER_ICON_LIST = [
  'wave', 'sunrise', 'dawn', 'night-sky', 'herb', 'leaf', 'palette', 'masks',
  'circus-tent', 'mountain', 'foggy', 'night-city', 'cityscape', 'sunset-city',
  'bridge', 'rainbow', 'cloud', 'snowflake', 'flame', 'hibiscus', 'butterfly',
  'shell', 'clover', 'crescent-moon', 'star', 'cherry-blossom', 'island',
  'sunflower', 'fireworks', 'sparkler',
];
