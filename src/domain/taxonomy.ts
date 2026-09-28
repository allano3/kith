import type {
  Actor,
  AdviceOutcome,
  Balance,
  CategoryId,
  CircleId,
  ConcernTagId,
  DatingStatus,
  DimensionId,
  DomainTrustSelf,
  Focus,
  GreenFlagId,
  Influence,
  InteractionTypeId,
  InviteResponse,
  Mood,
  Reception,
  RequestKind,
  Significance,
  TrustDomainId,
  ValueStance,
} from './types';

export type InteractionGroup = 'contact' | 'care' | 'commitment' | 'trust' | 'friction' | 'repair' | 'request';

export type InteractionField =
  | 'focus'
  | 'balance'
  | 'influence'
  | 'trustDomain'
  | 'outcome'
  | 'requestKind'
  | 'conflictOfInterest'
  | 'independentEvidence'
  | 'inviteResponse'
  | 'reception'
  | 'rescheduleOffered'
  | 'dueDate'
  | 'commitment';

export interface InteractionTypeDef {
  id: InteractionTypeId;
  label: string;
  group: InteractionGroup;
  hint: string;
  /** Question shown for the actor selector; `null` when the actor is fixed. */
  actorQuestion: string | null;
  /** Type-specific wording for each allowed actor. First key is the default. */
  actors: Partial<Record<Actor, string>>;
  /** Counts as real two-way contact: frequency, initiation, last meaningful interaction. */
  contact: boolean;
  fields: InteractionField[];
  /** Green flags this event implies when performed by `them` (or `both`). */
  impliesFlag?: GreenFlagId;
}

const CONTACT_FIELDS: InteractionField[] = ['focus', 'balance', 'influence'];
const INITIATED = { them: 'They did', me: 'I did', both: 'Mutual', unknown: 'Not sure' } as const;

