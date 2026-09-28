import { useState, type ChangeEvent } from 'react';
import { Link, useHref } from 'react-router-dom';
import { CIRCLE, CIRCLES } from '../domain/taxonomy';
import type { CircleId, Person } from '../domain/types';
import type { Assessment } from '../engine';
import { PARAMS } from '../engine/params';
import { useVault } from '../store/VaultContext';
import { Avatar, CircleChip, PageHead, PersonLink, Section } from '../ui/kit';
import './Circles.css';

const SIZE = 640;
const C = SIZE / 2;
/** Outer radius of each ring band; circle 5 is a separate dashed band outside circle 4. */
const RING_OUTER: Record<CircleId, number> = { 1: 72, 2: 132, 3: 194, 4: 252, 5: 292 };
const RING_INNER: Record<CircleId, number> = { 1: 0, 2: 72, 3: 132, 4: 194, 5: 262 };
/** Where dots sit inside each band. */
const DOT_RADIUS: Record<CircleId, number> = { 1: 38, 2: 102, 3: 163, 4: 223, 5: 277 };
/** Small per-ring angular stagger so neighbouring rings don't line their dots up. */
const RING_STAGGER: Record<CircleId, number> = { 1: 0, 2: 0.14, 3: -0.1, 4: 0.07, 5: -0.05 };

interface Placement {
  person: Person;
  assessment: Assessment | undefined;
  circle: CircleId;
  x: number;
  y: number;
  angle: number;
}

function polar(r: number, angle: number): { x: number; y: number } {
  return { x: C + r * Math.cos(angle), y: C + r * Math.sin(angle) };
}

/**
 * Deterministic, evenly spread placement per ring (sorted by name). Slots are
 * offset by half a step from the top so dots stay clear of the ring names.
 */
function place(people: Person[], assessments: Map<string, Assessment>): Placement[] {
  const out: Placement[] = [];
  for (const { id } of CIRCLES) {
    const ring = people.filter((p) => p.circle === id).sort((a, b) => a.name.localeCompare(b.name));
    ring.forEach((person, i) => {
      const angle = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / ring.length + RING_STAGGER[id];
      out.push({ person, assessment: assessments.get(person.id), circle: id, angle, ...polar(DOT_RADIUS[id], angle) });
    });
  }
  return out;
}

function suggestionNote(person: Person, a: Assessment | undefined): string {
  const placed = person.circle ? `Placed in ${CIRCLE[person.circle].name.toLowerCase()}.` : 'Not yet placed.';
  if (!a?.suggestedCircle) return `${placed} Not enough evidence yet to suggest a circle.`;
  if (a.suggestedCircle === person.circle) return `${placed} This matches the current evidence.`;
  return `${placed} Evidence currently suggests ${CIRCLE[a.suggestedCircle].name.toLowerCase()}.`;
}

function PersonDot({ p }: { p: Placement }) {
  const href = useHref(`/people/${p.person.id}`);
  const suggested = p.assessment?.suggestedCircle;
  const moved = suggested && suggested !== p.circle ? polar(DOT_RADIUS[suggested], p.angle) : null;
  const note = `${p.person.name}. ${suggestionNote(p.person, p.assessment)}`;
  return (
    <a href={href} className="cr-person" aria-label={note}>
      <title>{note}</title>
      {moved && (
        <g className="cr-suggestion">
          <line x1={p.x} y1={p.y} x2={moved.x} y2={moved.y} />
          <circle cx={moved.x} cy={moved.y} r={6} />
        </g>
      )}
      <circle className="cr-dot" cx={p.x} cy={p.y} r={8} />
      <text className="cr-label" x={p.x} y={p.y + 22} textAnchor="middle">
        {p.person.name}
      </text>
    </a>
  );
}

function CirclesMap({ placements }: { placements: Placement[] }) {
  const inner = CIRCLES.filter((c) => c.id !== 5).reverse();
  return (
    <svg className="cr-map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Your relationship circles">
      <circle className="cr-ring-5" cx={C} cy={C} r={(RING_OUTER[5] + RING_INNER[5]) / 2} strokeWidth={RING_OUTER[5] - RING_INNER[5]}>
        <title>{`${CIRCLE[5].name} — ${CIRCLE[5].description}`}</title>
      </circle>
      <circle className="cr-ring-5-edge" cx={C} cy={C} r={RING_OUTER[5]} />
      <circle className="cr-ring-5-edge" cx={C} cy={C} r={RING_INNER[5]} />
      {inner.map((c) => (
        <circle key={c.id} className={`cr-ring cr-ring-${c.id}`} cx={C} cy={C} r={RING_OUTER[c.id]}>
          <title>{`${c.name} — ${c.description}`}</title>
        </circle>
      ))}
      {CIRCLES.map((c) => (
        <text key={c.id} className="cr-ring-name" x={C} y={c.id === 5 ? C - (RING_INNER[5] + RING_OUTER[5]) / 2 + 4 : C - RING_OUTER[c.id] + 16} textAnchor="middle">
          {c.name}
        </text>
      ))}
      {placements.map((p) => (
        <PersonDot key={p.person.id} p={p} />
      ))}
    </svg>
  );
}

