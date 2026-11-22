// Issue #7: before a card's presets files go, the card's own presets are kept: its files unchanged, and the list
// ProffieOS would load as a snapshot. If they cannot be kept, nothing is removed.

import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitPresetsIni, type PresetRecord } from '@hiltwright/core';
import { clearPresetsFiles } from '../src/main/sd';

const preset = (name: string): PresetRecord => ({ font: name, track: '', styles: ['builtin 0 1'], name, variation: 0 });
const ini = (names: string[], terminated = true) => {
  const text = emitPresetsIni({ installed: 'Nov 20 2026 10:00:00', presets: names.map(preset), terminated: true });
  return terminated ? text : text.slice(0, text.lastIndexOf('end')); // a save cut short before its end line
};

async function card(files: Record<string, { text: string; at?: number }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hw-clear-card-'));
  for (const [name, f] of Object.entries(files)) {
    await writeFile(join(root, name), f.text);
    if (f.at) await utimes(join(root, name), f.at / 1000, f.at / 1000);
  }
  return root;
}

describe('clearing a card\'s presets files keeps the card\'s own presets first (issue #7)', () => {
  it('copies both files unchanged, keeps the newer complete list, removes both, and says so', async () => {
    const root = await card({ 'presets.ini': { text: ini(['Old']), at: Date.parse('2026-11-20T10:00:00Z') }, 'presets.tmp': { text: ini(['Edited on the saber', 'Second']), at: Date.parse('2026-11-21T10:00:00Z') } });
    const keepDir = join(await mkdtemp(join(tmpdir(), 'hw-clear-keep-')), 'kept');
    const snaps: PresetRecord[][] = [];
    const removed = await clearPresetsFiles(root, { dir: keepDir, snapshot: async (p) => { snaps.push(p); } });
    expect(removed).toEqual(['presets.ini', 'presets.tmp']);
    expect(snaps.map((s) => s.map((p) => p.name))).toEqual([['Edited on the saber', 'Second']]);
    expect((await readdir(keepDir)).sort()).toEqual(['presets.ini', 'presets.tmp']);
    expect(await readFile(join(keepDir, 'presets.ini'), 'utf8')).toBe(ini(['Old']));
    expect(existsSync(join(root, 'presets.ini')) || existsSync(join(root, 'presets.tmp'))).toBe(false);
  });

  it('prefers a complete file to a newer one cut short', async () => {
    const root = await card({ 'presets.ini': { text: ini(['Whole', 'List']), at: Date.parse('2026-11-20T10:00:00Z') }, 'presets.tmp': { text: ini(['Cut', 'Sh'], false), at: Date.parse('2026-11-21T10:00:00Z') } });
    const snaps: PresetRecord[][] = [];
    await clearPresetsFiles(root, { dir: join(root, '..', `keep-${Date.now()}`), snapshot: async (p) => { snaps.push(p); } });
    expect(snaps[0].map((p) => p.name)).toEqual(['Whole', 'List']);
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
