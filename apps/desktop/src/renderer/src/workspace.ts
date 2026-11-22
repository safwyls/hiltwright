// The saber being worked on, and its build model: one object every step of the flow edits.
//
// Two of them (docs/install-live-plan.md):
//   'pick'   Install's: the saber picked in the Armory. A saber plugged in is picked on its own; the owner can then
//            pick another, to change its setup while the plugged-in one stays connected. `live` is true only while
//            the picked saber is the one plugged in, so nothing is ever sent to, or installed on, another saber.
//   'board'  Live's: always the saber plugged in, whatever is picked; the picked one while nothing is plugged in.
// During the guided tour both are its example saber. The model comes from `draftModel`: the saved model's wiring and
// looks laid over what the saber last reported, with staged presets kept until they are installed. Saving writes the
// model back to the saber's record.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { wiringConfirmed, type SaberConfigModel } from '@hiltwright/core';
import type { SaberRecord } from '../../shared/api';
import type { Board } from './board';
import { draftModel, infoFromRecord } from './saberModel';
import { setWorkingSaber } from './support';
import { chosenFonts } from './saberFonts';
import { EXAMPLE_ID } from './tourSaber';

export interface Workspace {
  /** The saber every step is about, or null when none is remembered yet. */
  saber: SaberRecord | null;
  /** What the saber reports (live), or what it reported last time. */
  info: Board['info'];
  /** The saber is plugged in and answering. */
  live: boolean;
  model: SaberConfigModel | null;
  /** Choose another remembered or planned saber to work on while nothing is plugged in. */
  choose: (id: string) => void;
  saveModel: (next: SaberConfigModel) => Promise<void>;
  /** Sabers set up ahead of their hilt. */
  plans: SaberRecord[];
  /** The saber list is still being read: no saber yet means "not read yet", so pages show a loader, not "no saber". */
  loading: boolean;
}

export function useWorkspace(board: Board, follow: 'pick' | 'board' = 'pick'): Workspace {
  const [chosenId, setChosenId] = useState<string>(() => { try { return localStorage.getItem('hiltwright.saber') ?? ''; } catch { return ''; } });
  useEffect(() => { if (follow === 'pick') try { localStorage.setItem('hiltwright.saber', chosenId); } catch { /* private mode */ } }, [chosenId, follow]);
  const plugged = board.status === 'connected' && !!board.info && !!board.saber;
  const touring = board.saber?.id === EXAMPLE_ID;
  // A saber plugged in is picked on its own (the tour's example never is: the owner's pick is theirs).
  useEffect(() => { if (follow === 'pick' && plugged && board.saber && !touring) setChosenId(board.saber.id); }, [follow, plugged, board.saber?.id, touring]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = board.library.find((s) => s.id === chosenId) ?? null;
  const first = follow === 'board' || touring ? (plugged ? board.saber : picked) : picked ?? (plugged ? board.saber : null);
  const found = first ?? board.library[0] ?? null;
  // The plugged-in saber as the board has it now, not as last listed.
  const saber = plugged && found?.id === board.saber?.id ? board.saber : found;
  const live = plugged && !!saber && saber.id === board.saber?.id;
  const info = useMemo(() => (live ? board.info : saber ? infoFromRecord(saber) : null), [live, board.info, saber]);
  const model = useMemo(() => (saber && info ? draftModel(info, saber) : null), [saber, info]);
  useEffect(() => { if (follow === 'pick') setWorkingSaber(saber?.id ?? null); }, [saber?.id, follow]);
  const saveModel = useCallback(async (next: SaberConfigModel) => { if (saber) await board.updateSaber({ model: next }, saber.id); }, [board, saber]);
  return { saber, info, live, model, choose: setChosenId, saveModel, plans: board.library.filter((s) => s.planned), loading: !live && !board.libraryLoaded };
}

/** A model for a saber that has no saved one yet: what draftModel would give, persisted so every page sees the same. */
export function starterModel(saber: SaberRecord): SaberConfigModel {
  return draftModel(infoFromRecord(saber), saber);
}

/** Where the saber is in the flow, for the Armory's progress card and the next-step buttons. */
export type FlowStep = 'wiring' | 'fonts' | 'presets' | 'card' | 'build';
/**
 * The chosen fonts the card lacked when the saber last listed its fonts; null when it never has. Only a guess at the
 * card as it is now: Install › Card reads the card itself.
 */
export function fontsMissingAsLastRead(ws: Workspace): string[] | null {
  const had = ws.info?.fonts.length ? ws.info.fonts : null;
  if (!had) return null;
  return chosenFonts(ws.model).filter((f) => !had.some((x) => x.toLowerCase() === f.toLowerCase()));
}
export function flowStatus(ws: Workspace): { step: FlowStep; label: string }[] {
  const m = ws.model; const s = ws.saber;
  const wired = wiringConfirmed(m);
  const presets = m?.presets.length ?? 0;
  const fonts = chosenFonts(m).length;
  const missing = fontsMissingAsLastRead(ws);
  const installed = s?.firmware?.at ? new Date(s.firmware.at).toLocaleDateString() : null;
  return [
    { step: 'wiring', label: !m ? 'not started' : `${m.blades.length} blade${m.blades.length === 1 ? '' : 's'}, ${wired ? 'confirmed' : 'not confirmed yet'}` },
    { step: 'fonts', label: fonts ? `${fonts} chosen` : 'none chosen yet' },
    { step: 'presets', label: presets ? `${presets}${m?.presetsFrom ? ', staged for the next flash' : ''}` : 'none yet' },
    { step: 'card', label: !missing ? 'not read yet' : missing.length ? `${missing.length} font${missing.length === 1 ? '' : 's'} to copy, as last read` : 'has every font, as last read' },
    { step: 'build', label: installed ? `flashed ${installed}` : 'not flashed yet' },
  ];
}
export function nextStep(ws: Workspace): FlowStep {
  const m = ws.model;
  if (!m || !wiringConfirmed(m)) return 'wiring';
  if (!chosenFonts(m).length) return 'fonts';
  if (!m.presets.length) return 'presets';
  const missing = fontsMissingAsLastRead(ws);
  if (!missing || missing.length) return 'card';
  return 'build';
}