export const INTERACTION_TYPES: InteractionTypeDef[] = [
  // ── Contact ──
  { id: 'met_in_person', label: 'Met in person', group: 'contact', hint: 'Spent time together.', actorQuestion: 'Who initiated?', actors: INITIATED, contact: true, fields: [...CONTACT_FIELDS, 'commitment'] },
  { id: 'phone_call', label: 'Phone / video call', group: 'contact', hint: 'A real conversation by voice or video.', actorQuestion: 'Who initiated?', actors: INITIATED, contact: true, fields: CONTACT_FIELDS },
  { id: 'text_conversation', label: 'Text conversation', group: 'contact', hint: 'A meaningful exchange by message.', actorQuestion: 'Who started it?', actors: INITIATED, contact: true, fields: CONTACT_FIELDS },
  { id: 'initiated_contact', label: 'Reached out / checked in', group: 'contact', hint: 'Someone made contact — a check-in, a question, a “thinking of you”.', actorQuestion: 'Who reached out?', actors: { them: 'They reached out', me: 'I reached out' }, contact: true, fields: CONTACT_FIELDS, impliesFlag: 'checked_in' },
  { id: 'invitation', label: 'Invitation', group: 'contact', hint: 'An invitation to meet, a date, an event.', actorQuestion: 'Who invited?', actors: { me: 'I invited them', them: 'They invited me' }, contact: true, fields: ['inviteResponse', 'focus'], impliesFlag: 'made_time' },

  // ── Care & support ──
  { id: 'help_received', label: 'Help received', group: 'care', hint: 'They helped you with something.', actorQuestion: null, actors: { them: 'They helped me' }, contact: false, fields: ['trustDomain'] },
  { id: 'help_offered', label: 'Help offered', group: 'care', hint: 'You helped them.', actorQuestion: null, actors: { me: 'I helped them' }, contact: false, fields: ['trustDomain'] },
  { id: 'reached_out_difficulty', label: 'Showed up during difficulty', group: 'care', hint: 'Someone reached out or stayed present in a hard time.', actorQuestion: 'Who showed up?', actors: { them: 'They were there for me', me: 'I was there for them' }, contact: true, fields: ['balance'], impliesFlag: 'present_in_difficulty' },
  { id: 'celebrated_success', label: 'Celebrated success', group: 'care', hint: 'Someone celebrated a win or milestone.', actorQuestion: 'Whose success?', actors: { them: 'They celebrated mine', me: 'I celebrated theirs' }, contact: true, fields: [], impliesFlag: 'celebrated_without_envy' },
  { id: 'gift_generosity', label: 'Gift / act of generosity', group: 'care', hint: 'A gift, a treat, time or resources given freely.', actorQuestion: 'From whom?', actors: { them: 'From them', me: 'From me' }, contact: false, fields: [] },
  { id: 'introduction_referral', label: 'Introduction / referral', group: 'care', hint: 'Someone connected the other to a person or opportunity.', actorQuestion: 'Who made it?', actors: { them: 'They introduced me', me: 'I introduced them' }, contact: false, fields: ['trustDomain', 'outcome'] },
  { id: 'important_moment', label: 'Important personal moment', group: 'care', hint: 'A moment worth remembering together.', actorQuestion: null, actors: { both: 'Shared' }, contact: false, fields: ['influence'] },
  { id: 'vulnerability_shared', label: 'Shared something personal', group: 'care', hint: 'Someone was vulnerable. How was it received?', actorQuestion: 'Who opened up?', actors: { me: 'I opened up', them: 'They confided in me' }, contact: false, fields: ['reception'] },

  // ── Commitments ──
  { id: 'promise_made', label: 'Promise made', group: 'commitment', hint: 'A commitment to do something. Stays open until resolved.', actorQuestion: 'Who promised?', actors: { them: 'They promised', me: 'I promised' }, contact: false, fields: ['dueDate', 'trustDomain'] },
  { id: 'promise_kept', label: 'Promise kept', group: 'commitment', hint: 'A commitment was followed through.', actorQuestion: 'Whose promise?', actors: { them: 'Theirs', me: 'Mine' }, contact: false, fields: ['commitment'], impliesFlag: 'kept_commitment' },
  { id: 'promise_broken', label: 'Promise broken', group: 'commitment', hint: 'A commitment was not followed through.', actorQuestion: 'Whose promise?', actors: { them: 'Theirs', me: 'Mine' }, contact: false, fields: ['commitment'] },
  { id: 'plans_made', label: 'Plans made', group: 'commitment', hint: 'Agreed to meet or do something. Stays open until it happens or changes.', actorQuestion: 'Who proposed?', actors: { them: 'They proposed', me: 'I proposed', both: 'Mutual' }, contact: false, fields: ['dueDate'] },
  { id: 'cancelled_plans', label: 'Cancelled plans', group: 'commitment', hint: 'Plans fell through.', actorQuestion: 'Who cancelled?', actors: { them: 'They cancelled', me: 'I cancelled' }, contact: false, fields: ['commitment', 'rescheduleOffered'] },
  { id: 'rescheduled_plans', label: 'Rescheduled plans', group: 'commitment', hint: 'Plans moved to a new time.', actorQuestion: 'Who asked to reschedule?', actors: { them: 'They did', me: 'I did' }, contact: false, fields: ['commitment', 'dueDate'], impliesFlag: 'rescheduled' },
  { id: 'collaboration_completed', label: 'Collaboration completed', group: 'commitment', hint: 'Shared work delivered.', actorQuestion: 'Whose part?', actors: { both: 'Both', them: 'Theirs', me: 'Mine' }, contact: false, fields: ['trustDomain'] },
  { id: 'collaboration_delayed', label: 'Collaboration delayed', group: 'commitment', hint: 'Shared work slipped.', actorQuestion: 'Whose part slipped?', actors: { them: 'Theirs', me: 'Mine', both: 'Both' }, contact: false, fields: ['trustDomain'] },

  // ── Trust ──
  { id: 'advice_received', label: 'Advice received', group: 'trust', hint: 'Advice or a recommendation. Record the outcome later.', actorQuestion: null, actors: { them: 'From them' }, contact: false, fields: ['trustDomain', 'outcome', 'conflictOfInterest', 'independentEvidence'] },
  { id: 'confidence_kept', label: 'Confidence kept', group: 'trust', hint: 'Something private stayed private.', actorQuestion: 'Who kept it?', actors: { them: 'They kept mine', me: 'I kept theirs' }, contact: false, fields: [] },
  { id: 'confidence_broken', label: 'Confidence broken', group: 'trust', hint: 'Something shared privately was passed on.', actorQuestion: 'Who shared it?', actors: { them: 'They shared mine', me: 'I shared theirs' }, contact: false, fields: [] },

  // ── Friction & respect ──
  { id: 'conflict', label: 'Conflict', group: 'friction', hint: 'A disagreement or rupture. Conflict itself is normal; repair matters.', actorQuestion: 'Who raised it?', actors: { both: 'It was mutual', them: 'They did', me: 'I did' }, contact: false, fields: ['balance'] },
  { id: 'disagreement_respectful', label: 'Disagreement handled well', group: 'friction', hint: 'You disagreed and it stayed respectful.', actorQuestion: null, actors: { both: 'Both' }, contact: false, fields: [] },
  { id: 'boundary_respected', label: 'Boundary respected', group: 'friction', hint: 'A “no” or a limit was honoured.', actorQuestion: 'Whose boundary was respected?', actors: { them: 'They respected mine', me: 'I respected theirs' }, contact: false, fields: [], impliesFlag: 'respected_boundaries' },
  { id: 'boundary_crossed', label: 'Boundary crossed', group: 'friction', hint: 'A stated limit was not honoured.', actorQuestion: 'Who crossed a boundary?', actors: { them: 'They crossed mine', me: 'I crossed theirs' }, contact: false, fields: [] },
  { id: 'felt_pressured', label: 'Felt pressured', group: 'friction', hint: 'You felt pushed toward a decision or couldn’t easily say no.', actorQuestion: null, actors: { them: 'By them' }, contact: false, fields: ['trustDomain'] },

  // ── Repair ──
  { id: 'apology_received', label: 'Apology received', group: 'repair', hint: 'They took responsibility.', actorQuestion: null, actors: { them: 'From them' }, contact: false, fields: [], impliesFlag: 'apologized_sincerely' },
  { id: 'issue_discussed', label: 'Issue discussed', group: 'repair', hint: 'You talked openly about a problem.', actorQuestion: null, actors: { both: 'Together' }, contact: false, fields: [] },
  { id: 'reconciliation', label: 'Reconciliation', group: 'repair', hint: 'The relationship was repaired after a rupture.', actorQuestion: null, actors: { both: 'Together' }, contact: false, fields: [] },
  { id: 'boundary_established', label: 'Boundary established', group: 'repair', hint: 'You set a clear limit.', actorQuestion: null, actors: { me: 'I set it' }, contact: false, fields: [] },
  { id: 'behavior_improved', label: 'Behavior improved', group: 'repair', hint: 'A previous pattern changed for the better.', actorQuestion: null, actors: { them: 'Their behavior' }, contact: false, fields: [], impliesFlag: 'changed_after_conflict' },
  { id: 'forgiven', label: 'Forgiven', group: 'repair', hint: 'You let go of resentment. Forgiveness is not the same as restored trust.', actorQuestion: null, actors: { me: 'I forgave' }, contact: false, fields: [] },
  { id: 'trust_restored', label: 'Trust restored', group: 'repair', hint: 'You now extend trust again — ideally after new evidence.', actorQuestion: null, actors: { me: 'I decided' }, contact: false, fields: ['trustDomain'] },

  // ── Requests ──
  { id: 'request_made', label: 'Request or proposal', group: 'request', hint: 'A request for money, a favor, a business idea, an introduction… Opens Pause & Reflect.', actorQuestion: null, actors: { them: 'From them' }, contact: true, fields: ['requestKind', 'trustDomain', 'conflictOfInterest', 'independentEvidence', 'outcome'] },
];

