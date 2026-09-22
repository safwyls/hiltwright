// The saber being worked on, and its build model: one object every step of the flow edits.
//
// When a saber is plugged in it is the one. Otherwise it is whichever remembered or planned saber was chosen in the
// Armory. The model comes from `draftModel`: the saved model's wiring and looks laid over what the saber last
// reported, with staged presets kept until they are installed. Saving writes the model back to the saber's record.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SaberConfigModel } from '@hiltwright/core';
import type { SaberRecord } from '../../shared/api';
import type { Board } from './board';
import { draftModel, infoFromRecord } from './saberModel';

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
}

export function useWorkspace(board: Board): Workspace {
  const [chosenId, setChosenId] = useState<string>(() => { try { return localStorage.getItem('hiltwright.saber') ?? ''; } catch { return ''; } });
  useEffect(() => { try { localStorage.setItem('hiltwright.saber', chosenId); } catch { /* private mode */ } }, [chosenId]);
  const live = board.status === 'connected' && !!board.info && !!board.saber;
  const saber = live ? board.saber : board.library.find((s) => s.id === chosenId) ?? board.library[0] ?? null;
  const info = useMemo(() => (live ? board.info : saber ? infoFromRecord(saber) : null), [live, board.info, saber]);
  const model = useMemo(() => (saber && info ? draftModel(info, saber) : null), [saber, info]);
  const saveModel = useCallback(async (next: SaberConfigModel) => { if (saber) await board.updateSaber({ model: next }, saber.id); }, [board, saber]);
  return { saber, info, live, model, choose: setChosenId, saveModel, plans: board.library.filter((s) => s.planned) };
}

/** A model for a saber that has no saved one yet: what draftModel would give, persisted so every page sees the same. */
export function starterModel(saber: SaberRecord): SaberConfigModel {
  return draftModel(infoFromRecord(saber), saber);
}

/** Where the saber is in the flow, for the Armory's progress card and the next-step buttons. */
export type FlowStep = 'wiring' | 'presets' | 'fonts' | 'build';
export function flowStatus(ws: Workspace): { step: FlowStep; label: string }[] {
  const m = ws.model; const s = ws.saber;
  const wired = !!m?.wiringConfirmedAt || !!s?.firmware;
  const presets = m?.presets.length ?? 0;
  const installed = s?.firmware?.at ? new Date(s.firmware.at).toLocaleDateString() : null;
  return [
    { step: 'wiring', label: !m ? 'not started' : `${m.blades.length} blade${m.blades.length === 1 ? '' : 's'}, ${wired ? 'confirmed' : 'not confirmed yet'}` },
    { step: 'presets', label: presets ? `${presets}${m?.presetsFrom ? ', staged for the next install' : ''}` : 'none yet' },
    { step: 'fonts', label: 'check the card has every font the presets name' },
    { step: 'build', label: installed ? `installed ${installed}` : 'not installed yet' },
  ];
}
export function nextStep(ws: Workspace): FlowStep {
  const m = ws.model; const s = ws.saber;
  if (!m || !(m.wiringConfirmedAt || s?.firmware)) return 'wiring';
  if (!m.presets.length) return 'presets';
  return 'build';
}
