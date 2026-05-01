import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../en';
import { ru } from '../ru';
import {
  __resetForTests,
  getLang,
  setLang,
  subscribeLang,
  t,
} from '../index';

describe('i18n', () => {
  beforeEach(() => {
    __resetForTests();
  });

  it('defaults to English', () => {
    expect(getLang()).toBe('en');
    expect(t('app.nav.voyages')).toBe(en['app.nav.voyages']);
  });

  it('setLang switches the active dictionary', () => {
    setLang('ru');
    expect(getLang()).toBe('ru');
    expect(t('app.nav.voyages')).toBe(ru['app.nav.voyages']);
  });

  it('falls back to English when a key is missing in the active dict', () => {
    // Mutate ru in place to simulate a missing key, then restore.
    const original = ru['app.nav.voyages'];
    delete (ru as Record<string, string>)['app.nav.voyages'];
    try {
      setLang('ru');
      expect(t('app.nav.voyages')).toBe(en['app.nav.voyages']);
    } finally {
      (ru as Record<string, string>)['app.nav.voyages'] = original;
    }
  });

  it('substitutes {name}-style parameters', () => {
    expect(t('demo.with-param', { name: 'X' })).toBe('Hello X');
    setLang('ru');
    expect(t('demo.with-param', { name: 'X' })).toBe('Привет, X');
  });

  it('subscribeLang fires the listener on setLang', () => {
    const fn = vi.fn();
    const unsubscribe = subscribeLang(fn);
    setLang('ru');
    expect(fn).toHaveBeenCalledTimes(1);
    setLang('ru'); // no-op, same language
    expect(fn).toHaveBeenCalledTimes(1);
    setLang('en');
    expect(fn).toHaveBeenCalledTimes(2);
    unsubscribe();
    setLang('ru');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('every English key has a Russian translation', () => {
    const enKeys = Object.keys(en);
    const ruKeys = new Set(Object.keys(ru));
    const missing = enKeys.filter((k) => !ruKeys.has(k));
    expect(missing).toEqual([]);
  });
});
