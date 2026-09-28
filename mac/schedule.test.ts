import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './capture.ts';
import { buildPlist } from './system.ts';

describe('schedule config', () => {
  it('defaults existing configs without a schedule to daily at 23:00', () => {
    expect(parseConfig('{"friends": []}').schedule).toEqual({ every: 'day', weekday: 'sunday', time: '23:00' });
  });

  it('accepts a weekly schedule, case-insensitively, and rejects invalid days and times', () => {
    expect(parseConfig('{"schedule": {"every": "week", "weekday": "Friday", "time": "7:30"}}').schedule).toEqual({ every: 'week', weekday: 'friday', time: '7:30' });
    expect(() => parseConfig('{"schedule": {"every": "month"}}')).toThrow(ConfigError);
    expect(() => parseConfig('{"schedule": {"every": "week", "weekday": "funday"}}')).toThrow(ConfigError);
    expect(() => parseConfig('{"schedule": {"time": "24:00"}}')).toThrow(ConfigError);
  });
});

describe('LaunchAgent plist', () => {
  const base = { node: '/usr/local/bin/node', script: '/repo/mac/kith-capture.ts', workingDir: '/repo', log: '/tmp/capture.log' };

  /** Converts the plist to JSON with plutil, which also proves launchd can parse it. */
  function interval(plist: string): Record<string, number> {
    const dir = mkdtempSync(join(tmpdir(), 'kith-plist-'));
    try {
      const file = join(dir, 'job.plist');
      writeFileSync(file, plist);
      const r = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' });
      expect(r.status).toBe(0);
      return JSON.parse(r.stdout).StartCalendarInterval;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('runs every day when daily', () => {
    expect(interval(buildPlist({ ...base, schedule: { every: 'day', weekday: 'sunday', time: '23:00' } }))).toEqual({ Hour: 23, Minute: 0 });
  });

  it('runs on one weekday when weekly (launchd counts Sunday as 0)', () => {
    expect(interval(buildPlist({ ...base, schedule: { every: 'week', weekday: 'sunday', time: '23:00' } }))).toEqual({ Weekday: 0, Hour: 23, Minute: 0 });
    expect(interval(buildPlist({ ...base, schedule: { every: 'week', weekday: 'friday', time: '07:30' } }))).toEqual({ Weekday: 5, Hour: 7, Minute: 30 });
  });
});
