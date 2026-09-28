import { useMemo, useState, type ReactNode, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { defaultActor, newInteraction } from '../domain/factory';
import {
  BALANCE_LABEL,
  CONCERN_TAGS,
  FOCUS_LABEL,
  GREEN_FLAGS,
  GROUP_LABEL,
  INFLUENCE_LABEL,
  INTERACTION_TYPE,
  INTERACTION_TYPES,
  INVITE_RESPONSE_LABEL,
  MOOD_LABEL,
  OUTCOME_LABEL,
  RECEPTION_LABEL,
  REQUEST_KIND_LABEL,
  SIGNIFICANCE_LABEL,
  TRUST_DOMAINS,
  type InteractionField,
  type InteractionGroup,
} from '../domain/taxonomy';
import type { Actor, Interaction, InteractionTypeId, Person, Tristate, TrustDomainId } from '../domain/types';
import { deriveCommitments, evaluateAdvice, pauseAndReflect, type Commitment, type PauseReflection } from '../engine';
import { flagsDescribeThem, isTheirs } from '../engine/evidence';
import { formatDate } from '../engine/time';
import { useVault } from '../store/VaultContext';
import { Choices, Empty, MultiChoices, PageHead, Section, optionsOf } from '../ui/kit';
import { AdviceEvaluationView, PauseReflectView } from './PauseReflectView';
import './LogInteraction.css';

const GROUPS = Object.keys(GROUP_LABEL) as InteractionGroup[];

const TRISTATE_OPTIONS: { value: Tristate; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unsure' },
];

const YES_NO: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** The interaction property each type-specific field writes to. */
const FIELD_KEY: Record<
  InteractionField,
  | 'focus'
  | 'balance'
  | 'influence'
  | 'trustDomain'
  | 'outcome'
  | 'requestKind'
  | 'conflictOfInterest'
  | 'independentEvidence'
  | 'inviteResponse'
  | 'reception'
  | 'rescheduleOffered'
  | 'dueDate'
  | 'relatesTo'
> = {
  focus: 'focus',
  balance: 'balance',
  influence: 'influence',
  trustDomain: 'trustDomain',
  outcome: 'outcome',
  requestKind: 'requestKind',
  conflictOfInterest: 'conflictOfInterest',
  independentEvidence: 'independentEvidence',
  inviteResponse: 'inviteResponse',
  reception: 'reception',
  rescheduleOffered: 'rescheduleOffered',
  dueDate: 'dueDate',
  commitment: 'relatesTo',
};

/** Which commitments a resolution type can link to. */
const RESOLVES: Partial<Record<InteractionTypeId, Commitment['kind']>> = {
  promise_kept: 'promise',
  promise_broken: 'promise',
  cancelled_plans: 'plans',
  rescheduled_plans: 'plans',
  met_in_person: 'plans',
};

/** Positive acts where the other person may have paid a real cost (time, money, effort). */
const COSTLY_TYPES = new Set<InteractionTypeId>([
  'met_in_person',
  'invitation',
  'help_received',
  'reached_out_difficulty',
  'celebrated_success',
  'gift_generosity',
  'introduction_referral',
  'promise_kept',
  'collaboration_completed',
]);

const NOTE_PLACEHOLDER = 'Planned coffee for Saturday. Cancelled the morning of and did not propose another time.';

function isTypeId(v: string | null): v is InteractionTypeId {
  return v !== null && v in INTERACTION_TYPE;
}

function costlyApplies(i: Interaction): boolean {
  return COSTLY_TYPES.has(i.type) && isTheirs(i);
}

function commitmentLabel(c: Commitment): string {
  const what = c.item.note?.trim() || INTERACTION_TYPE[c.item.type].label;
  const whose = c.kind === 'plans' ? 'plans' : c.owner === 'me' ? 'my promise' : 'their promise';
  const due = c.dueDate ? ` · due ${formatDate(c.dueDate)}` : '';
  return `${what} (${whose}, ${formatDate(c.item.date)}${due})`;
}

/** Strips values that do not belong to the chosen type so stale answers never leak into the record. */
function clean(d: Interaction, allowedCommitments: Commitment[]): Interaction {
  const def = INTERACTION_TYPE[d.type];
  const out: Interaction = { ...d };
  for (const f of Object.keys(FIELD_KEY) as InteractionField[]) {
    if (!def.fields.includes(f)) delete out[FIELD_KEY[f]];
  }
  if (out.relatesTo && !allowedCommitments.some((c) => c.item.id === out.relatesTo)) delete out.relatesTo;
  if (!(out.actor in def.actors)) out.actor = defaultActor(d.type);
  if (!costlyApplies(out)) delete out.costly;
  if (!flagsDescribeThem(out) || !out.greenFlags?.length) delete out.greenFlags;
  if (!out.concerns?.length) delete out.concerns;
  if (d.type !== 'request_made') delete out.decision;
  const note = out.note?.trim();
  const reflection = out.reflection?.trim();
  if (note) out.note = note;
  else delete out.note;
  if (reflection) out.reflection = reflection;
  else delete out.reflection;
  return out;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="log-field">
      <legend>{label}</legend>
      {hint && <span className="field-hint">{hint}</span>}
      {children}
    </fieldset>
  );
}

