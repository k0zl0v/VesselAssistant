import { useEffect, useMemo, useState } from 'react';
import { getDb } from '../db';
import { useT } from '../i18n';
import { CargoLotService } from '../services/CargoLotService';
import { listLayers, type LayerView } from '../services/DischargeHistory';
import { voyageEyebrow } from '../shell/PageHeader';
import { useVoyage } from '../shell/VoyageContext';
import { AddLotForm, type AddLotHold } from './AddLotForm';
import { Dialog } from './ui/Dialog';
import { EmptyState } from './ui/states';

interface Props {
  /** Hold preselected by the screen that opened the dialog. */
  initialHoldId?: string;
  onClose: () => void;
}

/** Adds a lot on top of a hold's layer stack, with the AT-05 capacity check live beside the form. */
export function AddLotDialog({ initialHoldId, onClose }: Props) {
  const t = useT();
  const { data, cargoes, refresh } = useVoyage();
  const [holdId, setHoldId] = useState(initialHoldId ?? data?.calc.holds[0]?.hold_id ?? '');
  const [layers, setLayers] = useState<LayerView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const voyageId = data?.voyage.id;

  useEffect(() => {
    if (!voyageId) return;
    let alive = true;
    // Only the layer number and the quick picks depend on it; the form works without them.
    void getDb()
      .then((db) => listLayers(db, voyageId))
      .then((rows) => alive && setLayers(rows))
      .catch(() => alive && setLayers([]));
    return () => {
      alive = false;
    };
  }, [voyageId]);

  const sourceVessels = useMemo(
    () => [...new Set((layers ?? []).map((l) => l.source_vessel))].sort((a, b) => a.localeCompare(b)),
    [layers],
  );

  if (!data) return null;

  const calcHold = data.calc.holds.find((h) => h.hold_id === holdId);
  const summary = data.overview.holds[holdId];
  // listLayers orders a hold top of stack first.
  const holdLayers = (layers ?? []).filter((l) => l.hold_id === holdId);
  const hold: AddLotHold | null = calcHold
    ? {
        hold_id: calcHold.hold_id,
        hold_no: calcHold.hold_no,
        volume_m3: calcHold.volume_m3,
        remain_tons: calcHold.remain_tons,
        sf: calcHold.sf,
        cargo_name: holdLayers[0]?.cargo_name ?? summary?.cargo_names[0] ?? null,
      }
    : null;
  const nextSeq =
    layers === null
      ? null
      : Math.max(0, ...holdLayers.map((l) => l.load_sequence)) + 1;
  const defaultCargoId = cargoes.find((c) => c.name === hold?.cargo_name)?.id;

  const eyebrow = voyageEyebrow(t('shell.voyage'), data.voyage.voyage_no, data.vessel?.name);
  const subtitle = nextSeq === null ? eyebrow : `${eyebrow} · ${t('addlot.subtitle_layer', { seq: nextSeq })}`;

  const holdPicker = initialHoldId ? undefined : (
    <div className="field">
      <span className="field-label" id="lot-hold-label">
        {t('addlot.hold')}
      </span>
      <div className="segmented add-lot-holds" role="group" aria-labelledby="lot-hold-label" data-testid="lot-hold">
        {data.calc.holds.map((h) => (
          <button
            key={h.hold_id}
            type="button"
            aria-pressed={h.hold_id === holdId}
            onClick={() => setHoldId(h.hold_id)}
            data-testid={`lot-hold-${h.hold_no}`}
          >
            №{h.hold_no}
          </button>
        ))}
      </div>
    </div>
  );

  let body;
  if (!hold) {
    body = (
      <div className="dialog-body">
        <EmptyState icon="table" title={t('addlot.no_holds.title')} text={t('addlot.no_holds.text')} />
      </div>
    );
  } else if (cargoes.length === 0) {
    body = (
      <div className="dialog-body">
        <EmptyState icon="book" title={t('addlot.no_cargoes.title')} text={t('addlot.no_cargoes.text')} />
      </div>
    );
  } else {
    body = (
      <AddLotForm
        voyage_id={data.voyage.id}
        hold={hold}
        cargoes={cargoes}
        sourceVessels={sourceVessels}
        defaultCargoId={defaultCargoId}
        holdPicker={holdPicker}
        busy={busy}
        onCancel={onClose}
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
    );
  }

  return (
    <Dialog
      title={hold ? t('addlot.title', { hold_no: hold.hold_no }) : t('addlot.title_no_hold')}
      subtitle={<span data-testid="lot-subtitle">{subtitle}</span>}
      onClose={onClose}
      testId="add-lot-dialog"
    >
      {body}
    </Dialog>
  );
}
