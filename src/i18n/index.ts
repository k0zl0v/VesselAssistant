import { useSyncExternalStore } from 'react';
import { en } from './en';
import { ru } from './ru';

export type Lang = 'en' | 'ru';

export const STRINGS = { en, ru } as const;
export type StringKey = keyof typeof en;

const STORAGE_KEY = 'vessel-assistant.lang';

let currentLang: Lang = (() => {
  try {
    const saved =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {
    /* localStorage unavailable */
  }
  return 'en';
})();

const listeners = new Set<() => void>();

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Translate a key with optional `{name}` parameter substitution. Falls back
 * to the English value if the active dictionary lacks the key, then to the
 * key string itself as a last resort.
 */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const dict = STRINGS[currentLang];
  let s: string =
    (dict as Record<string, string>)[key] ??
    (en as Record<string, string>)[key] ??
    key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

/** Hook that re-renders the calling component whenever the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    subscribeLang,
    () => currentLang,
    () => 'en' as Lang,
  );
}

/** Convenience hook: returns `t` and re-renders on language change. */
export function useT(): typeof t {
  useLang();
  return t;
}

/** Test-only: reset module state. Not exported from the public API. */
export function __resetForTests(): void {
  currentLang = 'en';
  listeners.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
