// board-connection 3.3 and 3.14 (baseline audit), on the rules useBoard uses.

import { describe, expect, it } from 'vitest';
import { NOT_MADE_AFTER_PAUSE, DISCONNECTED_DURING, NO_SD_CARD, connectGate, createRecovery, deleteShown, duplicateShown, moveShown, parseSdAccess, readBattery, runOperation, storedLayout, sdFailureIn, serialQueue, withNewSnapshot, type OpDeps, type SaveState } from '../src/renderer/src/boardOps';
import type { PresetRecord } from '@hiltwright/core';

const later = () => { let done!: () => void; const p = new Promise<void>((r) => { done = r; }); return { p, done }; };

describe('one connection attempt at a time', () => {
  it('3.3 a plug-in event during a reconnect opens nothing more: the second attempt is skipped', async () => {
    const gate = connectGate(() => false);
    const opening = later();
    let opened = 0;
    const first = gate(async () => { opened++; await opening.p; });
    const second = gate(async () => { opened++; });
    expect(await second).toBe(false);
    opening.done();
    expect(await first).toBe(true);
    expect(opened).toBe(1);
  });

  it('3.3 an attempt while a port is already open is skipped', async () => {
    let open = true;
    const gate = connectGate(() => open);
    expect(await gate(async () => {})).toBe(false);
    open = false;
    expect(await gate(async () => {})).toBe(true);
  });

  it('3.3 the gate opens again after an attempt fails', async () => {
    const gate = connectGate(() => false);
    await expect(gate(async () => { throw new Error('port busy'); })).rejects.toThrow('port busy');
    expect(await gate(async () => {})).toBe(true);
  });
});

describe('board operations queued in order', () => {
  it('3.14 two quick edits both run, in the order they were made, the second after the first finishes', async () => {
    const enqueue = serialQueue();
    const log: string[] = [];
    const slow = later();
    const a = enqueue(async () => { log.push('edit 1 start'); await slow.p; log.push('edit 1 done'); return 1; });
    const b = enqueue(async () => { log.push('edit 2 start'); return 2; });
    await Promise.resolve();
    expect(log).toEqual(['edit 1 start']);
    slow.done();
    expect(await Promise.all([a, b])).toEqual([1, 2]);
    expect(log).toEqual(['edit 1 start', 'edit 1 done', 'edit 2 start']);
  });

  it('3.14 a failed operation does not stop the ones after it', async () => {
    const enqueue = serialQueue();
    const failed = enqueue(async () => { throw new Error('no answer'); });
    const next = enqueue(async () => 'written');
    await expect(failed).rejects.toThrow('no answer');
    expect(await next).toBe('written');
  });
});

// connection-robustness BST-4: an operation whose turn comes after an unplug says so.
describe('running a board operation', () => {
  function deps(client: { name: string } | null) {
    const saves: SaveState[] = [];
    const busy: boolean[] = [];
    const d: OpDeps<{ name: string }> = { client: () => client, setBusy: (b) => busy.push(b), setSave: (s) => saves.push(s), log: () => undefined, snapshot: async () => undefined };
    return { d, saves, busy };
  }

  it('an edit whose turn comes after the saber was unplugged is reported as not sent', async () => {
    const { d, saves, busy } = deps(null);
    let ran = false;
    expect(await runOperation(d, 'Set font', async () => { ran = true; return { ok: true }; }, true)).toBe(false);
    expect(ran).toBe(false);
    expect(saves).toEqual([{ kind: 'failed', what: 'Set font', error: 'Not sent: the saber is not connected.' }]);
    expect(busy).toEqual([]);
  });

  it('with a saber, runs the operation on its client and reports it saved', async () => {
    const { d, saves, busy } = deps({ name: 'hote2' });
    let on = '';
    expect(await runOperation(d, 'Set font', async (c) => { on = c.name; return { ok: true, ms: 12, note: 'checked' }; }, false)).toBe(true);
    expect(on).toBe('hote2');
    expect(saves[0]).toEqual({ kind: 'writing', what: 'Set font' });
    expect(saves[1]).toMatchObject({ kind: 'saved', what: 'Set font · checked', ms: 12 });
    expect(busy).toEqual([true, false]);
  });

  it('a change under way when the saber is unplugged says so, not what its last command made of the silence', async () => {
    let connected: { name: string } | null = { name: 'hote2' };
    const saves: SaveState[] = [];
    const d: OpDeps<{ name: string }> = { client: () => connected, setBusy: () => undefined, setSave: (s) => saves.push(s), log: () => undefined, snapshot: async () => undefined };
    await runOperation(d, 'Font → Ben_Solo', async () => { connected = null; return { ok: false, error: 'The saber stopped answering. Unplug and replug it, then press Connect.' }; }, false);
    expect(saves.at(-1)).toEqual({ kind: 'failed', what: 'Font → Ben_Solo', error: 'Not saved: the saber was disconnected during the change.' });
  });

  it('preset-editor-fixes D6: a saber that reset for want of a card is reported as having no card, not as unplugged', async () => {
    let connected: { name: string } | null = { name: 'hote2' };
    const saves: SaveState[] = [];
    const d: OpDeps<{ name: string }> = { client: () => connected, setBusy: () => undefined, setSave: (s) => saves.push(s), log: () => undefined, snapshot: async () => undefined };
    expect(await runOperation(d, 'Font → Ben_Solo', async () => { connected = null; return { ok: false, error: NO_SD_CARD }; }, false)).toBe(false);
    expect(saves.at(-1)).toEqual({ kind: 'failed', what: 'Font → Ben_Solo', error: NO_SD_CARD });
  });

  it('an operation that throws is reported as failed and clears busy', async () => {
    const { d, saves, busy } = deps({ name: 'hote2' });
    expect(await runOperation(d, 'Rename', async () => { throw new Error('Port closed'); }, false)).toBe(false);
    expect(saves.at(-1)).toEqual({ kind: 'failed', what: 'Rename', error: 'Error: Port closed' });
    expect(busy).toEqual([true, false]);
  });
});

