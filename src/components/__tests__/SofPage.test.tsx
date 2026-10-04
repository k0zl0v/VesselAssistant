/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { deriveTimeSheetMilestones, findOverlapPairs } from '../../calc/laytime';
import { dailyDischargeTotals } from '../../calc/time';
import { __resetForTests, setLang } from '../../i18n';
import { ru } from '../../i18n/ru';
import { AppError } from '../../services/errors';
import type { SofEvent } from '../../services/SofService';
import { AddSofEventForm } from '../AddSofEventForm';
import { SofPanel } from '../SofPanel';
import { SofOverlapWarning } from '../sof/SofOverlapWarning';
import { SofTimeSheetDialog } from '../sof/SofTimeSheetDialog';
import { SofTimeSheetHeader } from '../sof/SofTimeSheetHeader';
import type { SofTimeSheet } from '../../services/SofTimeSheetService';

const ev = (id: string, event_date: string, time_from: string | null, time_to: string | null, category: string): SofEvent => ({
  id,
  voyage_id: 'v1',
  event_date,
  time_from,
  time_to,
  category,
  description: null,
  daily_qty: null,
  total_qty: null,
});

/** S-7 log after the third entry: 22:00–24:00 and 23:00–23:30 overlap, the next day does not. */
const LOG = [
  ev('a', '2026-05-01', '22:00', '24:00', 'loading_commenced'),
  ev('b', '2026-05-01', '23:00', '23:30', 'weather'),
  ev('c', '2026-05-02', '00:00', '04:00', 'loading_commenced'),
];
const OVERLAPPING = new Set([0, 1]);