export const INTERACTION_TYPE: Record<InteractionTypeId, InteractionTypeDef> = Object.fromEntries(
  INTERACTION_TYPES.map((t) => [t.id, t]),
) as Record<InteractionTypeId, InteractionTypeDef>;

export const GROUP_LABEL: Record<InteractionGroup, string> = {
  contact: 'Contact',
  care: 'Care & support',
  commitment: 'Commitments',
  trust: 'Trust',
  friction: 'Friction & respect',
  repair: 'Repair',
  request: 'Requests',
};

/** Commitment-opening types. Their resolutions link back via `relatesTo`. */
export const COMMITMENT_TYPES: InteractionTypeId[] = ['promise_made', 'plans_made'];

export interface CategoryDef {
  id: CategoryId;
  label: string;
  description: string;
  /** Typical circle; only used to pre-fill the circle picker. */
  circle: CircleId | null;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'inner_circle', label: 'Inner circle', description: 'Demonstrated trust, reliability, mutual investment and emotional safety over sustained history.', circle: 1 },
  { id: 'close_friend', label: 'Close friend', description: 'Someone you genuinely value and invest in.', circle: 2 },
  { id: 'trusted_friend', label: 'Trusted friend', description: 'Trust has been demonstrated, even if contact is less frequent.', circle: 2 },
  { id: 'growing_friendship', label: 'Growing friendship', description: 'Newer, with positive momentum. Trust is still being established.', circle: 3 },
  { id: 'friend', label: 'Friend', description: 'A meaningful relationship without deep dependency.', circle: 3 },
  { id: 'activity_friend', label: 'Activity / social friend', description: 'Good company around shared activities.', circle: 3 },
  { id: 'professional_friend', label: 'Professional friend', description: 'Reliable in a professional context; personal depth may be limited.', circle: 4 },
  { id: 'mentor', label: 'Mentor / adviser', description: 'Someone whose guidance you seek in particular areas.', circle: 3 },
  { id: 'collaborator', label: 'Collaborator', description: 'You build or work on things together.', circle: 4 },
  { id: 'acquaintance', label: 'Acquaintance', description: 'Friendly, contextual, light expectations.', circle: 4 },
  { id: 'dormant', label: 'Dormant friendship', description: 'Genuine, but currently inactive. Infrequent does not mean unimportant.', circle: null },
  { id: 'seasonal', label: 'Seasonal friendship', description: 'Meaningful for a particular season of life.', circle: 3 },
  { id: 'in_transition', label: 'Relationship in transition', description: 'Changing — closer, more distant, or being renegotiated.', circle: null },
  { id: 'dating_interest', label: 'Dating interest', description: 'Potential romantic relationship. Enables mutual-interest view.', circle: null },
  { id: 'former_close', label: 'Former close relationship', description: 'Once close; the relationship has changed.', circle: 4 },
  { id: 'high_caution', label: 'High-caution relationship', description: 'Past behavior suggests stronger boundaries and lower expectations for now.', circle: 5 },
];

