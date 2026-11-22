// Issue #7: before a card's presets files go, the card's own presets are kept: its files unchanged, and the list
// ProffieOS would load as a snapshot. If they cannot be kept, nothing is removed.
// Issue #25: that list, and the one card identity reads, is the one the firmware would pick, from files it saved.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitPresetsIni, type PresetRecord } from '@hiltwright/core';
import { clearPresetsFiles, lookForCards } from '../src/main/sd';

const INSTALLED = 'Nov 20 2026 10:00:00';
const preset = (name: string): PresetRecord => ({ font: name, track: '', styles: ['builtin 0 1'], name, variation: 0 });
const ini = (names: string[], terminated = true) => {
  const text = emitPresetsIni({ installed: INSTALLED, presets: names.map(preset), terminated: true });
  return terminated ? text : text.slice(0, text.lastIndexOf('end')); // a save cut short before its end line
};

/** A presets file as ProffieOS v8.10 saves it: a 512-byte header (two equal copies, then the install time), the text, padding. */
function saved(names: string[], iteration: number): Buffer {
  const body = Buffer.from(ini(names));
  let sum = 0;
  for (const b of body) sum = (Math.imul(sum, 997) + b) >>> 0;
  const file = Buffer.alloc(256 * 1024);
  for (const at of [0, 16]) { file.writeUInt32LE(0xff1e5afe, at); file.writeUInt32LE(sum, at + 4); file.writeUInt32LE(iteration, at + 8); file.writeUInt32LE(body.length, at + 12); }
  file.write(INSTALLED, 32, 'latin1');
  body.copy(file, 512);
  return file;
}

async function card(files: Record<string, { text: string | Buffer; at?: number }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hw-clear-card-'));
  for (const [name, f] of Object.entries(files)) {
    await writeFile(join(root, name), f.text);
    if (f.at) await utimes(join(root, name), f.at / 1000, f.at / 1000);
  }
  return root;
}

describe('clearing a card\'s presets files keeps the card\'s own presets first (issue #7)', () => {
  it('copies both files unchanged, keeps the list of the newer save, removes both, and says so', async () => {
    // The older save is the newer file on disk: the iteration decides, not the time (issue #25).
    const root = await card({ 'presets.ini': { text: saved(['Old'], 5), at: Date.parse('2026-11-21T10:00:00Z') }, 'presets.tmp': { text: saved(['Edited on the saber', 'Second'], 6), at: Date.parse('2026-11-20T10:00:00Z') } });
    const keepDir = join(await mkdtemp(join(tmpdir(), 'hw-clear-keep-')), 'kept');
    const snaps: PresetRecord[][] = [];
    const removed = await clearPresetsFiles(root, { dir: keepDir, snapshot: async (p) => { snaps.push(p); } });
    expect(removed).toEqual(['presets.ini', 'presets.tmp']);
    expect(snaps.map((s) => s.map((p) => p.name))).toEqual([['Edited on the saber', 'Second']]);
    expect((await readdir(keepDir)).sort()).toEqual(['presets.ini', 'presets.tmp']);
    expect(await readFile(join(keepDir, 'presets.ini'))).toEqual(saved(['Old'], 5));
    expect(existsSync(join(root, 'presets.ini')) || existsSync(join(root, 'presets.tmp'))).toBe(false);
  });

  it('prefers a complete file to a newer one cut short', async () => {
    const root = await card({ 'presets.ini': { text: ini(['Whole', 'List']), at: Date.parse('2026-11-20T10:00:00Z') }, 'presets.tmp': { text: ini(['Cut', 'Sh'], false), at: Date.parse('2026-11-21T10:00:00Z') } });
    const snaps: PresetRecord[][] = [];
    await clearPresetsFiles(root, { dir: join(root, '..', `keep-${Date.now()}`), snapshot: async (p) => { snaps.push(p); } });
    expect(snaps[0].map((p) => p.name)).toEqual(['Whole', 'List']);
  });

  it('makes no snapshot when no file would load, but still keeps the files and removes them', async () => {
    const root = await card({ 'presets.ini': { text: ini(['Cut'], false) } });
    const keepDir = join(root, '..', `keep-${Date.now()}-none`);
    let called = false;
    expect(await clearPresetsFiles(root, { dir: keepDir, snapshot: async () => { called = true; } })).toEqual(['presets.ini']);
    expect(called).toBe(false);
    expect(await readFile(join(keepDir, 'presets.ini'), 'utf8')).toBe(ini(['Cut'], false));
  });

  it('removes nothing when the snapshot cannot be kept', async () => {
    const root = await card({ 'presets.ini': { text: ini(['Mine']) } });
    await expect(clearPresetsFiles(root, { dir: join(root, '..', `keep-${Date.now()}-x`), snapshot: async () => { throw new Error('disk full'); } })).rejects.toThrow('disk full');
    expect(existsSync(join(root, 'presets.ini'))).toBe(true);
  });

  it('a card with no presets files: nothing kept, nothing removed', async () => {
    const root = await card({});
    let called = false;
    expect(await clearPresetsFiles(root, { dir: join(root, 'kept'), snapshot: async () => { called = true; } })).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('a card is known by the list ProffieOS loads from it (issue #25)', () => {
  const sdRoot = process.env.HILTWRIGHT_SD_ROOT;
  afterEach(() => { if (sdRoot === undefined) delete process.env.HILTWRIGHT_SD_ROOT; else process.env.HILTWRIGHT_SD_ROOT = sdRoot; });
  const presetsOf = async (root: string) => { process.env.HILTWRIGHT_SD_ROOT = root; const look = await lookForCards(); return look.answered ? look.cards[0]?.presets : 'no answer'; };

  it('reads the newer save, not the first file', async () => {
    expect(await presetsOf(await card({ 'presets.ini': { text: saved(['Old'], 5) }, 'presets.tmp': { text: saved(['New'], 6) } }))).toEqual([{ font: 'New', name: 'New' }]);
  });

  it('passes over a presets.ini cut short beside a good presets.tmp', async () => {
    expect(await presetsOf(await card({ 'presets.ini': { text: ini(['Cut', 'Sh'], false) }, 'presets.tmp': { text: saved(['Whole'], 2) } }))).toEqual([{ font: 'Whole', name: 'Whole' }]);
  });

  it('says nothing when no list would load', async () => {
    expect(await presetsOf(await card({ 'presets.ini': { text: ini(['Cut'], false) } }))).toBeNull();
  });
});
