// What a saber's own SD card holds, wherever it is: in a card reader on this computer (read directly: the reader
// flow, which needs no USB sharing), or in the saber (asked over serial), or out of both, when nothing is said about
// fonts or the voice pack until it is back. Install › Fonts, Install › Card and Build & Flash use it. It looks again by itself
// when a drive comes or goes, so a card put in a reader shows up without a button.

import { useEffect, useRef, useState } from 'react';
import { parseList, sdFailureIn, voicePackFromSerial, wiringFromConfig, type ConfigWiring, type VoicePackStatus } from '@hiltwright/core';
import type { CardInfo, SaberRecord } from '../../shared/api';
import type { Board } from './board';
import { saberCardIn, type OwnedBy } from './cardOwner';
import { sharedLook, sharedRead } from './cardCache';

const api = () => window.hiltwright;
const DRIVE_POLL_MS = 2500;

export type CardCheck = { source: 'reader'; root: string; by: OwnedBy; card: CardInfo; fonts: string[] } | { source: 'saber'; fonts: string[] } | { source: 'out' };
type Own = { fonts: string[]; voice: VoicePackStatus | null; why: string | null; out: boolean };
type Result = { cardCheck: CardCheck | null; voice: VoicePackStatus | null; voiceWhy: string | null };

/**
 * The saber's own answers about its card (list_fonts, cat, dir), kept for the connection they were asked on (the
 * board's info object, new on every connect): every page asking again would cost a round of serial commands each time.
 * Forgotten when the card is shared (this computer may change it) and on Look again.
 */
let saberAnswers = new WeakMap<object, Own>();
/** Each saber's last check, shown at once when another page opens while it is checked again quietly. */
const lastChecks = new Map<string, Result>();

