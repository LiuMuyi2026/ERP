export type LangCode = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'it' | 'es' | 'pt';

export const LANGUAGES = [
  { code: 'en',    label: 'English',             native: 'English' },
  { code: 'zh-CN', label: 'Simplified Chinese',  native: '简体中文' },
  { code: 'zh-TW', label: 'Traditional Chinese', native: '繁體中文' },
  { code: 'ja',    label: 'Japanese',            native: '日本語' },
  { code: 'it',    label: 'Italian',             native: 'Italiano' },
  { code: 'es',    label: 'Spanish',             native: 'Español' },
  { code: 'pt',    label: 'Portuguese',          native: 'Português' },
] as const;

export function setLocale(code: LangCode) {
  localStorage.setItem('nexus_ui_lang', code);
  document.cookie = `nexus_ui_lang=${code}; path=/; max-age=31536000; SameSite=Lax`;
  // Use full URL navigation instead of reload() to ensure Next.js
  // re-executes server components and reads the updated cookie
  window.location.href = window.location.pathname + window.location.search;
}
