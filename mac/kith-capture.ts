/**
 * Kith capture: reads Messages on this Mac, keeps only 1:1 conversations with the
 * friends listed in ~/.kith/capture.json, and writes an encrypted bundle to iCloud
 * Drive for the Kith app's Inbox. See docs/CAPTURE.md.
 *
 *   npm run capture -- setup | friends [add|remove] | run [--since YYYY-MM-DD] [--dry-run] | install | uninstall | status
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  ConfigError,
  DEFAULT_CONFIG,
  defaultPaths,
  expandHome,
  loadConfig,
  loadState,
  resolveFriends,
  runCapture,
  saveConfig,
  summaryLine,
  type CaptureConfig,
} from './capture.ts';
import { ContactMatchError, resolveContact } from './contacts.ts';
import { DbError, queryRows } from './sqlite.ts';
import {
  agentLoaded,
  buildPlist,
  hasPassphrase,
  loadAgent,
  plistPath,
  promptHidden,
  readPassphrase,
  resolvedNode,
  storePassphrase,
  unloadAgent,
} from './system.ts';

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), '..');
const paths = defaultPaths();
const MIN_PASSPHRASE = 8;

class UsageError extends Error {}

interface Parsed {
  positional: string[];
  flags: Record<string, string[]>;
}

/** `--name value` and `--flag` (boolean when listed in `booleans`); repeated flags accumulate. */
function parseArgs(args: string[], booleans: string[] = []): Parsed {
  const out: Parsed = { positional: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      out.positional.push(a);
      continue;
    }
    const name = a.slice(2);
    let value = 'true';
    if (!booleans.includes(name)) {
      value = args[++i];
      if (value === undefined) throw new UsageError(`--${name} needs a value.`);
    }
    (out.flags[name] ??= []).push(value);
  }
  return out;
}

function fullDiskAccessHelp(): string {
  const node = resolvedNode();
  return [
    'macOS is blocking access to Messages/Contacts: this program needs Full Disk Access.',
    '  1. Open System Settings → Privacy & Security → Full Disk Access.',
    '  2. Click +, press Cmd-Shift-G and paste:',
    `       ${node}`,
    '     then click Open and make sure its switch is on.',
    '  The nightly job runs as that node binary. When you run commands by hand from a',
    '  terminal, macOS checks the terminal app instead (Terminal, iTerm, VS Code…), so grant',
    '  it too if you want to use `friends` or `run --dry-run` interactively.',
    '  After `brew upgrade node` the path changes: grant the new one and run `install` again.',
  ].join('\n');
}

/** Turns known failures into a readable message (never message text). */
function explain(e: unknown): string {
  if (e instanceof DbError && e.accessDenied) return `${e.message}\n${fullDiskAccessHelp()}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

function ensureKithDir(): void {
  mkdirSync(paths.kithDir, { recursive: true, mode: 0o700 });
  chmodSync(paths.kithDir, 0o700);
}

function loadOrDefaultConfig(): CaptureConfig {
  return existsSync(paths.configFile) ? loadConfig(paths.configFile) : { ...DEFAULT_CONFIG, friends: [] };
}

async function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function setup(): Promise<void> {
  ensureKithDir();
  if (existsSync(paths.configFile)) console.log(`Config already exists: ${paths.configFile}`);
  else {
    saveConfig(paths.configFile, { ...DEFAULT_CONFIG, friends: [] });
    console.log(`Created ${paths.configFile}`);
  }
  if (hasPassphrase() && !(await askYesNo('A capture passphrase is already in the Keychain. Replace it?'))) {
    console.log('Kept the existing passphrase.');
  } else {
    console.log(
      `Choose a capture passphrase (at least ${MIN_PASSPHRASE} characters). You'll type it on your iPhone when importing;\n` +
        'it is different from your Kith vault passphrase. It is stored in your login Keychain.',
    );
    for (let attempt = 0; ; attempt++) {
      const first = await promptHidden('Capture passphrase: ');
      const second = first.length >= MIN_PASSPHRASE ? await promptHidden('Again: ') : '';
      if (first.length < MIN_PASSPHRASE) console.log(`Too short — use at least ${MIN_PASSPHRASE} characters.`);
      else if (first !== second) console.log("Those didn't match.");
      else {
        storePassphrase(first);
        console.log('Saved to the Keychain (service "kith-capture").');
        break;
      }
      if (attempt === 2) throw new Error('No passphrase saved. Run setup again.');
    }
  }
  console.log(`
Next steps:
  1. Grant Full Disk Access to ${resolvedNode()} (see docs/CAPTURE.md).
  2. Add friends, using the same name as in Kith:
       npm run capture -- friends add "Sarah" --contact "Sarah Whitfield"
  3. Check what would be captured:   npm run capture -- run --dry-run
  4. Schedule it nightly at 23:00:   npm run capture -- install`);
}

