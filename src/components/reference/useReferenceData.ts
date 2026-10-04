import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb } from '../../db';
import { describeError } from '../../i18n/errors';
import { CraneShiftService, type CraneWorkingCoefficient } from '../../services/CraneShiftService';
import { PortService, type Port } from '../../services/PortService';
import { ReferenceService, type Cargo, type Crane, type Hold, type Vessel } from '../../services/ReferenceService';

export interface ReferenceData {
  vessels: Vessel[];
  holdsByVessel: Record<string, Hold[]>;
  cargoes: Cargo[];
  cranes: Crane[];
  /** Working crane coefficients, all modes and their history (set on the crane correction screen). */
  working: CraneWorkingCoefficient[];
  ports: Port[];
}

export type ReferenceLoad =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; details: string }
  | { kind: 'ready'; data: ReferenceData };

async function readAll(): Promise<ReferenceData> {
  const db = await getDb();
  const ref = new ReferenceService(db);
  const [vessels, cargoes, cranes, working, ports] = await Promise.all([
    ref.listVessels(),
    ref.listCargoes(),
    ref.listCranes(),
    new CraneShiftService(db).listWorkingCoefficients(),
    new PortService(db).list(),
  ]);
  const holds = await Promise.all(vessels.map((v) => ref.listHolds(v.id)));
  const holdsByVessel: Record<string, Hold[]> = {};
  vessels.forEach((v, i) => {
    holdsByVessel[v.id] = holds[i] ?? [];
  });
  return { vessels, holdsByVessel, cargoes, cranes, working, ports };
}

/** All reference tables of the screen; `refresh` re-reads them after a mutation. */
export function useReferenceData(): { load: ReferenceLoad; refresh: () => Promise<void> } {
  const [load, setLoad] = useState<ReferenceLoad>({ kind: 'loading' });
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await readAll();
      if (mine === seq.current) setLoad({ kind: 'ready', data });
    } catch (e) {
      if (mine === seq.current) {
        setLoad({ kind: 'error', message: describeError(e), details: e instanceof Error ? e.message : String(e) });
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { load, refresh };
}
