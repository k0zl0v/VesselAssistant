import { useEffect, useMemo, useState } from 'react';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import type { Db } from '../services/db';
import { OgvVesselService, type OgvHoldView } from '../services/OgvVesselService';
import { useVoyage } from '../shell/VoyageContext';
import { DischargeForm } from './DischargeForm';
import { Dialog } from './ui/Dialog';
import { ErrorState } from './ui/states';

interface Props {
  initialHoldId?: string;
  initialOgvHoldId?: string;
  onClose: () => void;
}

interface Ready {
  db: Db;
  /** Null when the voyage has no OGV registered. */
  ogvHolds: OgvHoldView[] | null;
}

/** Discharge with a LIFO preview and crane correction, bound to the selected voyage and its OGV. */
export function DischargeDialog({ initialHoldId, initialOgvHoldId, onClose }: Props) {
  const t = useT();
  const { data, cranes, refresh } = useVoyage();
  const [ready, setReady] = useState<Ready | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const voyageId = data?.voyage.id;

  useEffect(() => {
    if (!voyageId) return;
    let live = true;
    (async () => {
      const db = await getDb();
      const summary = await new OgvVesselService(db).summary(voyageId);
      if (live) setReady({ db, ogvHolds: summary?.holds ?? null });
    })().catch((e: unknown) => live && setDbError(describeError(e)));
    return () => {
      live = false;
    };
  }, [voyageId]);

  const cargoNames = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [id, s] of Object.entries(data?.overview.holds ?? {})) out[id] = s.cargo_names;
    return out;
  }, [data]);

  if (!data) return null;
  if (dbError) {
    return (
      <Dialog title={t('discharge.dialog.title_plain')} onClose={onClose} wide testId="discharge-dialog">
        <div className="dialog-body">
          <ErrorState title={t('shell.db_error.title')} message={dbError} hint={t('shell.db_error.hint')} />
        </div>
      </Dialog>
    );
  }
  if (!ready) return null;
  return (
    <DischargeForm
      db={ready.db}
      voyage_id={data.voyage.id}
      holds={data.calc.holds}
      cargoNames={cargoNames}
      initialHoldId={initialHoldId}
      cranes={cranes}
      ogvHolds={ready.ogvHolds ?? undefined}
      initialOgvHoldId={initialOgvHoldId}
      onDischarged={refresh}
      onClose={onClose}
    />
  );
}