function friendsList(config: CaptureConfig): void {
  if (config.friends.length === 0) {
    console.log('No friends configured. Add one: npm run capture -- friends add "<Kith name>" [--contact "<Contacts name>"] [--handle <phone|email>]');
    return;
  }
  for (const f of config.friends) {
    if (f.handles?.length) {
      console.log(`${f.name}: ${f.handles.join(', ')} (from config)`);
      continue;
    }
    try {
      const { contact, handles } = resolveContact(f.contact ?? f.name, paths.addressBookDir);
      console.log(`${f.name}: ${handles.join(', ')} (Contacts: ${contact})`);
    } catch (e) {
      console.log(`${f.name}: NOT RESOLVED — ${explain(e)}`);
    }
  }
}

function friends(args: string[]): void {
  const { positional, flags } = parseArgs(args);
  const [sub, name, ...extra] = positional;
  if (!sub || sub === 'list') {
    friendsList(loadConfig(paths.configFile));
    return;
  }
  if (!name?.trim() || extra.length) throw new UsageError(`Usage: friends ${sub} "<Kith name>"${sub === 'add' ? ' [--contact "<Contacts name>"] [--handle <phone|email>]…' : ''}`);
  ensureKithDir();
  const config = loadOrDefaultConfig();
  const index = config.friends.findIndex((f) => f.name.toLowerCase() === name.trim().toLowerCase());
  if (sub === 'remove') {
    if (index < 0) throw new UsageError(`${name} is not in the list.`);
    config.friends.splice(index, 1);
    saveConfig(paths.configFile, config);
    console.log(`Removed ${name}. Messages already imported into Kith are unaffected.`);
    return;
  }
  if (sub !== 'add') throw new UsageError('Usage: friends [list | add | remove]');
  const friend = index >= 0 ? config.friends[index] : { name: name.trim() };
  if (flags.contact) friend.contact = flags.contact.at(-1);
  if (flags.handle) friend.handles = [...new Set([...(friend.handles ?? []), ...flags.handle.map((h) => h.trim())])];
  if (index < 0) config.friends.push(friend);
  saveConfig(paths.configFile, config);
  console.log(`${index >= 0 ? 'Updated' : 'Added'} ${friend.name}.`);
  friendsList({ ...config, friends: [friend] });
}

function parseSince(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m && new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!d || d.getMonth() !== Number(m[2]) - 1) throw new UsageError('--since needs a date like 2026-09-01.');
  return d;
}

async function run(args: string[]): Promise<void> {
  const { flags } = parseArgs(args, ['dry-run']);
  const dryRun = Boolean(flags['dry-run']);
  const since = parseSince(flags.since?.at(-1));
  const now = new Date();
  const config = loadConfig(paths.configFile);
  if (config.friends.length === 0) throw new ConfigError('No friends configured; nothing to capture. See: npm run capture -- friends add');
  const friendList = resolveFriends(config, paths.addressBookDir);
  const passphrase = dryRun ? undefined : readPassphrase();
  if (!dryRun && !passphrase) throw new ConfigError('No capture passphrase in the Keychain. Run: npm run capture -- setup');
  const result = await runCapture({ config, friends: friendList, paths, passphrase: passphrase ?? undefined, since, dryRun, now });
  if (dryRun) {
    for (const f of result.perFriend) {
      const range = f.firstDate ? `, ${f.firstDate} → ${f.lastDate}` : '';
      console.log(`${f.name}: ${f.received} received, ${config.includeSent ? `${f.sent} sent` : 'sent not included'}${range}`);
    }
  }
  console.log(summaryLine(result, now, dryRun));
}

function install(): void {
  ensureKithDir();
  const node = resolvedNode();
  mkdirSync(dirname(plistPath()), { recursive: true });
  writeFileSync(plistPath(), buildPlist({ node, script: SCRIPT, workingDir: REPO, log: paths.logFile }), { mode: 0o644 });
  const loaded = loadAgent();
  if (!loaded.ok) throw new Error(`Wrote ${plistPath()} but launchctl could not load it: ${loaded.output}`);
  console.log(`Installed ${plistPath()}: runs nightly at 23:00 (or at next wake if the Mac is asleep then).`);
  console.log(`Log: ${paths.logFile}`);
  if (!existsSync(paths.configFile)) console.log('Warning: no config yet. Run: npm run capture -- setup');
  if (!hasPassphrase()) console.log('Warning: no capture passphrase in the Keychain. Run: npm run capture -- setup');
  console.log(`Make sure ${node} has Full Disk Access (npm run capture -- status checks).`);
}

