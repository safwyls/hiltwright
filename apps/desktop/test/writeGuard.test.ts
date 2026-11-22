// Main's own gate before firmware is written (install-safety-nets design D5, FW10; the board in bootloader mode, issue #29).
import { describe, expect, it } from 'vitest';
import { wiringFingerprint, withWiringConfirmation, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import { NOT_LAST_BUILD, WIRING_NOT_CONFIRMED, writeAllowed, type BoardNow, type KeptBuild } from '../src/main/writeGuard';
import { unknownBoard, wrongBoard } from '../src/shared/boards';

const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const model: SaberConfigModel = { name: 'hiltwright_hote2', board: 'V2', boardFrom: 'owner', buttons: 2, prop: 'fett263', blades: [main], presets: [{ font: 'common', track: '', name: 'One' }] };
const dfu = String.raw`C:\Users\owner\AppData\Local\Hiltwright\b\s1\cache\abc\ProffieOS.ino.dfu`;
const built: KeptBuild = { dfuPath: dfu, board: 'V2', layout: wiringFingerprint(model.board, model.blades) };
const confirmed = withWiringConfirmation(model, true);
const v2: BoardNow = { board: 'V2', flashBytes: 262144 };

describe('writing only this saber\'s last build, from confirmed wiring', () => {
  it('the last build, with the wiring confirmed for its blades: allowed, however the path is spelled', () => {
    expect(writeAllowed(built, confirmed, dfu, v2)).toEqual({ ok: true });
    expect(writeAllowed(built, confirmed, dfu.split(String.fromCharCode(92)).join('/').toUpperCase(), v2)).toEqual({ ok: true });
  });

  it('an older build, another saber\'s build, or no build this run: refused', () => {
    expect(writeAllowed(built, confirmed, dfu.replace('abc', 'old'), v2)).toEqual({ ok: false, text: NOT_LAST_BUILD });
    expect(writeAllowed(undefined, confirmed, dfu, v2)).toEqual({ ok: false, text: NOT_LAST_BUILD });
  });

  it('wiring not confirmed, no saved model, or a confirmation for other blades: refused', () => {
    expect(writeAllowed(built, model, dfu, v2)).toEqual({ ok: false, text: WIRING_NOT_CONFIRMED });
    expect(writeAllowed(built, undefined, dfu, v2)).toEqual({ ok: false, text: WIRING_NOT_CONFIRMED });
    const otherBlades = withWiringConfirmation({ ...model, blades: [{ ...main, pixels: 100 }] }, true);
    expect(writeAllowed(built, otherBlades, dfu, v2)).toEqual({ ok: false, text: WIRING_NOT_CONFIRMED });
    const otherBoard = withWiringConfirmation({ ...model, board: 'V3' }, true);
    expect(writeAllowed(built, otherBoard, dfu, v2)).toEqual({ ok: false, text: WIRING_NOT_CONFIRMED });
  });

  // Issue #29: main compares the build's board with the one its bootloader reports now, whatever the page checked.
  it('a board of another type in bootloader mode, or one Hiltwright does not know: refused', () => {
    expect(writeAllowed(built, confirmed, dfu, { board: 'V3', flashBytes: 524288 })).toEqual({ ok: false, text: wrongBoard('V3', 'V2') });
    expect(writeAllowed(built, confirmed, dfu, { board: null, flashBytes: 131072 })).toEqual({ ok: false, text: unknownBoard(131072) });
    expect(writeAllowed(built, confirmed, dfu, { board: null, flashBytes: null })).toEqual({ ok: false, text: unknownBoard(null) });
  });

  it('the words say nothing was written, and what to do', () => {
    expect(NOT_LAST_BUILD).toBe('This is not the build just made for this saber, so nothing was written. Build again, then install.');
    expect(WIRING_NOT_CONFIRMED).toBe('The wiring this build was made from has not been confirmed, so nothing was written. Confirm it on the Wiring page, then install.');
  });
});
