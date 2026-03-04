export type EmailUiPrefs = {
  autoTranslateIncoming: boolean;
  autoTranslateOutgoing: boolean;
  targetLanguage: string;
  composerFontFamily: string;
  composerFontSize: string;
};

export const DEFAULT_EMAIL_UI_PREFS: EmailUiPrefs = {
  autoTranslateIncoming: true,
  autoTranslateOutgoing: false,
  targetLanguage: 'en',
  composerFontFamily: 'Arial',
  composerFontSize: '14px',
};

function keyFor(tenantSlug: string) {
  return `email_ui_prefs_${tenantSlug || 'default'}`;
}

export function loadEmailUiPrefs(tenantSlug: string): EmailUiPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_EMAIL_UI_PREFS };
  try {
    const raw = window.localStorage.getItem(keyFor(tenantSlug));
    if (!raw) return { ...DEFAULT_EMAIL_UI_PREFS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_EMAIL_UI_PREFS,
      ...(parsed || {}),
    };
  } catch {
    return { ...DEFAULT_EMAIL_UI_PREFS };
  }
}

export function saveEmailUiPrefs(tenantSlug: string, prefs: EmailUiPrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(keyFor(tenantSlug), JSON.stringify(prefs));
}