function uninstall(): void {
  const unloaded = unloadAgent();
  const existed = existsSync(plistPath());
  rmSync(plistPath(), { force: true });
  console.log(existed || unloaded.ok ? `Removed the nightly job (${plistPath()}).` : 'The nightly job was not installed.');
  console.log(`Kept: ${paths.kithDir} (config, state, log), the Keychain item "kith-capture", and bundles in iCloud Drive. See docs/CAPTURE.md to remove them.`);
}

function status(): void {
  const line = (label: string, value: string) => console.log(`${label.padEnd(18)} ${value}`);
  let config: CaptureConfig | undefined;
  try {
    config = loadConfig(paths.configFile);
    line('Config', paths.configFile);
    line('Friends', config.friends.length ? config.friends.map((f) => f.name).join(', ') : 'none yet');
    line('Includes', `${config.includeSent ? 'received + sent' : 'received only'}; group chats ${config.includeGroupChats ? 'on' : 'off'}`);
    const out = expandHome(config.outputDir);
    line('Output folder', `${out}${existsSync(out) ? '' : ' (will be created on first bundle)'}`);
    line('Retention', config.retentionDays > 0 ? `${config.retentionDays} days` : 'keep all bundles');
  } catch (e) {
    line('Config', explain(e));
  }
  line('Keychain', hasPassphrase() ? 'capture passphrase stored' : 'no capture passphrase (run setup)');
  try {
    const state = loadState(paths.stateFile);
    line('Last run', state ? `${state.lastRun} (last ROWID ${state.lastRowId})` : 'never');
  } catch (e) {
    line('Last run', `unreadable state file: ${explain(e)}`);
  }

  let blocked = false;
  const probe = (label: string, check: () => string) => {
    try {
      line(label, check());
    } catch (e) {
      blocked ||= e instanceof DbError && e.accessDenied;
      line(label, e instanceof DbError && e.accessDenied ? 'NOT READABLE (no Full Disk Access)' : `NOT READABLE: ${explain(e)}`);
    }
  };
  probe('Messages chat.db', () => {
    queryRows(paths.chatDb, 'SELECT MAX(ROWID) FROM message');
    return `readable (${paths.chatDb})`;
  });
  if (config?.friends.some((f) => !f.handles?.length)) {
    probe('Contacts', () => {
      resolveFriends(config, paths.addressBookDir);
      return 'all friends resolve to handles';
    });
  }

  const node = resolvedNode();
  if (!existsSync(plistPath())) line('Nightly job', 'not installed (run install)');
  else {
    const plist = readFileSync(plistPath(), 'utf8');
    const plistNode = /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]*)<\/string>/.exec(plist)?.[1];
    line('Nightly job', `${agentLoaded() ? 'loaded' : 'installed but NOT loaded (run install again)'}; 23:00 daily`);
    if (plistNode && plistNode !== node)
      line('', `uses ${plistNode}${existsSync(plistNode) ? '' : ' (missing)'}; current node is ${node}. Run install again and grant Full Disk Access to the new path.`);
  }
  line('Log', paths.logFile);
  line('Node binary', node);
  if (blocked) console.log(`\n${fullDiskAccessHelp()}`);
}

const HELP = `Kith capture — nightly Messages → Kith Inbox bundles (see docs/CAPTURE.md)

  npm run capture -- setup                    create ~/.kith and store the capture passphrase
  npm run capture -- friends                  list friends and the handles each resolves to
  npm run capture -- friends add "<Kith name>" [--contact "<Contacts name>"] [--handle <phone|email>]…
  npm run capture -- friends remove "<Kith name>"
  npm run capture -- run [--since YYYY-MM-DD] [--dry-run]
  npm run capture -- install | uninstall      schedule / unschedule the 23:00 job
  npm run capture -- status`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'setup':
      return setup();
    case 'friends':
      return friends(rest);
    case 'run':
      return run(rest);
    case 'install':
      return install();
    case 'uninstall':
      return uninstall();
    case 'status':
      return status();
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);
      return;
    default:
      throw new UsageError(`Unknown command "${command}".\n\n${HELP}`);
  }
}

main().catch((e: unknown) => {
  const known = e instanceof UsageError || e instanceof ConfigError || e instanceof ContactMatchError || e instanceof DbError;
  console.error(`${new Date().toISOString()} error: ${explain(e)}`);
  if (!known && e instanceof Error && e.stack) console.error(e.stack);
  process.exitCode = 1;
});
