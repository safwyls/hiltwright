// Preset editing against a live board, built on what the OS 7.8 transcripts showed:
// writes answer with nothing, the save is deferred, and the read-back can be delayed by the SD write.
// Every write here is followed by a read-back and is only reported as done when the read-back matches.

import type { BoardClient, Response } from './client';
import { isPresetBlockEnd, parsePresetBlocks, presetCommands, type PresetRecord } from './presets';
import { parseInteger } from './responses';

export interface PresetPatch {
  font?: string;
  track?: string;
  name?: string;
  /** 1-based blade number → style string, e.g. "builtin 2 1 65535,0,0". */
  styles?: Record<number, string>;
}

export interface EditResult {
  ok: boolean;
  /** The preset as the board reported it after the write. */
  preset: PresetRecord | null;
  /** How many read-backs it took. */
  readbacks: number;
  ms: number;
  error?: string;
}

const READBACK_TIMEOUT = 6000;

/** Last complete preset block in a response. A delayed earlier block may precede it. */
function lastBlock(r: Response): PresetRecord | null {
  const { presets } = parsePresetBlocks(r.lines);
  return presets.length ? presets[presets.length - 1] : null;
}

export async function listPresets(client: BoardClient): Promise<PresetRecord[]> {
  const r = await client.send(presetCommands.list(), { idleMs: 700, timeoutMs: 20000 });
  return parsePresetBlocks(r.lines).presets;
}

export async function currentPresetIndex(client: BoardClient): Promise<number | null> {
  const r = await client.send(presetCommands.getCurrent(), { until: (l) => /^-?\d+$/.test(l.trim()) });
  return parseInteger(r.lines);
}

/** show_current_preset, tolerating the SD-write delay. Retries once when nothing complete came back. */
export async function readCurrentPreset(client: BoardClient, attempts = 2): Promise<{ preset: PresetRecord | null; readbacks: number }> {
  let readbacks = 0;
  for (let i = 0; i < attempts; i++) {
    readbacks++;
    const r = await client.send(presetCommands.showCurrent(), { until: isPresetBlockEnd, timeoutMs: READBACK_TIMEOUT, idleMs: 1500 });
    const p = lastBlock(r);
    if (p) return { preset: p, readbacks };
  }
  return { preset: null, readbacks };
}

/** Make preset `index` current on the board and return what the board says it is. */
export async function selectPreset(client: BoardClient, index: number): Promise<{ preset: PresetRecord | null; index: number | null }> {
  await client.send(presetCommands.select(index), { idleMs: 900, timeoutMs: 8000 });
  const cur = await currentPresetIndex(client);
  const { preset } = await readCurrentPreset(client);
  return { preset, index: cur };
}

function matches(p: PresetRecord, patch: PresetPatch): boolean {
  if (patch.font !== undefined && p.font !== patch.font) return false;
  if (patch.track !== undefined && p.track !== patch.track) return false;
  if (patch.name !== undefined && p.name !== patch.name) return false;
  if (patch.styles) for (const [k, v] of Object.entries(patch.styles)) if (p.styles[Number(k) - 1] !== v) return false;
  return true;
}

/** Apply a patch to the board's *current* preset. Silence is not success: the result is what the read-back says. */
export async function editCurrentPreset(client: BoardClient, patch: PresetPatch, now: () => number = () => Date.now()): Promise<EditResult> {
  const started = now();
  const cmds: string[] = [];
  if (patch.font !== undefined) cmds.push(presetCommands.setFont(patch.font));
  if (patch.track !== undefined) cmds.push(presetCommands.setTrack(patch.track));
  if (patch.name !== undefined) cmds.push(presetCommands.setName(patch.name));
  if (patch.styles) for (const [k, v] of Object.entries(patch.styles)) cmds.push(presetCommands.setStyle(Number(k), v));
  if (!cmds.length) return { ok: true, preset: null, readbacks: 0, ms: 0 };
  for (const c of cmds) await client.send(c, { idleMs: 400, timeoutMs: 8000 });
  let readbacks = 0;
  // Up to three read-backs: the first often returns only the "Creating file" notice while the SD write runs.
  for (let i = 0; i < 3; i++) {
    const r = await readCurrentPreset(client, 1);
    readbacks += r.readbacks;
    if (r.preset && matches(r.preset, patch)) return { ok: true, preset: r.preset, readbacks, ms: now() - started };
    if (r.preset && i === 2) return { ok: false, preset: r.preset, readbacks, ms: now() - started, error: 'The saber reports different values than were written.' };
  }
  return { ok: false, preset: null, readbacks, ms: now() - started, error: 'The saber did not confirm the change.' };
}

/** Fields of `to` that differ from `from`, as a patch. Used to restore a snapshot with the fewest commands. */
export function diffPreset(from: PresetRecord, to: PresetRecord): PresetPatch {
  const patch: PresetPatch = {};
  if (from.font !== to.font) patch.font = to.font;
  if (from.track !== to.track) patch.track = to.track;
  if (from.name !== to.name) patch.name = to.name;
  const styles: Record<number, string> = {};
  to.styles.forEach((s, i) => { if (from.styles[i] !== s) styles[i + 1] = s; });
  if (Object.keys(styles).length) patch.styles = styles;
  return patch;
}

export function isEmptyPatch(p: PresetPatch): boolean {
  return p.font === undefined && p.track === undefined && p.name === undefined && !p.styles;
}

// ---------- Structural edits: reorder, duplicate, delete ----------
// These change presets.ini on the board and renumber presets, so each one re-reads the list and the current index.

export interface ListResult { presets: PresetRecord[]; current: number | null }

async function resync(client: BoardClient): Promise<ListResult> {
  const presets = await listPresets(client);
  const current = await currentPresetIndex(client);
  return { presets, current };
}

/** Move the current preset to position `pos` (0-based). */
export async function moveCurrentPreset(client: BoardClient, pos: number): Promise<ListResult> {
  await client.send(presetCommands.move(pos), { idleMs: 900, timeoutMs: 8000 });
  return resync(client);
}

/** Copy the current preset to position `pos` (0-based); the copy becomes current. */
export async function duplicateCurrentPreset(client: BoardClient, pos: number): Promise<ListResult> {
  await client.send(presetCommands.duplicate(pos), { idleMs: 900, timeoutMs: 8000 });
  return resync(client);
}

export async function deleteCurrentPreset(client: BoardClient): Promise<ListResult> {
  await client.send(presetCommands.delete(), { idleMs: 900, timeoutMs: 8000 });
  return resync(client);
}
