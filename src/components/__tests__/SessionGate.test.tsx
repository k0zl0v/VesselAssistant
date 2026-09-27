/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionGate } from '../SessionGate';
import { en } from '../../i18n/en';
import { openTestDb } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';

describe('SessionGate (FR-10: name and role at every launch)', () => {
  let db: NodeDb;

  beforeEach(async () => {
    db = await openTestDb({ session: null });
  });

  afterEach(() => {
    db.close();
  });

  function mount(onStarted = vi.fn()) {
    const view = render(
      <SessionGate openDb={async () => db} onStarted={onStarted}>
        <p>APP CONTENT</p>
      </SessionGate>,
    );
    return { ...view, onStarted };
  }

  async function sessionRows() {
    return db.select<{ operator_name: string; operator_role: string }>(
      `SELECT operator_name, operator_role FROM app_session`,
    );
  }

  it('does not render children before start()', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: en['session.title'] })).toBeInTheDocument();
    expect(screen.queryByText('APP CONTENT')).toBeNull();
  });

  it('empty name → session.name_required, nothing written, children hidden', async () => {
    const user = userEvent.setup();
    const { onStarted } = mount();
    await user.type(await screen.findByLabelText(en['session.name']), '   ');
    await user.click(screen.getByRole('button', { name: en['session.start'] }));

    expect(screen.getByText(en['session.name_required'])).toBeInTheDocument();
    expect(await sessionRows()).toEqual([]);
    expect(screen.queryByText('APP CONTENT')).toBeNull();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('name + role → app_session row written, children rendered, onStarted called once', async () => {
    const user = userEvent.setup();
    const { onStarted } = mount();
    await user.type(await screen.findByLabelText(en['session.name']), 'Ivan Petrov');
    await user.selectOptions(screen.getByLabelText(en['session.role']), en['session.role.supervisor']);
    await user.click(screen.getByRole('button', { name: en['session.start'] }));

    expect(await screen.findByText('APP CONTENT')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: en['session.title'] })).toBeNull();
    expect(await sessionRows()).toEqual([{ operator_name: 'Ivan Petrov', operator_role: 'supervisor' }]);
    expect(onStarted).toHaveBeenCalledOnce();
    expect(onStarted.mock.calls[0]![0]).toMatchObject({ operator_name: 'Ivan Petrov', operator_role: 'supervisor' });
  });

  it('a remount asks again, with the last name and role pre-filled', async () => {
    const user = userEvent.setup();
    const first = mount();
    await user.type(await screen.findByLabelText(en['session.name']), 'Ivan Petrov');
    await user.selectOptions(screen.getByLabelText(en['session.role']), en['session.role.admin']);
    await user.click(screen.getByRole('button', { name: en['session.start'] }));
    await screen.findByText('APP CONTENT');
    first.unmount();

    mount();
    const name = await screen.findByLabelText<HTMLInputElement>(en['session.name']);
    await vi.waitFor(() => expect(name.value).toBe('Ivan Petrov'));
    expect(screen.getByLabelText<HTMLSelectElement>(en['session.role']).value).toBe('admin');
    expect(screen.queryByText('APP CONTENT')).toBeNull();
  });
});
