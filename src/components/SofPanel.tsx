import { findOverlapping } from '../calc/time';
import { useT, type StringKey } from '../i18n';
import type { SofEvent, CreateSofEventInput } from '../services/SofService';
import { SOF_CATEGORIES } from '../services/sofCategories';
import { AddSofEventForm } from './AddSofEventForm';

interface Props {
  voyage_id: string;
  events: SofEvent[];
  voyageOpen: boolean;
  busy: boolean;
  onAdd: (input: CreateSofEventInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const fmtTime = (t: string | null): string => (t ?? '—');

export function SofPanel({
  voyage_id,
  events,
  voyageOpen,
  busy,
  onAdd,
  onDelete,
}: Props) {
  const t = useT();
  const overlapping = findOverlapping(events);

  const labelFor = (key: string | null): string => {
    if (!key) return '—';
    const found = SOF_CATEGORIES.find((c) => c.key === key);
    if (!found) return key;
    return t(`sof.category.${found.key}` as StringKey);
  };

  return (
    <section className="sof-panel" data-testid="sof-panel">
      <h3>{t('sof.title')}</h3>
      {events.length === 0 ? (
        <p className="hint inline" data-testid="sof-empty">{t('sof.empty')}</p>
      ) : (
        <>
          {overlapping.size > 0 && (
            <p className="warning" data-testid="sof-overlap-warning">
              {t(
                overlapping.size === 1
                  ? 'sof.warning.overlap_one'
                  : 'sof.warning.overlap_many',
                { count: overlapping.size },
              )}
            </p>
          )}
          <table className="sof-table" data-testid="sof-log">
            <thead>
              <tr>
                <th>{t('sof.col.date')}</th>
                <th>{t('sof.col.from')}</th>
                <th>{t('sof.col.to')}</th>
                <th>{t('sof.col.category')}</th>
                <th>{t('sof.col.description')}</th>
                {voyageOpen && <th></th>}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id} className={overlapping.has(i) ? 'overlap' : ''} data-testid="sof-row">
                  <td data-testid="sof-row-date">{e.event_date}</td>
                  <td className="num" data-testid="sof-row-from">{fmtTime(e.time_from)}</td>
                  <td className="num" data-testid="sof-row-to">{fmtTime(e.time_to)}</td>
                  <td data-testid="sof-row-category">{labelFor(e.category)}</td>
                  <td data-testid="sof-row-description">{e.description ?? '—'}</td>
                  {voyageOpen && (
                    <td>
                      <button
                        type="button"
                        className="secondary danger"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(t('sof.delete.confirm'))) return;
                          void onDelete(e.id);
                        }}
                        aria-label={t('sof.delete_aria')}
                        data-testid="sof-row-delete"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {voyageOpen && (
        <AddSofEventForm
          voyage_id={voyage_id}
          onSubmit={onAdd}
          busy={busy}
        />
      )}
    </section>
  );
}
