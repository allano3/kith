import { useEffect, useMemo, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import { testConnection } from '../ai/llm';
import { buildEvidencePacket } from '../ai/packet';
import type { AiProvider, AiSettings, Vault } from '../domain/types';
import { isSealed, KDF_ITERATIONS, unseal, type SealedVault } from '../store/crypto';
import { normalizeVault, useVault } from '../store/VaultContext';
import { Chip, Choices, PageHead, Section } from '../ui/kit';
import './Settings.css';
import { isStandalone, requestPersistentStorage, saveFile, type StorageDurability } from '../pwa';

const MIN_PASSPHRASE = 8;

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: 'off', label: 'Off — on-device only' },
  { value: 'openai_compatible', label: 'OpenAI-compatible' },
  { value: 'anthropic', label: 'Anthropic' },
];

const PRESETS: { value: string; label: string; hint: string }[] = [
  { value: 'http://localhost:11434/v1', label: 'Ollama (local)', hint: 'Runs on your own computer, so your data never leaves it. Reachable only from that computer, not from your phone.' },
  { value: 'https://openrouter.ai/api/v1', label: 'OpenRouter', hint: 'Hosted models from many providers behind one key.' },
  { value: 'https://api.openai.com/v1', label: 'OpenAI', hint: 'Hosted by OpenAI.' },
];

const AUTO_LOCK = [0, 5, 15, 30, 60];

/** Reports whether the browser has agreed to keep the vault safe from storage eviction. */
function StorageDurabilityNote() {
  const [durability, setDurability] = useState<StorageDurability | null>(null);
  useEffect(() => {
    void requestPersistentStorage().then(setDurability);
  }, []);
  if (!durability) return null;
  return (
    <li>
      {durability === 'persistent'
        ? 'This device has agreed to keep Kith’s storage permanently (it will not be cleared to save space).'
        : durability === 'best-effort'
          ? `Storage is “best effort”: under storage pressure the device could clear it. ${isStandalone() ? '' : 'Installing Kith to your Home Screen makes this less likely. '}Keep an encrypted backup.`
          : 'This browser cannot promise to keep storage permanently. Keep an encrypted backup.'}
    </li>
  );
}

type Message = { tone: 'positive' | 'concern'; text: string } | null;

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p className={`tone-${message.tone} settings-status`} role={message.tone === 'concern' ? 'alert' : 'status'}>
      {message.text}
    </p>
  );
}

export function Settings() {
  const { vault } = useVault();
  return (
    <div className="stack-lg">
      <PageHead title="Privacy & settings" lede="Privacy is a feature here, not a setting you have to find. This is everything Kith stores, and everything it could ever send." />
      <PrivacySummary />
      <SecuritySection />
      <AiSection key={JSON.stringify(vault.settings.ai)} />
      <Section title="Your values">
        <p className="muted">
          {vault.settings.values.length ? `You have listed ${vault.settings.values.join(', ')}. ` : 'You have not listed personal values yet. '}
          Values and the investment check live on <Link to="/reflect">Mirror &amp; values</Link>.
        </p>
      </Section>
      <DataSection />
      <DeleteSection />
    </div>
  );
}

function PrivacySummary() {
  return (
    <Section title="How your data is protected">
      <ul className="settings-list">
        <li>Everything is stored only on this device, in this browser. There is no account and no server.</li>
        <li>
          The vault is encrypted with AES-GCM (256-bit) using a key derived from your passphrase with PBKDF2-SHA-256 ({KDF_ITERATIONS.toLocaleString('en-US')}{' '}
          iterations). The passphrase itself is never stored, so it cannot be recovered.
        </li>
        <li>No feed, no public ratings, no sharing, no analytics. Nobody you record is ever notified.</li>
        <li>
          Kith downloads only its own app code from its web address. The only request that can carry your data is the optional AI call you configure below —
          and only when you ask a question and choose to send it.
        </li>
        <StorageDurabilityNote />
      </ul>
    </Section>
  );
}

