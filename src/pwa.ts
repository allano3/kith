/** Installed-app plumbing: offline cache, durable storage, and saving files on iOS. */

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is an enhancement; the app works without it.
    });
  });
}

/** True when launched from the Home Screen rather than in a browser tab. */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type StorageDurability = 'persistent' | 'best-effort' | 'unsupported';

/**
 * Asks the browser to exempt the vault from storage eviction. iOS grants this
 * most readily to apps launched from the Home Screen; the encrypted backup
 * export remains the real safety net.
 */
export async function requestPersistentStorage(): Promise<StorageDurability> {
  if (!navigator.storage?.persist) return 'unsupported';
  if (await navigator.storage.persisted()) return 'persistent';
  return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
}

/**
 * Saves a file. Installed iOS web apps ignore `<a download>`, so on phones,
 * where the share sheet accepts files, we use it (→ "Save to Files"); otherwise a normal download.
 */
export async function saveFile(fileName: string, data: unknown): Promise<void> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const file = new File([blob], fileName, { type: 'application/json' });
  const phoneLike = isStandalone() || window.matchMedia('(pointer: coarse)').matches;
  if (phoneLike && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
