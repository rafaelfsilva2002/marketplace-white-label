import ptBR from './locales/pt-BR.json';
import enUS from './locales/en-US.json';

export const SUPPORTED_LOCALES = ['pt-BR', 'en-US'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pt-BR';

export const LOCALE_NAMES: Record<Locale, string> = {
  'pt-BR': 'Portugues (BR)',
  'en-US': 'English (US)',
};

const dictionaries: Record<Locale, Record<string, unknown>> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

/**
 * Resolve a dot-notation key (e.g. "auth.login.title") against a nested object.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return path; // key not found — return the path itself as fallback
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (typeof current === 'string') {
    return current;
  }

  return path; // fallback: return key path
}

/**
 * Get translation for a given key in the specified locale.
 * Supports dot-notation keys: t('auth.login.title', 'pt-BR')
 *
 * Optionally interpolate variables: t('greeting', 'en-US', { name: 'John' })
 * — replaces {{name}} in the translation string.
 */
export function t(
  key: string,
  locale: Locale = DEFAULT_LOCALE,
  variables?: Record<string, string | number>,
): string {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  let value = getNestedValue(dictionary, key);

  if (variables) {
    for (const [varKey, varValue] of Object.entries(variables)) {
      value = value.replace(new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'), String(varValue));
    }
  }

  return value;
}

/**
 * Get the full dictionary for a locale (useful for client-side provider).
 */
export function getDictionary(locale: Locale): Record<string, unknown> {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/**
 * Check if a locale string is supported.
 */
export function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

/**
 * Parse Accept-Language header and return the best matching locale.
 */
export function parseAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const languages = header
    .split(',')
    .map((part) => {
      const [lang, quality] = part.trim().split(';q=');
      return {
        lang: lang.trim(),
        q: quality ? parseFloat(quality) : 1.0,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of languages) {
    // Exact match
    if (isValidLocale(lang)) return lang;

    // Prefix match (e.g. "pt" matches "pt-BR", "en" matches "en-US")
    const prefix = lang.split('-')[0].toLowerCase();
    const match = SUPPORTED_LOCALES.find((l) => l.toLowerCase().startsWith(prefix));
    if (match) return match;
  }

  return DEFAULT_LOCALE;
}
