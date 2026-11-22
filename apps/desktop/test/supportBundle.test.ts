import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanSnapshot, composeBundle, MAX_BUNDLE_BYTES, writeBundle, type BundleInput } from '../src/main/supportBundle';
import { makeRedactor } from '../src/main/redact';
import type { SaberRecord } from '../src/shared/api';
import { withWiringConfirmation, type SaberConfigModel } from '@hiltwright/core';

const redact = makeRedactor({ home: 'C:\\Users\\Al', user: 'Al', host: 'DESKTOP-SAM7' });
const now = new Date(2026, 8, 25, 16, 0, 0);

const saber = {
  id: 'ea8dbea42e78', name: 'hote2', firstSeen: '2026-09-25T22:34:01.731Z', lastSeen: '2026-09-25T22:40:00.000Z',
  identity: { usbSerial: '209133815232', configName: 'config/hiltwright_hote2.h', version: 'v8.10 hiltwright ce12a06', prop: 'SaberFett263Buttons', buttons: 2, installed: 'Sep 13 2026', pixelBlades: [132, 1, 2], bladeConfig: 0 },
  presets: [], fonts: ['GeneralPrincess'], tracks: [],
  model: {
    name: 'hiltwright_hote2', board: 'V2', boardFrom: 'owner', buttons: 2, prop: 'fett263',
    blades: [{ id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { data: 2, power: [2, 3] } }],
    presets: [{ name: 'Kylo', font: 'Kylo;common', track: 'tracks/kylo.wav', looks: { main: 'SECRET_LOOK_ID' }, lookArgs: { main: 'SECRET_ARGS 255,0,0' } }],
    looks: [{ id: 'SECRET_LOOK_ID', code: 'StylePtr<SECRET_STYLE_CODE>()' }],
  },
  firmware: { hash: 'abcdef0123456789', os: 'v8.10', at: '2026-09-25T12:00:00Z', looks: [], presets: [{ name: 'Kylo', looks: [] }] },
} as unknown as SaberRecord;
saber.model = withWiringConfirmation(saber.model as SaberConfigModel, true, '2026-09-25T10:00:00Z');

const base = (over: Partial<BundleInput> = {}): BundleInput => ({
  now,
  about: { app: '0.1.0', packaged: true, os: 'Windows 11 Pro 10.0.26200', arch: 'x64', electron: '37.2.0', chrome: '138.0' },
  toolchain: { root: 'C:\\Users\\Al\\AppData\\Local\\Hiltwright\\tc', cli: true, cliVersion: '1.3.1', core: true, gcc: true, dfuUtil: 'x', proffieOS: true, proffieOSVersion: 'v8.10', ready: true, freeBytes: 50 * 1048576, pathTooLong: false, versions: { cli: '1.3.1', core: '4.6', proffieOS: 'v8.10' }, open: false },
  usb: { runtimePresent: true, bootloaderPresent: false, bootloaderDriver: null, bootloaderProblem: null, bootloaders: [], runtimeSerials: ['209133815232'], runtimeNoSerial: 0 },
  connection: { status: 'connected', error: null, port: '1209:6668', board: { version: 'v8.10', config: 'hote2.h', prop: 'Fett263', buttons: 2, battery: 3.9, volume: 1800, presets: 13, fonts: 18, tracks: 22, blades: [132, 1, 2] }, pauses: 2, saberId: 'ea8dbea42e78' },
  saber,
  lastBuild: { at: '2026-09-25T15:59:00Z', saberId: 'ea8dbea42e78', ok: false, cached: false, ms: 61000, textBytes: 225000, flashBytes: 262144, flashPct: 86, warnings: ['Blade 2 has no style'], problems: ['The firmware is too big for this board.'] },
  currentLog: { name: 'hiltwright-20260925-155500.log', text: '15:55 [board] > hwt| version\n15:55 [board] < 1,24,hwt|v8.10' },
  previousLog: { name: 'hiltwright-20260925-120000.log', text: '12:00 [main] Hiltwright 0.1.0 packaged' },
  ...over,
});

