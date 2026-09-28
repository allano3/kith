import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { INTERACTION_TYPE, REQUEST_KIND_LABEL } from '../domain/taxonomy';
import type { Person } from '../domain/types';
import { buildDashboard, type Assessment, type Commitment } from '../engine';
import { PARAMS } from '../engine/params';
import { formatDate, times } from '../engine/time';
import { useVault } from '../store/VaultContext';
import { Avatar, Chip, CircleChip, PageHead, PersonLink, Section } from '../ui/kit';
import './Dashboard.css';

/** Dimensions where a concern means "consistently shows up" would be misleading. */
const STEADY_DIMENSIONS = ['trust', 'reliability', 'safety', 'respect'] as const;
const SHOWING_UP_LIMIT = 4;

interface Row {
  person: Person;
  reason: ReactNode;
}

/** People whose recorded behavior repeatedly shows care, follow-through or presence. */
function showingUp(assessments: Assessment[]): Row[] {
  return assessments
    .filter((a) => !a.person.archived && !STEADY_DIMENSIONS.some((d) => a.dimensions[d].level === 'concern'))
    .map((a) => {
      const strengths = a.patterns.filter((p) => p.kind === 'strength');
      const repeated = a.greenFlags.filter((f) => f.count >= 2);
      const weight = strengths.length * 3 + repeated.reduce((sum, f) => sum + f.count, 0);
      const parts = [...strengths.map((p) => p.title), ...repeated.slice(0, 2).map((f) => `${f.label} (${times(f.count)})`)];
      return { a, weight, reason: parts.slice(0, 3).join(' · ') };
    })
    .filter((x) => x.weight > 0)
    .sort((x, y) => y.weight - x.weight)
    .slice(0, SHOWING_UP_LIMIT)
    .map(({ a, reason }) => ({ person: a.person, reason }));
}

