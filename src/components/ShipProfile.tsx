import { useEffect, useState } from 'react';
import { formatPercent, formatTons } from '../calc/round';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import type { VoyageHoldCalc } from '../services/CalculationService';
import { loadShipProfileCranes, type ProfileCrane, type ShipProfileCranes } from '../services/ShipProfileView';
import type { HoldSummary } from '../services/VoyageOverview';
import { useNavigation } from '../shell/navigation';
import { useVoyage } from '../shell/VoyageContext';
import { cargoColor } from './ui/cargo';
import { Icon } from './ui/Icon';

function localIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ship profile strip above the hold table; loads the crane view itself, holds come from the voyage calc. */
export function ShipProfile() {
  const { data, cranes } = useVoyage();
  const { navigate } = useNavigation();
  const [view, setView] = useState<ShipProfileCranes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const voyageId = data?.voyage.id;
  const calculatedAt = data?.calculatedAt;

  useEffect(() => {
    if (!voyageId) return;
    let live = true;
    void (async () => {
      try {
        const next = await loadShipProfileCranes(await getDb(), voyageId, cranes, localIsoDate(new Date()));
        if (live) {
          setView(next);
          setError(null);
        }
      } catch (e) {
        if (live) setError(describeError(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [voyageId, calculatedAt, cranes]);

  if (!data) return null;
  return (
    <ShipProfileStrip
      holds={data.calc.holds}
      summaries={data.overview.holds}
      cranes={view}
      error={error}
      onOpenCranes={() => navigate('cranes')}
    />
  );
}

interface StripProps {
  holds: VoyageHoldCalc[];
  summaries: Record<string, HoldSummary>;
  /** Null while the crane view is loading or failed — holds render regardless. */
  cranes: ShipProfileCranes | null;
  error?: string | null;
  onOpenCranes: () => void;
}

export function ShipProfileStrip({ holds, summaries, cranes, error, onOpenCranes }: StripProps) {
  const t = useT();
  const unitT = t('voyage.totals.unit_t');
  const sternToBow = holds.slice().sort((a, b) => b.hold_no - a.hold_no);
  // Reference lists cranes by name (Кран 1, Кран 2); drawn stern → bow like the holds.
  const craneList = (cranes?.cranes ?? []).slice().reverse();

  return (
    <section className="card ship-profile" aria-labelledby="ship-profile-title" data-testid="ship-profile">
      <div className="ship-profile-head">
        <h2 id="ship-profile-title" className="ship-profile-title">
          {t('profile.title')}
        </h2>
        <span className="ship-profile-subtitle">{t('profile.subtitle')}</span>
        <span className="toolbar-spacer" />
        <button type="button" className="ship-profile-link" onClick={onOpenCranes} data-testid="ship-profile-cranes-link">
          {cranes?.shift ? (
            <>
              {t('profile.shift_link')}{' '}
              <span className="mono" data-testid="ship-profile-shift-correction">
                {formatTons(cranes.shift.correction_tons)}
              </span>{' '}
              {unitT}
            </>
          ) : (
            t('profile.cranes_link')
          )}
          <span aria-hidden="true"> →</span>
        </button>
      </div>

      {error && (
        <p className="ship-profile-error" role="alert" data-testid="ship-profile-error">
          {t('profile.cranes_error', { message: error })}
        </p>
      )}

      {craneList.length > 0 && (
        <div className="ship-profile-cranes">
          {craneList.map((c, i) => (
            <CraneMarker
              key={c.crane_id}
              crane={c}
              position={craneList.length === 1 ? 50 : 30 + (i * 40) / (craneList.length - 1)}
              active={c.crane_id === cranes?.active_crane_id}
            />
          ))}
        </div>
      )}

      <div className="ship-profile-holds">
        {sternToBow.map((h) => {
          const names = summaries[h.hold_id]?.cargo_names ?? [];
          const filled = h.filled_volume_percent;
          const height = filled === null ? 0 : Math.max(0, Math.min(100, filled));
          const overfilled = h.free_volume_m3 !== null && h.free_volume_m3 < 0;
          return (
            <div key={h.hold_id} className="ship-profile-hold" data-testid={`profile-hold-${h.hold_no}`}>
              <div className="ship-profile-hold-box">
                <div
                  className="ship-profile-hold-fill"
                  style={{ height: `${height}%`, background: cargoColor(names[0]) }}
                >
                  {names.length > 0 && <span className="ship-profile-cargo">{names.join(' · ')}</span>}
                </div>
              </div>
              <div className="ship-profile-hold-foot">
                <span className="mono ship-profile-hold-no">№{h.hold_no}</span>
                <span className="mono ship-profile-filled" data-testid="profile-filled">
                  {t('profile.filled', { percent: filled === null ? '—' : formatPercent(filled) })}
                </span>
                <span className={`ship-profile-free${overfilled ? ' negative' : ''}`}>
                  {t('profile.free')}{' '}
                  <span className="mono" data-testid="profile-free">
                    {h.free_volume_m3 === null ? '—' : formatTons(h.free_volume_m3)}
                  </span>{' '}
                  {t('profile.unit_m3')}
                </span>
              </div>
            </div>
          );
        })}
        <div className="ship-profile-bow" aria-hidden="true">
          <svg viewBox="0 0 46 62" fill="none">
            <path className="bow-deck" d="M2 2h10v58H2z" />
            <path className="bow-hull" d="M12 2c18 6 30 18 32 29 -2 11 -14 23 -32 29z" />
            <circle className="bow-anchor" cx="20" cy="31" r="2.5" />
          </svg>
        </div>
      </div>
    </section>
  );
}

function CraneMarker({ crane, position, active }: { crane: ProfileCrane; position: number; active: boolean }) {
  const t = useT();
  const last = crane.last;
  const lastText = !last
    ? t('profile.crane.none')
    : last.hold_no === null
      ? t('profile.crane.last_no_hold', { op: t(`profile.op.${last.mode}`), tons: formatTons(last.scale_tons) })
      : t('profile.crane.last', {
          op: t(`profile.op.${last.mode}`),
          hold: last.hold_no,
          tons: formatTons(last.scale_tons),
        });
  return (
    <div
      className={`ship-profile-crane${active ? ' active' : ''}`}
      style={{ left: `${position}%` }}
      data-testid={`profile-crane-${crane.crane_id}`}
    >
      <div className="ship-profile-crane-chip">
        <Icon name="crane" size={15} />
        <span className="ship-profile-crane-name">{crane.name}</span>
        <span
          className="mono ship-profile-crane-k"
          data-testid="profile-crane-k"
          title={crane.coefficient === null ? t('profile.crane.k_missing') : undefined}
        >
          {t('profile.crane.k', { k: crane.coefficient === null ? '—' : crane.coefficient.toFixed(3) })}
        </span>
      </div>
      <span className="ship-profile-crane-last" data-testid="profile-crane-last">
        {lastText}
      </span>
      <span className="ship-profile-crane-rope" />
    </div>
  );
}
