/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findOverlapPairs } from '../../calc/laytime';
import { __resetForTests, setLang } from '../../i18n';
import { ru } from '../../i18n/ru';
import { AppError } from '../../services/errors';
import type { SofEvent } from '../../services/SofService';
import { AddSofEventForm } from '../AddSofEventForm';
import { SofPanel } from '../SofPanel';
import { SofOverlapWarning } from '../sof/SofOverlapWarning';

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
});
