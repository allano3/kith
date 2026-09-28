import { useState, type ReactNode } from 'react';
import type { AdviceEvaluation, PauseReflection } from '../engine';
import { AnswerView } from '../ui/Answer';

function Checklist({ items }: { items: string[] }) {
  const [ticked, setTicked] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
      {items.map((q, i) => (
        <li key={q}>
          <label className="checkbox">
            <input type="checkbox" checked={ticked.has(i)} onChange={() => toggle(i)} />
            <span className={ticked.has(i) ? 'faint' : undefined}>{q}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Facts({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h4>{title}</h4>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Pause & Reflect for requests and proposals. When the request differs from
 * the relationship's usual pattern (`triggered`), the full pause is shown;
 * otherwise a calm note with the questions tucked away. Ticked questions are
 * a thinking aid only and are never stored. `children` holds the actions.
 */
export function PauseReflectView({ reflection, children }: { reflection: PauseReflection; children?: ReactNode }) {
  if (!reflection.triggered) {
    return (
      <div className="callout tone-neutral stack">
        <p>{reflection.guidance}</p>
        <details>
          <summary>Questions worth considering</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <Facts title="Context worth remembering" items={reflection.context} />
            <Facts title="What differs from the usual pattern" items={reflection.differences} />
            <Checklist items={reflection.questions} />
          </div>
        </details>
        {children && <div className="row">{children}</div>}
      </div>
    );
  }
  return (
    <div className="callout tone-change stack">
      <div className="stack" style={{ gap: 4 }}>
        <h3>Pause &amp; reflect</h3>
        <p className="muted">
          There is no need to respond right away. This is not a judgement of the person — it is the context around this request, so you can decide with a clear head.
        </p>
      </div>
      <Facts title="Context worth remembering" items={reflection.context} />
      <Facts title="What differs from the usual pattern" items={reflection.differences} />
      <div className="stack" style={{ gap: 6 }}>
        <h4>Questions worth asking yourself</h4>
        <Checklist items={reflection.questions} />
      </div>
      <p className="serif">{reflection.guidance}</p>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/** "How seriously should I take this?" — the four-section evaluation plus guidance. */
export function AdviceEvaluationView({ evaluation }: { evaluation: AdviceEvaluation }) {
  return (
    <div className="stack">
      <AnswerView
        answer={{
          facts: evaluation.facts,
          patterns: evaluation.patterns,
          interpretations: evaluation.interpretations,
          unknowns: evaluation.unknowns,
          people: [],
          source: 'local',
        }}
      />
      <div className="callout tone-neutral">
        <p className="serif">{evaluation.guidance}</p>
      </div>
    </div>
  );
}
