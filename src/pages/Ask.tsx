import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import { answerLocally, exampleQuestions, findPeople } from '../ai/analyst';
import { askModel } from '../ai/llm';
import { buildEvidencePacket, pseudonymizeText, restoreNames } from '../ai/packet';
import type { AnalystAnswer } from '../ai/types';
import type { AiSettings } from '../domain/types';
import { useVault } from '../store/VaultContext';
import { AnswerView } from '../ui/Answer';
import { Chip, Choices, Empty, PageHead, PersonLink } from '../ui/kit';
import './Ask.css';

type Engine = 'local' | 'model';

interface Turn {
  id: number;
  question: string;
  engine: Engine;
  status: 'pending' | 'done' | 'error';
  answer?: AnalystAnswer;
  error?: string;
  /** Exactly what left the device, for model turns. */
  sent?: string;
}

interface PendingConsent {
  question: string;
  sentQuestion: string;
  packet: string;
  aliases: Map<string, string>;
}

/**
 * Consent is remembered for this browser session only, per destination and
 * privacy setting — changing what would be sent asks again.
 */
const consentedFor = new Set<string>();

function consentKey(ai: AiSettings): string {
  return [ai.provider, ai.baseUrl, ai.model, ai.pseudonymize, ai.includeNotes].join('|');
}

