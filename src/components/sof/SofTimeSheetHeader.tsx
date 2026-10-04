import type { SofMoment, TimeSheetMilestone } from '../../calc/laytime';
import { formatTons } from '../../calc/round';
import { useT, type StringKey } from '../../i18n';
import type { SofTimeSheet } from '../../services/SofTimeSheetService';
import { formatDate } from '../../shell/format';
import { shortDate } from './labels';

export interface TimeSheetReference {
  vesselName: string | null;
  owner: string | null;
  port: string | null;
  /** Cargo names of the loaded lots — shown in field 8 while the header has no cargo description. */
  loadedCargo: string[];
}

interface Props {
  reference: TimeSheetReference;
  sheet: SofTimeSheet | null;
  milestones: Record<TimeSheetMilestone, SofMoment | null>;
  /** Absent when the voyage is closed. */
  onEdit?: () => void;
}

type FieldNo = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 18;

interface Field {
  no: FieldNo;
  value: string | null;
  /** Full value for the tooltip when the cell shows a shortened one. */
  title?: string;
  note?: string;
  mono?: boolean;
}

const label = (no: FieldNo): StringKey => `sof.sheet.field.${no}` as StringKey;

function momentField(no: FieldNo, m: SofMoment | null, note?: string | null): Field {
  if (!m) return { no, value: null, note: note ?? undefined };
  const time = m.time ?? '';
  return {
    no,
    value: `${shortDate(m.date)} ${time}`.trim(),
    title: `${formatDate(m.date)} ${time}`.trim(),
    note: note ?? undefined,
    mono: true,
  };
}

/** The 17 numbered fields of the printed Standard Time Sheet (the form has no field 17). */
export function SofTimeSheetHeader({ reference, sheet, milestones, onEdit }: Props) {
  const t = useT();
  const cargo = sheet?.cargo_description ?? (reference.loadedCargo.length > 0 ? reference.loadedCargo.join(' · ') : null);

  const facts: Field[] = [
    { no: 1, value: sheet?.shipping_company ?? null },
    { no: 2, value: reference.vesselName },
    { no: 3, value: reference.port },
    { no: 4, value: reference.owner },
    {
      no: 8,
      value: cargo,
      title: sheet?.cargo_description ? undefined : t('sof.sheet.from_loading'),
    },
    { no: 13, value: sheet?.charter_party ?? null },
    {
      no: 14,
      value: sheet?.bill_weight_tons == null ? null : formatTons(sheet.bill_weight_tons),
      mono: true,
    },
  ];

  const times: Field[] = [
    momentField(16, milestones.arrived),
    momentField(15, milestones.nor_tendered),
    momentField(18, milestones.nor_accepted, sheet?.nor_accepted_note),
    momentField(5, milestones.berthed),
    momentField(6, milestones.loading_commenced),
    momentField(7, milestones.loading_completed),
    momentField(9, milestones.discharging_commenced),
    momentField(10, milestones.discharging_completed),
    { no: 11, value: sheet?.cargo_documents_on_board ?? null },
    momentField(12, milestones.sailed),
  ];

  const missing = [...facts, ...times].filter((f) => f.value === null).length;

  return (
    <section className="card sof-sheet" data-testid="sof-sheet">
      <div className="sof-sheet-head">
        <h2 className="sof-sheet-title">{t('sof.sheet.title')}</h2>
        <span className="sof-sheet-subtitle">{t('sof.sheet.subtitle')}</span>
        <span className="sof-sheet-spacer" />
        {missing > 0 ? (
          <span className="sof-sheet-missing" data-testid="sof-sheet-missing">
            {t('sof.sheet.missing', { count: missing })}
          </span>
        ) : (
          <span className="sof-sheet-complete" data-testid="sof-sheet-missing">
            {t('sof.sheet.complete')}
          </span>
        )}
        {onEdit && (
          <button type="button" className="btn btn-sm" onClick={onEdit} data-testid="sof-sheet-edit">
            {t('sof.sheet.edit')}
          </button>
        )}
      </div>

      <ul className="sof-sheet-facts">
        {facts.map((f) => {
          const labelled = f.no === 13 || f.no === 14 || f.value === null;
          return (
            <li key={f.no} title={f.title ?? t(label(f.no))} data-testid={`sof-sheet-field-${f.no}`}>
              <span className="sof-sheet-no">{f.no}.</span>{' '}
              {labelled && <>{t(label(f.no))}: </>}
              {f.value === null ? (
                <span className="sof-sheet-empty">{t('sof.sheet.empty')}</span>
              ) : f.no === 2 ? (
                <strong className="sof-sheet-strong">{f.value}</strong>
              ) : (
                <span className={f.mono ? 'mono' : undefined}>{f.value}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sof-milestones">
        {times.map((f) => (
          <div
            key={f.no}
            className={`sof-milestone${f.value === null ? ' empty' : ''}`}
            title={f.title}
            data-testid={`sof-sheet-field-${f.no}`}
          >
            <div className="sof-milestone-head">
              <span className="sof-milestone-no">{f.no}</span>
              <span className="sof-milestone-title">{t(label(f.no))}</span>
            </div>
            <div className={`sof-milestone-value${f.mono ? ' mono' : ''}`} data-testid={`sof-sheet-value-${f.no}`}>
              {f.value ?? t('sof.sheet.empty')}
            </div>
            {f.note && <div className="sof-milestone-note">{f.note}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
