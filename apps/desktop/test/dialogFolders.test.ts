// File dialogs start where their kind of dialog last was (Electron 43 stopped the system remembering it).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DialogFolders } from '../src/main/dialogFolders';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hw-dialogs-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('dialog folders', () => {
  it('has no starting folder until something was picked', () => {
    expect(new DialogFolders(join(dir, 'f.json')).start('fonts')).toBeUndefined();
  });

  it('remembers the folder holding what was picked, per kind, across restarts', async () => {
    mkdirSync(join(dir, 'packs'));
    mkdirSync(join(dir, 'logos'));
    const a = new DialogFolders(join(dir, 'f.json'));
    await a.remember('fonts', join(dir, 'packs', 'Ahch-To.zip'));
    await a.remember('logo', join(dir, 'logos', 'maker.png'));
    expect(a.start('fonts')).toBe(join(dir, 'packs'));
    const b = new DialogFolders(join(dir, 'f.json'));
    expect(b.start('fonts')).toBe(join(dir, 'packs'));
    expect(b.start('logo')).toBe(join(dir, 'logos'));
    expect(b.start('hilts')).toBeUndefined();
  });

  it('a picked folder is found again by opening in the folder that holds it', async () => {
    mkdirSync(join(dir, 'fonts', 'Ben_Solo'), { recursive: true });
    const a = new DialogFolders(join(dir, 'f.json'));
    await a.remember('fontFolder', join(dir, 'fonts', 'Ben_Solo'));
    expect(a.start('fontFolder')).toBe(join(dir, 'fonts'));
  });

  it('forgets a folder that is gone', async () => {
    mkdirSync(join(dir, 'card'));
    const a = new DialogFolders(join(dir, 'f.json'));
    await a.remember('fonts', join(dir, 'card', 'x.zip'));
    rmSync(join(dir, 'card'), { recursive: true });
    expect(a.start('fonts')).toBeUndefined();
  });

  it('an unreadable file means no starting folder, and the next pick still saves', async () => {
    writeFileSync(join(dir, 'f.json'), '{ not json');
    const a = new DialogFolders(join(dir, 'f.json'));
    expect(a.start('fonts')).toBeUndefined();
    await a.remember('fonts', join(dir, 'x.zip'));
    expect(new DialogFolders(join(dir, 'f.json')).start('fonts')).toBe(dir);
  });

  it('a save that fails does not throw', async () => {
    const a = new DialogFolders(join(dir, 'missing', 'f.json'));
    await expect(a.remember('fonts', join(dir, 'x.zip'))).resolves.toBeUndefined();
    expect(a.start('fonts')).toBe(dir);
  });
});
