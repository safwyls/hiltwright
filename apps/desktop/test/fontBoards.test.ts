import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { boardByContent, hasHum, sortPackage, surveyPackage, type FolderFacts } from '../src/main/fontBoards';
import { FontLibrary } from '../src/main/fontLibrary';
import { bulkHeadline, clickSelection, importSummary } from '../src/shared/fontBulk';

const facts = (files: string[], folders: Record<string, string[]> = {}): FolderFacts => ({ files, folders });

/** Make-believe files: the import reads names and wav headers only, and an empty file is enough for sorting. */
async function tree(root: string, paths: string[]): Promise<void> {
  for (const p of paths) {
    await mkdir(dirname(join(root, p)), { recursive: true });
    await writeFile(join(root, p), '');
  }
}

/** One release of a font as makers pack it: a copy per board side by side, and a folder of extras. */
const release = (at: string): string[] => [
  // ProffieOS: its two .ini files, effects in folders with ProffieOS names.
  `${at}/Proffie/config.ini`, `${at}/Proffie/smoothsw.ini`, `${at}/Proffie/hum.wav`, `${at}/Proffie/font.wav`,
  `${at}/Proffie/clsh/clsh1.wav`, `${at}/Proffie/swng/swng1.wav`, `${at}/Proffie/out/out1.wav`, `${at}/Proffie/in/in1.wav`, `${at}/Proffie/swingl/swingl1.wav`, `${at}/Proffie/swingh/swingh1.wav`,
  // Crystal Focus: font_config.txt and leds.txt, flat Plecter names, tracks inside.
  `${at}/CFX-GHv3/font_config.txt`, `${at}/CFX-GHv3/leds.txt`, `${at}/CFX-GHv3/humM1.wav`, `${at}/CFX-GHv3/font.wav`, `${at}/CFX-GHv3/poweron.wav`, `${at}/CFX-GHv3/poweroff.wav`,
  `${at}/CFX-GHv3/clash1.wav`, `${at}/CFX-GHv3/hswing1.wav`, `${at}/CFX-GHv3/lswing1.wav`, `${at}/CFX-GHv3/tracks/theme.wav`,
  // Verso: flat, no config, its own names for accent swings and deflections.
  `${at}/Verso/hum.wav`, `${at}/Verso/font.wav`, `${at}/Verso/on1.wav`, `${at}/Verso/off1.wav`, `${at}/Verso/aswing1.wav`, `${at}/Verso/deflc1.wav`, `${at}/Verso/swingh1.wav`, `${at}/Verso/swingl1.wav`,
  // Xenopixel: "name (n).wav".
  `${at}/Xeno3/hum (1).wav`, `${at}/Xeno3/font (1).wav`, `${at}/Xeno3/clash (1).wav`, `${at}/Xeno3/clash (2).wav`, `${at}/Xeno3/out (1).wav`, `${at}/Xeno3/in (1).wav`,
  // Asteria: capitalised effect folders, a Hyswing folder, SmoothSwing pairs named SW01_H.
  `${at}/Asteria/bankswitch.wav`, `${at}/Asteria/Hum/humm1.wav`, `${at}/Asteria/Out/poweron.wav`, `${at}/Asteria/In/poweroff.wav`, `${at}/Asteria/Hyswing/swing1.wav`, `${at}/Asteria/Swing/SW01_H.wav`, `${at}/Asteria/Swing/SW01_L.wav`,
  // Extras: spare hums, alternate ignitions (a folder that passes for a font), music, a clash set.
  `${at}/_Extras/humM2.wav`, `${at}/_Extras/outstag/poweron.wav`, `${at}/_Extras/outstag/poweron2.wav`, `${at}/_Extras/Music/track1.wav`, `${at}/_Extras/Rampage/clash1.wav`,
];

