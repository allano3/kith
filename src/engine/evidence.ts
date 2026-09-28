import { CONCERN_TAG, GREEN_FLAG, INTERACTION_TYPE } from '../domain/taxonomy';
import { PARAMS } from './params';
import type { DimensionId, GreenFlagId, Interaction, InteractionTypeId, ISODate } from '../domain/types';

/** One signed piece of evidence about the other person's behavior on one dimension. */
export interface Evidence {
  dimension: DimensionId;
  date: ISODate;
  weight: number;
  sourceId: string;
  /** Significant single events (e.g. a broken confidence) are surfaced even when isolated. */
  severe?: boolean;
  /**
   * How the weight fades: `routine` (default half-life), `slow` for rare
   * high-information events, `until_repair` for breaches that should not fade
   * by time alone — only once repair behavior follows.
   */
  decay?: 'routine' | 'slow' | 'until_repair';
}

type Signals = Partial<Record<DimensionId, number>>;

/** Base signals when the other person (or both) acted. Magnitudes are relative, not absolute. */
const THEIR_SIGNALS: Partial<Record<InteractionTypeId, Signals>> = {
  help_received: { care: 0.8 },
  reached_out_difficulty: { care: 1.2, safety: 0.3 },
  celebrated_success: { care: 1, growth: 0.3 },
  gift_generosity: { care: 0.6 },
  introduction_referral: { care: 0.5 },
  important_moment: { care: 0.3 },
  vulnerability_shared: { mutuality: 0.4 },
  invitation: { care: 0.4 },
  promise_kept: { reliability: 1, trust: 0.3 },
  promise_broken: { reliability: -1, trust: -0.3 },
  rescheduled_plans: { reliability: -0.1 },
  collaboration_completed: { reliability: 0.8 },
  collaboration_delayed: { reliability: -0.5 },
  confidence_kept: { trust: 1, safety: 0.5 },
  disagreement_respectful: { respect: 1, safety: 0.4 },
  boundary_respected: { respect: 1, safety: 0.3 },
  boundary_crossed: { respect: -1.5, safety: -0.5 },
  felt_pressured: { respect: -1 },
  apology_received: { trust: 0.4, respect: 0.2 },
  issue_discussed: { safety: 0.3 },
  reconciliation: { care: 0.3, trust: 0.2 },
  behavior_improved: { trust: 0.6 },
  trust_restored: { trust: 0.3 },
  request_made: { mutuality: -0.2 },
};

/** True when the interaction describes the other person's behavior (not only the user's). */
export function isTheirs(i: Interaction): boolean {
  return i.actor === 'them' || i.actor === 'both';
}

/** Green flags implied by an interaction, without the user having to tag them. */
export function impliedFlags(i: Interaction): GreenFlagId[] {
  if (!isTheirs(i)) return [];
  const flags: GreenFlagId[] = [];
  const implied = INTERACTION_TYPE[i.type].impliesFlag;
  if (implied && !(i.type === 'initiated_contact' && (i.focus === 'request' || i.focus === 'opportunity'))) flags.push(implied);
  if (i.type === 'cancelled_plans' && i.rescheduleOffered) flags.push('rescheduled');
  return flags;
}

/** Tagged flags describe the other person unless the event is purely the user's own act. */
export function flagsDescribeThem(i: Interaction): boolean {
  return !(i.actor === 'me' && !INTERACTION_TYPE[i.type].contact && i.type !== 'vulnerability_shared');
}

export function evidenceFor(i: Interaction): Evidence[] {
  const out: Evidence[] = [];
  const add = (dimension: DimensionId, weight: number, severe?: boolean) => {
    if (weight === 0) return;
    const costly = weight > 0 && i.costly && isTheirs(i);
    const slow = weight > 0 && (costly || (i.type === 'reached_out_difficulty' && isTheirs(i)));
    out.push({
      dimension,
      weight: costly ? weight * PARAMS.costlyMultiplier : weight,
      date: i.date,
      sourceId: i.id,
      severe,
      decay: severe ? 'until_repair' : slow ? 'slow' : 'routine',
    });
  };
  const theirs = isTheirs(i);

  if (theirs) {
    for (const [dim, w] of Object.entries(THEIR_SIGNALS[i.type] ?? {})) add(dim as DimensionId, w);
    if (i.type === 'confidence_broken') {
      add('trust', -2, true);
      add('safety', -1.5, true);
    }
    if (i.type === 'cancelled_plans') add('reliability', i.rescheduleOffered ? -0.2 : -0.6);
    if (i.type === 'advice_received' || i.type === 'introduction_referral' || i.type === 'request_made') {
      if (i.outcome === 'helpful') {
        add('trust', 0.7);
        add('growth', 0.3);
      } else if (i.outcome === 'unhelpful') add('trust', -0.4);
    }
    // Contact they initiated: what was it about?
    if (INTERACTION_TYPE[i.type].contact && i.actor === 'them' && i.type !== 'request_made') {
      if (i.focus === 'request' || i.focus === 'opportunity') add('mutuality', -0.3);
      else if (i.focus === 'connection' || i.focus === 'support' || i.focus === 'celebration') {
        add('mutuality', 0.3);
        add('care', 0.3);
      } else add('care', 0.2);
    }
  }

  // The user opened up: the reception is evidence about the other person.
  if (i.type === 'vulnerability_shared' && i.actor === 'me') {
    if (i.reception === 'supportive') {
      add('safety', 1);
      add('care', 0.3);
    } else if (i.reception === 'neutral') add('safety', 0.2);
    else if (i.reception === 'dismissive') {
      add('safety', -1);
      add('care', -0.3);
    }
  }

  // The user invited them: availability, not care, is what a response mostly shows.
  if (i.type === 'invitation' && i.actor === 'me') {
    if (i.inviteResponse === 'accepted') add('availability', 0.6);
    else if (i.inviteResponse === 'alternative') add('availability', 0.3);
    else if (i.inviteResponse === 'declined' || i.inviteResponse === 'no_response') add('availability', -0.4);
  }

  // Conversation balance reflects mutuality whoever started it.
  if (i.balance === 'balanced') add('mutuality', 0.6);
  else if (i.balance === 'mostly_them') add('mutuality', -0.5);

  if (i.influence === 'toward') add('growth', 0.8);
  else if (i.influence === 'away') add('growth', -0.8);

  // How the user felt afterwards. Deliberately low weight: feelings are real data, not verdicts.
  const moodWeight = { uplifted: 0.4, good: 0.2, neutral: 0, drained: -0.3, hurt: -0.7 }[i.mood ?? 'neutral'];
  add('safety', moodWeight);

  if (flagsDescribeThem(i)) {
    const implied = impliedFlags(i);
    for (const f of i.greenFlags ?? []) {
      if (!implied.includes(f)) add(GREEN_FLAG[f].dimension, GREEN_FLAG[f].weight);
    }
  }
  for (const c of i.concerns ?? []) {
    const def = CONCERN_TAG[c];
    add(def.dimension, def.weight, def.severe);
  }
  return out;
}