describe('the diagnostics file', () => {
  it('has every section, with the saber, the build and the logs', () => {
    const t = composeBundle(base(), redact);
    for (const h of ['== About ==', '== Toolchain ==', '== USB ==', '== Connection ==', '== Saber ==', '== Last build in this run ==', '== Log of this run (hiltwright-20260925-155500.log) ==', "== End of the previous run's log (hiltwright-20260925-120000.log) =="]) expect(t).toContain(h);
    expect(t).toContain('Hiltwright: 0.1.0 (packaged build)');
    expect(t).toContain('System: Windows 11 Pro 10.0.26200');
    expect(t).toContain('ProffieOS: v8.10');
    expect(t).toContain('Status: connected');
    expect(t).toContain('Link pauses this connection: 2');
    expect(t).toContain('Name: hote2');
    expect(t).toContain('wiring confirmed');
    expect(t).toContain('1. Kylo | font Kylo;common | track tracks/kylo.wav');
    expect(t).toContain('Flash use: 225000 of 262144 bytes (86%)');
    expect(t).toContain('  - The firmware is too big for this board.');
    expect(t).toContain('  - Blade 2 has no style');
    expect(t).toContain('[board] > hwt| version');
  });

  it('says so when no saber is connected and nothing was built', () => {
    const t = composeBundle(base({ connection: { status: 'idle', error: null, port: null, board: null, pauses: 0, saberId: null }, saber: null, lastBuild: null, previousLog: null }), redact);
    expect(t).toContain('no saber connected');
    expect(t).toContain('No saber chosen.');
    expect(t).toContain('No build in this run.');
    expect(t).toContain('== Toolchain ==');
    expect(t).toContain('[board] > hwt| version');
  });

  it("lists the saber's own presets when no model is saved yet, without their styles", () => {
    const bare = { ...saber, model: undefined, presets: [{ name: 'Vader', font: 'Vader;common', track: 'tracks/imperial.wav', styles: ['builtin 0 1 SECRET_ARG'], variation: 0 }] } as unknown as SaberRecord;
    const t = composeBundle(base({ saber: bare }), redact);
    expect(t).toContain('Model: none saved yet');
    expect(t).toContain('1. Vader | font Vader;common | track tracks/imperial.wav');
    expect(t).not.toContain('SECRET');
  });

  it('never includes style code, style ids or arguments, or config text', () => {
    const t = composeBundle(base(), redact);
    expect(t).not.toContain('SECRET');
    expect(t).not.toContain('StylePtr');
  });

  it('cuts an oversized log from the oldest end, says so, and stays under 2 MB', () => {
    const big = Array.from({ length: 60000 }, (_, i) => `line ${String(i).padStart(6, '0')} ${'x'.repeat(40)}`).join('\n');
    const t = composeBundle(base({ currentLog: { name: 'hiltwright-20260925-155500.log', text: big }, previousLog: { name: 'p.log', text: big } }), redact);
    expect(Buffer.byteLength(t)).toBeLessThan(MAX_BUNDLE_BYTES);
    expect(t).toContain('line 059999');
    expect(t).not.toContain('line 000000 ');
    expect(t).toMatch(/\[\d+ older lines left out to keep this file small\]/);
  });

  it('is redacted', () => {
    const t = composeBundle(base({ connection: { ...base().connection, error: 'Could not open \\\\DESKTOP-SAM7\\x for Al' } }), redact);
    expect(t).toContain('Folder: %USERPROFILE%\\AppData\\Local\\Hiltwright\\tc');
    expect(t).toContain('<computer>');
    expect(t).not.toMatch(/C:\\Users\\Al\b/);
    expect(t).not.toMatch(/\bAl\b/);
    expect(t).not.toContain('DESKTOP-SAM7');
  });

  // Issue #24: serials show only their last four characters, the same in the Saber section and in the logs, and the
  // header says so.
  it('masks serial numbers to their last four characters, in the saber section and the logs alike', () => {
    const withCard = { ...saber, cards: [{ serial: '1A2B3C4D', label: 'SABER', at: '2026-09-25T10:00:00Z' }] } as SaberRecord;
    const log = '15:55 [library] saber ea8dbea42e78 "hote2" serial=209133815232\n15:56 [sd] E:\\ (1A2B3C4D) remembered as hote2\'s card\n15:57 Found DFU: [0483:df11] serial="205E35774D4B"';
    const t = composeBundle(base({ saber: withCard, currentLog: { name: 'hiltwright-20260925-155500.log', text: log } }), redact);
    expect(t).toContain('USB serial ****5232');
    expect(t).toContain('serial=****5232');
    expect(t).toContain('(****3C4D)');
    expect(t).toContain('serial="****4D4B"');
    expect(t).not.toContain('209133815232');
    expect(t).not.toContain('1A2B3C4D');
    expect(t).not.toContain('205E35774D4B');
    expect(t).toContain('last four characters');
  });
});

describe('writing the file', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hw-support-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('names it by date and time, uses Windows line endings, and keeps the ten newest', () => {
    for (let i = 1; i <= 10; i++) writeFileSync(join(dir, `hiltwright-diagnostics-202609${String(i).padStart(2, '0')}-120000.txt`), 'x');
    const file = writeBundle(dir, 'a\nb', now);
    expect(file.endsWith('hiltwright-diagnostics-20260925-160000.txt')).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('a\r\nb');
    const left = readdirSync(dir);
    expect(left).toHaveLength(10);
    expect(left).not.toContain('hiltwright-diagnostics-20260901-120000.txt');
    expect(writeBundle(dir, 'again', now).endsWith('-160000-2.txt')).toBe(true);
  });
});

describe("the page's snapshot", () => {
  it('keeps only expected fields and cuts long strings', () => {
    const s = cleanSnapshot({ status: 'connected', error: 'e'.repeat(5000), port: '1209:6668', extra: 'nope', board: { version: 'v8.10', presets: 13, blades: [1, 'x', 2], battery: 'high' }, saberId: 'x'.repeat(100) });
    expect(s.error).toHaveLength(1000);
    expect(s.saberId).toHaveLength(40);
    expect(s.board).toEqual({ version: 'v8.10', config: null, prop: null, buttons: null, battery: null, volume: null, presets: 13, fonts: 0, tracks: 0, blades: [1, 2] });
    expect('extra' in s).toBe(false);
  });

  it('turns anything else into an unknown, empty snapshot', () => {
    expect(cleanSnapshot('junk')).toEqual({ status: 'unknown', error: null, port: null, board: null, pauses: 0, saberId: null });
    expect(cleanSnapshot(null).board).toBeNull();
  });
});
