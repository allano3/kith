import { useEffect, useState, type ChangeEvent, type ReactNode, type SubmitEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CIRCLE, VALUE_PRESETS } from '../domain/taxonomy';
import type { Person } from '../domain/types';
import { buildDashboard, buildMirror, type Assessment, type Dashboard, type Mirror } from '../engine';
import type { ExpectationGap } from '../engine/assess';
import type { MirrorStat } from '../engine/dashboard';
import { daysBetween, formatDate, humanSpan } from '../engine/time';
import { useVault } from '../store/VaultContext';
import { Avatar, Chip, CircleChip, PageHead, PersonLink, Section, type Tone } from '../ui/kit';
import './Reflect.css';

const STAT_TONE: Record<MirrorStat['tone'], Tone> = { positive: 'positive', neutral: 'neutral', uncertain: 'change' };
const STAT_LABEL: Record<MirrorStat['tone'], string> = { positive: 'No concerns', neutral: 'Mixed', uncertain: 'Worth reflecting on' };

const GAP_TEXT: Record<ExpectationGap, string> = {
  exceeds: 'Your expectations may currently exceed demonstrated reciprocity.',
  below: 'Evidence suggests they have shown up more than your current placement reflects.',
  matches: 'Your placement matches the current evidence.',
  unknown: 'Not enough evidence yet.',
};
const GAP_TONE: Record<ExpectationGap, Tone> = { exceeds: 'concern', below: 'positive', matches: 'neutral', unknown: 'neutral' };
/** Placements most worth a second look come first. */
const GAP_ORDER: Record<ExpectationGap, number> = { exceeds: 0, below: 1, unknown: 2, matches: 3 };

/** Comma-separated profile links, or a quiet fallback when the evidence has nothing to say yet. */
function Names({ people, none }: { people: Person[]; none: string }) {
  if (!people.length) return <span className="faint rf-none">{none}</span>;
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ', '}
          <PersonLink person={p} />
        </span>
      ))}
    </>
  );
}

