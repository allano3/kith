import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY, CIRCLES } from '../domain/taxonomy';
import type { CircleId } from '../domain/types';
import { humanSpan } from '../engine/time';
import { useVault } from '../store/VaultContext';
import { Avatar, Chip, CircleChip, Empty, PageHead, TREND_LABEL, TREND_TONE } from '../ui/kit';

type CircleFilter = CircleId | 'none' | 'all';

export function PeopleList() {
  const { vault, assessments } = useVault();
  const [query, setQuery] = useState('');
  const [circle, setCircle] = useState<CircleFilter>('all');
  const [showArchived, setShowArchived] = useState(false);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vault.people
      .filter((p) => showArchived || !p.archived)
      .filter((p) => circle === 'all' || (circle === 'none' ? p.circle === null : p.circle === circle))
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.contexts.some((c) => c.toLowerCase().includes(q)) ||
          p.categories.some((c) => CATEGORY[c].label.toLowerCase().includes(q)),
      )
      .sort((a, b) => (a.circle ?? 9) - (b.circle ?? 9) || a.name.localeCompare(b.name));
  }, [vault.people, query, circle, showArchived]);

  const archivedCount = vault.people.filter((p) => p.archived).length;

  return (
    <div className="stack-lg">
      <PageHead
        title="People"
        lede="Not every relationship plays the same role. Place people where the evidence and your own judgment agree — you always decide."
        actions={
          <Link className="btn" to="/people/new">
            Add person
          </Link>
        }
      />

      {vault.people.length === 0 ? (
        <div className="card">
          <Empty quote="Start with the people who come to mind first.">
            <p className="muted">Add a person, then log a few meaningful moments. Patterns appear as evidence accumulates.</p>
            <p style={{ marginTop: 14 }}>
              <Link className="btn" to="/people/new">
                Add your first person
              </Link>
            </p>
          </Empty>
        </div>
      ) : (
        <div className="card stack">
          <div className="row">
            <input type="search" placeholder="Search by name, context or role" aria-label="Search people" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
            <select aria-label="Filter by circle" value={String(circle)} onChange={(e) => setCircle(e.target.value === 'all' || e.target.value === 'none' ? e.target.value : (Number(e.target.value) as CircleId))} style={{ maxWidth: 240 }}>
              <option value="all">All circles</option>
              {CIRCLES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="none">Not yet placed</option>
            </select>
            {archivedCount > 0 && (
              <label className="checkbox">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Show archived ({archivedCount})
              </label>
            )}
          </div>
          <div className="list">
            {people.map((p) => {
              const a = assessments.get(p.id);
              const concerns = a?.patterns.filter((x) => x.kind === 'concern').length ?? 0;
              const strengths = a?.strengths.length ?? 0;
              return (
                <Link key={p.id} to={`/people/${p.id}`} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Avatar name={p.name} />
                  <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <div className="row">
                      <strong>{p.name}</strong>
                      <span className="faint" style={{ fontSize: 13 }}>
                        {p.categories.map((c) => CATEGORY[c].label).join(' · ')}
                      </span>
                      {p.archived && <Chip>Archived</Chip>}
                    </div>
                    <span className="faint" style={{ fontSize: 13 }}>
                      {a?.daysSinceMeaningful !== null && a?.daysSinceMeaningful !== undefined
                        ? `Last meaningful contact ${a.daysSinceMeaningful === 0 ? 'today' : `${humanSpan(a.daysSinceMeaningful)} ago`}`
                        : 'No interactions recorded yet'}
                      {strengths > 0 && ` · ${strengths} ${strengths === 1 ? 'strength' : 'strengths'}`}
                      {concerns > 0 && ` · ${concerns} worth noting`}
                    </span>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    {a && a.trend !== 'unclear' && a.trend !== 'stable' && <Chip tone={TREND_TONE[a.trend]}>{TREND_LABEL[a.trend]}</Chip>}
                    <CircleChip circle={p.circle} />
                  </div>
                </Link>
              );
            })}
            {people.length === 0 && <p className="faint">No one matches these filters.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