function PlacementRow({ person, assessment }: { person: Person; assessment: Assessment | undefined }) {
  const { savePerson } = useVault();
  const [confirming, setConfirming] = useState(false);
  const suggested = assessment?.suggestedCircle ?? null;
  const setCircle = (circle: CircleId | null) => {
    savePerson({ ...person, circle, updatedAt: new Date().toISOString() });
    setConfirming(false);
  };
  const onSelect = (e: ChangeEvent<HTMLSelectElement>) => setCircle(CIRCLES.find((c) => String(c.id) === e.target.value)?.id ?? null);

  return (
    <tr>
      <td>
        <div className="row">
          <Avatar name={person.name} />
          <PersonLink person={person} />
        </div>
      </td>
      <td>
        <select aria-label={`Circle for ${person.name}`} value={person.circle ?? ''} onChange={onSelect}>
          <option value="">Not yet placed</option>
          {CIRCLES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="stack cr-evidence">
          {suggested ? <CircleChip circle={suggested} prefix="Evidence suggests" /> : <span className="faint">Not enough evidence yet</span>}
          {assessment && assessment.circleReasons.length > 0 && (
            <ul className="cr-reasons">
              {assessment.circleReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </td>
      <td className="cr-action">
        {suggested && suggested !== person.circle ? (
          confirming ? (
            <div className="stack cr-confirm">
              <span className="muted">Move {person.name} to {CIRCLE[suggested].name.toLowerCase()}?</span>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => setCircle(suggested)}>
                  Confirm
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirming(false)}>
                  Not now
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={`Use suggestion for ${person.name}: ${CIRCLE[suggested].name}`}
              onClick={() => setConfirming(true)}
            >
              Use suggestion
            </button>
          )
        ) : (
          <span className="faint">{suggested ? 'Matches evidence' : '—'}</span>
        )}
      </td>
    </tr>
  );
}

export function Circles() {
  const { vault, assessments } = useVault();
  const active = vault.people.filter((p) => !p.archived);
  const placements = place(active, assessments);
  const unplaced = active.filter((p) => !p.circle).sort((a, b) => a.name.localeCompare(b.name));
  const innerCount = active.filter((p) => p.circle === 1).length;
  const tableRows = [...active].sort((a, b) => (a.circle ?? 9) - (b.circle ?? 9) || a.name.localeCompare(b.name));

  return (
    <div className="stack-lg">
      <PageHead
        title="Circles"
        lede="Circles describe the level of trust, attention and expectation you currently extend — not how much someone is worth. The evidence suggests; you decide."
      />

      <div className="callout tone-change row-between">
        <p className="serif cr-question">Does your current level of emotional investment match the evidence from the relationship?</p>
        <Link className="btn btn-ghost btn-sm" to="/reflect#investment">
          Review investment
        </Link>
      </div>

      <div className="cr-layout">
        <section className="card cr-map-card">
          {active.length ? (
            <CirclesMap placements={placements} />
          ) : (
            <p className="faint">
              No one added yet. <Link to="/people/new">Add a person</Link> to start placing people in circles.
            </p>
          )}
          <div className="row cr-key">
            <span className="row">
              <svg width="16" height="16" aria-hidden="true">
                <circle className="cr-dot" cx="8" cy="8" r="6" />
              </svg>
              <span className="muted">Where you have placed someone</span>
            </span>
            <span className="row">
              <svg width="16" height="16" aria-hidden="true">
                <circle className="cr-suggestion-key" cx="8" cy="8" r="5" />
              </svg>
              <span className="muted">Where the evidence currently points</span>
            </span>
          </div>
        </section>

        <Section title="The rings">
          <ol className="cr-legend">
            {CIRCLES.map((c) => (
              <li key={c.id} className={`cr-legend-item cr-legend-${c.id}`}>
                <div className="row-between">
                  <strong>{c.name}</strong>
                  <span className="faint">{c.size}</span>
                </div>
                <p className="muted">{c.description}</p>
              </li>
            ))}
          </ol>
          <div className="stack cr-notes">
            <p className="faint">
              Rings 1–4 loosely follow research on social layers (Dunbar): most people have about {PARAMS.innerCircleSize} people in their
              closest support circle.
              {innerCount > PARAMS.innerCircleSoftMax &&
                ` You have placed ${innerCount} people there — worth a gentle look at whether each placement reflects demonstrated trust, though only you can decide.`}
            </p>
            <p className="faint">
              “Limited / caution” is Kith’s own category, not a Dunbar layer. It describes the expectations you extend for now, and moving
              anyone there — or out of it — is always your decision.
            </p>
          </div>
        </Section>
      </div>

      <Section title="By circle">
        <div className="grid grid-3 cr-lists">
          {CIRCLES.map((c) => {
            const members = placements.filter((p) => p.circle === c.id);
            return (
              <div key={c.id} className="stack cr-list">
                <h3>{c.name}</h3>
                {members.length ? (
                  <ul>
                    {members.map((p) => (
                      <li key={p.person.id}>
                        <PersonLink person={p.person} />
                        {p.assessment?.suggestedCircle && p.assessment.suggestedCircle !== c.id && (
                          <span className="faint"> · evidence suggests {CIRCLE[p.assessment.suggestedCircle].name.toLowerCase()}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="faint">No one here.</p>
                )}
              </div>
            );
          })}
          <div className="stack cr-list">
            <h3>Not yet placed</h3>
            {unplaced.length ? (
              <ul>
                {unplaced.map((p) => (
                  <li key={p.id}>
                    <PersonLink person={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="faint">Everyone has a circle.</p>
            )}
          </div>
        </div>
      </Section>

      {active.length > 0 && (
        <Section title="Placements and evidence" hint="Changes are saved immediately">
          <div className="cr-table-wrap">
            <table className="plain">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Your placement</th>
                  <th scope="col">What the evidence suggests</th>
                  <th scope="col">
                    <span className="cr-sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((p) => (
                  <PlacementRow key={p.id} person={p} assessment={assessments.get(p.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
