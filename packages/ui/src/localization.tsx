import { useSyncExternalStore } from 'react';
import { de } from './locales/de';
import { sl } from './locales/sl';
import { hr } from './locales/hr';

export type AppLanguage = 'en' | 'de' | 'sl' | 'hr';
export const appLanguages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'sl', name: 'Slovenščina', flag: '🇸🇮' },
  { code: 'hr', name: 'Hrvatski', flag: '🇭🇷' },
] as const;
let language: AppLanguage = 'en';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setAppLanguage(next: AppLanguage) {
  if (next === language) return;
  language = next;
  listeners.forEach((listener) => listener());
}
export function getAppLanguage() {
  return language;
}
export function useAppLanguage() {
  return useSyncExternalStore(
    subscribe,
    getAppLanguage,
    () => 'en' as AppLanguage,
  );
}
const catalogs = { de, sl, hr };
/** Translate product copy only. Never pass user-authored names or agreement terms. */
export function t(
  source: string,
  values: Record<string, string | number> = {},
): string {
  const text =
    language === 'en'
      ? source
      : Object.hasOwn(catalogs[language], source)
        ? catalogs[language][source]!
        : source;
  return text.replace(/\{(\d+)\}/g, (token, key: string) =>
    String(values[key] ?? token),
  );
}
export function dateLocale() {
  return { en: undefined, de: 'de-DE', sl: 'sl-SI', hr: 'hr-HR' }[language];
}

/** Localize schema messages without changing shared domain validation or exposing raw Zod diagnostics. */
export function translateMessage(message?: string): string | undefined {
  if (!message) return message;
  const patterns: [RegExp, string][] = [
    [/^Use at least (\d+) characters\.$/, 'Use at least {0} characters.'],
    [/^Enter a number from 1 to (\d+)\.$/, 'Enter a number from 1 to {0}.'],
    [
      /^Too small: expected string to have >=(\d+) characters$/,
      'Enter at least {0} characters.',
    ],
    [
      /^Too big: expected string to have <=(\d+) characters$/,
      'Enter no more than {0} characters.',
    ],
    [/^Too small: expected number to be >=(\d+)$/, 'Enter at least {0}.'],
    [/^Too big: expected number to be <=(\d+)$/, 'Enter no more than {0}.'],
  ];
  for (const [pattern, key] of patterns) {
    const match = pattern.exec(message);
    if (match) return t(key, { '0': match[1]! });
  }
  if (
    /^(Invalid input:|Invalid email address|Invalid string:|Invalid option:)/.test(
      message,
    )
  )
    return t('Enter valid details.');
  return t(message);
}
