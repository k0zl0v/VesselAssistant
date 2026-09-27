import { formatTons } from '../calc/round';
import { reportError } from '../errorReporting';
import { isAppError } from '../services/errors';
import { t } from './index';

function formatParams(params: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = k.endsWith('_tons') && typeof v === 'number' ? formatTons(v) : v;
  }
  return out;
}

/**
 * User-facing text for a caught error. `AppError` renders its `error.<code>` key;
 * anything else is reported to the file log and shown as `error.unexpected`.
 */
export function describeError(e: unknown): string {
  if (isAppError(e)) {
    return t(`error.${e.code}`, formatParams(e.params));
  }
  void reportError('ui', e);
  return t('error.unexpected');
}