function MirrorSection({ mirror }: { mirror: Mirror }) {
  return (
    <Section title="The mirror">
      <p className="serif rf-lede">Am I also being the type of friend I expect others to be?</p>
      <p className="muted rf-explain">
        The same standards Kith applies to others, turned gently toward you. This is for noticing, not for judging yourself — everyone’s
        capacity changes with the season of life.
      </p>
      <div className="grid grid-2 rf-stats">
        {mirror.stats.map((s) => (
          <div key={s.question} className={`pattern tone-${STAT_TONE[s.tone]}`}>
            <div className="row">
              <strong>{s.question}</strong>
              <Chip tone={STAT_TONE[s.tone]}>{STAT_LABEL[s.tone]}</Chip>
            </div>
            <p className="obs">{s.observation}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-2 rf-mirror-lists">
        <div className="stack">
          <h3>People you value who may not have heard from you</h3>
          <p className="faint rf-small">Life gets full. A short message is often enough.</p>
          {mirror.neglected.length ? (
            <ul className="list rf-list">
              {mirror.neglected.map(({ person, days }) => (
                <li key={person.id} className="list-item">
                  <Avatar name={person.name} />
                  <div className="rf-body">
                    <PersonLink person={person} />
                    <span className="muted rf-small">
                      {days === null ? 'No outreach from you recorded yet.' : `Your last recorded outreach was ${humanSpan(days)} ago.`}
                    </span>
                  </div>
                  <Link className="btn btn-ghost btn-sm" to={`/log?person=${person.id}&type=initiated_contact`}>
                    Log a check-in
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="faint rf-none">The people closest to you have heard from you recently.</p>
          )}
        </div>
        <div className="stack">
          <h3>Where others may be carrying more of the effort</h3>
          <p className="faint rf-small">Worth appreciating — and perhaps reciprocating.</p>
          {mirror.expectingMore.length ? (
            <ul className="rf-bullets">
              {mirror.expectingMore.map((e) => (
                <li key={`${e.person.id}-${e.observation}`}>{e.observation}</li>
              ))}
            </ul>
          ) : (
            <p className="faint rf-none">Nothing stands out: effort looks broadly shared.</p>
          )}
        </div>
      </div>

      <div className="stack rf-prompts">
        {mirror.prompts.map((q) => (
          <p key={q} className="quote">
            {q}
          </p>
        ))}
      </div>
    </Section>
  );
}

function ValuesEditor() {
  const { vault, updateSettings } = useVault();
  const values = vault.settings.values;
  const [draft, setDraft] = useState('');
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());
  const add = (v: string) => {
    const value = v.trim();
    if (value && !has(value)) updateSettings({ values: [...values, value] });
  };
  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    add(draft);
    setDraft('');
  };
  const presets = VALUE_PRESETS.filter((p) => !has(p));

  return (
    <div className="stack">
      <div className="stack rf-values-current">
        <span className="rf-label">Your values</span>
        {values.length ? (
          <div className="choices">
            {values.map((v) => (
              <button
                key={v}
                type="button"
                className="choice on"
                aria-label={`Remove ${v}`}
                onClick={() => updateSettings({ values: values.filter((x) => x !== v) })}
              >
                {v} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="faint rf-none">No values chosen yet. Pick a few that describe who you are trying to become.</p>
        )}
      </div>
      {presets.length > 0 && (
        <div className="stack rf-values-add">
          <span className="rf-label">Add</span>
          <div className="choices">
            {presets.map((p) => (
              <button key={p} type="button" className="choice" aria-label={`Add ${p}`} onClick={() => add(p)}>
                + {p}
              </button>
            ))}
          </div>
        </div>
      )}
      <form className="row rf-values-form" onSubmit={submit}>
        <label className="field rf-custom">
          Your own words
          <input
            type="text"
            value={draft}
            placeholder="e.g. Patience"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-ghost" disabled={!draft.trim() || has(draft.trim())}>
          Add value
        </button>
      </form>
    </div>
  );
}

function ValuesSection({ active }: { active: Assessment[] }) {
  const { vault } = useVault();
  const values = vault.settings.values;
  const growth = active.filter((a) => a.dimensions.growth.level === 'strong' || a.dimensions.growth.level === 'solid');
  const tension = active
    .map((a) => ({ person: a.person, values: values.filter((v) => a.person.values[v] === 'tension') }))
    .filter((t) => t.values.length > 0);

  return (
    <Section title="Values">
      <p className="muted rf-explain">
        Friendships shape who we become. Naming what you value makes it easier to notice which relationships support it.
      </p>
      <ValuesEditor />

      <hr className="divider" />
      <p className="serif rf-lede">Which relationships consistently reinforce the person you are trying to become?</p>
      <p className="faint rf-small">
        You can note how someone relates to each value when editing their details in <Link to="/people">People</Link>.
      </p>
      {values.length > 0 && (
        <table className="plain rf-values-table">
          <tbody>
            {values.map((v) => (
              <tr key={v}>
                <th scope="row">{v}</th>
                <td>
                  <Names people={active.filter((a) => a.person.values[v] === 'reinforces').map((a) => a.person)} none="No one noted yet." />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="stack rf-growth">
        <h3>Interactions have moved you toward who you want to become</h3>
        {growth.length ? (
          <ul className="list rf-list">
            {growth.map((a) => (
              <li key={a.person.id} className="list-item">
                <Avatar name={a.person.name} />
                <div className="rf-body">
                  <PersonLink person={a.person} />
                  <span className="muted rf-small">{a.dimensions.growth.summary}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint rf-none">Record how interactions leave you (toward or away from who you want to become) and this will fill in.</p>
        )}
      </div>

      {tension.length > 0 && (
        <div className="callout tone-neutral stack rf-tension">
          <h3>Where a relationship and a value pull in different directions</h3>
          <p className="muted rf-small">
            Tension doesn’t mean ending anything. It can be worth noticing how much influence this relationship has on your choices, where
            you are genuinely compatible, which boundaries would help, and being intentional about the time you share.
          </p>
          <ul className="rf-bullets">
            {tension.map((t) => (
              <li key={t.person.id}>
                <PersonLink person={t.person} /> <span className="muted">— {t.values.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function InvestmentRow({ a }: { a: Assessment }) {
  const { asOf, savePerson } = useVault();
  const p = a.person;
  const suggested = a.suggestedCircle;
  const gap = a.expectationGap;
  const review = (circle = p.circle) => savePerson({ ...p, circle, lastReviewed: asOf, updatedAt: new Date().toISOString() });

  return (
    <li className="list-item rf-invest-row">
      <Avatar name={p.name} />
      <div className="rf-body">
        <div className="row">
          <PersonLink person={p} />
          <CircleChip circle={p.circle} prefix="Placed" />
          {suggested ? <CircleChip circle={suggested} prefix="Evidence" /> : <span className="chip chip-outline">Evidence: too early to say</span>}
        </div>
        <div className="row rf-small">
          <Chip tone={GAP_TONE[gap]} dot>
            {!p.circle && suggested ? 'Not yet placed.' : GAP_TEXT[gap]}
          </Chip>
          {p.lastReviewed && <span className="faint">{p.lastReviewed === asOf ? 'Reviewed today' : `Last reviewed ${formatDate(p.lastReviewed)}`}</span>}
        </div>
      </div>
      <div className="row rf-invest-actions">
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Keep ${p.name}'s current placement`} onClick={() => review()}>
          Keep
        </button>
        {suggested && suggested !== p.circle && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-label={`Move ${p.name} to ${CIRCLE[suggested].name}`}
            onClick={() => review(suggested)}
          >
            Move to suggested
          </button>
        )}
      </div>
    </li>
  );
}

function InvestmentSection({ active }: { active: Assessment[] }) {
  const { vault, asOf, updateSettings } = useVault();
  const last = vault.settings.lastInvestmentCheck;
  const rows = [...active].sort((x, y) => GAP_ORDER[x.expectationGap] - GAP_ORDER[y.expectationGap] || x.person.name.localeCompare(y.person.name));

  return (
    <section id="investment" className="card rf-anchor">
      <div className="section-title">
        <h2>Investment check</h2>
        <span className="hint">
          {last ? `Last completed ${formatDate(last)}${last === asOf ? ' (today)' : `, ${humanSpan(daysBetween(last, asOf))} ago`}` : 'Not completed yet'}
        </span>
      </div>
      <p className="serif rf-lede">Does your current level of emotional investment match the evidence from the relationship?</p>
      <p className="muted rf-explain">
        Compare where you have placed each person with what the relationship has shown so far. Keeping a placement is a perfectly good
        answer — the evidence suggests, you decide.
      </p>
      {rows.length ? (
        <ul className="list rf-list">
          {rows.map((a) => (
            <InvestmentRow key={a.person.id} a={a} />
          ))}
        </ul>
      ) : (
        <p className="faint rf-none">Add people to review how your investment matches the evidence.</p>
      )}
      <div className="row rf-complete">
        <button type="button" className="btn" disabled={last === asOf} onClick={() => updateSettings({ lastInvestmentCheck: asOf })}>
          I’ve completed this review
        </button>
        {last === asOf && <span className="muted">Recorded for today. Thank you for taking the time.</span>}
      </div>
    </section>
  );
}

function LongTermQuestions({ active, d, mirror }: { active: Assessment[]; d: Dashboard; mirror: Mirror }) {
  const positive = active.filter(
    (a) =>
      !a.patterns.some((p) => p.kind === 'concern') &&
      (a.patterns.some((p) => p.kind === 'strength') || a.dimensions.growth.level === 'strong' || a.dimensions.growth.level === 'solid'),
  );
  const credible = active
    .filter((a) => !a.integrityConcern)
    .map((a) => ({ person: a.person, domains: a.domains.filter((x) => x.evidence === 'strong' || (x.evidence === 'some' && x.positive >= 2)) }))
    .filter((x) => x.domains.length > 0);
  const strengthening = active.filter((a) => a.trend === 'improving').map((a) => a.person);
  const weakening = active.filter((a) => a.trend === 'declining').map((a) => a.person);

  const questions: { q: string; a: ReactNode }[] = [
    { q: 'Who can I genuinely rely on?', a: <Names people={d.closest.map((x) => x.person)} none="Not clear from the evidence yet — worth sitting with." /> },
    { q: 'Who am I neglecting?', a: <Names people={mirror.neglected.map((x) => x.person)} none="No one you value stands out as overlooked right now." /> },
    {
      q: 'Where am I expecting closeness the evidence doesn’t support?',
      a: <Names people={d.recalibrate.map((x) => x.person)} none="Your placements broadly match the evidence." />,
    },
    { q: 'Which people consistently contribute positively?', a: <Names people={positive.map((a) => a.person)} none="Keep noting green flags; they will show here." /> },
    {
      q: 'Where should I maintain stronger boundaries?',
      a: <Names people={d.boundaries.map((x) => x.person)} none="No repeated boundary or reliability patterns recorded." />,
    },
    {
      q: 'Whose advice has demonstrated credibility?',
      a: credible.length ? (
        <>
          {credible.map((c, i) => (
            <span key={c.person.id}>
              {i > 0 && '; '}
              <PersonLink person={c.person} /> <span className="muted">({c.domains.map((x) => x.label.toLowerCase()).join(', ')})</span>
            </span>
          ))}
        </>
      ) : (
        <span className="faint rf-none">Record advice outcomes over time and credibility will emerge per domain.</span>
      ),
    },
    {
      q: 'Which relationships are strengthening or weakening?',
      a:
        strengthening.length || weakening.length ? (
          <span className="stack rf-trends">
            <span>
              Strengthening: <Names people={strengthening} none="none clear" />
            </span>
            <span>
              Weakening: <Names people={weakening} none="none clear" />
            </span>
          </span>
        ) : (
          <span className="faint rf-none">No clear movement either way recently.</span>
        ),
    },
  ];

  return (
    <Section title="Questions to return to" quiet>
      <p className="muted rf-explain">Not a checklist. Brief answers from what you have recorded — the rest is yours to consider.</p>
      <dl className="rf-questions">
        {questions.map(({ q, a }) => (
          <div key={q}>
            <dt className="serif">{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function Reflect() {
  const { vault, asOf, assessments } = useVault();
  const { hash } = useLocation();
  const active = vault.people.filter((p) => !p.archived).flatMap((p) => assessments.get(p.id) ?? []);
  const mirror = buildMirror(vault.people, assessments, vault.interactions, asOf);
  const dashboard = buildDashboard(vault.people, assessments, vault.interactions, vault.settings, asOf);

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className="stack-lg">
      <PageHead
        title="Mirror & values"
        lede="Turning the same questions toward yourself, noticing which relationships support who you want to become, and checking that your investment matches the evidence."
      />
      <MirrorSection mirror={mirror} />
      <ValuesSection active={active} />
      <InvestmentSection active={active} />
      <LongTermQuestions active={active} d={dashboard} mirror={mirror} />
    </div>
  );
}
