import { useState, type ReactNode } from 'react';
import { formatPercent } from '../../calc/round';
import { getDb } from '../../db';
import { useT } from '../../i18n';
import type { CraneCoefficient } from '../../services/CraneCorrectionService';
import { PortService, type Port } from '../../services/PortService';
import { ReferenceService, type Cargo, type Crane } from '../../services/ReferenceService';
import { PROTEIN_ALLOWED } from '../../services/types';
import { cargoColor } from '../ui/cargo';
import type { IconName } from '../ui/Icon';
import { EmptyState } from '../ui/states';
import { FormDialog } from './FormDialog';

/** Card with a title, a «+ Add» button and either the table or the empty state. */
function ListCard({
  title,
  addLabel,
  onAdd,
  isEmpty,
  empty,
  children,
  testId,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  isEmpty: boolean;
  empty: { icon: IconName; title: string; text: string };
  children: ReactNode;
  testId: string;
}) {
  return (
    <section className="table-card refs-list-card" data-testid={testId}>
      <div className="refs-card-head">
        <h2 className="card-title">{title}</h2>
        <span className="toolbar-spacer" />
        <button type="button" className="btn btn-sm refs-add" onClick={onAdd} data-testid={`${testId}-add`}>
          {addLabel}
        </button>
      </div>
      {isEmpty ? (
        <div className="refs-card-empty">
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            text={empty.text}
            actions={
              <button type="button" className="btn btn-primary" onClick={onAdd}>
                {addLabel}
              </button>
            }
            testId={`${testId}-empty`}
          />
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function CargoesTab({ cargoes, onChanged }: { cargoes: Cargo[]; onChanged: () => Promise<void> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListCard
        title={t('refs.cargoes.title', { count: cargoes.length })}
        addLabel={t('refs.cargoes.add')}
        onAdd={() => setOpen(true)}
        isEmpty={cargoes.length === 0}
        empty={{ icon: 'layers', title: t('refs.cargoes.empty.title'), text: t('refs.cargoes.empty.text') }}
        testId="refs-cargoes"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('refs.cargoes.col.name')}</th>
              <th className="num refs-col-wide">{t('refs.cargoes.col.protein')}</th>
              <th className="refs-col-unit">{t('refs.cargoes.col.unit')}</th>
            </tr>
          </thead>
          <tbody>
            {cargoes.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="cargo-tag">
                    <span className="cargo-swatch" style={{ background: cargoColor(c.name) }} />
                    {c.name}
                  </span>
                </td>
                <td className="num">
                  {c.default_protein === null ? <span className="zero">—</span> : formatPercent(c.default_protein)}
                </td>
                <td className="muted">{c.unit === 'tons' ? t('refs.unit_t') : c.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListCard>
      {open && <NewCargoDialog onClose={() => setOpen(false)} onCreated={onChanged} />}
    </>
  );
}

function NewCargoDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const t = useT();
  const [name, setName] = useState('');
  const [protein, setProtein] = useState<number | null>(null);
  return (
    <FormDialog
      title={t('refs.cargoes.dialog.title')}
      onClose={onClose}
      testId="refs-cargo-dialog"
      validate={() => (name.trim() ? null : t('refs.cargoes.error.name'))}
      submit={async () => {
        await new ReferenceService(await getDb()).createCargo({ name: name.trim(), default_protein: protein });
        await onCreated();
      }}
    >
      <div className="field">
        <label className="field-label" htmlFor="refs-nc-name">{t('refs.cargoes.name')}</label>
        <input id="refs-nc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="refs-nc-name" />
      </div>
      <div className="field refs-field-gap">
        <span className="field-label" id="refs-nc-protein">{t('refs.cargoes.protein')}</span>
        <div className="refs-chips" role="group" aria-labelledby="refs-nc-protein">
          {[null, ...PROTEIN_ALLOWED].map((p) => (
            <button
              key={p ?? 'none'}
              type="button"
              className="quick-chip mono"
              aria-pressed={protein === p}
              onClick={() => setProtein(p)}
            >
              {p === null ? t('refs.cargoes.protein_none') : formatPercent(p)}
            </button>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}

export function CranesTab({
  cranes,
  coefficients,
  onChanged,
}: {
  cranes: Crane[];
  coefficients: CraneCoefficient[];
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListCard
        title={t('refs.cranes.title', { count: cranes.length })}
        addLabel={t('refs.cranes.add')}
        onAdd={() => setOpen(true)}
        isEmpty={cranes.length === 0}
        empty={{ icon: 'import', title: t('refs.cranes.empty.title'), text: t('refs.cranes.empty.text') }}
        testId="refs-cranes"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('refs.cranes.col.name')}</th>
              <th>{t('refs.cranes.col.notes')}</th>
              <th className="num refs-col-wide">{t('refs.cranes.col.coefs')}</th>
            </tr>
          </thead>
          <tbody>
            {cranes.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="muted">{c.notes ?? '—'}</td>
                <td className="num">{coefficients.filter((k) => k.crane_id === c.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListCard>
      {open && <NewCraneDialog onClose={() => setOpen(false)} onCreated={onChanged} />}
    </>
  );
}

function NewCraneDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const t = useT();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <FormDialog
      title={t('refs.cranes.dialog.title')}
      onClose={onClose}
      testId="refs-crane-dialog"
      validate={() => (name.trim() ? null : t('refs.cranes.error.name'))}
      submit={async () => {
        await new ReferenceService(await getDb()).createCrane({ name: name.trim(), notes: notes.trim() || null });
        await onCreated();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="refs-ncr-name">{t('refs.cranes.name')}</label>
          <input id="refs-ncr-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="refs-ncr-name" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="refs-ncr-notes">{`${t('refs.cranes.notes')} (${t('refs.optional')})`}</label>
          <input id="refs-ncr-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </FormDialog>
  );
}

export function PortsTab({ ports, onChanged }: { ports: Port[]; onChanged: () => Promise<void> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListCard
        title={t('refs.ports.title', { count: ports.length })}
        addLabel={t('refs.ports.add')}
        onAdd={() => setOpen(true)}
        isEmpty={ports.length === 0}
        empty={{ icon: 'ship', title: t('refs.ports.empty.title'), text: t('refs.ports.empty.text') }}
        testId="refs-ports"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('refs.ports.col.name')}</th>
              <th className="refs-col-wide">{t('refs.ports.col.code')}</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="mono muted">{p.code ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListCard>
      {open && <NewPortDialog onClose={() => setOpen(false)} onCreated={onChanged} />}
    </>
  );
}

function NewPortDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const t = useT();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  return (
    <FormDialog
      title={t('refs.ports.dialog.title')}
      onClose={onClose}
      testId="refs-port-dialog"
      validate={() => (name.trim() ? null : t('refs.ports.error.name'))}
      submit={async () => {
        await new PortService(await getDb()).create({ name: name.trim(), code: code.trim() || null });
        await onCreated();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="refs-np-name">{t('refs.ports.name')}</label>
          <input id="refs-np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="refs-np-name" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="refs-np-code">{`${t('refs.ports.code')} (${t('refs.optional')})`}</label>
          <input id="refs-np-code" className="input mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
      </div>
    </FormDialog>
  );
}
