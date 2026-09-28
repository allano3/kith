import { Fragment, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { characterize } from '../ai/analyst';
import { newInteraction } from '../domain/factory';
import {
  CATEGORY,
  CIRCLE,
  CONCERN_TAG,
  DATING_STATUS_LABEL,
  DIMENSIONS,
  DOMAIN_TRUST_SELF_LABEL,
  GREEN_FLAG,
  GROUP_LABEL,
  INTERACTION_TYPE,
  MOOD_LABEL,
  OUTCOME_LABEL,
  REQUEST_KIND_LABEL,
  TRUST_DOMAIN_LABEL,
  VALUE_STANCE_LABEL,
  type InteractionGroup,
} from '../domain/taxonomy';
import type { Actor, AdviceOutcome, DatingStatus, DomainTrustSelf, Interaction, Person } from '../domain/types';
import {
  RESPONSE_TIME_NOTE,
  evaluateAdvice,
  pauseAndReflect,
  type Assessment,
  type Commitment,
  type DatingAssessment,
  type DomainTrust,
  type PatternKind,
} from '../engine';
import type { DomainEvidence } from '../engine/assess';
import { evidenceFor } from '../engine/evidence';
import { PARAMS } from '../engine/params';
import { daysBetween, formatDate, formatMonth, humanSpan, parseSince, plural, times } from '../engine/time';
import { useVault } from '../store/VaultContext';
import { AnswerView } from '../ui/Answer';
import {
  Avatar,
  Chip,
  Choices,
  CircleChip,
  DimensionRow,
  Empty,
  PATTERN_KIND_LABEL,
  PageHead,
  PatternView,
  Section,
  TREND_LABEL,
  TREND_TONE,
  optionsOf,
  type Tone,
} from '../ui/kit';
import { AdviceEvaluationView, PauseReflectView } from './PauseReflectView';
import './PersonProfile.css';

/** Gaps between contacts longer than this are shown as quiet periods in the timeline. */
const QUIET_DAYS = 90;

const PATTERN_GROUPS: { kind: PatternKind; title: string }[] = [
  { kind: 'strength', title: 'Strengths' },
  { kind: 'concern', title: PATTERN_KIND_LABEL.concern },
  { kind: 'change', title: PATTERN_KIND_LABEL.change },
  { kind: 'context', title: PATTERN_KIND_LABEL.context },
];

const EVIDENCE: Record<DomainEvidence, { label: string; tone: Tone }> = {
  strong: { label: 'Strong track record', tone: 'positive' },
  some: { label: 'Some positive evidence', tone: 'positive' },
  mixed: { label: 'Mixed outcomes', tone: 'neutral' },
  concern: { label: 'Outcomes worth noting', tone: 'concern' },
  limited: { label: 'Limited evidence', tone: 'neutral' },
};

const SIGNAL_TONE: Record<DatingAssessment['signals'][number]['tone'], Tone> = {
  positive: 'positive',
  neutral: 'neutral',
  uncertain: 'concern',
};

const WHO_ASKED: { value: Actor; label: string }[] = [
  { value: 'them', label: 'They asked' },
  { value: 'me', label: 'I asked' },
];

/** Whether an entry reads as positive, worth noting, or neutral — from the same evidence the engine uses. */
function natureTone(i: Interaction): Tone {
  const sum = evidenceFor(i).reduce((a, e) => a + e.weight, 0);
  return sum > 0.25 ? 'positive' : sum < -0.25 ? 'concern' : 'neutral';
}

function sinceLabel(since: string | undefined, firstDate: string | undefined): string | null {
  const parsed = parseSince(since);
  if (since && parsed) {
    const s = since.trim();
    return s.length === 4 ? s : s.length === 7 ? formatMonth(parsed) : formatDate(parsed);
  }
  return firstDate ? `${formatMonth(firstDate)} (first entry)` : null;
}

function ProfileHeader({ person, a }: { person: Person; a: Assessment }) {
  const [primary, ...others] = person.categories;
  const since = sinceLabel(person.since, a.firstDate);
  const days = a.daysSinceMeaningful;
  return (
    <header className="profile-head">
      <Avatar name={person.name} size="lg" />
      <div className="stack profile-head-main" style={{ gap: 10 }}>
        <div className="row">
          <h1>{person.name}</h1>
          {person.archived && <Chip>Archived</Chip>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {primary && <Chip>{CATEGORY[primary].label}</Chip>}
          {others.map((c) => (
            <span key={c} className="chip chip-outline">
              {CATEGORY[c].label}
            </span>
          ))}
          <CircleChip circle={person.circle} />
        </div>
        {person.contexts.length > 0 && <p className="muted">{person.contexts.join(' · ')}</p>}
        <dl className="profile-facts">
          <div>
            <dt>Relationship since</dt>
            <dd>{since ?? 'Not recorded'}</dd>
          </div>
          <div>
            <dt>Last meaningful interaction</dt>
            <dd>
              {a.lastMeaningful && days !== null
                ? `${formatDate(a.lastMeaningful.date)} · ${days === 0 ? 'today' : `${humanSpan(days)} ago`}`
                : 'None recorded yet'}
            </dd>
          </div>
          <div>
            <dt>Current trend</dt>
            <dd className="stack" style={{ gap: 4 }}>
              <span>
                <Chip tone={TREND_TONE[a.trend]} dot>
                  {TREND_LABEL[a.trend]}
                </Chip>
              </span>
              <span className="faint">{a.trendReason}</span>
            </dd>
          </div>
        </dl>
      </div>
      <div className="row">
        <Link className="btn" to={`/log?person=${person.id}`}>
          Log interaction
        </Link>
        <Link className="btn btn-ghost" to={`/people/${person.id}/edit`}>
          Edit
        </Link>
      </div>
    </header>
  );
}

function CircleSection({ person, a }: { person: Person; a: Assessment }) {
  const { savePerson, asOf } = useVault();
  const suggested = a.suggestedCircle;
  const gap = a.expectationGap === 'exceeds' || a.expectationGap === 'below';
  const reviewedOn = person.lastReviewed && daysBetween(person.lastReviewed, asOf) < PARAMS.investmentCheckDays ? person.lastReviewed : null;
  const category = a.suggestedCategory;
  return (
    <Section title="Circle & investment" hint="The evidence suggests; you decide">
      <div className="stack">
        <div className="grid grid-2">
          <div className="stack" style={{ gap: 6 }}>
            <span className="profile-label">Your circle</span>
            <span>
              <CircleChip circle={person.circle} />
            </span>
            <p className="faint">{person.circle ? CIRCLE[person.circle].description : 'You have not placed them in a circle yet.'}</p>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="profile-label">What the evidence currently supports</span>
            <span>{suggested ? <CircleChip circle={suggested} /> : <span className="muted">No suggestion yet</span>}</span>
            <ul className="profile-list">
              {a.circleReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {gap && suggested && !reviewedOn && (
          <div className="callout tone-change stack">
            <p className="serif" style={{ fontSize: 17 }}>
              Does your current level of emotional investment match the evidence from the relationship?
            </p>
            <p className="muted">
              {a.expectationGap === 'exceeds'
                ? `Your expectations may currently exceed demonstrated reciprocity.${suggested === 5 ? ' Consider maintaining stronger boundaries until additional trust is established.' : ''}`
                : `${person.name} has shown up more consistently than the circle you placed them in suggests. It may be worth investing a little more intentionally.`}
            </p>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => savePerson({ ...person, circle: suggested, lastReviewed: asOf })}>
                Move to suggested circle
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => savePerson({ ...person, lastReviewed: asOf })}>
                Keep as is
              </button>
            </div>
          </div>
        )}
        {gap && reviewedOn && (
          <p className="faint">
            You reviewed this on {formatDate(reviewedOn)} and kept your own placement. The question will come back in a while, in case things change.
          </p>
        )}

        {person.circle === null && suggested && (
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => savePerson({ ...person, circle: suggested, lastReviewed: asOf })}>
              Place in {CIRCLE[suggested].name}
            </button>
          </div>
        )}

        {category && person.categories[0] !== category && (
          <div className="row-between profile-suggest">
            <p>
              <span className="muted">The pattern so far resembles </span>
              <strong>{CATEGORY[category].label}</strong>
              <span className="faint"> — {CATEGORY[category].description}</span>
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => savePerson({ ...person, categories: [category, ...person.categories.filter((c) => c !== category)] })}
            >
              {person.categories.includes(category) ? 'Make this the primary category' : 'Use as primary category'}
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}

function StrengthsAndFlags({ a }: { a: Assessment }) {
  return (
    <div className="grid grid-2">
      <Section title="Strengths" hint="Where the evidence is clearly positive">
        {a.strengths.length ? (
          <ul className="profile-list profile-list-lg">
            {a.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="faint">No clear strengths yet. Often that simply means little has been recorded.</p>
        )}
      </Section>
      <Section title="Green flags" hint="What they did well">
        {a.greenFlags.length ? (
          <div className="stack" style={{ gap: 0 }}>
            {a.greenFlags.map((f) => (
              <div key={f.id} className="flag-row">
                <Chip tone="positive" dot>
                  {f.label}
                </Chip>
                <span className="faint">
                  {times(f.count)} · last {formatDate(f.lastDate)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="faint">No green flags recorded yet. Good moments are evidence too — log them when you notice them.</p>
        )}
      </Section>
    </div>
  );
}

function PatternsSection({ a }: { a: Assessment }) {
  const groups = PATTERN_GROUPS.map((g) => ({ ...g, items: a.patterns.filter((p) => p.kind === g.kind) })).filter((g) => g.items.length);
  return (
    <Section title="Patterns" hint="What was observed, then what it might mean">
      {groups.length ? (
        groups.map((g) => (
          <div key={g.kind} className="pattern-group">
            <h3>{g.title}</h3>
            {g.items.map((p) => (
              <PatternView key={p.id} pattern={p} />
            ))}
          </div>
        ))
      ) : (
        <p className="faint">No patterns yet. Patterns appear as evidence accumulates over time — one moment is not a pattern.</p>
      )}
    </Section>
  );
}

function DimensionsSection({ person, a }: { person: Person; a: Assessment }) {
  const ordered = [...DIMENSIONS.filter((d) => d.id !== 'availability'), ...DIMENSIONS.filter((d) => d.id === 'availability')];
  return (
    <Section title="Dimensions" hint="Qualitative, with how much evidence supports each">
      <div>
        {ordered.map((d) => (
          <DimensionRow key={d.id} result={a.dimensions[d.id]} />
        ))}
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>
        Availability reflects capacity — time, energy, circumstances — not how much someone cares.
        {person.capacityNote && ` Context you noted: ${person.capacityNote}.`}
      </p>
    </Section>
  );
}

function DomainRow({ person, d }: { person: Person; d: DomainTrust }) {
  const { savePerson } = useVault();
  const [note, setNote] = useState(d.userNote ?? '');
  const evidence = EVIDENCE[d.evidence];
  const counts = [
    d.positive && `${d.positive} positive`,
    d.negative && `${d.negative} negative`,
    d.pending && `${d.pending} pending`,
  ].filter(Boolean);
  const save = (level: DomainTrustSelf, text: string) => {
    const trimmed = text.trim();
    const next = { ...person.domainTrust };
    if (level === 'unassessed' && !trimmed) delete next[d.domain];
    else next[d.domain] = trimmed ? { level, note: trimmed } : { level };
    savePerson({ ...person, domainTrust: next });
  };
  return (
    <tr>
      <td>{d.label}</td>
      <td>
        <div className="stack" style={{ gap: 4 }}>
          <span>
            <Chip tone={evidence.tone} dot>
              {evidence.label}
            </Chip>
          </span>
          <span className="faint" style={{ fontSize: 12.5 }}>
            {counts.length ? counts.join(' · ') : 'No outcomes recorded'}
          </span>
        </div>
      </td>
      <td>
        <select
          aria-label={`Your own read of ${d.label.toLowerCase()}`}
          value={d.userLevel}
          onChange={(e) => save(e.target.value as DomainTrustSelf, note)}
        >
          {optionsOf(DOMAIN_TRUST_SELF_LABEL).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="text"
          aria-label={`Note on ${d.label.toLowerCase()}`}
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() !== (d.userNote ?? '') && save(d.userLevel, note)}
        />
      </td>
    </tr>
  );
}

function DomainsSection({ person, a, items }: { person: Person; a: Assessment; items: Interaction[] }) {
  const [showAll, setShowAll] = useState(false);
  const involved = new Set(items.map((i) => i.trustDomain));
  const relevant = a.domains.filter(
    (d) => d.positive + d.negative + d.pending > 0 || involved.has(d.domain) || d.userLevel !== 'unassessed' || d.userNote,
  );
  const rows = showAll ? a.domains : relevant;
  return (
    <Section title="Trust by area" hint="Trust is domain-specific: good company is not the same as good financial advice">
      <div className="stack">
        {a.domainSummary && <p className="serif">{a.domainSummary}</p>}
        {a.integrityConcern && (
          <div className="callout tone-concern">
            <h3>Integrity applies across areas</h3>
            <p style={{ marginTop: 6 }}>
              An earlier breach of confidence has not yet been repaired. Expertise is specific to an area, but integrity is not — it is reasonable to let this inform trust in every
              area until repair is demonstrated.
            </p>
          </div>
        )}
        {rows.length ? (
          <div className="profile-table-wrap">
            <table className="plain">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Evidence</th>
                  <th>Your own read</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <DomainRow key={d.domain} person={person} d={d} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="faint">No area-specific evidence yet. Advice, help and kept confidences build this picture over time.</p>
        )}
        {relevant.length < a.domains.length && (
          <div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show only areas with evidence' : 'Show all areas'}
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}

function CommitmentRow({ person, c }: { person: Person; c: Commitment }) {
  const { saveInteraction, asOf } = useVault();
  const [mode, setMode] = useState<'none' | 'they_cancelled' | 'reschedule'>('none');
  const [newDate, setNewDate] = useState('');
  const [whoAsked, setWhoAsked] = useState<Actor>('them');
  const def = INTERACTION_TYPE[c.item.type];
  const resolve = (fields: Pick<Interaction, 'type' | 'actor'> & Partial<Interaction>) => {
    saveInteraction(newInteraction({ personId: person.id, date: asOf, relatesTo: c.item.id, ...fields }));
    setMode('none');
  };
  const promiser: Actor = c.owner === 'me' ? 'me' : 'them';
  return (
    <div className="commit-row stack" style={{ gap: 8 }}>
      <div className="row-between">
        <div className="stack" style={{ gap: 2 }}>
          <div className="row" style={{ gap: 8 }}>
            <strong>{c.item.note?.trim() || def.label}</strong>
            {c.overdue && <Chip tone="change">Past its date</Chip>}
          </div>
          <span className="faint" style={{ fontSize: 13 }}>
            {def.actors[c.owner] ?? def.label} · {formatDate(c.item.date)}
            {c.dueDate && ` · ${c.rescheduledBy.length ? 'moved to' : 'due'} ${formatDate(c.dueDate)}`}
          </span>
        </div>
        <Link className="faint" style={{ fontSize: 13 }} to={`/log/${c.item.id}`}>
          Edit
        </Link>
      </div>
      {mode === 'none' && (
        <div className="row" style={{ gap: 6 }}>
          {c.kind === 'promise' ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve({ type: 'promise_kept', actor: promiser })}>
                Kept
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve({ type: 'promise_broken', actor: promiser })}>
                Not kept
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve({ type: 'met_in_person', actor: 'both' })}>
                Happened
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('they_cancelled')}>
                They cancelled
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve({ type: 'cancelled_plans', actor: 'me' })}>
                I cancelled
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('reschedule')}>
                Rescheduled
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            title="No longer relevant. It stops counting as open, without counting against anyone."
            onClick={() => saveInteraction({ ...c.item, released: true })}
          >
            Release
          </button>
        </div>
      )}
      {mode === 'they_cancelled' && (
        <div className="row" style={{ gap: 6 }}>
          <span className="muted">Did they propose another time?</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve({ type: 'cancelled_plans', actor: 'them', rescheduleOffered: true })}>
            Yes
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve({ type: 'cancelled_plans', actor: 'them', rescheduleOffered: false })}>
            No
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMode('none')}>
            Back
          </button>
        </div>
      )}
      {mode === 'reschedule' && (
        <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <label className="field">
            New date
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </label>
          <Choices options={WHO_ASKED} value={whoAsked} onChange={(v) => v && setWhoAsked(v)} />
          <button
            type="button"
            className="btn btn-sm"
            disabled={!newDate}
            onClick={() => resolve({ type: 'rescheduled_plans', actor: whoAsked, dueDate: newDate })}
          >
            Save
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMode('none')}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}

function CommitmentsSection({ person, a }: { person: Person; a: Assessment }) {
  const sorted = [...a.openCommitments].sort((x, y) => (x.dueDate ?? x.item.date).localeCompare(y.dueDate ?? y.item.date));
  return (
    <Section title="Open commitments" hint="Theirs and yours. Resolutions appear in the timeline">
      {sorted.length ? (
        <div>
          {sorted.map((c) => (
            <CommitmentRow key={c.item.id} person={person} c={c} />
          ))}
        </div>
      ) : (
        <p className="faint">Nothing open. Promises and plans you log stay here until they are resolved.</p>
      )}
    </Section>
  );
}

function RequestItem({ person, a, i }: { person: Person; a: Assessment; i: Interaction }) {
  const { vault, saveInteraction } = useVault();
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const open = i.type === 'request_made' && i.decision?.status === 'open';
  const reflection = useMemo(() => (open ? pauseAndReflect(person, vault.interactions, i) : null), [open, person, vault.interactions, i]);
  const decide = () => {
    const note = decisionNote.trim();
    saveInteraction({ ...i, decision: note ? { status: 'decided', note } : { status: 'decided' } });
  };
  return (
    <div className="commit-row stack">
      <div className="row-between">
        <div className="row" style={{ gap: 8 }}>
          <strong>{i.type === 'request_made' ? (i.requestKind ? REQUEST_KIND_LABEL[i.requestKind] : 'Request') : 'Advice'}</strong>
          {i.trustDomain && <span className="chip chip-outline">{TRUST_DOMAIN_LABEL[i.trustDomain]}</span>}
          {open && <Chip tone="change">Decision open</Chip>}
          {i.decision?.status === 'decided' && <Chip>Decided</Chip>}
        </div>
        <span className="row faint" style={{ fontSize: 13 }}>
          {formatDate(i.date)} · <Link to={`/log/${i.id}`}>Edit</Link>
        </span>
      </div>
      {i.note && <p>{i.note}</p>}
      {i.decision?.status === 'decided' && i.decision.note && <p className="muted">Decision: {i.decision.note}</p>}
      <label className="field profile-outcome">
        How did it turn out?
        <select value={i.outcome ?? ''} onChange={(e) => saveInteraction({ ...i, outcome: (e.target.value || undefined) as AdviceOutcome | undefined })}>
          <option value="">Not recorded</option>
          {optionsOf(OUTCOME_LABEL).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {i.type === 'advice_received' && (
        <div className="stack">
          <div>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showEvaluation} onClick={() => setShowEvaluation((v) => !v)}>
              How seriously should I take this?
            </button>
          </div>
          {showEvaluation && <AdviceEvaluationView evaluation={evaluateAdvice(a, i)} />}
        </div>
      )}
      {reflection && (
        <PauseReflectView reflection={reflection}>
          <input
            type="text"
            aria-label="Decision note (optional)"
            placeholder="What did you decide? (optional)"
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button type="button" className="btn btn-sm" onClick={decide}>
            Mark as decided
          </button>
        </PauseReflectView>
      )}
    </div>
  );
}

function RequestsSection({ person, a, items }: { person: Person; a: Assessment; items: Interaction[] }) {
  const list = items.filter((i) => i.type === 'request_made' || i.type === 'advice_received').sort((x, y) => y.date.localeCompare(x.date));
  return (
    <Section title="Requests & advice" hint="Evaluate on the merits and the track record, not friendship status">
      {list.length ? (
        <div>
          {list.map((i) => (
            <RequestItem key={i.id} person={person} a={a} i={i} />
          ))}
        </div>
      ) : (
        <p className="faint">No requests or advice recorded.</p>
      )}
    </Section>
  );
}

function DatingSection({ person, dating }: { person: Person; dating: DatingAssessment }) {
  const { savePerson } = useVault();
  return (
    <Section title="Mutual interest" hint="Describes behavior, never their feelings">
      <div className="stack">
        <div className="row">
          <span className="profile-label">Suggested reading</span>
          <Chip tone="change">{DATING_STATUS_LABEL[dating.status]}</Chip>
        </div>
        <p className="muted">{dating.statusReason}</p>
        {dating.signals.length > 0 && (
          <div className="stack" style={{ gap: 0 }}>
            {dating.signals.map((s) => (
              <div key={s.label} className="flag-row">
                <Chip tone={SIGNAL_TONE[s.tone]} dot>
                  {s.label}
                </Chip>
                <span className="muted" style={{ textAlign: 'right' }}>
                  {s.observation}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="faint" style={{ fontSize: 13 }}>
          {RESPONSE_TIME_NOTE}
        </p>
        <label className="field profile-outcome">
          Your own read <span className="field-hint">Kept alongside the suggestion, never replaced by it.</span>
          <select
            value={person.datingStatus ?? ''}
            onChange={(e) => savePerson({ ...person, datingStatus: (e.target.value || undefined) as DatingStatus | undefined })}
          >
            <option value="">No read of my own yet</option>
            {optionsOf(DATING_STATUS_LABEL).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Section>
  );
}

function TimelineItem({ i }: { i: Interaction }) {
  const def = INTERACTION_TYPE[i.type];
  const milestone = i.significance === 'milestone' || i.type === 'important_moment';
  const who = def.actors[i.actor] ?? (i.actor === 'unknown' ? 'Not sure who' : null);
  return (
    <div className={`tl-item tone-${natureTone(i)}${milestone ? ' milestone' : ''}`}>
      <div className="tl-date">{formatDate(i.date)}</div>
      <div className="row" style={{ gap: 8 }}>
        <Link to={`/log/${i.id}`} className="tl-title">
          {def.label}
        </Link>
        {who && <span className="muted">{who}</span>}
      </div>
      {i.note && <p className="tl-text">{i.note}</p>}
      {i.reflection && <p className="tl-text quote">{i.reflection}</p>}
      {(i.mood || i.costly || i.greenFlags?.length || i.concerns?.length || i.decision?.status === 'open') && (
        <div className="row tl-chips">
          {i.mood && <span className="chip chip-outline">Felt {MOOD_LABEL[i.mood].toLowerCase()}</span>}
          {i.costly && <Chip tone="positive">Cost them something</Chip>}
          {i.greenFlags?.map((f) => (
            <Chip key={f} tone="positive">
              {GREEN_FLAG[f].label}
            </Chip>
          ))}
          {i.concerns?.map((c) => (
            <Chip key={c} tone="concern">
              {CONCERN_TAG[c].label}
            </Chip>
          ))}
          {i.decision?.status === 'open' && <Chip tone="change">Decision open</Chip>}
        </div>
      )}
    </div>
  );
}

function TimelineSection({ items }: { items: Interaction[] }) {
  const { asOf } = useVault();
  const [newestFirst, setNewestFirst] = useState(true);
  const [group, setGroup] = useState<InteractionGroup | 'all'>('all');
  const asc = useMemo(() => [...items].sort((x, y) => x.date.localeCompare(y.date) || x.createdAt.localeCompare(y.createdAt)), [items]);

  // Quiet periods: gaps between consecutive contacts, keyed by the contact that ended them.
  const { quietBefore, currentQuiet } = useMemo(() => {
    const gaps = new Map<string, number>();
    let prev: string | undefined;
    for (const i of asc) {
      if (!INTERACTION_TYPE[i.type].contact) continue;
      if (prev && daysBetween(prev, i.date) > QUIET_DAYS) gaps.set(i.id, daysBetween(prev, i.date));
      prev = i.date;
    }
    const sinceLast = prev ? daysBetween(prev, asOf) : 0;
    return { quietBefore: gaps, currentQuiet: sinceLast > QUIET_DAYS ? sinceLast : null };
  }, [asc, asOf]);

  const groups = (Object.keys(GROUP_LABEL) as InteractionGroup[]).filter((g) => asc.some((i) => INTERACTION_TYPE[i.type].group === g));
  const visible = group === 'all' ? asc : asc.filter((i) => INTERACTION_TYPE[i.type].group === group);
  const ordered = newestFirst ? [...visible].reverse() : visible;
  const showCurrentQuiet = currentQuiet !== null && (group === 'all' || group === 'contact');
  const currentQuietRow = showCurrentQuiet && (
    <div className="tl-quiet" key="current-quiet">
      No contact for {humanSpan(currentQuiet)} so far
    </div>
  );

  return (
    <Section
      title="Evidence timeline"
      hint={
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setNewestFirst((v) => !v)}>
          {newestFirst ? 'Newest first' : 'Oldest first'} ⇅
        </button>
      }
    >
      {asc.length ? (
        <div className="stack">
          <Choices
            options={[{ value: 'all' as const, label: 'All' }, ...groups.map((g) => ({ value: g, label: GROUP_LABEL[g] }))]}
            value={group}
            onChange={(v) => setGroup(v ?? 'all')}
          />
          <div className="timeline">
            {newestFirst && currentQuietRow}
            {ordered.map((i) => {
              const gap = quietBefore.get(i.id);
              const divider = gap !== undefined && <div className="tl-quiet">Quiet period of {humanSpan(gap)}</div>;
              return (
                <Fragment key={i.id}>
                  {!newestFirst && divider}
                  <TimelineItem i={i} />
                  {newestFirst && divider}
                </Fragment>
              );
            })}
            {!newestFirst && currentQuietRow}
          </div>
        </div>
      ) : (
        <Empty quote="Nothing recorded yet.">
          <p className="muted">Start with the last time you spent real time together.</p>
        </Empty>
      )}
    </Section>
  );
}

function MemoriesSection({ a }: { a: Assessment }) {
  return (
    <Section title="Important memories" hint="Turning points and moments worth keeping">
      {a.memories.length ? (
        <div className="stack">
          {a.memories.map((m) => (
            <div key={m.id} className="memory">
              <div className="tl-date">{formatDate(m.date)}</div>
              <p className="serif">{m.note?.trim() || INTERACTION_TYPE[m.type].label}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="faint">Entries you mark as a turning point or memory will gather here.</p>
      )}
    </Section>
  );
}

function ValuesSection({ person }: { person: Person }) {
  const { vault, savePerson } = useVault();
  const values = vault.settings.values;
  return (
    <Section title="Values" hint="Does this relationship reinforce what matters to you?">
      {values.length ? (
        <div className="stack" style={{ gap: 0 }}>
          {values.map((v) => (
            <div key={v} className="flag-row">
              <strong>{v}</strong>
              <Choices
                options={optionsOf(VALUE_STANCE_LABEL)}
                value={person.values[v]}
                allowNone
                onChange={(stance) => {
                  const next = { ...person.values };
                  if (stance) next[v] = stance;
                  else delete next[v];
                  savePerson({ ...person, values: next });
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          You have not listed personal values yet. <Link to="/reflect">Add the values you want your friendships to reinforce</Link>.
        </p>
      )}
    </Section>
  );
}

function NotesAndControls({ person, count }: { person: Person; count: number }) {
  const { savePerson, deletePerson } = useVault();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div className="grid grid-2">
      <Section title="Notes">
        <div className="stack">
          {person.notes ? <p className="profile-notes">{person.notes}</p> : <p className="faint">No notes.</p>}
          {person.capacityNote && (
            <p>
              <span className="profile-label">Availability context </span>
              <br />
              {person.capacityNote}
            </p>
          )}
          <div>
            <Link to={`/people/${person.id}/edit`}>Edit notes and details</Link>
          </div>
        </div>
      </Section>
      <Section title="Archive or delete" quiet>
        <div className="stack">
          <p className="muted" style={{ fontSize: 14 }}>
            {person.archived
              ? 'Archived: hidden from lists and prompts, with their history kept.'
              : 'Archiving hides someone from lists and prompts while keeping their history.'}
          </p>
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => savePerson({ ...person, archived: !person.archived })}>
              {person.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => dialog.current?.showModal()}>
              Delete permanently
            </button>
          </div>
        </div>
      </Section>
      <dialog ref={dialog} className="profile-dialog" aria-labelledby="delete-person-title">
        <div className="stack">
          <h3 id="delete-person-title">Delete {person.name} permanently?</h3>
          <p>
            This removes {person.name} and {count === 1 ? 'the one interaction' : count ? `all ${plural(count, 'interaction')}` : 'everything'} recorded about them from this device. It cannot be undone. If you only
            want them out of view, archive instead.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                dialog.current?.close();
                deletePerson(person.id);
                navigate('/people');
              }}
            >
              Delete permanently
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function Profile({ person, a }: { person: Person; a: Assessment }) {
  const { vault, asOf } = useVault();
  const items = useMemo(() => vault.interactions.filter((i) => i.personId === person.id), [vault.interactions, person.id]);
  const summary = useMemo(() => characterize(a, vault, asOf), [a, vault, asOf]);
  return (
    <div className="stack-lg">
      <ProfileHeader person={person} a={a} />
      <CircleSection person={person} a={a} />
      <Section title="Relationship summary" hint="Observation first, interpretation second">
        <AnswerView answer={summary} />
      </Section>
      <StrengthsAndFlags a={a} />
      <PatternsSection a={a} />
      <DimensionsSection person={person} a={a} />
      <DomainsSection person={person} a={a} items={items} />
      <CommitmentsSection person={person} a={a} />
      <RequestsSection person={person} a={a} items={items} />
      {a.dating && <DatingSection person={person} dating={a.dating} />}
      <TimelineSection items={items} />
      <MemoriesSection a={a} />
      <ValuesSection person={person} />
      <Section title="Questions to sit with" quiet>
        <ul className="profile-list">
          {a.reflectionPrompts.map((p) => (
            <li key={p} className="quote">
              {p}
            </li>
          ))}
        </ul>
      </Section>
      <NotesAndControls person={person} count={items.length} />
    </div>
  );
}

export function PersonProfile() {
  const { id } = useParams();
  const { vault, assessments } = useVault();
  const person = vault.people.find((p) => p.id === id);
  const assessment = id ? assessments.get(id) : undefined;
  if (!person || !assessment) {
    return (
      <div className="stack-lg">
        <PageHead title="Person not found" />
        <Empty quote="This person may have been deleted, or the link is out of date.">
          <Link to="/people">Back to people</Link>
        </Empty>
      </div>
    );
  }
  return <Profile key={person.id} person={person} a={assessment} />;
}
