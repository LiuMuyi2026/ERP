import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: Record<string, any>, override: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...base };
  for (const key of Object.keys(override || {})) {
    const bv = out[key];
    const ov = override[key];
    if (isObject(bv) && isObject(ov)) {
      out[key] = deepMerge(bv, ov);
    } else {
      out[key] = ov;
    }
  }
  return out;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = store.get('nexus_ui_lang')?.value || 'en';

  const en: Record<string, any> = (await import('../../messages/en.json')).default;
  const zhCN: Record<string, any> = (await import('../../messages/zh-CN.json')).default;
  let current: Record<string, any> = {};
  if (locale !== 'en') {
    try {
      current = (await import(`../../messages/${locale}.json`)).default;
    } catch {
      current = {};
    }
  }

  // Fallback chains:
  // - zh-TW / ja: locale -> zh-CN -> en (avoid large English fallback blocks)
  // - others: locale -> en
  const base = (locale === 'zh-TW' || locale === 'ja')
    ? deepMerge(en, zhCN)
    : en;

  const messages = deepMerge(base, current);
  return { locale, messages };
});
