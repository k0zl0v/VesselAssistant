import { useMemo, useState, type ReactNode } from 'react';
import { formatPercent, formatTons } from '../../calc/round';
import { getDb } from '../../db';
import { useT } from '../../i18n';
import { ReferenceService, type Hold, type Vessel } from '../../services/ReferenceService';
import type { VoyageData } from '../../shell/VoyageContext';
import { cargoColor } from '../ui/cargo';
import { Icon } from '../ui/Icon';
import { EmptyState } from '../ui/states';
import { FormDialog } from './FormDialog';

interface Props {
  vessels: Vessel[];
  holdsByVessel: Record<string, Hold[]>;
  voyage: VoyageData | null;
  onChanged: () => Promise<void>;
  /** Rendered under the holds card (crane correction, per the mockup). */
  children?: ReactNode;
}

const totalVolume = (holds: Hold[]): number => holds.reduce((s, h) => s + h.volume_m3, 0);

export function VesselsTab({ vessels, holdsByVessel, voyage, onChanged, children }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'vessel' | 'hold' | null>(null);

  const mainId = voyage?.vessel?.id ?? null;
  const selected = vessels.find((v) => v.id === pickedId) ?? vessels.find((v) => v.id === mainId) ?? vessels[0] ?? null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vessels;
    return vessels.filter((v) => v.name.toLowerCase().includes(q) || (v.imo ?? '').toLowerCase().includes(q));
  }, [vessels, query]);

  async function created(select?: string): Promise<void> {
    await onChanged();
    if (select) setPickedId(select);
  }

  return (
    <div className="refs-vessels">
      <section className="refs-vessel-list" aria-labelledby="refs-vessels-heading">
        <div className="refs-vessel-list-head">
          <div className="refs-row">
            <h2 id="refs-vessels-heading" className="refs-list-title">
              {t('refs.vessels.heading', { count: vessels.length })}
            </h2>
            <button type="button" className="btn btn-sm refs-add" onClick={() => setDialog('vessel')} data-testid="refs-add-vessel">
              {t('refs.vessels.add')}
            </button>
          </div>
          <label className="search-box refs-search">
            <Icon name="search" size={13} />
            <span className="visually-hidden">{t('refs.vessels.search_label')}</span>
            <input
              className="input-bare"
              type="search"
              value={query}
              placeholder={t('refs.vessels.search')}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="refs-vessel-search"
            />
          </label>
        </div>
        {vessels.length > 0 && (
        <div className="refs-vessel-items">
          {vessels.length > 0 && visible.length === 0 && (
            <p className="refs-no-match">{t('refs.vessels.no_match', { query: query.trim() })}</p>
          )}
          {visible.map((v) => {
            const holds = holdsByVessel[v.id] ?? [];
            const meta = [
              v.flag,
              v.imo ? `IMO ${v.imo}` : null,
              t('refs.vessels.holds_count', { count: holds.length }),
              holds.length > 0 ? `${formatTons(totalVolume(holds))} ${t('refs.unit_m3')}` : null,
            ].filter(Boolean);
            return (
              <button
                key={v.id}
                type="button"
                className="btn refs-vessel-item"
                aria-pressed={selected?.id === v.id}
                onClick={() => setPickedId(v.id)}
                data-testid={`refs-vessel-${v.id}`}
              >
                <span className="refs-vessel-item-top">
                  <span className="refs-vessel-name">{v.name}</span>
                  {v.id === mainId && <span className="refs-role-tag">{t('refs.vessels.role_main')}</span>}
                </span>
                <span className="refs-vessel-meta">{meta.join(' · ')}</span>
              </button>
            );
          })}
        </div>
        )}
      </section>

      <div className="refs-vessel-main">
        {selected ? (
          <VesselDetails
            vessel={selected}
            holds={holdsByVessel[selected.id] ?? []}
            voyage={voyage && voyage.vessel?.id === selected.id ? voyage : null}
            onAddHold={() => setDialog('hold')}
          />
        ) : (
          <EmptyState
            icon="ship"
            title={t('refs.vessels.empty.title')}
            text={t('refs.vessels.empty.text')}
            actions={
              <button type="button" className="btn btn-primary" onClick={() => setDialog('vessel')}>
                {t('refs.vessels.add')}
              </button>
            }
            testId="refs-vessels-empty"
          />
        )}
        {children}
      </div>

      {dialog === 'vessel' && <NewVesselDialog onClose={() => setDialog(null)} onCreated={(id) => created(id)} />}
      {dialog === 'hold' && selected && (
        <NewHoldDialog
          vessel={selected}
          holds={holdsByVessel[selected.id] ?? []}
          onClose={() => setDialog(null)}
          onCreated={() => created()}
        />
      )}
    </div>
  );
}

