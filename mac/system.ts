import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

const SECURITY = '/usr/bin/security';
const LAUNCHCTL = '/bin/launchctl';
export const KEYCHAIN_SERVICE = 'kith-capture';
export const LAUNCH_LABEL = 'com.kith.capture';

/** The real node binary (Homebrew's /opt/homebrew/bin/node is a symlink into the Cellar). Full Disk Access is granted to this file. */
export function resolvedNode(): string {
  return realpathSync(process.execPath);
}

/** Quotes a value for a `security -i` command line: double quotes, with \ and " escaped. */
const securityArg = (s: string): string => `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

/**
 * Stores the passphrase in the login Keychain (or `keychain`, for tests). The command
 * is fed to `security -i` on stdin so the secret never appears in the process list.
 */
export function storePassphrase(passphrase: string, keychain?: string): void {
  if (/[\r\n]/.test(passphrase)) throw new Error('The passphrase cannot contain line breaks.');
  const command = [
    'add-generic-password -U',
    `-s ${securityArg(KEYCHAIN_SERVICE)}`,
    `-a ${securityArg(userInfo().username)}`,
    `-l ${securityArg('Kith capture passphrase')}`,
    `-w ${securityArg(passphrase)}`,
    keychain ? securityArg(keychain) : '',
  ].join(' ');
  spawnSync(SECURITY, ['-i'], { input: `${command}\n`, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] });
  // `security -i` exits 0 even when a command fails, so confirm by reading it back.
  if (readPassphrase(keychain) !== passphrase) throw new Error('Could not save the passphrase to the Keychain.');
}

/** The stored capture passphrase, or null when there is none. */
export function readPassphrase(keychain?: string): string | null {
  const args = ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', userInfo().username, '-g', ...(keychain ? [keychain] : [])];
  const r = spawnSync(SECURITY, args, { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) return null;
  // Printable secrets come back as `password: "…"`, others as `password: 0xHEX  "…"`.
  const line = r.stderr.split('\n').find((l) => l.startsWith('password: '));
  if (!line) return null;
  const value = line.slice('password: '.length);
  const hex = /^0x([0-9A-Fa-f]*)/.exec(value);
  if (hex) return new TextDecoder().decode(Uint8Array.from(hex[1].match(/../g) ?? [], (b) => parseInt(b, 16)));
  return value.replace(/^"/, '').replace(/"$/, '');
}

/** Whether a capture passphrase is stored, without reading the secret. */
export function hasPassphrase(): boolean {
  return spawnSync(SECURITY, ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', userInfo().username], { stdio: 'ignore' }).status === 0;
}

export const plistPath = (): string => join(homedir(), 'Library/LaunchAgents', `${LAUNCH_LABEL}.plist`);

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** LaunchAgent that runs `run` daily at 23:00 (or at next wake if the Mac was asleep). */
export function buildPlist(p: { node: string; script: string; workingDir: string; log: string }): string {
  const args = [p.node, '--experimental-strip-types', '--disable-warning=ExperimentalWarning', p.script, 'run'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(p.workingDir)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>23</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(p.log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(p.log)}</string>
</dict>
</plist>
`;
}

const domain = (): string => `gui/${process.getuid?.() ?? userInfo().uid}`;

export function launchctl(...args: string[]): { ok: boolean; output: string } {
  const r = spawnSync(LAUNCHCTL, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

export function loadAgent(): { ok: boolean; output: string } {
  launchctl('bootout', `${domain()}/${LAUNCH_LABEL}`);
  return launchctl('bootstrap', domain(), plistPath());
}

export function unloadAgent(): { ok: boolean; output: string } {
  return launchctl('bootout', `${domain()}/${LAUNCH_LABEL}`);
}

export function agentLoaded(): boolean {
  return launchctl('print', `${domain()}/${LAUNCH_LABEL}`).ok;
}

/** Reads a line from the terminal without echoing it. */
export function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return Promise.reject(new Error('This needs an interactive terminal.'));
  process.stdout.write(question);
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  let value = '';
  const finish = () => {
    stdin.off('data', onData);
    stdin.setRawMode(false);
    stdin.pause();
    process.stdout.write('\n');
  };
  const onData = (chunk: string) => {
    for (const ch of chunk) {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        finish();
        resolve(value);
        return;
      }
      if (ch === '\u0003') {
        finish();
        reject(new Error('Cancelled.'));
        return;
      }
      if (ch === '\u007f' || ch === '\b') value = Array.from(value).slice(0, -1).join('');
      else if (ch >= ' ') value += ch;
    }
  };
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.on('data', onData);
  stdin.resume();
  return promise;
}
