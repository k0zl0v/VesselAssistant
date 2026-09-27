import { useEffect, useMemo, useState } from 'react';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import type { Db } from '../services/db';
import { useVoyage } from '../shell/VoyageContext';
import { DischargeForm } from './DischargeForm';
import { Dialog } from './ui/Dialog';
import { ErrorState } from './ui/states';

interface Props {
  initialHoldId?: string;
  onClose: () => void;
}

/** Discharge with a LIFO preview, bound to the selected voyage. */
export function DischargeDialog({ initialHoldId, onClose }: Props) {
  const t = useT();
  const { data, refresh } = useVoyage();
  const [db, setDb] = useState<Db | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getDb().then(
      (d) => live && setDb(d),
      (e: unknown) => live && setDbError(describeError(e)),
    );
    return () => {
      live = false;
    };
  }, []);

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
  if (!db) return null;
  return (
    <DischargeForm
      db={db}
      voyage_id={data.voyage.id}
      holds={data.calc.holds}
      cargoNames={cargoNames}
      initialHoldId={initialHoldId}
      onDischarged={refresh}
      onClose={onClose}
    />
  );
}