// preset-editor-fixes D6: what the saber says when it cannot read its card (hote2 with its card in the reader).
describe('no readable SD card', () => {
  it('is found in any line the saber sends, and only there', () => {
    expect(sdFailureIn(['Failed to mount SD card.'])).toBe(true);
    expect(sdFailureIn(['0', 'failed to mount sd card.'])).toBe(true);
    expect(sdFailureIn(['Creating file presets.tmp iteration = 2', 'Whut? :set_foo'])).toBe(false);
    expect(sdFailureIn([])).toBe(false);
  });
});

describe('the battery is read without the saber speaking (usb-power-connect D1)', () => {
  const firmware = (answers: Record<string, string[]>) => {
    const sent: string[] = [];
    return { sent, send: async (c: string) => { sent.push(c); return { lines: answers[c] ?? [`Whut? :${c}`] }; } };
  };
  it('firmware that knows battery_voltage: one quiet command, the number read', async () => {
    const f = firmware({ battery_voltage: ['0.03'] });
    expect(await readBattery(f.send)).toEqual({ volts: 0.03, rejected: [] });
    expect(f.sent).toEqual(['battery_voltage']);
  });
  it('firmware without it: battery next, the voltage read, nothing listed as rejected', async () => {
    const f = firmware({ battery: ['Battery voltage: 3.92'] });
    expect(await readBattery(f.send)).toEqual({ volts: 3.92, rejected: [] });
    expect(f.sent).toEqual(['battery_voltage', 'battery']);
  });
  it('firmware with neither: battery is the one listed as missing', async () => {
    const f = firmware({});
    expect(await readBattery(f.send)).toEqual({ volts: null, rejected: ['battery'] });
  });
});

describe('the blade layout is read once per firmware build (usb-power-connect D2)', () => {
  const id = (usbSerial: string | null, installed: string, pixelBlades = [132, 1, 2]) => ({ identity: {
    usbSerial, configName: 'config/hiltwright_hote2.h', version: 'v8.10', prop: null, buttons: 2, installed, pixelBlades, bladeConfig: 0,
  } });
  const build = { config: 'config/hiltwright_hote2.h', installed: 'Sep 28 2026 14:55:20' };
  it("the serial's record on the same build gives its stored layout", () => {
    expect(storedLayout([id('209133815232', build.installed)], '209133815232', build)).toEqual({ pixelBlades: [132, 1, 2], bladeConfig: 0 });
  });
  it('a new install stamp gives null, so the saber is asked', () => {
    expect(storedLayout([id('209133815232', 'Sep 13 2026 10:25:36')], '209133815232', build)).toBeNull();
  });
  it('a serial with no record gives null, even when another board has the same build', () => {
    expect(storedLayout([id('207A349A5430', build.installed)], '209133815232', build)).toBeNull();
  });
  it('no serial and one matching record gives its layout', () => {
    expect(storedLayout([id('209133815232', build.installed), id('207A349A5430', 'Oct 1 2026 09:00:00')], null, build)).toEqual({ pixelBlades: [132, 1, 2], bladeConfig: 0 });
  });
  it('no serial and two matching records gives null', () => {
    expect(storedLayout([id('209133815232', build.installed), id('207A349A5430', build.installed)], null, build)).toBeNull();
  });
  it('a stored empty layout, or a version without a stamp, gives null', () => {
    expect(storedLayout([id('209133815232', build.installed, [])], '209133815232', build)).toBeNull();
    expect(storedLayout([id('209133815232', build.installed)], '209133815232', { config: build.config, installed: null })).toBeNull();
  });
});

