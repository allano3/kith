import type { Actor, Interaction, ISODate } from '../domain/types';
import { PARAMS } from './params';
import { addDays } from './time';

export type CommitmentStatus = 'open' | 'kept' | 'broken' | 'cancelled' | 'released';

export interface Commitment {
  item: Interaction;
  kind: 'promise' | 'plans';
  /** Whose commitment: for promises the promiser; for plans whoever proposed (both parties are committed). */
  owner: Actor;
  status: CommitmentStatus;
  /** Current due date after any reschedules. */
  dueDate?: ISODate;
  overdue: boolean;
  resolutions: Interaction[];
  cancelledBy?: Actor;
  /** Cancelled and nobody proposed another time. */
  neverRescheduled: boolean;
  rescheduledBy: Actor[];
}

/**
 * Derives commitment state from the log. A commitment is a `promise_made` or
 * `plans_made` interaction; resolutions link back via `relatesTo`. The latest
 * resolution wins; reschedules keep a commitment open with a new due date.
 */
export function deriveCommitments(interactions: Interaction[], asOf: ISODate): Commitment[] {
  const byTarget = new Map<string, Interaction[]>();
  for (const i of interactions) {
    if (!i.relatesTo || i.date > asOf) continue;
    const list = byTarget.get(i.relatesTo) ?? [];
    list.push(i);
    byTarget.set(i.relatesTo, list);
  }

  const out: Commitment[] = [];
  for (const item of interactions) {
    if ((item.type !== 'promise_made' && item.type !== 'plans_made') || item.date > asOf) continue;
    const resolutions = (byTarget.get(item.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    let status: CommitmentStatus = 'open';
    let dueDate = item.dueDate;
    let cancelledBy: Actor | undefined;
    let neverRescheduled = false;
    const rescheduledBy: Actor[] = [];
    for (const r of resolutions) {
      switch (r.type) {
        case 'promise_kept':
        case 'met_in_person':
        case 'collaboration_completed':
          status = 'kept';
          break;
        case 'promise_broken':
          status = 'broken';
          break;
        case 'cancelled_plans':
          status = 'cancelled';
          cancelledBy = r.actor;
          neverRescheduled = !r.rescheduleOffered;
          break;
        case 'rescheduled_plans':
          status = 'open';
          cancelledBy = undefined;
          neverRescheduled = false;
          rescheduledBy.push(r.actor);
          if (r.dueDate) dueDate = r.dueDate;
          break;
        default:
          break;
      }
    }
    if (item.released && status === 'open') status = 'released';
    // A cancellation followed by fresh plans with the same person counts as rescheduled.
    if (status === 'cancelled' && neverRescheduled) {
      const cancelDate = resolutions.filter((r) => r.type === 'cancelled_plans').at(-1)!.date;
      neverRescheduled = !interactions.some(
        (o) => o.type === 'plans_made' && o.id !== item.id && o.date >= cancelDate && o.date <= addDays(cancelDate, 30) && o.date <= asOf,
      );
    }
    const overdue =
      status === 'open' &&
      (dueDate ? dueDate < asOf : addDays(item.date, PARAMS.commitmentGraceDays) < asOf);
    out.push({
      item,
      kind: item.type === 'promise_made' ? 'promise' : 'plans',
      owner: item.actor,
      status,
      dueDate,
      overdue,
      resolutions,
      cancelledBy,
      neverRescheduled,
      rescheduledBy,
    });
  }
  return out;
}
