import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FontLibrary, INDEX_FILE } from '../src/main/fontLibrary';
import { NEEDS_PASSPHRASE, WRONG_PASSPHRASE, libraryPackNeedsPassphrase, openLibraryPack, writeLibraryPack, type PackedFont } from '../src/main/fontLibraryPack';
import { importSummary } from '../src/shared/fontBulk';
import { ContributorStore } from '../src/main/contributors';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

const tmp = (name: string) => mkdtemp(join(tmpdir(), `hw-${name}-`));
const newLibrary = async () => new FontLibrary(await tmp('lib'), async (p) => { await rm(p, { recursive: true, force: true }); });

/** A sound-shaped file with something in it to find again: bytes that deflate well, and a marker. */
const sound = (marker: string) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4000, 7), Buffer.from(marker)]);

async function fontFolder(dir: string, marker: string): Promise<void> {
  for (const f of ['hum.wav', 'out.wav', 'in.wav', 'clsh/clsh1.wav', 'tracks/A long track name (Alternate) that runs well past sixty characters in all.wav', 'config.ini', 'License.rtf', 'Thumbs.db']) {
    await mkdir(dirname(join(dir, f)), { recursive: true });
    await writeFile(join(dir, f), sound(`${marker}:${f}`));
  }
}

async function filled(): Promise<FontLibrary> {
  const lib = await newLibrary();
  const src = await tmp('src');
  await fontFolder(join(src, 'Ember'), 'ember');
  await fontFolder(join(src, 'Ash Grey'), 'ash');
  await lib.importFrom(src);
  await lib.setMeta('Ember', { name: 'Kyber Ember', maker: 'Greyscale', notes: 'Bought 2026; quiet swings.', bundle: 'Fire set' });
  return lib;
}