export const CATEGORY: Record<CategoryId, CategoryDef> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  CategoryDef
>;

export interface CircleDef {
  id: CircleId;
  name: string;
  size: string;
  description: string;
}

export const CIRCLES: CircleDef[] = [
  { id: 1, name: 'Inner circle', size: '≈ 3–5 people', description: 'Demonstrated trust, reliability, mutual investment, emotional safety and sustained history. Their perspective may deserve significant weight.' },
  { id: 2, name: 'Close relationships', size: '≈ 10–15 people', description: 'People you genuinely value and invest in, though you may trust selectively.' },
  { id: 3, name: 'Friends & community', size: '≈ 30–50 people', description: 'Meaningful relationships without deep dependency or vulnerability.' },
  { id: 4, name: 'Acquaintances & contextual', size: '≈ 100–150 people', description: 'Work, church, hobbies, professional network, neighbors.' },
  { id: 5, name: 'Limited / caution', size: 'any', description: 'Previous behavior suggests stronger boundaries or lower expectations for now.' },
];

export const CIRCLE: Record<CircleId, CircleDef> = Object.fromEntries(CIRCLES.map((c) => [c.id, c])) as Record<CircleId, CircleDef>;

export const TRUST_DOMAINS: { id: TrustDomainId; label: string }[] = [
  { id: 'emotional', label: 'Emotional advice' },
  { id: 'career', label: 'Career advice' },
  { id: 'financial', label: 'Financial advice' },
  { id: 'business', label: 'Business collaboration' },
  { id: 'confidential', label: 'Confidential information' },
  { id: 'dating', label: 'Dating advice' },
  { id: 'spiritual', label: 'Spiritual guidance' },
  { id: 'practical', label: 'Practical help' },
  { id: 'crisis', label: 'Crisis support' },
  { id: 'introductions', label: 'Professional introductions' },
];

