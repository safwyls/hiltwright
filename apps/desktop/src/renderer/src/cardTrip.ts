// The card trip: everything a saber's SD card needs before its next flash, done in one go while the card is in a
// card reader (or shared over the saber's USB): the chosen fonts it lacks, the voice pack, and removing its presets
// file so a staged preset list takes effect. Done on Install › Card; Build & Flash says whether it is done.

import { useEffect, useState } from 'react';
import { propFamily, type SaberConfigModel } from '@hiltwright/core';
import type { LibraryFont, PackInfo, SaberRecord } from '../../shared/api';
import { fontLibraryList, packList, useSharedList, voicePackList, type VoicePackList } from './sharedLists';
import type { Board } from './board';
import { chosenFonts } from './saberFonts';
import { recordCopy, type CopyRoute } from './copyRate';
import { rememberVoiceOn, voiceOnCard, voiceWork, type VoiceNeed } from './voiceChoice';
import type { InstallNote } from './installFlow';
import type { useCardCheck } from './useCardCheck';

const api = () => window.hiltwright;
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const NO_FONTS: LibraryFont[] = [];
const NO_PACKS: PackInfo[] = [];
/** A chosen font the card lacks, and where it is copied from. Pack sizes are not known before the copy (bytes 0). */
export type TripFont = { folder: string; bytes: number; from: 'library' | 'pack'; packId?: string };
const NO_VOICES: VoicePackList = { packs: [], support: null, source: null, credit: null };

/**
 * Sabers whose card had its presets file removed on a card trip this session, for the staged list then being prepared
 * (by its start time): the trip does not offer it again, and the flash finds the list already in place.
 */
const presetsClearedFor = new Map<string, string>();

