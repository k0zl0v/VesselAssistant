import { useEffect, useState } from 'react';
import { CraneCorrectionPanel } from '../components/CraneCorrectionPanel';
import { getDb } from '../db';
import { useT } from '../i18n';
import { PageHeader } from '../shell/PageHeader';
import {
  ReferenceService,
  type Cargo,
  type Crane,
  type Hold,
  type Vessel,
} from '../services/ReferenceService';

export function ReferencePage() {
  const t = useT();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [cargoes, setCargoes] = useState<Cargo[]>([]);
  const [cranes, setCranes] = useState<Crane[]>([]);
  const [holdsByVessel, setHoldsByVessel] = useState<Record<string, Hold[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const db = await getDb();
    const ref = new ReferenceService(db);
    const [vs, cs, cr] = await Promise.all([
      ref.listVessels(),
      ref.listCargoes(),
      ref.listCranes(),
    ]);
    const holds: Record<string, Hold[]> = {};
    for (const v of vs) {
      holds[v.id] = await ref.listHolds(v.id);
    }
    setVessels(vs);
    setCargoes(cs);
    setCranes(cr);
    setHoldsByVessel(holds);
  }

  useEffect(() => {
    refresh().catch((e: unknown) => setError(String(e)));
  }, []);

  async function withBusy(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t('reference.title')} />
      <div className="page-body">
      {error && <p className="error">{error}</p>}

      <section className="reference-block">
        <h2>{t('reference.vessels.title')}</h2>
        <table className="ref-table">
          <thead>
            <tr>
              <th>{t('reference.vessels.col.name')}</th>
              <th>{t('reference.vessels.col.flag')}</th>
              <th>{t('reference.vessels.col.owner')}</th>
              <th>{t('reference.vessels.col.imo')}</th>
              <th className="num">{t('reference.vessels.col.holds')}</th>
            </tr>
          </thead>
          <tbody>
            {vessels.length === 0 && (
              <tr>
                <td colSpan={5} className="hint inline">
                  {t('reference.vessels.empty')}
                </td>
              </tr>
            )}
            {vessels.map((v) => (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td>{v.flag ?? '—'}</td>
                <td>{v.owner ?? '—'}</td>
                <td>{v.imo ?? '—'}</td>
                <td className="num">{(holdsByVessel[v.id] ?? []).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <NewVesselForm
          busy={busy}
          onSubmit={(input) =>
            withBusy(async () => {
              const db = await getDb();
              await new ReferenceService(db).createVessel(input);
            })
          }
        />
      </section>

      <section className="reference-block">
        <h2>{t('reference.holds.title')}</h2>
        {vessels.map((v) => (
          <div key={v.id} className="vessel-holds">
            <h3>{v.name}</h3>
            <ul className="hold-list">
              {(holdsByVessel[v.id] ?? []).map((h) => (
                <li key={h.id}>
                  №{h.hold_no} — {h.volume_m3.toFixed(3)} m³
                  {h.notes ? ` — ${h.notes}` : ''}
                </li>
              ))}
              {(holdsByVessel[v.id] ?? []).length === 0 && (
                <li className="hint inline">{t('reference.holds.empty_vessel')}</li>
              )}
            </ul>
            <NewHoldForm
              vesselId={v.id}
              busy={busy}
              onSubmit={(input) =>
                withBusy(async () => {
                  const db = await getDb();
                  await new ReferenceService(db).createHold(input);
                })
              }
            />
          </div>
        ))}
        {vessels.length === 0 && (
          <p className="hint inline">{t('reference.holds.no_vessels')}</p>
        )}
      </section>

      <section className="reference-block">
        <h2>{t('reference.cranes.title')}</h2>
        <table className="ref-table">
          <thead>
            <tr>
              <th>{t('reference.cranes.col.name')}</th>
              <th>{t('reference.cranes.col.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {cranes.length === 0 && (
              <tr>
                <td colSpan={2} className="hint inline">
                  {t('reference.cranes.empty')}
                </td>
              </tr>
            )}
            {cranes.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <NewCraneForm
          busy={busy}
          onSubmit={(input) =>
            withBusy(async () => {
              const db = await getDb();
              await new ReferenceService(db).createCrane(input);
            })
          }
        />
      </section>

      <CraneCorrectionPanel cranes={cranes} vessels={vessels} refresh={refresh} />

      <section className="reference-block">
        <h2>{t('reference.cargoes.title')}</h2>
        <table className="ref-table">
          <thead>
            <tr>
              <th>{t('reference.cargoes.col.name')}</th>
              <th className="num">{t('reference.cargoes.col.default_protein')}</th>
            </tr>
          </thead>
          <tbody>
            {cargoes.length === 0 && (
              <tr>
                <td colSpan={2} className="hint inline">
                  {t('reference.cargoes.empty')}
                </td>
              </tr>
            )}
            {cargoes.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="num">
                  {c.default_protein === null ? '—' : `${c.default_protein.toFixed(1)} %`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <NewCargoForm
          busy={busy}
          onSubmit={(input) =>
            withBusy(async () => {
              const db = await getDb();
              await new ReferenceService(db).createCargo(input);
            })
          }
        />
      </section>
      </div>
    </>
  );
}

function NewVesselForm({
  onSubmit,
  busy,
}: {
  onSubmit: (input: { name: string; flag?: string | null }) => Promise<void>;
  busy: boolean;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [flag, setFlag] = useState('');
  return (
    <form
      className="form-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onSubmit({ name: name.trim(), flag: flag.trim() || null });
        setName('');
        setFlag('');
      }}
    >
      <strong>{t('reference.vessels.add_title')}</strong>
      <input
        type="text"
        placeholder={t('reference.vessels.name_placeholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder={t('reference.vessels.flag_placeholder')}
        value={flag}
        onChange={(e) => setFlag(e.target.value)}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        {t('reference.vessels.add')}
      </button>
    </form>
  );
}

function NewCargoForm({
  onSubmit,
  busy,
}: {
  onSubmit: (input: { name: string; default_protein?: number | null }) => Promise<void>;
  busy: boolean;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [protein, setProtein] = useState('');
  return (
    <form
      className="form-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onSubmit({
          name: name.trim(),
          default_protein: protein ? Number(protein) : null,
        });
        setName('');
        setProtein('');
      }}
    >
      <strong>{t('reference.cargoes.add_title')}</strong>
      <input
        type="text"
        placeholder={t('reference.cargoes.name_placeholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="number"
        step="0.1"
        placeholder={t('reference.cargoes.protein_placeholder')}
        value={protein}
        onChange={(e) => setProtein(e.target.value)}
        style={{ width: '8rem' }}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        {t('reference.cargoes.add')}
      </button>
    </form>
  );
}

function NewCraneForm({
  onSubmit,
  busy,
}: {
  onSubmit: (input: { name: string; notes?: string | null }) => Promise<void>;
  busy: boolean;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <form
      className="form-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onSubmit({ name: name.trim(), notes: notes.trim() || null });
        setName('');
        setNotes('');
      }}
    >
      <strong>{t('reference.cranes.add_title')}</strong>
      <input
        type="text"
        placeholder={t('reference.cranes.name_placeholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder={t('reference.cranes.notes_placeholder')}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        {t('reference.cranes.add')}
      </button>
    </form>
  );
}

function NewHoldForm({
  vesselId,
  onSubmit,
  busy,
}: {
  vesselId: string;
  onSubmit: (input: {
    vessel_id: string;
    hold_no: number;
    volume_m3: number;
  }) => Promise<void>;
  busy: boolean;
}) {
  const t = useT();
  const [holdNo, setHoldNo] = useState('');
  const [volume, setVolume] = useState('');
  return (
    <form
      className="form-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number(holdNo);
        const v = Number(volume);
        if (!Number.isInteger(n) || n <= 0 || v <= 0) return;
        await onSubmit({ vessel_id: vesselId, hold_no: n, volume_m3: v });
        setHoldNo('');
        setVolume('');
      }}
    >
      <strong>{t('reference.holds.add_title')}</strong>
      <input
        type="number"
        min="1"
        step="1"
        placeholder={t('reference.holds.no_placeholder')}
        value={holdNo}
        onChange={(e) => setHoldNo(e.target.value)}
        required
        style={{ width: '5rem' }}
      />
      <input
        type="number"
        min="0.001"
        step="0.001"
        placeholder={t('reference.holds.volume_placeholder')}
        value={volume}
        onChange={(e) => setVolume(e.target.value)}
        required
        style={{ width: '8rem' }}
      />
      <button
        type="submit"
        disabled={busy || !holdNo || !volume}
      >
        {t('reference.holds.add')}
      </button>
    </form>
  );
}