describe('the font library as one file', () => {
  it('exports every font with its details, and another computer gets them back the same', async () => {
    const lib = await filled();
    const file = join(await tmp('out'), 'fonts.hwfonts');
    const lines: string[] = [];
    const made = await lib.exportTo(file, (l) => lines.push(l));
    expect(made).toMatchObject({ fonts: 2, files: 14 });
    expect(lines).toEqual(['Packing 1 of 2: Ash Grey…', 'Packing 2 of 2: Kyber Ember…']);
    expect(existsSync(join(lib.root, 'Ember', 'hum.wav'))).toBe(true);

    const other = await newLibrary();
    const r = await other.importPack(file);
    expect(r).toEqual({ added: ['Ash Grey', 'Ember'], skipped: [] });
    const got = await other.list();
    expect(got.map((f) => f.folder)).toEqual(['Ash Grey', 'Ember']);
    expect(got[1].meta).toMatchObject({ name: 'Kyber Ember', maker: 'Greyscale', notes: 'Bought 2026; quiet swings.', bundle: 'Fire set' });
    for (const f of ['hum.wav', 'clsh/clsh1.wav', 'config.ini', 'License.rtf', 'tracks/A long track name (Alternate) that runs well past sixty characters in all.wav']) {
      expect((await readFile(join(other.root, 'Ember', ...f.split('/')))).equals(await readFile(join(lib.root, 'Ember', ...f.split('/')))), f).toBe(true);
    }
    // System clutter does not travel, and nothing is left behind from the unpacking.
    expect(existsSync(join(other.root, 'Ember', 'Thumbs.db'))).toBe(false);
    expect((await readdir(other.root)).filter((n) => n.startsWith('.incoming'))).toEqual([]);
  });

  it('is compressed and cannot be read without the app', async () => {
    const lib = await filled();
    const file = join(await tmp('out'), 'fonts.hwfonts');
    const made = await lib.exportTo(file);
    const raw = await readFile(file);
    expect(raw.subarray(0, 4).toString()).toBe('HWFL');
    expect(raw.length).toBeLessThan(made.bytes / 4);
    for (const plain of ['ember:hum.wav', 'Kyber Ember', 'Greyscale', 'hum.wav', 'RIFF']) expect(raw.includes(Buffer.from(plain)), plain).toBe(false);
    // Two exports of the same library share no bytes after the header: a fresh key and nonces each time.
    const again = join(await tmp('out'), 'again.hwfonts');
    await lib.exportTo(again);
    expect(raw.subarray(21, 121).equals((await readFile(again)).subarray(21, 121))).toBe(false);
  });

  it('leaves a font that is already here as it is, and says so once', async () => {
    const lib = await filled();
    const file = join(await tmp('out'), 'fonts.hwfonts');
    await lib.exportTo(file);
    const other = await newLibrary();
    await mkdir(join(other.root, 'Ember'));
    await writeFile(join(other.root, 'Ember', 'hum.wav'), 'mine');
    const r = await other.importPack(file);
    expect(r.added).toEqual(['Ash Grey']);
    expect(r.skipped).toEqual([{ name: 'Ember', why: 'a font with this folder name is already in the library', reason: 'have' }]);
    expect(await readFile(join(other.root, 'Ember', 'hum.wav'), 'utf8')).toBe('mine');
    expect(existsSync(join(other.root, 'Ember', 'out.wav'))).toBe(false);
    // The font after the one left out still gets its own files.
    expect((await readFile(join(other.root, 'Ash Grey', 'hum.wav'))).includes(Buffer.from('ash:hum.wav'))).toBe(true);
    expect(importSummary(r)).toEqual({ tone: 'amber', text: 'Added Ash Grey. Already in the library, left as it is: Ember.' });
    expect(importSummary(await other.importPack(file))).toEqual({ tone: 'amber', text: 'Already in the library, left as they are: Ash Grey, Ember.' });
  });

  it('refuses a file that is something else, damaged, cut short or changed, and adds nothing half done', async () => {
    const lib = await filled();
    const dir = await tmp('out');
    const file = join(dir, 'fonts.hwfonts');
    await lib.exportTo(file);
    const raw = await readFile(file);

    const zip = join(dir, 'not.hwfonts');
    await writeFile(zip, Buffer.from('PK\x03\x04 some other file entirely'));
    await expect((await newLibrary()).importPack(zip)).rejects.toThrow(/not a Hiltwright font library export/);

    const cut = join(dir, 'cut.hwfonts');
    await writeFile(cut, raw.subarray(0, raw.length - 40));
    const a = await newLibrary();
    await expect(a.importPack(cut)).rejects.toThrow(/damaged or was cut short/);
    // Ash Grey was whole in the file and came in; Ember, cut short, did not come in at all.
    expect((await readdir(a.root)).filter((n) => n !== INDEX_FILE && !n.endsWith('.json')).sort()).toEqual(['Ash Grey']);

    const flipped = Buffer.from(raw); flipped[raw.length - 10] ^= 0xff;
    const bad = join(dir, 'bad.hwfonts');
    await writeFile(bad, flipped);
    await expect((await newLibrary()).importPack(bad)).rejects.toThrow(/damaged or was cut short/);

    const newer = Buffer.from(raw); newer[4] = 9;
    await writeFile(bad, newer);
    await expect((await newLibrary()).importPack(bad)).rejects.toThrow(/newer Hiltwright/);
  });

  it('never writes outside the library, whatever names the file carries', async () => {
    const dir = await tmp('out');
    const meta = { name: 'x', maker: '', notes: '', added: '' };
    for (const font of [
      { folder: '..', meta, files: [{ path: 'hum.wav', bytes: 1 }] },
      { folder: 'Fine', meta, files: [{ path: '../../escaped.wav', bytes: 1 }] },
      { folder: 'Fine', meta, files: [{ path: 'C:/escaped.wav', bytes: 1 }] },
      { folder: 'a/b', meta, files: [{ path: 'hum.wav', bytes: 1 }] },
      { folder: INDEX_FILE, meta, files: [{ path: 'hum.wav', bytes: 1 }] },
    ] as PackedFont[]) {
      const file = join(dir, 'evil.hwfonts');
      await writeLibraryPack(file, [font], async () => Buffer.from('x'));
      const lib = await newLibrary();
      await expect(lib.importPack(file), font.folder + ' ' + font.files[0].path).rejects.toThrow(/not a Hiltwright font library export/);
      expect((await readdir(lib.root)).filter((n) => !n.endsWith('.json'))).toEqual([]);
      expect(existsSync(join(lib.root, '..', 'escaped.wav'))).toBe(false);
    }
  });

  it('will not export nothing, or into the library itself, and a failed export leaves no file', async () => {
    const empty = await newLibrary();
    await expect(empty.exportTo(join(await tmp('out'), 'x.hwfonts'))).rejects.toThrow(/no fonts in the library/);
    const lib = await filled();
    await expect(lib.exportTo(join(lib.root, 'x.hwfonts'))).rejects.toThrow(/outside the font library/);
    const dir = await tmp('out');
    await expect(writeLibraryPack(join(dir, 'x.hwfonts'), [{ folder: 'A', meta: { name: 'A', maker: '', notes: '', added: '' }, files: [{ path: 'hum.wav', bytes: 5 }] }], async () => Buffer.from('changed size'))).rejects.toThrow(/changed while it was being exported/);
    expect(await readdir(dir)).toEqual([]);
  });

  it('exports only the fonts asked for', async () => {
    const lib = await filled();
    const file = join(await tmp('out'), 'some.hwfonts');
    expect(await lib.exportTo(file, undefined, { folders: ['Ember'] })).toMatchObject({ fonts: 1, files: 7 });
    const other = await newLibrary();
    expect(await other.importPack(file)).toEqual({ added: ['Ember'], skipped: [] });
    expect((await other.list())[0].meta).toMatchObject({ name: 'Kyber Ember', maker: 'Greyscale' });
    // A font that is not there stops the export; an empty selection exports nothing.
    await expect(lib.exportTo(file, undefined, { folders: ['Ember', 'Gone'] })).rejects.toThrow(/Gone is not in the font library/);
    await expect(lib.exportTo(file, undefined, { folders: [] })).rejects.toThrow(/no fonts in the library to export/);
  });

  it('locks the file with a passphrase when one is given, and with the app key when not', async () => {
    const lib = await filled();
    const dir = await tmp('out');
    const locked = join(dir, 'locked.hwfonts');
    const open = join(dir, 'open.hwfonts');
    await lib.exportTo(locked, undefined, { passphrase: 'correct horse ｂattery' });
    await lib.exportTo(open);
    expect(await libraryPackNeedsPassphrase(locked)).toBe(true);
    expect(await libraryPackNeedsPassphrase(open)).toBe(false);
    await expect(libraryPackNeedsPassphrase(join(lib.root, 'Ember', 'hum.wav'))).rejects.toThrow(/not a Hiltwright font library export/);

    // No passphrase, a wrong one, and the app's own key all fail, and nothing is added.
    const other = await newLibrary();
    await expect(other.importPack(locked)).rejects.toThrow(NEEDS_PASSPHRASE);
    await expect(other.importPack(locked, undefined, 'correct horse')).rejects.toThrow(WRONG_PASSPHRASE);
    const asOpen = Buffer.from(await readFile(locked)); asOpen[4] = 1;
    await writeFile(join(dir, 'forced.hwfonts'), asOpen);
    await expect(other.importPack(join(dir, 'forced.hwfonts'))).rejects.toThrow(/damaged or was cut short/);
    expect(await other.list()).toEqual([]);

    // The right one opens it, typed with a full-width letter or a plain one (the same passphrase to a person).
    expect((await other.importPack(locked, undefined, 'correct horse battery')).added).toEqual(['Ash Grey', 'Ember']);
    expect((await readFile(join(other.root, 'Ember', 'hum.wav'))).equals(await readFile(join(lib.root, 'Ember', 'hum.wav')))).toBe(true);
    // A passphrase given for a file that has none is not needed and does no harm.
    expect((await (await newLibrary()).importPack(open, undefined, 'anything')).added).toEqual(['Ash Grey', 'Ember']);
    // A locked file that is cut short after its list is damaged, not a wrong passphrase.
    const raw = await readFile(locked);
    await writeFile(join(dir, 'cut.hwfonts'), raw.subarray(0, raw.length - 40));
    await expect((await newLibrary()).importPack(join(dir, 'cut.hwfonts'), undefined, 'correct horse battery')).rejects.toThrow(/damaged or was cut short/);
  });

  it('carries the makers\' logos and links, and adds only what the other computer lacks', async () => {
    const lib = await filled();
    await lib.setMeta('Ash Grey', { maker: 'Shadowfoil' });
    const here = new ContributorStore(await tmp('data'));
    const png = join(await tmp('img'), 'logo.png');
    await writeFile(png, Buffer.concat([PNG, Buffer.from('greyscale')]));
    await here.setLogo('Greyscale', png);
    await here.setUrl('greyscale', 'greyscale.example');
    await here.setUrl('Shadowfoil', 'shadowfoil.example');
    await here.setUrl('Someone Else', 'else.example');
    const file = join(await tmp('out'), 'fonts.hwfonts');
    await lib.exportTo(file, undefined, { makersFor: (names) => here.carry(names) });
    const raw = await readFile(file);
    for (const plain of ['greyscale.example', 'Shadowfoil']) expect(raw.includes(Buffer.from(plain)), plain).toBe(false);

    // Only the makers of the exported fonts travel, and they arrive whole on a computer that knows none of them.
    const there = new ContributorStore(await tmp('data'));
    const r = await (await newLibrary()).importPack(file, undefined, undefined, (c) => there.adopt(c));
    expect(r.makers).toEqual(['Shadowfoil', 'Greyscale']);
    const got = await there.list();
    expect(got.map((p) => `${p.name} ${p.url}`)).toEqual(['Greyscale https://greyscale.example/', 'Shadowfoil https://shadowfoil.example/']);
    expect(got[0].logo).toBe((await here.list()).find((p) => p.name === 'Greyscale')!.logo);
    expect(got[1].logo).toBeNull();
    expect(importSummary(r).text).toBe('Added Ash Grey, Ember. Also added the logo or link for Shadowfoil, Greyscale.');

    // What the owner already has for a maker stays: the link here is kept, the missing logo is filled in.
    const mine = new ContributorStore(await tmp('data'));
    await mine.setUrl('GREYSCALE', 'my-own-link.example');
    await mine.setUrl('Shadowfoil', 'shadowfoil.example');
    const again = await (await newLibrary()).importPack(file, undefined, undefined, (c) => mine.adopt(c));
    expect(again.makers).toEqual(['Greyscale']);
    const kept = (await mine.list()).find((p) => p.name === 'GREYSCALE')!;
    expect(kept.url).toBe('https://my-own-link.example/');
    expect(kept.logo).toMatch(/^data:image\/png;base64,/);
    // A second import adds nothing more and leaves no spare picture behind.
    expect((await (await newLibrary()).importPack(file, undefined, undefined, (c) => mine.adopt(c))).makers).toBeUndefined();
    expect(await readdir(join((mine as unknown as { dir: string }).dir, 'contributors'))).toHaveLength(1);

    // With nobody to take the makers, or a selection whose maker has nothing kept, the fonts come in as before.
    expect((await (await newLibrary()).importPack(file)).added).toEqual(['Ash Grey', 'Ember']);
  });

  it('takes nothing from a file\'s makers but a small picture and a web address', async () => {
    const dir = await tmp('out');
    const file = join(dir, 'odd.hwfonts');
    const font: PackedFont = { folder: 'A', meta: { name: 'A', maker: 'M', notes: '', added: '' }, files: [{ path: 'hum.wav', bytes: 1 }] };
    await writeLibraryPack(file, [font], async () => Buffer.from('x'), { makers: [
      { name: 'Script', url: 'javascript:alert(1)', logo: { ext: '.exe', data: Buffer.from('MZ') } },
      { name: '../Climber', logo: { ext: '.png', data: PNG } },
      { name: 'Huge', logo: { ext: '.png', data: Buffer.alloc(2 * 1024 * 1024 + 1) } },
      { name: 'Fine', url: 'fine.example' },
    ] });
    const data = await tmp('data');
    const store = new ContributorStore(data);
    const r = await (await newLibrary()).importPack(file, undefined, undefined, (c) => store.adopt(c));
    expect(r.added).toEqual(['A']);
    expect(r.makers).toEqual(['../Climber', 'Fine']);
    // The odd name is only a name in the list; its picture is a file the app named, inside the logos folder.
    expect((await readdir(data)).sort()).toEqual(['contributors', 'contributors.bak.json', 'contributors.json'].filter((n) => existsSync(join(data, n))).sort());
    const logos = await readdir(join(data, 'contributors'));
    expect(logos).toHaveLength(1);
    expect(logos[0]).toMatch(/^[a-z0-9_]+-[a-z0-9]+\.png$/);
    expect((await store.list()).map((p) => p.name).sort()).toEqual(['../Climber', 'Fine']);

    // Logos cut off the end of a file: the fonts still come in.
    const raw = await readFile(file);
    await writeFile(join(dir, 'cut.hwfonts'), raw.subarray(0, raw.length - 20));
    const cut = await (await newLibrary()).importPack(join(dir, 'cut.hwfonts'), undefined, undefined, (c) => new ContributorStore(dir).adopt(c));
    expect(cut).toEqual({ added: ['A'], skipped: [] });
  });

  it('reads the list without unpacking the sounds', async () => {
    const lib = await filled();
    const file = join(await tmp('out'), 'fonts.hwfonts');
    await lib.exportTo(file);
    const pack = await openLibraryPack(file);
    expect(pack.list.fonts.map((f) => `${f.folder}: ${f.files.length} files`)).toEqual(['Ash Grey: 7 files', 'Ember: 7 files']);
    await pack.close();
  });
});
