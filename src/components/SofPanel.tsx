import { findOverlapping } from '../calc/time';
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

const labelFor = (key: string | null): string => {
  if (!key) return '—';
  const found = SOF_CATEGORIES.find((c) => c.key === key);
  return found ? found.label : key;
};

const fmtTime = (t: string | null): string => (t ?? '—');

export function SofPanel({
  voyage_id,
  events,
  voyageOpen,
  busy,
  onAdd,
  onDelete,
}: Props) {
  const overlapping = findOverlapping(events);

  return (
    <section className="sof-panel">
      <h3>Statement of Facts</h3>
      {events.length === 0 ? (
        <p className="hint inline">No events yet.</p>
      ) : (
        <>
          {overlapping.size > 0 && (
            <p className="warning">
              ⚠ {overlapping.size} event{overlapping.size > 1 ? 's' : ''}{' '}
              with overlapping time interval — review highlighted rows.
            </p>
          )}
          <table className="sof-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>Category</th>
                <th>Description</th>
                {voyageOpen && <th></th>}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id} className={overlapping.has(i) ? 'overlap' : ''}>
                  <td>{e.event_date}</td>
                  <td className="num">{fmtTime(e.time_from)}</td>
                  <td className="num">{fmtTime(e.time_to)}</td>
                  <td>{labelFor(e.category)}</td>
                  <td>{e.description ?? '—'}</td>
                  {voyageOpen && (
                    <td>
                      <button
                        type="button"
                        className="secondary danger"
                        disabled={busy}
                        onClick={() => void onDelete(e.id)}
                        aria-label="Delete event"
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
