import { useMemo, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import { localDay, REQUEST_DOMAIN } from '../capture/extract';
import { openPlans, type BatchImportSummary, type SuggestionPatch } from '../capture/inbox';
import { isCaptureBundle, type CaptureBundle } from '../capture/types';
import { emptyCapture, newPerson } from '../domain/factory';
import { FOCUS_LABEL, INTERACTION_TYPE, REQUEST_KIND_LABEL } from '../domain/taxonomy';
import type { Actor, CaptureSuggestion, PendingConversation, Person } from '../domain/types';
import { formatDate, num, plural } from '../engine/time';
import { isSealed, unseal, WrongPassphraseError, type SealedVault } from '../store/crypto';
import { useVault } from '../store/VaultContext';
import { Choices, Empty, PageHead, Section, optionsOf } from '../ui/kit';
import './Inbox.css';

type Message = { tone: 'positive' | 'concern' | 'neutral'; text: string } | null;

interface SealedFile {
  name: string;
  sealed: SealedVault;
}

type ImportState = { step: 'idle' } | { step: 'passphrase'; files: SealedFile[]; rememberedFailed: boolean; skipped: string[] };

/** A request logged from the inbox that opened Pause & Reflect. */
interface PauseNotice {
  id: string;
  personId: string;
  name: string;
}

function summaryText(s: BatchImportSummary): string {
  const fresh = s.files - s.alreadyImported;
  if (!fresh) return s.files === 1 ? 'This file was already imported. Nothing new.' : 'These files were already imported. Nothing new.';
  const files = s.files > 1 ? ` from ${plural(fresh, 'file')}` : '';
  const again = s.alreadyImported ? ` ${num(s.alreadyImported, true)} ${s.alreadyImported === 1 ? 'file was' : 'files were'} already imported.` : '';
  const dupes = s.duplicates ? ` ${num(s.duplicates, true)} ${s.duplicates === 1 ? 'message was' : 'messages were'} already imported.` : '';
  const who = s.unresolved ? ` Choose who ${s.unresolved === 1 ? 'one conversation is' : `${s.unresolved} conversations are`} with below.` : '';
  if (!s.conversations) return `Nothing new${files}.${again}${dupes}`;
  return `Added ${plural(s.conversations, 'conversation')} with ${plural(s.people, 'person', 'people')}${files}.${again}${dupes}${who}`;
}

/** Tries one passphrase on every file; the rest of the batch is not blocked by one bad file. */
async function openFiles(files: SealedFile[], passphrase: string) {
  const bundles: CaptureBundle[] = [];
  const wrongPassphrase: SealedFile[] = [];
  const notCaptures: string[] = [];
  for (const f of files) {
    try {
      const { plaintext } = await unseal(f.sealed, passphrase);
      let bundle: unknown = null;
      try {
        bundle = JSON.parse(plaintext);
      } catch {
        // falls through to the format check
      }
      if (isCaptureBundle(bundle)) bundles.push(bundle);
      else notCaptures.push(f.name);
    } catch (err) {
      if (!(err instanceof WrongPassphraseError)) throw err;
      wrongPassphrase.push(f);
    }
  }
  return { bundles, wrongPassphrase, notCaptures };
}

export function Inbox() {
  const { vault } = useVault();
  const capture = vault.capture ?? emptyCapture();
  const [notices, setNotices] = useState<PauseNotice[]>([]);

  const groups = useMemo(() => {
    const byKey = new Map<string, PendingConversation[]>();
    for (const c of capture.pending) {
      const key = c.personId ?? `sender:${c.friend}`;
      byKey.set(key, [...(byKey.get(key) ?? []), c]);
    }
    const newest = (list: PendingConversation[]) => list.reduce((d, c) => (c.date > d ? c.date : d), '');
    return [...byKey.values()]
      .map((list) => list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)))
      .sort((a, b) => newest(b).localeCompare(newest(a)));
  }, [capture.pending]);

  return (
    <div className="stack-lg inbox">
      <PageHead
        title="Inbox"
        lede="Texts captured on your Mac, encrypted before they left it. Kith only suggests what to record — nothing is logged until you add it. Message text is deleted once you review each conversation, and no times are shown."
      />
      <ImportPanel />
      {notices.map((n) => (
        <div key={n.id} className="callout tone-change row-between" role="status">
          <span>
            Added to open decisions for {n.name} — <Link to={`/people/${n.personId}`}>Pause &amp; reflect</Link>
          </span>
          <button type="button" className="btn btn-quiet" onClick={() => setNotices((all) => all.filter((x) => x.id !== n.id))}>
            Close
          </button>
        </div>
      ))}
      {groups.length ? (
        groups.map((list) => (
          <div key={list[0].personId ?? list[0].friend} className="stack">
            {list.map((c) => (
              <ConversationCard key={c.id} conv={c} onPaused={(n) => setNotices((all) => [...all, n])} />
            ))}
          </div>
        ))
      ) : (
        <SetupHelp />
      )}
      <CaptureSettings />
    </div>
  );
}

