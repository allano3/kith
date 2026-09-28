import { useState, type SubmitEvent } from 'react';
import { WrongPassphraseError } from '../store/crypto';
import { useVault } from '../store/VaultContext';

const MIN_PASSPHRASE = 8;

function Onboarding() {
  const { create } = useVault();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pass.length < MIN_PASSPHRASE) return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (pass !== confirm) return setError('The two passphrases do not match.');
    setBusy(true);
    setError(null);
    try {
      await create(pass, demo);
      // A new vault starts on the overview, not whatever route was open before.
      window.location.hash = '#/';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate-card stack-lg">
        <div className="stack">
          <h1>Kith</h1>
          <p className="quote" style={{ fontSize: 19 }}>What is a friend?</p>
          <p className="muted">
            A private journal for understanding your relationships over time — who you can rely on, who you might be neglecting, and where your
            expectations and the evidence have drifted apart. It observes behavior and patterns, and leaves conclusions to you.
          </p>
        </div>
        <form className="card stack" onSubmit={submit}>
          <h2>Create your private vault</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Everything stays on this device, encrypted with your passphrase. There is no account and no recovery — if you forget the passphrase, the data
            cannot be read, by anyone.
          </p>
          <label className="field">
            Passphrase
            <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
          </label>
          <label className="field">
            Confirm passphrase
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            Start with fictional example people so I can explore first (easy to delete later)
          </label>
          {error && (
            <p className="tone-concern" style={{ color: 'var(--tone)' }} role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Unlock() {
  const { unlock, destroy } = useVault();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(pass);
    } catch (err) {
      setError(err instanceof WrongPassphraseError ? err.message : `Could not open the vault: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate-card stack-lg">
        <div className="stack">
          <h1>Kith</h1>
          <p className="quote">Your vault is locked.</p>
        </div>
        <form className="card stack" onSubmit={submit}>
          <label className="field">
            Passphrase
            <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
          </label>
          {error && (
            <p className="tone-concern" style={{ color: 'var(--tone)' }} role="alert">
              {error}
            </p>
          )}
          <div className="row-between">
            <button className="btn" type="submit" disabled={busy || !pass}>
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setForgot((f) => !f)}>
              Forgot passphrase?
            </button>
          </div>
          {forgot && (
            <div className="callout tone-concern stack">
              <p>
                The passphrase is never stored, so the vault cannot be recovered. You can delete it and start over — this permanently erases everything
                recorded on this device.
              </p>
              <div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (window.confirm('Permanently delete the locked vault and all its data?')) void destroy();
                  }}
                >
                  Delete vault and start over
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export function Gate() {
  const { status } = useVault();
  return status === 'new' ? <Onboarding /> : <Unlock />;
}
