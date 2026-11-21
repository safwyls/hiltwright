// The fonts a saber's presets name, and where each one is: on the card, in the library ready to copy, or nowhere.
// Moved out of Fonts.tsx unchanged so it can be tested (sd-fonts-test-coverage).

import type { FontEntry, LibraryFont, PackInfo } from '../../shared/api';

/** The part of a pack the page needs: enough to tell whether it is a font that may be copied, and to credit it. */
export type FontPack = Pick<PackInfo, 'id' | 'kind' | 'name' | 'creator' | 'licence' | 'allow'>;

export interface FontNeeds {
  /** Font folders the presets name (their first font path), without `common`, each once. */
  needed: string[];
  /** Needed, not on the card, and in the library or in a pack that allows copying: "Copy all" copies these. */
  copyable: string[];
  /** Needed, and not on the card, in the library or in a pack that allows copying. */
  missing: string[];
  onCard(font: string): boolean;
  inLibrary(font: string): LibraryFont | null;
  /** A pack that allows copying this font to a card. A font in the library copies from there instead (see `copyFrom`). */
  inPack(font: string): FontPack | null;
  /** Where a copy comes from: the library when it has the font, else a pack. */
  copyFrom(font: string): { from: 'library'; font: LibraryFont } | { from: 'pack'; pack: FontPack } | null;
}

/** "TeensySF · by KRSABERS.COM, CC BY-SA 4.0": the credit the licence asks to be shown with a pack's font. */
export function packCredit(pack: Pick<FontPack, 'name' | 'creator' | 'licence'>): string {
  return `${pack.name} · by ${pack.creator}, ${pack.licence}`;
}

export function fontsForPresets(presets: { font: string }[], cardFonts: Pick<FontEntry, 'name'>[], library: LibraryFont[], packs: FontPack[] = []): FontNeeds {
  const needed = [...new Set(presets.map((p) => p.font.split(';')[0]?.trim() ?? '').filter((f) => f && f.toLowerCase() !== 'common'))];
  const onCard = (f: string) => cardFonts.some((x) => x.name.toLowerCase() === f.toLowerCase());
  const inLibrary = (f: string) => library.find((x) => x.folder.toLowerCase() === f.toLowerCase()) ?? null;
  const inPack = (f: string) => packs.find((p) => p.kind === 'font' && p.allow.copyToCard && p.name.toLowerCase() === f.toLowerCase()) ?? null;
  const copyFrom = (f: string): ReturnType<FontNeeds['copyFrom']> => {
    const lib = inLibrary(f);
    if (lib) return { from: 'library', font: lib };
    const pack = inPack(f);
    return pack ? { from: 'pack', pack } : null;
  };
  return {
    needed,
    copyable: needed.filter((f) => !onCard(f) && copyFrom(f)),
    missing: needed.filter((f) => !onCard(f) && !copyFrom(f)),
    onCard,
    inLibrary,
    inPack,
    copyFrom,
  };
}

export interface MissingFontWarning {
  /** Presets whose font is not on the card. */
  presets: number;
  /** Those fonts, each once, as the presets spell them. */
  fonts: string[];
  text: string;
}

/**
 * The presets that will be on the saber, judged against the card's font folders. Null when nothing is missing, and
 * also when the card's contents are not known (`cardFonts` null): not knowing is not the same as missing.
 * A preset whose font path is only `common` names no font of its own.
 */
export function missingFontWarning(presets: { font: string }[], cardFonts: string[] | null): MissingFontWarning | null {
  if (!cardFonts) return null;
  const onCard = (f: string) => cardFonts.some((x) => x.toLowerCase() === f.toLowerCase());
  const first = (p: { font: string }) => p.font.split(';')[0]?.trim() ?? '';
  const bad = presets.filter((p) => { const f = first(p); return f && f.toLowerCase() !== 'common' && !onCard(f); });
  if (!bad.length) return null;
  const fonts: string[] = [];
  for (const p of bad) if (!fonts.some((f) => f.toLowerCase() === first(p).toLowerCase())) fonts.push(first(p));
  const n = bad.length;
  return {
    presets: n,
    fonts,
    text: `${n} preset${n === 1 ? ' names' : 's name'} ${fonts.length === 1 ? 'a font' : 'fonts'} that ${fonts.length === 1 ? 'is' : 'are'} not on the card (${fonts.join(', ')}). The saber will say "font directory not found" for ${n === 1 ? 'it' : 'them'}. Copy ${fonts.length === 1 ? 'it' : 'them'} onto the card in the Card step on this page, or choose another font on the Presets page.`,
  };
}
