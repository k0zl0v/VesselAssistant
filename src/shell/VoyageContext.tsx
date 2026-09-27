import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { findOverlapping } from '../calc/time';
import { getDb } from '../db';
import { describeError } from '../i18n/errors';
import { reportError } from '../errorReporting';
import { CalculationService, type VoyageCalcResult } from '../services/CalculationService';
import { ReferenceService, type Cargo, type Hold, type Vessel } from '../services/ReferenceService';
import { SofService, type SofEvent } from '../services/SofService';
import {
  listPorts,
  loadVoyageOverview,
  type Port,
  type VoyageOverview,
} from '../services/VoyageOverview';
import type { Voyage } from '../services/types';

/** Everything the screens of one voyage read; recomputed after each mutation. */
export interface VoyageData {
  voyage: Voyage;
  vessel: Vessel | null;
  holds: Hold[];
  calc: VoyageCalcResult;
  overview: VoyageOverview;
  sofEvents: SofEvent[];
  sofOverlapCount: number;
  loadingPort: Port | null;
  dischargingPort: Port | null;
  /** When the numbers on screen were last recalculated. */
  calculatedAt: Date;
}

export type VoyageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; details: string }
  | { kind: 'ready' };

interface VoyageContextValue {
  state: VoyageState;
  voyages: Voyage[];
  vessels: Vessel[];
  cargoes: Cargo[];
  ports: Port[];
  selectedId: string | null;
  /** Null while nothing is selected or the selected voyage is still loading. */
  data: VoyageData | null;
  isOpen: boolean;
  select: (voyage_id: string) => Promise<void>;
  /** Recalculate the selected voyage in place — the previous numbers stay on screen meanwhile. */
  refresh: () => Promise<void>;
  /** Re-read the voyage list and reference data, then select `voyage_id` (or keep the current one). */
  reload: (voyage_id?: string | null) => Promise<void>;
}

const Ctx = createContext<VoyageContextValue | null>(null);

async function loadVoyageData(voyage: Voyage, vessels: Vessel[], ports: Port[]): Promise<VoyageData> {
  const db = await getDb();
  const [calc, overview, sofEvents, holds] = await Promise.all([
    new CalculationService(db).calculate(voyage.id),
    loadVoyageOverview(db, voyage.id),
    new SofService(db).list(voyage.id),
    new ReferenceService(db).listHolds(voyage.vessel_id),
  ]);
  const overlaps = findOverlapping(sofEvents);
  return {
    voyage,
    vessel: vessels.find((v) => v.id === voyage.vessel_id) ?? null,
    holds,
    calc,
    overview,
    sofEvents,
    sofOverlapCount: overlaps.size,
    loadingPort: ports.find((p) => p.id === voyage.loading_port_id) ?? null,
    dischargingPort: ports.find((p) => p.id === voyage.discharging_port_id) ?? null,
    calculatedAt: new Date(),
  };
}

export function VoyageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VoyageState>({ kind: 'loading' });
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [cargoes, setCargoes] = useState<Cargo[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<VoyageData | null>(null);
  // Guards against a slow load of voyage A overwriting a later selection of B.
  const requestSeq = useRef(0);
  const latest = useRef({ voyages, vessels, ports, selectedId });
  latest.current = { voyages, vessels, ports, selectedId };

  const failWith = useCallback((e: unknown) => {
    void reportError('voyage-load', e);
    setState({ kind: 'error', message: describeError(e), details: e instanceof Error ? e.message : String(e) });
  }, []);

  const loadSelected = useCallback(
    async (voyage: Voyage | null, vesselList: Vessel[], portList: Port[]) => {
      const seq = ++requestSeq.current;
      if (!voyage) {
        setData(null);
        return;
      }
      const next = await loadVoyageData(voyage, vesselList, portList);
      if (seq === requestSeq.current) setData(next);
    },
    [],
  );

  const reload = useCallback(
    async (voyage_id?: string | null) => {
      try {
        const db = await getDb();
        const ref = new ReferenceService(db);
        const [list, vesselList, cargoList, portList] = await Promise.all([
          db.select<Voyage>(`SELECT * FROM voyages ORDER BY created_at DESC`),
          ref.listVessels(),
          ref.listCargoes(),
          listPorts(db),
        ]);
        const wanted = voyage_id === undefined ? latest.current.selectedId : voyage_id;
        const target = list.find((v) => v.id === wanted) ?? list[0] ?? null;
        setVoyages(list);
        setVessels(vesselList);
        setCargoes(cargoList);
        setPorts(portList);
        setSelectedId(target?.id ?? null);
        await loadSelected(target, vesselList, portList);
        setState({ kind: 'ready' });
      } catch (e) {
        failWith(e);
      }
    },
    [failWith, loadSelected],
  );

  const select = useCallback(
    async (voyage_id: string) => {
      const { voyages: list, vessels: vesselList, ports: portList } = latest.current;
      const voyage = list.find((v) => v.id === voyage_id) ?? null;
      setSelectedId(voyage?.id ?? null);
      setData((d) => (d && d.voyage.id === voyage_id ? d : null));
      try {
        await loadSelected(voyage, vesselList, portList);
      } catch (e) {
        failWith(e);
      }
    },
    [failWith, loadSelected],
  );

  const refresh = useCallback(async () => {
    const { selectedId: id } = latest.current;
    if (!id) return;
    // Re-read the voyage row too: closing a voyage changes its status.
    const db = await getDb();
    const [fresh] = await db.select<Voyage>(`SELECT * FROM voyages WHERE id = ?`, [id]);
    if (fresh) setVoyages((list) => list.map((v) => (v.id === id ? fresh : v)));
    await loadSelected(fresh ?? null, latest.current.vessels, latest.current.ports);
  }, [loadSelected]);

  useEffect(() => {
    void reload(null);
  }, [reload]);

  const value = useMemo<VoyageContextValue>(
    () => ({
      state,
      voyages,
      vessels,
      cargoes,
      ports,
      selectedId,
      data,
      isOpen: data?.voyage.status === 'open',
      select,
      refresh,
      reload,
    }),
    [state, voyages, vessels, cargoes, ports, selectedId, data, select, refresh, reload],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVoyage(): VoyageContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVoyage must be used inside <VoyageProvider>');
  return v;
}
