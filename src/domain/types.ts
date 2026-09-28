/**
 * Core data model. Everything the user records lives in a single `Vault`
 * that is encrypted at rest (see src/store). The engine (src/engine) derives
 * all assessments from this data on demand; no derived value is persisted,
 * so there is exactly one source of truth: what the user observed.
 */

/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

/** Who did the thing. `both` = mutual/joint; `unknown` = not recorded. */
export type Actor = 'me' | 'them' | 'both' | 'unknown';

/** Relationship circles, modelled loosely on Dunbar's layers (5 = limited/caution). */
export type CircleId = 1 | 2 | 3 | 4 | 5;

export type CategoryId =
  | 'inner_circle'
  | 'close_friend'
  | 'trusted_friend'
  | 'growing_friendship'
  | 'friend'
  | 'activity_friend'
  | 'professional_friend'
  | 'mentor'
  | 'collaborator'
  | 'acquaintance'
  | 'dormant'
  | 'seasonal'
  | 'in_transition'
  | 'dating_interest'
  | 'former_close'
  | 'high_caution';

export type TrustDomainId =
  | 'emotional'
  | 'career'
  | 'financial'
  | 'business'
  | 'confidential'
  | 'dating'
  | 'spiritual'
  | 'practical'
  | 'crisis'
  | 'introductions';

export type DimensionId =
  | 'reciprocity'
  | 'reliability'
  | 'trust'
  | 'care'
  | 'mutuality'
  | 'growth'
  | 'respect'
  | 'consistency'
  | 'safety'
  | 'availability';

export type InteractionTypeId =
  // contact
  | 'met_in_person'
  | 'phone_call'
  | 'text_conversation'
  | 'initiated_contact'
  // support & care
  | 'help_received'
  | 'help_offered'
  | 'reached_out_difficulty'
  | 'celebrated_success'
  | 'gift_generosity'
  | 'introduction_referral'
  | 'important_moment'
  | 'vulnerability_shared'
  // commitments
  | 'promise_made'
  | 'promise_kept'
  | 'promise_broken'
  | 'plans_made'
  | 'cancelled_plans'
  | 'rescheduled_plans'
  | 'invitation'
  | 'collaboration_completed'
  | 'collaboration_delayed'
  // trust
  | 'advice_received'
  | 'confidence_kept'
  | 'confidence_broken'
  // friction & respect
  | 'conflict'
  | 'boundary_respected'
  | 'boundary_crossed'
  | 'felt_pressured'
  | 'disagreement_respectful'
  // repair
  | 'apology_received'
  | 'issue_discussed'
  | 'reconciliation'
  | 'boundary_established'
  | 'behavior_improved'
  | 'trust_restored'
  | 'forgiven'
  // requests
  | 'request_made';

/** How the user felt afterwards (optional emotional reflection). */
export type Mood = 'uplifted' | 'good' | 'neutral' | 'drained' | 'hurt';

/** What the interaction was mainly about. Drives transactional-pattern detection. */
export type Focus = 'connection' | 'support' | 'celebration' | 'request' | 'opportunity' | 'logistics';

/** Conversational balance. */
export type Balance = 'balanced' | 'mostly_them' | 'mostly_me';

/** Did this pull the user toward or away from who they are trying to become? */
export type Influence = 'toward' | 'neutral' | 'away';

export type Significance = 'routine' | 'meaningful' | 'milestone';

/** Later-recorded outcome of advice or a proposal. */
export type AdviceOutcome = 'pending' | 'helpful' | 'mixed' | 'unhelpful';

export type RequestKind =
  | 'business_proposal'
  | 'money'
  | 'major_favor'
  | 'introduction'
  | 'romantic_interest'
  | 'major_commitment'
  | 'confidential_info'
  | 'other';

export type InviteResponse = 'accepted' | 'alternative' | 'declined' | 'no_response';

export type Reception = 'supportive' | 'neutral' | 'dismissive';

export type Tristate = 'yes' | 'no' | 'unknown';

export type GreenFlagId =
  | 'checked_in'
  | 'kept_commitment'
  | 'made_time'
  | 'rescheduled'
  | 'supported_goals'
  | 'honest_feedback'
  | 'respected_boundaries'
  | 'celebrated_without_envy'
  | 'apologized_sincerely'
  | 'changed_after_conflict'
  | 'offered_help_proactively'
  | 'present_in_difficulty'
  | 'spoke_truth'
  | 'remembered_details'
  | 'curious_about_me'
  | 'loyal_in_absence';

/** Observable behaviours worth noting. Deliberately behavioural, never character labels. */
export type ConcernTagId =
  | 'dismissed_feelings'
  | 'pressured_decision'
  | 'guilt_after_no'
  | 'used_info_against_me'
  | 'no_follow_up';

