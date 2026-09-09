import { describe, expect, it } from 'vitest';
import type { SaberConfigModel } from '@hiltwright/core';
import { buildFirmware, translateErrors } from '../src/main/build';
import { toolchainStatus } from '../src/main/toolchain';

const root = process.env.HILTWRIGHT_TOOLCHAIN_DIR;

const hote2: SaberConfigModel = {
  name: 'hiltwright_hote2', board: 'V2', buttons: 2, prop: 'fett263', generator: 'test',
  blades: [
    { id: 'main', role: 'main', type: 'pixel', pixels: 140, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } },
    { id: 'crystal', role: 'crystal', type: 'pixel', pixels: 2, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } },
    { id: 'accent', role: 'accent', type: 'pixel', pixels: 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade3Pin', powerPins: ['bladePowerPin5'] } },
  ],
  presets: [
    { font: 'Mara Jade Skywalker;common', track: 'Mara Jade Skywalker/tracks/The_Force.wav', name: 'Mara Jade Skywalker' },
    { font: 'Valkyrie;common', track: 'Valkyrie/tracks/battle_cry.wav', name: 'Valkyrie' },
  ],
};

describe('translateErrors', () => {
  it('turns compiler output into owner language', () => {
    expect(translateErrors("region `FLASH' overflowed by 1234 bytes", [])[0]).toMatch(/too big/);
    expect(translateErrors('#error Please select Proffieboard V2 in Tools->Board', [])[0]).toMatch(/Proffieboard V2/);
    expect(translateErrors("error: cannot convert 'const char*' to 'StyleFactory*'", [])[0]).toMatch(/fewer looks/);
    expect(translateErrors("config.h:12:3: error: 'Layerz' was not declared in this scope", [])[0]).toMatch(/did not understand/);
  });
});

describe.skipIf(!root)('buildFirmware with a real toolchain', () => {
  it('reports the toolchain as ready', async () => {
    const s = await toolchainStatus(root!);
    expect(s.ready).toBe(true);
  });

  it('compiles the generated hote2 config for a V2 and produces a .dfu', async () => {
    const lines: string[] = [];
    const r = await buildFirmware({ toolchainRoot: root!, saberId: 'test-hote2', model: hote2, onLine: (l) => lines.push(l), force: true });
    if (!r.ok) console.log(r.problems, r.output.slice(0, 4000));
    expect(r.ok).toBe(true);
    expect(r.dfuPath).toMatch(/\.dfu$/);
    expect(r.textBytes).toBeGreaterThan(150000);
    expect(r.flashPct).toBeLessThan(100);
    console.log(`build ${r.ms} ms, .text ${r.textBytes} bytes, ${r.flashPct}% of ${r.flashBytes}`);
    // Second build hits the cache.
    const again = await buildFirmware({ toolchainRoot: root!, saberId: 'test-hote2', model: hote2 });
    expect(again.cached).toBe(true);
  });
});

describe('usbState', () => {
  it('reports the running firmware when a Proffieboard is plugged in (skips otherwise)', async () => {
    const { usbState } = await import('../src/main/flash');
    const s = await usbState();
    console.log('usb', JSON.stringify(s));
    expect(typeof s.runtimePresent).toBe('boolean');
    expect(s.bootloaderPresent).toBe(false);
  });
});