describe('which board a folder was made for, by what is in it', () => {
  it('knows each board by its own files and sound names', () => {
    expect(boardByContent(facts(['font_config.txt', 'hum.wav']))?.board).toBe('CFX');
    expect(boardByContent(facts(['leds.txt', 'hum.wav']))?.board).toBe('CFX');
    expect(boardByContent(facts(['humM1.wav', 'poweron.wav']))?.board).toBe('CFX');
    expect(boardByContent(facts(['hum (1).wav', 'clash (1).wav', 'clash (2).wav']))?.board).toBe('Xenopixel');
    expect(boardByContent(facts(['hum.wav', 'aswing1.wav']))?.board).toBe('Verso');
    expect(boardByContent(facts(['bankswitch.wav'], { Hum: ['humm1.wav'], Hyswing: ['swing1.wav'] }))?.board).toBe('Asteria');
    expect(boardByContent(facts([], { Hum: ['hum.wav'], Swing: ['SW01_H.wav', 'SW01_L.wav'] }))?.board).toBe('Asteria');
    expect(boardByContent(facts(['smoothsw.ini', 'hum.wav']))?.board).toBe('Proffie');
    expect(boardByContent(facts(['hum.wav'], { clsh: ['clsh1.wav'] }))?.board).toBe('Proffie');
    expect(boardByContent(facts(['hum01.wav', 'clsh01.wav']))?.board).toBe('Proffie');
  });

  it('says nothing about plain Plecter names, which ProffieOS plays too', () => {
    expect(boardByContent(facts(['hum.wav', 'poweron.wav', 'poweroff.wav', 'clash1.wav', 'swing1.wav', 'hswing1.wav', 'lswing1.wav', 'config.ini']))).toBeNull();
    expect(boardByContent(facts(['readme.txt', 'cover.png']))).toBeNull();
  });

  it('finds a hum as a file or in a hum folder', () => {
    expect(hasHum(facts(['hum.wav']))).toBe(true);
    expect(hasHum(facts(['hum01.wav']))).toBe(true);
    expect(hasHum(facts(['humM1.wav']))).toBe(true);
    expect(hasHum(facts([], { hum: ['001.wav'] }))).toBe(true);
    expect(hasHum(facts(['poweron.wav', 'poweron2.wav']))).toBe(false);
    expect(hasHum(facts(['humidity.wav'], { hum: [] }))).toBe(false);
  });
});