function destinationOf(ai: AiSettings): string {
  return ai.provider === 'anthropic' ? 'api.anthropic.com' : ai.baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function Ask() {
  const { vault, asOf, assessments } = useVault();
  const ai = vault.settings.ai;
  const modelOn = ai.provider !== 'off';
  const modelLabel = ai.model.trim() || (ai.provider === 'anthropic' ? 'Anthropic' : 'your model');

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [engine, setEngine] = useState<Engine>('local');
  const [consent, setConsent] = useState<PendingConsent | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const examples = useMemo(() => exampleQuestions(vault, assessments, asOf), [vault, assessments, asOf]);
  const busy = turns.some((t) => t.status === 'pending');
  const effectiveEngine: Engine = modelOn ? engine : 'local';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, consent]);

  const update = (id: number, patch: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const answerHere = (question: string) => {
    const id = nextId.current++;
    const answer = answerLocally(question, vault, assessments, asOf);
    setTurns((ts) => [...ts, { id, question, engine: 'local', status: 'done', answer }]);
  };

  const send = async (p: PendingConsent) => {
    const id = nextId.current++;
    const sent = `QUESTION: ${p.sentQuestion}\n\n${p.packet}`;
    setTurns((ts) => [...ts, { id, question: p.question, engine: 'model', status: 'pending', sent }]);
    try {
      const raw = await askModel(ai, p.sentQuestion, p.packet);
      const restore = (lines: string[]) => lines.map((l) => restoreNames(l, p.aliases));
      const answer: AnalystAnswer = {
        ...raw,
        facts: restore(raw.facts),
        patterns: restore(raw.patterns),
        interpretations: restore(raw.interpretations),
        unknowns: restore(raw.unknowns),
      };
      const text = [...answer.facts, ...answer.patterns, ...answer.interpretations, ...answer.unknowns].join('\n');
      answer.people = findPeople(text, vault.people).people.map((x) => x.name);
      update(id, { status: 'done', answer });
    } catch (e) {
      update(id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    setDraft('');
    if (effectiveEngine === 'local') return answerHere(question);
    const named = findPeople(question, vault.people).people;
    const packet = buildEvidencePacket(vault, assessments, asOf, {
      pseudonymize: ai.pseudonymize,
      includeNotes: ai.includeNotes,
      focusPersonIds: named.length ? named.map((p) => p.id) : undefined,
    });
    const pending: PendingConsent = {
      question,
      sentQuestion: ai.pseudonymize ? pseudonymizeText(question, packet.aliases) : question,
      packet: packet.text,
      aliases: packet.aliases,
    };
    if (consentedFor.has(consentKey(ai))) void send(pending);
    else setConsent(pending);
  };

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    ask(draft);
  };

  const approve = () => {
    if (!consent) return;
    consentedFor.add(consentKey(ai));
    setConsent(null);
    void send(consent);
  };

  return (
    <div className="stack-lg ask">
      <PageHead
        title="Reflect with AI"
        lede="Ask about your relationships. Answers separate what was recorded from what it might mean, and name what your records cannot tell. Chat history is kept in memory only — it is never saved and disappears when you leave this page."
      />

      <div className="chat" aria-live="polite">
        {turns.length === 0 && !consent && (
          <Empty quote="Observe behavior. Identify patterns. Infer motives cautiously.">
            <p className="muted">Pick a question below or ask your own.</p>
          </Empty>
        )}
        {turns.map((t) => (
          <TurnView key={t.id} turn={t} modelLabel={modelLabel} onLocal={() => answerHere(t.question)} />
        ))}
        {consent && (
          <ConsentPanel
            ai={ai}
            modelLabel={modelLabel}
            pending={consent}
            onApprove={approve}
            onLocal={() => {
              setConsent(null);
              answerHere(consent.question);
            }}
            onCancel={() => setConsent(null)}
          />
        )}
        <div ref={endRef} />
      </div>

      <form className="card stack" onSubmit={onSubmit}>
        {modelOn ? (
          <div className="row">
            <span className="faint ask-label">Answer with</span>
            <Choices
              options={[
                { value: 'local' as Engine, label: 'Answer on this device' },
                { value: 'model' as Engine, label: `Ask ${modelLabel}` },
              ]}
              value={engine}
              onChange={(v) => v && setEngine(v)}
            />
          </div>
        ) : (
          <p className="faint ask-note">
            Answers are computed on this device from your records; nothing is sent anywhere. You can optionally connect a language model in{' '}
            <Link to="/settings">Privacy &amp; settings</Link>.
          </p>
        )}
        {effectiveEngine === 'model' && (
          <p className="faint ask-note">
            Questions go to {destinationOf(ai)} with an evidence summary ({ai.pseudonymize ? 'names replaced with aliases' : 'real names'},{' '}
            {ai.includeNotes ? 'notes included' : 'notes withheld'}).
          </p>
        )}
        <div className="ask-input">
          <input aria-label="Your question" placeholder="Ask about a relationship…" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!!consent} />
          <button className="btn" type="submit" disabled={busy || !!consent || !draft.trim()}>
            Ask
          </button>
        </div>
        <div className="stack ask-examples">
          <span className="faint ask-label">Try asking</span>
          <div className="choices">
            {examples.map((q) => (
              <button key={q} type="button" className="choice" onClick={() => ask(q)} disabled={busy || !!consent}>
                {q}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}

function TurnView({ turn, modelLabel, onLocal }: { turn: Turn; modelLabel: string; onLocal: () => void }) {
  const { vault } = useVault();
  const linked = (turn.answer?.people ?? []).map((name) => vault.people.find((p) => p.name === name)).filter((p) => p !== undefined);
  return (
    <>
      <div className="bubble-user">{turn.question}</div>
      <div className="card ask-answer">
        {turn.status === 'pending' && (
          <p className="muted" role="status">
            Waiting for {modelLabel}…
          </p>
        )}
        {turn.status === 'error' && (
          <div className="callout tone-concern stack" role="alert">
            <h3>{modelLabel} could not answer</h3>
            <p>{turn.error}</p>
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onLocal}>
                Answer on this device instead
              </button>
            </div>
          </div>
        )}
        {turn.answer && <AnswerView answer={turn.answer} />}
        {linked.length > 0 && (
          <div className="row ask-people">
            <span className="faint">Drawn from</span>
            {linked.map((p) => (
              <Chip key={p.id}>
                <PersonLink person={p} />
              </Chip>
            ))}
          </div>
        )}
        {turn.sent && (
          <details className="ask-sent">
            <summary>What was sent</summary>
            <pre className="ask-packet">{turn.sent}</pre>
          </details>
        )}
      </div>
    </>
  );
}

function ConsentPanel({
  ai,
  modelLabel,
  pending,
  onApprove,
  onLocal,
  onCancel,
}: {
  ai: AiSettings;
  modelLabel: string;
  pending: PendingConsent;
  onApprove: () => void;
  onLocal: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="card stack" aria-labelledby="consent-title">
      <h2 id="consent-title">Before anything leaves this device</h2>
      <p className="muted">
        To answer, {modelLabel} at <strong>{destinationOf(ai)}</strong> would receive your question and the evidence summary below — exactly this text,
        nothing else. Kith asks once per session for these settings; every model answer also shows what was sent.
      </p>
      <div className="row">
        <Chip tone={ai.pseudonymize ? 'positive' : 'neutral'} dot>
          {ai.pseudonymize ? 'Names replaced with aliases' : 'Real names included'}
        </Chip>
        <Chip tone={ai.includeNotes ? 'neutral' : 'positive'} dot>
          {ai.includeNotes ? 'Notes & reflections included' : 'Notes & reflections withheld'}
        </Chip>
      </div>
      {ai.pseudonymize && ai.includeNotes && (
        <p className="faint ask-note">Only people recorded in Kith are replaced. Other names you wrote in notes are sent as written.</p>
      )}
      <p>
        <span className="faint">Question as sent: </span>“{pending.sentQuestion}”
      </p>
      <pre className="ask-packet" tabIndex={0} aria-label="Evidence summary that would be sent">
        {pending.packet}
      </pre>
      <div className="row">
        <button type="button" className="btn" onClick={onApprove}>
          Send to {modelLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onLocal}>
          Answer on this device instead
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
