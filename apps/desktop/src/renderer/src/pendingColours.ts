// Colours chosen with a look before it was installed. They cannot be written earlier: until the firmware carrying
// the look is on the saber, the preset slot still belongs to the old look. Once the saber is connected with that
// firmware, each waiting slot is pointed at its look with its colours, confirmed by read-back, and forgotten.

import { useEffect, useRef } from 'react';
import { formatBuiltin, lookAtSlot } from '@hiltwright/core';
import type { Board } from './board';

export function usePendingLookColours(board: Board): void {
  const attempted = useRef<string | null>(null);
  const { status, saber, info, busy } = board;
  useEffect(() => {
    if (status !== 'connected' || busy || !info || !saber?.model || !saber.firmware) return;
    const firmware = saber.firmware;
    const model = saber.model;
    const waiting = model.presets.flatMap((p, i) => (p.lookArgs ?? []).flatMap((args, k) => {
      const id = p.looks?.[k];
      // Only once the installed firmware really has that look in that slot.
      return args && id && lookAtSlot(firmware, i, k + 1)?.id === id ? [{ i, k, args, name: p.name }] : [];
    }));
    if (!waiting.length) return;
    // One attempt per firmware and set of colours in a session: a saber that will not confirm is not retried forever.
    const key = `${saber.id}:${firmware.hash}:${JSON.stringify(waiting)}`;
    if (attempted.current === key) return;
    attempted.current = key;

    void (async () => {
      const before = info.currentPreset;
      const written = new Set<string>();
      for (const w of waiting) {
        const byName = info.presets.findIndex((p) => p.name === w.name);
        const index = byName >= 0 ? byName : w.i;
        const style = formatBuiltin({ preset: w.i, blade: w.k + 1, args: w.args });
        const ok = await board.setPresetStyles(index, { [w.k + 1]: style }, `Colours for ${w.name.replace(/\s*\n\s*/g, ' ')}, blade ${w.k + 1}`);
        if (ok) written.add(`${w.i}:${w.k}`);
        console.log(`[looks] pending colours preset ${index + 1} blade ${w.k + 1}: ${ok ? 'written' : 'not confirmed'}`);
      }
      if (before != null) await board.choosePreset(before);
      if (!written.size) return;
      const presets = model.presets.map((p, i) => {
        if (!p.lookArgs) return p;
        const row = p.lookArgs.map((a, k) => (written.has(`${i}:${k}`) ? null : a));
        const { lookArgs: _done, ...rest } = p;
        return row.some(Boolean) ? { ...rest, lookArgs: row } : rest;
      });
      await board.updateSaber({ model: { ...model, presets } }, saber.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, busy, saber?.id, saber?.firmware?.hash, saber?.model, info?.presets.length]);
}