function VesselDetails({
  vessel,
  holds,
  voyage,
  onAddHold,
}: {
  vessel: Vessel;
  holds: Hold[];
  /** Set only when this vessel runs the selected voyage. */
  voyage: VoyageData | null;
  onAddHold: () => void;
}) {
  const t = useT();
  const fields: { id: string; label: string; value: string; mono?: boolean }[] = [
    { id: 'refs-f-name', label: t('refs.vessel.name'), value: vessel.name },
    { id: 'refs-f-flag', label: t('refs.vessel.flag'), value: vessel.flag ?? '—' },
    { id: 'refs-f-owner', label: t('refs.vessel.owner'), value: vessel.owner ?? '—' },
    { id: 'refs-f-imo', label: t('refs.vessel.imo'), value: vessel.imo ?? '—', mono: true },
    { id: 'refs-f-fill', label: t('refs.vessel.fill'), value: formatPercent(vessel.default_fill_percent * 100), mono: true },
  ];

  return (
    <>
      <section className="card refs-vessel-card" data-testid="refs-vessel-details">
        <div className="refs-row refs-vessel-card-head">
          <h2 className="refs-vessel-title">{vessel.name}</h2>
          {voyage && (
            <span className="refs-role-line">{t('refs.vessels.role_line', { voyage_no: voyage.voyage.voyage_no })}</span>
          )}
        </div>
        <div className="refs-fields">
          {fields.map((f) => (
            <div className="field" key={f.id}>
              <label className="field-label" htmlFor={f.id}>
                {f.label}
              </label>
              <input id={f.id} className={`input${f.mono ? ' mono' : ''}`} value={f.value} readOnly />
            </div>
          ))}
        </div>
        <p className="field-hint">{t('refs.vessel.readonly_note')}</p>
      </section>

      <section className="table-card" aria-labelledby="refs-holds-heading">
        <div className="refs-card-head">
          <h2 id="refs-holds-heading" className="card-title">
            {t('refs.holds.title')}
          </h2>
          {holds.length > 0 && (
            <span className="card-subtitle">
              {t('refs.holds.total')} <HoldsTotal holds={holds} />
            </span>
          )}
          <span className="toolbar-spacer" />
          <button type="button" className="btn btn-sm refs-add" onClick={onAddHold} data-testid="refs-add-hold">
            {t('refs.holds.add')}
          </button>
        </div>
        {holds.length === 0 ? (
          <div className="refs-card-empty">
            <EmptyState
              icon="table"
              title={t('refs.holds.empty.title')}
              text={t('refs.holds.empty.text')}
              actions={
                <button type="button" className="btn btn-primary" onClick={onAddHold}>
                  {t('refs.holds.add')}
                </button>
              }
              testId="refs-holds-empty"
            />
          </div>
        ) : (
          <table className="data-table refs-holds-table" data-testid="refs-holds-table">
            <thead>
              <tr>
                <th className="refs-col-hold">{t('refs.holds.col.hold')}</th>
                <th className="num refs-col-volume">{t('refs.holds.col.volume')}</th>
                <th className="refs-col-cargo">{t('refs.holds.col.cargo')}</th>
                <th className="num refs-col-sf">{t('refs.holds.col.sf')}</th>
                <th>{t('refs.holds.col.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((h) => (
                <HoldRow key={h.id} hold={h} voyage={voyage} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function HoldsTotal({ holds }: { holds: Hold[] }) {
  const t = useT();
  return (
    <>
      <span className="mono">{formatTons(totalVolume(holds))}</span> {t('refs.unit_m3')}
    </>
  );
}

function HoldRow({ hold, voyage }: { hold: Hold; voyage: VoyageData | null }) {
  const summary = voyage?.overview.holds[hold.id];
  const calc = voyage?.calc.holds.find((c) => c.hold_id === hold.id);
  const names = summary?.cargo_names ?? [];
  const proteins = summary?.protein_percents ?? [];
  const cargo = names.length
    ? [names.join(' + '), ...proteins.map((p) => formatPercent(p))].join(' · ')
    : null;
  return (
    <tr>
      <td className="mono refs-hold-no">№{hold.hold_no}</td>
      <td className="num">{formatTons(hold.volume_m3)}</td>
      <td>
        {cargo ? (
          <span className="cargo-tag">
            <span className="cargo-swatch" style={{ background: cargoColor(names[0]) }} />
            {cargo}
          </span>
        ) : (
          <span className="zero">—</span>
        )}
      </td>
      <td className="num muted">{calc?.sf != null ? formatTons(calc.sf) : <span className="zero">—</span>}</td>
      <td className="muted refs-small">{hold.notes ?? '—'}</td>
    </tr>
  );
}

function NewVesselDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const t = useT();
  const [name, setName] = useState('');
  const [flag, setFlag] = useState('');
  const [owner, setOwner] = useState('');
  const [imo, setImo] = useState('');
  const opt = ` (${t('refs.optional')})`;
  return (
    <FormDialog
      title={t('refs.vessel.dialog.title')}
      subtitle={t('refs.vessel.dialog.subtitle')}
      onClose={onClose}
      testId="refs-vessel-dialog"
      validate={() => (name.trim() ? null : t('refs.vessel.error.name'))}
      submit={async () => {
        const v = await new ReferenceService(await getDb()).createVessel({
          name: name.trim(),
          flag: flag.trim() || null,
          owner: owner.trim() || null,
          imo: imo.trim() || null,
        });
        await onCreated(v.id);
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="refs-nv-name">{t('refs.vessel.name')}</label>
          <input id="refs-nv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="refs-nv-name" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="refs-nv-flag">{t('refs.vessel.flag') + opt}</label>
          <input id="refs-nv-flag" className="input" value={flag} onChange={(e) => setFlag(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="refs-nv-owner">{t('refs.vessel.owner') + opt}</label>
          <input id="refs-nv-owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="refs-nv-imo">{t('refs.vessel.imo') + opt}</label>
          <input id="refs-nv-imo" className="input mono" value={imo} onChange={(e) => setImo(e.target.value)} inputMode="numeric" />
        </div>
      </div>
    </FormDialog>
  );
}

function NewHoldDialog({
  vessel,
  holds,
  onClose,
  onCreated,
}: {
  vessel: Vessel;
  holds: Hold[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const t = useT();
  const nextNo = holds.reduce((m, h) => Math.max(m, h.hold_no), 0) + 1;
  const [no, setNo] = useState(String(nextNo));
  const [volume, setVolume] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <FormDialog
      title={t('refs.holds.dialog.title', { vessel: vessel.name })}
      onClose={onClose}
      testId="refs-hold-dialog"
      validate={() => {
        const n = Number(no);
        if (!Number.isInteger(n) || n < 1) return t('refs.holds.error.no');
        if (holds.some((h) => h.hold_no === n)) return t('refs.holds.error.no_taken', { no: n });
        if (!(Number(volume) > 0)) return t('refs.holds.error.volume');
        return null;
      }}
      submit={async () => {
        await new ReferenceService(await getDb()).createHold({
          vessel_id: vessel.id,
          hold_no: Number(no),
          volume_m3: Number(volume),
          notes: notes.trim() || null,
        });
        await onCreated();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="refs-nh-no">{t('refs.holds.no')}</label>
          <input id="refs-nh-no" className="input num" type="number" min={1} step={1} value={no} onChange={(e) => setNo(e.target.value)} data-testid="refs-nh-no" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="refs-nh-volume">{t('refs.holds.volume')}</label>
          <input id="refs-nh-volume" className="input num" type="number" min={0} step={0.001} value={volume} onChange={(e) => setVolume(e.target.value)} autoFocus data-testid="refs-nh-volume" />
        </div>
        <div className="field span-2">
          <label className="field-label" htmlFor="refs-nh-notes">{`${t('refs.holds.notes')} (${t('refs.optional')})`}</label>
          <input id="refs-nh-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </FormDialog>
  );
}