function SecuritySection() {
  const { vault, changePassphrase, updateSettings, lock } = useVault();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const minutes = vault.settings.autoLockMinutes;
  const options = [...new Set([...AUTO_LOCK, minutes])]
    .sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: m === 0 ? 'Never' : m === 60 ? '1 hour' : `${m} min` }));

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (next.length < MIN_PASSPHRASE) return setMessage({ tone: 'concern', text: `Use at least ${MIN_PASSPHRASE} characters.` });
    if (next !== confirm) return setMessage({ tone: 'concern', text: 'The two passphrases do not match.' });
    setBusy(true);
    setMessage(null);
    try {
      await changePassphrase(next);
      setNext('');
      setConfirm('');
      setMessage({ tone: 'positive', text: 'Passphrase changed. Use the new one next time you unlock.' });
    } catch (err) {
      setMessage({ tone: 'concern', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Security">
      <div className="stack">
        <form className="stack" onSubmit={submit}>
          <h3>Change passphrase</h3>
          <p className="faint settings-hint">Your data is re-encrypted with the new passphrase. There is no recovery if you forget it.</p>
          <div className="grid grid-2">
            <label className="field">
              New passphrase
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </label>
            <label className="field">
              Confirm new passphrase
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          </div>
          <Status message={message} />
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !next || !confirm}>
              {busy ? 'Re-encrypting…' : 'Change passphrase'}
            </button>
          </div>
        </form>
        <hr className="divider" />
        <div className="stack">
          <h3>Auto-lock</h3>
          <p className="faint settings-hint">Locks the vault after this long without activity.</p>
          <Choices options={options} value={String(minutes)} onChange={(v) => v !== undefined && updateSettings({ autoLockMinutes: Number(v) })} />
        </div>
        <hr className="divider" />
        <div className="row-between">
          <p className="muted">Locking clears everything from memory until you enter your passphrase again.</p>
          <button type="button" className="btn btn-ghost" onClick={lock}>
            Lock now
          </button>
        </div>
      </div>
    </Section>
  );
}

