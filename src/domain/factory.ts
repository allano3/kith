import { INTERACTION_TYPE } from './taxonomy';
import type { Actor, CaptureState, Interaction, InteractionTypeId, Person, Settings, Vault } from './types';

export function newId(): string {
  return crypto.randomUUID();
}

export function defaultSettings(): Settings {
  return {
    values: [],
    ai: {
      provider: 'off',
      baseUrl: 'http://localhost:11434/v1',
      model: '',
      apiKey: '',
      pseudonymize: true,
      includeNotes: false,
    },
    autoLockMinutes: 15,
  };
}

export function emptyCapture(): CaptureState {
  return { pending: [], importedBundles: [], reviewedGuids: [], aliases: {}, ignored: [] };
}

export function emptyVault(): Vault {
  return { version: 1, people: [], interactions: [], settings: defaultSettings(), capture: emptyCapture() };
}

export function newPerson(fields: Partial<Person> & Pick<Person, 'name'>): Person {
  const now = new Date().toISOString();
  return {
    id: newId(),
    categories: ['friend'],
    circle: null,
    contexts: [],
    domainTrust: {},
    values: {},
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

/** Default actor for a type: the first allowed actor in the taxonomy. */
export function defaultActor(type: InteractionTypeId): Actor {
  return Object.keys(INTERACTION_TYPE[type].actors)[0] as Actor;
}

export function newInteraction(fields: Partial<Interaction> & Pick<Interaction, 'personId' | 'type' | 'date'>): Interaction {
  const now = new Date().toISOString();
  return {
    id: newId(),
    actor: defaultActor(fields.type),
    significance: 'routine',
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}