type Phase = { kind: 'form' } | { kind: 'pause'; reflection: PauseReflection } | { kind: 'calm'; reflection: PauseReflection } | { kind: 'advice' };

function LogForm({ init, editing }: { init: () => Interaction; editing: boolean }) {
  const { vault, asOf, assessments, saveInteraction, deleteInteraction } = useVault();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Interaction>(init);
  const [pressureNo, setPressureNo] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [originalRelatesTo] = useState(draft.relatesTo);

  const def = INTERACTION_TYPE[draft.type];
  const person: Person | undefined = vault.people.find((p) => p.id === draft.personId);
  const people = useMemo(
    () => vault.people.filter((p) => !p.archived || p.id === draft.personId).sort((a, b) => a.name.localeCompare(b.name)),
    [vault.people, draft.personId],
  );

  const commitmentOptions = useMemo(() => {
    const kind = RESOLVES[draft.type];
    if (!kind || !draft.personId) return [];
    return deriveCommitments(
      vault.interactions.filter((i) => i.personId === draft.personId && i.id !== draft.id),
      asOf,
    ).filter((c) => c.kind === kind && (c.status === 'open' || c.item.id === originalRelatesTo));
  }, [vault.interactions, draft.personId, draft.id, draft.type, asOf, originalRelatesTo]);

  const set = (patch: Partial<Interaction>) => setDraft((d) => ({ ...d, ...patch }));
  const profilePath = `/people/${draft.personId}`;

  const pickCommitment = (id: string) => {
    const c = commitmentOptions.find((x) => x.item.id === id);
    const ownerFits = c && RESOLVES[draft.type] === 'promise' && c.owner in def.actors;
    set({ relatesTo: id || undefined, ...(ownerFits ? { actor: c.owner } : {}) });
  };

  const pressured = draft.concerns?.includes('pressured_decision') ?? false;
  const setPressure = (v: 'yes' | 'no' | undefined) => {
    const others = (draft.concerns ?? []).filter((c) => c !== 'pressured_decision');
    set({ concerns: v === 'yes' ? [...others, 'pressured_decision'] : others });
    setPressureNo(v === 'no');
  };

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!person) {
      setError('Choose who this is about.');
      return;
    }
    let saved = clean(draft, commitmentOptions);
    if (saved.type === 'request_made' && saved.decision?.status !== 'decided') {
      const reflection = pauseAndReflect(person, vault.interactions, saved);
      if (reflection.triggered) saved = { ...saved, decision: saved.decision ?? { status: 'open' } };
      saveInteraction(saved);
      setDraft(saved);
      setPhase({ kind: reflection.triggered ? 'pause' : 'calm', reflection });
      return;
    }
    saveInteraction(saved);
    if (saved.type === 'advice_received' && !editing) {
      setDraft(saved);
      setPhase({ kind: 'advice' });
      return;
    }
    navigate(profilePath);
  };

  const decide = () => {
    const note = decisionNote.trim();
    saveInteraction({ ...draft, decision: note ? { status: 'decided', note } : { status: 'decided' } });
    navigate(profilePath);
  };

  const remove = () => {
    deleteInteraction(draft.id);
    navigate(person ? profilePath : '/people');
  };

  if (phase.kind !== 'form' && person) {
    const assessment = assessments.get(person.id);
    return (
      <div className="stack-lg">
        <PageHead title="Saved" lede={`Recorded for ${person.name}.`} />
        {phase.kind === 'pause' && (
          <PauseReflectView reflection={phase.reflection}>
            <div className="stack" style={{ width: '100%' }}>
              <label className="field">
                What did you decide? <span className="field-hint">Optional, only if you have decided.</span>
                <input type="text" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
              </label>
              <div className="row">
                <button type="button" className="btn" onClick={() => navigate(profilePath)}>
                  I’ll take time to decide
                </button>
                <button type="button" className="btn btn-ghost" onClick={decide}>
                  I’ve decided
                </button>
              </div>
            </div>
          </PauseReflectView>
        )}
        {phase.kind === 'calm' && (
          <PauseReflectView reflection={phase.reflection}>
            <button type="button" className="btn" onClick={() => navigate(profilePath)}>
              Continue
            </button>
          </PauseReflectView>
        )}
        {phase.kind === 'advice' && (
          <Section title="How seriously should I take this?" hint="Weighs track record, not friendship status">
            <div className="stack">
              {showEvaluation && assessment ? (
                <AdviceEvaluationView evaluation={evaluateAdvice(assessment, draft)} />
              ) : (
                <p className="muted">You can look at this advice alongside {person.name}’s track record in this area, and record how it turned out later from their profile.</p>
              )}
              <div className="row">
                {!showEvaluation && (
                  <button type="button" className="btn btn-ghost" onClick={() => setShowEvaluation(true)}>
                    How seriously should I take this?
                  </button>
                )}
                <button type="button" className="btn" onClick={() => navigate(profilePath)}>
                  Done
                </button>
              </div>
            </div>
          </Section>
        )}
      </div>
    );
  }

  const renderField = (f: InteractionField): ReactNode => {
    switch (f) {
      case 'focus':
        return (
          <Field key={f} label="What was it mainly about?">
            <Choices options={optionsOf(FOCUS_LABEL)} value={draft.focus} onChange={(v) => set({ focus: v })} allowNone />
          </Field>
        );
      case 'balance':
        return (
          <Field key={f} label="Conversation balance">
            <Choices options={optionsOf(BALANCE_LABEL)} value={draft.balance} onChange={(v) => set({ balance: v })} allowNone />
          </Field>
        );
      case 'influence':
        return (
          <Field key={f} label="Did this pull you toward or away from who you want to become?">
            <Choices options={optionsOf(INFLUENCE_LABEL)} value={draft.influence} onChange={(v) => set({ influence: v })} allowNone />
          </Field>
        );
      case 'trustDomain':
        return (
          <label key={f} className="field">
            Area
            <select
              value={draft.trustDomain ?? ''}
              onChange={(e) => set({ trustDomain: (e.target.value || undefined) as TrustDomainId | undefined })}
            >
              <option value="">Not specified</option>
              {TRUST_DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        );
      case 'outcome':
        return (
          <Field key={f} label="Outcome" hint="Often unknown at first. You can record it later.">
            <Choices options={optionsOf(OUTCOME_LABEL)} value={draft.outcome} onChange={(v) => set({ outcome: v })} allowNone />
          </Field>
        );
      case 'requestKind':
        return (
          <Field key={f} label="What kind of request?">
            <Choices options={optionsOf(REQUEST_KIND_LABEL)} value={draft.requestKind} onChange={(v) => set({ requestKind: v })} allowNone />
          </Field>
        );
      case 'conflictOfInterest':
        return (
          <div key={f} className="stack">
            <Field label="Would they benefit if you act on this?">
              <Choices options={TRISTATE_OPTIONS} value={draft.conflictOfInterest} onChange={(v) => set({ conflictOfInterest: v })} allowNone />
            </Field>
            {draft.type === 'request_made' && (
              <Field label="Is there pressure to decide quickly?">
                <Choices options={YES_NO} value={pressured ? 'yes' : pressureNo ? 'no' : undefined} onChange={setPressure} allowNone />
              </Field>
            )}
          </div>
        );
      case 'independentEvidence':
        return (
          <Field key={f} label="Is there independent evidence supporting it?">
            <Choices options={TRISTATE_OPTIONS} value={draft.independentEvidence} onChange={(v) => set({ independentEvidence: v })} allowNone />
          </Field>
        );
      case 'inviteResponse':
        return (
          <Field key={f} label="Response">
            <Choices options={optionsOf(INVITE_RESPONSE_LABEL)} value={draft.inviteResponse} onChange={(v) => set({ inviteResponse: v })} allowNone />
          </Field>
        );
      case 'reception':
        return (
          <Field key={f} label="How was it received?">
            <Choices options={optionsOf(RECEPTION_LABEL)} value={draft.reception} onChange={(v) => set({ reception: v })} allowNone />
          </Field>
        );
      case 'rescheduleOffered':
        return (
          <label key={f} className="checkbox">
            <input type="checkbox" checked={draft.rescheduleOffered ?? false} onChange={(e) => set({ rescheduleOffered: e.target.checked })} />
            {draft.actor === 'me' ? 'I proposed another time' : 'They proposed another time'}
          </label>
        );
      case 'dueDate':
        return (
          <label key={f} className="field">
            {draft.type === 'rescheduled_plans' ? 'New date' : 'When is it due?'} <span className="field-hint">Optional</span>
            <input type="date" value={draft.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
          </label>
        );
      case 'commitment':
        return (
          <label key={f} className="field">
            Which commitment does this resolve?
            {commitmentOptions.length ? (
              <select value={draft.relatesTo ?? ''} onChange={(e) => pickCommitment(e.target.value)}>
                <option value="">Not linked</option>
                {commitmentOptions.map((c) => (
                  <option key={c.item.id} value={c.item.id}>
                    {commitmentLabel(c)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="field-hint">
                {draft.personId ? `No open ${RESOLVES[draft.type] === 'promise' ? 'promises' : 'plans'} recorded for this person.` : 'Choose a person first.'}
              </span>
            )}
          </label>
        );
    }
  };

  const actors = (Object.keys(def.actors) as Actor[]).map((a) => ({ value: a, label: def.actors[a] ?? a }));
  const hurtful = draft.mood === 'hurt' || draft.mood === 'drained';

  return (
    <div className="stack-lg">
      <PageHead
        title={editing ? 'Edit interaction' : 'Log an interaction'}
        lede="Record what happened, in a sentence or two. Observations first — interpretations can wait."
      />
      <form className="card stack-lg" onSubmit={submit}>
        <div className="grid grid-2">
          <label className="field">
            Who
            <select
              required
              value={draft.personId}
              onChange={(e) => {
                setError(null);
                set({ personId: e.target.value, relatesTo: undefined });
              }}
            >
              <option value="" disabled>
                Choose a person…
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            When
            <input type="date" required max={asOf} value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
        </div>

        <Field label="What happened?">
          <div className="type-picker">
            {GROUPS.map((g) => (
              <div key={g} className="type-group">
                <div className="type-group-label">{GROUP_LABEL[g]}</div>
                <Choices
                  options={INTERACTION_TYPES.filter((t) => t.group === g).map((t) => ({ value: t.id, label: t.label }))}
                  value={draft.type}
                  onChange={(v) => v && setDraft((d) => ({ ...d, type: v, actor: defaultActor(v) }))}
                />
              </div>
            ))}
          </div>
          <p className="type-hint">
            <strong>{def.label}.</strong> {def.hint}
          </p>
        </Field>

        {def.actorQuestion && actors.length > 1 && (
          <Field label={def.actorQuestion}>
            <Choices options={actors} value={draft.actor} onChange={(v) => v && set({ actor: v })} />
          </Field>
        )}

        {def.fields.length > 0 && <div className="stack-lg">{def.fields.map(renderField)}</div>}

        <label className="field">
          What happened, briefly
          <textarea value={draft.note ?? ''} placeholder={NOTE_PLACEHOLDER} onChange={(e) => set({ note: e.target.value })} />
        </label>

        <Field label="How significant was this?">
          <Choices options={optionsOf(SIGNIFICANCE_LABEL)} value={draft.significance} onChange={(v) => v && set({ significance: v })} />
        </Field>

        {flagsDescribeThem(draft) && (
          <Field label="Green flags you noticed" hint="Optional. Good moments are evidence too.">
            <MultiChoices
              options={GREEN_FLAGS.map((g) => ({ value: g.id, label: g.label }))}
              value={draft.greenFlags ?? []}
              onChange={(v) => set({ greenFlags: v })}
            />
          </Field>
        )}

        {costlyApplies(draft) && (
          <label className="checkbox">
            <input type="checkbox" checked={draft.costly ?? false} onChange={(e) => set({ costly: e.target.checked })} />
            This cost them something (time, money, effort)
          </label>
        )}

        <details className="log-details" open={(draft.concerns?.length ?? 0) > 0}>
          <summary>Something felt off?</summary>
          <Field label="Only what you observed" hint="Describe behavior, not character. One moment is not a pattern.">
            <MultiChoices
              options={CONCERN_TAGS.map((c) => ({ value: c.id, label: c.label }))}
              value={draft.concerns ?? []}
              onChange={(v) => set({ concerns: v })}
            />
          </Field>
        </details>

        <details className="log-details" open={Boolean(draft.mood || draft.reflection)}>
          <summary>Reflection (private)</summary>
          <div className="stack">
            <Field label="How did you feel afterwards?">
              <Choices options={optionsOf(MOOD_LABEL)} value={draft.mood} onChange={(v) => set({ mood: v })} allowNone />
            </Field>
            {hurtful && <p className="quote">It can help to revisit this entry in a day or two, once the moment has settled.</p>}
            <label className="field">
              Your reflection
              <textarea value={draft.reflection ?? ''} onChange={(e) => set({ reflection: e.target.value })} />
            </label>
          </div>
        </details>

        {error && <p className="muted" role="alert">{error}</p>}

        <div className="row-between">
          <div className="row">
            <button type="submit" className="btn">
              {editing ? 'Save changes' : 'Save'}
            </button>
            <Link className="btn btn-quiet" to={draft.personId ? profilePath : '/people'}>
              Cancel
            </Link>
          </div>
          {editing && !confirmDelete && (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
              Delete entry
            </button>
          )}
        </div>

        {editing && confirmDelete && (
          <div className="callout tone-concern stack" role="alertdialog" aria-label="Confirm deletion">
            <p>
              Delete this entry permanently? This cannot be undone.
              {vault.interactions.some((i) => i.relatesTo === draft.id) && ' Entries that resolved this commitment are kept, but no longer linked to it.'}
            </p>
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={remove}>
                Delete permanently
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export function LogInteraction() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { vault, asOf } = useVault();

  if (id) {
    const existing = vault.interactions.find((i) => i.id === id);
    if (!existing) {
      return (
        <div className="stack-lg">
          <PageHead title="Entry not found" />
          <Empty quote="This entry may have been deleted.">
            <Link to="/people">Back to people</Link>
          </Empty>
        </div>
      );
    }
    return <LogForm key={id} init={() => existing} editing />;
  }

  if (!vault.people.length) {
    return (
      <div className="stack-lg">
        <PageHead title="Log an interaction" />
        <Empty quote="Interactions are recorded about someone.">
          <Link className="btn" to="/people/new">
            Add a person first
          </Link>
        </Empty>
      </div>
    );
  }

  const personParam = params.get('person');
  const typeParam = params.get('type');
  const personId = personParam && vault.people.some((p) => p.id === personParam) ? personParam : '';
  const type: InteractionTypeId = isTypeId(typeParam) ? typeParam : 'met_in_person';
  const relatesTo = params.get('relatesTo') ?? undefined;

  return (
    <LogForm
      key={params.toString()}
      init={() => newInteraction({ personId, type, date: asOf, ...(relatesTo ? { relatesTo } : {}) })}
      editing={false}
    />
  );
}
