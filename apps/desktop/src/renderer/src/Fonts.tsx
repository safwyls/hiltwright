// Fonts & SD: a ProffieOS card in a card reader. Lists fonts with the checks that catch the classic failures,
// lists tracks, and copies a font folder from this computer onto the card after checking it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyAnywayQuestion, saberCanReadFileSystem, shouldAskBeforeCopy, type VoicePackStatus } from '@hiltwright/core';
import type { CardInfo, FontEntry, LibraryFont, PackInfo } from '../../shared/api';
import type { Workspace } from './workspace';
import type { Board } from './board';
import { XenoImport } from './XenoImport';
import { fontsForPresets, packCredit } from './fontNeeds';
import { FEATURES } from './features';
import { Icon } from './Icon';
import { cardKind, chooseCard, rememberCardChoice, rememberedCardChoice } from './cardChoice';
import { Select } from './Select';
import { duringWork } from './work';
import { DRIVE_WAIT_MS, giveCardBack, pickSaberDrive, plainDuration, shareCard, type Baseline, type GiveBackOutcome, type ShareDeps, type WaitProgress } from './cardShare';

const api = () => window.hiltwright;

function mb(bytes: number | null): string {
  if (bytes == null) return '—';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export function Fonts({ board, ws, go }: { board: Board; ws: Workspace; go: (page: 'library') => void }) {
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [tracks, setTracks] = useState<{ name: string; size: number }[]>([]);
  const [picked, setPicked] = useState<FontEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: '' | 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoicePackStatus | null>(null);
  const [library, setLibrary] = useState<LibraryFont[]>([]);
  const [copyingNeeded, setCopyingNeeded] = useState<string | null>(null);
  useEffect(() => { void api().fontLibrary.list().then(setLibrary).catch(() => setLibrary([])); }, []);
  // Fonts that ship with Hiltwright as packs, and may be copied to a card.
  const [packs, setPacks] = useState<PackInfo[]>([]);
  useEffect(() => { void api().packs.list().then(setPacks).catch(() => setPacks([])); }, []);
  // The saber's own card over USB. Hiltwright firmware carries a mass-storage interface, but ProffieOS only hands
  // the card over when asked ('sd 1'): the blade goes off, idle sounds stop, the card is released and Windows
  // mounts it as a drive. 'sd 0' takes it back. While the host has it, the saber cannot play from it.
  const live = board.status === 'connected' && !!board.info;
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
  const pickRef = useRef({ sharedRoot: usbRoot, saberSerial: serial, chosen });
  pickRef.current = { sharedRoot: usbRoot, saberSerial: serial, chosen };
  const choice = chooseCard(cards, { sharedRoot: usbRoot, saberSerial: serial, chosen });
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
  const scan = useCallback(async () => {
    const gen = ++scanGen.current;
    const current = () => gen === scanGen.current;
    setScanning(true);
    try {
      const look = await api().sd.look();
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
      const best = chooseCard(found, pickRef.current).card;
      setCard(best);
      if (best) {
        setFonts([]); setTracks([]); setVoice(null);
        const [f, t, vp] = await Promise.all([api().sd.listFonts(best.root), api().sd.listTracks(best.root), api().sd.voicePack(best.root)]);
        if (!current()) { console.log(`[sd] reading ${best.root} finished after it was no longer wanted; dropped`); return; }
        setVoice(vp);
        setFonts(f);
        setTracks(t);
        console.log(`[sd] card ${best.root} fonts=${f.length} tracks=${t.length} issues=${f.reduce((a, x) => a + x.report.issues.length, 0)}`);
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
      const entry = await duringWork('copy', () => api().sd.copyFont(picked.path, card.root, replace));
      setMessage({ tone: 'green', text: `${entry.name} copied to the card (${entry.report.files} files).` });
      setPicked(null);
      await scan();
    } catch (err) {
      const text = String(err).replace(/^Error: /, '');
      setMessage({ tone: /already on the card/.test(text) ? 'amber' : 'red', text });
    } finally { setBusy(false); setProgress(null); }
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
        try { if (src.from === 'library') await api().fontLibrary.copyToCard(src.font.folder, card.root, false); else await api().packs.copyFontToCard(src.pack.id, card.root, { replace: false }); done.push(f); } catch (err) { failed.push(`${f}: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
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
          <span style={{ color: card ? 'var(--holo)' : 'var(--mute)', display: 'flex', width: 26, height: 26 }}><Icon name="sd" /></span>
          <div className="col grow" style={{ gap: 2 }}>
            <h3>{card ? `${kind === 'empty' ? 'Empty card' : kind === 'other' ? 'Not a saber card' : 'ProffieOS card'} at ${card.root}${card.label ? ` (${card.label})` : ''}${choice.own && card.root === choice.card?.root ? `: ${board.saber?.name ?? 'the saber'}'s own card` : ''}` : scanning ? 'Looking for a card…' : choice.ask ? (choice.choices.some((c) => c.proffie) ? `${choice.choices.length} cards found. Which one is this saber's?` : 'No ProffieOS card found. Choose a card to use') : 'No ProffieOS card found'}</h3>
            <div className="dim small">
              {card ? `${mb(card.freeBytes)} free of ${mb(card.totalBytes)} · ${scanning ? 'reading the fonts…' : `${fonts.length} fonts · ${tracks.length} tracks`} · presets.ini ${card.hasPresetsIni ? 'present' : 'not present'} · ${card.fileSystem ? `formatted ${card.fileSystem}` : 'format not reported'} · voice pack ${voice?.ini || voice?.menuSounds ? `version ${voice.version ?? 1}${voice.menuSounds ? '' : ', menu sounds missing'}` : 'not found'}`
                : choice.ask ? 'Choose the card in the list. Nothing is copied until you do.'
                : cards.length ? `${cards.length} removable volume${cards.length > 1 ? 's' : ''} seen, none with fonts on it. Put the saber's card in a reader.`
                : live ? 'Put the card in a reader, or let the saber share it over USB: it stops playing while it does.' : 'Put the saber\'s SD card in a card reader, or plug the saber in and share its card over USB.'}
            </div>
          </div>
          {sharing
            ? <>
                <button type="button" className="btn sm pri" disabled><span className="b"><span className="i"><Icon name="usb" />{usb === 'asking' ? 'Asking the saber…' : 'Waiting for the drive…'}</span></span></button>
                <button type="button" className="btn sm warn" title="Stop waiting and give the card back to the saber" onClick={cancelShare}><span className="b"><span className="i"><Icon name="x" />Cancel</span></span></button>
              </>
            : shared
            ? <>
                {!usbRoot && <button type="button" className="btn sm" disabled={busy || usbBusy} title="Look for the saber's card again, for up to 3 minutes" onClick={() => void mountUsb()}><span className="b"><span className="i"><Icon name="usb" />{waitedOut ? 'Keep waiting' : 'Look for the drive'}</span></span></button>}
                <button type="button" className="btn sm warn" disabled={busy || usbBusy} title={busy ? 'Wait for the copy to finish' : undefined} onClick={() => void ejectUsb()}><span className="b"><span className="i"><Icon name="eject" />{usb === 'ejecting' ? 'Giving it back…' : 'Give the card back'}</span></span></button>
              </>
            : <button type="button" className="btn sm pri" disabled={!live || busy || usbBusy || usb === 'unsupported'} title={live ? 'The saber releases its card and it appears as a drive. The blade goes off and sound stops until you give it back.' : 'Plug the saber in first'} onClick={() => void mountUsb()}><span className="b"><span className="i"><Icon name="usb" />{usb === 'ejecting' ? 'Giving it back…' : 'Share the saber\u2019s card'}</span></span></button>}
          {(choice.choices.length > 1 || choice.ask) && (
            <label className="field" style={{ minWidth: 200 }}><span className="label">Card</span>
              <span className="input sans"><span className="ellip">{card ? cardName(card) : 'Choose a card…'}</span><span className="caret"><Icon name="down" /></span><Select aria-label="Card" value={card?.root ?? ''} disabled={busy} onChange={(e) => { const root = e.target.value || null; pickRef.current = { ...pickRef.current, chosen: root }; setChosen(root); /* the choice shows at once; its fonts follow (owner, 2026-11-14) */ setCard(cards.find((c) => c.root === root) ?? null); setFonts([]); setTracks([]); setVoice(null); void scan(); }}>
                {!card && <option value="">Choose a card…</option>}
                {choice.choices.map((c) => <option key={c.root} value={c.root}>{cardName(c)}</option>)}
              </Select></span>
            </label>
          )}
          <button type="button" className="btn sm" disabled={working} onClick={() => void scan()}><span className="b"><span className="i"><Icon name="undo" />Look again</span></span></button>
        </div>
        {card && unreadable && !scanning && <div style={{ padding: '0 18px 12px' }}><div className="note red"><Icon name="warn" /><span><b style={{ fontWeight: 600 }}>A saber cannot read this card.</b> It is formatted {card.fileSystem}, and a saber reads only FAT32 cards. With fonts on it the saber will still find no fonts or presets. To use this card, back up anything you need from it, then format it as FAT32. Windows{'’'} own format only offers FAT32 for cards up to 32 GB; a larger card needs a FAT32 formatting tool. Formatting erases everything on the card.</span></div></div>}
        {askFs && card && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>{copyAnywayQuestion(askFs.what, card.root, card.fileSystem)}</span><span className="row" style={{ gap: 8, marginLeft: 'auto' }}><button type="button" className="btn sm warn" onClick={askFs.run}><span className="b"><span className="i">Copy anyway</span></span></button><button type="button" className="btn sm ghost" onClick={() => setAskFs(null)}><span className="b"><span className="i">Cancel</span></span></button></span></div></div>}
        {card && kind === 'empty' && !scanning && <div style={{ padding: '0 18px 12px' }}><div className="note"><Icon name="sd" /><span>This card is empty. Copy the fonts the presets use, or add a font, to start a saber card on it. A saber also needs its <span className="mono">common</span> folder and voice pack, which Hiltwright does not put on the card yet.</span></div></div>}
        {card && kind === 'other' && !scanning && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>This drive has other files on it and no fonts or <span className="mono">presets.ini</span>, so it is not a saber card. Copying a font adds its folder beside those files and changes nothing else.</span></div></div>}
        {usb === 'asking' && <div style={{ padding: '0 18px 12px' }}><div className="note"><Icon name="usb" /><span>Asking the saber to share its card. It lets go of the card once any sound has stopped, which can take several seconds.</span></div></div>}
        {usb === 'waiting' && <div style={{ padding: '0 18px 12px' }}><div className="note"><Icon name="usb" /><span>The saber has let go of its card. Waiting for Windows to open it as a drive: {plainDuration(waitedFor)} so far. Windows can take a minute or two to open a large card over the saber{'’'}s USB link; Hiltwright keeps looking for up to {plainDuration(DRIVE_WAIT_MS)}.{wait?.last === 'no-answer' ? ' Windows did not answer the last look for drives, which usually means it is still opening the card.' : ''} Cancel gives the card back to the saber.</span></div></div>}
        {shared && !usbRoot && waitedOut && !sharing && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>Windows has not shown the card as a drive after {plainDuration(DRIVE_WAIT_MS)}. The saber is still sharing it, so preset changes stay off until you give it back. If a drive window has opened since, press Look again. Otherwise keep waiting, or give the card back.</span></div></div>}
        {noAnswer && !sharing && <div style={{ padding: '0 18px 12px' }}><div className="note"><Icon name="info" /><span>Windows did not answer when Hiltwright asked for its drives. It may be busy opening a card. Press Look again in a moment.</span></div></div>}
        {shared && !sharing && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>The saber has handed its card to this computer{usbRoot ? ` (${usbRoot})` : ''}. It cannot play until you give the card back; do that here rather than unplugging, so nothing is left half written. Copying is slow this way, a big font can take minutes.</span></div></div>}
        {!live && board.cardLostWhileShared && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>The connection went while the saber was sharing its card. The saber may still be holding its card. Reconnect it to give the card back.</span></div></div>}
        {progress && busy && <div style={{ padding: '0 18px 12px' }}><div className="note"><Icon name="sd" /><span>Copying {progress.name}: {progress.done} of {progress.total} files</span></div></div>}
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
              {fonts.length === 0 && <tr><td colSpan={3} className="hint">{card ? 'No font folders on this card.' : 'Nothing to show without a card.'}</td></tr>}
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
              <div className="list">
                {needed.map((f) => {
                  const lib = inLibrary(f);
                  const pack = lib ? null : inPack(f);
                  return (
                    <div key={f} className="li" style={{ minHeight: 38 }}>
                      <span className="col grow" style={{ gap: 0 }}><span className="small ellip" style={{ fontWeight: 600 }}>{f}</span>{lib && lib.meta.name !== lib.folder && <span className="hint ellip" style={{ fontSize: 11.5 }}>{lib.meta.name}{lib.meta.maker ? `, ${lib.meta.maker}` : ''}</span>}{pack && <span className="hint ellip" style={{ fontSize: 11.5 }}>{packCredit(pack)}</span>}</span>
                      {!card ? (lib ? <span className="chip ok"><Icon name="check" />In library</span> : pack ? <span className="chip ok"><Icon name="check" />Ready to copy</span> : <span className="chip" title="Put the card in to see whether it is there">Card not checked</span>)
                        : onCard(f) ? <span className="chip ok"><Icon name="check" />On the card</span>
                        : lib ? <button type="button" className="btn sm" disabled={working} onClick={() => void copyNeeded([f])}><span className="b"><span className="i">{copyingNeeded === f ? 'Copying…' : 'Copy from library'}</span></span></button>
                        : pack ? <button type="button" className="btn sm" disabled={working} onClick={() => void copyNeeded([f])}><span className="b"><span className="i">{copyingNeeded === f ? 'Copying…' : 'Copy to card'}</span></span></button>
                        : <span className="chip err" title="Not on the card, not in the font library and not in a font pack"><Icon name="x" />Missing</span>}
                    </div>
                  );
                })}
              </div>
              {card && needed.some((f) => !copyFrom(f) && !onCard(f)) && <div className="pb hint" style={{ paddingTop: 10 }}>A font marked missing has to reach the card before the saber can play that preset. <button type="button" className="holo" onClick={() => go('library')}>Add it to the Font library</button> and copy it from here, or choose another font for that preset on the Presets page.</div>}
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
              {!sel && tracks.length === 0 && <div className="li hint" style={{ minHeight: 34 }}>No tracks folder.</div>}
            </div>
          </section>}
          </div>
        </aside>
      </div>
    </>
  );
}