export function useCardCheck(board: Board, saber: SaberRecord | null) {
  const kept = saber ? lastChecks.get(saber.id) ?? null : null;
  const [voice, setVoice] = useState<VoicePackStatus | null>(kept?.voice ?? null);
  // Why the card could not be read, when it could not (kept apart from "the pack is not there").
  const [voiceWhy, setVoiceWhy] = useState<string | null>(kept?.voiceWhy ?? null);
  const [cardCheck, setCardCheck] = useState<CardCheck | null>(kept?.cardCheck ?? null);
  const cardCheckRef = useRef<CardCheck | null>(null);
  cardCheckRef.current = cardCheck;
  const [lookAgain, setLookAgain] = useState(0);
  // Look again asks everything afresh: the saber's answers and the card in a reader.
  const freshRef = useRef(false);
  const [cardConfig, setCardConfig] = useState<{ name: string; wiring: ConfigWiring } | null>(null);
  // The card is being checked: what is known about the voice pack and fonts is not known yet, rather than missing.
  const [cardChecking, setCardChecking] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  // A shared card can change from this computer: what the saber said about it no longer holds.
  useEffect(() => { if (board.card.shared) saberAnswers = new WeakMap(); }, [board.card.shared]);
  useEffect(() => {
    const me = saber;
    if (!me) return;
    let live = true;
    const fresh = freshRef.current;
    freshRef.current = false;
    // With a check of this saber already on show, the new one runs quietly and replaces it when done.
    if (fresh || !lastChecks.has(me.id)) setCardChecking(true);
    const show = (r: Result) => { lastChecks.set(me.id, r); setCardCheck(r.cardCheck); setVoice(r.voice); setVoiceWhy(r.voiceWhy); };
    void (async () => {
      // The saber's own view: not while its card is shared, when the saber would be reading a card this computer has
      // (card-safety D2). Asked once per connection (saberAnswers), and again on Look again: after copying fonts over
      // the shared card the answers are forgotten.
      let own: Own | null = null;
      const conn = board.info;
      if (board.status === 'connected' && !board.card.shared && board.saber?.id === me.id && conn && !fresh && saberAnswers.has(conn)) own = saberAnswers.get(conn)!;
      else if (board.status === 'connected' && !board.card.shared && board.saber?.id === me.id) {
        try {
          const lf = await board.send('list_fonts', { idleMs: 700 });
          const cat = await board.send('cat common/voicepack.ini', { idleMs: 700 });
          const dir = await board.send('dir common', { idleMs: 900, until: (l) => /^(Done listing files\.|No such directory\.)/.test(l) });
          const out = sdFailureIn([...lf.lines, ...cat.lines, ...dir.lines]) || !!board.info?.sdMissing;
          const rejected = [...cat.lines, ...dir.lines].some((l) => /^Whut\? :/.test(l));
          own = { fonts: parseList(lf.lines), voice: rejected || out ? null : voicePackFromSerial(cat.lines, dir.lines), why: rejected ? 'this firmware does not answer the card commands (cat and dir)' : null, out };
          if (conn) saberAnswers.set(conn, own);
        } catch { own = { fonts: [], voice: null, why: 'the saber is not answering', out: false }; }
      }
      // Its card in a reader. One known only by its presets gives way to a card the saber is reading itself. The look
      // and the read are shared with any other page asking at the same moment (cardCache.ts).
      let reader: ReturnType<typeof saberCardIn> = null;
      try { const look = fresh ? await api().sd.look() : await sharedLook(); if (look.answered) reader = saberCardIn(look.cards, me, board.library); } catch { /* no drive list */ }
      if (reader && (reader.by !== 'presets' || !own || own.out || !own.fonts.length)) {
        const root = reader.card.root;
        try {
          const read = await sharedRead(reader.card, fresh);
          if (!live) return;
          show({ cardCheck: { source: 'reader', root, by: reader.by, card: reader.card, fonts: read.fonts.map((f) => f.name) }, voice: read.voice, voiceWhy: null });
          // An installer's config on the card: its pins are checked against the wiring.
          void api().sd.configFiles(root).then((files) => {
            for (const f of files) { const w = wiringFromConfig(f.text); if (w && live) { setCardConfig({ name: f.name, wiring: w }); return; } }
          }).catch(() => undefined);
          return;
        } catch (err) { console.log(`[card] reading the card in the reader (${root}) failed: ${String(err)}`); }
      }
      if (!live) return;
      if (own?.out) show({ cardCheck: { source: 'out' }, voice: null, voiceWhy: null });
      else if (own) show({ cardCheck: { source: 'saber', fonts: own.fonts }, voice: own.voice, voiceWhy: own.why });
      else show({ cardCheck: null, voice: null, voiceWhy: null });
    })().finally(() => { if (live) setCardChecking(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.status, board.saber?.id, board.card.shared, saber?.id, lookAgain]);
  // A card put in a reader, or taken out, is looked at by itself: the drives mounted are asked every few seconds (a
  // cheap check), and a change starts a full look. Not while the window is hidden.
  // `drives` counts the changes, for a page that reads cards its own way (the Card page) and looks again on it.
  const [drives, setDrives] = useState(0);
  useEffect(() => {
    let last: string | null = null;
    let asking = false;
    const tick = async () => {
      if (asking || document.hidden) return;
      asking = true;
      try {
        const now = (await api().sd.mounted()).join('|');
        if (last !== null && now !== last) { setDrives((n) => n + 1); setLookAgain((n) => n + 1); }
        last = now;
      } catch { /* asked again next time */ } finally { asking = false; }
    };
    void tick();
    const t = setInterval(() => void tick(), DRIVE_POLL_MS);
    return () => clearInterval(t);
  }, []);
  /** The owner says the card in the reader, known only by its presets, is this saber's: it is known by its serial from now on. */
  const linkReaderCard = async () => {
    const c = cardCheckRef.current?.source === 'reader' ? cardCheckRef.current.card : null;
    if (!c?.volumeSerial || !saber) return;
    try { await api().library.linkCard(saber.id, { serial: c.volumeSerial, label: c.label }); await board.refreshLibrary(); setLinkNote(null); setLookAgain((n) => n + 1); }
    catch (err) { setLinkNote(`Could not remember the card: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
  };
  return { voice, voiceWhy, cardCheck, cardCheckRef, cardConfig, cardChecking, linkNote, linkReaderCard, drives, again: () => { freshRef.current = true; setLookAgain((n) => n + 1); } };
}