export function useCardTrip(o: { board: Board; saber: SaberRecord | null; model: SaberConfigModel | null; info: Board['info']; check: ReturnType<typeof useCardCheck> }) {
  const { board, saber, model, info, check } = o;
  const { cardCheck, cardCheckRef, voice } = check;
  // The font library and the voice packs, shared with the page this runs on (sharedLists.ts).
  const library = useSharedList(fontLibraryList, NO_FONTS).value;
  // The voice packs Hiltwright offers: the one chosen on Install › Fonts, else the one that comes with it.
  const voicePacks = useSharedList(voicePackList, NO_VOICES).value.packs;
  // The free fonts that ship with Hiltwright, copied like library fonts when a preset names one.
  const packs = useSharedList(packList, NO_PACKS).value;
  const [prepping, setPrepping] = useState<string | null>(null);
  const [prepNote, setPrepNote] = useState<InstallNote | null>(null);
  useEffect(() => api().sd.onCopyProgress((p) => setPrepping((now) => (now ? `Copying ${p.name}: ${p.done} of ${p.total} files` : now))), []);
  useEffect(() => { setPrepNote(null); }, [saber?.id]);

  // What the card still needs. Its fonts are known from a reader or the saber reading it now, else as last read.
  const inReader = cardCheck?.source === 'reader';
  const sharedRoot = board.card.shared && inReader && cardCheck.root === board.card.root;
  const route: CopyRoute = sharedRoot ? 'saber' : 'reader';
  const onCardNow = cardCheck?.source === 'reader' || cardCheck?.source === 'saber' ? cardCheck.fonts : info?.fonts.length ? info.fonts : null;
  // A font comes from the owner's library, else from the free fonts that ship with Hiltwright (its font packs).
  const libOf = (f: string) => library.find((l) => sameName(l.folder, f)) ?? null;
  const packOf = (f: string) => packs.find((p) => p.kind === 'font' && p.allow.copyToCard && sameName(p.name, f)) ?? null;
  const sourceOf = (f: string): TripFont | null => {
    const lib = libOf(f);
    if (lib) return { folder: lib.folder, bytes: lib.bytes, from: 'library' };
    const pack = packOf(f);
    return pack ? { folder: pack.name, bytes: 0, from: 'pack', packId: pack.id } : null;
  };
  const chosen = chosenFonts(model);
  const fontsToCopy = chosen.filter((f) => !(onCardNow ?? []).some((x) => sameName(x, f))).map(sourceOf).filter((l): l is TripFont => !!l);
  // Said only when the card's fonts are known: a font not in the library may well be on a card not read yet.
  const notInLibrary = onCardNow ? chosen.filter((f) => !sourceOf(f) && !onCardNow.some((x) => sameName(x, f))) : [];
  const copyBytes = fontsToCopy.reduce((n, f) => n + f.bytes, 0);
  const clearPresets = !!model?.presetsFrom && !!saber && !saber.planned && presetsClearedFor.get(saber.id) !== model.presetsFrom.at;
  const link = inReader && cardCheck.by === 'presets' && !!cardCheck.card.volumeSerial;
  // The Fett263 voice pack: put on when the card has no working one, or the owner chose another voice (voiceChoice.ts).
  const prop = model ? propFamily(model) : 'fett263';
  const bundledVoice = voicePacks.find((p) => p.have === 'bundled')?.id ?? null;
  const voiceNeed: { pack: string; why: VoiceNeed } | null = prop === 'fett263' && model && saber ? voiceWork({ chosen: model.voicePack, fallback: bundledVoice, voice: cardCheck?.source === 'out' ? null : voice, onCard: voiceOnCard(saber.id) }) : null;
  const voiceName = voiceNeed ? voicePacks.find((p) => p.id === voiceNeed.pack)?.name ?? voiceNeed.pack : '';
  const cardWork = fontsToCopy.length > 0 || clearPresets || !!voiceNeed;
  // Ready only when the card was read, needs nothing, lacks no chosen font, and (with Fett263) its voice pack is known:
  // a card not read yet, or one missing a font Hiltwright cannot copy, is not ready.
  const cardKnown = cardCheck?.source === 'reader' || cardCheck?.source === 'saber';
  const voiceKnown = prop !== 'fett263' || !!voice;
  const cardReady = !cardWork && !prepping && cardKnown && notInLibrary.length === 0 && voiceKnown;

  /** Copy the fonts the card lacks, remove its presets file for a staged list (a snapshot first), put on the voice pack, and remember the card. */
  const prepare = async () => {
    const c = cardCheckRef.current;
    if (c?.source !== 'reader' || !saber || !model) return;
    const work = { fonts: fontsToCopy, clearPresets, link, route, voice: voiceNeed ? { pack: voiceNeed.pack, name: voiceName } : null };
    // Every write names the volume the check read: a card swapped into that reader since is refused (issue #9).
    const vol = c.card.volumeId;
    setPrepping('Getting the card ready…'); setPrepNote(null);
    const done: string[] = [];
    try {
      // First: a card known only by its presets would not be known once its presets file goes.
      if (work.link) { await check.linkReaderCard(); done.push(`remembered it as ${saber.name}'s card`); }
      if (work.clearPresets && model.presetsFrom) {
        // The card's own presets are kept by main before its presets file goes (issue #7): its files unchanged, and the
        // list ProffieOS would load as a snapshot that Live › Presets can put back. Not the app's last reading, which
        // misses edits made on the saber since.
        setPrepping('Removing the presets file…');
        await api().sd.clearPresets(c.root, saber.id, vol);
        void board.snapshotSaved(saber.id);
        presetsClearedFor.set(saber.id, model.presetsFrom.at);
        done.push('removed its presets file, so it starts with your list after the flash');
      }
      for (const f of work.fonts) {
        setPrepping(`Copying ${f.folder}…`);
        const t0 = Date.now();
        if (f.from === 'pack' && f.packId) await api().packs.copyFontToCard(f.packId, c.root, { replace: false, volumeId: vol });
        else { await api().fontLibrary.copyToCard(f.folder, c.root, false, vol); recordCopy(work.route, f.bytes, Date.now() - t0); }
      }
      if (work.fonts.length) done.push(`copied ${work.fonts.length === 1 ? work.fonts[0].folder : `${work.fonts.length} fonts`}`);
      if (work.voice) {
        setPrepping(`Putting the ${work.voice.name} voice pack on…`);
        const r = await api().sd.installVoicePack(c.root, { pack: work.voice.pack }, vol);
        rememberVoiceOn(saber.id, work.voice.pack);
        done.push(`put the ${work.voice.name} voice pack in common${r.backup ? ` (what it replaced is kept on this computer, in ${r.backup})` : ''}`);
      }
      setPrepNote({ tone: 'green', text: `The card is ready: Hiltwright ${done.join(', ')}. ${work.route === 'saber' ? 'Give the card back' : 'Put the card back in the saber'}, plug the saber in, then flash it on Build & Flash.` });
    } catch (err) {
      setPrepNote({ tone: 'red', text: `The card was not finished${done.length ? ` (it ${done.join(', ')})` : ''}: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}` });
    } finally { setPrepping(null); check.again(); }
  };

  return { inReader, sharedRoot, route, onCardNow, fontsToCopy, notInLibrary, copyBytes, clearPresets, voiceNeed, voiceName, cardWork, cardKnown, cardReady, prepping, prepNote, prepare };
}