export interface Interaction {
  id: string;
  personId: string;
  date: ISODate;
  type: InteractionTypeId;
  /** Who initiated / acted. Meaning is type-specific (see taxonomy `actorQuestion`). */
  actor: Actor;
  significance: Significance;
  note?: string;
  /** Optional private emotional reflection. */
  reflection?: string;
  mood?: Mood;
  focus?: Focus;
  balance?: Balance;
  influence?: Influence;
  trustDomain?: TrustDomainId;
  outcome?: AdviceOutcome;
  requestKind?: RequestKind;
  /** Would the person benefit from the user acting on this advice/request? */
  conflictOfInterest?: Tristate;
  /** Is there independent evidence supporting the advice/proposal itself? */
  independentEvidence?: Tristate;
  inviteResponse?: InviteResponse;
  reception?: Reception;
  /** For cancellations: did the canceller propose another time? */
  rescheduleOffered?: boolean;
  /** The other person's positive act cost them something (time, money, effort). Weighted more heavily. */
  costly?: boolean;
  /** For commitments (promise_made / plans_made): when it was due. For reschedules: the new date. */
  dueDate?: ISODate;
  /** For commitments: user marked it as no longer relevant. */
  released?: boolean;
  /** Links a resolution (kept, broken, cancelled, rescheduled, met) to a commitment. */
  relatesTo?: string;
  greenFlags?: GreenFlagId[];
  concerns?: ConcernTagId[];
  /** Pause & Reflect state for requests/proposals. */
  decision?: { status: 'open' | 'decided'; note?: string };
  createdAt: string;
  updatedAt: string;
}

export type ValueStance = 'reinforces' | 'neutral' | 'tension';

export type DomainTrustSelf = 'unassessed' | 'limited' | 'some' | 'strong' | 'caution';

export type DatingStatus =
  | 'early_interest'
  | 'mutual_emerging'
  | 'insufficient'
  | 'mixed'
  | 'low_investment'
  | 'developing'
  | 'friendship_momentum';

export interface Person {
  id: string;
  name: string;
  /** First entry is the primary category. The taxonomy is flexible: people can hold several roles. */
  categories: CategoryId[];
  /** User-chosen circle = the level of trust, attention and expectation currently extended. */
  circle: CircleId | null;
  /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
  since?: string;
  /** Where the relationship lives: work, church, climbing gym… */
  contexts: string[];
  /** Availability context (family, work, health, geography). Keeps capacity separate from care. */
  capacityNote?: string;
  notes?: string;
  /** User's own view of trust per domain; evidence is shown alongside, never overwritten. */
  domainTrust: Partial<Record<TrustDomainId, { level: DomainTrustSelf; note?: string }>>;
  /** Stance per user value (keys are value labels from settings). */
  values: Record<string, ValueStance>;
  /** Manual dating status; the engine's suggestion is shown alongside. */
  datingStatus?: DatingStatus;
  /** Last time the user reviewed whether their investment matches the evidence. */
  lastReviewed?: ISODate;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AiProvider = 'off' | 'openai_compatible' | 'anthropic';

export interface AiSettings {
  provider: AiProvider;
  /** OpenAI-compatible base URL (OpenRouter, Ollama at http://localhost:11434/v1, OpenAI…). */
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Replace names with aliases before anything leaves the device. */
  pseudonymize: boolean;
  /** Include free-text notes & reflections in what is sent. */
  includeNotes: boolean;
}

export interface Settings {
  /** Personal values the user wants friendships to reinforce. */
  values: string[];
  ai: AiSettings;
  autoLockMinutes: number;
  lastInvestmentCheck?: ISODate;
}

export interface Vault {
  version: 1;
  people: Person[];
  interactions: Interaction[];
  settings: Settings;
  /** Text-capture inbox (optional in older vaults). */
  capture?: CaptureState;
}

/** A captured message awaiting review. Text is deleted as soon as its conversation is reviewed. */
export interface PendingMessage {
  guid: string;
  fromMe: boolean;
  /** ISO timestamp. Used only to order messages; never displayed or analysed as reply timing. */
  sentAt: string;
  text: string;
}

/** An interaction the capture inbox proposes. Nothing is logged until the user adds it. */
export interface CaptureSuggestion {
  /** Unique within its conversation (one suggestion per interaction type). */
  id: string;
  type: InteractionTypeId;
  actor: Actor;
  /** Neutral template, never the message text. Editable. */
  note: string;
  focus?: Focus;
  requestKind?: RequestKind;
  trustDomain?: TrustDomainId;
  rescheduleOffered?: boolean;
  relatesTo?: string;
  /** GUIDs of the messages that triggered this suggestion (message order). */
  triggers: string[];
  status: 'pending' | 'added' | 'skipped';
  /** The logged interaction, once added. */
  interactionId?: string;
}

export interface PendingConversation {
  /** GUID of the conversation's first message. */
  id: string;
  /** Friend name as configured on the Mac. */
  friend: string;
  /** Resolved Kith person; `null` until the user picks one. */
  personId: string | null;
  /** Local calendar date of the first message. */
  date: ISODate;
  /** False when the bundle held incoming messages only, so who started it is unknown. */
  includesSent: boolean;
  messages: PendingMessage[];
  suggestions: CaptureSuggestion[];
}

/** Text-capture inbox state. Lives inside the encrypted vault. */
export interface CaptureState {
  pending: PendingConversation[];
  /** Bundle ids already imported. */
  importedBundles: string[];
  /** Reviewed message GUIDs with their message date (no text), for dedupe across overlapping bundles. Pruned after ~120 days. */
  reviewedGuids: { guid: string; date: ISODate }[];
  /** Friend name → person id, for names that don't match a Kith person exactly. */
  aliases: Record<string, string>;
  /** Friend names whose messages are always dropped on import. */
  ignored: string[];
  /** Remembered capture passphrase (only ever stored inside the encrypted vault). */
  passphrase?: string;
  /** ISO timestamp of the last successful import. */
  lastImportAt?: string;
}
