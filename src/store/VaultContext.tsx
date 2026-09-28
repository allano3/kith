import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addSuggestion,
  assignSender,
  editSuggestion,
  finishConversation,
  forgetPerson,
  importBundles,
  skipSuggestion,
  type BatchImportSummary,
  type SuggestionPatch,
} from '../capture/inbox';
import type { CaptureBundle } from '../capture/types';
import { demoVault } from '../domain/demo';
import { emptyCapture, emptyVault, newId } from '../domain/factory';
import type { Interaction, Person, Settings, Vault } from '../domain/types';
import { assessAll, type Assessment } from '../engine';
import { today } from '../engine/time';
import { deriveKey, isSealed, seal, unseal, type SealedVault, type VaultKey } from './crypto';
import { destroyAll, loadSealed, saveSealed } from './idb';

export type VaultStatus = 'loading' | 'new' | 'locked' | 'unlocked';

export interface VaultApi {
  status: VaultStatus;
  vault: Vault;
  asOf: string;
  assessments: Map<string, Assessment>;
  /** Creates a new encrypted vault. */
  create(passphrase: string, withDemo: boolean): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
  savePerson(p: Person): void;
  /** Hard-deletes a person and every interaction recorded about them. */
  deletePerson(id: string): void;
  saveInteraction(i: Interaction): void;
  deleteInteraction(id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  replaceVault(v: Vault): void;
  changePassphrase(next: string): Promise<void>;
  exportSealed(): Promise<SealedVault>;
  /** Irreversibly deletes all local data. */
  destroy(): Promise<void>;
  /** Adds decrypted capture bundles to the inbox (oldest first, deduped). */
  importCapture(bundles: CaptureBundle[]): BatchImportSummary;
  /** Remembers (or with `undefined` forgets) the capture passphrase inside the encrypted vault. */
  setCapturePassphrase(passphrase: string | undefined): void;
  /** Matches a captured sender to a person, or with `null` ignores them permanently. */
  assignCaptureSender(friend: string, personId: string | null): void;
  /** Removes a sender's alias and un-ignores them. */
  forgetCaptureSender(friend: string): void;
  editCaptureSuggestion(convId: string, sugId: string, patch: SuggestionPatch): void;
  /** Applies the user's edits and logs a suggestion; `paused` when it opened a Pause & Reflect decision. */
  addCaptureSuggestion(convId: string, sugId: string, patch: SuggestionPatch): { entry: Interaction; paused: boolean };
  skipCaptureSuggestion(convId: string, sugId: string): void;
  /** Deletes a conversation's message text, keeping only GUIDs for dedupe. */
  finishCaptureConversation(convId: string): void;
}

const Ctx = createContext<VaultApi | null>(null);

export function useVault(): VaultApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVault outside VaultProvider');
  return v;
}

