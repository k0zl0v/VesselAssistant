import { useState } from 'react';
import { getDb } from '../db';
import { useT } from '../i18n';
import { CargoLotService } from '../services/CargoLotService';
import { useVoyage } from '../shell/VoyageContext';
import { AddLotForm } from './AddLotForm';
import { Dialog } from './ui/Dialog';

interface Props {
  /** Hold preselected by the screen that opened the dialog. */
  initialHoldId?: string;
  onClose: () => void;
}

/** Placeholder until the AddLot mockup lands: the old inline form inside a dialog. */
export function AddLotDialog({ initialHoldId, onClose }: Props) {
  const t = useT();
  const { data, cargoes, refresh } = useVoyage();
  const [holdId, setHoldId] = useState(initialHoldId ?? data?.calc.holds[0]?.hold_id ?? '');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  return (
    <Dialog title={t('lot.title')} onClose={onClose} testId="add-lot-dialog">
      <div className="dialog-body">
        <div className="segmented" role="group">
          {data.calc.holds.map((h) => (
            <button key={h.hold_id} type="button" aria-pressed={h.hold_id === holdId} onClick={() => setHoldId(h.hold_id)}>
              №{h.hold_no}
            </button>
          ))}
        </div>
        <AddLotForm
          key={holdId}
          cargoes={cargoes}
          voyage_id={data.voyage.id}
          hold_id={holdId}
          busy={busy}
          onSubmit={async (input) => {
            setBusy(true);
            try {
              await new CargoLotService(await getDb()).add(input);
              await refresh();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </Dialog>
  );
}