function ImportPanel() {
  const { vault, importCapture, setCapturePassphrase } = useVault();
  const remembered = vault.capture?.passphrase;
  const [imp, setImp] = useState<ImportState>({ step: 'idle' });
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  /** Imports what opened; asks for a passphrase for what didn't; reports files that were skipped. */
  const finish = (bundles: CaptureBundle[], stillLocked: SealedFile[], skipped: string[], rememberedFailed: boolean) => {
    const parts: string[] = [];
    if (bundles.length) parts.push(summaryText(importCapture(bundles)));
    // While some files still await a passphrase, skipped names are carried forward and reported at the end.
    if (skipped.length && !stillLocked.length) parts.push(`Skipped (not a Kith text capture): ${skipped.join(', ')}.`);
    setMessage(parts.length ? { tone: skipped.length && !bundles.length ? 'concern' : bundles.length ? 'positive' : 'neutral', text: parts.join(' ') } : null);
    setImp(stillLocked.length ? { step: 'passphrase', files: stillLocked, rememberedFailed, skipped } : { step: 'idle' });
  };

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!picked.length) return;
    setMessage(null);
    setBusy(true);
    try {
      const sealedFiles: SealedFile[] = [];
      const skipped: string[] = [];
      for (const file of picked) {
        let raw: unknown = null;
        try {
          raw = JSON.parse(await file.text());
        } catch {
          // not JSON; reported below
        }
        if (isSealed(raw)) sealedFiles.push({ name: file.name, sealed: raw });
        else skipped.push(file.name);
      }
      if (!sealedFiles.length) {
        setMessage({ tone: 'concern', text: 'None of those are encrypted Kith text captures. Choose the files your Mac saved to iCloud Drive › Kith.' });
        return;
      }
      if (remembered) {
        const r = await openFiles(sealedFiles, remembered);
        finish(r.bundles, r.wrongPassphrase, [...skipped, ...r.notCaptures], true);
      } else {
        finish([], sealedFiles, skipped, false);
      }
    } catch (err) {
      setImp({ step: 'idle' });
      setMessage({ tone: 'concern', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (imp.step !== 'passphrase') return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await openFiles(imp.files, pass);
      if (!r.bundles.length && !r.notCaptures.length) {
        setMessage({ tone: 'concern', text: 'That passphrase does not open these files. Use the capture passphrase you set on your Mac.' });
        return;
      }
      if (remember && pass !== remembered) setCapturePassphrase(pass);
      setPass('');
      finish(r.bundles, r.wrongPassphrase, [...imp.skipped, ...r.notCaptures], false);
    } catch (err) {
      setMessage({ tone: 'concern', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const lockedNames = imp.step === 'passphrase' ? imp.files.map((f) => f.name) : [];

  return (
    <section className="card stack">
      <div className="row">
        <label className={`btn inbox-file ${busy || imp.step !== 'idle' ? 'is-disabled' : ''}`}>
          {busy && imp.step === 'idle' ? 'Opening…' : 'Import captured texts'}
          <input type="file" multiple accept=".json,application/json" disabled={busy || imp.step !== 'idle'} onChange={(e) => void onFiles(e)} />
        </label>
      </div>
      <p className="faint inbox-note">You can select several nightly files at once — tap Select in the file picker. Files already imported are skipped.</p>
      {imp.step === 'passphrase' && (
        <form className="callout stack" onSubmit={(e) => void submit(e)}>
          <p>
            {imp.rememberedFailed ? 'The remembered passphrase did not open ' : 'Enter the capture passphrase for '}
            <strong>{lockedNames.length === 1 ? lockedNames[0] : `${plural(lockedNames.length, 'file')}`}</strong>
            {imp.rememberedFailed ? '. Enter the capture passphrase set on your Mac.' : '.'}
          </p>
          <label className="field">
            Capture passphrase
            <input type="password" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember on this device, inside your encrypted vault
          </label>
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !pass}>
              {busy ? 'Decrypting…' : 'Open'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setImp({ step: 'idle' })}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className={`tone-${message.tone} inbox-status`} role={message.tone === 'concern' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </section>
  );
}

function ConversationCard({ conv, onPaused }: { conv: PendingConversation; onPaused: (n: PauseNotice) => void }) {
  const { vault, finishCaptureConversation } = useVault();
  const person = conv.personId ? vault.people.find((p) => p.id === conv.personId) : undefined;
  const pending = conv.suggestions.filter((s) => s.status === 'pending');
  const done = conv.suggestions.filter((s) => s.status !== 'pending');

  return (
    <article className="card stack inbox-conv">
      <header className="row-between">
        <h2>{person ? <Link to={`/people/${person.id}`}>{person.name}</Link> : conv.friend}</h2>
        <span className="faint">{formatDate(conv.date)}</span>
      </header>
      {!person && <SenderPicker friend={conv.friend} />}
      {!conv.includesSent && (
        <p className="faint inbox-note">Only their messages were captured, so Kith can’t tell who started this conversation.</p>
      )}
      <ol className="inbox-thread" aria-label="Messages, in order">
        {conv.messages.map((m) => (
          <li key={m.guid} className={`inbox-bubble ${m.fromMe ? 'from-me' : 'from-them'}`}>
            <span className="visually-hidden">{m.fromMe ? 'You: ' : `${person?.name ?? conv.friend}: `}</span>
            {m.text === '[attachment]' ? <em className="faint">Attachment</em> : m.text}
          </li>
        ))}
      </ol>
      {pending.length > 0 && (
        <div className="stack">
          <h3>Suggestions</h3>
          {pending.map((s) => (
            <SuggestionCard key={s.id} conv={conv} person={person} suggestion={s} onPaused={onPaused} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <ul className="inbox-done faint">
          {done.map((s) => (
            <li key={s.id}>
              {s.status === 'added' ? 'Added' : 'Skipped'}: {INTERACTION_TYPE[s.type].label}
            </li>
          ))}
        </ul>
      )}
      <div className="row inbox-actions">
        {person && (
          <Link className="btn btn-ghost" to={`/log?person=${person.id}`}>
            Log something else
          </Link>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => finishCaptureConversation(conv.id)}>
          Done with this conversation
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => finishCaptureConversation(conv.id)}>
          Dismiss conversation
        </button>
      </div>
      <p className="faint inbox-note">Either way, the message text is deleted. Only entries you added are kept.</p>
    </article>
  );
}

function SenderPicker({ friend }: { friend: string }) {
  const { vault, savePerson, assignCaptureSender } = useVault();
  const people = useMemo(() => vault.people.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name)), [vault.people]);
  const [choice, setChoice] = useState('');

  const addNew = () => {
    const p = newPerson({ name: friend.trim() });
    savePerson(p);
    assignCaptureSender(friend, p.id);
  };

  return (
    <div className="callout stack">
      <p>
        Who is <strong>{friend}</strong>? No one in Kith has exactly this name.
      </p>
      {people.length > 0 && (
        <div className="inbox-picker">
          <label className="field">
            An existing person
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" disabled={!choice} onClick={() => assignCaptureSender(friend, choice)}>
            Use this person
          </button>
        </div>
      )}
      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={addNew}>
          Add “{friend}” as a new person
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => assignCaptureSender(friend, null)}>
          Ignore this sender from now on
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({
  conv,
  person,
  suggestion,
  onPaused,
}: {
  conv: PendingConversation;
  person: Person | undefined;
  suggestion: CaptureSuggestion;
  onPaused: (n: PauseNotice) => void;
}) {
  const { vault, asOf, editCaptureSuggestion, addCaptureSuggestion, skipCaptureSuggestion } = useVault();
  const [note, setNote] = useState(suggestion.note);
  const [error, setError] = useState<string | null>(null);
  const def = INTERACTION_TYPE[suggestion.type];
  const actors = (Object.keys(def.actors) as Actor[]).map((a) => ({ value: a, label: def.actors[a] ?? a }));
  const plans = person && def.fields.includes('commitment') ? openPlans(vault, person.id, asOf) : [];
  const edit = (patch: SuggestionPatch) => editCaptureSuggestion(conv.id, suggestion.id, patch);

  const add = () => {
    setError(null);
    try {
      const { entry, paused } = addCaptureSuggestion(conv.id, suggestion.id, { note });
      if (paused && person) onPaused({ id: entry.id, personId: person.id, name: person.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="inbox-suggestion stack">
      <div>
        <h4>{def.label}</h4>
        <p className="faint inbox-note">{def.hint}</p>
      </div>
      {def.actorQuestion && actors.length > 1 && (
        <fieldset className="inbox-fieldset">
          <legend>{def.actorQuestion}</legend>
          <Choices options={actors} value={suggestion.actor} onChange={(v) => v && edit({ actor: v })} />
        </fieldset>
      )}
      {def.fields.includes('focus') && (
        <fieldset className="inbox-fieldset">
          <legend>What was it mainly about?</legend>
          <Choices options={optionsOf(FOCUS_LABEL)} value={suggestion.focus} onChange={(v) => edit({ focus: v })} allowNone />
        </fieldset>
      )}
      {def.fields.includes('requestKind') && (
        <fieldset className="inbox-fieldset">
          <legend>What kind of request?</legend>
          <Choices
            options={optionsOf(REQUEST_KIND_LABEL)}
            value={suggestion.requestKind}
            onChange={(v) => edit({ requestKind: v, trustDomain: v ? REQUEST_DOMAIN[v] : undefined })}
            allowNone
          />
        </fieldset>
      )}
      {def.fields.includes('rescheduleOffered') && (
        <label className="checkbox">
          <input type="checkbox" checked={suggestion.rescheduleOffered ?? false} onChange={(e) => edit({ rescheduleOffered: e.target.checked })} />
          {suggestion.actor === 'me' ? 'I proposed another time' : 'They proposed another time'}
        </label>
      )}
      {def.fields.includes('commitment') && person && (
        <label className="field">
          Which plans does this cancel?
          {plans.length ? (
            <select value={suggestion.relatesTo ?? ''} onChange={(e) => edit({ relatesTo: e.target.value || undefined })}>
              <option value="">Not linked</option>
              {plans.map((c) => (
                <option key={c.item.id} value={c.item.id}>
                  {(c.item.note?.trim() || 'Plans') + ` (${formatDate(c.item.date)})`}
                </option>
              ))}
            </select>
          ) : (
            <span className="field-hint">No open plans recorded for {person.name}.</span>
          )}
        </label>
      )}
      <label className="field">
        Note <span className="field-hint">Your words — the messages themselves are not kept.</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== suggestion.note && edit({ note })} />
      </label>
      {error && (
        <p className="tone-concern inbox-status" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn" disabled={!person} onClick={add}>
          Add
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => skipCaptureSuggestion(conv.id, suggestion.id)}>
          Skip
        </button>
        {!person && <span className="field-hint">Choose who this is with first.</span>}
      </div>
    </div>
  );
}

function SetupHelp() {
  return (
    <Section title="Nothing to review">
      <Empty quote="Captured conversations will appear here for you to review.">
        <ol className="inbox-steps">
          <li>
            On your Mac, set up the nightly capture described in <code>docs/CAPTURE.md</code>: choose the friends to include and a capture passphrase, and give
            it Full Disk Access so it can read Messages.
          </li>
          <li>Each night at 11pm it saves an encrypted file to iCloud Drive › Kith.</li>
          <li>Here, tap “Import captured texts”, select one or more files in Files, and enter the capture passphrase.</li>
        </ol>
      </Empty>
    </Section>
  );
}

function CaptureSettings() {
  const { vault, setCapturePassphrase, forgetCaptureSender } = useVault();
  const capture = vault.capture ?? emptyCapture();
  const aliases = Object.entries(capture.aliases);
  const nameOf = (id: string) => vault.people.find((p) => p.id === id)?.name ?? 'someone no longer in Kith';

  return (
    <Section title="Text capture" quiet>
      <ul className="inbox-settings">
        <li className="row-between">
          <span>{capture.lastImportAt ? `Last import: ${formatDate(localDay(capture.lastImportAt))}` : 'Nothing imported yet.'}</span>
        </li>
        <li className="row-between">
          <span>{capture.passphrase ? 'Your capture passphrase is remembered inside your encrypted vault.' : 'No capture passphrase is remembered.'}</span>
          {capture.passphrase && (
            <button type="button" className="btn btn-ghost" onClick={() => setCapturePassphrase(undefined)}>
              Forget it
            </button>
          )}
        </li>
        {aliases.map(([friend, id]) => (
          <li key={`alias-${friend}`} className="row-between">
            <span>
              “{friend}” is {nameOf(id)}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => forgetCaptureSender(friend)}>
              Remove
            </button>
          </li>
        ))}
        {capture.ignored.map((friend) => (
          <li key={`ignored-${friend}`} className="row-between">
            <span>Ignoring “{friend}”</span>
            <button type="button" className="btn btn-ghost" onClick={() => forgetCaptureSender(friend)}>
              Stop ignoring
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
