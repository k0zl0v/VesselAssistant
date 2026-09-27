import { useState } from 'react';
import { getDb } from '../db';
import { useT } from '../i18n';
import { OgvService } from '../services/OgvService';
import { useVoyage } from '../shell/VoyageContext';
import { DischargeForm } from './DischargeForm';
import { Dialog } from './ui/Dialog';

interface Props {
  initialHoldId?: string;
  onClose: () => void;
}

/** Placeholder until the Discharge mockup lands: the old inline form inside a dialog. */
export function DischargeDialog({ initialHoldId, onClose }: Props) {
  const t = useT();
  const { data, refresh } = useVoyage();
  const withCargo = data?.calc.holds.filter((h) => h.remain_tons > 0) ?? [];
  const [holdId, setHoldId] = useState(initialHoldId ?? withCargo[0]?.hold_id ?? '');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  return (
    <Dialog title={t('discharge.title')} onClose={onClose} wide testId="discharge-dialog">
      <div className="dialog-body">
        <div className="segmented" role="group">
          {withCargo.map((h) => (
            <button key={h.hold_id} type="button" aria-pressed={h.hold_id === holdId} onClick={() => setHoldId(h.hold_id)}>
              №{h.hold_no}
            </button>
          ))}
        </div>
        <DischargeForm
          key={holdId}
          voyage_id={data.voyage.id}
          hold_id={holdId}
          busy={busy}
          onSubmit={async (input) => {
            setBusy(true);
            try {
              await new OgvService(await getDb()).discharge(input);
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