export const TRUST_DOMAIN_LABEL = Object.fromEntries(TRUST_DOMAINS.map((d) => [d.id, d.label])) as Record<TrustDomainId, string>;

export const DOMAIN_TRUST_SELF_LABEL: Record<DomainTrustSelf, string> = {
  unassessed: 'Not assessed',
  limited: 'Limited',
  some: 'Some',
  strong: 'Strong',
  caution: 'Caution',
};

export interface DimensionDef {
  id: DimensionId;
  label: string;
  question: string;
}

export const DIMENSIONS: DimensionDef[] = [
  { id: 'reciprocity', label: 'Reciprocity', question: 'Is effort generally mutual?' },
  { id: 'reliability', label: 'Reliability', question: 'Do they keep commitments?' },
  { id: 'trust', label: 'Trust', question: 'Do words and actions align? Are confidences kept?' },
  { id: 'care', label: 'Care', question: 'Do they show interest in your wellbeing?' },
  { id: 'mutuality', label: 'Mutuality', question: 'Is the relationship balanced, not centered on one person’s needs?' },
  { id: 'growth', label: 'Growth', question: 'Does the relationship encourage healthy growth?' },
  { id: 'respect', label: 'Respect', question: 'Are boundaries and “no” respected?' },
  { id: 'consistency', label: 'Consistency', question: 'Is behavior reasonably steady over time?' },
  { id: 'safety', label: 'Emotional safety', question: 'Can you safely be vulnerable?' },
  { id: 'availability', label: 'Availability', question: 'What capacity do they currently have? (Separate from care.)' },
];

export const DIMENSION = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d])) as Record<DimensionId, DimensionDef>;

export interface FlagDef<T extends string> {
  id: T;
  label: string;
  dimension: DimensionId;
  weight: number;
}

export const GREEN_FLAGS: FlagDef<GreenFlagId>[] = [
  { id: 'checked_in', label: 'Checked in without needing anything', dimension: 'care', weight: 0.5 },
  { id: 'kept_commitment', label: 'Kept a commitment', dimension: 'reliability', weight: 0.5 },
  { id: 'made_time', label: 'Made time', dimension: 'care', weight: 0.5 },
  { id: 'rescheduled', label: 'Rescheduled when plans failed', dimension: 'reliability', weight: 0.4 },
  { id: 'supported_goals', label: 'Supported an important goal', dimension: 'growth', weight: 0.8 },
  { id: 'honest_feedback', label: 'Gave honest feedback', dimension: 'growth', weight: 0.6 },
  { id: 'respected_boundaries', label: 'Respected boundaries', dimension: 'respect', weight: 0.8 },
  { id: 'celebrated_without_envy', label: 'Celebrated success without envy', dimension: 'care', weight: 0.8 },
  { id: 'apologized_sincerely', label: 'Apologized sincerely', dimension: 'trust', weight: 0.5 },
  { id: 'changed_after_conflict', label: 'Changed behavior after conflict', dimension: 'trust', weight: 0.8 },
  { id: 'offered_help_proactively', label: 'Offered help proactively', dimension: 'care', weight: 0.8 },
  { id: 'present_in_difficulty', label: 'Remained present during difficulty', dimension: 'care', weight: 1 },
  { id: 'spoke_truth', label: 'Spoke truth even when inconvenient', dimension: 'trust', weight: 0.6 },
  { id: 'remembered_details', label: 'Remembered something important', dimension: 'care', weight: 0.6 },
  { id: 'curious_about_me', label: 'Asked about my life', dimension: 'mutuality', weight: 0.6 },
  { id: 'loyal_in_absence', label: 'Stood up for me when I wasn’t there', dimension: 'respect', weight: 0.8 },
];

export const GREEN_FLAG = Object.fromEntries(GREEN_FLAGS.map((f) => [f.id, f])) as Record<GreenFlagId, FlagDef<GreenFlagId>>;