describe('a stall gets one reopen (usb-power-connect D3)', () => {
  const make = (o: { reopen?: () => Promise<void>; reread?: () => Promise<boolean> } = {}) => {
    const lines: string[] = [];
    const calls = { reopen: 0, reread: 0 };
    const r = createRecovery({
      reopen: async () => { calls.reopen++; await (o.reopen ?? (async () => {}))(); },
      reread: async () => { calls.reread++; return (o.reread ?? (async () => true))(); },
      log: (l) => lines.push(l),
    });
    return { r, lines, calls };
  };
  it('reopen and reread succeed: recovered, and the log says so', async () => {
    const { r, lines } = make();
    expect(await r.start('set_preset 9')).toBe('recovered');
    expect(lines[0]).toBe('paused: set_preset 9, reconnecting');
    expect(lines[1]).toMatch(/^reconnected after \d+ ms$/);
  });
  it('the port does not open again: lost', async () => {
    const { r, calls } = make({ reopen: async () => { throw new Error('NetworkError'); } });
    expect(await r.start('set_preset 9')).toBe('lost');
    expect(calls.reread).toBe(0);
  });
  it('silent again while read: lost', async () => {
    const { r, lines } = make({ reread: async () => false });
    expect(await r.start('set_preset 9')).toBe('lost');
    expect(lines.at(-1)).toMatch(/still silent/);
  });
  it('two starts while one is under way: one reopen, the same outcome', async () => {
    const opening = later();
    const { r, calls } = make({ reopen: () => opening.p });
    const a = r.start('set_preset 9');
    const b = r.start('k1| hw_end');
    opening.done();
    expect(await a).toBe('recovered');
    expect(await b).toBe('recovered');
    expect(calls.reopen).toBe(1);
    expect(r.count).toBe(1);
  });
  it('since(n) is null when no stall happened after n, and the outcome when one did', async () => {
    const { r } = make();
    const n = r.count;
    expect(await r.since(n)).toBeNull();
    void r.start('set_preset 9');
    expect(await r.since(n)).toBe('recovered');
  });
});

describe('a change that met a stall is judged by what the saber then shows (usb-power-connect D5)', () => {
  type C = { name: string };
  const session = (outcome: 'recovered' | 'lost' = 'recovered') => {
    let client: C | null = { name: 'before' };
    const saves: SaveState[] = [];
    const opening = later();
    const recovery = createRecovery({ reopen: async () => { await opening.p; if (outcome === 'lost') throw new Error('did not open'); client = { name: 'after' }; }, reread: async () => true, log: () => undefined });
    const d: OpDeps<C> = { client: () => client, setBusy: () => undefined, setSave: (s) => saves.push(s), log: () => undefined, snapshot: async () => undefined, recovery };
    // What onSilent does mid-operation: start the recovery and end the command; the operation then fails on its own.
    const stall = async () => { void recovery.start('set_preset 9'); opening.done(); return { ok: false, error: 'No read-back after selecting.' }; };
    return { d, saves, stall, now: () => client };
  };
  it('a stalled selection whose preset is now current is saved, after a pause', async () => {
    const { d, saves, stall } = session();
    let current = 0;
    expect(await runOperation(d, 'Select preset 10', async () => { const r = await stall(); current = 9; return r; }, false, () => current === 9)).toBe(true);
    expect(saves.at(-1)).toMatchObject({ kind: 'saved', what: 'Select preset 10 · after a pause' });
  });
  it('a stalled edit the saber does not show is not made, and the operation ran once', async () => {
    const { d, saves, stall } = session();
    let runs = 0;
    expect(await runOperation(d, 'Font → Ahch-To', async () => { runs++; return stall(); }, false, () => false)).toBe(false);
    expect(runs).toBe(1);
    expect(saves.at(-1)).toMatchObject({ kind: 'failed', error: NOT_MADE_AFTER_PAUSE });
  });
  it('a stall whose reconnect fails reports the disconnect', async () => {
    const { d, saves, stall } = session('lost');
    expect(await runOperation(d, 'Select preset 10', stall, false, () => true)).toBe(false);
    expect(saves.at(-1)).toMatchObject({ kind: 'failed', error: DISCONNECTED_DURING });
  });
  it('an operation queued behind the stall runs after the reconnect, on the new client', async () => {
    const { d, stall } = session();
    const enqueue = serialQueue();
    const order: string[] = [];
    const first = enqueue(() => runOperation(d, 'Select preset 10', async () => { const r = await stall(); order.push('first done'); return r; }, false, () => true));
    const second = enqueue(() => runOperation(d, 'Select preset 4', async (c) => { order.push(`second on ${c.name}`); return { ok: true }; }, false));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(order).toEqual(['first done', 'second on after']);
  });
  it('without a stall nothing changes: a failure is reported as before', async () => {
    const { d, saves } = session();
    expect(await runOperation(d, 'Rename', async () => ({ ok: false, error: 'The saber reports different values than were written.' }), false, () => true)).toBe(false);
    expect(saves.at(-1)).toMatchObject({ kind: 'failed', error: 'The saber reports different values than were written.' });
  });
});