describe('SOF screen parts (S-7 on the UI)', () => {
  beforeEach(() => setLang('ru'));
  afterEach(() => {
    cleanup();
    __resetForTests();
  });

  it('highlights overlapping rows and shows 24:00 with its duration', () => {
    render(<SofPanel events={LOG} overlapping={OVERLAPPING} voyageOpen onEdit={() => {}} onDelete={async () => {}} />);
    const rows = screen.getAllByTestId('sof-row');
    expect(rows.map((r) => r.className.includes('overlap'))).toEqual([true, true, false]);
    expect(within(rows[0]!).getByTestId('sof-row-to').textContent).toBe('24:00');
    expect(within(rows[0]!).getByTestId('sof-row-duration').textContent).toBe('02:00');
    expect(within(rows[0]!).getByTestId('sof-row-date').textContent).toBe('01.05.2026');
  });

  it('deletes only after the inline confirmation; cancel keeps the row', async () => {
    const onDelete = vi.fn(async () => {});
    render(<SofPanel events={LOG} overlapping={OVERLAPPING} voyageOpen onEdit={() => {}} onDelete={onDelete} />);
    const row = screen.getAllByTestId('sof-row')[1]!;

    await userEvent.click(within(row).getByTestId('sof-row-delete'));
    await userEvent.click(screen.getByTestId('sof-row-delete-cancel'));
    expect(screen.queryByTestId('sof-row-delete-confirm')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(within(row).getByTestId('sof-row-delete'));
    expect(screen.getByTestId('sof-row-delete-panel').textContent).toContain('01.05.2026 23:00–23:30');
    await userEvent.click(screen.getByTestId('sof-row-delete-confirm'));
    expect(onDelete).toHaveBeenCalledWith('b');
    await waitFor(() => expect(screen.queryByTestId('sof-row-delete-panel')).toBeNull());
  });

  it('shows no mutation controls on a closed voyage', () => {
    render(<SofPanel events={LOG} overlapping={OVERLAPPING} voyageOpen={false} onEdit={() => {}} onDelete={async () => {}} />);
    expect(screen.queryAllByTestId('sof-row-delete')).toHaveLength(0);
    expect(screen.queryAllByTestId('sof-row-edit')).toHaveLength(0);
  });

  it('names the overlapping events with their times', () => {
    render(<SofOverlapWarning events={LOG} pairs={findOverlapPairs(LOG)} />);
    expect(screen.getByTestId('sof-overlap-warning').textContent).toBe(
      ru['sof.overlap.text'].replace(
        '{pairs}',
        '01.05: «Начало погрузки 22:00–24:00» и «Погода 23:00–23:30»',
      ),
    );
    expect(screen.queryByTestId('sof-overlap-fix')).toBeNull();
  });

  it('rejects 24:30 in the dialog without calling the service', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<AddSofEventForm defaultDate="2026-05-01" onSubmit={onSubmit} onClose={() => {}} />);
    await userEvent.type(screen.getByTestId('sof-form-from'), '23:00');
    await userEvent.type(screen.getByTestId('sof-form-to'), '24:30');
    await userEvent.click(screen.getByTestId('sof-form-submit'));
    expect(screen.getByTestId('sof-form-error').textContent).toBe(ru['sof.form.error.time']);
    expect(screen.getByTestId('sof-form-to').getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('fills the description from the category template and submits the values', async () => {
    const onSubmit = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<AddSofEventForm defaultDate="2026-05-01" onSubmit={onSubmit} onClose={onClose} />);
    await userEvent.selectOptions(screen.getByTestId('sof-form-category'), 'loading_commenced');
    expect((screen.getByTestId('sof-form-description') as HTMLInputElement).value).toBe('Loading operations commenced');
    await userEvent.type(screen.getByTestId('sof-form-from'), '22:00');
    await userEvent.type(screen.getByTestId('sof-form-to'), '24:00');
    await userEvent.click(screen.getByTestId('sof-form-submit'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      event_date: '2026-05-01',
      time_from: '22:00',
      time_to: '24:00',
      category: 'loading_commenced',
      description: 'Loading operations commenced',
    });
  });

  it('shows a service error through describeError and keeps the dialog open', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn(async () => {
      throw new AppError('voyage.closed', { voyage_no: 'NS-01' });
    });
    render(<AddSofEventForm defaultDate="2026-05-01" onSubmit={onSubmit} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('sof-form-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('sof-form-error').textContent).toBe(
        ru['error.voyage.closed'].replace('{voyage_no}', 'NS-01'),
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
  it('puts a separator row before each day with the daily and the running discharge', () => {
    const discharge = dailyDischargeTotals([
      { event_date: '2026-05-01', tons: 1177 },
      { event_date: '2026-05-03', tons: 824 },
    ]);
    render(
      <SofPanel
        events={LOG}
        overlapping={OVERLAPPING}
        voyageOpen
        onEdit={() => {}}
        onDelete={async () => {}}
        discharge={discharge}
      />,
    );
    const days = screen.getAllByTestId('sof-day-row');
    // 01.05 and 02.05 from the log, 03.05 only from the discharges.
    expect(days.map((d) => d.querySelector('.cell-day')!.textContent)).toEqual([
      '01.05.2026 Пт',
      '02.05.2026 Сб',
      '03.05.2026 Вс',
    ]);
    const figures = days.map((d) => [
      within(d).getByTestId('sof-day-disch').textContent,
      within(d).getByTestId('sof-day-total').textContent,
    ]);
    expect(figures).toEqual([
      ['1\u202f177.000', '1\u202f177.000'],
      ['—', '1\u202f177.000'],
      ['824.000', '2\u202f001.000'],
    ]);
    // Separators do not count as log rows: S-7 still sees three events.
    expect(screen.getAllByTestId('sof-row')).toHaveLength(3);
    const tbodyRows = Array.from(document.querySelectorAll('tbody tr'));
    expect(tbodyRows.indexOf(days[1]!)).toBe(3);
  });

  it('fills the header from the log, the reference data and the saved row; counts the gaps', () => {
    const sheet: SofTimeSheet = {
      id: 's1',
      voyage_id: 'v1',
      shipping_company: 'AL MADHIK Shipping Co.',
      cargo_description: null,
      cargo_documents_on_board: null,
      charter_party: 'N/A',
      bill_weight_tons: 2001,
      nor_accepted_note: 'as per C/P',
      updated_at: '2026-05-01 00:00:00',
    };
    const log = [
      ev('n1', '2026-04-18', '22:00', null, 'nor_tendered'),
      ev('n2', '2026-04-19', '06:00', null, 'nor_accepted'),
      ...LOG,
    ];
    const onEdit = vi.fn();
    render(
      <SofTimeSheetHeader
        reference={{ vesselName: 'NORD STAR', owner: null, port: 'PORT OF KAVKAZ', loadedCargo: ['SFM', 'WHEAT'] }}
        sheet={sheet}
        milestones={deriveTimeSheetMilestones(log)}
        onEdit={onEdit}
      />,
    );
    expect(screen.getByTestId('sof-sheet-value-6').textContent).toBe('01.05 22:00');
    expect(screen.getByTestId('sof-sheet-value-7').textContent).toBe('02.05 04:00');
    expect(screen.getByTestId('sof-sheet-value-15').textContent).toBe('18.04 22:00');
    expect(screen.getByTestId('sof-sheet-field-18').textContent).toContain('as per C/P');
    expect(screen.getByTestId('sof-sheet-field-8').textContent).toContain('SFM · WHEAT');
    expect(screen.getByTestId('sof-sheet-field-14').textContent).toContain('2\u202f001.000');
    expect(screen.getByTestId('sof-sheet-field-4').textContent).toContain(ru['sof.sheet.empty']);
    // Owner, arrival, berthed, both discharge times, documents, sailed.
    expect(screen.getByTestId('sof-sheet-missing').textContent).toBe(ru['sof.sheet.missing'].replace('{count}', '7'));
    screen.getByTestId('sof-sheet-edit').click();
    expect(onEdit).toHaveBeenCalled();
  });

  it('has no header edit button on a closed voyage', () => {
    render(
      <SofTimeSheetHeader
        reference={{ vesselName: 'NORD STAR', owner: 'X', port: null, loadedCargo: [] }}
        sheet={null}
        milestones={deriveTimeSheetMilestones([])}
      />,
    );
    expect(screen.queryByTestId('sof-sheet-edit')).toBeNull();
  });

  it('header dialog parses a grouped weight, rejects a negative one and submits trimmed values', async () => {
    const onSubmit = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<SofTimeSheetDialog sheet={null} dischargedTons={2001} onSubmit={onSubmit} onClose={onClose} />);
    expect(screen.getByTestId('sof-sheet-dialog').textContent).toContain('2\u202f001.000');

    await userEvent.type(screen.getByTestId('sof-sheet-input-bill_weight_tons'), '-5');
    await userEvent.click(screen.getByTestId('sof-sheet-submit'));
    expect(screen.getByTestId('sof-sheet-error').textContent).toBe(ru['sof.sheet.dialog.error.weight']);
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByTestId('sof-sheet-input-bill_weight_tons'));
    await userEvent.type(screen.getByTestId('sof-sheet-input-bill_weight_tons'), '2 001,5');
    await userEvent.type(screen.getByTestId('sof-sheet-input-charter_party'), 'GENCON 1994');
    await userEvent.click(screen.getByTestId('sof-sheet-submit'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      shipping_company: '',
      charter_party: 'GENCON 1994',
      cargo_description: '',
      cargo_documents_on_board: '',
      nor_accepted_note: '',
      bill_weight_tons: 2001.5,
    });
  });
});
