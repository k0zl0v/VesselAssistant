import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb } from '../../db';
import { describeError } from '../../i18n/errors';
import {
  CraneShiftService,
  type CraneMeasurement,
  type CraneShiftRecord,
  type CraneWorkingCoefficient,
  type DischargeOperationRef,
} from '../../services/CraneShiftService';

export interface CraneData {
  records: CraneShiftRecord[];
  working: CraneWorkingCoefficient[];
  measurements: CraneMeasurement[];
  operations: DischargeOperationRef[];
  /** Load Plan «Discharged» per event date; the voyage figure is the sum. */
  dischargedByDate: Record<string, number>;
  dischargedTotal: number;
}

export type CraneLoad =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; details: string }
  | { kind: 'ready'; data: CraneData };

async function readAll(voyage_id: string): Promise<CraneData> {
  const svc = new CraneShiftService(await getDb());
  const [records, working, measurements, operations, dischargedTotal] = await Promise.all([
    svc.listShiftRecords(voyage_id),
    svc.listWorkingCoefficients(),
    svc.listMeasurements(),
    svc.listDischargeOperations(voyage_id),
    svc.dischargedTons(voyage_id),
  ]);
  const dates = [...new Set(records.map((r) => r.shift_date))];
  const perDate = await Promise.all(dates.map((d) => svc.dischargedTons(voyage_id, d)));
  const dischargedByDate = Object.fromEntries(dates.map((d, i) => [d, perDate[i]!]));
  return { records, working, measurements, operations, dischargedByDate, dischargedTotal };
}

/**
 * Everything the crane screen reads for one voyage. `refresh` re-reads in place — the
 * previous numbers stay on screen meanwhile, so a toggle does not blank the page.
 */
export function useCraneData(voyage_id: string | null): { load: CraneLoad; refresh: () => Promise<void> } {
  const [load, setLoad] = useState<CraneLoad>({ kind: 'loading' });
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!voyage_id) return;
    const mine = ++seq.current;
    try {
      const data = await readAll(voyage_id);
      if (mine === seq.current) setLoad({ kind: 'ready', data });
    } catch (e) {
      if (mine === seq.current) {
        setLoad({ kind: 'error', message: describeError(e), details: e instanceof Error ? e.message : String(e) });
      }
    }
  }, [voyage_id]);

  useEffect(() => {
    setLoad({ kind: 'loading' });
    void refresh();
  }, [refresh]);

  return { load, refresh };
}
