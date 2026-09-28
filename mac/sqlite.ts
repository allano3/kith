import { execFileSync } from 'node:child_process';

/** The system sqlite3; `node:sqlite` is not available unflagged on the Node we target. */
export const SQLITE3 = '/usr/bin/sqlite3';

export class DbError extends Error {
  readonly path: string;
  readonly detail: string;
  constructor(path: string, detail: string) {
    super(`Could not read ${path}: ${detail}`);
    this.path = path;
    this.detail = detail;
  }
  /** macOS privacy protection (TCC) refused access — the process lacks Full Disk Access. */
  get accessDenied(): boolean {
    return /authorization denied|operation not permitted/i.test(this.detail);
  }
}

/**
 * Runs one read-only query and returns the rows. Only ever interpolate integers
 * into `sql`; nothing user-supplied is spliced in as text.
 */
export function queryRows<T>(dbPath: string, sql: string): T[] {
  let out: string;
  try {
    out = execFileSync(SQLITE3, ['-init', '/dev/null', '-readonly', '-json', dbPath, sql], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stderr?: unknown; message?: string };
    const stderr = typeof err.stderr === 'string' ? err.stderr.trim() : '';
    throw new DbError(dbPath, stderr.replace(/^Error:\s*/, '') || String(err.message));
  }
  const text = out.trim();
  return text ? (JSON.parse(text) as T[]) : [];
}
