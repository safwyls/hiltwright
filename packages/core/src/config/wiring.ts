// The owner's confirmation that a saber's wiring is right.
//
// A confirmation records the board and blade layout it was given for, as a fingerprint, and counts only while the
// saber still has exactly that layout. Changing the board or any blade therefore withdraws it on every page without
// any page having to clear it; changing back restores it. Buttons, prop and presets are not part of the layout:
// they cannot put power on the wrong pin.

import { contentHash, type BoardModel, type ModelBlade, type SaberConfigModel } from './generate';

/** JSON with object keys in a fixed order and undefined fields left out, so equal layouts always print the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * A fingerprint of the board and every blade exactly as stored, so a blade's brightness limit (`dim`, issue #16)
 * counts too. Fields left out are left out of the fingerprint, so a blade without a limit keeps the fingerprint it had
 * before limits were kept, and its confirmation with it.
 */
export function wiringFingerprint(board: BoardModel, blades: ModelBlade[]): string {
  return contentHash(canonical({ board, blades }));
}

/** True when the owner confirmed this saber's current board and blades. The one rule every page uses. */
export function wiringConfirmed(m: Pick<SaberConfigModel, 'board' | 'blades' | 'wiringConfirmation'> | null | undefined): boolean {
  return !!m?.wiringConfirmation && m.wiringConfirmation.layout === wiringFingerprint(m.board, m.blades);
}

/**
 * The model with the confirmation given for its current layout, or removed. Also drops the old timestamp-only
 * field, which never said what it confirmed and no longer counts.
 */
export function withWiringConfirmation(m: SaberConfigModel, confirmed: boolean, at: string = new Date().toISOString()): SaberConfigModel {
  const { wiringConfirmation: _old, wiringConfirmedAt: _legacy, ...rest } = m;
  return confirmed ? { ...rest, wiringConfirmation: { at, layout: wiringFingerprint(m.board, m.blades) } } : rest;
}
