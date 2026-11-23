// The Card page, in both sections: a saber's SD card in a card reader, or shared over the saber's USB. Lists fonts with
// the checks that catch the classic failures, lists tracks, sets up the voice pack, and copies a font folder from this
// computer onto the card after checking it.
//
// Install › Card works on the saber picked in the Armory, plugged in or not, and gets its card ready for the next
// flash in one trip (cardTrip.ts): the chosen fonts it lacks, the voice pack, its old presets file. Live › Card works on
// the saber plugged in now, for a small fix with no flash.

import { useCallback, useEffect, useRef, useState } from 'react';
import { FETT263_REQUIRED_VOICE_PACK, propFamily, copyAnywayQuestion, saberCanReadFileSystem, shouldAskBeforeCopy, type VoicePackStatus } from '@hiltwright/core';
import type { CardInfo, FontEntry, LibraryFont, PackInfo, VoicePackChoice, VoicePackInfo } from '../../shared/api';
import type { Workspace } from './workspace';
import type { Board } from './board';
import { XenoImport } from './XenoImport';
import { fontsForPresets, packCredit } from './fontNeeds';
import { FEATURES } from './features';
import { Icon } from './Icon';
import { Loader, LoadingSpace } from './Loader';
import { cardKind, chooseCard, rememberCardChoice, rememberedCardChoice } from './cardChoice';
import { ownedByText, ownerOfCard } from './cardOwner';
import { cachedCards, cachedRead, lastCardRead, rememberCards, sharedLook, sharedRead } from './cardCache';
import { Select } from './Select';
import { duringWork } from './work';
import { aboutTime, copySeconds } from './copyRate';
import { rememberVoiceOn, voiceNeedText } from './voiceChoice';
import { useCardCheck } from './useCardCheck';
import { useCardTrip } from './cardTrip';
import { fontLibraryList, packList, useSharedList, voicePackList, type VoicePackList } from './sharedLists';
import { DRIVE_WAIT_MS, giveCardBack, pickSaberDrive, plainDuration, shareCard, type Baseline, type GiveBackOutcome, type ShareDeps, type WaitProgress } from './cardShare';

const api = () => window.hiltwright;
const NO_FONTS: LibraryFont[] = [];
const NO_PACKS: PackInfo[] = [];
const NO_VOICES: VoicePackList = { packs: [], support: null, source: null, credit: null };

