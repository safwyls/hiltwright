// The diagnostics file: one plain-text file the owner can read and then give to whoever is helping them. It is
// composed here from what main knows (versions, toolchain, USB, the saber record, the last build, the run logs) and
// what the page knows (the connection), redacted, and written to <userData>/support. Nothing is sent anywhere.
// Style code, the generated config, fonts, hilt models and backups are never included.

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { wiringConfirmed } from '@hiltwright/core';
import type { ConnectionSnapshot, SaberRecord, ToolchainStatus } from '../shared/api';
import type { UsbState } from './flash';
import { maskSerial, maskSerials, redact as redactThisComputer } from './redact';

export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
export const PREVIOUS_LOG_BYTES = 200 * 1024;
export const KEEP_BUNDLES = 10;
const NAME = /^hiltwright-diagnostics-\d{8}-\d{6}(-\d+)?\.txt$/;
// Room kept for the headings, notes and redaction making lines a little longer.
const MARGIN = 64 * 1024;

export interface LastBuild {
  at: string;
  saberId: string;
  ok: boolean;
  cached: boolean;
  ms: number;
  textBytes: number | null;
  flashBytes: number;
  flashPct: number | null;
  warnings: string[];
  problems: string[];
}

export interface BundleInput {
  now: Date;
  about: { app: string; packaged: boolean; os: string; arch: string; electron: string; chrome: string };
  toolchain: ToolchainStatus | { error: string };
  usb: UsbState | { error: string };
  connection: ConnectionSnapshot;
  saber: SaberRecord | null;
  lastBuild: LastBuild | null;
  currentLog: { name: string; text: string } | null;
  previousLog: { name: string; text: string } | null;
}

const yes = (b: boolean) => (b ? 'yes' : 'no');
const mb = (n: number) => `${(n / 1048576).toFixed(0)} MB`;
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function section(title: string, lines: string[]): string {
  return `== ${title} ==\n${lines.join('\n')}\n`;
}

function aboutLines(a: BundleInput['about'], now: Date): string[] {
  return [
    `Made: ${now.toISOString()} (local ${now.toString()})`,
    `Hiltwright: ${a.app} (${a.packaged ? 'packaged' : 'development'} build)`,
    `System: ${a.os} (${a.arch})`,
    `Electron: ${a.electron}, Chromium: ${a.chrome}`,
  ];
}

function toolchainLines(t: BundleInput['toolchain']): string[] {
  if ('error' in t) return [`Could not be checked: ${t.error}`];
  return [
    `Ready: ${yes(t.ready)}`,
    `Folder: ${t.root}${t.pathTooLong ? ' (too deep for the compiler: path problem)' : ''}`,
    `ProffieOS: ${t.proffieOS ? t.proffieOSVersion ?? 'present, version unknown' : 'not installed'}`,
    `arduino-cli: ${t.cli ? t.cliVersion ?? 'present, version unknown' : 'not installed'}`,
    `Proffieboard core: ${yes(t.core)}, compiler: ${yes(t.gcc)}, dfu-util: ${t.dfuUtil ? 'present' : 'missing'}`,
    `Free space: ${t.freeBytes == null ? 'unknown' : mb(t.freeBytes)}`,
  ];
}

function usbLines(u: BundleInput['usb']): string[] {
  if ('error' in u) return [`Could not be checked: ${u.error}`];
  return [
    `Saber present (running firmware): ${yes(u.runtimePresent)}`,
    `Saber in its bootloader: ${yes(u.bootloaderPresent)}`,
    `Bootloader driver: ${u.bootloaderDriver ?? 'none bound'}${u.bootloaderProblem ? ` (problem: ${u.bootloaderProblem})` : ''}`,
  ];
}

function connectionLines(c: ConnectionSnapshot): string[] {
  const out = [`Status: ${c.status === 'connected' ? 'connected' : `no saber connected (${c.status})`}`];
  if (c.error) out.push(`Last error: ${c.error}`);
  if (c.port) out.push(`Port: ${c.port}`);
  if (c.pauses) out.push(`Link pauses this connection: ${c.pauses} (each time the saber stopped answering mid-command and the port was opened again)`);
  const b = c.board;
  if (b) {
    out.push(
      `Firmware: ${b.version ?? '?'}`, `Config: ${b.config ?? '?'}`, `Prop: ${b.prop ?? '?'}, buttons: ${b.buttons ?? '?'}`,
      `Battery: ${b.battery == null ? '?' : `${b.battery} V`}, volume: ${b.volume ?? '?'}`,
      `Presets: ${b.presets}, fonts: ${b.fonts}, tracks: ${b.tracks}, pixel blades: ${JSON.stringify(b.blades)}`,
    );
  }
  return out;
}

