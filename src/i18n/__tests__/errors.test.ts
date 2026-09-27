import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '../../errorReporting';
import { AppError } from '../../services/errors';
import { en } from '../en';
import { describeError } from '../errors';
import { __resetForTests, setLang } from '../index';
import { ru } from '../ru';

vi.mock('../../errorReporting', () => ({ reportError: vi.fn(async () => undefined) }));

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Keys the service error contract and the later UI slices (session gate, crash screen, voyage copy, audit columns) render. */
const PLAN_KEYS = [
  'error.voyage.not_found',
  'error.hold.not_found',
  'error.ogv.insufficient_cargo',
  'error.voyage.closed',
  'error.voyage.closed_reason_required',
  'error.protein.invalid',
  'error.backup.failed',
  'error.batch.stale',
  'error.unexpected',
  'session.title',
  'session.name',
  'session.role',
  'session.role.operator',
  'session.role.supervisor',
  'session.role.admin',
  'session.role.viewer',
  'session.start',
  'session.name_required',
  'app.crashed',
  'app.reload',
  'voyage.copy',
  'voyage.copy.voyage_no',
  'voyage.copy.submit',
  'voyage.copy.cancel',
  'voyage.close.confirm',
  'audit.col.user',
  'audit.col.role',
  'audit.col.reason',
  'import.rejected_row',
] as const;

describe('i18n keys for the error contract and new UI', () => {
  it('lists 29 distinct keys', () => {
    expect(new Set(PLAN_KEYS).size).toBe(29);
  });

  it.each(PLAN_KEYS)('%s exists in en and ru', (key) => {
    expect((en as Record<string, string>)[key]).toBeTruthy();
    expect((ru as Record<string, string>)[key]).toBeTruthy();
  });

  it.each(PLAN_KEYS)('%s: ru has no Latin outside {placeholders}', (key) => {
    const value = (ru as Record<string, string>)[key] ?? '';
    expect(value.replace(/\{[a-z_]+\}/g, '')).not.toMatch(/[A-Za-z]/);
  });

  it.each(PLAN_KEYS)('%s: en and ru use the same placeholders', (key) => {
    const placeholders = (s: string | undefined) => (s ?? '').match(/\{[a-z_]+\}/g)?.sort() ?? [];
    expect(placeholders((ru as Record<string, string>)[key])).toEqual(
      placeholders((en as Record<string, string>)[key]),
    );
  });
});

describe('describeError', () => {
  beforeEach(() => {
    __resetForTests();
    vi.mocked(reportError).mockClear();
  });

  it('renders ogv.insufficient_cargo in Russian with tons rounded to 3 decimals', () => {
    setLang('ru');
    const text = describeError(new AppError('ogv.insufficient_cargo', { hold_no: 3, short_tons: 1.0000001 }));
    expect(text).toBe('Недостаточно груза в трюме 3: не хватает 1.000 т');
    expect(text).not.toMatch(UUID);
    expect(text).not.toMatch(/Error|Insufficient/);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('renders the English dictionary when the language is en', () => {
    expect(describeError(new AppError('ogv.insufficient_cargo', { hold_no: 3, short_tons: 2.5 }))).toBe(
      'Not enough cargo in hold 3: 2.500 t short',
    );
  });

  it('does not leak id params of not_found codes', () => {
    setLang('ru');
    const id = crypto.randomUUID();
    expect(describeError(new AppError('voyage.not_found', { voyage_id: id }))).toBe('Рейс не найден.');
  });

  it('maps an unknown error to error.unexpected and reports it once', () => {
    setLang('ru');
    const err = new Error('Insufficient cargo in hold 1b2c3d4e-0000-4000-8000-000000000000');
    expect(describeError(err)).toBe(ru['error.unexpected']);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportError).mock.calls[0]![1]).toBe(err);
  });

  it('treats a non-Error throw as unexpected', () => {
    expect(describeError('boom')).toBe(en['error.unexpected']);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
