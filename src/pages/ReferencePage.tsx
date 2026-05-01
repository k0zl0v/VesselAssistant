import { useEffect, useState } from 'react';
import { CraneCorrectionPanel } from '../components/CraneCorrectionPanel';
import { getDb } from '../db';
import {
  ReferenceService,
  type Cargo,
  type Crane,
  type Hold,
  type Vessel,
} from '../services/ReferenceService';

export function ReferencePage() {
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
    <main className="container">
      <h1>Reference data</h1>
      {error && <p className="error">{error}</p>}

      <section className="reference-block">
        <h2>Vessels</h2>
        <table className="ref-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Flag</th>
              <th>Owner</th>
              <th>IMO</th>
              <th className="num">Holds</th>
            </tr>
          </thead>
          <tbody>
            {vessels.length === 0 && (
              <tr>
                <td colSpan={5} className="hint inline">
                  No vessels yet.
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
        <h2>Holds (per vessel)</h2>
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
                <li className="hint inline">No holds yet.</li>
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
          <p className="hint inline">Add a vessel first.</p>
        )}
      </section>

      <section className="reference-block">
        <h2>Cranes</h2>
        <table className="ref-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {cranes.length === 0 && (
              <tr>
                <td colSpan={2} className="hint inline">
                  No cranes yet.
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
        <h2>Cargoes</h2>
        <table className="ref-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">Default protein</th>
            </tr>
          </thead>
          <tbody>
            {cargoes.length === 0 && (
              <tr>
                <td colSpan={2} className="hint inline">
                  No cargoes yet.
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
    </main>
  );
}

function NewVesselForm({
  onSubmit,
  busy,
}: {
  onSubmit: (input: { name: string; flag?: string | null }) => Promise<void>;
  busy: boolean;
}) {
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
      <strong>Add vessel</strong>
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Flag (optional)"
        value={flag}
        onChange={(e) => setFlag(e.target.value)}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        Add
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
      <strong>Add cargo</strong>
      <input
        type="text"
        placeholder="Name (e.g. WHEAT, SFM)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="number"
        step="0.1"
        placeholder="Default protein %"
        value={protein}
        onChange={(e) => setProtein(e.target.value)}
        style={{ width: '8rem' }}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        Add
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
      <strong>Add crane</strong>
      <input
        type="text"
        placeholder="Name (e.g. CRANE # 1)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        Add
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
      <strong>Add hold</strong>
      <input
        type="number"
        min="1"
        step="1"
        placeholder="No"
        value={holdNo}
        onChange={(e) => setHoldNo(e.target.value)}
        required
        style={{ width: '5rem' }}
      />
      <input
        type="number"
        min="0.001"
        step="0.001"
        placeholder="Volume m³"
        value={volume}
        onChange={(e) => setVolume(e.target.value)}
        required
        style={{ width: '8rem' }}
      />
      <button
        type="submit"
        disabled={busy || !holdNo || !volume}
      >
        Add
      </button>
    </form>
  );
}
