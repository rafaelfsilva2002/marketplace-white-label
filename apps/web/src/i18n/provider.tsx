'use client';

import { createContext, useState, useCallback, type ReactNode } from 'react';
import { DEFAULT_LOCALE, getDictionary, isValidLocale, type Locale } from './index';
import { setLocaleCookie } from './client';

export interface I18nContextValue {
  locale: Locale;
  dictionary: Record<string, unknown>;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  locale?: Locale;
  children: ReactNode;
}

/**
 * Wrap your app (or a subtree) with I18nProvider to enable useTranslation().
 *
 * Usage in layout.tsx:
 *   import { I18nProvider } from '@/i18n/provider';
 *   import { cookies } from 'next/headers';
 *
 *   export default function RootLayout({ children }) {
 *     const locale = cookies().get('locale')?.value ?? 'pt-BR';
 *     return (
 *       <I18nProvider locale={locale}>
 *         {children}
 *       </I18nProvider>
 *     );
 *   }
 */
export function I18nProvider({ locale: initialLocale, children }: I18nProviderProps) {
  const validLocale =
    initialLocale && isValidLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE;

  const [locale, setLocaleState] = useState<Locale>(validLocale);
  const [dictionary, setDictionary] = useState<Record<string, unknown>>(
    getDictionary(validLocale),
  );

  const setLocale = useCallback((newLocale: Locale) => {
    if (!isValidLocale(newLocale)) return;
    setLocaleState(newLocale);
    setDictionary(getDictionary(newLocale));
    setLocaleCookie(newLocale);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, dictionary, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}