export const CONCERN_TAGS: (FlagDef<ConcernTagId> & { severe?: boolean })[] = [
  { id: 'dismissed_feelings', label: 'My feelings were dismissed', dimension: 'safety', weight: -0.8 },
  { id: 'pressured_decision', label: 'Pushed me toward a decision', dimension: 'respect', weight: -1 },
  { id: 'guilt_after_no', label: 'Guilt or pushback after I said no', dimension: 'respect', weight: -1 },
  { id: 'used_info_against_me', label: 'Something I shared was used against me', dimension: 'safety', weight: -2, severe: true },
  { id: 'no_follow_up', label: 'Didn’t follow up as said', dimension: 'reliability', weight: -0.6 },
];

export const CONCERN_TAG = Object.fromEntries(CONCERN_TAGS.map((f) => [f.id, f])) as Record<ConcernTagId, (typeof CONCERN_TAGS)[number]>;

export const MOOD_LABEL: Record<Mood, string> = {
  uplifted: 'Uplifted',
  good: 'Good',
  neutral: 'Neutral',
  drained: 'Drained',
  hurt: 'Hurt',
};

export const FOCUS_LABEL: Record<Focus, string> = {
  connection: 'Just connecting',
  support: 'Support',
  celebration: 'Celebration',
  request: 'A request or favor',
  opportunity: 'Business / opportunity',
  logistics: 'Logistics',
};

export const BALANCE_LABEL: Record<Balance, string> = {
  balanced: 'Balanced',
  mostly_them: 'Mostly about them',
  mostly_me: 'Mostly about me',
};

export const INFLUENCE_LABEL: Record<Influence, string> = {
  toward: 'Toward who I want to become',
  neutral: 'Neutral',
  away: 'Away from who I want to become',
};

export const SIGNIFICANCE_LABEL: Record<Significance, string> = {
  routine: 'Routine',
  meaningful: 'Meaningful',
  milestone: 'Turning point / memory',
};

export const OUTCOME_LABEL: Record<AdviceOutcome, string> = {
  pending: 'Not yet known',
  helpful: 'Turned out helpful',
  mixed: 'Mixed',
  unhelpful: 'Turned out unhelpful',
};

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  business_proposal: 'Business proposal',
  money: 'Request for money',
  major_favor: 'Major favor',
  introduction: 'Introduction to someone',
  romantic_interest: 'Romantic interest',
  major_commitment: 'Invitation to a major commitment',
  confidential_info: 'Request for confidential information',
  other: 'Other request',
};

/** Request kinds as a noun phrase with article, for sentences. */
export const REQUEST_KIND_PHRASE: Record<RequestKind, string> = {
  business_proposal: 'a business proposal',
  money: 'a request for money',
  major_favor: 'a request for a major favor',
  introduction: 'a request for an introduction',
  romantic_interest: 'romantic interest',
  major_commitment: 'an invitation to a major commitment',
  confidential_info: 'a request for confidential information',
  other: 'a request',
};

export const INVITE_RESPONSE_LABEL: Record<InviteResponse, string> = {
  accepted: 'Accepted',
  alternative: 'Declined, suggested another time',
  declined: 'Declined, no alternative',
  no_response: 'No response',
};

export const RECEPTION_LABEL: Record<Reception, string> = {
  supportive: 'Received with care',
  neutral: 'Neutral',
  dismissive: 'Dismissed',
};

export const VALUE_STANCE_LABEL: Record<ValueStance, string> = {
  reinforces: 'Reinforces',
  neutral: 'Neutral',
  tension: 'In tension',
};

export const DATING_STATUS_LABEL: Record<DatingStatus, string> = {
  insufficient: 'Insufficient information',
  early_interest: 'Early interest',
  mutual_emerging: 'Mutual interest emerging',
  developing: 'Relationship developing',
  mixed: 'Mixed signals',
  low_investment: 'Low demonstrated investment',
  friendship_momentum: 'Friendship rather than romantic momentum',
};

export const VALUE_PRESETS = [
  'Faith',
  'Character',
  'Integrity',
  'Family',
  'Growth',
  'Health',
  'Purpose',
  'Generosity',
  'Adventure',
  'Career',
  'Service',
  'Intellectual curiosity',
];
