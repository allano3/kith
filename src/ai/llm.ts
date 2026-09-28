/**
 * The one network request Kith can make: an explicit, user-configured call to
 * a language model with the evidence packet. No retries, no telemetry.
 */
import type { AiSettings } from '../domain/types';
import type { AnalystAnswer } from './types';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export const SYSTEM_PROMPT = `You help one person reflect on their own friendships and relationships, using ONLY the evidence summary they provide. The guiding rule: observe behavior, identify patterns, infer motives cautiously.

Rules:
1. Answer only from the evidence. Never invent events, dates, feelings or context. If the evidence does not cover something, say so under "unknowns".
2. Keep four things separate:
   - facts: directly recorded events, counts and dates.
   - patterns: regularities across time.
   - interpretations: possible readings of the patterns, always hedged ("may", "could", "one possibility is"). Offer situational explanations (capacity, season of life, circumstances) alongside relational ones.
   - unknowns: what the record cannot tell — the other person's circumstances, feelings and intentions, interactions the user did not log, outcomes not yet known.
3. Never diagnose, label character or assign motives. Never use words such as toxic, manipulative, narcissist, fake friend, selfish, "using you" or red flag. Describe observable behavior instead (for example: "The relationship currently shows low reciprocity and inconsistent follow-through").
4. Never tell the user to accept or reject advice, a request or a proposal, and never tell them to end, cut off or abandon a relationship. You may point to questions worth considering, independent checks, or keeping stronger boundaries until additional trust is established. The user always decides.
5. Strengths and improvements matter as much as concerns. People can change. Forgiveness is not the same as restored trust.
6. When the evidence is thin, say so plainly rather than drawing conclusions.
7. Response time is not evidence and is not tracked; never speculate about it.
8. No scores, ratings or numeric rankings. Use calm, plain language.
9. Refer to people exactly as the evidence labels them (for example "Person A").

Respond with ONLY a JSON object and nothing else:
{"facts": ["..."], "patterns": ["..."], "interpretations": ["..."], "unknowns": ["..."]}
Each value is an array of short, complete sentences (at most six per section).`;

function endpoint(settings: AiSettings): string {
  if (settings.provider === 'anthropic') return ANTHROPIC_URL;
  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Set the base URL of your OpenAI-compatible endpoint in Settings.');
  return `${base}/chat/completions`;
}

async function httpError(res: Response): Promise<Error> {
  const body = await res.text().catch(() => '');
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    detail = (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) ?? parsed.message ?? detail;
  } catch {
    // Non-JSON error body: keep the raw excerpt.
  }
  const hint = res.status === 401 || res.status === 403 ? ' Check the API key.' : res.status === 404 ? ' Check the base URL and model name.' : '';
  const sentence = detail ? `: ${detail.trim()}${/[.!?]$/.test(detail.trim()) ? '' : '.'}` : '.';
  return new Error(`The model endpoint returned ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${sentence}${hint}`);
}

/** Sends one system + user message and returns the model's text. */
async function complete(settings: AiSettings, system: string, user: string, maxTokens: number): Promise<string> {
  if (settings.provider === 'off') throw new Error('AI processing is turned off in Settings.');
  if (!settings.model.trim()) throw new Error('Choose a model in Settings first.');
  const url = endpoint(settings);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let body: unknown;
  if (settings.provider === 'anthropic') {
    if (!settings.apiKey.trim()) throw new Error('Anthropic requires an API key.');
    headers['x-api-key'] = settings.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = { model: settings.model.trim(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] };
  } else {
    if (settings.apiKey.trim()) headers.authorization = `Bearer ${settings.apiKey.trim()}`;
    // No max_tokens / temperature: several OpenAI-compatible servers and reasoning models reject them.
    body = {
      model: settings.model.trim(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
  }

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    throw new Error(
      `Could not reach ${url}. Check the address and that the service is running${local ? ' (for Ollama, allow this page with OLLAMA_ORIGINS)' : ''}. (${e instanceof Error ? e.message : String(e)})`,
    );
  }
  if (!res.ok) throw await httpError(res);

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    choices?: { message?: { content?: string | null } }[];
  };
  const text =
    settings.provider === 'anthropic'
      ? (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      : (data.choices?.[0]?.message?.content ?? '');
  if (!text.trim()) throw new Error('The model returned an empty response.');
  return text;
}

/** Extracts the first balanced JSON object from model text (ignores prose, code fences and reasoning tags). */
function firstJsonObject(raw: string): string | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

const KEYS = ['facts', 'patterns', 'interpretations', 'unknowns'] as const;

/** Parses the model's four-section JSON. Throws rather than guessing when the output is not usable. */
export function parseAnswer(raw: string): AnalystAnswer {
  const json = firstJsonObject(raw);
  let parsed: unknown;
  try {
    parsed = json ? JSON.parse(json) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`The model did not return the expected JSON answer. It said: “${raw.trim().slice(0, 200)}${raw.trim().length > 200 ? '…' : ''}”`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!KEYS.some((k) => Array.isArray(obj[k]))) {
    throw new Error('The model’s answer did not contain the facts / patterns / interpretations / unknowns sections.');
  }
  const section = (k: (typeof KEYS)[number]) =>
    Array.isArray(obj[k]) ? (obj[k] as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
  const answer: AnalystAnswer = {
    facts: section('facts'),
    patterns: section('patterns'),
    interpretations: section('interpretations'),
    unknowns: section('unknowns'),
    people: [],
    source: 'model',
  };
  if (KEYS.every((k) => !answer[k].length)) throw new Error('The model returned an empty answer.');
  return answer;
}

/** Asks the configured model. The packet is the only personal data sent. Names in the answer are still aliases. */
export async function askModel(settings: AiSettings, question: string, packet: string): Promise<AnalystAnswer> {
  const raw = await complete(settings, SYSTEM_PROMPT, `EVIDENCE SUMMARY:\n${packet}\n\nQUESTION: ${question}`, 1500);
  return parseAnswer(raw);
}

/** Sends a trivial prompt containing no personal data; resolves with the model's reply. */
export async function testConnection(settings: AiSettings): Promise<string> {
  const reply = await complete(settings, 'You are a connection test. Reply briefly.', 'Reply with the single word: ready', 200);
  // Drop reasoning blocks and chat-template control tokens some local models leak; keep the final line.
  const lines = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\|?[\w-]+\|?>/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  return (lines.at(-1) ?? '').slice(0, 120);
}
