import { useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { describeError } from '../../i18n/errors';
import { Dialog } from '../ui/Dialog';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Return a validation message to keep the dialog open, or null to submit. */
  validate: () => string | null;
  submit: () => Promise<void>;
  children: ReactNode;
  testId: string;
}

/** Add-record dialog of the reference screen: validates, saves, closes; errors stay inside. */
export function FormDialog({ title, subtitle, onClose, validate, submit, children, testId }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(): Promise<void> {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submit();
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} subtitle={subtitle} onClose={onClose} testId={testId}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        <div className="dialog-body refs-dialog-body">
          {children}
          {error && (
            <p className="field-error refs-dialog-error" role="alert" data-testid={`${testId}-error`}>
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose}>
            {t('refs.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid={`${testId}-submit`}>
            {t('refs.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
