'use client';

import { useContext, useCallback } from 'react';
import { I18nContext } from './provider';
import type { Locale } from './index';

/**
 * Client-side hook for accessing translations.
 *
 * Usage:
 *   const { t, locale, setLocale } = useTranslation();
 *   <h1>{t('auth.login.title')}</h1>
 */
export function useTranslation() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }

  const { locale, dictionary, setLocale } = context;

  const t = useCallback(
    (key: string, variables?: Record<string, string | number>): string => {
      const keys = key.split('.');
      let current: unknown = dictionary;

      for (const k of keys) {
        if (current === null || current === undefined || typeof current !== 'object') {
          return key;
        }
        current = (current as Record<string, unknown>)[k];
      }

      if (typeof current !== 'string') {
        return key;
      }

      let value = current;
      if (variables) {
        for (const [varKey, varValue] of Object.entries(variables)) {
          value = value.replace(new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'), String(varValue));
        }
      }

      return value;
    },
    [dictionary],
  );

  return { t, locale, setLocale };
}

/**
 * Set the locale cookie from client-side code and reload the page.
 */
export function setLocaleCookie(locale: Locale): void {
  document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  window.location.reload();
}