function AiSection() {
  const { vault, asOf, assessments, updateSettings } = useVault();
  const saved = vault.settings.ai;
  const [draft, setDraft] = useState<AiSettings>(saved);
  const [preview, setPreview] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Message>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<AiSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setTestResult(null);
  };
  const local = draft.provider === 'openai_compatible' && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(draft.baseUrl.trim());
  const preset = PRESETS.find((p) => p.value === draft.baseUrl.trim());

  const packet = useMemo(
    () => (preview ? buildEvidencePacket(vault, assessments, asOf, { pseudonymize: draft.pseudonymize, includeNotes: draft.includeNotes }).text : ''),
    [preview, vault, assessments, asOf, draft.pseudonymize, draft.includeNotes],
  );

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await testConnection(draft);
      setTestResult({ tone: 'positive', text: `Connected. ${draft.model} replied: “${reply || '(empty reply)'}”` });
    } catch (err) {
      setTestResult({ tone: 'concern', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Section title="AI processing" hint="Optional. Off by default.">
      <div className="stack">
        <p className="muted">
          Questions on <Link to="/ask">Reflect with AI</Link> are always answerable on this device. You can also connect a language model: it then
          receives your question plus a structured evidence summary, and only after you confirm what will be sent.
        </p>
        <div className="stack settings-tight">
          <span className="settings-label">Provider</span>
          <Choices options={PROVIDERS} value={draft.provider} onChange={(v) => v && set({ provider: v })} />
        </div>

        {draft.provider !== 'off' && (
          <>
            {draft.provider === 'openai_compatible' && (
              <div className="stack settings-tight">
                <span className="settings-label">Endpoint</span>
                <Choices options={PRESETS} value={preset?.value} onChange={(v) => v && set({ baseUrl: v })} />
                {preset && <p className="faint settings-hint">{preset.hint}</p>}
                <label className="field">
                  Base URL
                  <input type="url" value={draft.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" spellCheck={false} />
                  <span className="field-hint">Kith calls {`{base URL}`}/chat/completions. For Ollama, allow this page in OLLAMA_ORIGINS.</span>
                </label>
              </div>
            )}
            {draft.provider === 'anthropic' && <p className="faint settings-hint">Kith calls api.anthropic.com directly from this browser.</p>}
            <div className="row">
              {local ? (
                <Chip tone="positive" dot>
                  Stays on this machine
                </Chip>
              ) : (
                <Chip tone="neutral" dot>
                  Leaves this device when you send a question
                </Chip>
              )}
            </div>
            <div className="grid grid-2">
              <label className="field">
                Model
                <input
                  value={draft.model}
                  onChange={(e) => set({ model: e.target.value })}
                  placeholder={draft.provider === 'anthropic' ? 'e.g. claude-haiku-4-5' : 'e.g. llama3.2 or openai/gpt-4.1-nano'}
                  spellCheck={false}
                />
              </label>
              <label className="field">
                API key {draft.provider === 'openai_compatible' && <span className="field-hint">(not needed for Ollama)</span>}
                <input type="password" autoComplete="off" value={draft.apiKey} onChange={(e) => set({ apiKey: e.target.value })} />
                <span className="field-hint">Stored inside your encrypted vault and sent only to this endpoint.</span>
              </label>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={draft.pseudonymize} onChange={(e) => set({ pseudonymize: e.target.checked })} />
              Replace names with aliases (Person A, Person B…) before sending; names are restored in the answer on this device
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={draft.includeNotes} onChange={(e) => set({ includeNotes: e.target.checked })} />
              Include notes, reflections and availability context (your own words)
            </label>
            {!draft.pseudonymize && <p className="faint settings-hint">Real names will be sent.</p>}
          </>
        )}

        <div className="row">
          <button type="button" className="btn" disabled={!dirty} onClick={() => updateSettings({ ai: { ...draft, baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), apiKey: draft.apiKey.trim() } })}>
            Save AI settings
          </button>
          {draft.provider !== 'off' && (
            <button type="button" className="btn btn-ghost" disabled={testing || !draft.model.trim()} onClick={() => void test()}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          )}
          <button type="button" className="btn btn-quiet" aria-expanded={preview} onClick={() => setPreview((p) => !p)}>
            {preview ? 'Hide preview' : 'Preview what would be sent'}
          </button>
          {dirty && <span className="faint settings-hint">Unsaved changes</span>}
        </div>
        {draft.provider !== 'off' && <p className="faint settings-hint">The connection test sends a one-word prompt with no personal data.</p>}
        <Status message={testResult} />
        {preview && (
          <div className="stack settings-tight">
            <p className="faint settings-hint">
              The full evidence summary with the options above ({draft.pseudonymize ? 'aliases' : 'real names'}, {draft.includeNotes ? 'notes included' : 'notes withheld'}).
              Questions about specific people send only their sections.
            </p>
            <pre className="settings-packet" tabIndex={0} aria-label="Evidence summary preview">
              {packet}
            </pre>
          </div>
        )}
      </div>
    </Section>
  );
}

type ImportState = { step: 'idle' } | { step: 'passphrase'; sealed: SealedVault; fileName: string } | { step: 'confirm'; next: Vault; fileName: string };

function DataSection() {
  const { vault, asOf, exportSealed, replaceVault } = useVault();
  const [readableOk, setReadableOk] = useState(false);
  const [imp, setImp] = useState<ImportState>({ step: 'idle' });
  const [filePass, setFilePass] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fail = (err: unknown) => setMessage({ tone: 'concern', text: err instanceof Error ? err.message : String(err) });

  const exportEncrypted = async () => {
    try {
      await saveFile(`kith-backup-${asOf}.json`, await exportSealed());
      setMessage({ tone: 'positive', text: 'Encrypted backup saved. It opens only with your current passphrase.' });
    } catch (err) {
      fail(err);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      const raw: unknown = JSON.parse(await file.text());
      if (isSealed(raw)) setImp({ step: 'passphrase', sealed: raw, fileName: file.name });
      else setImp({ step: 'confirm', next: normalizeVault(raw), fileName: file.name });
    } catch (err) {
      setImp({ step: 'idle' });
      fail(err instanceof SyntaxError ? new Error('That file is not valid JSON.') : err);
    }
  };

  const openSealed = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (imp.step !== 'passphrase') return;
    setBusy(true);
    setMessage(null);
    try {
      const { plaintext } = await unseal(imp.sealed, filePass);
      setImp({ step: 'confirm', next: normalizeVault(JSON.parse(plaintext)), fileName: imp.fileName });
      setFilePass('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const replace = () => {
    if (imp.step !== 'confirm') return;
    replaceVault(imp.next);
    setImp({ step: 'idle' });
    setMessage({ tone: 'positive', text: `Imported ${imp.fileName}. It is now encrypted with your current passphrase.` });
  };

  return (
    <Section title="Your data" hint={`${vault.people.length} people · ${vault.interactions.length} interactions`}>
      <div className="stack">
        <div className="row-between">
          <div>
            <h3>Encrypted backup</h3>
            <p className="faint settings-hint">A sealed copy that opens only with your current passphrase.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => void exportEncrypted()}>
            Export encrypted backup
          </button>
        </div>
        <hr className="divider" />
        <div className="stack settings-tight">
          <h3>Readable export</h3>
          <p className="faint settings-hint">
            A plain JSON file anyone can read — including every note, reflection and your API key. Only use it if you need your data in another tool, and store
            it carefully.
          </p>
          <label className="checkbox">
            <input type="checkbox" checked={readableOk} onChange={(e) => setReadableOk(e.target.checked)} />I understand this file is not encrypted
          </label>
          <div className="row">
            <button type="button" className="btn btn-ghost" disabled={!readableOk} onClick={() => void saveFile(`kith-export-${asOf}.json`, vault)}>
              Export readable JSON
            </button>
          </div>
        </div>
        <hr className="divider" />
        <div className="stack settings-tight">
          <h3>Import</h3>
          <p className="faint settings-hint">Accepts an encrypted Kith backup or a readable export. Importing replaces everything currently stored.</p>
          <div className="row">
            <input ref={fileRef} type="file" accept="application/json,.json" className="settings-file" aria-label="Choose a Kith backup file" onChange={(e) => void onFile(e)} />
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={imp.step !== 'idle'}>
              Choose file…
            </button>
          </div>
          {imp.step === 'passphrase' && (
            <form className="callout stack" onSubmit={(e) => void openSealed(e)}>
              <p>
                <strong>{imp.fileName}</strong> is encrypted. Enter the passphrase it was created with.
              </p>
              <label className="field">
                Backup passphrase
                <input type="password" autoComplete="off" value={filePass} onChange={(e) => setFilePass(e.target.value)} autoFocus />
              </label>
              <div className="row">
                <button className="btn" type="submit" disabled={busy || !filePass}>
                  {busy ? 'Decrypting…' : 'Open backup'}
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setImp({ step: 'idle' })}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {imp.step === 'confirm' && (
            <div className="callout tone-concern stack" role="alertdialog" aria-labelledby="import-confirm">
              <h3 id="import-confirm">Replace your current data?</h3>
              <p>
                {imp.fileName} contains {imp.next.people.length} people and {imp.next.interactions.length} interactions. It will replace the{' '}
                {vault.people.length} people and {vault.interactions.length} interactions stored now. This cannot be undone — consider exporting a backup
                first.
              </p>
              <div className="row">
                <button type="button" className="btn" onClick={replace}>
                  Replace with imported data
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setImp({ step: 'idle' })}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <Status message={message} />
      </div>
    </Section>
  );
}

function DeleteSection() {
  const { destroy } = useVault();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Delete">
      <div className="stack">
        <div>
          <h3>Delete a person</h3>
          <p className="muted">
            Open their profile from <Link to="/people">People</Link> and choose Delete. Their profile and every interaction recorded about them are removed
            permanently.
          </p>
        </div>
        <hr className="divider" />
        <div className="stack settings-tight">
          <h3>Delete everything</h3>
          <p className="muted">Permanently erases the vault from this device. Without a backup, it cannot be recovered.</p>
          <label className="field">
            Type DELETE to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <div className="row">
            <button
              type="button"
              className="btn btn-danger"
              disabled={typed !== 'DELETE' || busy}
              onClick={() => {
                setBusy(true);
                void destroy();
              }}
            >
              {busy ? 'Deleting…' : 'Delete everything'}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}
