'use client';

import { useTranslation } from '@/i18n/client';
import { SUPPORTED_LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/index';

/**
 * Dropdown language switcher component.
 * Reads current locale from I18nProvider context and switches via cookie + reload.
 *
 * Uses a plain <select> for simplicity. Replace with shadcn/ui Select if desired.
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      aria-label="Select language"
    >
      {SUPPORTED_LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_NAMES[loc]}
        </option>
      ))}
    </select>
  );
}