describe('a package made for several boards', () => {
  const sorted = async (paths: string[]) => {
    const top = await mkdtemp(join(tmpdir(), 'hw-pkg-'));
    await tree(top, paths);
    const r = sortPackage(top, await surveyPackage(top));
    const rel = (d: string) => d.slice(top.length + 1).replace(/\\/g, '/');
    return { keep: r.keep.map(rel).sort(), left: r.left.map((l) => `${l.reason}: ${rel(l.dir)}`).sort() };
  };

  it('keeps the Proffie copy of each variant and leaves the rest out, by contents', async () => {
    const r = await sorted([...release('Unstable/Unstable_V1'), ...release('Unstable/Unstable_V3/TFA'), 'Unstable/_ReadMe.rtf', 'Unstable/Unstable_V3/TFA/_ReadMe.rtf']);
    expect(r.keep).toEqual(['Unstable/Unstable_V1/Proffie', 'Unstable/Unstable_V3/TFA/Proffie']);
    // TFA's extras sit five folders down, deeper than the search goes: not added, and not mentioned.
    expect(r.left).toEqual([
      'extra: Unstable/Unstable_V1/_Extras/outstag',
      'other-board: Unstable/Unstable_V1/Asteria', 'other-board: Unstable/Unstable_V1/CFX-GHv3', 'other-board: Unstable/Unstable_V1/Verso', 'other-board: Unstable/Unstable_V1/Xeno3',
      'other-board: Unstable/Unstable_V3/TFA/Asteria', 'other-board: Unstable/Unstable_V3/TFA/CFX-GHv3', 'other-board: Unstable/Unstable_V3/TFA/Verso', 'other-board: Unstable/Unstable_V3/TFA/Xeno3',
    ]);
  });

  it('does not go by the folder name when the contents say which board', async () => {
    // The board folders are named for nothing: only what is in them tells them apart.
    const r = await sorted(release('Ember').map((p) => p.replace('/Proffie/', '/A/').replace('/CFX-GHv3/', '/B/').replace('/Verso/', '/C/').replace('/Xeno3/', '/D/').replace('/Asteria/', '/E/')));
    expect(r.keep).toEqual(['Ember/A']);
    expect(r.left.filter((l) => l.startsWith('other-board'))).toEqual(['other-board: Ember/B', 'other-board: Ember/C', 'other-board: Ember/D', 'other-board: Ember/E']);
    // A folder named for another board that holds a ProffieOS font is kept.
    const named = await sorted(['Pack/Proffie/hum.wav', 'Pack/Proffie/smoothsw.ini', 'Pack/CFX/hum.wav', 'Pack/CFX/smoothsw.ini', 'Pack/CFX/clsh/clsh1.wav']);
    expect(named).toEqual({ keep: ['Pack/CFX', 'Pack/Proffie'], left: [] });
  });

  it('keeps a font made for another board when the package has no Proffie copy', async () => {
    const r = await sorted(['Old/font_config.txt', 'Old/humM1.wav', 'Old/poweron.wav', 'Old/poweroff.wav', 'Other/hum.wav', 'Other/aswing1.wav']);
    expect(r).toEqual({ keep: ['Old', 'Other'], left: [] });
  });

  it('leaves a library of unrelated fonts alone: a Proffie font does not push out the one beside it', async () => {
    const r = await sorted(['Fonts/Kylo/hum.wav', 'Fonts/Kylo/smoothsw.ini', 'Fonts/Vader/hum.wav', 'Fonts/Vader/poweron.wav', 'Fonts/Maul/hum.wav', 'Fonts/Maul/clash1.wav']);
    expect(r).toEqual({ keep: ['Fonts/Kylo', 'Fonts/Maul', 'Fonts/Vader'], left: [] });
  });

  it('tells a variant from an extra: a variant is a whole font with its own hum', async () => {
    const r = await sorted([
      'Pack/V1/hum.wav', 'Pack/V1/out.wav', 'Pack/V2/hum.wav', 'Pack/V2/out.wav',
      'Pack/Alt ignitions/out1.wav', 'Pack/Alt ignitions/out2.wav', 'Pack/Bonus/Dark/hum.wav', 'Pack/Bonus/Dark/out.wav', 'Pack/Artwork/cover.png', 'Pack/readme.txt',
    ]);
    expect(r.keep).toEqual(['Pack/V1', 'Pack/V2']);
    expect(r.left).toEqual(['extra: Pack/Alt ignitions', 'extra: Pack/Bonus/Dark']);
    // On its own, the same folder is what the owner asked for.
    expect(await sorted(['Alt ignitions/out1.wav'])).toEqual({ keep: ['Alt ignitions'], left: [] });
  });

  it('adds only the Proffie copies from a folder, says each refusal once, and does the same from "Add folder"', async () => {
    const lib = new FontLibrary(await mkdtemp(join(tmpdir(), 'hw-lib-')), async (p) => { await rm(p, { recursive: true, force: true }); });
    const src = await mkdtemp(join(tmpdir(), 'hw-src-'));
    await tree(src, [...release('Unstable/Unstable_V1'), ...release('Unstable/Unstable_V2'), ...release('Unstable/Unstable_V3/TFA')]);
    const r = await lib.importFrom(join(src, 'Unstable'));
    expect(r.added).toEqual(['Unstable_V1', 'Unstable_V2', 'TFA']);
    expect((await readdir(lib.root)).filter((n) => !n.startsWith('.') && !n.endsWith('.json')).sort()).toEqual(['TFA', 'Unstable_V1', 'Unstable_V2']);
    expect(r.skipped.filter((s) => s.reason === 'other-board')).toHaveLength(12);
    expect(r.skipped.find((s) => s.name === 'CFX-GHv3')?.why).toBe('the copy in "CFX-GHv3" is for another board, not Proffie');
    const said = importSummary(r);
    expect(said).toEqual({
      tone: 'amber',
      text: 'Added Unstable_V1, Unstable_V2, TFA. Not added, made for another board: Asteria (3 copies), CFX-GHv3 (3 copies), Verso (3 copies), Xeno3 (3 copies). Not added, extra sounds that are not a whole font: outstag (3 copies).',
    });
  });
});

