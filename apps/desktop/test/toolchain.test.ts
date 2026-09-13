import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SaberConfigModel } from '@hiltwright/core';
import { installToolchain, toolchainStatus } from '../src/main/toolchain';
import { buildFirmware } from '../src/main/build';

// A real first-run install: about 360 MB of downloads and 1.6 GB on disk into a fresh directory, then a compile
// from it. Only runs when HILTWRIGHT_INSTALL_TEST is set; HILTWRIGHT_INSTALL_DIR chooses the directory (kept),
// otherwise a temp directory that is removed afterwards.
const enabled = !!process.env.HILTWRIGHT_INSTALL_TEST;

const model: SaberConfigModel = {
  name: 'hiltwright_fresh', board: 'V2', buttons: 2, prop: 'sa22c',
  blades: [{ id: 'main', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } }],
  presets: [{ font: 'TeensySF;common', track: '', name: 'Fresh' }],
};

describe.skipIf(!enabled)('first-run toolchain install', () => {
  it('installs everything from nothing and compiles', async () => {
    const keep = process.env.HILTWRIGHT_INSTALL_DIR;
    const root = keep ?? (await mkdtemp(join(tmpdir(), 'hiltwright-toolchain-')));
    const lines: string[] = [];
    const t0 = Date.now();
    try {
      const before = await toolchainStatus(root);
      if (!keep) expect(before.ready).toBe(false); // a kept directory may already hold a finished install
      console.log(`[install] starting from ${before.ready ? 'a finished install' : 'nothing'}; free ${before.freeBytes != null ? (before.freeBytes / 1073741824).toFixed(1) : '?'} GB`);
      const after = await installToolchain(root, (l) => { lines.push(l); console.log(`[install +${((Date.now() - t0) / 1000).toFixed(0)}s] ${l.slice(0, 160)}`); });
      expect(after.ready).toBe(true);
      expect(after.cliVersion).toMatch(/^1\.3\.1/);
      expect(after.dfuUtil).toBeTruthy();
      // Idempotent: a second call does nothing and stays ready.
      const again = await installToolchain(root, () => undefined);
      expect(again.ready).toBe(true);
      const r = await buildFirmware({ toolchainRoot: root, saberId: 'fresh', model, onLine: (l) => console.log(`[build] ${l.slice(0, 160)}`), force: true });
      expect(r.ok).toBe(true);
      expect(r.textBytes).toBeGreaterThan(100000);
      console.log(`install ${((Date.now() - t0) / 1000).toFixed(0)} s total; build ${r.ms} ms, ${r.flashPct}% of flash`);
    } finally {
      if (!keep) await rm(root, { recursive: true, force: true });
    }
  }, 40 * 60 * 1000);
});