function saberLines(s: SaberRecord | null): string[] {
  if (!s) return ['No saber chosen.'];
  const id = s.identity;
  const out = [
    `Name: ${s.name}${s.planned ? ' (planned, not connected yet)' : ''}`,
    `First seen: ${s.firstSeen}, last seen: ${s.lastSeen}`,
    `Identity: firmware ${id.version ?? '?'}, config ${id.configName ?? '?'}, prop ${id.prop ?? '?'}, buttons ${id.buttons ?? '?'}, installed ${id.installed ?? '?'}, USB serial ${id.usbSerial ? maskSerial(id.usbSerial) : '?'}`,
    `Reported by the saber: ${s.presets.length} presets, ${s.fonts.length} fonts, ${s.tracks.length} tracks, pixel blades ${JSON.stringify(id.pixelBlades)}`,
  ];
  const m = s.model;
  if (!m) {
    out.push('Model: none saved yet');
    out.push(`  Presets reported by the saber (${s.presets.length}):`);
    s.presets.forEach((p, i) => out.push(`    ${i + 1}. ${p.name || '(no name)'} | font ${p.font || '-'} | track ${p.track || '-'}`));
  } else {
    out.push(`Model: board ${m.board}, buttons ${m.buttons}, prop ${m.prop}, wiring ${wiringConfirmed(m) ? 'confirmed' : 'not confirmed'}`);
    m.blades.forEach((b, i) => out.push(`  Blade ${i + 1}: ${b.role}, ${b.type}, ${b.pixels} ${b.type === 'pixel' ? 'pixels' : 'LEDs'}${b.order ? ` ${b.order}` : ''}${b.parallel > 1 ? `, ${b.parallel} in parallel` : ''}, wiring ${JSON.stringify(b.wiring)}`));
    out.push(`  Presets (${m.presets.length})${m.presetsFrom ? ', staged for the next install' : ''}:`);
    m.presets.forEach((p, i) => out.push(`    ${i + 1}. ${p.name || '(no name)'} | font ${p.font || '-'} | track ${p.track || '-'}`));
  }
  const f = s.firmware;
  out.push(f ? `Installed by Hiltwright: ${f.at}, ProffieOS ${f.os}, build ${f.hash.slice(0, 12)}, ${f.presets.length} presets` : 'Installed by Hiltwright: no (vendor or other firmware)');
  return out;
}

function buildLines(b: LastBuild | null): string[] {
  if (!b) return ['No build in this run.'];
  const out = [
    `At: ${b.at}, saber ${b.saberId}`,
    `Result: ${b.ok ? 'built' : 'failed'}${b.cached ? ' (from cache)' : ''}, ${(b.ms / 1000).toFixed(1)} s`,
    `Flash use: ${b.textBytes == null ? 'unknown' : `${b.textBytes} of ${b.flashBytes} bytes (${b.flashPct ?? '?'}%)`}`,
  ];
  out.push(b.warnings.length ? 'Warnings:' : 'Warnings: none', ...b.warnings.map((w) => `  - ${w}`));
  out.push(b.problems.length ? 'Problems:' : 'Problems: none', ...b.problems.map((p) => `  - ${p}`));
  return out;
}

/** The newest lines of `text` that fit in `budget` bytes, and how many older lines were left out. */
function tail(text: string, budget: number): { text: string; dropped: number } {
  if (Buffer.byteLength(text) <= budget) return { text, dropped: 0 };
  const lines = text.split('\n');
  let used = 0;
  let i = lines.length;
  while (i > 0 && used + Buffer.byteLength(lines[i - 1]) + 1 <= budget) used += Buffer.byteLength(lines[--i]) + 1;
  return { text: lines.slice(i).join('\n'), dropped: i };
}