function mb(bytes: number | null): string {
  if (bytes == null) return '—';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export function Fonts({ board, ws, go, mode }: { board: Board; ws: Workspace; go: (page: 'library' | 'fonts' | 'build') => void; mode: 'install' | 'live' }) {
  const inInstall = mode === 'install';
  // Install › Card: what the picked saber's card needs before its flash, and the trip that does it.
  const check = useCardCheck(board, inInstall ? ws.saber : null);
  const trip = useCardTrip({ board, saber: inInstall ? ws.saber : null, model: ws.model, info: ws.info, check });
  // Drawn at once from what was last seen and read (cardCache.ts); the look on opening then says whether it still holds.
  const [cards, setCards] = useState<CardInfo[]>(() => cachedCards() ?? []);
  const [card, setCard] = useState<CardInfo | null>(() => { const r = lastCardRead(); return r ? cachedCards()?.find((c) => c.root === r.root) ?? null : null; });
  const [fonts, setFonts] = useState<FontEntry[]>(() => lastCardRead()?.fonts ?? []);
  const [tracks, setTracks] = useState<{ name: string; size: number }[]>(() => lastCardRead()?.tracks ?? []);
  const [picked, setPicked] = useState<FontEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: '' | 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoicePackStatus | null>(() => lastCardRead()?.voice ?? null);
  // The font library, and the fonts that ship with Hiltwright as packs (which may be copied to a card), shared app-wide
  // (sharedLists.ts). Until both are read, where each preset's font is cannot be said.
  const { value: library, read: libraryRead } = useSharedList(fontLibraryList, NO_FONTS);
  const { value: packs, read: packsRead } = useSharedList(packList, NO_PACKS);
  const [copyingNeeded, setCopyingNeeded] = useState<string | null>(null);
  // The saber's own card over USB. Hiltwright firmware carries a mass-storage interface, but ProffieOS only hands
  // the card over when asked ('sd 1'): the blade goes off, idle sounds stop, the card is released and Windows
  // mounts it as a drive. 'sd 0' takes it back. While the host has it, the saber cannot play from it.
  // In Install, only the picked saber's own card is shared: another saber plugged in is left alone.
  const live = board.status === 'connected' && !!board.info && (!inInstall || (!!ws.saber && board.saber?.id === ws.saber.id));
  // Whether the card is shared lives with the board session, so every page knows (card-safety D1); this page only
  // tracks the share or give-back under way.
  // 'asking': `sd 1` sent, waiting for the saber's answer; 'waiting': looking for its drive (cardShare.ts).
  const [usb, setUsb] = useState<'idle' | 'asking' | 'waiting' | 'ejecting' | 'unsupported'>('idle');
  const [usbNote, setUsbNote] = useState<string | null>(null);
  const shared = live && board.card.shared;
  const usbRoot = shared ? board.card.root : null;
  // A shared card whose drive the app cannot name: the owner ejects it in Windows, then confirms (design D4).
  const [ownerEjects, setOwnerEjects] = useState(false);
  // The wait for the drive ran out: the card stays shared and the owner chooses (keep waiting, or give it back).
  const [waitedOut, setWaitedOut] = useState(false);
  const [wait, setWait] = useState<WaitProgress | null>(null);
  const [waitStart, setWaitStart] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => { if (usb !== 'waiting') return; const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, [usb]);
  // The drives there before the saber shared its card, so "Look again" can still tell its new drive later.
  const beforeRef = useRef<Baseline>(null);
  const cancelRef = useRef(false);
  const wakeRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const liveRef = useRef(live);
  liveRef.current = live;
  const boardCardRef = useRef(board.card);
  boardCardRef.current = board.card;
  const cardSharedRef = useRef(board.cardShared);
  cardSharedRef.current = board.cardShared;
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; wakeRef.current?.(); }; }, []);
  useEffect(() => { if (!live) { setUsb('idle'); setOwnerEjects(false); setWaitedOut(false); setWait(null); wakeRef.current?.(); } }, [live]);
  // Files copied so far, while a copy is under way (D5).
  const [progress, setProgress] = useState<{ name: string; done: number; total: number } | null>(null);
  useEffect(() => api().sd.onCopyProgress(setProgress), []);
  // Replace takes two clicks (D6).
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Which card is shown and copied to (card-safety D3): the owner's pick, the saber's own while it shares it, or the
  // only one. Read through refs so a scan started before a render uses the latest of each.
  const [chosen, setChosenNow] = useState<string | null>(rememberedCardChoice);
  const setChosen = (root: string | null) => { rememberCardChoice(root); setChosenNow(root); };
  const serial = live ? board.saber?.identity.usbSerial ?? null : null;
  // The saber being worked on, connected or not: its own card in a reader is chosen first and named as its own.
  const me = (live ? board.saber : null) ?? ws.saber ?? null;
  const meRef = useRef(me);
  meRef.current = me;
  const libraryRef = useRef(board.library);
  libraryRef.current = board.library;
  const refreshLibraryRef = useRef(board.refreshLibrary);
  refreshLibraryRef.current = board.refreshLibrary;
  const owner = card ? ownerOfCard(card, board.library) : null;
  const [ownerNote, setOwnerNote] = useState<string | null>(null);
  /** The owner says whose card this is (or is not): it is known by its volume serial number from now on. */
  const setCardOwner = async (link: boolean) => {
    if (!card?.volumeSerial || !me) return;
    setOwnerNote(null);
    try {
      if (link) await api().library.linkCard(me.id, { serial: card.volumeSerial, label: card.label });
      else await api().library.unlinkCard(me.id, card.volumeSerial);
      await board.refreshLibrary();
    } catch (err) { setOwnerNote(`Could not change whose card this is: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
  };
  const ownRootsIn = (list: CardInfo[]) => { const s = meRef.current; return s ? list.filter((c) => ownerOfCard(c, libraryRef.current)?.saber.id === s.id).map((c) => c.root) : []; };
  const pickRef = useRef({ sharedRoot: usbRoot, saberSerial: serial, chosen });
  pickRef.current = { sharedRoot: usbRoot, saberSerial: serial, chosen };
  const choice = chooseCard(cards, { sharedRoot: usbRoot, saberSerial: serial, chosen, ownRoots: ownRootsIn(cards) });
  const isOwnCard = (c: CardInfo) => (!!serial && c.saberSerial === serial) || c.root === usbRoot;
  const cardName = (c: CardInfo) => `${c.root}${c.label ? ` ${c.label}` : ''}${isOwnCard(c) ? ` (${board.saber?.name ?? 'saber'}'s own)` : cardKind(c) === 'empty' ? ' (empty)' : cardKind(c) === 'other' ? ' (not a saber card)' : ''}`;
  const kind = card ? cardKind(card) : null;
  // A card the saber cannot read (exFAT, NTFS): it would find no fonts or presets on it. Copying asks first.
  const unreadable = !!card && saberCanReadFileSystem(card.fileSystem) === 'no';
  const [askFs, setAskFs] = useState<{ what: string; run: () => void } | null>(null);
  useEffect(() => { setAskFs(null); }, [card?.root]);
  // Sharing and giving back go through cardShare.ts; this page supplies the saber, Windows and the clock, and the words.
  const sleep = (ms: number) => new Promise<void>((res) => {
    const t = setTimeout(() => { wakeRef.current = null; res(); }, ms);
    wakeRef.current = () => { clearTimeout(t); wakeRef.current = null; res(); };
  });
  const shareDeps = (): ShareDeps => ({
    send: (command) => board.send(command, { idleMs: command === 'sd' ? 500 : 700 }),
    eject: (root) => api().sd.eject(root),
    look: () => api().sd.look(),
    now: () => Date.now(),
    sleep,
    saberSerial: serial,
    cancelled: () => cancelRef.current,
    stopped: () => !aliveRef.current || !liveRef.current,
    onProgress: setWait,
    log: (l) => console.log(`[sd] ${l}`),
    // From the saber's yes on, the card counts as shared: preset changes are refused until it is given back (D2).
    onShared: () => { if (!boardCardRef.current.shared) board.cardShared(null); },
    onWaiting: () => { setWaitStart(Date.now()); setUsb('waiting'); },
  });
  const afterGiveBack = (g: GiveBackOutcome) => {
    if (g.kind === 'given-back') { board.cardGivenBack(); beforeRef.current = null; setOwnerEjects(false); setWaitedOut(false); }
    else if (g.kind === 'eject-failed') setUsbNote(g.detail);
    else setUsbNote('The saber did not confirm it took its card back. Try again, or unplug it and plug it back in.');
  };
  // Share, or (with the saber already sharing) go straight to looking for its drive: the saber is asked first.
  const mountUsb = () => duringWork('share', mountUsbNow);
  const mountUsbNow = async () => {
    if (usb === 'asking' || usb === 'waiting') return;
    setUsb('asking'); setUsbNote(null); setWaitedOut(false); setWait(null);
    cancelRef.current = false;
    const out = await shareCard(shareDeps(), { before: beforeRef.current });
    setWait(null);
    if (out.kind === 'unsupported') { setUsb('unsupported'); setUsbNote('This firmware cannot share its card over USB. Hiltwright firmware can: build and install it, or put the card in a reader.'); return; }
    if (out.kind === 'refused') { setUsb('idle'); setUsbNote(`The saber answered "${out.answer}" instead of turning card access on.`); return; }
    if (out.kind === 'failed') { setUsb('idle'); setUsbNote(out.detail); return; }
    if (out.kind === 'cancelled') { setUsb('idle'); afterGiveBack(out.giveBack); await scan(); return; }
    beforeRef.current = out.before;
    setUsb('idle');
    if (out.kind === 'stopped') return;
    if (out.kind === 'found') {
      board.cardShared(out.card.root);
      pickRef.current = { ...pickRef.current, sharedRoot: out.card.root, chosen: null }; setChosen(null);
      await scan();
      return;
    }
    if (out.kind === 'several') { setUsbNote(`${out.cards.length} new drives appeared (${out.cards.map((c) => c.root).join(', ')}) and Hiltwright cannot tell which is ${board.saber?.name ?? 'the saber'}'s card. Choose it in the Card list.`); await scan(); return; }
    // The wait ran out. Nothing is sent to the saber: Windows may still be opening the card.
    setWaitedOut(true);
  };
  // Cancel while waiting: the card is given back the same way as "Give the card back".
  const cancelShare = () => { cancelRef.current = true; scanGen.current++; setScanning(false); wakeRef.current?.(); };
  const ejectUsb = () => duringWork('share', ejectUsbNow);
  const ejectUsbNow = async () => {
    setUsbNote(null);
    scanGen.current++; setScanning(false);
    // The drive comes first: Windows lets go of it, then the saber takes its card back (D4).
    let root = usbRoot;
    if (!root) {
      const mine = serial ? (await api().sd.locate()).find((c) => c.saberSerial === serial) : undefined;
      root = mine?.root ?? null;
    }
    if (!root && !ownerEjects && !waitedOut) {
      setOwnerEjects(true);
      setUsbNote(`Hiltwright cannot tell which drive is ${board.saber?.name ?? 'the saber'}'s card. Use Safely Remove in Windows for it, then press Give the card back again.`);
      return;
    }
    setUsb('ejecting');
    const g = await giveCardBack(shareDeps(), root);
    setUsb('idle');
    afterGiveBack(g);
    await scan();
  };

  // Reading a card's fonts over USB can take minutes. It must never stop the owner giving the card back, so it is
  // tracked apart from `busy` (a copy, which must not be cut short), and a scan overtaken by a newer one, or by the
  // card being given back, drops its results (card-safety 4.1, 2026-11-14).
  const [scanning, setScanning] = useState(false);
  const [noAnswer, setNoAnswer] = useState(false);
  const scanGen = useRef(0);
  /**
   * Look for cards, and read the chosen one. What was read before (cardCache.ts) is kept while it still describes the
   * card, so coming back to this page shows it at once and the look runs quietly; `fresh` (Look again) reads it anyway.
   */
  const scan = useCallback(async (fresh = false) => {
    const gen = ++scanGen.current;
    const current = () => gen === scanGen.current;
    // With an earlier read on show, the drive look runs without holding up the page; reading the card again does not.
    if (fresh || !lastCardRead()) setScanning(true);
    try {
      // A look another page (or this page's card check) started a moment ago is shared; Look again asks anew.
      const look = fresh ? await api().sd.look() : await sharedLook();
      if (!current()) return;
      // Windows did not answer: what is shown stays as it was, rather than reading as "no card".
      if (!look.answered) { console.log(`[sd] Look again: Windows did not answer (${look.detail})`); setNoAnswer(true); return; }
      setNoAnswer(false);
      const found = look.cards;
      // A shared card whose drive was not found yet (the wait ran out, or the saber was already sharing): adopt it
      // as soon as it shows, by the saber's USB serial or as the one drive new since the share.
      const bc = boardCardRef.current;
      if (liveRef.current && bc.shared && !bc.root) {
        const p = pickSaberDrive(found, { saberSerial: pickRef.current.saberSerial, before: beforeRef.current });
        if (p && 'card' in p) {
          console.log(`[sd] the shared card is ${p.card.root} (${p.by === 'serial' ? 'by its USB serial' : 'the one new drive'})`);
          cardSharedRef.current(p.card.root);
          pickRef.current = { ...pickRef.current, sharedRoot: p.card.root, chosen: null };
          rememberCardChoice(null); setChosenNow(null);
          setWaitedOut(false);
        }
      }
      setCards(found);
      rememberCards(found);
      // A card the connected saber shares is its own: remembered by its serial number, so it is known in a reader too.
      const sharing = liveRef.current ? meRef.current : null;
      const toLink = sharing?.identity.usbSerial ? found.find((c) => c.saberSerial === sharing.identity.usbSerial && c.volumeSerial && !sharing.cards?.some((x) => x.serial === c.volumeSerial)) : undefined;
      if (sharing && toLink?.volumeSerial) {
        try { await api().library.linkCard(sharing.id, { serial: toLink.volumeSerial, label: toLink.label }); await refreshLibraryRef.current(); console.log(`[sd] ${toLink.root} (${toLink.volumeSerial}) remembered as ${sharing.name}'s card`); }
        catch (err) { console.log(`[sd] could not remember the shared card: ${String(err)}`); }
      }
      const best = chooseCard(found, { ...pickRef.current, ownRoots: ownRootsIn(found) }).card;
      setCard(best);
      if (best) {
        const kept = fresh ? null : cachedRead(best);
        if (kept) {
          setFonts(kept.fonts); setTracks(kept.tracks); setVoice(kept.voice);
          console.log(`[sd] card ${best.root} unchanged since it was read ${Math.round((Date.now() - kept.at) / 1000)} s ago: not read again`);
          return;
        }
        setScanning(true);
        setFonts([]); setTracks([]); setVoice(null);
        // One read of the card, shared with any page reading the same card at the same time (cardCache.ts).
        const r = await sharedRead(best, fresh);
        if (!current()) { console.log(`[sd] reading ${best.root} finished after it was no longer wanted; dropped`); return; }
        setVoice(r.voice);
        setFonts(r.fonts);
        setTracks(r.tracks);
        console.log(`[sd] card ${best.root} fonts=${r.fonts.length} tracks=${r.tracks.length} issues=${r.fonts.reduce((a, x) => a + x.report.issues.length, 0)}`);
      } else {
        setFonts([]);
        setTracks([]);
        setVoice(null);
        const proffie = found.filter((c) => c.proffie).length;
        console.log(proffie > 1 ? `[sd] ${proffie} ProffieOS cards and none the saber's: asking which` : `[sd] no ProffieOS card among ${found.length} removable volume(s)`);
      }
    } catch (err) {
      if (current()) console.log(`[sd] reading the card failed: ${String(err)}`);
    } finally { if (current()) setScanning(false); }
  }, []);

  useEffect(() => { void scan(); }, [scan]);
  // A card put in a reader, or taken out, is looked at by itself (useCardCheck asks for the drives every few seconds).
  // Not while sharing or giving back: that flow looks for the drive itself.
  useEffect(() => { if (check.drives && usb === 'idle') void scan(); }, [check.drives]); // eslint-disable-line react-hooks/exhaustive-deps
  const sharing = usb === 'asking' || usb === 'waiting';
  const usbBusy = sharing || usb === 'ejecting';
  const waitedFor = usb === 'waiting' ? Date.now() - (wait?.startedAt ?? waitStart) : 0;
  // A copy or a scan under way: everything but giving the card back waits for it.
  const working = busy || scanning;

  const pick = async () => {
    const entry = await api().sd.pickFont();
    if (entry) { setPicked(entry); setMessage(null); setConfirmReplace(false); }
  };

  const copy = async (replace: boolean, sure = false) => {
    if (!picked || !card) return;
    if (replace && !confirmReplace) { setConfirmReplace(true); return; }
    if (shouldAskBeforeCopy(card.fileSystem) && !sure) { setAskFs({ what: picked.name, run: () => void copy(replace, true) }); return; }
    setAskFs(null);
    setConfirmReplace(false);
    setBusy(true); setProgress(null);
    try {
      const entry = await duringWork('copy', () => api().sd.copyFont(picked.path, card.root, replace, card.volumeId));
      setMessage({ tone: 'green', text: `${entry.name} copied to the card (${entry.report.files} files).` });
      setPicked(null);
      await scan();
    } catch (err) {
      const text = String(err).replace(/^Error: /, '');
      setMessage({ tone: /already on the card/.test(text) ? 'amber' : 'red', text });
    } finally { setBusy(false); setProgress(null); }
  };

  // The Fett263 controls speak their menus from a voice pack in common. Hiltwright can put one there: one of the packs
  // it offers (NoSloppy's, one bundled and the rest downloaded when picked), or a zip the owner chose. Whatever it
  // replaces is kept on this computer. The note opens by itself when the card's pack is missing or too old.
  const prop = ws.model ? propFamily(ws.model) : 'fett263';
  const fett263Card = !!card && !!voice && kind !== 'other' && prop === 'fett263';
  // An old pack's loose files beside a newer pack's folder (or the other way round) count twice: the same fix, a fresh copy.
  const voiceMixed = fett263Card && !!voice?.mixed?.length;
  const voiceShort = fett263Card && !!voice && (!voice.menuSounds || (voice.version ?? 0) < FETT263_REQUIRED_VOICE_PACK || voiceMixed);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Shared with the card trip on this page and with Install › Fonts; loaded again after a pack is put on (it may have
  // been downloaded).
  const { value: voiceList, read: voicesRead } = useSharedList(voicePackList, NO_VOICES);
  const loadVoices = () => voicePackList.refresh().catch(() => undefined);
  const [voiceId, setVoiceId] = useState('');
  const voiceSel = voiceList.packs.find((p) => p.id === voiceId) ?? voiceList.packs.find((p) => p.have === 'bundled') ?? voiceList.packs[0] ?? null;
  const voiceGroups = [...new Set(voiceList.packs.map((p) => p.group))];
  const [voiceDownload, setVoiceDownload] = useState<{ name: string; got: number; total: number } | null>(null);
  useEffect(() => api().sd.onVoicePackDownload(setVoiceDownload), []);
  const [pickedVoice, setPickedVoice] = useState<VoicePackInfo | null>(null);
  const plainErr = (err: unknown) => String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '');
  const pickVoice = async () => {
    setMessage(null);
    try { const v = await api().sd.pickVoicePack(); if (v) setPickedVoice(v); } catch (err) { setMessage({ tone: 'red', text: plainErr(err) }); }
  };
  const putVoicePack = async (source: { pack: string; name: string } | { file: string; name: string }, sure = false) => {
    if (!card) return;
    if (shouldAskBeforeCopy(card.fileSystem) && !sure) { setAskFs({ what: `the ${source.name} voice pack`, run: () => void putVoicePack(source, true) }); return; }
    setAskFs(null);
    setBusy(true); setProgress(null); setVoiceDownload(null); setMessage(null);
    try {
      const r = await duringWork('copy', () => api().sd.installVoicePack(card.root, 'pack' in source ? { pack: source.pack } : { file: source.file }, card.volumeId));
      setVoice(r.status); setPickedVoice(null); setVoiceOpen(false);
      // Which voice this saber now has, so the card trip does not put the Install › Fonts choice over it unasked.
      const whose = isOwnCard(card) ? board.saber?.id : owner?.saber.id;
      if (whose) rememberVoiceOn(whose, 'pack' in source ? source.pack : null);
      setMessage({ tone: 'green', text: `The ${source.name} voice pack (version ${r.status.version ?? 1}) is in the common folder.${r.backup ? ` What it replaced is kept on this computer, in ${r.backup}.` : ''}` });
    } catch (err) {
      setMessage({ tone: 'red', text: plainErr(err) });
    } finally { setBusy(false); setProgress(null); setVoiceDownload(null); void loadVoices(); }
  };

  // The fonts this saber's presets name, and where each one is: on the card, in the library ready to copy, or nowhere.
  const { needed, onCard, inLibrary, inPack, copyFrom, copyable } = fontsForPresets(ws.model?.presets ?? [], fonts, library, packs);
  const copyNeeded = async (list: string[], sure = false) => {
    if (!card) return;
    if (shouldAskBeforeCopy(card.fileSystem) && !sure) { setAskFs({ what: list.length === 1 ? list[0] : `${list.length} fonts`, run: () => void copyNeeded(list, true) }); return; }
    setAskFs(null);
    setBusy(true); setMessage(null);
    const done: string[] = []; const failed: string[] = [];
    try { await duringWork('copy', async () => {
      for (const f of list) {
        const src = copyFrom(f); if (!src) continue;
        setCopyingNeeded(f);
        setProgress(null);
        try { if (src.from === 'library') await api().fontLibrary.copyToCard(src.font.folder, card.root, false, card.volumeId); else await api().packs.copyFontToCard(src.pack.id, card.root, { replace: false, volumeId: card.volumeId }); done.push(f); } catch (err) { failed.push(`${f}: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
      }
      setMessage(failed.length ? { tone: done.length ? 'amber' : 'red', text: `${done.length ? `Copied ${done.join(', ')}. ` : ''}Not copied: ${failed.join('; ')}` } : { tone: 'green', text: `Copied ${done.join(', ')} to the card.` });
      await scan();
    }); } finally { setCopyingNeeded(null); setBusy(false); setProgress(null); }
  };

  const issues = fonts.flatMap((f) => f.report.issues.map((i) => ({ font: f.name, ...i })));
  const sel = fonts.find((f) => f.name === selected) ?? null;
  // The right column is tabbed so the selected font gets the whole column: picking a font in the list opens its tab.
  const [side, setSide] = useState<'presets' | 'add' | 'detail' | null>(null);
  const tab: 'presets' | 'add' | 'detail' = side === 'presets' && needed.length === 0 ? 'add' : side ?? (needed.length > 0 ? 'presets' : 'add');

  return (
    <>
      <section className="panel" aria-label="SD card status" data-tour="fonts-card">
        <div className="row" style={{ padding: '12px 18px', gap: 16 }}>
          <span style={{ color: card ? 'var(--holo)' : 'var(--mute)', display: 'flex', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>{scanning ? <Loader size="sm" /> : <Icon name="sd" />}</span>
          <div className="col grow" style={{ gap: 2 }}>
            <h3>{card ? `${kind === 'empty' ? 'Empty card' : kind === 'other' ? 'Not a saber card' : 'ProffieOS card'} at ${card.root}${card.label ? ` (${card.label})` : ''}${choice.own && card.root === choice.card?.root ? `: ${board.saber?.name ?? 'the saber'}'s own card` : ''}` : scanning ? 'Looking for a card…' : choice.ask ? (choice.choices.some((c) => c.proffie) ? `${choice.choices.length} cards found. Which one is this saber's?` : 'No ProffieOS card found. Choose a card to use') : 'No ProffieOS card found'}</h3>
            <div className="dim small">
              {card ? `${mb(card.freeBytes)} free of ${mb(card.totalBytes)} · ${scanning ? 'reading the fonts…' : `${fonts.length} fonts · ${tracks.length} tracks`} · presets.ini ${card.hasPresetsIni ? 'present' : 'not present'} · ${card.fileSystem ? `formatted ${card.fileSystem}` : 'format not reported'} · voice pack ${voice?.ini || voice?.menuSounds ? `version ${voice.version ?? 1}${voice.menuSounds ? '' : ', menu sounds missing'}` : 'not found'}`
                : choice.ask ? 'Choose the card in the list. Nothing is copied until you do.'
                : cards.length ? `${cards.length} removable volume${cards.length > 1 ? 's' : ''} seen, none with fonts on it. Put the saber's card in a reader.`
                : live ? 'Put the card in a reader, or let the saber share it over USB: it stops playing while it does.' : 'Put the saber\'s SD card in a card reader, or plug the saber in and share its card over USB.'}
              {fett263Card && (!voiceShort || (inInstall && !!trip.voiceNeed)) && !voiceOpen && voiceList.packs.length > 0 && !scanning && <> · <button type="button" className="holo" onClick={() => setVoiceOpen(true)}>Change the voice</button></>}
            </div>
            {/* The saber's USB runs at USB 1.1 speed: said before a copy that way, not found out during it (install-live-plan). */}
            {(shared || (live && !card)) && <div className="hint">Over the saber{'’'}s USB a typical 40 MB font takes {aboutTime(copySeconds(40_000_000, 'saber'))}; in a card reader, {aboutTime(copySeconds(40_000_000, 'reader'))}. Sharing suits a small fix. For more, use a card reader.</div>}
            {card && kind !== 'other' && (owner || (me && card.volumeSerial)) && <div className="small">
              {owner ? `${owner.saber.name}’s card (${ownedByText(owner.by)})` : 'Not known as any saber’s card yet'}
              {me && card.volumeSerial && (!owner || owner.saber.id !== me.id || owner.by === 'presets') && <> · <button type="button" className="holo" disabled={working} onClick={() => void setCardOwner(true)}>This is {me.name}{'’'}s card</button></>}
              {me && card.volumeSerial && owner?.by === 'linked' && owner.saber.id === me.id && <> · <button type="button" className="holo" disabled={working} onClick={() => void setCardOwner(false)}>Not {me.name}{'’'}s card</button></>}
              {ownerNote && <span className="dim"> {ownerNote}</span>}
            </div>}
          </div>
          {sharing
            ? <>
                <button type="button" className="btn sm pri" disabled><span className="b"><span className="i"><Loader size="sm" />{usb === 'asking' ? 'Asking the saber…' : 'Waiting for the drive…'}</span></span></button>
                <button type="button" className="btn sm warn" title="Stop waiting and give the card back to the saber" onClick={cancelShare}><span className="b"><span className="i"><Icon name="x" />Cancel</span></span></button>
              </>
            : shared
            ? <>
                {!usbRoot && <button type="button" className="btn sm" disabled={busy || usbBusy} title="Look for the saber's card again, for up to 3 minutes" onClick={() => void mountUsb()}><span className="b"><span className="i"><Icon name="usb" />{waitedOut ? 'Keep waiting' : 'Look for the drive'}</span></span></button>}
                <button type="button" className="btn sm warn" disabled={busy || usbBusy} title={busy ? 'Wait for the copy to finish' : undefined} onClick={() => void ejectUsb()}><span className="b"><span className="i">{usb === 'ejecting' ? <Loader size="sm" /> : <Icon name="eject" />}{usb === 'ejecting' ? 'Giving it back…' : 'Give the card back'}</span></span></button>
              </>
            : <button type="button" className="btn sm pri" disabled={!live || busy || usbBusy || usb === 'unsupported'} title={live ? 'The saber releases its card and it appears as a drive. The blade goes off and sound stops until you give it back.' : 'Plug the saber in first'} onClick={() => void mountUsb()}><span className="b"><span className="i">{usb === 'ejecting' ? <Loader size="sm" /> : <Icon name="usb" />}{usb === 'ejecting' ? 'Giving it back…' : 'Share the saber\u2019s card'}</span></span></button>}
          {(choice.choices.length > 1 || choice.ask) && (
            <label className="field" style={{ minWidth: 200 }}>
              <span className="input sans"><span className="ellip">{card ? cardName(card) : 'Choose a card…'}</span><span className="caret"><Icon name="down" /></span><Select aria-label="Card" value={card?.root ?? ''} disabled={busy} onChange={(e) => { const root = e.target.value || null; pickRef.current = { ...pickRef.current, chosen: root }; setChosen(root); /* the choice shows at once; its fonts follow (owner, 2026-11-14) */ setCard(cards.find((c) => c.root === root) ?? null); setFonts([]); setTracks([]); setVoice(null); void scan(); }}>
                {!card && <option value="">Choose a card…</option>}
                {choice.choices.map((c) => <option key={c.root} value={c.root}>{cardName(c)}</option>)}
              </Select></span>
            </label>
          )}
          <button type="button" className="btn sm" disabled={working} onClick={() => void scan(true)}><span className="b"><span className="i"><Icon name="undo" />Look again</span></span></button>
        </div>
        {/* Install › Card: what the picked saber's card needs before its flash, done in one trip. */}
        {inInstall && ws.saber && ws.model && (
          <div style={{ padding: '0 18px 12px' }} data-tour="card-trip">
            {/* Just prepared: the note saying what was done is enough. */}
            {!(trip.cardReady && trip.prepNote?.tone === 'green') && <div className={`note${trip.copyWork ? ' amber' : trip.cardReady ? ' green' : ''}`}>
              {trip.prepping ? <Loader size="sm" /> : <Icon name={trip.cardReady ? 'check' : 'sd'} />}
              <span className="col grow" style={{ gap: 6, minWidth: 0 }}>
                <b style={{ fontWeight: 600 }}>{trip.prepping ? trip.prepping
                  : trip.copyWork ? `Before ${ws.saber.name} is flashed, its card needs:`
                  : trip.cardReady ? `${ws.saber.name}’s card is ready for the flash${check.cardCheck?.source === 'saber' ? ', as the saber reads it' : ''}: it has the chosen fonts${trip.voiceNeed === null && prop === 'fett263' ? ' and a working voice pack' : ''}.`
                  : check.cardChecking ? `Checking ${ws.saber.name}’s card…`
                  : trip.cardKnown && trip.notInLibrary.length ? `${ws.saber.name}’s card is missing fonts that Hiltwright has no copy of.`
                  : trip.cardKnown ? `${ws.saber.name}’s card has the chosen fonts, but its voice pack could not be checked${check.voiceWhy ? `: ${check.voiceWhy}` : ''}.`
                  : `${ws.saber.name}’s card has not been read yet${check.voiceWhy ? ` (${check.voiceWhy})` : ''}. Put it in a card reader: it is found by itself.`}</b>
                {/* Only the old presets file: nothing to do before the flash, which removes it itself (cardTrip presetsAtFlash). */}
                {trip.presetsAtFlash && !trip.prepping && <span className="small">Your staged presets replace {ws.saber.name}’s own at the flash. The card’s old presets file is removed then, so {ws.saber.name} starts with your list: over USB with the card in {ws.saber.name}, or directly with the card in a card reader. A snapshot of {ws.saber.name}’s own presets is kept first.{trip.inReader ? ' You can also remove the presets file now.' : ''}</span>}
                {trip.copyWork && !trip.prepping && <>
                  {trip.fontsToCopy.length > 0 && <span className="small">· Copy {trip.fontsToCopy.map((f) => f.folder).join(', ')} ({mb(trip.copyBytes)}){trip.onCardNow ? '' : ', skipping any already on it'}.</span>}
                  {trip.voiceNeed && <span className="small">· {voiceNeedText(trip.voiceNeed.why, trip.voiceName, check.voice)} What it replaces is kept on this computer.</span>}
                  {trip.clearPresets && <span className="small">· Remove its presets file, so it starts with your staged list after the flash. A snapshot of its own presets is kept first.</span>}
                  <span className="hint" style={{ overflowWrap: 'anywhere' }}>{trip.inReader
                    ? (trip.sharedRoot ? `The card is shared over ${ws.saber.name}’s USB: slow, ${aboutTime(copySeconds(trip.copyBytes, 'saber'))} for this.` : `In the card reader (${check.cardCheck?.source === 'reader' ? check.cardCheck.root : ''}): ${aboutTime(copySeconds(trip.copyBytes, 'reader'))} for this.`)
                    : `Take the card out of ${ws.saber.name} and put it in a card reader on this computer: it is found by itself. ${trip.copyBytes > 0 ? `About ${aboutTime(copySeconds(trip.copyBytes, 'reader')).replace(/^about /, '')} in a reader; ${aboutTime(copySeconds(trip.copyBytes, 'saber'))} if the saber shares it over USB.` : ''}`}</span>
                </>}
                {trip.notInLibrary.length > 0 && <span className="small">{trip.notInLibrary.join(', ')} {trip.notInLibrary.length === 1 ? 'is' : 'are'} not in your font library, so {trip.notInLibrary.length === 1 ? 'it' : 'they'} cannot be copied. <button type="button" className="holo" onClick={() => go('fonts')}>Fonts</button></span>}
                {trip.cardReady && <span className="row" style={{ gap: 8 }}><button type="button" className="holo" onClick={() => go('build')}>On to Build &amp; Flash</button></span>}
              </span>
              {trip.cardWork && trip.inReader && !trip.prepping && <button type="button" className={`btn sm ${trip.presetsAtFlash ? '' : 'pri'}`} style={{ alignSelf: 'center' }} disabled={working || usbBusy} onClick={() => void trip.prepare().then(() => scan(true))}><span className="b"><span className="i"><Icon name="sd" />{trip.presetsAtFlash ? 'Remove it now' : 'Prepare the card'}</span></span></button>}
            </div>}
            {trip.prepNote && <div className={`note ${trip.prepNote.tone}`} style={{ marginTop: trip.cardReady && trip.prepNote.tone === 'green' ? 0 : 8 }}><Icon name={trip.prepNote.tone === 'green' ? 'check' : 'warn'} /><span>{trip.prepNote.text}{trip.prepNote.tone === 'green' && <> <button type="button" className="holo" onClick={() => go('build')}>Build &amp; Flash</button></>}</span></div>}
          </div>
        )}
        {card && unreadable && !scanning && <div style={{ padding: '0 18px 12px' }}><div className="note red"><Icon name="warn" /><span><b style={{ fontWeight: 600 }}>A saber cannot read this card.</b> It is formatted {card.fileSystem}, and a saber reads only FAT32 cards. With fonts on it the saber will still find no fonts or presets. To use this card, back up anything you need from it, then format it as FAT32. Windows{'’'} own format only offers FAT32 for cards up to 32 GB; a larger card needs a FAT32 formatting tool. Formatting erases everything on the card.</span></div></div>}
        {askFs && card && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>{copyAnywayQuestion(askFs.what, card.root, card.fileSystem)}</span><span className="row" style={{ gap: 8, marginLeft: 'auto' }}><button type="button" className="btn sm warn" onClick={askFs.run}><span className="b"><span className="i">Copy anyway</span></span></button><button type="button" className="btn sm ghost" onClick={() => setAskFs(null)}><span className="b"><span className="i">Cancel</span></span></button></span></div></div>}
        {card && kind === 'empty' && !scanning && <div style={{ padding: '0 18px 12px' }}><div className="note"><Icon name="sd" /><span>This card is empty. Copy the fonts the presets use, or add a font, to start a saber card on it. A saber also needs its <span className="mono">common</span> folder of shared sounds, which Hiltwright does not put on the card yet.</span></div></div>}
        {/* In Install the trip above puts the pack right; this note opens there only when asked (Change the voice). */}
        {fett263Card && voice && ((voiceShort && !(inInstall && trip.voiceNeed)) || voiceOpen) && !scanning && <div style={{ padding: '0 18px 12px' }}><div className={`note${voiceShort ? ' amber' : ''}`}><Icon name={voiceShort ? 'warn' : 'sd'} /><span className="col grow" style={{ gap: 10, minWidth: 0 }}>
          <span>{voiceMixed && voice.menuSounds && (voice.version ?? 0) >= FETT263_REQUIRED_VOICE_PACK
            ? `This card’s common folder has ${voice.mixed!.join(' and ')} both as a folder and as loose files, left from an older voice pack. The saber counts both, so it says “error in font directory” on every preset change. Put the voice pack on again to clear the loose files.`
            : voiceShort
            ? `${!voice.ini && !voice.menuSounds ? 'This card has no voice pack' : !voice.menuSounds ? 'This card’s voice pack has no menu sounds (mnum)' : `This card has voice pack version ${voice.version ?? 1}`}, and the Fett263 controls need version ${FETT263_REQUIRED_VOICE_PACK}. Until it has one, the saber speaks a voice pack error on every preset change.`
            : 'Choose the voice the Fett263 controls speak their menus in.'} It goes in the card{'’'}s common folder, and anything it replaces is kept on this computer first.</span>
          {!voicesRead && !pickedVoice && <span className="row" style={{ gap: 10 }}><Loader size="sm" /><span className="hint">Finding the voice packs…</span></span>}
          {pickedVoice
            ? <span><b style={{ fontWeight: 600 }}>{pickedVoice.name}</b>: version {pickedVoice.version}, {pickedVoice.files} files, {mb(pickedVoice.bytes)}.{pickedVoice.credit ? ` ${pickedVoice.credit}.` : ''}{pickedVoice.version < FETT263_REQUIRED_VOICE_PACK ? ` That is too old to stop the error: choose a version ${FETT263_REQUIRED_VOICE_PACK} pack.` : ''}</span>
            : voiceSel && <span className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                {voiceSel.picture ? <img src={voiceSel.picture} alt="" style={{ height: 72, width: 'auto', maxWidth: 128, objectFit: 'cover', borderRadius: 4, flex: 'none' }} /> : null}
                <span className="col grow" style={{ gap: 6, minWidth: 0 }}>
                  <label className="field" style={{ maxWidth: 340 }}>
                    <span className="input sans"><span className="ellip">{voiceSel.name}</span><span className="caret"><Icon name="down" /></span><Select aria-label="Voice" value={voiceSel.id} disabled={working} onChange={(e) => setVoiceId(e.target.value)}>
                      {voiceGroups.map((g) => <optgroup key={g} label={g}>{voiceList.packs.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
                    </Select></span>
                  </label>
                  {voiceSel.about && <span className="small">{voiceSel.about}</span>}
                  <span className="hint small">By {voiceSel.author}{voiceSel.year ? `, ${voiceSel.year}` : ''} · {voiceSel.have === 'bundled' ? 'comes with Hiltwright' : voiceSel.have === 'downloaded' ? 'downloaded before' : `downloads ${mb(voiceSel.assetBytes)}`}</span>
                </span>
              </span>}
          <span className="row wrap" style={{ gap: 8 }}>
            {pickedVoice ? <>
              {pickedVoice.version >= FETT263_REQUIRED_VOICE_PACK && <button type="button" className="btn sm pri" disabled={working} onClick={() => void putVoicePack({ file: pickedVoice.file, name: pickedVoice.name })}><span className="b"><span className="i"><Icon name="sd" />Copy this pack to the card</span></span></button>}
              <button type="button" className="btn sm ghost" disabled={working} onClick={() => setPickedVoice(null)}><span className="b"><span className="i">Cancel</span></span></button>
            </> : <>
              {voiceSel && <button type="button" className="btn sm pri" disabled={working} onClick={() => void putVoicePack({ pack: voiceSel.id, name: voiceSel.name })}><span className="b"><span className="i"><Icon name="sd" />Put {voiceSel.name} on the card</span></span></button>}
              <button type="button" className={`btn sm${voiceSel || !voicesRead ? '' : ' pri'}`} disabled={working} onClick={() => void pickVoice()}><span className="b"><span className="i">{voiceSel ? 'Use a zip you downloaded…' : 'Choose a voice pack zip…'}</span></span></button>
              {(!voiceShort || (inInstall && !!trip.voiceNeed)) && <button type="button" className="btn sm ghost" disabled={working} onClick={() => setVoiceOpen(false)}><span className="b"><span className="i">Close</span></span></button>}
            </>}
          </span>
          {voiceList.credit && !pickedVoice && <span className="hint small">{voiceList.credit} {voiceList.support && <button type="button" className="holo" onClick={() => void api().sd.openVoicePackLink('support')}>Support his work</button>}{voiceList.source && <> · <button type="button" className="holo" onClick={() => void api().sd.openVoicePackLink('source')}>Where they come from</button></>}</span>}
        </span></div></div>}
        {voiceDownload && busy && !progress && <div style={{ padding: '0 18px 12px' }}><div className="note" style={{ alignItems: 'center' }}><Loader progress={voiceDownload.total ? voiceDownload.got / voiceDownload.total : null} label={`Downloading the ${voiceDownload.name} voice pack`} /><span>Downloading the {voiceDownload.name} voice pack: {mb(voiceDownload.got)} of {mb(voiceDownload.total)}</span></div></div>}
        {card && kind === 'other' && !scanning && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>This drive has other files on it and no fonts or <span className="mono">presets.ini</span>, so it is not a saber card. Copying a font adds its folder beside those files and changes nothing else.</span></div></div>}
        {usb === 'asking' && <div style={{ padding: '0 18px 12px' }}><div className="note"><Loader size="sm" /><span>Asking the saber to share its card. It lets go of the card once any sound has stopped, which can take several seconds.</span></div></div>}
        {usb === 'waiting' && <div style={{ padding: '0 18px 12px' }}><div className="note"><Loader size="sm" /><span>The saber has let go of its card. Waiting for Windows to open it as a drive: {plainDuration(waitedFor)} so far. Windows can take a minute or two to open a large card over the saber{'’'}s USB link; Hiltwright keeps looking for up to {plainDuration(DRIVE_WAIT_MS)}.{wait?.last === 'no-answer' ? ' Windows did not answer the last look for drives, which usually means it is still opening the card.' : ''} Cancel gives the card back to the saber.</span></div></div>}
        {shared && !usbRoot && waitedOut && !sharing && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>Windows has not shown the card as a drive after {plainDuration(DRIVE_WAIT_MS)}. The saber is still sharing it, so preset changes stay off until you give it back. If a drive window has opened since, press Look again. Otherwise keep waiting, or give the card back.</span></div></div>}
        {noAnswer && !sharing && <div style={{ padding: '0 18px 12px' }}><div className="note"><Icon name="info" /><span>Windows did not answer when Hiltwright asked for its drives. It may be busy opening a card. Press Look again in a moment.</span></div></div>}
        {shared && !sharing && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>The saber has handed its card to this computer{usbRoot ? ` (${usbRoot})` : ''}. It cannot play until you give the card back; do that here rather than unplugging, so nothing is left half written. Copying is slow this way, a big font can take minutes.</span></div></div>}
        {!live && board.cardLostWhileShared && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>The connection went while the saber was sharing its card. The saber may still be holding its card. Reconnect it to give the card back.</span></div></div>}
        {progress && busy && <div style={{ padding: '0 18px 12px' }}><div className="note" style={{ alignItems: 'center' }}><Loader progress={progress.total ? progress.done / progress.total : null} label={`Copying ${progress.name}`} /><span>Copying {progress.name}: {progress.done} of {progress.total} files</span></div></div>}
        {usbNote && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>{usbNote}</span></div></div>}
        {message && <div style={{ padding: '0 18px 16px' }}><div className={`note ${message.tone}`}><Icon name={message.tone === 'green' ? 'check' : message.tone === 'red' ? 'x' : 'warn'} /><span>{message.text}</span></div></div>}
      </section>

      <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
        <section className="panel fill" aria-label="Fonts on the card" data-tour="fonts-table">
          <div className="scroll">
          <table>
            <thead><tr><th>Font</th><th>Size</th><th>Status</th></tr></thead>
            <tbody>
              {fonts.map((f) => (
                <tr key={f.name} className={f.name === selected ? 'on' : ''} onClick={() => { setSelected(f.name); setSide('detail'); }} style={{ cursor: 'pointer' }}>
                  <td className="fit"><span className="ellip" style={{ fontWeight: 600, display: 'block' }} title={f.name}>{f.name}</span><span className="hint ellip" style={{ display: 'block', fontSize: 11.5 }}>{f.report.type} · {f.report.files} files</span></td>
                  <td className="mono dim small nowrap">{mb(f.report.bytes)}</td>
                  <td className="nowrap">{f.report.issues.length ? <span className={`chip ${f.report.issues.some((i) => i.kind === 'missing-hum') ? 'err' : 'warn'}`}><Icon name="warn" />{f.report.issues.length} issue{f.report.issues.length > 1 ? 's' : ''}</span> : <span className="chip ok"><Icon name="check" />Ready</span>}</td>
                </tr>
              ))}
              {fonts.length === 0 && <tr><td colSpan={3} className="hint">{scanning ? <LoadingSpace text={card ? 'Reading the fonts on the card…' : 'Looking for a card…'} /> : card ? 'No font folders on this card.' : 'Nothing to show without a card.'}</td></tr>}
            </tbody>
          </table>
          {issues.length > 0 && (
            <div className="col" style={{ padding: '16px 18px', gap: 10, borderTop: '1px solid var(--line)' }}>
              {issues.slice(0, 8).map((i, k) => (
                <div key={k} className={`note ${i.kind === 'missing-hum' ? 'red' : 'amber'}`}><Icon name="warn" /><span><b style={{ fontWeight: 600 }}>{i.font}:</b> {i.text}</span></div>
              ))}
              {issues.length > 8 && <span className="hint">{issues.length - 8} more…</span>}
            </div>
          )}
          </div>
        </section>

        <aside className="panel fill" aria-label="Fonts: presets, adding, detail" data-tour="fonts-side">
          <div className="tabs" role="tablist">
            {needed.length > 0 && <button type="button" role="tab" aria-selected={tab === 'presets'} className={tab === 'presets' ? 'on' : ''} data-tour="fonts-tab-presets" onClick={() => setSide('presets')}>Preset fonts</button>}
            <button type="button" role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'on' : ''} data-tour="fonts-tab-add" onClick={() => setSide('add')}>Add a font</button>
            <button type="button" role="tab" aria-selected={tab === 'detail'} className={tab === 'detail' ? 'on' : ''} onClick={() => setSide('detail')}>{sel ? 'Selected font' : 'Tracks'}</button>
          </div>
          <div className="scroll">
          {tab === 'presets' && (
            <section aria-label="Fonts the presets use">
              <div className="ph"><h2>Fonts the presets use</h2>{card && copyable.length > 1 && <button type="button" className="btn sm pri" disabled={working} onClick={() => void copyNeeded(copyable)}><span className="b"><span className="i"><Icon name="sd" />Copy all {copyable.length}</span></span></button>}</div>
              {(!libraryRead || !packsRead || (scanning && !fonts.length)) ? <LoadingSpace text={scanning ? 'Reading the card…' : 'Looking in the font library…'} /> : <div className="list">
                {needed.map((f) => {
                  const lib = inLibrary(f);
                  const pack = lib ? null : inPack(f);
                  return (
                    <div key={f} className="li" style={{ minHeight: 38 }}>
                      <span className="col grow" style={{ gap: 0 }}><span className="small ellip" style={{ fontWeight: 600 }}>{f}</span>{lib && lib.meta.name !== lib.folder && <span className="hint ellip" style={{ fontSize: 11.5 }}>{lib.meta.name}{lib.meta.maker ? `, ${lib.meta.maker}` : ''}</span>}{pack && <span className="hint ellip" style={{ fontSize: 11.5 }}>{packCredit(pack)}</span>}</span>
                      {!card ? (lib ? <span className="chip ok"><Icon name="check" />In library</span> : pack ? <span className="chip ok"><Icon name="check" />Ready to copy</span> : <span className="chip" title="Put the card in to see whether it is there">Card not checked</span>)
                        : onCard(f) ? <span className="chip ok"><Icon name="check" />On the card</span>
                        : lib ? <button type="button" className="btn sm" disabled={working} onClick={() => void copyNeeded([f])}><span className="b"><span className="i">{copyingNeeded === f ? <><Loader size="sm" />Copying…</> : 'Copy from library'}</span></span></button>
                        : pack ? <button type="button" className="btn sm" disabled={working} onClick={() => void copyNeeded([f])}><span className="b"><span className="i">{copyingNeeded === f ? <><Loader size="sm" />Copying…</> : 'Copy to card'}</span></span></button>
                        : <span className="chip err" title="Not on the card, not in the font library and not in a font pack"><Icon name="x" />Missing</span>}
                    </div>
                  );
                })}
              </div>}
              {libraryRead && packsRead && !scanning && card && needed.some((f) => !copyFrom(f) && !onCard(f)) && <div className="pb hint" style={{ paddingTop: 10 }}>A font marked missing has to reach the card before the saber can play that preset. <button type="button" className="holo" onClick={() => go('library')}>Add it to the Font library</button> and copy it from here, or choose another font for that preset on the Presets page.</div>}
            </section>
          )}
          {tab === 'add' && <>
          <section aria-label="Add a font">
            {picked && <div className="ph"><h2>{picked.name}</h2>{picked.report.issues.length ? <span className="chip warn"><Icon name="warn" />{picked.report.issues.length} issue{picked.report.issues.length > 1 ? 's' : ''}</span> : <span className="chip ok"><Icon name="check" />Looks good</span>}</div>}
            <div className="pb col" style={{ gap: 12 }}>
              {picked ? (
                <>
                  <div className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600 }}>{picked.name}</b><span className="hint mono" style={{ fontSize: 11 }}>{picked.path}</span></div>
                  <div className="row wrap" style={{ gap: 8 }}><span className="chip">{picked.report.type}</span><span className="chip">{picked.report.files} files</span><span className="chip">{mb(picked.report.bytes)}</span></div>
                  {picked.report.issues.map((i, k) => <div key={k} className={`note ${i.kind === 'missing-hum' ? 'red' : 'amber'}`}><Icon name="warn" /><span>{i.text}</span></div>)}
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn sm pri" disabled={working || !card} onClick={() => void copy(false)}><span className="b"><span className="i"><Icon name="check" />Copy to card</span></span></button>
                    {fonts.some((f) => f.name.toLowerCase() === picked.name.toLowerCase()) && <button type="button" className="btn sm warn" disabled={working || !card} onClick={() => void copy(true)}><span className="b"><span className="i">{confirmReplace ? `Really replace ${picked.name}?` : 'Replace on card'}</span></span></button>}
                    <button type="button" className="btn sm ghost" onClick={() => { setPicked(null); setConfirmReplace(false); }}><span className="b"><span className="i">Cancel</span></span></button>
                  </div>
                </>
              ) : (
                <>
                  <p className="hint">Choose a font folder on this computer. Hiltwright checks the files before anything is copied. Your originals are never changed. Fonts you keep in the <button type="button" className="holo" onClick={() => go('library')}>Font library</button> can be copied from there.</p>
                  <button type="button" className="btn" disabled={working || !card} onClick={() => void pick()}><span className="b"><span className="i"><Icon name="import" />Choose folder</span></span></button>
                </>
              )}
            </div>
          </section>

          {FEATURES.xenopixelImport && <XenoImport card={card} board={board} onChanged={() => void scan()} />}

          </>}

          {tab === 'detail' && <section aria-label="Font detail">
            <div className="ph"><h2 className="ellip">{sel ? sel.name : 'Tracks'}</h2><span className="hint nowrap">{sel ? `${sel.report.type} · ${sel.report.files} files` : `${tracks.length} on the card`}</span></div>
            <div className="list">
              {sel
                ? Object.entries(sel.report.effects).sort().map(([effect, v]) => (
                    <div key={effect} className="li" style={{ minHeight: 34 }}><span className="grow small">{effect}</span><span className="mono mute" style={{ fontSize: 11.5 }}>{v.poly ? `${v.poly} poly` : ''}{v.poly && v.mono ? ' · ' : ''}{v.mono ? `${v.mono} mono` : ''}</span></div>
                  ))
                : tracks.map((t) => <div key={t.name} className="li" style={{ minHeight: 34 }}><span className="grow mono small">{t.name}</span><span className="mono mute" style={{ fontSize: 11.5 }}>{mb(t.size)}</span></div>)}
              {!sel && tracks.length === 0 && (scanning ? <LoadingSpace text="Reading the card…" compact /> : <div className="li hint" style={{ minHeight: 34 }}>No tracks folder.</div>)}
            </div>
          </section>}
          </div>
        </aside>
      </div>
    </>
  );
}
