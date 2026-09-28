import { ANSWER_SECTIONS, type AnalystAnswer } from '../ai/types';

/** Renders an analyst answer in the fixed four-section structure. Empty sections are omitted, except Unknowns. */
export function AnswerView({ answer }: { answer: AnalystAnswer }) {
  return (
    <div className="answer">
      {ANSWER_SECTIONS.map(({ key, label }) => {
        const items = answer[key];
        if (!items.length && key !== 'unknowns') return null;
        return (
          <div key={key}>
            <h4>{label}</h4>
            {items.length ? (
              <ul>
                {items.map((t, i) => (
                  <li key={i} className={key === 'interpretations' ? 'serif' : undefined}>
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="faint">Nothing specific recorded.</p>
            )}
          </div>
        );
      })}
      <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>
        {answer.source === 'local' ? 'Answered on this device from your records.' : 'Answered by your configured AI model from the evidence summary shown in Settings.'}
      </p>
    </div>
  );
}
