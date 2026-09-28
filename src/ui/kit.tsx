import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CIRCLE, DIMENSION } from '../domain/taxonomy';
import type { CircleId, Person } from '../domain/types';
import type { Confidence, DimensionResult, Level, Pattern, PatternKind, Trend } from '../engine';

/** Tones map evidence to calm colors. There is deliberately no "alarm" tone. */
export type Tone = 'positive' | 'concern' | 'change' | 'neutral';

export const LEVEL_TONE: Record<Level, Tone> = {
  strong: 'positive',
  solid: 'positive',
  mixed: 'neutral',
  concern: 'concern',
  insufficient: 'neutral',
};

export const LEVEL_LABEL: Record<Level, string> = {
  strong: 'Strong evidence',
  solid: 'Generally positive',
  mixed: 'Some uncertainty',
  concern: 'Worth noting',
  insufficient: 'Not enough evidence yet',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'limited evidence',
  moderate: 'moderate evidence',
  high: 'substantial evidence',
};

export const TREND_LABEL: Record<Trend, string> = {
  improving: 'Improving',
  stable: 'Stable',
  declining: 'Declining',
  unclear: 'Unclear',
};

export const TREND_TONE: Record<Trend, Tone> = { improving: 'positive', stable: 'neutral', declining: 'concern', unclear: 'neutral' };

export const PATTERN_TONE: Record<PatternKind, Tone> = { strength: 'positive', concern: 'concern', change: 'change', context: 'neutral' };

export const PATTERN_KIND_LABEL: Record<PatternKind, string> = {
  strength: 'Strength',
  concern: 'Worth noting',
  change: 'Change over time',
  context: 'Context',
};

export function Chip({ tone = 'neutral', children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`chip tone-${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function PageHead({ title, lede, actions }: { title: ReactNode; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Section({ title, hint, children, quiet = false }: { title: ReactNode; hint?: ReactNode; children: ReactNode; quiet?: boolean }) {
  return (
    <section className={`card ${quiet ? 'card-quiet' : ''}`}>
      <div className="section-title">
        <h2>{title}</h2>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ quote, children }: { quote?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {quote && <p className="quote">{quote}</p>}
      {children}
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return <span className={`avatar ${size === 'lg' ? 'avatar-lg' : ''}`}>{name.trim().charAt(0).toUpperCase() || '·'}</span>;
}

export function PersonLink({ person }: { person: Pick<Person, 'id' | 'name'> }) {
  return <Link to={`/people/${person.id}`}>{person.name}</Link>;
}

export function CircleChip({ circle, prefix }: { circle: CircleId | null; prefix?: string }) {
  if (!circle) return <span className="chip chip-outline">{prefix ? `${prefix}: ` : ''}No circle</span>;
  return (
    <span className="chip chip-outline" title={CIRCLE[circle].description}>
      {prefix ? `${prefix}: ` : ''}
      {CIRCLE[circle].name}
    </span>
  );
}

/** Observation first, interpretation second — the core display rule. Kind is conveyed by tone and the surrounding heading. */
export function PatternView({ pattern }: { pattern: Pattern }) {
  return (
    <div className={`pattern tone-${PATTERN_TONE[pattern.kind]}`}>
      <strong>{pattern.title}</strong>
      <p className="obs">{pattern.observation}</p>
      <p className="interp">{pattern.interpretation}</p>
      {pattern.suggestion && <p className="sugg">{pattern.suggestion}</p>}
    </div>
  );
}

export function DimensionRow({ result }: { result: DimensionResult }) {
  const def = DIMENSION[result.id];
  const tone = LEVEL_TONE[result.level];
  return (
    <div className="dim">
      <div>
        <div className="dim-name">{def.label}</div>
        <div className="dim-q">{def.question}</div>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <div className="row">
          <Chip tone={result.id === 'availability' && tone === 'concern' ? 'neutral' : tone} dot>
            {result.summary}
          </Chip>
          {result.level !== 'insufficient' && <span className="faint" style={{ fontSize: 12.5 }}>{CONFIDENCE_LABEL[result.confidence]}</span>}
          {result.change && <Chip tone={result.change === 'improved' ? 'positive' : 'change'}>{result.change === 'improved' ? 'Improving' : 'Recently lower'}</Chip>}
        </div>
        {result.observations.length > 0 && <div className="dim-obs">{result.observations.join(' ')}</div>}
      </div>
    </div>
  );
}

export function Choices<T extends string>({
  options,
  value,
  onChange,
  allowNone = false,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="choices" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`choice ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange(allowNone && value === o.value ? undefined : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MultiChoices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="choices">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            className={`choice ${on ? 'on' : ''}`}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Turns a label record into options for Choices. */
export function optionsOf<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