describe('the import banner', () => {
  it('says each thing once', () => {
    expect(importSummary({ added: ['Rey'], skipped: [] })).toEqual({ tone: 'green', text: 'Added Rey. Give each a name and maker on the right.' });
    expect(importSummary({ added: [], skipped: [{ name: 'a.zip', why: 'a.zip has no sounds in it.' }, { name: 'a.zip', why: 'a.zip has no sounds in it.' }] }))
      .toEqual({ tone: 'red', text: 'Not added: a.zip: a.zip has no sounds in it.' });
    expect(importSummary({ added: [], skipped: [] }).text).toBe('Nothing was added.');
    // A board folder above the font names the group, not the font inside it.
    expect(importSummary({ added: ['Rey'], skipped: [{ name: 'Rey', why: 'x', reason: 'other-board', from: 'CFX' }, { name: 'Finn', why: 'x', reason: 'other-board', from: 'CFX' }] }).text)
      .toBe('Added Rey. Not added, made for another board: CFX (2 copies).');
  });
});

describe('selecting several fonts', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  const plain = { ctrl: false, shift: false };
  it('click selects one, Ctrl+click adds or removes one, Shift+click takes the range from the last one clicked', () => {
    let s = clickSelection({ picked: [], anchor: null }, 'b', order, plain);
    expect(s).toEqual({ picked: ['b'], anchor: 'b' });
    s = clickSelection(s, 'd', order, { ctrl: true, shift: false });
    expect(s).toEqual({ picked: ['b', 'd'], anchor: 'd' });
    s = clickSelection(s, 'b', order, { ctrl: true, shift: false });
    expect(s).toEqual({ picked: ['d'], anchor: 'd' });
    // The last one stays: the page always shows a font.
    expect(clickSelection(s, 'd', order, { ctrl: true, shift: false })).toEqual(s);
    s = clickSelection(s, 'a', order, { ctrl: false, shift: true });
    expect(s).toEqual({ picked: ['a', 'b', 'c', 'd'], anchor: 'd' });
    s = clickSelection(s, 'e', order, { ctrl: false, shift: true });
    expect(s).toEqual({ picked: ['d', 'e'], anchor: 'd' });
    expect(clickSelection(s, 'c', order, plain)).toEqual({ picked: ['c'], anchor: 'c' });
    // Shift with nothing clicked before, or with the last one filtered out of view, selects just that one.
    expect(clickSelection({ picked: [], anchor: null }, 'c', order, { ctrl: false, shift: true })).toEqual({ picked: ['c'], anchor: 'c' });
    expect(clickSelection({ picked: ['z'], anchor: 'z' }, 'c', order, { ctrl: false, shift: true })).toEqual({ picked: ['c'], anchor: 'c' });
  });

  it('sums up a bulk action', () => {
    const ok = { name: 'a', ok: true, text: 'Removed' }; const bad = { name: 'b', ok: false, text: 'in use' };
    expect(bulkHeadline('Removed', 'not removed', [ok, ok])).toEqual({ tone: 'green', text: 'Removed 2 fonts.' });
    expect(bulkHeadline('Removed', 'not removed', [ok, bad])).toEqual({ tone: 'amber', text: 'Removed 1 of 2 fonts. 1 not removed.' });
    expect(bulkHeadline('Copied', 'not copied', [bad])).toEqual({ tone: 'red', text: 'Copied 0 of 1 font. 1 not copied.' });
  });
});
