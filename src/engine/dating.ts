import type { DatingStatus, DimensionId } from '../domain/types';
import { contacts, initiations, type Ctx, type DimensionResult } from './dimensions';
import { PARAMS } from './params';
import { addDays, num, plural, times } from './time';

export interface DatingSignal {
  label: string;
  observation: string;
  tone: 'positive' | 'neutral' | 'uncertain';
}

export interface DatingAssessment {
  status: DatingStatus;
  statusReason: string;
  signals: DatingSignal[];
}

/** Response time is deliberately absent: it is noisy and encourages obsessive tracking. */
export const RESPONSE_TIME_NOTE =
  'Response time varies and is not tracked here. More meaningful signals are whether they initiate conversation, accept or propose meetings, and consistently engage.';

/** "Is there evidence of mutual interest?" — describes behavior, never their feelings. */
export function assessDating(ctx: Ctx, dims: Record<DimensionId, DimensionResult>): DatingAssessment {
  const { items, asOf } = ctx;
  const signals: DatingSignal[] = [];
  let positive = 0;
  let negative = 0;

  const sample = initiations(items).slice(-12);
  const me = sample.filter((i) => i.actor === 'me').length;
  const them = sample.filter((i) => i.actor === 'them').length;
  if (sample.length) {
    const themShare = (them + 0.5 * (sample.length - me - them)) / sample.length;
    const tone = themShare >= 0.35 ? 'positive' : themShare < 0.25 && sample.length >= 5 ? 'uncertain' : 'neutral';
    if (tone === 'positive') positive++;
    if (tone === 'uncertain') negative++;
    signals.push({ label: 'Who initiates', observation: `They started ${num(them)} and you started ${num(me)} of the last ${plural(sample.length, 'conversation')}.`, tone });
  }

  const theirProposals = items.filter((i) => (i.type === 'plans_made' || i.type === 'invitation') && i.actor === 'them').length;
  const myProposals = items.filter((i) => (i.type === 'plans_made' || i.type === 'invitation') && i.actor === 'me').length;
  if (theirProposals + myProposals > 0) {
    if (theirProposals > 0) positive++;
    signals.push({
      label: 'Who suggests meeting',
      observation: `They proposed plans ${times(theirProposals)}; you proposed ${times(myProposals)}.`,
      tone: theirProposals > 0 ? 'positive' : myProposals >= 3 ? 'uncertain' : 'neutral',
    });
  }

  const myInvites = items.filter((i) => i.type === 'invitation' && i.actor === 'me' && i.inviteResponse);
  if (myInvites.length) {
    const accepted = myInvites.filter((i) => i.inviteResponse === 'accepted').length;
    const alternative = myInvites.filter((i) => i.inviteResponse === 'alternative').length;
    const declined = myInvites.length - accepted - alternative;
    if (accepted + alternative >= myInvites.length / 2) positive++;
    if (declined >= 2) negative++;
    signals.push({
      label: 'Response to invitations',
      observation: `Of ${plural(myInvites.length, 'invitation')}: ${num(accepted)} accepted, ${num(alternative)} declined with another time suggested, ${num(declined)} declined or unanswered.`,
      tone: declined >= 2 ? 'uncertain' : accepted + alternative > 0 ? 'positive' : 'neutral',
    });
  }

  const all = contacts(items);
  const mid = addDays(asOf, -45);
  const start = addDays(asOf, -90);
  const recent = all.filter((i) => i.date > mid).length;
  const before = all.filter((i) => i.date > start && i.date <= mid).length;
  let engagement: 'up' | 'flat' | 'down' | null = null;
  if (recent + before >= 3) {
    engagement = recent > before * 1.3 ? 'up' : recent < before * 0.6 ? 'down' : 'flat';
    if (engagement === 'down') negative++;
    else if (engagement === 'up') positive++;
    signals.push({
      label: 'Engagement over time',
      observation: `${num(recent, true)} ${recent === 1 ? 'contact' : 'contacts'} in the last 45 days versus ${num(before)} in the 45 days before.`,
      tone: engagement === 'down' ? 'uncertain' : engagement === 'up' ? 'positive' : 'neutral',
    });
  }

  const withBalance = items.filter((i) => i.balance);
  const curious = items.filter((i) => i.greenFlags?.includes('curious_about_me')).length;
  if (withBalance.length || curious) {
    const balanced = withBalance.filter((i) => i.balance === 'balanced').length;
    const tone = balanced + curious >= Math.max(1, withBalance.length / 2) ? 'positive' : 'neutral';
    if (tone === 'positive') positive++;
    signals.push({ label: 'Mutual curiosity', observation: `${num(balanced, true)} balanced conversations recorded; they asked about your life ${times(curious)}.`, tone });
  }

  const remembered = items.filter((i) => i.greenFlags?.includes('remembered_details')).length;
  if (remembered) {
    positive++;
    signals.push({ label: 'Remembers what you share', observation: `Remembered something you told them ${times(remembered)}.`, tone: 'positive' });
  }

  const cancels = items.filter((i) => i.type === 'cancelled_plans' && i.actor === 'them');
  if (cancels.length) {
    const withAlt = cancels.filter((i) => i.rescheduleOffered).length;
    if (cancels.length - withAlt >= 2) negative++;
    signals.push({
      label: 'Cancellations',
      observation: `They cancelled ${times(cancels.length)}; ${num(withAlt)} with another time offered.`,
      tone: cancels.length - withAlt >= 2 ? 'uncertain' : 'neutral',
    });
  }

  if (dims.consistency.level !== 'insufficient') {
    signals.push({ label: 'Consistency', observation: dims.consistency.summary + '.', tone: dims.consistency.level === 'strong' || dims.consistency.level === 'solid' ? 'positive' : 'uncertain' });
  }

  const meetings = items.filter((i) => i.type === 'met_in_person').length;
  let status: DatingStatus;
  let statusReason: string;
  const oneWay = sample.length >= 5 && me / sample.length >= 0.75 && theirProposals === 0;
  if (items.length < PARAMS.datingMinInteractions) {
    status = 'insufficient';
    statusReason = 'Too little recorded so far to see a pattern — which is normal early on.';
  } else if (oneWay && negative >= 1) {
    status = 'low_investment';
    statusReason = 'Most of the effort so far has come from you, and they have not yet proposed meeting. This describes behavior, not their feelings.';
  } else if (positive >= 3 && negative === 0 && meetings >= 3 && engagement !== 'down') {
    status = 'developing';
    statusReason = 'Initiative, meetings and engagement are flowing both ways and holding steady.';
  } else if (positive >= 2 && negative === 0) {
    status = 'mutual_emerging';
    statusReason = 'Several signals of reciprocal effort, with nothing pointing the other way yet.';
  } else if (positive >= 1 && negative >= 1) {
    status = 'mixed';
    statusReason = 'Some signals of interest alongside some signals of hesitation. More time will clarify.';
  } else if (positive >= 1) {
    status = 'early_interest';
    statusReason = 'Early signs of effort from both sides.';
  } else if (all.length >= 5) {
    status = 'low_investment';
    statusReason = 'Most of the effort so far has come from you. This describes behavior, not their feelings.';
  } else {
    status = 'insufficient';
    statusReason = 'Not enough evidence of mutual effort either way yet.';
  }
  return { status, statusReason, signals };
}