describe('the list checks used after a stall', () => {
  const p = (name: string, font = `${name};common`): PresetRecord => ({ name, font, track: '', styles: [], variation: 0 } as unknown as PresetRecord);
  const list = [p('A'), p('B'), p('C')];
  it('duplicate: one more, and the copy after its source', () => {
    expect(duplicateShown(list, [p('A'), p('B'), p('B'), p('C')], 2)).toBe(true);
    expect(duplicateShown(list, list, 2)).toBe(false);
    expect(duplicateShown(list, [p('A'), p('B'), p('C'), p('C')], 2)).toBe(false);
  });
  it('delete: one fewer', () => {
    expect(deleteShown(list, [p('A'), p('C')])).toBe(true);
    expect(deleteShown(list, list)).toBe(false);
  });
  it('move: the preset now at its new place', () => {
    expect(moveShown(list, [p('B'), p('A'), p('C')], 1, 0)).toBe(true);
    expect(moveShown(list, list, 1, 0)).toBe(false);
  });
});

describe('the shared card (card-safety D1, D2)', () => {
  it("reads the saber's answer to sd", () => {
    expect(parseSdAccess(['SD Access ON'])).toBe(true);
    expect(parseSdAccess(['Unmounting SD Card.', 'SD Access OFF'])).toBe(false);
    expect(parseSdAccess(['Whut? :sd'])).toBeNull();
    expect(parseSdAccess([])).toBeNull();
  });
  it('a refused operation is not run, sends nothing, and fails with the reason', async () => {
    const saves: SaveState[] = [];
    const sent: string[] = [];
    const reason = "Not sent: hotetest's card is shared with this computer. Give it back on Live › Card first.";
    const d: OpDeps<{ name: string }> = { client: () => ({ name: 'c' }), setBusy: () => undefined, setSave: (s) => saves.push(s), log: (_k, t) => sent.push(t), snapshot: async () => { sent.push('snapshot'); }, refuse: () => reason };
    let ran = false;
    expect(await runOperation(d, 'Select preset 2', async () => { ran = true; return { ok: true }; }, true)).toBe(false);
    expect(ran).toBe(false);
    expect(sent.includes('snapshot')).toBe(false);
    expect(saves).toEqual([{ kind: 'failed', what: 'Select preset 2', error: reason }]);
  });
  it('with nothing to refuse, the operation runs as before', async () => {
    const d: OpDeps<{ name: string }> = { client: () => ({ name: 'c' }), setBusy: () => undefined, setSave: () => undefined, log: () => undefined, snapshot: async () => undefined, refuse: () => null };
    expect(await runOperation(d, 'Select preset 2', async () => ({ ok: true }), false)).toBe(true);
  });
});

describe('History takes a snapshot just saved without reading the list again (issue #23)', () => {
  const meta = (file: string) => ({ file, at: '', label: 'Connected', presets: 1 });
  it('a new snapshot goes on top', () => {
    expect(withNewSnapshot([meta('b'), meta('a')], meta('c')).map((m) => m.file)).toEqual(['c', 'b', 'a']);
  });
  it('the newest one handed back again (nothing changed since) is not shown twice', () => {
    expect(withNewSnapshot([meta('b'), meta('a')], meta('b')).map((m) => m.file)).toEqual(['b', 'a']);
  });
});