export function composeBundle(input: BundleInput, redact: (text: string) => string = redactThisComputer, limit = MAX_BUNDLE_BYTES): string {
  const head = [
    'Hiltwright diagnostics',
    'This file stays on this computer unless you send it. Read it first if you like; your user folder, user name and',
    'computer name have been replaced. Serial numbers of boards and SD cards show only their last four characters',
    '(****1234), enough to tell two apart. It holds no style code, fonts, hilt models or firmware backups.',
    '',
    section('About', aboutLines(input.about, input.now)),
    section('Toolchain', toolchainLines(input.toolchain)),
    section('USB', usbLines(input.usb)),
    section('Connection', connectionLines(input.connection)),
    section('Saber', saberLines(input.saber)),
    section('Last build in this run', buildLines(input.lastBuild)),
  ].join('\n');
  let budget = limit - Buffer.byteLength(head) - MARGIN;
  const logs: string[] = [];
  const cur = input.currentLog;
  if (cur) {
    const t = tail(cur.text, Math.max(0, budget));
    budget -= Buffer.byteLength(t.text);
    logs.push(section(`Log of this run (${cur.name})`, [...(t.dropped ? [`[${t.dropped} older lines left out to keep this file small]`] : []), t.text]));
  } else logs.push(section('Log of this run', ['No log was started for this run.']));
  const prev = input.previousLog;
  if (prev) {
    const t = tail(prev.text, Math.max(0, Math.min(PREVIOUS_LOG_BYTES, budget)));
    logs.push(section(`End of the previous run's log (${prev.name})`, [...(t.dropped ? [`[${t.dropped} older lines left out]`] : []), t.text]));
  }
  // The serials this file itself knows of are masked too, so the logs agree with the Saber section even when a line
  // was written before the app knew the number was a serial (issue #24).
  return maskSerials(redact([head, ...logs].join('\n')), knownSerials(input));
}

/** Every serial number the bundle's own facts name: the saber's USB serial, its bootloader's, its cards', and the boards on USB. */
function knownSerials(input: BundleInput): (string | null | undefined)[] {
  const s = input.saber;
  const u = 'error' in input.usb ? null : input.usb;
  return [s?.identity.usbSerial, s?.bootloader?.serial, ...(s?.cards ?? []).map((c) => c.serial), ...(u?.runtimeSerials ?? []), ...(u?.bootloaders ?? []).map((b) => b.serial)];
}

/** The page's snapshot, checked: only the expected fields, short strings, small numbers. */
export function cleanSnapshot(v: unknown): ConnectionSnapshot {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const s = (x: unknown, max = 300) => (typeof x === 'string' ? x.slice(0, max) : null);
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const b = (o.board && typeof o.board === 'object' ? o.board : null) as Record<string, unknown> | null;
  return {
    status: s(o.status, 40) ?? 'unknown',
    error: s(o.error, 1000),
    port: s(o.port, 40),
    board: b ? {
      version: s(b.version), config: s(b.config), prop: s(b.prop), buttons: n(b.buttons), battery: n(b.battery), volume: n(b.volume),
      presets: n(b.presets) ?? 0, fonts: n(b.fonts) ?? 0, tracks: n(b.tracks) ?? 0,
      blades: Array.isArray(b.blades) ? b.blades.map(Number).filter(Number.isFinite).slice(0, 16) : [],
    } : null,
    pauses: n(o.pauses) ?? 0,
    saberId: s(o.saberId, 40),
  };
}

/** Write the file into `dir`, keep the ten newest, and return the file's full path. */
export function writeBundle(dir: string, text: string, now: Date, keep = KEEP_BUNDLES): string {
  mkdirSync(dir, { recursive: true });
  const existing = () => { try { return readdirSync(dir).filter((f) => NAME.test(f)).sort(); } catch { return []; } };
  let name = `hiltwright-diagnostics-${stamp(now)}.txt`;
  for (let i = 2; existing().includes(name); i++) name = `hiltwright-diagnostics-${stamp(now)}-${i}.txt`;
  const file = join(dir, name);
  // CRLF, so the file reads the same in any Windows editor.
  writeFileSync(file, text.replace(/\r?\n/g, '\r\n'), 'utf8');
  const all = existing();
  for (const f of all.slice(0, Math.max(0, all.length - keep))) { try { unlinkSync(join(dir, f)); } catch { /* open elsewhere; next time */ } }
  return file;
}
