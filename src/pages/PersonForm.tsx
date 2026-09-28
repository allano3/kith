import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { newPerson } from '../domain/factory';
import { CATEGORIES, CATEGORY, CIRCLES } from '../domain/taxonomy';
import type { CategoryId, CircleId, Person } from '../domain/types';
import { useVault } from '../store/VaultContext';
import { Choices, MultiChoices, PageHead } from '../ui/kit';

const SINCE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export function PersonForm() {
  const { id } = useParams();
  const { vault, savePerson } = useVault();
  const navigate = useNavigate();
  const existing = id ? vault.people.find((p) => p.id === id) : undefined;
  const [draft, setDraft] = useState<Person>(() => existing ?? newPerson({ name: '' }));
  const [contexts, setContexts] = useState(draft.contexts.join(', '));
  const [circleTouched, setCircleTouched] = useState(!!existing);
  const [error, setError] = useState<string | null>(null);

  if (id && !existing) {
    return (
      <div className="card">
        <p>This person no longer exists.</p>
        <Link to="/people">Back to people</Link>
      </div>
    );
  }

  const set = <K extends keyof Person>(key: K, value: Person[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const primary = draft.categories[0];

  const setPrimary = (c: CategoryId | undefined) => {
    if (!c) return;
    setDraft((d) => ({ ...d, categories: [c, ...d.categories.filter((x) => x !== c)] }));
    // Pre-fill the circle from the category's typical circle until the user chooses one.
    if (!circleTouched) set('circle', CATEGORY[c].circle);
  };

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return setError('A name is required.');
    if (draft.since && !SINCE_PATTERN.test(draft.since.trim())) return setError('“Known since” should look like 2019, 2019-06 or 2019-06-15.');
    const person: Person = {
      ...draft,
      name,
      since: draft.since?.trim() || undefined,
      contexts: contexts
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      capacityNote: draft.capacityNote?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
    };
    savePerson(person);
    navigate(`/people/${person.id}`);
  };

  return (
    <form className="stack-lg" onSubmit={submit} style={{ maxWidth: 760 }}>
      <PageHead
        title={existing ? `Edit ${existing.name}` : 'Add a person'}
        lede="Categories and circles describe the role someone plays in your life right now. They can change, and they are yours to set."
      />

      <section className="card stack">
        <label className="field">
          Name
          <input type="text" value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus={!existing} placeholder="First name or nickname" />
        </label>
        <label className="field">
          Known since <span className="field-hint">Year, year-month, or a full date.</span>
          <input type="text" value={draft.since ?? ''} onChange={(e) => set('since', e.target.value)} placeholder="2019" style={{ maxWidth: 200 }} />
        </label>
        <label className="field">
          Where the relationship lives <span className="field-hint">Comma-separated: work, church, climbing gym…</span>
          <input type="text" value={contexts} onChange={(e) => setContexts(e.target.value)} />
        </label>
      </section>

      <section className="card stack">
        <h2>Relationship type</h2>
        <div className="field">
          Primary
          <Choices options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} value={primary} onChange={setPrimary} />
          {primary && <span className="field-hint">{CATEGORY[primary].description}</span>}
        </div>
        <div className="field">
          Other roles <span className="field-hint">Someone can be a close friend and a collaborator.</span>
          <MultiChoices
            options={CATEGORIES.filter((c) => c.id !== primary).map((c) => ({ value: c.id, label: c.label }))}
            value={draft.categories.slice(1)}
            onChange={(rest) => set('categories', primary ? [primary, ...rest] : rest)}
          />
        </div>
      </section>

      <section className="card stack">
        <h2>Circle</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          The level of trust, attention and expectation you currently extend. Kith will show what the evidence suggests alongside your choice.
        </p>
        <Choices
          options={CIRCLES.map((c) => ({ value: String(c.id), label: c.name }))}
          value={draft.circle ? String(draft.circle) : undefined}
          allowNone
          onChange={(v) => {
            setCircleTouched(true);
            set('circle', v ? (Number(v) as CircleId) : null);
          }}
        />
        {draft.circle && (
          <p className="field-hint">
            {CIRCLES[draft.circle - 1].size} — {CIRCLES[draft.circle - 1].description}
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>Context</h2>
        <label className="field">
          Their current capacity <span className="field-hint">Family, work, health, distance… Availability is kept separate from care.</span>
          <input type="text" value={draft.capacityNote ?? ''} onChange={(e) => set('capacityNote', e.target.value)} placeholder="e.g. new baby, caring for a parent" />
        </label>
        <label className="field">
          Notes
          <textarea value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="How you met, what matters to them, what you want to remember." />
        </label>
      </section>

      {error && (
        <p className="tone-concern" style={{ color: 'var(--tone)' }} role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn" type="submit">
          {existing ? 'Save changes' : 'Add person'}
        </button>
        <Link className="btn btn-ghost" to={existing ? `/people/${existing.id}` : '/people'}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
