import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = store.get('nexus_ui_lang')?.value || 'en';

  const en: Record<string, any> = (await import('../../messages/en.json')).default;
  const current: Record<string, any> =
    locale !== 'en'
      ? (await import(`../../messages/${locale}.json`)).default
      : en;

  // Deep merge: English as fallback, current locale overrides
  const messages: Record<string, any> = {};
  for (const key of Array.from(new Set([...Object.keys(en), ...Object.keys(current)]))) {
    if (
      typeof en[key] === 'object' &&
      en[key] !== null &&
      typeof current[key] === 'object' &&
      current[key] !== null
    ) {
      messages[key] = { ...en[key], ...current[key] };
    } else {
      messages[key] = current[key] ?? en[key];
    }
  }

  return { locale, messages };
});