function PersonRows({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="faint dash-none">{empty}</p>;
  return (
    <ul className="list dash-list">
      {rows.map(({ person, reason }) => (
        <li key={person.id} className="list-item">
          <Avatar name={person.name} />
          <div className="dash-body">
            <div className="row">
              <PersonLink person={person} />
              <CircleChip circle={person.circle} />
            </div>
            <div className="dash-reason">{reason}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Explain({ children }: { children: ReactNode }) {
  return <p className="muted dash-explain">{children}</p>;
}

function CommitmentRows({ rows, empty }: { rows: { person: Person; commitment: Commitment }[]; empty: string }) {
  if (!rows.length) return <p className="faint dash-none">{empty}</p>;
  return (
    <ul className="list dash-list">
      {rows.map(({ person, commitment: c }) => (
        <li key={c.item.id} className="list-item">
          <Avatar name={person.name} />
          <div className="dash-body">
            <div className="row">
              <strong>{c.item.note?.trim() || INTERACTION_TYPE[c.item.type].label}</strong>
              {c.overdue && <Chip tone="change">{c.dueDate ? 'Past the planned date' : 'Open for a while'}</Chip>}
            </div>
            <div className="dash-reason">
              <PersonLink person={person} /> · {c.kind === 'plans' ? 'Plans' : 'Promise'}{' '}
              {c.dueDate ? `for ${formatDate(c.dueDate)}` : `made ${formatDate(c.item.date)}`}
            </div>
          </div>
          <Link
            className="btn btn-ghost btn-sm"
            to={`/log?person=${person.id}&type=${c.kind === 'promise' ? 'promise_kept' : 'met_in_person'}&relatesTo=${c.item.id}`}
          >
            Log outcome
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Welcome() {
  return (
    <div className="stack-lg">
      <PageHead title="What is a friend?" lede="A private place to notice how your relationships actually work — over time, not in a single moment." />
      <section className="card dash-welcome">
        <div className="stack">
          <p className="serif dash-welcome-lede">
            Relationships differ in role, in season and in trust. Someone can be a wonderful companion for climbing and not the person you
            would ask about money — and that is fine.
          </p>
          <p className="muted">
            Kith helps you observe behavior, notice patterns across months rather than moments, and infer motives cautiously. It never labels
            people. It suggests; you decide.
          </p>
          <p className="muted">Everything stays encrypted on this device. There are no streaks, no scores and nothing to keep up with.</p>
        </div>
        <ol className="dash-steps">
          <li>
            <strong>Add someone who matters to you.</strong>
            <span className="muted">A name is enough; circles and roles can come later.</span>
          </li>
          <li>
            <strong>Log what happens, when it feels worth noting.</strong>
            <span className="muted">Who reached out, a kept promise, help given or received, plans that changed.</span>
          </li>
          <li>
            <strong>Let patterns emerge.</strong>
            <span className="muted">Observations are kept separate from interpretations, and green flags count as much as concerns.</span>
          </li>
        </ol>
        <div className="row">
          <Link className="btn" to="/people/new">
            Add a person
          </Link>
          <Link className="btn btn-ghost" to="/reflect">
            Start with your values
          </Link>
        </div>
      </section>
    </div>
  );
}

export function Dashboard() {
  const { vault, asOf, assessments } = useVault();
  const active = vault.people.filter((p) => !p.archived);
  if (!active.length) return <Welcome />;

  const d = buildDashboard(vault.people, assessments, vault.interactions, vault.settings, asOf);
  const steady = showingUp([...assessments.values()]);

  return (
    <div className="stack-lg">
      <PageHead
        title="Overview"
        lede={`How your relationships look from the evidence you have recorded, as of ${formatDate(asOf)}. Observations first; the decisions stay yours.`}
        actions={
          <Link className="btn" to="/log">
            Log interaction
          </Link>
        }
      />

      {d.investmentCheckDue && (
        <div className="callout tone-change row-between">
          <div className="stack dash-callout-text">
            <h3>Does your current level of emotional investment match the evidence?</h3>
            <p className="muted">A short, periodic review of where you have placed people and what the relationship has shown so far.</p>
          </div>
          <Link className="btn btn-ghost" to="/reflect#investment">
            Take a few minutes
          </Link>
        </div>
      )}

      <div className="grid grid-2">
        <Section title="Closest relationships">
          <Explain>Strongest demonstrated trust, reliability and mutual investment. How often you talk is not the measure.</Explain>
          <PersonRows rows={d.closest} empty="No relationship has enough evidence to stand out yet." />
        </Section>
        <Section title="Relationships improving">
          <Explain>People can change. These relationships show recent movement in a good direction.</Explain>
          <PersonRows
            rows={d.improving.map((x) => ({
              person: x.person,
              reason: (
                <>
                  <Chip tone="positive" dot>
                    {x.reason}
                  </Chip>{' '}
                  <span>{x.assessment.trendReason}</span>
                </>
              ),
            }))}
            empty="No clear upward change recorded recently."
          />
        </Section>
      </div>

      <div className="grid grid-2">
        <Section title="People who consistently show up">
          <Explain>Green flags matter as much as concerns: repeated care, follow-through and presence.</Explain>
          <PersonRows rows={steady} empty="Repeated green flags will appear here as you log them." />
        </Section>
        <Section title="Worth nurturing">
          <Explain>Healthy relationships that may simply be due some attention. Quiet seasons are normal.</Explain>
          <PersonRows rows={d.nurture} empty="Nothing here right now." />
        </Section>
      </div>

      <div className="grid grid-2">
        <Section title="Needing recalibration">
          <Explain>Your expectations may currently exceed demonstrated reciprocity. A prompt to reflect, not a verdict.</Explain>
          <PersonRows rows={d.recalibrate} empty="Your placements broadly match the evidence." />
        </Section>
        <Section title="Where boundaries may help">
          <Explain>Consider maintaining stronger boundaries until additional trust is established. Patterns, not single incidents.</Explain>
          <PersonRows
            rows={d.boundaries.map((x) => ({
              person: x.person,
              reason: (
                <Chip tone="concern" dot>
                  {x.reason}
                </Chip>
              ),
            }))}
            empty="No repeated boundary or reliability patterns recorded."
          />
        </Section>
      </div>

      <div className="grid grid-2">
        <Section title="Open decisions">
          <Explain>Requests or proposals you have not decided on. There is no rush — pause and reflect first.</Explain>
          {d.pendingDecisions.length ? (
            <ul className="list dash-list">
              {d.pendingDecisions.map(({ person, interaction }) => (
                <li key={interaction.id} className="list-item">
                  <Avatar name={person.name} />
                  <div className="dash-body">
                    <div className="row">
                      <PersonLink person={person} />
                      <span className="faint">{formatDate(interaction.date)}</span>
                    </div>
                    <div className="dash-reason">
                      {interaction.requestKind ? REQUEST_KIND_LABEL[interaction.requestKind] : INTERACTION_TYPE[interaction.type].label}
                      {interaction.note ? ` — ${interaction.note}` : ''}
                    </div>
                  </div>
                  <Link className="btn btn-ghost btn-sm" to={`/people/${person.id}`}>
                    Pause &amp; reflect
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="faint dash-none">No open decisions.</p>
          )}
        </Section>
        <Section title="Your open commitments">
          <Explain>The same standard you hope others keep. Releasing a commitment honestly is fine too.</Explain>
          <CommitmentRows rows={d.myCommitments} empty="Nothing open on your side." />
        </Section>
      </div>

      <Section title="Their commitments still open" quiet>
        <Explain>Past the planned date. One missed date is an observation, not a pattern — life happens.</Explain>
        <CommitmentRows rows={d.theirOverdue} empty="Nothing of theirs is past its date." />
      </Section>

      {d.innerCircleCount > PARAMS.innerCircleSoftMax && (
        <p className="callout tone-neutral">
          You have placed {d.innerCircleCount} people in your inner circle. Research on social layers suggests most people have around{' '}
          {PARAMS.innerCircleSize} in their closest support circle. This is only a reference point — your circles are yours to define.{' '}
          <Link to="/circles">See circles</Link>
        </p>
      )}
    </div>
  );
}