/** Normalizes vaults from older exports or partial imports. */
export function normalizeVault(raw: unknown): Vault {
  const v = raw as Partial<Vault>;
  if (!v || v.version !== 1 || !Array.isArray(v.people) || !Array.isArray(v.interactions)) {
    throw new Error('This file is not a Kith vault.');
  }
  const base = emptyVault();
  return {
    ...base,
    ...v,
    settings: { ...base.settings, ...v.settings, ai: { ...base.settings.ai, ...v.settings?.ai } },
    capture: { ...emptyCapture(), ...v.capture },
  } as Vault;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading');
  const [vault, setVault] = useState<Vault>(emptyVault);
  const keyRef = useRef<VaultKey | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    loadSealed()
      .then((s) => setStatus(s ? 'locked' : 'new'))
      .catch(() => setStatus('new'));
  }, []);

  // Every change is sealed and written in order. Nothing is stored unencrypted.
  const persist = useCallback((next: Vault) => {
    const key = keyRef.current;
    if (!key) return;
    saving.current = saving.current.then(async () => saveSealed(await seal(key, JSON.stringify(next))));
  }, []);

  const mutate = useCallback(
    (fn: (v: Vault) => Vault) => {
      setVault((prev) => {
        const next = fn(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const create = useCallback(async (passphrase: string, withDemo: boolean) => {
    const key = await deriveKey(passphrase);
    keyRef.current = key;
    const v = withDemo ? demoVault(today()) : emptyVault();
    await saveSealed(await seal(key, JSON.stringify(v)));
    setVault(v);
    setStatus('unlocked');
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    const sealed = await loadSealed();
    if (!sealed || !isSealed(sealed)) throw new Error('No vault found on this device.');
    const { plaintext, key } = await unseal(sealed, passphrase);
    keyRef.current = key;
    setVault(normalizeVault(JSON.parse(plaintext)));
    setStatus('unlocked');
  }, []);

  const lock = useCallback(() => {
    keyRef.current = null;
    setVault(emptyVault());
    setStatus('locked');
  }, []);

  const api = useMemo<VaultApi>(() => {
    const asOf = today();
    return {
      status,
      vault,
      asOf,
      assessments: status === 'unlocked' ? assessAll(vault.people, vault.interactions, asOf) : new Map(),
      create,
      unlock,
      lock,
      savePerson: (p) =>
        mutate((v) => {
          const stamped = { ...p, updatedAt: new Date().toISOString() };
          const exists = v.people.some((x) => x.id === p.id);
          return { ...v, people: exists ? v.people.map((x) => (x.id === p.id ? stamped : x)) : [...v.people, stamped] };
        }),
      deletePerson: (id) =>
        mutate((v) => ({
          ...v,
          people: v.people.filter((p) => p.id !== id),
          interactions: v.interactions.filter((i) => i.personId !== id),
          capture: v.capture && forgetPerson(v.capture, id),
        })),
      saveInteraction: (i) =>
        mutate((v) => {
          const stamped = { ...i, updatedAt: new Date().toISOString() };
          const exists = v.interactions.some((x) => x.id === i.id);
          return { ...v, interactions: exists ? v.interactions.map((x) => (x.id === i.id ? stamped : x)) : [...v.interactions, stamped] };
        }),
      deleteInteraction: (id) =>
        mutate((v) => ({
          ...v,
          // Resolutions pointing at a deleted commitment lose their link rather than dangling.
          interactions: v.interactions.filter((i) => i.id !== id).map((i) => (i.relatesTo === id ? { ...i, relatesTo: undefined } : i)),
        })),
      updateSettings: (patch) => mutate((v) => ({ ...v, settings: { ...v.settings, ...patch } })),
      replaceVault: (next) => mutate(() => next),
      changePassphrase: async (next) => {
        keyRef.current = await deriveKey(next);
        await saving.current;
        await saveSealed(await seal(keyRef.current, JSON.stringify(vault)));
      },
      exportSealed: async () => {
        if (!keyRef.current) throw new Error('Vault is locked.');
        return seal(keyRef.current, JSON.stringify(vault));
      },
      destroy: async () => {
        await saving.current;
        keyRef.current = null;
        await destroyAll();
        setVault(emptyVault());
        setStatus('new');
      },
      importCapture: (bundles) => {
        const now = new Date().toISOString();
        mutate((v) => importBundles(v, bundles, asOf, now).vault);
        return importBundles(vault, bundles, asOf, now).summary;
      },
      setCapturePassphrase: (passphrase) =>
        mutate((v) => {
          const { passphrase: _old, ...rest } = v.capture ?? emptyCapture();
          return { ...v, capture: passphrase ? { ...rest, passphrase } : rest };
        }),
      assignCaptureSender: (friend, personId) => mutate((v) => assignSender(v, friend, personId, asOf)),
      forgetCaptureSender: (friend) =>
        mutate((v) => {
          const c = v.capture ?? emptyCapture();
          return {
            ...v,
            capture: {
              ...c,
              aliases: Object.fromEntries(Object.entries(c.aliases).filter(([name]) => name !== friend)),
              ignored: c.ignored.filter((name) => name !== friend),
            },
          };
        }),
      editCaptureSuggestion: (convId, sugId, patch) => mutate((v) => editSuggestion(v, convId, sugId, patch)),
      addCaptureSuggestion: (convId, sugId, patch) => {
        const id = newId();
        const result = addSuggestion(editSuggestion(vault, convId, sugId, patch), convId, sugId, asOf, id);
        mutate((v) => {
          // A second tap before re-render finds the suggestion already added; leave the vault as is.
          try {
            return addSuggestion(editSuggestion(v, convId, sugId, patch), convId, sugId, asOf, id).vault;
          } catch {
            return v;
          }
        });
        return { entry: result.entry, paused: result.paused };
      },
      skipCaptureSuggestion: (convId, sugId) => mutate((v) => skipSuggestion(v, convId, sugId, asOf)),
      finishCaptureConversation: (convId) => mutate((v) => finishConversation(v, convId, asOf)),
    };
  }, [status, vault, create, unlock, lock, mutate]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
