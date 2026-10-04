import { version } from '../../package.json';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Icon } from '../components/ui/Icon';
import { useT } from '../i18n';
import { DATA_SCREENS, VOYAGE_SCREENS, useNavigation, type ScreenDef } from './navigation';
import { useVoyage } from './VoyageContext';

interface Props {
  onNewVoyage: () => void;
}

export function Rail({ onNewVoyage }: Props) {
  const t = useT();
  const { screen, navigate } = useNavigation();
  const { voyages, vessels, cranes, selectedId, select, data } = useVoyage();
  const selected = voyages.find((v) => v.id === selectedId) ?? null;
  const vessel = selected ? vessels.find((v) => v.id === selected.vessel_id) ?? null : null;

  function item(def: ScreenDef) {
    const disabled = def.voyageScoped && !selected;
    const badge = def.key === 'sof' && data && data.sofOverlapCount > 0 ? data.sofOverlapCount : null;
    return (
      <button
        key={def.key}
        type="button"
        className="rail-item"
        aria-current={screen === def.key ? 'page' : undefined}
        disabled={disabled}
        onClick={() => navigate(def.key)}
        data-testid={`nav-${def.key}`}
      >
        <Icon name={def.icon} />
        <span className="rail-item-label">
          {def.key === 'ogv' && data?.ogv ? t('nav.ogv_named', { name: data.ogv.name }) : t(def.label)}
        </span>
        {badge !== null && (
          <span className="rail-badge" aria-label={t('nav.sof_warnings', { count: badge })}>
            {badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="rail">
      <div className="rail-brand">
        <span className="rail-logo">
          <Icon name="ship" />
        </span>
        <span className="rail-brand-name">{t('shell.brand')}</span>
      </div>

      <div className="rail-voyage">
        <div className="rail-section-label" id="rail-voyage-label">
          {t('shell.active_voyage')}
        </div>
        {voyages.length > 0 ? (
          <div className="rail-voyage-picker">
            <span className="rail-voyage-text">
              <span className="rail-voyage-no">{selected?.voyage_no ?? '—'}</span>
              <span className="rail-voyage-meta">
                {vessel
                  ? t('shell.voyage_meta', { vessel: vessel.name, holds: data?.holds.length ?? 0, cranes: cranes.length })
                  : ''}
                {selected?.status === 'closed' ? ` · ${t('voyage.status.closed')}` : ''}
              </span>
            </span>
            <Icon name="chevronDown" size={13} strokeWidth={2.2} />
            <select
              className="rail-voyage-select"
              aria-labelledby="rail-voyage-label"
              value={selectedId ?? ''}
              onChange={(e) => void select(e.target.value)}
              data-testid="voyage-select"
            >
              {voyages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.voyage_no} {v.status === 'closed' ? t('voyage.closed_suffix') : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="rail-voyage-empty">{t('shell.no_voyages')}</div>
        )}
        <button type="button" className="rail-item rail-new-voyage" onClick={onNewVoyage} data-testid="voyage-new">
          <Icon name="plus" size={14} />
          <span className="rail-item-label">{t('voyage.new')}</span>
        </button>
      </div>

      <nav className="rail-nav" aria-label={t('shell.nav_label')}>
        <div className="rail-section-label">{t('shell.section.voyage')}</div>
        {VOYAGE_SCREENS.map(item)}
        <div className="rail-section-label">{t('shell.section.data')}</div>
        {DATA_SCREENS.map(item)}
      </nav>

      <div className="rail-footer">
        <div className="rail-offline">
          <span className="rail-offline-dot" />
          {t('shell.offline')}
        </div>
        <div className="rail-footer-row">
          <LanguageSwitcher />
          <span className="rail-version">v{version}</span>
        </div>
      </div>
    </aside>
  );
}
